#!/usr/bin/env python3
"""Fetch and normalize product data for every store supported by MyCart.

The script intentionally writes exactly one JSON object to stdout. Diagnostic
messages and Scrapling's request logs are written to stderr so the Next.js
adapter can treat stdout as a stable machine-readable interface.
"""

from __future__ import annotations

import contextlib
import html
import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.parse import quote, urlencode, urljoin, urlparse, urlunparse

from patchright.sync_api import sync_playwright
from scrapling.engines._browsers._stealth import StealthySession
from scrapling.fetchers import Fetcher, StealthyFetcher
from scrapling.parser import Selector


HTTP_TIMEOUT_SECONDS = 25
BROWSER_TIMEOUT_MS = 45_000
ZARA_BROWSER_TIMEOUT_MS = 15_000
PROTECTED_BROWSER_TIMEOUT_MS = 30_000
HTTP_IMPERSONATION_PROFILES = ("chrome", "safari", "firefox")
PUBLIC_DOH_URL = "https://cloudflare-dns.com/dns-query"
PUBLIC_DNS_HOSTS = {"blkbrdshoemaker.com", "www.blkbrdshoemaker.com"}
ZARA_READY_SELECTOR = (
    "html:has(h1.product-detail-info__header-name)"
    ":has(span.money-amount__main)"
    ":has(meta[property='og:image'])"
)
ADIDAS_MOBILE_USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 15; V2251 Build/AP3A.240905.015.A2; wv) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 "
    "Chrome/150.0.7871.183 Mobile Safari/537.36"
)

with (Path(__file__).with_name("supported_sites.json")).open(encoding="utf-8") as registry_file:
    STORE_REGISTRY = json.load(registry_file)["sites"]

HOST_TO_SITE = {
    hostname.lower().removeprefix("www."): entry["site"]
    for entry in STORE_REGISTRY
    for hostname in (entry["hostname"], *(entry.get("aliases") or []))
}
SUPPORTED_SITES = set(HOST_TO_SITE.values())


class ScrapeError(RuntimeError):
    """A controlled error that can safely be shown by the API."""


@dataclass(frozen=True)
class Product:
    product_name: str
    product_price: int | float
    product_image_url: str

    def as_dict(self) -> dict[str, str | int | float]:
        return {
            "product_name": self.product_name,
            "product_price": self.product_price,
            "product_image_url": self.product_image_url,
        }


def site_from_url(url: str) -> str:
    hostname = (urlparse(url).hostname or "").lower().removeprefix("www.")
    registered_hostname = next(
        (
            candidate
            for candidate in sorted(HOST_TO_SITE, key=len, reverse=True)
            if hostname == candidate or hostname.endswith(f".{candidate}")
        ),
        None,
    )
    return HOST_TO_SITE.get(registered_hostname, "")


def validate_url(url: str) -> str:
    candidate = url.strip()
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ScrapeError("A valid http(s) product URL is required.")
    # Preserve the caller's exact URL. Some storefront edge routes distinguish
    # an empty query marker (`?`) from the same path without one.
    return candidate


def _stderr_stdout() -> contextlib.AbstractContextManager[None]:
    # Scrapling logs through a stream handler. Redirecting Python stdout around
    # fetches guarantees that our CLI protocol remains one JSON object.
    return contextlib.redirect_stdout(sys.stderr)


def fetch_http(
    url: str,
    *,
    referer: str | None = None,
    headers: dict[str, str] | None = None,
):
    request_headers = {
        "accept-language": "en-IN,en;q=0.9",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    }
    if referer:
        request_headers["referer"] = referer
    if headers:
        request_headers.update(headers)

    hostname = (urlparse(url).hostname or "").lower()
    resolver_options = {"doh_url": PUBLIC_DOH_URL} if hostname in PUBLIC_DNS_HOSTS else {}

    last_response = None
    for profile in HTTP_IMPERSONATION_PROFILES:
        with _stderr_stdout():
            response = Fetcher.get(
                url,
                impersonate=profile,
                stealthy_headers=True,
                headers=request_headers,
                follow_redirects=True,
                retries=1,
                retry_delay=1,
                timeout=HTTP_TIMEOUT_SECONDS,
                **resolver_options,
            )
        last_response = response
        # Keep successful/default requests fast. Rotate profiles only for
        # fingerprint/rate denials and transient upstream failures.
        if response.status not in {403, 429} and response.status < 500:
            return response

    return last_response


def fetch_browser(
    url: str,
    *,
    wait_ms: int = 1_500,
    page_action: Callable[[Any], Any] | None = None,
    wait_selector: str | None = None,
    disable_resources: bool = False,
    timeout_ms: int = BROWSER_TIMEOUT_MS,
    real_chrome: bool = False,
    google_search: bool = True,
    useragent: str | None = None,
):
    with _stderr_stdout():
        return StealthyFetcher.fetch(
            url,
            headless=True,
            # Shopping pages often keep analytics connections alive forever.
            # A fixed post-load wait is faster and more deterministic here.
            network_idle=False,
            wait=wait_ms,
            wait_selector=wait_selector,
            disable_resources=disable_resources,
            load_dom=not disable_resources,
            timeout=timeout_ms,
            retries=1,
            retry_delay=1,
            extra_headers={"accept-language": "en-IN,en;q=0.9"},
            real_chrome=real_chrome,
            google_search=google_search,
            useragent=useragent,
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            page_action=page_action,
        )


class _DefaultChromeContextSession(StealthySession):
    """Attach Scrapling to Chrome's existing context instead of a new incognito one.

    H&M and Meesho reject the fresh CDP context created by the standard
    `cdp_url` path. A minimally launched Chrome default context has the same
    browser characteristics as an ordinary user tab and is accepted by both.
    Scrapling still owns navigation, response capture, and HTML parsing.
    """

    def start(self) -> None:
        self.playwright = sync_playwright().start()
        try:
            self.browser = self.playwright.chromium.connect_over_cdp(
                endpoint_url=self._config.cdp_url
            )
            if not self.browser.contexts:
                raise RuntimeError("Chrome did not expose its default browser context.")
            self.context = self.browser.contexts[0]
            self._is_alive = True
        except Exception:
            self.playwright.stop()
            self.playwright = None
            raise


