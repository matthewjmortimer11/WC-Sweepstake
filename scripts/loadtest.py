#!/usr/bin/env python3
"""Load test the league state endpoint — the hot path under a spike.

Models the shape of real traffic: everyone in a league polling /state at the
same time during a match, most of them holding an ETag from their last poll.

  python scripts/loadtest.py --url http://localhost:8000 --league OI \
      --concurrency 200 --requests 2000

The default mix (--etag-ratio 0.8) reflects a steady poll where the payload
usually has not changed. Use --etag-ratio 0 to measure the cold path only.

Reports p50/p95/p99 rather than a mean: an average hides exactly the tail that
makes a spike feel broken.
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
from collections import Counter

try:
    import httpx
except ImportError:  # pragma: no cover
    sys.exit("httpx is required: pip install httpx")


async def _worker(client, url, etag_ratio, budget, results, statuses, bytes_seen, etag_box):
    while True:
        try:
            budget.get_nowait()
        except asyncio.QueueEmpty:
            return
        headers = {}
        # Reuse the ETag most of the time, as a real poller would.
        if etag_box["etag"] and (len(results) % 100) / 100 < etag_ratio:
            headers["If-None-Match"] = etag_box["etag"]
        started = time.perf_counter()
        try:
            r = await client.get(url, headers=headers)
        except Exception as exc:
            statuses[f"error:{type(exc).__name__}"] += 1
            continue
        results.append((time.perf_counter() - started) * 1000)
        statuses[r.status_code] += 1
        bytes_seen.append(len(r.content))
        if r.status_code == 200 and r.headers.get("ETag"):
            etag_box["etag"] = r.headers["ETag"]


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--league", default="OI")
    ap.add_argument("--concurrency", type=int, default=100)
    ap.add_argument("--requests", type=int, default=1000)
    ap.add_argument("--etag-ratio", type=float, default=0.8,
                    help="fraction of requests sent with a stored ETag (0..1)")
    args = ap.parse_args()

    url = f"{args.url.rstrip('/')}/api/leagues/{args.league}/state"

    budget: asyncio.Queue = asyncio.Queue()
    for _ in range(args.requests):
        budget.put_nowait(1)

    results: list[float] = []
    statuses: Counter = Counter()
    bytes_seen: list[int] = []
    etag_box = {"etag": ""}

    limits = httpx.Limits(max_connections=args.concurrency,
                          max_keepalive_connections=args.concurrency)
    async with httpx.AsyncClient(timeout=30.0, limits=limits) as client:
        probe = await client.get(url)
        if probe.status_code != 200:
            return _fail(f"{url} returned {probe.status_code} — is the server up "
                         f"and is league {args.league!r} present?")
        etag_box["etag"] = probe.headers.get("ETag", "")

        print(f"{url}\n  {args.requests} requests, {args.concurrency} concurrent, "
              f"{int(args.etag_ratio * 100)}% carrying an ETag\n")
        started = time.perf_counter()
        await asyncio.gather(*[
            _worker(client, url, args.etag_ratio, budget, results, statuses,
                    bytes_seen, etag_box)
            for _ in range(args.concurrency)
        ])
        elapsed = time.perf_counter() - started

    if not results:
        return _fail("no successful responses")

    ordered = sorted(results)

    def pct(p: float) -> float:
        return ordered[min(len(ordered) - 1, int(len(ordered) * p))]

    total_mb = sum(bytes_seen) / 1024 / 1024
    print(f"  throughput   {len(results) / elapsed:8.1f} req/s over {elapsed:.1f}s")
    print(f"  latency p50  {statistics.median(ordered):8.1f} ms")
    print(f"          p95  {pct(0.95):8.1f} ms")
    print(f"          p99  {pct(0.99):8.1f} ms")
    print(f"          max  {ordered[-1]:8.1f} ms")
    print(f"  transferred  {total_mb:8.1f} MB "
          f"({total_mb * 1024 / max(1, len(bytes_seen)):.1f} KB/req avg)")
    print(f"  statuses     {dict(statuses)}")

    errors = sum(v for k, v in statuses.items() if isinstance(k, str) or k >= 500)
    if errors:
        return _fail(f"{errors} failed responses")
    return 0


def _fail(msg: str) -> int:
    print(f"FAILED: {msg}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
