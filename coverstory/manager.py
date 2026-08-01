"""Cover Story — room & connection manager."""

from __future__ import annotations

import asyncio
import random
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

from .game import (
    MAX_PLAYERS,
    MIN_PLAYERS,
    PHASE_PEEK,
    STATUS_PLAYING,
    CoverStoryGame,
    MoveError,
    Settings,
)
from .realtime import realtime

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_ROOM_TTL_EMPTY = 120
_ROOM_TTL_IDLE = 60 * 60 * 6
_MAX_ROOMS = 2000
_MAX_NAME = 24
_SOCKET_SEND_TIMEOUT = 2.0
SCALE_TARGET_ACTIVE_ROOMS = 1000
SCALE_TARGET_CONNECTED_PLAYERS = 10000

_PALETTE = [
    "#1746A2", "#E8455E", "#12A594", "#F5960B", "#7C3AED",
    "#0081A7", "#EF476F", "#2F7D3A", "#9B2242", "#5A554C",
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
    color: str = "#1746A2"
    is_host: bool = False
    connected: bool = False
    last_seen: float = field(default_factory=time.time)


@dataclass
class Room:
    code: str
    game: CoverStoryGame
    settings: Settings
    host_id: Optional[str] = None
    players: dict[str, Player] = field(default_factory=dict)
    sockets: dict = field(default_factory=dict)
    history: list[dict] = field(default_factory=list)
    scores: dict[str, int] = field(default_factory=dict)
    created: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    rng: random.Random = field(default_factory=random.Random)

    def touch(self) -> None:
        self.last_active = time.time()

    def public_players(self) -> list[dict]:
        now = time.time()
        out = []
        for p in self.players.values():
            out.append({
                "id": p.id,
                "name": p.name,
                "color": p.color,
                "isHost": p.is_host,
                "connected": p.connected,
                "idleSecs": max(0, int(now - p.last_seen)),
            })
        out.sort(key=lambda x: x["name"].lower())
        return out

    def state_for(self, pid: str) -> dict:
        g = self.game
        show_secrets = g.status == STATUS_PLAYING and g.phase == PHASE_PEEK and pid not in g.viewed
        game_view = g.view(pid, show_secrets=show_secrets)
        me = self.players.get(pid)
        return {
            "type": "state",
            "room": {
                "code": self.code,
                "players": self.public_players(),
                "settings": {
                    "timerSecs": self.settings.timer_secs,
                    "packIds": list(self.settings.pack_ids),
                    "customPackIds": list(self.settings.custom_pack_ids),
                    "spyCount": self.settings.spy_count,
                    "minPlayers": MIN_PLAYERS,
                    "maxPlayers": MAX_PLAYERS,
                },
                "game": game_view,
                "history": list(self.history[-10:]),
                "scores": dict(self.scores),
            },
            "you": {
                "id": pid,
                "name": me.name if me else "",
                "isHost": bool(me and me.is_host),
                "hasViewed": pid in g.viewed,
            },
        }


class Manager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self._ticker: Optional[asyncio.Task] = None
        self._subscriptions: dict[str, asyncio.Task] = {}
        self.realtime = realtime
        self.metrics: dict = {
            "roomsCreated": 0,
            "roundsStarted": 0,
            "roundsCompleted": 0,
            "maxPlayersInRound": 0,
            "timerSelections": {},
            "packSelections": {},
            "slowSocketDrops": 0,
            "broadcastErrors": 0,
            "timerExpiries": 0,
            "recentEvents": [],
        }

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
                self._drop_local_room(code)
                continue
            if now - room.last_active > _ROOM_TTL_IDLE:
                self._drop_local_room(code)
                continue
            async with room.lock:
                if await self._expire_timer_if_due(room, now):
                    room.touch()
                    await self.persist_room(room, publish=True)
                    await self._broadcast(room)

    async def _expire_timer_if_due(self, room: Room, now: float | None = None) -> bool:
        now = now if now is not None else time.time()
        if not room.game.timer_due(now):
            return False
        if not await self.realtime.acquire_timer_lock(room.code):
            return False
        if not room.game.expire_timer(now):
            return False
        self.metrics["timerExpiries"] += 1
        self.record_event("timer_expired", room, player_count=len(room.game.player_ids))
        return True

    def _drop_local_room(self, code: str) -> None:
        code = code.upper()
        self.rooms.pop(code, None)
        task = self._subscriptions.pop(code, None)
        if task and not task.done():
            task.cancel()

    def create_room(self, settings: Optional[Settings] = None) -> Room:
        if len(self.rooms) >= _MAX_ROOMS:
            oldest = min(self.rooms.values(), key=lambda r: r.last_active, default=None)
            if oldest:
                self._drop_local_room(oldest.code)
        for _ in range(20):
            code = _gen_code()
            if code not in self.rooms:
                break
        else:
            code = _gen_code(6)
        settings = settings or Settings()
        game = CoverStoryGame(settings=settings)
        room = Room(code=code, game=game, settings=settings)
        self.rooms[code] = room
        self.record_event("room_created", room, player_count=0)
        return room

    def get(self, code: str) -> Optional[Room]:
        return self.rooms.get((code or "").strip().upper())

    async def get_or_load(self, code: str) -> Optional[Room]:
        code = (code or "").strip().upper()
        room = self.get(code)
        if room is not None:
            return room
        snapshot = await self.realtime.load_room(code)
        if not snapshot:
            return None
        room = self.room_from_snapshot(snapshot)
        self.rooms[room.code] = room
        return room

    def room_snapshot(self, room: Room) -> dict:
        game = room.game
        return {
            "schema": 1,
            "code": room.code,
            "created": room.created,
            "lastActive": room.last_active,
            "hostId": room.host_id,
            "settings": {
                "timerSecs": room.settings.timer_secs,
                "packIds": list(room.settings.pack_ids),
                "customPackIds": list(room.settings.custom_pack_ids),
                "customLocations": list(room.settings.custom_locations),
                "spyCount": room.settings.spy_count,
            },
            "players": {
                pid: {
                    "id": player.id,
                    "name": player.name,
                    "color": player.color,
                    "isHost": player.is_host,
                    "connected": player.connected,
                    "lastSeen": player.last_seen,
                }
                for pid, player in room.players.items()
            },
            "game": {
                "status": game.status,
                "phase": game.phase,
                "playerIds": list(game.player_ids),
                "spyIndex": game.spy_index,
                "spyIndices": list(game.spy_indices),
                "location": dict(game.location),
                "coverByPid": dict(game.cover_by_pid),
                "viewed": list(game.viewed),
                "startedAt": game.started_at,
                "deadlineAt": game.deadline_at,
                "pausedAt": game.paused_at,
                "questionIndex": game.question_index,
                "result": dict(game.result),
            },
            "history": list(room.history[-25:]),
            "scores": dict(room.scores),
        }

    def room_from_snapshot(self, snapshot: dict) -> Room:
        settings_raw = snapshot.get("settings") or {}
        settings = Settings(
            timer_secs=int(settings_raw.get("timerSecs") if settings_raw.get("timerSecs") is not None else 420),
            pack_ids=list(settings_raw.get("packIds") or ["classic", "luxury", "chaos"]),
            custom_pack_ids=list(settings_raw.get("customPackIds") or []),
            custom_locations=list(settings_raw.get("customLocations") or []),
            spy_count=int(settings_raw.get("spyCount") or 1),
        )
        game_raw = snapshot.get("game") or {}
        game = CoverStoryGame(settings=settings)
        game.status = str(game_raw.get("status") or game.status)
        game.phase = str(game_raw.get("phase") or game.phase)
        game.player_ids = list(game_raw.get("playerIds") or [])
        game.spy_index = int(game_raw.get("spyIndex") if game_raw.get("spyIndex") is not None else -1)
        game.spy_indices = [int(i) for i in (game_raw.get("spyIndices") or [])]
        game.location = dict(game_raw.get("location") or {})
        game.cover_by_pid = dict(game_raw.get("coverByPid") or {})
        game.viewed = set(game_raw.get("viewed") or [])
        game.started_at = float(game_raw.get("startedAt") or 0)
        game.deadline_at = float(game_raw.get("deadlineAt") or 0)
        game.paused_at = float(game_raw.get("pausedAt") or 0)
        game.question_index = int(game_raw.get("questionIndex") or 0)
        game.result = dict(game_raw.get("result") or {})

        players = {}
        for pid, raw in (snapshot.get("players") or {}).items():
            if not isinstance(raw, dict):
                continue
            players[str(pid)] = Player(
                id=str(raw.get("id") or pid),
                name=str(raw.get("name") or ""),
                color=str(raw.get("color") or "#1746A2"),
                is_host=bool(raw.get("isHost")),
                connected=bool(raw.get("connected")),
                last_seen=float(raw.get("lastSeen") or time.time()),
            )
        return Room(
            code=str(snapshot.get("code") or "").upper(),
            game=game,
            settings=settings,
            host_id=snapshot.get("hostId"),
            players=players,
            history=list(snapshot.get("history") or []),
            scores={str(k): int(v) for k, v in (snapshot.get("scores") or {}).items()},
            created=float(snapshot.get("created") or time.time()),
            last_active=float(snapshot.get("lastActive") or time.time()),
        )

    def apply_snapshot(self, room: Room, snapshot: dict) -> None:
        hydrated = self.room_from_snapshot(snapshot)
        sockets = room.sockets
        lock = room.lock
        rng = room.rng
        room.game = hydrated.game
        room.settings = hydrated.settings
        room.host_id = hydrated.host_id
        room.players = hydrated.players
        room.history = hydrated.history
        room.scores = hydrated.scores
        room.created = hydrated.created
        room.last_active = hydrated.last_active
        room.sockets = sockets
        room.lock = lock
        room.rng = rng
        for pid in room.sockets:
            if pid in room.players:
                room.players[pid].connected = True
                room.players[pid].last_seen = time.time()

    async def persist_room(self, room: Room, *, publish: bool = False) -> None:
        has_conn = any(player.connected for player in room.players.values())
        ttl = _ROOM_TTL_IDLE if has_conn else _ROOM_TTL_EMPTY
        saved = await self.realtime.save_room(room.code, self.room_snapshot(room), ttl_secs=ttl)
        if publish and saved:
            await self.realtime.publish_room(room.code)

    def ensure_subscription(self, room: Room) -> None:
        if not self.realtime.enabled or room.code in self._subscriptions:
            return
        self._subscriptions[room.code] = asyncio.create_task(self._subscription_loop(room.code))

    async def _subscription_loop(self, code: str) -> None:
        async def _refresh(changed_code: str) -> None:
            snapshot = await self.realtime.load_room(changed_code)
            if not snapshot:
                return
            room = self.rooms.get(changed_code)
            if room is None:
                return
            async with room.lock:
                self.apply_snapshot(room, snapshot)
                await self._broadcast(room)

        await self.realtime.subscribe_room(code, _refresh)

    def join(self, room: Room, pid: str, name: str) -> Player:
        name = _clean_name(name)
        existing = room.players.get(pid)
        if existing is None and room.game.status == STATUS_PLAYING:
            raise MoveError("Round in progress — wait for the next one.")
        if existing:
            existing.name = name or existing.name
            if room.game.status == STATUS_PLAYING and existing.id not in room.game.player_ids:
                raise MoveError("This round already started — wait for the next round.")
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

    def _ensure_host(self, room: Room) -> None:
        if room.host_id and room.players.get(room.host_id) and room.players[room.host_id].connected:
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
                await asyncio.wait_for(ws.send_json(room.state_for(pid)), timeout=_SOCKET_SEND_TIMEOUT)
            except asyncio.TimeoutError:
                dead.append(pid)
                self.metrics["slowSocketDrops"] += 1
            except Exception:
                dead.append(pid)
                self.metrics["broadcastErrors"] += 1
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
        self.record_event("round_started", room, player_count=n)

    def kick(self, room: Room, target_id: str):
        target_id = (target_id or "").strip()
        target = room.players.get(target_id)
        if target is None:
            raise MoveError("Unknown player.")
        if target.is_host:
            raise MoveError("The host cannot be kicked.")
        if room.game.status == STATUS_PLAYING and target.connected:
            raise MoveError("Only disconnected players can be kicked mid-round.")
        room.game.remove_player(target_id)
        room.players.pop(target_id, None)
        return room.sockets.pop(target_id, None)

    def record_event(self, event: str, room: Room, *, player_count: int | None = None) -> None:
        metrics = self.metrics
        if event == "room_created":
            metrics["roomsCreated"] += 1
        elif event == "round_started":
            metrics["roundsStarted"] += 1
            metrics["maxPlayersInRound"] = max(metrics["maxPlayersInRound"], player_count or 0)
            timer_key = str(room.settings.timer_secs)
            metrics["timerSelections"][timer_key] = metrics["timerSelections"].get(timer_key, 0) + 1
            for pack_id in room.settings.pack_ids:
                metrics["packSelections"][pack_id] = metrics["packSelections"].get(pack_id, 0) + 1
            for pack_id in room.settings.custom_pack_ids:
                key = f"custom:{pack_id}"
                metrics["packSelections"][key] = metrics["packSelections"].get(key, 0) + 1
        elif event == "round_completed":
            metrics["roundsCompleted"] += 1
            self.award_scores(room)
            self.record_round_history(room, player_count or len(room.game.player_ids))
        snapshot = {
            "event": event,
            "roomCode": room.code,
            "playerCount": player_count if player_count is not None else len(room.players),
            "timerSecs": room.settings.timer_secs,
            "packIds": list(room.settings.pack_ids),
            "customPackIds": list(room.settings.custom_pack_ids),
            "at": int(time.time()),
        }
        metrics["recentEvents"].append(snapshot)
        metrics["recentEvents"] = metrics["recentEvents"][-50:]

    def record_round_history(self, room: Room, player_count: int) -> None:
        result = room.game.result or {}
        if not result:
            return
        summary = {
            "round": len(room.history) + 1,
            "winner": "crew" if result.get("crewWon") else "plant",
            "locationName": result.get("locationName", ""),
            "playerCount": player_count,
            "timerSecs": room.settings.timer_secs,
            "packIds": list(room.settings.pack_ids),
            "customPackIds": list(room.settings.custom_pack_ids),
            "completedAt": int(time.time()),
        }
        room.history.append(summary)
        room.history = room.history[-25:]

    def award_scores(self, room: Room) -> None:
        result = room.game.result or {}
        if not result:
            return
        spy_ids = set(room.game.spy_ids())
        for pid in room.game.player_ids:
            room.scores.setdefault(pid, 0)
        if result.get("crewWon"):
            for pid in room.game.player_ids:
                if pid not in spy_ids:
                    room.scores[pid] = room.scores.get(pid, 0) + 1
        else:
            for pid in spy_ids:
                room.scores[pid] = room.scores.get(pid, 0) + 2

    def stats(self) -> dict:
        active_players = sum(1 for room in self.rooms.values() for p in room.players.values() if p.connected)
        return {
            **self.metrics,
            "activeRooms": len(self.rooms),
            "activePlayers": active_players,
            "capacity": {
                "targetActiveRooms": SCALE_TARGET_ACTIVE_ROOMS,
                "targetConnectedPlayers": SCALE_TARGET_CONNECTED_PLAYERS,
                "roomUtilization": round(len(self.rooms) / SCALE_TARGET_ACTIVE_ROOMS, 4),
                "playerUtilization": round(active_players / SCALE_TARGET_CONNECTED_PLAYERS, 4),
                "maxRoomsPerProcess": _MAX_ROOMS,
            },
        }

    def debug_room(self, room: Room) -> dict:
        return {
            "code": room.code,
            "status": room.game.status,
            "phase": room.game.phase,
            "created": int(room.created),
            "lastActive": int(room.last_active),
            "playerCount": len(room.players),
            "connectedPlayers": sum(1 for p in room.players.values() if p.connected),
            "settings": {
                "timerSecs": room.settings.timer_secs,
                "packIds": list(room.settings.pack_ids),
                "customPackIds": list(room.settings.custom_pack_ids),
                "spyCount": room.settings.spy_count,
            },
            "historyCount": len(room.history),
            "scoreCount": len(room.scores),
            "hasSockets": bool(room.sockets),
        }


manager = Manager()
