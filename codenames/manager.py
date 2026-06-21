"""
Cipher — room & connection manager.

Owns the live, in-memory state for every game room: the players, their teams and
roles, the chat, and the WebSocket fan-out. Rooms are intentionally ephemeral
(a party game doesn't need durable storage); empty rooms are reaped after a short
grace period. A single background ticker drives per-turn countdown timers and the
reaping so we don't spin up a task per room.

Concurrency: each room has its own asyncio.Lock. All state mutations and the
resulting broadcast happen while holding it, so clients always receive a
consistent snapshot.
"""

from __future__ import annotations

import asyncio
import random
import secrets
import string
import time
from dataclasses import dataclass, field
from typing import Optional

from .game import (
    BLUE,
    RED,
    STATUS_LOBBY,
    STATUS_PLAYING,
    Game,
    MoveError,
    Settings,
)
from .words import PACKS, words_for

# Avoid ambiguous characters in shareable room codes.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_ROOM_TTL_EMPTY = 120          # seconds an empty room lingers before reaping
_ROOM_TTL_IDLE = 60 * 60 * 6   # hard cap on a room's lifetime since last activity
_MAX_ROOMS = 2000
_MAX_PLAYERS = 50
_MAX_NAME = 24
_MAX_CHAT = 300

_ALLOWED_SIZES = {4, 5, 6}
_ALLOWED_TIMERS = {0, 30, 60, 90, 120, 180}
_PALETTE = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6", "#34d399",
            "#facc15", "#60a5fa", "#fb7185", "#4ade80", "#c084fc"]


def _gen_code(n: int = 4) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(n))


@dataclass
class Player:
    id: str
    name: str
    team: str = "spectator"          # red | blue | spectator
    role: str = "operative"          # spymaster | operative
    color: str = "#60a5fa"
    is_host: bool = False
    connected: bool = False
    last_seen: float = field(default_factory=time.time)


@dataclass
class Room:
    code: str
    game: Game
    settings: Settings
    host_id: Optional[str] = None
    players: dict = field(default_factory=dict)        # pid -> Player
    sockets: dict = field(default_factory=dict)        # pid -> websocket
    chat: list = field(default_factory=list)
    created: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def touch(self) -> None:
        self.last_active = time.time()

    # ── snapshots ──────────────────────────────────────────────────────────────
    def public_players(self) -> list[dict]:
        out = []
        for p in self.players.values():
            out.append({
                "id": p.id, "name": p.name, "team": p.team, "role": p.role,
                "color": p.color, "isHost": p.is_host, "connected": p.connected,
            })
        # Stable, readable ordering: red, blue, spectators; spymasters first.
        order = {"red": 0, "blue": 1, "spectator": 2}
        out.sort(key=lambda x: (order.get(x["team"], 3),
                                0 if x["role"] == "spymaster" else 1,
                                x["name"].lower()))
        return out

    def state_for(self, pid: str) -> dict:
        me = self.players.get(pid)
        reveal = bool(me and me.role == "spymaster" and me.team in (RED, BLUE))
        return {
            "type": "state",
            "room": {
                "code": self.code,
                "players": self.public_players(),
                "settings": {
                    "boardSize": self.settings.board_size,
                    "packId": self.settings.pack_id,
                    "packName": self.settings.pack_name,
                    "turnSeconds": self.settings.turn_seconds,
                    "assassins": self.settings.assassins,
                    "hasCustom": bool(self.settings.custom_words),
                    # The pool is not secret (only the key card is), so echo it
                    # back so the host's settings form can be repopulated.
                    "customWords": ", ".join(self.settings.custom_words or []),
                },
                "game": self.game.view(reveal_key=reveal),
                "chat": self.chat[-60:],
            },
            "you": {
                "id": pid,
                "name": me.name if me else "",
                "team": me.team if me else "spectator",
                "role": me.role if me else "operative",
                "isHost": bool(me and me.is_host),
                "revealKey": reveal,
            },
        }


