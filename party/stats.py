"""Room and WebSocket gauges for health checks and capacity backpressure."""

from __future__ import annotations

from typing import Any, Callable, Iterator

from fastapi import HTTPException

MAX_TOTAL_ROOMS = 8000
MAX_TOTAL_SOCKETS = 10_000


def _managers() -> Iterator[tuple[str, Any]]:
    from charades.manager import manager as charades
    from codenames.manager import manager as cipher
    from dial.manager import manager as dial
    from imposter.manager import manager as imposter
    from whoami.manager import manager as whoami

    yield "cipher", cipher
    yield "dial", dial
    yield "imposter", imposter
    yield "charades", charades
    yield "whoami", whoami


def party_stats() -> dict[str, Any]:
    games: dict[str, dict[str, int]] = {}
    total_rooms = 0
    total_sockets = 0
    total_players = 0
    for name, mgr in _managers():
        rooms = len(mgr.rooms)
        sockets = sum(len(r.sockets) for r in mgr.rooms.values())
        players = sum(len(r.players) for r in mgr.rooms.values())
        games[name] = {"rooms": rooms, "sockets": sockets, "players": players}
        total_rooms += rooms
        total_sockets += sockets
        total_players += players
    return {
        "rooms": total_rooms,
        "sockets": total_sockets,
        "players": total_players,
        "games": games,
        "limits": {
            "maxRooms": MAX_TOTAL_ROOMS,
            "maxSockets": MAX_TOTAL_SOCKETS,
        },
    }


def ensure_can_create_room() -> None:
    stats = party_stats()
    if stats["rooms"] >= MAX_TOTAL_ROOMS:
        raise HTTPException(
            status_code=503,
            detail="Lots of games running right now — try again in a moment.",
        )


async def stop_all_managers() -> None:
    for _name, mgr in _managers():
        stop: Callable[[], Any] | None = getattr(mgr, "stop", None)
        if stop is None:
            continue
        result = stop()
        if hasattr(result, "__await__"):
            await result
