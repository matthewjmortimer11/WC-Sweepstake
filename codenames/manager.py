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
from datetime import datetime, timezone
from typing import Optional

from . import store
from .game import (
    BLUE,
    RED,
    STATUS_ENDED,
    STATUS_LOBBY,
    STATUS_PLAYING,
    Game,
    MoveError,
    Settings,
)
from .words import PACKS, words_for, words_for_packs, normalize_pack_ids, pack_label

# Avoid ambiguous characters in shareable room codes.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_ROOM_TTL_EMPTY = 120          # seconds an empty room lingers before reaping
_ROOM_TTL_IDLE = 60 * 60 * 6   # hard cap on a room's lifetime since last activity
_MAX_ROOMS = 2000
_MAX_PLAYERS = 50
_MAX_NAME = 24
_MAX_CHAT = 300

_ALLOWED_SIZES = {4, 5, 6}
# Turn timer is optional (0 = off) and otherwise a free value on a slider,
# clamped to this inclusive range and snapped to the step.
_TIMER_MIN = 15
_TIMER_MAX = 300
_TIMER_STEP = 5

# Synthetic players for dev/solo testing (id prefix devbot:).
DEV_BOT_PREFIX = "devbot:"
_DEV_BOT_SLOTS = (
    ("devbot:red:spymaster", "Bot Red SM", RED, "spymaster"),
    ("devbot:red:operative", "Bot Red OP", RED, "operative"),
    ("devbot:blue:spymaster", "Bot Blue SM", BLUE, "spymaster"),
    ("devbot:blue:operative", "Bot Blue OP", BLUE, "operative"),
)


def is_dev_bot(pid: str) -> bool:
    return (pid or "").startswith(DEV_BOT_PREFIX)


def _human_players(room: Room) -> list[Player]:
    return [p for p in room.players.values() if not is_dev_bot(p.id)]


def _slot_filled(players: list[Player], team: str, role: str) -> bool:
    if role == "spymaster":
        return any(p.team == team and p.role == "spymaster" for p in players)
    return any(p.team == team and p.role == "operative" for p in players)


def ensure_dev_bots(room: Room) -> None:
    """Fill empty team slots with bots when dev mode is on."""
    remove_dev_bots(room)
    if not room.settings.dev_mode:
        return
    humans = _human_players(room)
    for bid, name, team, role in _DEV_BOT_SLOTS:
        if _slot_filled(humans, team, role):
            continue
        room.players[bid] = Player(
            id=bid,
            name=name,
            team=team,
            role=role,
            color="#6b7280",
            connected=False,
            is_host=False,
        )


def remove_dev_bots(room: Room) -> None:
    for pid in list(room.players.keys()):
        if is_dev_bot(pid):
            room.players.pop(pid, None)
            room.sockets.pop(pid, None)


def clamp_timer(seconds: int) -> int:
    """Validate/snap a turn-timer value. 0 means 'off'; anything else is
    clamped to [_TIMER_MIN, _TIMER_MAX] and snapped to _TIMER_STEP."""
    if seconds <= 0:
        return 0
    seconds = max(_TIMER_MIN, min(_TIMER_MAX, seconds))
    return int(round(seconds / _TIMER_STEP) * _TIMER_STEP)


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
    cipher_user_id: Optional[str] = None


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
    # True once a completed game has been written to the store (one record per
    # game). Reset when a new round starts.
    persisted: bool = False

    def touch(self) -> None:
        self.last_active = time.time()

    # ── snapshots ──────────────────────────────────────────────────────────────
    def public_players(self) -> list[dict]:
        out = []
        for p in self.players.values():
            out.append({
                "id": p.id, "name": p.name, "team": p.team, "role": p.role,
                "color": p.color, "isHost": p.is_host, "connected": p.connected,
                "isBot": is_dev_bot(p.id),
            })
        # Stable, readable ordering: red, blue, spectators; spymasters first.
        order = {"red": 0, "blue": 1, "spectator": 2}
        out.sort(key=lambda x: (order.get(x["team"], 3),
                                0 if x["role"] == "spymaster" else 1,
                                x["name"].lower()))
        return out

    def state_for(self, pid: str) -> dict:
        me = self.players.get(pid)
        reveal = bool(
            me and me.team in (RED, BLUE) and (
                me.role == "spymaster"
                or (self.settings.dev_mode and me.is_host)
            )
        )
        return {
            "type": "state",
            "room": {
                "code": self.code,
                "players": self.public_players(),
                "settings": {
                    "boardSize": self.settings.board_size,
                    "packId": self.settings.pack_id,
                    "packIds": list(self.settings.pack_ids or ["classic"]),
                    "packName": self.settings.pack_name,
                    "turnSeconds": self.settings.turn_seconds,
                    "assassins": self.settings.assassins,
                    "hasCustom": bool(self.settings.custom_words),
                    "customWords": ", ".join(self.settings.custom_words or []),
                    "houseRules": {
                        "compoundClues": self.settings.house_rules.compound_clues,
                        "noBoardWords": self.settings.house_rules.no_board_words,
                        "rhymesBanned": self.settings.house_rules.rhymes_banned,
                    },
                    "devMode": self.settings.dev_mode,
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
        settings = Settings(
            pack_ids=["classic"], pack_id="classic",
            pack_name=PACKS["classic"]["name"],
        )
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

    def join(self, room: Room, pid: str, name: str,
             cipher_user_id: Optional[str] = None) -> Player:
        name = _clean_name(name)
        existing = room.players.get(pid)
        if existing:
            existing.name = name or existing.name
            existing.connected = True
            existing.last_seen = time.time()
            if cipher_user_id:
                existing.cipher_user_id = cipher_user_id
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
            cipher_user_id=cipher_user_id,
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
        # Persist a completed game once (best-effort, off the hot path). The
        # snapshot is built here under the room lock so the background write is
        # race-free even if the room is reset immediately afterwards.
        if room.game.status == STATUS_ENDED and not room.persisted:
            room.persisted = True
            if store.ENABLED and not room.settings.dev_mode:
                snapshot = _match_snapshot(room)
                asyncio.create_task(store.save_match(snapshot))


def _match_snapshot(room: Room) -> dict:
    """A plain, race-free record of a finished game for persistence."""
    import uuid

    g = room.game
    s = room.settings
    players = [
        {"pid": p.id, "name": p.name, "team": p.team, "role": p.role,
         "won": (p.team == g.winner), "user_id": p.cipher_user_id}
        for p in room.players.values()
        if p.team in (RED, BLUE) and not is_dev_bot(p.id)
    ]
    return {
        "id": uuid.uuid4().hex,
        "room_code": room.code,
        "created_at": datetime.fromtimestamp(room.created, tz=timezone.utc),
        "ended_at": datetime.now(timezone.utc),
        "board_size": s.board_size,
        "pack_id": s.pack_id,
        "pack_ids": list(s.pack_ids or ["classic"]),
        "pack_name": s.pack_name,
        "custom_words": bool(s.custom_words),
        "turn_seconds": s.turn_seconds,
        "assassins": s.assassins,
        "starting_team": g.starting_team,
        "winner": g.winner,
        "win_reason": g.win_reason,
        "rounds": g.round_no,
        "red_remaining": g.remaining(RED),
        "blue_remaining": g.remaining(BLUE),
        "players": players,
    }


def _clean_name(name: str) -> str:
    name = (name or "").strip()
    # Collapse whitespace and strip control characters.
    name = " ".join(name.split())
    name = "".join(ch for ch in name if ch.isprintable())
    return name[:_MAX_NAME]


# Singleton used by the router.
manager = Manager()
