"""Who Am I? — room & connection manager."""

from __future__ import annotations

import asyncio
import random
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

from .avatars import AvatarError, decode_data_url
from .game import (
    MAX_PLAYERS,
    MIN_PLAYERS,
    STATUS_LOBBY,
    STATUS_PLAYING,
    MoveError,
    Settings,
    WhoAmIGame,
)

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_ROOM_TTL_EMPTY = 120
_ROOM_TTL_IDLE = 60 * 60 * 6
_MAX_ROOMS = 2000
_MAX_NAME = 24

_PALETTE = [
    "#fb5071", "#21d4cf", "#ffc53d", "#a78bfa", "#34d399",
    "#facc15", "#60a5fa", "#fb7185", "#4ade80", "#c084fc",
]


def _gen_code(n: int = 4) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(n))


def _clean_name(name: str) -> str:
    name = (name or "").strip()
    name = " ".join(name.split())
    name = "".join(ch for ch in name if ch.isprintable())
    return name[:_MAX_NAME]


@dataclass
class Player:
    id: str
    name: str
    color: str = "#60a5fa"
    is_host: bool = False
    connected: bool = False
    last_seen: float = field(default_factory=time.time)
    avatar_ctype: str = ""
    avatar_bytes: bytes = field(default_factory=bytes)
    avatar_version: int = 0

    @property
    def has_avatar(self) -> bool:
        return bool(self.avatar_bytes)


@dataclass
class Room:
    code: str
    game: WhoAmIGame
    settings: Settings
    host_id: Optional[str] = None
    players: dict = field(default_factory=dict)
    sockets: dict = field(default_factory=dict)
    created: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    rng: random.Random = field(default_factory=random.Random)

    def touch(self) -> None:
        self.last_active = time.time()

    def avatar_url(self, pid: str) -> Optional[str]:
        p = self.players.get(pid)
        if not p or not p.has_avatar:
            return None
        return f"/whoami/api/rooms/{self.code}/avatar/{pid}?v={p.avatar_version}"

    def public_players(self) -> list[dict]:
        out = []
        for p in self.players.values():
            out.append({
                "id": p.id,
                "name": p.name,
                "color": p.color,
                "isHost": p.is_host,
                "connected": p.connected,
                "hasAvatar": p.has_avatar,
                "avatarUrl": self.avatar_url(p.id),
            })
        out.sort(key=lambda x: x["name"].lower())
        return out

    def state_for(self, pid: str) -> dict:
        g = self.game
        me = self.players.get(pid)
        return {
            "type": "state",
            "room": {
                "code": self.code,
                "players": self.public_players(),
                "settings": {
                    "minPlayers": MIN_PLAYERS,
                    "maxPlayers": MAX_PLAYERS,
                },
                "game": g.view(pid),
            },
            "you": {
                "id": pid,
                "name": me.name if me else "",
                "isHost": bool(me and me.is_host),
                "hasAvatar": bool(me and me.has_avatar),
                "avatarUrl": self.avatar_url(pid) if me else None,
            },
        }


class Manager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self._ticker: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._ticker is None or self._ticker.done():
            self._ticker = asyncio.create_task(self._run_ticker())

    async def _run_ticker(self) -> None:
        while True:
            await asyncio.sleep(1)
            try:
                await self._tick()
            except Exception:  # pragma: no cover
                pass

    async def _tick(self) -> None:
        now = time.time()
        for code in list(self.rooms.keys()):
            room = self.rooms.get(code)
            if not room:
                continue
            has_conn = any(p.connected for p in room.players.values())
            if not has_conn and now - room.last_active > _ROOM_TTL_EMPTY:
                self.rooms.pop(code, None)
                continue
            if now - room.last_active > _ROOM_TTL_IDLE:
                self.rooms.pop(code, None)

    def create_room(self, settings: Optional[Settings] = None) -> Room:
        if len(self.rooms) >= _MAX_ROOMS:
            oldest = min(self.rooms.values(), key=lambda r: r.last_active, default=None)
            if oldest:
                self.rooms.pop(oldest.code, None)
        for _ in range(20):
            code = _gen_code()
            if code not in self.rooms:
                break
        else:
            code = _gen_code(6)
        settings = settings or Settings()
        game = WhoAmIGame(settings=settings)
        room = Room(code=code, game=game, settings=settings)
        self.rooms[code] = room
        return room

    def get(self, code: str) -> Optional[Room]:
        return self.rooms.get((code or "").strip().upper())

    def join(self, room: Room, pid: str, name: str) -> Player:
        name = _clean_name(name)
        existing = room.players.get(pid)
        if existing:
            existing.name = name or existing.name
            existing.connected = True
            existing.last_seen = time.time()
            return existing
        if len(room.players) >= MAX_PLAYERS:
            raise MoveError(f"This room is full ({MAX_PLAYERS} players).")
        used = {p.color for p in room.players.values()}
        color = next((c for c in _PALETTE if c not in used), secrets.choice(_PALETTE))
        player = Player(
            id=pid,
            name=name or f"Player {len(room.players) + 1}",
            color=color,
            connected=True,
            is_host=(room.host_id is None),
        )
        if room.host_id is None:
            room.host_id = pid
        room.players[pid] = player
        return player

    def set_avatar(self, room: Room, pid: str, data_url: str) -> None:
        player = room.players.get(pid)
        if not player:
            raise MoveError("Unknown player.")
        try:
            ctype, raw = decode_data_url(data_url)
        except AvatarError as exc:
            raise MoveError(str(exc)) from exc
        player.avatar_ctype = ctype
        player.avatar_bytes = raw
        player.avatar_version += 1

    def clear_avatar(self, room: Room, pid: str) -> None:
        player = room.players.get(pid)
        if not player:
            raise MoveError("Unknown player.")
        player.avatar_ctype = ""
        player.avatar_bytes = b""
        player.avatar_version += 1

    def _ensure_host(self, room: Room) -> None:
        if room.host_id and room.players.get(room.host_id) \
                and room.players[room.host_id].connected:
            return
        for p in room.players.values():
            if p.connected:
                room.host_id = p.id
                for q in room.players.values():
                    q.is_host = (q.id == p.id)
                return

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

    def start_game(self, room: Room) -> None:
        connected = [p.id for p in room.players.values() if p.connected]
        n = len(connected)
        if n < MIN_PLAYERS:
            raise MoveError(f"Need at least {MIN_PLAYERS} connected players.")
        if n > MAX_PLAYERS:
            raise MoveError(f"Too many players (max {MAX_PLAYERS}).")
        room.game.start_game(connected, room.rng)


manager = Manager()
