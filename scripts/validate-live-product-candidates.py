#!/usr/bin/env python3
"""Run candidate product URLs through MyCart's real unified scraper."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
SCRAPER = ROOT / "scrapers" / "scrape_product.py"
PYTHON = ROOT / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def _load_discovery_module():
    path = ROOT / "scripts" / "discover-live-product-urls.py"
    spec = importlib.util.spec_from_file_location("mycart_discovery", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load product URL discovery helpers")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


DISCOVERY = _load_discovery_module()


def _host_matches(host: str, registered: str) -> bool:
    host = host.lower().removeprefix("www.")
    registered = registered.lower().removeprefix("www.")
    return host == registered or host.endswith(f".{registered}")


def _override_for_store(store: dict[str, Any], overrides: list[dict[str, Any]]) -> str | None:
    hosts = [store["hostname"], *(store.get("aliases") or [])]
    for item in overrides:
        host = (urlparse(item.get("url", "")).hostname or "").lower()
        if any(_host_matches(host, registered) for registered in hosts):
            return item["url"]
    return None


def _valid_candidates(
    store: dict[str, Any], candidates: dict[str, Any], max_attempts: int
) -> list[str]:
    result: list[str] = []
    override = store.get("override")
    if override:
        result.append(override)
    for url in candidates.get(store["hostname"], []):
        if DISCOVERY._product_score(url) > 0 and url not in result:
            result.append(url)
    return result[:max_attempts]


def _run_scraper(url: str, timeout_seconds: int) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            [str(PYTHON), str(SCRAPER), url],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        duration = round(time.perf_counter() - started, 3)
        try:
            payload = json.loads(completed.stdout.strip())
        except json.JSONDecodeError:
            return {
                "ok": False,
                "durationSeconds": duration,
                "error": (completed.stderr or completed.stdout or "invalid scraper output")[-1000:],
            }
        price = payload.get("product_price")
        ok = bool(
            completed.returncode == 0
            and payload.get("product_name")
            and payload.get("product_image_url")
            and isinstance(price, (int, float))
            and price > 0
        )
        return {
            "ok": ok,
            "durationSeconds": duration,
            **(
                {
                    "productName": payload["product_name"],
                    "productPrice": price,
                    "productImageUrl": payload["product_image_url"],
                }
                if ok
                else {"error": payload.get("error") or "incomplete product data"}
            ),
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "durationSeconds": round(time.perf_counter() - started, 3),
            "error": f"scraper timed out after {timeout_seconds}s",
        }


def validate_store(store: dict[str, Any], candidates: list[str], timeout_seconds: int) -> dict[str, Any]:
    attempts: list[dict[str, Any]] = []
    for url in candidates:
        result = _run_scraper(url, timeout_seconds)
        attempts.append({"url": url, **result})
        if result["ok"]:
            return {
                "name": store["name"],
                "site": store["site"],
                "hostname": store["hostname"],
                "baseUrl": store["baseUrl"],
                "status": "pass",
                "url": url,
                **{key: value for key, value in result.items() if key != "ok"},
                "attempts": attempts,
            }
    return {
        "name": store["name"],
        "site": store["site"],
        "hostname": store["hostname"],
        "baseUrl": store["baseUrl"],
        "status": "missing_url" if not candidates else "fail",
        "url": candidates[0] if candidates else None,
        "error": attempts[-1]["error"] if attempts else "no product URL discovered",
        "attempts": attempts,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, default=ROOT / "scrapers" / "supported_sites.json")
    parser.add_argument("--overrides", type=Path, default=ROOT / "tests" / "live_product_urls.json")
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--timeout", type=int, default=70)
    parser.add_argument("--max-attempts", type=int, default=8)
    parser.add_argument(
        "sites",
        nargs="*",
        help="Optional store names, site keys, or registered hostnames to validate",
    )
    args = parser.parse_args()

    registry = json.loads(args.registry.read_text(encoding="utf-8"))["sites"]
    overrides = json.loads(args.overrides.read_text(encoding="utf-8"))
    discovered = json.loads(args.candidates.read_text(encoding="utf-8"))
    candidate_map = {item["hostname"]: item.get("candidates", []) for item in discovered}

    requested = {value.casefold() for value in args.sites}
    work: list[tuple[dict[str, Any], list[str]]] = []
    for store in registry:
        identities = {
            store["name"].casefold(),
            store["site"].casefold(),
            store["hostname"].casefold(),
        }
        if requested and identities.isdisjoint(requested):
            continue
        prepared = dict(store)
        prepared["override"] = _override_for_store(store, overrides)
        work.append(
            (prepared, _valid_candidates(prepared, candidate_map, max(1, args.max_attempts)))
        )

    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(validate_store, store, candidates, args.timeout): store
            for store, candidates in work
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(
                f'{result["status"].upper():11} {result["name"]}: '
                f'{result.get("productName") or result.get("error", "")}',
                flush=True,
            )

    results.sort(key=lambda item: item["name"].casefold())
    summary = {
        status: sum(result["status"] == status for result in results)
        for status in ("pass", "fail", "missing_url")
    }
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total": len(results),
        "summary": summary,
        "results": results,
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
