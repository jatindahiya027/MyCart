#!/usr/bin/env python3
"""Discover likely product pages for every registered MyCart storefront.

This is a developer aid for maintaining the network-dependent live fixture.
It inspects each official homepage, robots.txt, and a small bounded set of
sitemaps. It never treats a discovered URL as passing; the live runner still
has to execute the real unified scraper against every selected page.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

from scrapling.fetchers import Fetcher


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTRY = ROOT / "scrapers" / "supported_sites.json"
DEFAULT_FIXTURE = ROOT / "tests" / "live_product_urls.json"
FETCH_TIMEOUT_SECONDS = 12
MAX_SITEMAPS_PER_STORE = 4
MAX_CANDIDATES_PER_STORE = 8

NEGATIVE_MARKERS = (
    "/blog",
    "/blogs/",
    "/category/",
    "/categories/",
    "/collection/",
    "/collections/",
    "/discover/",
    "/help",
    "/legal",
    "/login",
    "/pages/",
    "/search",
    "/service/",
    "/stores/",
    "/support",
    "/track",
    "sitemap",
    "privacy-policy",
    "terms-and-conditions",
)


def _fetch(url: str) -> tuple[int, str]:
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            response = Fetcher.get(
                url,
                impersonate="chrome",
                stealthy_headers=True,
                follow_redirects=True,
                timeout=FETCH_TIMEOUT_SECONDS,
                retries=1,
            )
        return response.status, response.body.decode("utf-8", "replace")
    except Exception:
        return 0, ""


def _normalized_url(raw: str, base_url: str) -> str | None:
    value = raw.strip().replace("&amp;", "&")
    if not value or value.startswith(("#", "javascript:", "mailto:", "tel:")):
        return None
    candidate = urljoin(base_url, value)
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    return urlunparse(parsed._replace(fragment=""))


def _belongs_to_store(url: str, hostname: str) -> bool:
    candidate = (urlparse(url).hostname or "").lower().removeprefix("www.")
    registered = hostname.lower().removeprefix("www.")
    return (
        candidate == registered
        or candidate.endswith(f".{registered}")
        or registered.endswith(f".{candidate}")
    )


def _product_score(url: str) -> int:
    parsed = urlparse(url)
    path = parsed.path.lower().rstrip("/")
    query = parsed.query.lower()
    if not path or path in {"/in", "/en-in", "/in/en", "/en_in"}:
        return -1000
    if path.endswith(
        (
            ".avif",
            ".css",
            ".gif",
            ".ico",
            ".jpeg",
            ".jpg",
            ".js",
            ".json",
            ".mp4",
            ".pdf",
            ".png",
            ".svg",
            ".webp",
            ".xml",
            ".xml.gz",
        )
    ):
        return -1000
    if any(marker in path for marker in NEGATIVE_MARKERS):
        return -500

    score = 0
    strong_patterns = (
        ("/products/", 140),
        ("/product/", 135),
        ("/productpage.", 135),
        ("/p/", 125),
        ("/pd/", 120),
        ("/buy/", 100),
        ("/item/", 90),
    )
    for marker, value in strong_patterns:
        if marker in path:
            score = max(score, value)
    if re.search(r"/(?:dp|gp/product)/[a-z0-9]{6,}", path):
        score = max(score, 145)
    if re.search(r"[-_/]p[-_/][a-z0-9]", path):
        score = max(score, 115)
    if path.endswith((".html", ".htm")):
        score += 45
    if re.search(r"\d{5,}", path):
        score += 28
    if any(key in query for key in ("skuid=", "pid=", "productid=", "variant=")):
        score += 24
    score += min(path.count("/"), 5) * 3
    return score


def _html_links(raw: str, base_url: str) -> list[str]:
    values = re.findall(
        r"<(?:a|link)\b[^>]*?\bhref\s*=\s*['\"]([^'\"]+)['\"]",
        raw,
        flags=re.IGNORECASE,
    )
    results: list[str] = []
    for value in values:
        normalized = _normalized_url(value, base_url)
        if normalized:
            results.append(normalized)
    return results


def _xml_locations(raw: str, base_url: str) -> list[str]:
    locations = re.findall(r"<loc\b[^>]*>(.*?)</loc>", raw, flags=re.IGNORECASE | re.DOTALL)
    results: list[str] = []
    for value in locations:
        normalized = _normalized_url(re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", value).strip(), base_url)
        if normalized:
            results.append(normalized)
    return results


def _sitemap_urls(raw: str, base_url: str) -> list[str]:
    locations = _xml_locations(raw, base_url)
    return [
        value
        for value in locations
        if value.lower().split("?", 1)[0].endswith((".xml", ".xml.gz"))
        or "sitemap" in urlparse(value).path.lower()
    ]


def _robots_sitemaps(raw: str, base_url: str) -> list[str]:
    results = []
    for match in re.finditer(r"^\s*sitemap\s*:\s*(\S+)", raw, flags=re.IGNORECASE | re.MULTILINE):
        normalized = _normalized_url(match.group(1), base_url)
        if normalized:
            results.append(normalized)
    return results


def discover_store(store: dict[str, Any]) -> dict[str, Any]:
    base_url = store["baseUrl"]
    origin = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}/"
    candidates: set[str] = set()
    sources: list[str] = []

    status, homepage = _fetch(base_url)
    if status and homepage:
        sources.append(f"homepage:{status}")
        candidates.update(_html_links(homepage, base_url))
    else:
        sources.append("homepage:failed")

    sitemap_queue: list[str] = []
    robots_status, robots = _fetch(urljoin(origin, "robots.txt"))
    if robots_status and robots:
        sources.append(f"robots:{robots_status}")
        sitemap_queue.extend(_robots_sitemaps(robots, origin))
    sitemap_queue.extend(
        [
            urljoin(origin, "sitemap.xml"),
            urljoin(origin, "sitemap_index.xml"),
            urljoin(origin, "sitemap-index.xml"),
        ]
    )

    seen_sitemaps: set[str] = set()
    prioritized = sorted(
        dict.fromkeys(sitemap_queue),
        key=lambda value: ("product" not in value.lower(), value),
    )
    while prioritized and len(seen_sitemaps) < MAX_SITEMAPS_PER_STORE:
        sitemap = prioritized.pop(0)
        if sitemap in seen_sitemaps:
            continue
        seen_sitemaps.add(sitemap)
        sitemap_status, raw = _fetch(sitemap)
        if not sitemap_status or not raw or "<loc" not in raw.lower():
            continue
        sources.append(f"sitemap:{sitemap_status}")
        locations = _xml_locations(raw, sitemap)
        candidates.update(locations)
        child_sitemaps = _sitemap_urls(raw, sitemap)
        for child in sorted(child_sitemaps, key=lambda value: ("product" not in value.lower(), value)):
            if child not in seen_sitemaps:
                prioritized.append(child)

    ranked = sorted(
        (
            value
            for value in candidates
            if _belongs_to_store(value, store["hostname"]) and _product_score(value) > 0
        ),
        key=lambda value: (-_product_score(value), len(value), value),
    )
    return {
        "name": store["name"],
        "site": store["site"],
        "hostname": store["hostname"],
        "baseUrl": store["baseUrl"],
        "candidates": ranked[:MAX_CANDIDATES_PER_STORE],
        "sources": sources,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--missing-only", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    registry = json.loads(args.registry.read_text(encoding="utf-8"))["sites"]
    existing = json.loads(args.fixture.read_text(encoding="utf-8")) if args.fixture.exists() else []
    existing_hosts = {
        (urlparse(item.get("url", "")).hostname or "").lower().removeprefix("www.")
        for item in existing
    }
    stores = registry
    if args.missing_only:
        stores = [
            store
            for store in registry
            if not any(
                host == store["hostname"] or host.endswith(f'.{store["hostname"]}')
                for host in existing_hosts
            )
        ]

    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {executor.submit(discover_store, store): store for store in stores}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(
                f'{result["hostname"]}\t{len(result["candidates"])}\t'
                f'{result["candidates"][0] if result["candidates"] else ""}',
                file=sys.stderr,
                flush=True,
            )

    results.sort(key=lambda item: item["name"].casefold())
    serialized = json.dumps(results, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
    else:
        print(serialized, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
