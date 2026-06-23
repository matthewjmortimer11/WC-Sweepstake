"""Dial — room & connection manager."""

from __future__ import annotations

import asyncio
import random
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

from .game import (
    MODE_FFA,
    MODE_TEAMS,
    PHASE_GUESS,
    PHASE_PSYCHIC,
    PHASE_REVEAL,
    ROLE_GUESSER,
    ROLE_PSYCHIC,
    ROLE_SPECTATOR,
    STATUS_ENDED,
    STATUS_LOBBY,
    STATUS_PLAYING,
    TEAM_0,
    TEAM_1,
    TEAM_UNASSIGNED,
    DialGame,
    MoveError,
    Settings,
    clean_team_name,
)

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_ROOM_TTL_EMPTY = 120
_ROOM_TTL_IDLE = 60 * 60 * 6
_MAX_ROOMS = 2000
_MAX_PLAYERS = 50
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
    team: str = TEAM_UNASSIGNED
    role: str = ROLE_GUESSER
    color: str = "#60a5fa"
    is_host: bool = False
    connected: bool = False
    last_seen: float = field(default_factory=time.time)


@dataclass
class Room:
    code: str
    game: DialGame
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

    def team_members(self, team: str) -> list[Player]:
        return [p for p in self.players.values() if p.team == team and p.connected]

    def active_team_players(self) -> list[Player]:
        idx = self.game.active_team
        team = TEAM_0 if idx == 0 else TEAM_1
        return self.team_members(team)

    def guessers_for_round(self) -> list[str]:
        g = self.game
        psychic = g.psychic_id
        if g.settings.mode == MODE_TEAMS:
            team = TEAM_0 if g.active_team == 0 else TEAM_1
            return [
                p.id for p in self.players.values()
                if p.team == team and p.id != psychic and p.role != ROLE_SPECTATOR
            ]
        return [
            p.id for p in self.players.values()
            if p.id != psychic and p.role != ROLE_SPECTATOR
        ]

    def pick_team_psychic(self) -> str:
        """Rotate psychic among active team members."""
        g = self.game
        team = TEAM_0 if g.active_team == 0 else TEAM_1
        members = [
            p.id for p in self.players.values()
            if p.team == team and p.connected and p.role != ROLE_SPECTATOR
        ]
        if not members:
            members = [p.id for p in self.players.values() if p.team == team]
        if not members:
            raise MoveError("The active team has no players.")
        if not g.psychic_order:
            g.psychic_order = list(members)
            self.rng.shuffle(g.psychic_order)
        # Pick next member from rotation who is on this team
        for _ in range(len(g.psychic_order) + 1):
            idx = (g.psychic_index + _) % max(1, len(g.psychic_order))
            pid = g.psychic_order[idx % len(g.psychic_order)] if g.psychic_order else members[0]
            if pid in members:
                g.psychic_index = idx + 1
                return pid
        return members[g.round_no % len(members)]

    def public_players(self) -> list[dict]:
        out = []
        for p in self.players.values():
            out.append({
                "id": p.id,
                "name": p.name,
                "team": p.team,
                "role": p.role,
                "color": p.color,
                "isHost": p.is_host,
                "connected": p.connected,
            })
        order = {TEAM_0: 0, TEAM_1: 1, TEAM_UNASSIGNED: 2}
        out.sort(key=lambda x: (order.get(x["team"], 3), x["name"].lower()))
        return out

    def _live_guesses_for(self, pid: str) -> dict[str, int]:
        g = self.game
        if g.phase != PHASE_GUESS:
            return {}
        me = self.players.get(pid)
        if not me:
            return {}
        out: dict[str, int] = {}
        for guesser_id, val in g.guesses.items():
            if guesser_id == pid:
                continue
            other = self.players.get(guesser_id)
            if not other:
                continue
            if g.settings.mode == MODE_TEAMS:
                if me.team == other.team and me.team in (TEAM_0, TEAM_1):
                    out[guesser_id] = val
            # FFA: no live opponent guesses until reveal
        return out

    def state_for(self, pid: str) -> dict:
        g = self.game
        me = self.players.get(pid)
        is_psychic = pid == g.psychic_id
        show_target = is_psychic and g.phase == PHASE_PSYCHIC
        if g.phase == PHASE_REVEAL:
            show_target = True
        guesser_ids = self.guessers_for_round()
        game_view = g.view(
            pid=pid,
            show_target=show_target,
            guesser_ids=guesser_ids if g.phase == PHASE_REVEAL else None,
        )
        if g.phase == PHASE_REVEAL:
            game_view["guesses"] = {
                k: g.guesses[k] for k in guesser_ids if k in g.guesses
            }
        elif g.phase == PHASE_GUESS:
            game_view["liveGuesses"] = self._live_guesses_for(pid)
            if g.phase == PHASE_GUESS and g.status == STATUS_PLAYING:
                game_view["guesserIds"] = guesser_ids
        role = ROLE_SPECTATOR
        if me:
            if is_psychic:
                role = ROLE_PSYCHIC
            elif pid in guesser_ids:
                role = ROLE_GUESSER
            elif me.role == ROLE_SPECTATOR:
                role = ROLE_SPECTATOR
        return {
            "type": "state",
            "room": {
                "code": self.code,
                "players": self.public_players(),
                "settings": {
                    "mode": self.settings.mode,
                    "targetScore": self.settings.target_score,
                    "teamNames": list(self.settings.team_names),
                },
                "game": game_view,
            },
            "you": {
                "id": pid,
                "name": me.name if me else "",
                "team": me.team if me else TEAM_UNASSIGNED,
                "role": role,
                "isHost": bool(me and me.is_host),
                "isPsychic": is_psychic,
            },
        }


class Manager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self._ticker: Optional[asyncio.Task] = None

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
        game = DialGame(settings=settings)
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
        if len(room.players) >= _MAX_PLAYERS:
            raise MoveError("This room is full.")
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

    def _validate_start(self, room: Room) -> None:
        g = room.game
        connected = [p for p in room.players.values() if p.connected]
        if len(connected) < 2:
            raise MoveError("Need at least two players.")
        if g.settings.mode == MODE_TEAMS:
            t0 = sum(1 for p in connected if p.team == TEAM_0)
            t1 = sum(1 for p in connected if p.team == TEAM_1)
            if t0 < 1 or t1 < 1:
                raise MoveError("Both teams need at least one player.")
        elif g.settings.mode == MODE_FFA:
            if len(connected) < 2:
                raise MoveError("Need at least two players for free-for-all.")

    def start_game(self, room: Room) -> None:
        self._validate_start(room)
        player_ids = [p.id for p in room.players.values() if p.connected]
        room.game.start_game(player_ids, room.rng)
        if room.game.settings.mode == MODE_TEAMS:
            room.game.psychic_id = room.pick_team_psychic()

    def maybe_advance_guess(self, room: Room) -> bool:
        """Auto-reveal when all guessers have locked in."""
        g = room.game
        if g.status != STATUS_PLAYING or g.phase != PHASE_GUESS:
            return False
        guessers = room.guessers_for_round()
        if not g.all_guessers_locked(guessers):
            return False
        g.score_round(guessers)
        return True


manager = Manager()
