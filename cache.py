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

import asyncio
import logging
import os
import weakref
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
        # Keyed by event loop; weak so finished loops do not pile up.
        self._clients: "weakref.WeakKeyDictionary[Any, Any]" = weakref.WeakKeyDictionary()
        self._warned = False

    @property
    def enabled(self) -> bool:
        return bool(self.url)

    async def _redis(self):
        if not self.url:
            return None

        # A redis-py client binds its connection pool to the event loop that
        # created it, and awaiting it from a different loop hangs rather than
        # errors. One shared client is therefore not safe when two loops are
        # live at once — which happens whenever a lifespan runs on its own
        # thread alongside the caller's loop. Keeping a client PER loop means
        # neither can take the other's.
        #
        # Production has one loop per worker, so this holds exactly one entry.
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # pragma: no cover - no loop, nothing to cache
            return None

        client = self._clients.get(loop)
        if client is not None:
            return client

        try:
            from redis import asyncio as redis_asyncio  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dependency
            self._warn("redis package unavailable: %s", exc)
            self.url = ""
            return None
        client = redis_asyncio.from_url(self.url, decode_responses=True)
        self._clients[loop] = client
        return client

    def _warn(self, msg: str, *args) -> None:
        """Log a cache problem once. A degraded cache is not an incident — the
        app is still correct, just doing more work."""
        if not self._warned:
            self._warned = True
            log.warning("League cache disabled — " + msg, *args)

    async def ping(self) -> bool:
        """Whether Redis is actually reachable (readiness reporting only)."""
        client = await self._redis()
        if client is None:
            return False
        try:
            await client.ping()
            return True
        except Exception:  # pragma: no cover - network dependent
            return False

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


# ── leader election ─────────────────────────────────────────────────────────

_LEADER_KEY = "wheesht:{ns}leader:{name}"


async def try_lead(name: str, holder: str, ttl: int) -> bool:
    """Whether this process should run the named singleton job.

    Background work must run once per deployment, not once per web worker: with
    `--workers 4` every process runs lifespan, so an unguarded sync loop would
    poll the provider four times over and blow its rate limit.

    Acquired with SET NX EX and renewed by the holder each cycle. If the leader
    dies the key simply expires and another worker takes over within one TTL.

    Without Redis there is no shared state to coordinate through, so this
    returns True — correct for the single-worker default, and the reason
    running several workers requires Redis.
    """
    client = await league_cache._redis()
    if client is None:
        return True
    key = _LEADER_KEY.format(ns=_namespace(), name=name)
    try:
        if await client.set(key, holder, nx=True, ex=ttl):
            return True
        # Already held — renew only if it is ours.
        if await client.get(key) == holder:
            await client.expire(key, ttl)
            return True
        return False
    except Exception as exc:  # pragma: no cover - network dependent
        # A Redis blip must not stop syncing altogether; prefer doing the work
        # twice over not at all.
        log.warning("Leader check failed for %s (%s) — proceeding", name, exc)
        return True