class Manager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self._ticker: Optional[asyncio.Task] = None

    # ── lifecycle ───────────────────────────────────────────────────────────────
    def start(self) -> None:
        if self._ticker is None or self._ticker.done():
            self._ticker = asyncio.create_task(self._run_ticker())

    async def stop(self) -> None:
        if self._ticker:
            self._ticker.cancel()
            try:
                await self._ticker
            except asyncio.CancelledError:
                pass

    async def _run_ticker(self) -> None:
        while True:
            await asyncio.sleep(1)
            try:
                await self._tick()
            except Exception:  # pragma: no cover - defensive; never kill the loop
                pass

    async def _tick(self) -> None:
        now = time.time()
        for code in list(self.rooms.keys()):
            room = self.rooms.get(code)
            if not room:
                continue
            # Reap dead rooms.
            has_conn = any(p.connected for p in room.players.values())
            if not has_conn and now - room.last_active > _ROOM_TTL_EMPTY:
                self.rooms.pop(code, None)
                continue
            if now - room.last_active > _ROOM_TTL_IDLE:
                self.rooms.pop(code, None)
                continue
            # Drive turn timers.
            if room.game.time_expired(now):
                async with room.lock:
                    if room.game.time_expired(now):
                        room.game.on_timeout()
                        room.touch()
                        await self._broadcast(room)

    # ── room creation / lookup ───────────────────────────────────────────────────
    def create_room(self) -> Room:
        if len(self.rooms) >= _MAX_ROOMS:
            # Best-effort cleanup of the oldest idle room.
            oldest = min(self.rooms.values(), key=lambda r: r.last_active, default=None)
            if oldest:
                self.rooms.pop(oldest.code, None)
        for _ in range(20):
            code = _gen_code()
            if code not in self.rooms:
                break
        else:
            code = _gen_code(6)
        settings = Settings(pack_id="classic", pack_name=PACKS["classic"]["name"])
        room = Room(code=code, game=Game(settings=settings), settings=settings)
        self.rooms[code] = room
        return room

    def get(self, code: str) -> Optional[Room]:
        return self.rooms.get((code or "").strip().upper())

    # ── players ──────────────────────────────────────────────────────────────────
    def _assign_initial_team(self, room: Room) -> str:
        reds = sum(1 for p in room.players.values() if p.team == RED)
        blues = sum(1 for p in room.players.values() if p.team == BLUE)
        return RED if reds <= blues else BLUE

    def join(self, room: Room, pid: str, name: str) -> Player:
        name = _clean_name(name)
        existing = room.players.get(pid)
        if existing:
            existing.name = name or existing.name
            existing.connected = True
            existing.last_seen = time.time()
            return existing
        if len(room.players) >= _MAX_PLAYERS:
            raise MoveError("This room is full.")
        used = {p.color for p in room.players.values()}
        color = next((c for c in _PALETTE if c not in used),
                     random.choice(_PALETTE))
        player = Player(
            id=pid,
            name=name or f"Agent {len(room.players) + 1}",
            team=self._assign_initial_team(room),
            color=color,
            connected=True,
            is_host=(room.host_id is None),
        )
        if room.host_id is None:
            room.host_id = pid
        room.players[pid] = player
        return player

    def _ensure_host(self, room: Room) -> None:
        """Make sure a connected player holds the host role."""
        if room.host_id and room.players.get(room.host_id) \
                and room.players[room.host_id].connected:
            return
        for p in room.players.values():
            if p.connected:
                room.host_id = p.id
                for q in room.players.values():
                    q.is_host = (q.id == p.id)
                return

    # ── broadcast ────────────────────────────────────────────────────────────────
    async def _broadcast(self, room: Room) -> None:
        dead = []
        for pid, ws in list(room.sockets.items()):
            try:
                await ws.send_json(room.state_for(pid))
            except Exception:
                dead.append(pid)
        for pid in dead:
            room.sockets.pop(pid, None)
            if pid in room.players:
                room.players[pid].connected = False


def _clean_name(name: str) -> str:
    name = (name or "").strip()
    # Collapse whitespace and strip control characters.
    name = " ".join(name.split())
    name = "".join(ch for ch in name if ch.isprintable())
    return name[:_MAX_NAME]


# Singleton used by the router.
manager = Manager()
