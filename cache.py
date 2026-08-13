"""Optional Redis cache for the hot read paths.

The league state endpoint is polled by every member every 30 s and rebuilds the
whole payload from four queries plus the standings/prediction engines. A league
is a group of people, so during a match those polls all ask for the SAME answer
— which is exactly what a shared cache is for.

Entirely optional. With no REDIS_URL (local dev, tests, or a deployment that
simply has no Redis) every call here is a cheap no-op and the app behaves
exactly as it did before. Redis being down must never take the app down, so
every operation swallows its errors and reports a miss.

Freshness comes from the cache KEY, not from expiry:

    wheesht:state:<CODE>:<league version>:<fixture revision>

The league version is bumped by middleware on any successful write to that
league, and the fixture revision changes whenever sync rebuilds that
tournament's fixtures. A stale entry therefore becomes unreachable rather than
wrong. The TTL is only there to stop superseded keys accumulating.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

log = logging.getLogger(__name__)

# Superseded entries are unreachable the moment their key changes, so this only
# bounds how long dead keys linger.
DEFAULT_TTL_SECONDS = 300

_VERSION_KEY = "wheesht:{ns}lv:{code}"
_STATE_KEY = "wheesht:{ns}state:{code}:{version}:{revision}"


def _namespace() -> str:
    """Optional key prefix, so environments can share one Redis safely.

    Staging and production pointed at the same Redis would otherwise collide on
    league codes and serve each other's data — the keys carry no notion of
    which database they came from. Set WHEESHT_CACHE_NAMESPACE per environment.
    """
    ns = (os.environ.get("WHEESHT_CACHE_NAMESPACE") or "").strip()
    return f"{ns}:" if ns else ""


class LeagueCache:
    def __init__(self) -> None:
        self.url = os.environ.get("WHEESHT_REDIS_URL") or os.environ.get("REDIS_URL") or ""
        self._client: Any = None
        self._warned = False

    @property
    def enabled(self) -> bool:
        return bool(self.url)

    async def _redis(self):
        if not self.url:
            return None
        if self._client is not None:
            return self._client
        try:
            from redis import asyncio as redis_asyncio  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dependency
            self._warn("redis package unavailable: %s", exc)
            self.url = ""
            return None
        self._client = redis_asyncio.from_url(self.url, decode_responses=True)
        return self._client

    def _warn(self, msg: str, *args) -> None:
        """Log a cache problem once. A degraded cache is not an incident — the
        app is still correct, just doing more work."""
        if not self._warned:
            self._warned = True
            log.warning("League cache disabled — " + msg, *args)

    # ── versioning ──────────────────────────────────────────────────────────

    async def league_version(self, code: str) -> int:
        """Current version for a league. 0 when unknown or unavailable, which
        simply means everyone shares the version-0 cache slot until the first
        write bumps it."""
        client = await self._redis()
        if client is None:
            return 0
        try:
            raw = await client.get(_VERSION_KEY.format(ns=_namespace(), code=code.upper()))
            return int(raw) if raw else 0
        except Exception as exc:  # pragma: no cover - network dependent
            self._warn("version read failed: %s", exc)
            return 0

    async def bump_league(self, code: str) -> None:
        """Invalidate a league's cached state by moving it to a new key."""
        client = await self._redis()
        if client is None:
            return
        try:
            await client.incr(_VERSION_KEY.format(ns=_namespace(), code=code.upper()))
        except Exception as exc:  # pragma: no cover - network dependent
            self._warn("version bump failed: %s", exc)

    # ── cached payloads ─────────────────────────────────────────────────────

    async def get_state(self, code: str, version: int, revision: int) -> Optional[str]:
        client = await self._redis()
        if client is None:
            return None
        try:
            return await client.get(
                _STATE_KEY.format(ns=_namespace(), code=code.upper(), version=version, revision=revision)
            )
        except Exception as exc:  # pragma: no cover - network dependent
            self._warn("read failed: %s", exc)
            return None

    async def set_state(
        self, code: str, version: int, revision: int, body: str,
        ttl: int = DEFAULT_TTL_SECONDS,
    ) -> None:
        client = await self._redis()
        if client is None:
            return
        try:
            await client.set(
                _STATE_KEY.format(ns=_namespace(), code=code.upper(), version=version, revision=revision),
                body,
                ex=ttl,
            )
        except Exception as exc:  # pragma: no cover - network dependent
            self._warn("write failed: %s", exc)


league_cache = LeagueCache()