def _installed_chrome_path() -> str:
    override = os.environ.get("MYCART_CHROME_PATH")
    candidates = [override] if override else []
    if sys.platform == "darwin":
        candidates.extend(
            [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                str(
                    Path.home()
                    / "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                ),
            ]
        )
    elif sys.platform == "win32":
        for root_name in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            root = os.environ.get(root_name)
            if root:
                candidates.append(str(Path(root) / "Google/Chrome/Application/chrome.exe"))
    else:
        candidates.extend(
            filter(
                None,
                (
                    shutil.which("google-chrome"),
                    shutil.which("google-chrome-stable"),
                    shutil.which("chromium"),
                    shutil.which("chromium-browser"),
                ),
            )
        )

    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise ScrapeError(
        "Google Chrome is required for this protected store. Install Chrome or set "
        "MYCART_CHROME_PATH to its executable."
    )


def _available_local_port() -> int:
    with socket.socket() as reserved:
        reserved.bind(("127.0.0.1", 0))
        return int(reserved.getsockname()[1])


def _chrome_cdp_url(endpoint: str, chrome: subprocess.Popen) -> str:
    last_error: Exception | None = None
    for _ in range(100):
        if chrome.poll() is not None:
            raise RuntimeError("Chrome closed before its browser connection was ready.")
        try:
            with urllib.request.urlopen(
                f"{endpoint}/json/version", timeout=1
            ) as response:
                payload = json.load(response)
            cdp_url = payload.get("webSocketDebuggerUrl")
            if isinstance(cdp_url, str) and cdp_url.startswith(("ws://", "wss://")):
                return cdp_url
        except Exception as error:
            last_error = error
        time.sleep(0.1)
    raise RuntimeError("Chrome browser connection did not start.") from last_error


def fetch_normal_chrome(
    url: str,
    *,
    prime_url: str | None = None,
    wait_ms: int = 5_000,
    timeout_ms: int = PROTECTED_BROWSER_TIMEOUT_MS,
):
    """Fetch a protected page through an off-screen normal Chrome context."""

    chrome_path = _installed_chrome_path()
    port = _available_local_port()
    endpoint = f"http://127.0.0.1:{port}"

    with tempfile.TemporaryDirectory(prefix="mycart-chrome-") as profile:
        chrome_args = [
            chrome_path,
            f"--remote-debugging-port={port}",
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
        ]
        if sys.platform == "win32":
            chrome_args.extend(["--start-minimized", "--window-size=800,600"])
        else:
            chrome_args.extend(
                ["--window-position=-10000,-10000", "--window-size=800,600"]
            )

        launch_args = chrome_args
        if sys.platform.startswith("linux") and not os.environ.get("DISPLAY"):
            xvfb = shutil.which("xvfb-run")
            if not xvfb:
                raise ScrapeError(
                    "A display or xvfb-run is required to scrape this protected store."
                )
            launch_args = [xvfb, "-a", *chrome_args]

        popen_options: dict[str, Any] = {
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        if sys.platform == "win32":
            popen_options["creationflags"] = subprocess.CREATE_NO_WINDOW

        chrome = subprocess.Popen(launch_args, **popen_options)
        session: _DefaultChromeContextSession | None = None
        try:
            cdp_url = _chrome_cdp_url(endpoint, chrome)
            session = _DefaultChromeContextSession(
                cdp_url=cdp_url,
                google_search=False,
                locale="en-IN",
                timezone_id="Asia/Kolkata",
                load_dom=True,
                network_idle=False,
                timeout=timeout_ms,
                retries=1,
            )
            session.start()
            if prime_url:
                # H&M's Akamai edge establishes browser state on the first
                # same-site navigation even when that bootstrap returns 403.
                # The following product request is then served normally.
                try:
                    session.fetch(
                        prime_url,
                        wait=2_000,
                        extra_headers={"accept-language": "en-IN,en;q=0.9"},
                    )
                except Exception:
                    # The product request itself is authoritative; a transient
                    # failure on the warm-up navigation must not prevent it.
                    pass
            return session.fetch(
                url,
                wait=wait_ms,
                extra_headers={"accept-language": "en-IN,en;q=0.9"},
            )
        finally:
            if session is not None:
                try:
                    session.close()
                except Exception:
                    pass
            if chrome.poll() is None:
                chrome.terminate()
                try:
                    chrome.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    chrome.kill()
                    chrome.wait(timeout=5)


def _json_from_response(response: Any) -> Any:
    try:
        return response.json()
    except Exception:
        raw = response.body.decode("utf-8", "replace").strip()
        if raw.startswith("<"):
            pre = response.css("pre::text").get()
            if pre:
                raw = str(pre).strip()
        return json.loads(raw)


def fetch_json(
    url: str,
    *,
    referer: str | None = None,
    browser_fallback: bool = True,
    headers: dict[str, str] | None = None,
) -> Any:
    errors: list[str] = []
    try:
        response = fetch_http(url, referer=referer, headers=headers)
        if 200 <= response.status < 300:
            return _json_from_response(response)
        errors.append(f"HTTP {response.status}")
    except Exception as error:
        errors.append(str(error))

    if browser_fallback:
        try:
            def capture_json(page: Any) -> None:
                result = page.evaluate(
                    """async (target) => {
                        const response = await fetch(target, {
                            credentials: 'include',
                            headers: {accept: 'application/json', 'x-requested-with': 'XMLHttpRequest'}
                        });
                        return {status: response.status, text: await response.text()};
                    }""",
                    url,
                )
                if not result or not 200 <= int(result.get("status", 0)) < 300:
                    raise RuntimeError(
                        f"browser JSON request returned {result.get('status') if result else 'no response'}"
                    )
                page.set_content(
                    "<html><body><pre id='scrapling-json'></pre></body></html>"
                )
                page.locator("#scrapling-json").evaluate(
                    "(element, value) => { element.textContent = value; }",
                    result["text"],
                )

            response = fetch_browser(referer or url, page_action=capture_json)
            if 200 <= response.status < 300:
                return _json_from_response(response)
            errors.append(f"browser HTTP {response.status}")
        except Exception as error:
            errors.append(str(error))

    raise ScrapeError("; ".join(error for error in errors if error) or "JSON request failed")


def clean_name(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", html.unescape(str(value))).strip()
    return cleaned if cleaned and cleaned.upper() != "N/A" else None


def normalize_price(value: Any) -> int | float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        number = Decimal(str(value))
    else:
        text = html.unescape(str(value)).strip()
        if not text or text.upper() == "N/A":
            return None
        match = re.search(r"-?\d[\d,]*(?:\.\d+)?", text)
        if not match:
            return None
        try:
            number = Decimal(match.group(0).replace(",", ""))
        except InvalidOperation:
            return None

    if not number.is_finite() or number <= 0:
        return None
    return int(number) if number == number.to_integral_value() else float(number)


def normalize_image(value: Any, base_url: str) -> str | None:
    if isinstance(value, list):
        for item in value:
            normalized = normalize_image(item, base_url)
            if normalized:
                return normalized
        return None
    if isinstance(value, dict):
        for key in (
            "url",
            "contentUrl",
            "src",
            "imageUrl",
            "image_url",
            "original",
            "large",
            "medium",
            "thumbnail",
            "preview_image",
            "image",
        ):
            normalized = normalize_image(value.get(key), base_url)
            if normalized:
                return normalized
        return None
    if value is None:
        return None

    image_url = html.unescape(str(value)).strip().replace("\\u002F", "/")
    if not image_url or image_url.upper() == "N/A" or image_url.startswith("data:"):
        return None
    if image_url.startswith("//"):
        image_url = "https:" + image_url
    image_url = urljoin(base_url, image_url)

    # VegNonVeg's structured data exposes a narrow 510x765 thumbnail that
    # crops wide footwear at the right edge. Its PDP uses the complete 680x800
    # rendition for the same asset. Upgrade only narrow resized canvases so
    # already-complete source URLs remain untouched.
    parsed = urlparse(image_url)
    if parsed.hostname == "images.vegnonveg.com":
        size_match = re.search(r"/resized/(\d+)[xX](\d+)/", parsed.path)
        if size_match:
            width, height = (int(value) for value in size_match.groups())
            if height and width / height < 0.8:
                upgraded_path = (
                    parsed.path[: size_match.start()]
                    + "/resized/680X800/"
                    + parsed.path[size_match.end() :]
                )
                image_url = urlunparse(parsed._replace(path=upgraded_path))

    return image_url


def make_product(name: Any, price: Any, image: Any, base_url: str) -> Product | None:
    normalized_name = clean_name(name)
    normalized_price = normalize_price(price)
    normalized_image = normalize_image(image, base_url)
    if not normalized_name or normalized_price is None or not normalized_image:
        return None
    return Product(normalized_name, normalized_price, normalized_image)


def first_css(page: Selector, selectors: Iterable[str]) -> str | None:
    for selector in selectors:
        try:
            value = page.css(selector).get()
        except Exception:
            continue
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def minimum_css_price(page: Selector, selectors: Iterable[str]) -> int | float | None:
    prices: list[int | float] = []
    for selector in selectors:
        try:
            values = page.css(selector).getall()
        except Exception:
            continue
        for value in values:
            normalized = normalize_price(value)
            if normalized is not None:
                prices.append(normalized)
    return min(prices) if prices else None


def _walk_json(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        graph = value.get("@graph")
        if graph is not None:
            yield from _walk_json(graph)
        for key, child in value.items():
            if key != "@graph" and isinstance(child, (dict, list)):
                yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


def _schema_type_is_product(value: Any) -> bool:
    if isinstance(value, list):
        return any(_schema_type_is_product(item) for item in value)
    return str(value or "").lower() in {"product", "productgroup"}


def _offer_price(offers: Any) -> Any:
    if isinstance(offers, list):
        prices = [_offer_price(offer) for offer in offers]
        normalized = [normalize_price(price) for price in prices]
        return min(price for price in normalized if price is not None) if any(
            price is not None for price in normalized
        ) else None
    if not isinstance(offers, dict):
        return None

    # Retailers commonly publish MRP as `highPrice` and the payable amount as
    # `lowPrice` or `price`. Never prefer the crossed-out MRP when a lower
    # current price is available.
    preferred = [normalize_price(offers.get(key)) for key in ("lowPrice", "price")]

    specifications = offers.get("priceSpecification")
    if isinstance(specifications, dict):
        specifications = [specifications]
    if isinstance(specifications, list):
        for specification in specifications:
            if not isinstance(specification, dict):
                continue
            # H&M and similar stores publish a lower loyalty price beside the
            # public price. Tracking must not silently assume membership.
            if specification.get("validForMemberTier"):
                continue
            if "strikethrough" in str(specification.get("priceType", "")).lower():
                continue
            preferred.extend(
                normalize_price(specification.get(key))
                for key in ("minPrice", "price")
            )
    current_prices = [price for price in preferred if price is not None]
    if current_prices:
        return min(current_prices)

    fallback = [
        normalize_price(offers.get("highPrice")),
        *(
            [
                normalize_price(specification.get("maxPrice"))
                for specification in specifications
                if isinstance(specification, dict)
            ]
            if isinstance(specifications, list)
            else []
        ),
    ]
    fallback_prices = [price for price in fallback if price is not None]
    return min(fallback_prices) if fallback_prices else None


def _json_string_field(raw: str, field: str) -> str | None:
    match = re.search(
        rf'"{re.escape(field)}"\s*:\s*(?:\[\s*)?"((?:\\.|[^"\\])*)"',
        raw,
        re.DOTALL,
    )
    if not match:
        return None
    try:
        return json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        return html.unescape(match.group(1))


def product_from_malformed_json_ld(raw: str, base_url: str) -> Product | None:
    if not re.search(r'"@type"\s*:\s*"Product"', raw, re.IGNORECASE):
        return None
    offers_match = re.search(r'"offers"\s*:\s*\{(?P<offer>.*?)\}', raw, re.DOTALL)
    price = None
    if offers_match:
        price_matches = re.findall(
            r'"(?:price|lowPrice)"\s*:\s*"?([\d,.]+)',
            offers_match.group("offer"),
        )
        if not price_matches:
            price_matches = re.findall(
                r'"highPrice"\s*:\s*"?([\d,.]+)',
                offers_match.group("offer"),
            )
        normalized_prices = [normalize_price(value) for value in price_matches]
        valid_prices = [value for value in normalized_prices if value is not None]
        price = min(valid_prices) if valid_prices else None
    image = _json_string_field(raw, "image")
    if not image:
        unquoted_image = re.search(
            r'"image"\s*:\s*(https?://[^\s,}\]]+)',
            raw,
            re.IGNORECASE,
        )
        image = unquoted_image.group(1).rstrip('"') if unquoted_image else None
    return make_product(
        _json_string_field(raw, "name"),
        price,
        image,
        base_url,
    )


def product_from_json_ld(page: Selector, base_url: str) -> Product | None:
    for script in page.css('script[type="application/ld+json"]'):
        raw = str(script.text or "").strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            product = product_from_malformed_json_ld(raw, base_url)
            if product:
                return product
            continue
        for item in _walk_json(payload):
            if not _schema_type_is_product(item.get("@type")):
                continue
            product = make_product(
                item.get("name"),
                _offer_price(item.get("offers")) or item.get("price"),
                item.get("image") or item.get("thumbnailUrl"),
                base_url,
            )
            if product:
                return product
    return None


def _first_product_price(item: dict[str, Any]) -> Any:
    for key in (
        "discountedPrice",
        "discounted_price",
        "salePrice",
        "sale_price",
        "sellingPrice",
        "selling_price",
        "offerPrice",
        "offer_price",
        "finalPrice",
        "final_price",
        "currentPrice",
        "current_price",
        "specialPrice",
        "special_price",
        "price",
        "amount",
        "value",
        "mrp",
    ):
        value = item.get(key)
        if isinstance(value, dict):
            nested = _first_product_price(value)
            if nested is not None:
                return nested
        elif isinstance(value, list):
            for child in value:
                if isinstance(child, dict):
                    nested = _first_product_price(child)
                    if nested is not None:
                        return nested
                elif normalize_price(child) is not None:
                    return child
        elif normalize_price(value) is not None:
            return value
    return _offer_price(item.get("offers"))


def _first_product_image(item: dict[str, Any]) -> Any:
    for key in (
        "productImage",
        "product_image",
        "imageUrl",
        "image_url",
        "featured_image",
        "primaryImage",
        "primary_image",
        "thumbnailUrl",
        "thumbnail",
        "image",
        "images",
        "media",
    ):
        if item.get(key):
            return item[key]
    return None


def product_from_embedded_json(page: Selector, base_url: str) -> Product | None:
    selectors = (
        'script[type="application/json"]',
        "script#__NEXT_DATA__",
        "script#__NUXT_DATA__",
    )
    seen_scripts: set[int] = set()
    for selector in selectors:
        for script in page.css(selector):
            identity = id(script)
            if identity in seen_scripts:
                continue
            seen_scripts.add(identity)
            raw = str(script.text or "").strip()
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                continue
            for item in _walk_json(payload):
                name = item.get("productName") or item.get("product_name") or item.get("name")
                if not name:
                    continue
                product = make_product(
                    name,
                    _first_product_price(item),
                    _first_product_image(item),
                    base_url,
                )
                if product:
                    return product
    return None


SITE_SELECTORS: dict[str, dict[str, tuple[str, ...]]] = {
    "amazon": {
        "name": ("#productTitle::text", "h1#title::text"),
        "price": (
            "#corePrice_feature_div .a-price .a-offscreen::text",
            "#priceblock_ourprice::text",
            "span.a-price-whole::text",
        ),
        "image": ("#landingImage::attr(src)", "#imgTagWrapperId img::attr(src)"),
    },
    "converse": {
        "name": ("h1[class*='productFullDetail-productName']::text", "h1::text"),
        "price": ("span[class*='productFullDetail-productPrice']::text", "[itemprop='price']::attr(content)"),
        "image": ("img[class*='carousel-image']::attr(src)", "meta[property='og:image']::attr(content)"),
    },
    "floweraura": {
        "name": ("main h1::text", "h1::text"),
        "price": (
            "meta[property='product:price:amount']::attr(content)",
            "[itemprop='price']::attr(content)",
        ),
        # FlowerAura's Open Graph image is its logo. The eager, high-priority
        # image is the actual PDP hero and is present in the static response.
        "image": (
            "main img[fetchpriority='high']::attr(src)",
            "img[fetchpriority='high']::attr(src)",
        ),
    },
    "google": {
        "name": (
            "div[itemtype='https://schema.org/Product'] meta[itemprop='name']::attr(content)",
            "h1[data-test='title']::text",
        ),
        "price": (
            "div[itemtype='https://schema.org/Product'] meta[itemprop='lowPrice']::attr(content)",
            "[data-test='price']::text",
        ),
        "image": (
            "div[data-product-family-docid] source[data-component-name='media_area_source']::attr(srcset)",
            "source[data-component-name='media_area_source']::attr(srcset)",
        ),
    },
    "hmtwatches": {
        "name": ("h3.product-title::text",),
        "price": ("h4.discountPrice::text",),
        "image": ("#glasscase img::attr(src)",),
    },
    "kamaayurveda": {
        "name": ("main h1::text", "h1::text"),
        "price": ("div[class*='NewInfoSection_pdp_price__']::text",),
        "image": ("meta[property='og:image']::attr(content)",),
    },
    "kindlife": {
        "name": (
            "h1.ty-product-block__title::text",
            "meta[name='og:title']::attr(content)",
        ),
        "price": ("span[id^='sec_discounted_price_'].bk-price-num::text",),
        # Kindlife publishes Open Graph data with `name`, rather than the
        # standard `property`, attribute.
        "image": ("meta[name='og:image']::attr(content)",),
    },
    "kapoorwatch": {
        "name": (".proCode::text", "h1::text"),
        "price": (".proPrice::text",),
        "image": (".imgWrapper img::attr(src)",),
    },
    "myntra": {
        "name": ("h1.pdp-name::text", "meta[property='og:title']::attr(content)"),
        "price": ("span.pdp-price strong::text", "[itemprop='price']::attr(content)"),
        "image": ("meta[property='og:image']::attr(content)", ".image-grid-image::attr(style)"),
    },
    "nykaafashion": {
        "name": (".css-ef32ai::text", "h1::text", "meta[property='og:title']::attr(content)"),
        "price": ("meta[property='product:price:amount']::attr(content)", "[itemprop='price']::attr(content)", ".css-a5kl1t::text"),
        "image": (".css-kwk7lt::attr(src)", "meta[property='og:image']::attr(content)"),
    },
    "ogaan": {
        "name": ("meta[property='og:title']::attr(content)",),
        "price": ("#final-price::attr(value)", "#actual-price::attr(value)"),
        "image": ("meta[property='og:image']::attr(content)",),
    },
    "vegnonveg": {
        "name": ("h1.p-name::text",),
        "price": ("[data-snapmint-price]::attr(data-snapmint-price)",),
        "image": ("meta[property='og:image']::attr(content)",),
    },
    "vaaree": {
        "name": ("meta[property='og:title']::attr(content)",),
        "price": (".pdp-price-value::text", ".pdp-mobile-price-value::text"),
        "image": ("meta[property='og:image']::attr(content)",),
    },
    "zara": {
        "name": ("h1.product-detail-info__header-name::text", "meta[property='og:title']::attr(content)"),
        "price": ("span.money-amount__main::text", "meta[property='product:price:amount']::attr(content)"),
        "image": ("img.media-image__image::attr(src)", "meta[property='og:image']::attr(content)"),
    },
}


def product_from_dom(page: Selector, site: str, base_url: str) -> Product | None:
    selectors = SITE_SELECTORS.get(site, {})
    name = first_css(page, selectors.get("name", ()))
    price = minimum_css_price(page, selectors.get("price", ()))
    image = first_css(page, selectors.get("image", ()))

    if image and "url(" in image:
        match = re.search(r"url\([\"']?(.*?)[\"']?\)", image)
        image = match.group(1) if match else image
    elif image and re.match(r"https?://", image) and ("," in image or " 2x" in image):
        # Responsive image sources contain a comma-separated srcset. The first
        # URL is sufficient for price-history thumbnails.
        image = image.split(",", 1)[0].strip().split(" ", 1)[0]

    name = name or first_css(
        page,
        (
            "meta[property='og:title']::attr(content)",
            "meta[name='twitter:title']::attr(content)",
            "h1::text",
        ),
    )
    price = price or minimum_css_price(
        page,
        (
            "meta[property='product:price:amount']::attr(content)",
            "meta[name='product:price:amount']::attr(content)",
            "meta[property='og:price:amount']::attr(content)",
            "[itemprop='price']::attr(content)",
            "[itemprop='price']::text",
        ),
    )
    image = image or first_css(
        page,
        (
            "meta[property='og:image']::attr(content)",
            "meta[name='twitter:image']::attr(content)",
            "[itemprop='image']::attr(src)",
        ),
    )
    return make_product(name, price, image, base_url)


def product_from_thecollective_state(page: Selector, base_url: str) -> Product | None:
    """Read product data embedded in the App Router flight stream.

    The Collective serializes its PDP payload inside `self.__next_f` scripts,
    rather than JSON-LD or __NEXT_DATA__. The media entries contain a stable
    CDN asset name instead of a full image URL.
    """
    for script in page.css("script"):
        raw = str(script.text or "")
        if '\\"productDetails\\"' not in raw:
            continue
        details = raw[raw.find('\\"productDetails\\"') :]
        name_match = re.search(r'\\"Name\\":\\"((?:\\\\.|[^"\\])*)\\"', details)
        price_match = re.search(
            r'\\"SellingPrice\\":\\"?([\d,.]+)',
            details,
        )
        media_match = re.search(
            r'\\"Media\\":\{.*?\\"Images\\":\[\{.*?'
            r'\\"Extension\\":\\"([^"\\]+)\\".*?'
            r'\\"Name\\":\\"([^"\\]+)\\"',
            details,
            re.DOTALL,
        )
        if not name_match or not price_match or not media_match:
            continue
        try:
            name = json.loads(f'"{name_match.group(1)}"')
        except json.JSONDecodeError:
            name = name_match.group(1)
        extension, image_name = media_match.groups()
        image = (
            "https://imagescdn.thecollective.in/img/app/product/1/"
            f"{image_name}.{extension}"
        )
        product = make_product(name, price_match.group(1), image, base_url)
        if product:
            return product
    return None


def _decode_devalue_flat(raw: str) -> Any:
    """Decode the flat reference array emitted by Remix/devalue."""
    values = json.loads(raw)
    if not isinstance(values, list):
        return None
    cache: dict[int, Any] = {}

    def resolve(index: int) -> Any:
        if index < 0 or index >= len(values):
            return None
        if index in cache:
            return cache[index]
        value = values[index]
        if isinstance(value, dict):
            decoded: dict[str, Any] = {}
            cache[index] = decoded
            for encoded_key, child_index in value.items():
                key = encoded_key
                if encoded_key.startswith("_") and encoded_key[1:].isdigit():
                    key = resolve(int(encoded_key[1:]))
                decoded[str(key)] = (
                    resolve(child_index)
                    if isinstance(child_index, int) and not isinstance(child_index, bool)
                    else child_index
                )
            return decoded
        if isinstance(value, list):
            decoded_list: list[Any] = []
            cache[index] = decoded_list
            decoded_list.extend(
                resolve(child_index)
                if isinstance(child_index, int) and not isinstance(child_index, bool)
                else child_index
                for child_index in value
            )
            return decoded_list
        cache[index] = value
        return value

    return resolve(0)


def product_from_nothing_state(page: Selector, base_url: str) -> Product | None:
    slug = urlparse(base_url).path.rstrip("/").rsplit("/", 1)[-1]
    enqueue_pattern = re.compile(
        r'streamController\.enqueue\(("(?:\\.|[^"\\])*")\)',
        re.DOTALL,
    )
    for script in page.css("script"):
        raw = str(script.text or "")
        for match in enqueue_pattern.finditer(raw):
            recursion_limit = sys.getrecursionlimit()
            try:
                if recursion_limit < 20_000:
                    sys.setrecursionlimit(20_000)
                flat_payload = json.loads(match.group(1))
                payload = _decode_devalue_flat(flat_payload)
            except (TypeError, json.JSONDecodeError, RecursionError):
                continue
            finally:
                if sys.getrecursionlimit() != recursion_limit:
                    sys.setrecursionlimit(recursion_limit)
            pending = [payload]
            seen: set[int] = set()
            while pending:
                value = pending.pop()
                if isinstance(value, (dict, list)):
                    identity = id(value)
                    if identity in seen:
                        continue
                    seen.add(identity)
                if isinstance(value, dict):
                    item = value
                    pending.extend(item.values())
                elif isinstance(value, list):
                    pending.extend(value)
                    continue
                else:
                    continue
                if item.get("handle") != slug:
                    continue
                variant = item.get("selectedOrFirstAvailableVariant") or {}
                price = variant.get("price") if isinstance(variant, dict) else None
                image = variant.get("image") if isinstance(variant, dict) else None
                product = make_product(
                    item.get("title"),
                    price,
                    image or item.get("featuredImage"),
                    base_url,
                )
                if product:
                    return product
    return None


def product_from_page(page: Selector, site: str, base_url: str) -> Product | None:
    if site == "vaaree":
        product = product_from_dom(page, site, base_url)
        if product:
            return product
    if site == "myntra":
        product = product_from_myntra_state(page, base_url)
        if product:
            return product
    if site in {"luxury", "tatacliq"}:
        product = product_from_tatacliq_state(page, base_url)
        if product:
            return product
    if site == "shoppersstop":
        product = product_from_shoppersstop_state(page, base_url)
        if product:
            return product
    if site == "thecollective":
        product = product_from_thecollective_state(page, base_url)
        if product:
            return product
    if site == "nothing":
        product = product_from_nothing_state(page, base_url)
        if product:
            return product

    return (
        product_from_json_ld(page, base_url)
        or product_from_embedded_json(page, base_url)
        or product_from_dom(page, site, base_url)
    )


def _script_json_after_prefix(page: Selector, prefix: str) -> Any | None:
    for script in page.css("script"):
        raw = str(script.text or "").strip()
        position = raw.find(prefix)
        if position < 0:
            continue
        candidate = raw[position + len(prefix) :].lstrip(" =")
        decoder = json.JSONDecoder()
        try:
            value, _ = decoder.raw_decode(candidate)
            return value
        except json.JSONDecodeError:
            continue
    return None


def product_from_myntra_state(page: Selector, base_url: str) -> Product | None:
    state = _script_json_after_prefix(page, "window.__myx")
    if not isinstance(state, dict):
        return None
    pdp = state.get("pdpData") or {}
    price = (
        (pdp.get("selectedSeller") or {}).get("discountedPrice")
        or (pdp.get("price") or {}).get("discounted")
        or pdp.get("discountedPrice")
        or pdp.get("mrp")
    )
    image = None
    media = pdp.get("media") or {}
    try:
        image = media["albums"][0]["images"][0]["imageURL"]
    except (KeyError, IndexError, TypeError):
        pass
    image = image or first_css(page, ("meta[property='og:image']::attr(content)",))
    return make_product(pdp.get("name"), price, image, base_url)


def product_from_tatacliq_payload(payload: Any, base_url: str) -> Product | None:
    if not isinstance(payload, dict):
        return None
    product = payload.get("productDescriptionData") or payload
    gallery = product.get("galleryImagesList") or []
    image = None
    try:
        image = gallery[0]["galleryImages"][0]["value"]
    except (KeyError, IndexError, TypeError):
        pass
    price = (product.get("winningSellerPrice") or {}).get("value")
    return make_product(product.get("productName"), price, image, base_url)


def product_from_tatacliq_state(page: Selector, base_url: str) -> Product | None:
    state = _script_json_after_prefix(page, "window.initialData")
    return product_from_tatacliq_payload(state, base_url)


def product_from_shoppersstop_state(page: Selector, base_url: str) -> Product | None:
    for script in page.css('script[type="application/json"]'):
        try:
            payload = json.loads(str(script.text or ""))
        except (TypeError, json.JSONDecodeError):
            continue
        for item in _walk_json(payload):
            variants = item.get("variants")
            if not item.get("name") or not item.get("additional_images") or not variants:
                continue
            try:
                image = item["additional_images"][0]["url"]
                price = variants[0]["product"]["price_range"]["minimum_price"]["final_price"]["value"]
            except (KeyError, IndexError, TypeError):
                continue
            product = make_product(item["name"], price, image, base_url)
            if product:
                return product
    return None


def product_from_acer_payload(payload: Any, base_url: str) -> Product | None:
    try:
        item = payload["data"]["route"]
        minimum_price = item["price_range"]["minimum_price"]
        return make_product(
            item.get("name"),
            (minimum_price.get("final_price") or {}).get("value")
            or (minimum_price.get("regular_price") or {}).get("value"),
            (item.get("small_image") or {}).get("url")
            or (item.get("image") or {}).get("url"),
            base_url,
        )
    except (KeyError, TypeError):
        return None


def product_from_acer(url: str) -> Product | None:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2 or parts[0].lower() != "en-in":
        # Other regional Acer stores have different catalog scopes. Keep their
        # existing static-page extraction path unchanged.
        return None
    route_path = "/".join(parts[1:]).removesuffix(".html")
    if not route_path:
        return None
    query = (
        "query { route(url: "
        + json.dumps(route_path)
        + ") { ... on ProductInterface { name sku small_image { url } "
        "price_range { minimum_price { final_price { value currency } "
        "regular_price { value currency } } } } } }"
    )
    endpoint = f"{parsed.scheme}://{parsed.netloc}/en-in/graphql?" + urlencode(
        {"query": query}
    )
    payload = fetch_json(
        endpoint,
        referer=url,
        browser_fallback=False,
        headers={"Store": "default", "accept": "application/json"},
    )
    return product_from_acer_payload(payload, url)


def product_from_mothercare_listing_page(
    page: Selector,
    product_url: str,
) -> Product | None:
    target_path = urlparse(product_url).path.rstrip("/")
    target_id_match = re.search(r"-(\d+)$", target_path)
    target_id = target_id_match.group(1) if target_id_match else None
    for card in page.css('a[href*="/product/"]'):
        href = str(card.attrib.get("href") or "")
        card_path = urlparse(urljoin(product_url, href)).path.rstrip("/")
        card_id_match = re.search(r"-(\d+)$", card_path)
        card_id = card_id_match.group(1) if card_id_match else None
        same_product = card_id == target_id if target_id else card_path == target_path
        if not same_product:
            continue
        price_values = [
            normalize_price(value)
            for value in card.css("span::text").getall()
            if "₹" in str(value) or re.search(r"\b(?:INR|Rs\.?)\b", str(value), re.I)
        ]
        current_prices = [value for value in price_values if value is not None]
        price = min(current_prices) if current_prices else None
        return make_product(
            first_css(card, ("h2::text", "h1::text")),
            price,
            first_css(card, ("img::attr(src)",)),
            product_url,
        )
    return None


def product_from_mothercare_listing(url: str) -> Product | None:
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    if not slug:
        return None
    product_id = re.search(r"-(\d+)$", slug)
    search_term = product_id.group(1) if product_id else slug
    listing_url = "https://mothercare.in/products?" + urlencode({"q": search_term})
    page = fetch_http(listing_url, referer=url)
    if not 200 <= page.status < 300:
        raise ScrapeError(f"Mothercare product listing returned HTTP {page.status}.")
    return product_from_mothercare_listing_page(page, url)


def product_from_ajio(url: str, site: str) -> Product | None:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    try:
        product_marker = len(parts) - 1 - parts[::-1].index("p")
        product_path = "/".join(parts[product_marker : product_marker + 2])
    except ValueError:
        return None
    origin = "https://luxe.ajio.com" if site == "luxe" else "https://www.ajio.com"
    payload = fetch_json(f"{origin}/api/{product_path}", referer=url)
    try:
        item = payload["baseOptions"][0]["options"][0]
        price_data = item["priceData"]
        return make_product(
            (item.get("modelImage") or {}).get("altText"),
            price_data.get("discountedValue") or price_data.get("value"),
            (item.get("modelImage") or {}).get("url"),
            url,
        )
    except (KeyError, IndexError, TypeError):
        return None


def product_from_shopify(url: str) -> Product | None:
    parsed = urlparse(url)
    json_url = urlunparse(parsed._replace(path=parsed.path.rstrip("/") + ".js", query="", fragment=""))
    payload = fetch_json(json_url, referer=url, browser_fallback=False)
    if not isinstance(payload, dict):
        return None
    variants = payload.get("variants") if isinstance(payload.get("variants"), list) else []
    requested_variant = dict(
        pair for pair in (part.split("=", 1) for part in parsed.query.split("&") if "=" in part)
    ).get("variant")
    selected_variant = next(
        (variant for variant in variants if str(variant.get("id")) == requested_variant),
        None,
    )
    candidate_variants = [selected_variant] if selected_variant else [
        variant for variant in variants if variant.get("available", True)
    ] or variants
    variant_prices = [
        normalize_price(variant.get("price"))
        for variant in candidate_variants
        if isinstance(variant, dict)
    ]
    price = min((value for value in variant_prices if value is not None), default=None)
    if price is None:
        price = payload.get("price")
    if price is not None:
        price = Decimal(str(price)) / 100
    return make_product(
        payload.get("title"),
        price,
        (selected_variant or {}).get("featured_image")
        or payload.get("featured_image")
        or payload.get("images")
        or payload.get("media"),
        url,
    )


def product_from_foxy(url: str) -> Product | None:
    parts = [part for part in urlparse(url).path.split("/") if part]
    try:
        slug = parts[parts.index("products") + 1]
    except (ValueError, IndexError):
        return None
    payload = fetch_json(
        f"https://www.foxy.in/api/v1/products/{slug}",
        referer=url,
        browser_fallback=False,
    )
    if not isinstance(payload, dict):
        return None
    return make_product(
        payload.get("name"),
        payload.get("final_sp") or payload.get("sp") or payload.get("mrp"),
        payload.get("image_url") or payload.get("images"),
        url,
    )


def product_from_meesho_payload(payload: Any, base_url: str) -> Product | None:
    try:
        product = payload["pageProps"]["initialState"]["product"]["details"]["data"]
    except (KeyError, TypeError):
        return None
    return make_product(
        product.get("name"),
        product.get("price") or product.get("original_price"),
        product.get("images"),
        base_url,
    )


def product_from_meesho(url: str) -> Product | None:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    try:
        marker = parts.index("p")
        category, product_id = parts[marker - 1], parts[marker + 1]
    except (ValueError, IndexError):
        return None

    build_response = fetch_http("https://www.meesho.com/_next/BUILD_ID", referer=url)
    if not 200 <= build_response.status < 300:
        return None
    build_id = build_response.body.decode("utf-8", "replace").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", build_id):
        return None
    endpoint = (
        f"https://www.meesho.com/_next/data/{build_id}/{category}/p/{product_id}.json?"
        + urlencode({"category": category, "p_id": product_id})
    )
    return product_from_meesho_payload(
        fetch_json(endpoint, referer=url, browser_fallback=False),
        url,
    )


def product_from_adidas(url: str) -> Product | None:
    sku = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1].removesuffix(".html")
    if not sku:
        return None
    payload = fetch_json(f"https://www.adidas.co.in/api/products/{sku}", referer=url)
    if not isinstance(payload, dict):
        return None
    views = payload.get("view_list") or []
    image = views[0].get("image_url") if views else None
    return make_product(
        payload.get("name"),
        (payload.get("pricing_information") or {}).get("currentPrice"),
        image,
        url,
    )


def product_from_adidas_state(page: Selector, url: str) -> Product | None:
    sku = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1].removesuffix(".html")
    for script in page.css("script#__NEXT_DATA__"):
        try:
            payload = json.loads(str(script.text or ""))
        except (TypeError, json.JSONDecodeError):
            continue
        for item in _walk_json(payload):
            if str(item.get("id") or "").upper() != sku.upper():
                continue
            views = item.get("view_list") or []
            image = views[0].get("image_url") if views else None
            product = make_product(
                item.get("name"),
                (item.get("pricing_information") or {}).get("currentPrice"),
                image,
                url,
            )
            if product:
                return product
    return None


def product_from_adidas_page(url: str) -> Product | None:
    options = {
        "wait_ms": 3_000,
        "disable_resources": True,
        "timeout_ms": 20_000,
        "google_search": False,
        "useragent": ADIDAS_MOBILE_USER_AGENT,
    }
    try:
        page = fetch_browser(url, real_chrome=True, **options)
    except Exception:
        page = fetch_browser(url, real_chrome=False, **options)
    if not 200 <= page.status < 300:
        raise ScrapeError(f"Adidas product page returned HTTP {page.status}.")
    return product_from_adidas_state(page, url) or product_from_page(page, "adidas", url)


def product_from_normal_browser_page(url: str, site: str) -> Product | None:
    page = fetch_normal_chrome(
        url,
        prime_url="https://www2.hm.com/en_in/index.html" if site == "hm" else None,
    )
    if not 200 <= page.status < 300:
        raise ScrapeError(f"{site} product page returned HTTP {page.status}.")
    return product_from_page(page, site, url)


def product_from_tatacliq_api(url: str) -> Product | None:
    product_id = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    product_id = re.sub(r"^p-", "", product_id, flags=re.IGNORECASE)
    if not product_id:
        return None
    endpoint = (
        "https://www.tatacliq.com/marketplacewebservices/v2/mpl/products/"
        f"productDetails/{product_id}?isPwa=true&isMDE=true&isDynamicVar=true"
    )
    return product_from_tatacliq_payload(fetch_json(endpoint, referer=url), url)


def product_from_zara_page(url: str) -> Product | None:
    # Zara's former `ajax=true` product response is now a small HTML shell, not
    # JSON. Render the real product page once, block heavyweight assets, and
    # close the headless page as soon as the three fields we need are present.
    page = fetch_browser(
        url,
        wait_ms=0,
        wait_selector=ZARA_READY_SELECTOR,
        disable_resources=True,
        timeout_ms=ZARA_BROWSER_TIMEOUT_MS,
    )
    if not 200 <= page.status < 300:
        raise ScrapeError(f"Zara product page returned HTTP {page.status}.")
    return product_from_page(page, "zara", url)


def product_from_uniqlo_page(url: str) -> Product | None:
    # UNIQLO keeps long-lived third-party resources open. Blocking those assets
    # and allowing its first-party scripts a short post-load window produces
    # complete Product JSON-LD without waiting for the full page lifecycle.
    options = {
        "wait_ms": 3_000,
        "disable_resources": True,
        "timeout_ms": 15_000,
        "google_search": False,
    }
    try:
        page = fetch_browser(url, real_chrome=True, **options)
    except Exception:
        # Keep Linux/self-hosted installations portable when Google Chrome is
        # unavailable; Scrapling's bundled Chromium follows the same fast path.
        page = fetch_browser(url, real_chrome=False, **options)
    if not 200 <= page.status < 300:
        raise ScrapeError(f"UNIQLO product page returned HTTP {page.status}.")
    return product_from_page(page, "uniqlo", url)


def product_from_converse_api(url: str) -> Product | None:
    url_key = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1].removesuffix(".html")
    if not url_key:
        return None
    query = """query Product($urlKey:String!){products(filter:{url_key:{eq:$urlKey}}){items{name small_image{url} price_range{minimum_price{final_price{value}}}}}}"""
    endpoint = "https://www.converse.in/graphql?" + urlencode(
        {"query": query, "variables": json.dumps({"urlKey": url_key})}
    )
    payload = fetch_json(endpoint, referer=url)
    try:
        item = payload["data"]["products"]["items"][0]
        return make_product(
            item["name"],
            item["price_range"]["minimum_price"]["final_price"]["value"],
            item["small_image"]["url"],
            url,
        )
    except (KeyError, IndexError, TypeError):
        return None


def product_from_crocs(url: str) -> Product | None:
    parsed = urlparse(url)
    url_key = parsed.path.rstrip("/").rsplit("/", 1)[-1].removesuffix(".html")
    if not url_key:
        return None
    query = """query Product($urlKey:String!){products(filter:{url_key:{eq:$urlKey}}){items{name image{url} price_range{minimum_price{final_price{value}}}}}}"""
    endpoint = f"{parsed.scheme}://{parsed.netloc}/graphql?" + urlencode(
        {"query": query, "variables": json.dumps({"urlKey": url_key})}
    )
    return product_from_wildcraft_payload(fetch_json(endpoint, referer=url), url)


def product_from_wildcraft_payload(payload: Any, base_url: str) -> Product | None:
    try:
        item = payload["data"]["products"]["items"][0]
        return make_product(
            item["name"],
            item["price_range"]["minimum_price"]["final_price"]["value"],
            item["image"]["url"],
            base_url,
        )
    except (KeyError, IndexError, TypeError):
        return None


def product_from_wildcraft(url: str) -> Product | None:
    url_key = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1].removesuffix(".html")
    if not url_key:
        return None
    query = """query Product($urlKey:String!){products(filter:{url_key:{eq:$urlKey}}){items{name image{url} price_range{minimum_price{final_price{value}}}}}}"""
    endpoint = "https://wildcraft.com/graphql?" + urlencode(
        {"query": query, "variables": json.dumps({"urlKey": url_key})}
    )
    return product_from_wildcraft_payload(fetch_json(endpoint, referer=url), url)


