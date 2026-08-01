"""Optional Redis realtime backend for Cover Story.

Local development and tests run without Redis. When ``COVERSTORY_REDIS_URL`` or
``REDIS_URL`` is set, this module stores live room snapshots and publishes room
change events so separate FastAPI workers can refresh their local sockets.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Awaitable, Callable

_ROOM_KEY = "coverstory:room:{code}"
_ROOM_CHANNEL = "coverstory:room:{code}:events"
_TIMER_LOCK_KEY = "coverstory:room:{code}:timer-lock"
_MUTATION_LOCK_KEY = "coverstory:room:{code}:mutation-lock"


class RedisRealtime:
    def __init__(self) -> None:
        self.url = os.environ.get("COVERSTORY_REDIS_URL") or os.environ.get("REDIS_URL") or ""
        self._client = None
        self._driver_error = ""
        self._last_error = ""

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
        except Exception as exc:  # pragma: no cover - depends on optional package
            self._driver_error = f"{type(exc).__name__}: {exc}"
            return None
        self._client = redis_asyncio.from_url(self.url, decode_responses=True)
        return self._client

    def room_key(self, code: str) -> str:
        return _ROOM_KEY.format(code=code.upper())

    def room_channel(self, code: str) -> str:
        return _ROOM_CHANNEL.format(code=code.upper())

    def timer_lock_key(self, code: str) -> str:
        return _TIMER_LOCK_KEY.format(code=code.upper())

    def mutation_lock_key(self, code: str) -> str:
        return _MUTATION_LOCK_KEY.format(code=code.upper())

    async def save_room(self, code: str, snapshot: dict, *, ttl_secs: int) -> bool:
        client = await self._redis()
        if client is None:
            return False
        try:
            await client.set(
                self.room_key(code),
                json.dumps(snapshot, separators=(",", ":")),
                ex=max(30, int(ttl_secs)),
            )
            self._last_error = ""
            return True
        except Exception as exc:  # pragma: no cover - network dependent
            self._last_error = f"{type(exc).__name__}: {exc}"
            return False

    async def load_room(self, code: str) -> dict | None:
        client = await self._redis()
        if client is None:
            return None
        try:
            raw = await client.get(self.room_key(code))
            self._last_error = ""
            if not raw:
                return None
            body = json.loads(raw)
            return body if isinstance(body, dict) else None
        except Exception as exc:  # pragma: no cover - network dependent
            self._last_error = f"{type(exc).__name__}: {exc}"
            return None

    async def publish_room(self, code: str) -> bool:
        client = await self._redis()
        if client is None:
            return False
        try:
            await client.publish(
                self.room_channel(code),
                json.dumps({"type": "room_changed", "code": code.upper()}, separators=(",", ":")),
            )
            self._last_error = ""
            return True
        except Exception as exc:  # pragma: no cover - network dependent
            self._last_error = f"{type(exc).__name__}: {exc}"
            return False

    async def acquire_timer_lock(self, code: str, *, ttl_secs: int = 5) -> bool:
        client = await self._redis()
        if client is None:
            return True
        try:
            acquired = await client.set(
                self.timer_lock_key(code),
                "1",
                ex=max(1, int(ttl_secs)),
                nx=True,
            )
            self._last_error = ""
            return bool(acquired)
        except Exception as exc:  # pragma: no cover - network dependent
            self._last_error = f"{type(exc).__name__}: {exc}"
            return True

    async def acquire_mutation_lock(self, code: str, *, ttl_secs: int = 4, wait_secs: float = 2.0) -> str:
        client = await self._redis()
        if client is None:
            return ""
        token = uuid.uuid4().hex
        deadline = time.time() + wait_secs
        key = self.mutation_lock_key(code)
        while time.time() < deadline:
            try:
                acquired = await client.set(key, token, ex=max(1, int(ttl_secs)), nx=True)
                self._last_error = ""
                if acquired:
                    return token
            except Exception as exc:  # pragma: no cover - network dependent
                self._last_error = f"{type(exc).__name__}: {exc}"
                return ""
            await asyncio_sleep(0.03)
        return ""

    async def release_mutation_lock(self, code: str, token: str) -> None:
        if not token:
            return
        client = await self._redis()
        if client is None:
            return
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        end
        return 0
        """
        try:
            await client.eval(script, 1, self.mutation_lock_key(code), token)
            self._last_error = ""
        except Exception as exc:  # pragma: no cover - network dependent
            self._last_error = f"{type(exc).__name__}: {exc}"

    async def subscribe_room(self, code: str, callback: Callable[[str], Awaitable[None]]) -> None:
        client = await self._redis()
        if client is None:
            return
        pubsub = client.pubsub()
        channel = self.room_channel(code)
        try:
            await pubsub.subscribe(channel)
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                await callback(code.upper())
        finally:  # pragma: no cover - cancellation cleanup
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except Exception:
                pass

    async def status(self) -> dict:
        client = await self._redis()
        connected = False
        if client is not None:
            try:
                connected = bool(await client.ping())
                self._last_error = ""
            except Exception as exc:  # pragma: no cover - network dependent
                self._last_error = f"{type(exc).__name__}: {exc}"
        return {
            "mode": "redis" if self.enabled else "memory",
            "enabled": self.enabled,
            "driverAvailable": not bool(self._driver_error),
            "connected": connected,
            "roomKeyPattern": _ROOM_KEY,
            "channelPattern": _ROOM_CHANNEL,
            "timerLockPattern": _TIMER_LOCK_KEY,
            "mutationLockPattern": _MUTATION_LOCK_KEY,
            "lastError": self._last_error or self._driver_error,
        }


realtime = RedisRealtime()


async def asyncio_sleep(seconds: float) -> None:
    import asyncio

    await asyncio.sleep(seconds)
