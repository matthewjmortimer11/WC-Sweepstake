"""The Cursed Throne — room & connection manager."""

from __future__ import annotations

import asyncio
import random
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

from .game import (
    STATUS_LOBBY,
    STATUS_PLAY,
    STATUS_SETUP,
    CursedThroneGame,
    MoveError,
)
from . import data as D

MIN_PLAYERS = D.MIN_PLAYERS
MAX_PLAYERS = D.MAX_PLAYERS

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_ROOM_TTL_EMPTY = 900
_ROOM_TTL_IDLE = 60 * 60 * 6
_MAX_ROOMS = 500
_MAX_NAME = 24

_PALETTE = [
    "#8c2f23", "#a8842c", "#3f6b4a", "#3a5a78", "#6e4a86", "#9c5a2a",
]


def _gen_code(n: int = 4) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(n))


def _clean_name(name: str) -> str:
    name = (name or "").strip()
    name = " ".join(name.split())
    name = "".join(ch for ch in name if ch.isprintable())
    return name[:_MAX_NAME]


@dataclass
class Spectator:
    id: str
    name: str
    connected: bool = False
    last_seen: float = field(default_factory=time.time)


@dataclass
class Player:
    id: str
    name: str
    color: str = "#8c2f23"
    is_host: bool = False
    is_bot: bool = False
    connected: bool = False
    last_seen: float = field(default_factory=time.time)