def product_from_maxima_payload(payload: Any, base_url: str) -> Product | None:
    try:
        item = payload["data"]
        primary = next(
            (media for media in item.get("media", []) if media.get("isPrimary")),
            (item.get("media") or [{}])[0],
        )
        return make_product(
            item["name"],
            item.get("offerPrice") or item.get("mrp"),
            primary.get("mediaUrl"),
            base_url,
        )
    except (KeyError, IndexError, TypeError):
        return None


def product_from_maxima(url: str) -> Product | None:
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    if not slug:
        return None
    endpoint = f"https://core.maximawatches.com/api/public/products/{quote(slug)}"
    return product_from_maxima_payload(fetch_json(endpoint, referer=url), url)


def product_from_thesouledstore_payload(
    product_payload: Any,
    pricing_payload: Any,
    base_url: str,
) -> Product | None:
    if not isinstance(product_payload, dict) or not isinstance(pricing_payload, dict):
        return None
    images = product_payload.get("images") or []
    image = images[0] if isinstance(images, list) and images else None
    if image:
        image = (
            "https://prod-img.thesouledstore.com/"
            "public/theSoul/uploads/catalog/product/"
            f"{image}"
        )
    return make_product(
        product_payload.get("product") or product_payload.get("meta_title"),
        pricing_payload.get("spl_price")
        or pricing_payload.get("price")
        or pricing_payload.get("mrp"),
        image,
        base_url,
    )


