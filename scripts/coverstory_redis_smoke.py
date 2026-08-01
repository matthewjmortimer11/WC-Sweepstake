#!/usr/bin/env python3
"""Two-worker Redis smoke for Cover Story.

Start two app processes with the same ``COVERSTORY_REDIS_URL`` first, then run:

    python scripts/coverstory_redis_smoke.py http://127.0.0.1:8011 http://127.0.0.1:8012

To also force an expired deadline through Redis and verify that a worker-owned
timer tick moves the room to accusation:

    python scripts/coverstory_redis_smoke.py http://127.0.0.1:8011 http://127.0.0.1:8012 --redis-url redis://127.0.0.1:6381/0 --timer-expiry

The script creates a room on worker A, connects the host to worker A, connects
two players to worker B, starts the round from worker A, and verifies that a
player action on worker B is reflected back to worker A through Redis.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from urllib.parse import urlparse

import httpx
import websockets


def _ws_base(http_base: str) -> str:
    parsed = urlparse(http_base)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return f"{scheme}://{parsed.netloc}"


async def _next_state(ws, predicate, label: str, *, timeout: float = 8) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, deadline - time.time()))
        except asyncio.TimeoutError:
            break
        msg = json.loads(raw)
        if msg.get("type") == "state":
            last = msg
            if predicate(msg):
                return msg
        elif msg.get("type") in {"fatal", "error"}:
            raise RuntimeError(f"{label}: {msg}")
    raise RuntimeError(f"Timed out waiting for {label}; last state={last}")


async def _force_expired_deadline(redis_url: str, code: str) -> None:
    from redis import asyncio as redis_asyncio

    client = redis_asyncio.from_url(redis_url, decode_responses=True)
    try:
        key = f"coverstory:room:{code}:timer-lock"
        await client.delete(key)
        room_key = f"coverstory:room:{code}"
        raw = await client.get(room_key)
        if not raw:
            raise RuntimeError(f"No Redis room snapshot found for {code}")
        snapshot = json.loads(raw)
        snapshot["game"]["phase"] = "play"
        snapshot["game"]["deadlineAt"] = time.time() - 1
        snapshot["game"]["pausedAt"] = 0
        await client.set(room_key, json.dumps(snapshot, separators=(",", ":")), ex=21600)
        await client.publish(
            f"coverstory:room:{code}:events",
            json.dumps({"type": "room_changed", "code": code}, separators=(",", ":")),
        )
    finally:
        await client.aclose()


async def run(worker_a: str, worker_b: str, *, redis_url: str = "", timer_expiry: bool = False) -> dict:
    worker_a = worker_a.rstrip("/")
    worker_b = worker_b.rstrip("/")
    ws_a = _ws_base(worker_a)
    ws_b = _ws_base(worker_b)

    async with httpx.AsyncClient(timeout=8) as client:
        health_a = (await client.get(f"{worker_a}/coverstory/api/health")).json()
        health_b = (await client.get(f"{worker_b}/coverstory/api/health")).json()
        for label, health in (("worker A", health_a), ("worker B", health_b)):
            realtime = health.get("realtime") or {}
            if realtime.get("mode") != "redis" or realtime.get("connected") is not True:
                raise RuntimeError(f"{label} is not connected to Redis: {realtime}")
        room = (await client.post(f"{worker_a}/coverstory/api/rooms", json={"timerSecs": 300})).json()
        code = room["code"]

    host = await websockets.connect(f"{ws_a}/coverstory/ws/{code}?pid=host&name=Host")
    await _next_state(host, lambda m: any(p["id"] == "host" for p in m["room"]["players"]), "host initial state")
    p1 = await websockets.connect(f"{ws_b}/coverstory/ws/{code}?pid=p1&name=Blue")
    p2 = await websockets.connect(f"{ws_b}/coverstory/ws/{code}?pid=p2&name=Green")
    try:
        await _next_state(p1, lambda m: any(p["id"] == "host" for p in m["room"]["players"]), "worker B loads host")
        await _next_state(p2, lambda m: len(m["room"]["players"]) >= 3, "worker B sees three players")
        await _next_state(host, lambda m: len(m["room"]["players"]) >= 3, "worker A receives worker B joins")

        await host.send(json.dumps({"type": "start"}))
        on_b = await _next_state(
            p1,
            lambda m: m["room"]["game"]["status"] == "playing" and len(m["room"]["game"]["playerIds"]) == 3,
            "worker B receives start",
        )

        await p1.send(json.dumps({"type": "markViewed"}))
        on_a = await _next_state(
            host,
            lambda m: "p1" in m["room"]["game"].get("viewed", []),
            "worker A receives worker B move",
        )
        timer_phase = ""
        if timer_expiry:
            if not redis_url:
                raise RuntimeError("--timer-expiry requires --redis-url")
            await host.send(json.dumps({"type": "markViewed"}))
            await p2.send(json.dumps({"type": "markViewed"}))
            await _next_state(host, lambda m: m["room"]["game"]["phase"] == "play", "worker A enters play")
            await _next_state(p1, lambda m: m["room"]["game"]["phase"] == "play", "worker B enters play")
            await _force_expired_deadline(redis_url, code)
            expired_on_a = await _next_state(
                host,
                lambda m: m["room"]["game"]["phase"] == "accuse",
                "worker A receives server timer expiry",
                timeout=10,
            )
            await _next_state(
                p1,
                lambda m: m["room"]["game"]["phase"] == "accuse",
                "worker B receives server timer expiry",
                timeout=10,
            )
            timer_phase = expired_on_a["room"]["game"]["phase"]
        return {
            "ok": True,
            "code": code,
            "workerA": worker_a,
            "workerB": worker_b,
            "phaseOnWorkerB": on_b["room"]["game"]["phase"],
            "viewedOnWorkerA": on_a["room"]["game"]["viewed"],
            "playersOnWorkerA": [p["id"] for p in on_a["room"]["players"]],
            "timerExpiryPhase": timer_phase,
        }
    finally:
        await host.close()
        await p1.close()
        await p2.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worker_a")
    parser.add_argument("worker_b")
    parser.add_argument("--redis-url", default="")
    parser.add_argument("--timer-expiry", action="store_true")
    args = parser.parse_args()
    print(json.dumps(asyncio.run(run(
        args.worker_a,
        args.worker_b,
        redis_url=args.redis_url,
        timer_expiry=args.timer_expiry,
    )), indent=2))


if __name__ == "__main__":
    main()