@dataclass
class Room:
    code: str
    game: CursedThroneGame
    host_id: Optional[str] = None
    players: dict = field(default_factory=dict)
    spectators: dict = field(default_factory=dict)
    sockets: dict = field(default_factory=dict)
    spectator_sockets: dict = field(default_factory=dict)
    allow_spectators: bool = True
    created: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    rng: random.Random = field(default_factory=random.Random)

    def touch(self) -> None:
        self.last_active = time.time()

    def public_players(self) -> list[dict]:
        out = []
        for p in self.players.values():
            out.append({
                "id": p.id,
                "name": p.name,
                "color": p.color,
                "isHost": p.is_host,
                "isBot": p.is_bot,
                "connected": p.connected,
            })
        out.sort(key=lambda x: (not x["isHost"], x["name"].lower()))
        return out

    def public_spectators(self) -> list[dict]:
        return [
            {"id": s.id, "name": s.name, "connected": s.connected}
            for s in sorted(self.spectators.values(), key=lambda x: x.name.lower())
        ]

    def state_for(self, pid: str) -> dict:
        me = self.players.get(pid)
        g = self.game
        client = g.to_client_state(pid) if g.status in (STATUS_SETUP, STATUS_PLAY) or g.winner else None
        return {
            "type": "state",
            "room": {
                "code": self.code,
                "players": self.public_players(),
                "spectators": self.public_spectators(),
                "settings": {
                    "minPlayers": D.MIN_PLAYERS,
                    "maxPlayers": D.MAX_PLAYERS,
                    "playerCount": g.player_count,
                    "balance": dict(g.balance),
                    "allowSpectators": self.allow_spectators,
                },
                "game": g.view(pid),
                "clientState": client,
            },
            "you": {
                "id": pid,
                "name": me.name if me else "",
                "isHost": bool(me and me.is_host),
                "isSpectator": False,
            },
        }

    def spectator_state_for(self, sid: str) -> dict:
        spec = self.spectators.get(sid)
        g = self.game
        client = g.to_client_state("") if g.status in (STATUS_SETUP, STATUS_PLAY) or g.winner else None
        return {
            "type": "state",
            "room": {
                "code": self.code,
                "players": self.public_players(),
                "spectators": self.public_spectators(),
                "settings": {
                    "minPlayers": D.MIN_PLAYERS,
                    "maxPlayers": D.MAX_PLAYERS,
                    "playerCount": g.player_count,
                    "balance": dict(g.balance),
                    "allowSpectators": self.allow_spectators,
                },
                "game": g.view(""),
                "clientState": client,
            },
            "you": {
                "id": sid,
                "name": spec.name if spec else "",
                "isHost": False,
                "isSpectator": True,
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
            has_conn = (
                any(p.connected for p in room.players.values())
                or any(s.connected for s in room.spectators.values())
            )
            if not has_conn and now - room.last_active > _ROOM_TTL_EMPTY:
                self.rooms.pop(code, None)
                continue
            if now - room.last_active > _ROOM_TTL_IDLE:
                self.rooms.pop(code, None)

    def create_room(self) -> Room:
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
        game = CursedThroneGame()
        room = Room(code=code, game=game)
        self.rooms[code] = room
        return room

    def get(self, code: str) -> Optional[Room]:
        return self.rooms.get((code or "").strip().upper())

    def join(self, room: Room, pid: str, name: str) -> Player:
        name = _clean_name(name)
        g = room.game
        existing = room.players.get(pid)
        if existing:
            existing.name = name or existing.name
            existing.connected = True
            existing.last_seen = time.time()
            return existing
        # Rejoin mid-game with the same device id
        if g.status in (STATUS_SETUP, STATUS_PLAY) and pid in g.player_ids:
            gp = g.player_by_id(pid)
            seat_name = gp.name if gp else (name or "Player")
            used = {p.color for p in room.players.values()}
            color = next((c for c in _PALETTE if c not in used), secrets.choice(_PALETTE))
            player = Player(
                id=pid,
                name=seat_name,
                color=color,
                connected=True,
                is_bot=bool(gp and gp.is_bot),
                is_host=(room.host_id == pid),
            )
            room.players[pid] = player
            return player
        if g.status == STATUS_PLAY:
            raise MoveError("Game in progress — reconnect with the same device or wait for a new game.")
        if g.status == STATUS_SETUP:
            raise MoveError("Setup in progress — reconnect with the same device.")
        if len(room.players) >= g.player_count and g.status == STATUS_LOBBY:
            raise MoveError(f"This room is full ({g.player_count} seats).")
        if len(room.players) >= MAX_PLAYERS:
            raise MoveError(f"Room is full (max {MAX_PLAYERS}).")
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

    def join_spectator(self, room: Room, sid: str, name: str) -> Spectator:
        if not room.allow_spectators:
            raise MoveError("Spectators are not allowed in this room.")
        name = _clean_name(name) or "Observer"
        existing = room.spectators.get(sid)
        if existing:
            existing.name = name or existing.name
            existing.connected = True
            existing.last_seen = time.time()
            return existing
        if len(room.spectators) >= 20:
            raise MoveError("Too many spectators.")
        spec = Spectator(id=sid, name=name, connected=True)
        room.spectators[sid] = spec
        return spec

    def _ensure_host(self, room: Room) -> None:
        if room.host_id and room.players.get(room.host_id) and room.players[room.host_id].connected:
            return
        for p in room.players.values():
            if p.connected:
                room.host_id = p.id
                for q in room.players.values():
                    q.is_host = q.id == p.id
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
        dead_spec = []
        for sid, ws in list(room.spectator_sockets.items()):
            try:
                await ws.send_json(room.spectator_state_for(sid))
            except Exception:
                dead_spec.append(sid)
        for sid in dead_spec:
            room.spectator_sockets.pop(sid, None)
            if sid in room.spectators:
                room.spectators[sid].connected = False

    def connected_seats(self, room: Room) -> list[tuple[str, str, bool]]:
        seats = []
        for p in sorted(room.players.values(), key=lambda x: (x.is_bot, x.name.lower())):
            if p.connected or p.is_bot:
                seats.append((p.id, p.name, p.is_bot))
        return seats

    def kick_player(self, room: Room, actor_id: str, target_id: str) -> None:
        if room.host_id != actor_id:
            raise MoveError("Only the host can remove a player.")
        g = room.game
        if g.status != STATUS_LOBBY:
            raise MoveError("Can only remove players before dealing.")
        if target_id == actor_id:
            raise MoveError("Cannot remove yourself.")
        target = room.players.pop(target_id, None)
        if not target:
            raise MoveError("Player not found.")
        room.sockets.pop(target_id, None)

    def fill_bots(self, room: Room) -> None:
        g = room.game
        if g.status != STATUS_LOBBY:
            raise MoveError("Can only add bots before dealing.")
        while len(room.players) < g.player_count:
            n = sum(1 for p in room.players.values() if p.is_bot) + 1
            bid = f"bot-{secrets.token_hex(4)}"
            room.players[bid] = Player(
                id=bid,
                name=f"Bot {n}",
                color=secrets.choice(_PALETTE),
                connected=True,
                is_bot=True,
            )

    def deal_setup(self, room: Room) -> None:
        g = room.game
        if g.status != STATUS_LOBBY:
            raise MoveError("Setup already started.")
        seats = self.connected_seats(room)
        n = g.player_count
        if len(seats) < n:
            raise MoveError(f"Need {n} connected players (have {len(seats)}).")
        g.assign_seats(seats[:n])
        g.deal_setup(room.rng)

    def begin_game(self, room: Room, first_mode: str, first_index: int) -> None:
        g = room.game
        g.begin_game(room.rng, first_mode, first_index)


manager = Manager()