def product_from_thesouledstore(url: str) -> Product | None:
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    if not slug:
        return None
    base = "https://api.thesouledstore.com/api/v2"
    product_payload = fetch_json(
        f"{base}/static/product/{quote(slug)}?gender_type=1",
        referer=url,
        browser_fallback=False,
    )
    pricing_payload = fetch_json(
        f"{base}/product/{quote(slug)}/pricing",
        referer=url,
        browser_fallback=False,
    )
    return product_from_thesouledstore_payload(product_payload, pricing_payload, url)


def product_from_realme_payload(payload: Any, base_url: str) -> Product | None:
    data = payload.get("data") if isinstance(payload, dict) else None
    variants = list(data.values()) if isinstance(data, dict) else []
    candidates = [item for item in variants if isinstance(item, dict)]
    candidates.sort(
        key=lambda item: normalize_price(item.get("price")) or float("inf")
    )
    for item in candidates:
        images = str(item.get("originOverviewUri") or "").split(";")
        product = make_product(
            item.get("productName") or item.get("skuName"),
            item.get("price") or item.get("mrpPrice"),
            images[0] if images else None,
            base_url,
        )
        if product:
            return product
    return None


def product_from_realme(url: str) -> Product | None:
    product_id = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    if not product_id.isdigit():
        return None
    endpoint = "https://api.realme.com/in/product/detail?" + urlencode(
        {"productId": product_id}
    )
    return product_from_realme_payload(
        fetch_json(endpoint, referer=url, browser_fallback=False),
        url,
    )


