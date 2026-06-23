"""Proxy-aware rate limits for party-game HTTP and WebSocket traffic."""

from __future__ import annotations

import time
from typing import Optional

from fastapi import HTTPException, Request

_CREATE_BUCKETS: dict[str, list[float]] = {}
_WS_BUCKETS: dict[str, list[float]] = {}

CREATE_LIMIT = 30
CREATE_WINDOW = 10 * 60
WS_MSG_LIMIT = 120
WS_MSG_WINDOW = 60
_BUCKET_PRUNE_AT = 5000


class WsRateLimitError(Exception):
    """Too many WebSocket messages from one connection."""


def client_key(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    host = forwarded or (request.client.host if request.client else "unknown")
    return host[:80]


def _prune_buckets(buckets: dict[str, list[float]], window: float) -> None:
    if len(buckets) <= _BUCKET_PRUNE_AT:
        return
    cutoff = time.time() - window
    for stale in [k for k, vals in buckets.items() if not vals or max(vals) < cutoff]:
        buckets.pop(stale, None)


def rate_limit_create(request: Request, *, limit: int = CREATE_LIMIT, window: int = CREATE_WINDOW) -> None:
    now = time.time()
    _prune_buckets(_CREATE_BUCKETS, window)
    key = client_key(request)
    hits = [t for t in _CREATE_BUCKETS.get(key, []) if now - t < window]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many rooms created — try again shortly.")
    hits.append(now)
    _CREATE_BUCKETS[key] = hits


def rate_limit_ws_message(
    game: str,
    room_code: str,
    pid: str,
    *,
    mtype: Optional[str] = None,
    limit: int = WS_MSG_LIMIT,
    window: int = WS_MSG_WINDOW,
) -> None:
    if mtype == "ping":
        return
    now = time.time()
    _prune_buckets(_WS_BUCKETS, window)
    key = f"{game}:{room_code}:{pid}"
    hits = [t for t in _WS_BUCKETS.get(key, []) if now - t < window]
    if len(hits) >= limit:
        raise WsRateLimitError("Slow down — too many messages.")
    hits.append(now)
    _WS_BUCKETS[key] = hits