API_STRATEGIES: dict[str, Callable[[str], Product | None]] = {
    "acer": product_from_acer,
    "blkbrdshoemaker": product_from_shopify,
    "converse": product_from_converse_api,
    "crocs": product_from_crocs,
    "foxy": product_from_foxy,
    "maximawatches": product_from_maxima,
    "mothercare": product_from_mothercare_listing,
    "realme": product_from_realme,
    "tatacliq": product_from_tatacliq_api,
    "thesouledstore": product_from_thesouledstore,
    "wildcraft": product_from_wildcraft,
}


def scrape_product(url: str) -> Product:
    url = validate_url(url)
    site = site_from_url(url)
    if site not in SUPPORTED_SITES:
        raise ScrapeError(f"Unsupported store: {urlparse(url).hostname}")

    errors: list[str] = []
    if site in {"hm", "meesho"}:
        try:
            product = product_from_normal_browser_page(url, site)
            if product:
                return product
            errors.append("normal Chrome page did not contain complete product data")
        except Exception as error:
            errors.append(f"normal Chrome page: {error}")

        detail = "; ".join(errors)
        raise ScrapeError(f"Could not extract complete product data from {site}. {detail}")

    if site == "adidas":
        try:
            product = product_from_adidas(url)
            if product:
                return product
            errors.append("official product endpoint did not contain complete data")
        except Exception as error:
            errors.append(f"official product endpoint: {error}")

        try:
            product = product_from_adidas_page(url)
            if product:
                return product
            errors.append("mobile product page did not contain complete data")
        except Exception as error:
            errors.append(f"mobile product page: {error}")

        try:
            product = product_from_normal_browser_page(url, site)
            if product:
                return product
            errors.append("normal Chrome page did not contain complete data")
        except Exception as error:
            errors.append(f"normal Chrome page: {error}")

        detail = "; ".join(errors)
        raise ScrapeError(f"Could not extract complete product data from adidas. {detail}")

    if site == "zara":
        try:
            product = product_from_zara_page(url)
            if product:
                return product
            errors.append("rendered product page did not contain complete data")
        except Exception as error:
            errors.append(f"focused product page: {error}")

        detail = "; ".join(errors)
        raise ScrapeError(f"Could not extract complete product data from zara. {detail}")

    if site == "uniqlo":
        try:
            product = product_from_uniqlo_page(url)
            if product:
                return product
            errors.append("focused product page did not contain complete data")
        except Exception as error:
            errors.append(f"focused product page: {error}")

        detail = "; ".join(errors)
        raise ScrapeError(f"Could not extract complete product data from uniqlo. {detail}")

    try:
        if site in {"ajio", "luxe"}:
            product = product_from_ajio(url, site)
        else:
            strategy = API_STRATEGIES.get(site)
            if strategy:
                product = strategy(url)
            elif site != "nothing" and "/products/" in urlparse(url).path.lower():
                product = product_from_shopify(url)
            else:
                product = None
        if product:
            return product
    except Exception as error:
        errors.append(f"store endpoint: {error}")

    try:
        page = fetch_http(url)
        if 200 <= page.status < 300:
            product = product_from_page(page, site, url)
            if product:
                return product
        else:
            errors.append(f"page HTTP {page.status}")
    except Exception as error:
        errors.append(f"page request: {error}")

    try:
        page = fetch_browser(url, wait_ms=2_000)
        if 200 <= page.status < 300:
            product = product_from_page(page, site, url)
            if product:
                return product
        else:
            errors.append(f"browser HTTP {page.status}")
    except Exception as error:
        errors.append(f"browser request: {error}")

    detail = "; ".join(errors[-3:])
    message = f"Could not extract complete product data from {site}."
    if detail:
        message += f" {detail}"
    raise ScrapeError(message)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(json.dumps({"error": "Usage: scrape_product.py <product-url>"}))
        return 2
    try:
        product = scrape_product(argv[1])
    except ScrapeError as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
    except Exception as error:  # Keep unexpected library/site errors controlled.
        print(json.dumps({"error": f"Unexpected scraper failure: {error}"}, ensure_ascii=False))
        return 1

    print(json.dumps(product.as_dict(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
