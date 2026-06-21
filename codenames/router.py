"""
Cipher — FastAPI router.

Mounted into the main Wheesht app. Serves the game's single-page client and the
WebSocket endpoint that powers real-time play. The HTTP surface is intentionally
tiny — almost everything happens over the socket.

Routes
    GET  /play                     → the game SPA
    GET  /play/api/packs           → built-in word-pack metadata
    POST /play/api/rooms           → create a room, returns its code
    GET  /play/assets/{file}       → JS/CSS for the SPA
    WS   /play/ws/{code}           → live game socket
"""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from . import store
from .game import BLUE, RED, STATUS_LOBBY, MAX_ASSASSINS, MoveError, Settings, HouseRules
from .manager import (
    _ALLOWED_SIZES,
    _MAX_CHAT,
    _TIMER_MAX,
    _TIMER_MIN,
    _TIMER_STEP,
    _clean_name,
    clamp_timer,
    manager,
)
from .words import PACKS, pack_meta, words_for, words_for_packs, normalize_pack_ids, pack_label

router = APIRouter()

_DIR = Path(__file__).resolve().parent
_TEMPLATE = Path("templates/cipher.html")
_ASSETS = Path("static/codenames")
_MEDIA = {".js": "application/javascript", ".css": "text/css",
          ".svg": "image/svg+xml", ".png": "image/png"}

_REACTIONS = {"🎉", "😂", "😱", "🔥", "🧠", "💀", "👏", "🤔", "😎", "❤️"}


# ── HTTP ──────────────────────────────────────────────────────────────────────
# A CSP scoped to just the game page. It explicitly allows same-origin
# WebSockets (ws:/wss:) — some browsers don't treat connect-src 'self' as
# covering the WS scheme — plus Google Fonts, while staying strict elsewhere.
_PLAY_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self' ws: wss:; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; "
    "frame-ancestors 'none'"
)


@router.get("/play", response_class=HTMLResponse)
async def play_page() -> HTMLResponse:
    if not _TEMPLATE.is_file():
        raise HTTPException(status_code=404)
    return HTMLResponse(
        _TEMPLATE.read_text(encoding="utf-8"),
        headers={"Content-Security-Policy": _PLAY_CSP},
    )


@router.get("/play/api/packs")
async def packs() -> JSONResponse:
    return JSONResponse({
        "packs": pack_meta(),
        "sizes": sorted(_ALLOWED_SIZES),
        "timer": {"min": _TIMER_MIN, "max": _TIMER_MAX, "step": _TIMER_STEP},
    })


@router.get("/play/api/stats")
async def stats() -> JSONResponse:
    """Aggregate match stats + recent games. ``{"enabled": false}`` when no
    database is configured (the game still runs fully in-memory)."""
    return JSONResponse(await store.get_stats())


@router.post("/play/api/rooms")
async def create_room(request: Request) -> JSONResponse:
    manager.start()
    # An optional packId lets the home screen spin up a room pre-tuned to a
    # mode (e.g. "afterdark") so the choice is made upfront, not buried in
    # settings. Unknown/missing values fall back to the classic default.
    pack_id = "classic"
    pack_ids: list[str] | None = None
    try:
        body = await request.json()
        if isinstance(body, dict):
            raw_ids = body.get("packIds")
            if isinstance(raw_ids, list) and raw_ids:
                pack_ids = normalize_pack_ids([str(x) for x in raw_ids])
            elif str(body.get("packId", "")) in PACKS:
                pack_id = str(body["packId"])
                pack_ids = normalize_pack_ids([pack_id])
    except Exception:
        pass
    room = manager.create_room()
    if pack_ids:
        room.settings.pack_ids = pack_ids
        room.settings.pack_id = pack_ids[0]
        room.settings.pack_name = pack_label(pack_ids)
        room.game.settings = room.settings
    elif pack_id != "classic":
        ids = normalize_pack_ids([pack_id])
        room.settings.pack_ids = ids
        room.settings.pack_id = ids[0]
        room.settings.pack_name = pack_label(ids)
        room.game.settings = room.settings
    return JSONResponse({
        "code": room.code,
        "packId": room.settings.pack_id,
        "packIds": room.settings.pack_ids,
    })


@router.get("/play/assets/{filename:path}")
async def assets(filename: str) -> FileResponse:
    root = _ASSETS.resolve()
    path = (_ASSETS / filename).resolve()
    if not path.is_file() or root not in path.parents:
        raise HTTPException(status_code=404)
    media = _MEDIA.get(path.suffix, "application/octet-stream")
    return FileResponse(path, media_type=media)


# ── settings parsing ───────────────────────────────────────────────────────────
def _parse_house_rules(raw, current: HouseRules) -> HouseRules:
    if not isinstance(raw, dict):
        return current
    return HouseRules(
        compound_clues=bool(raw.get("compoundClues", current.compound_clues)),
        no_board_words=bool(raw.get("noBoardWords", current.no_board_words)),
        rhymes_banned=bool(raw.get("rhymesBanned", current.rhymes_banned)),
    )


def _parse_pack_ids(payload: dict, current: Settings) -> list[str]:
    raw = payload.get("packIds")
    if isinstance(raw, list) and raw:
        return normalize_pack_ids([str(x) for x in raw])
    legacy = str(payload.get("packId", "")).strip()
    if legacy and legacy in PACKS:
        return normalize_pack_ids([legacy])
    return list(current.pack_ids or ["classic"])


def _build_settings(payload: dict, current: Settings) -> Settings:
    size = int(payload.get("boardSize", current.board_size))
    if size not in _ALLOWED_SIZES:
        raise MoveError("Unsupported board size.")
    try:
        timer = clamp_timer(int(payload.get("turnSeconds", current.turn_seconds)))
    except (TypeError, ValueError):
        raise MoveError("Unsupported timer.")
    assassins = int(payload.get("assassins", current.assassins))
    if assassins < 1 or assassins > MAX_ASSASSINS:
        raise MoveError(f"Pick 1–{MAX_ASSASSINS} assassins.")

    custom_raw = payload.get("customWords")
    custom = None
    if isinstance(custom_raw, str) and custom_raw.strip():
        tokens = (t.strip() for t in custom_raw.replace("\n", ",").split(","))
        custom = [t for t in dict.fromkeys(tokens) if t][:400]
        if len(custom) < size * size:
            raise MoveError(
                f"Custom list needs ≥ {size * size} unique words "
                f"(got {len(custom)})."
            )
    elif isinstance(custom_raw, list):
        custom = [str(t).strip() for t in custom_raw if str(t).strip()][:400]
        if custom and len(custom) < size * size:
            raise MoveError(f"Custom list needs ≥ {size * size} unique words.")
        custom = custom or None

    pack_ids = _parse_pack_ids(payload, current)
    pack_id = pack_ids[0]
    pack_name = "Custom" if custom else pack_label(pack_ids)
    house_rules = _parse_house_rules(payload.get("houseRules"), current.house_rules)

    return Settings(
        board_size=size, pack_ids=pack_ids, pack_id=pack_id, custom_words=custom,
        turn_seconds=timer, assassins=assassins, pack_name=pack_name,
        house_rules=house_rules,
    )


def _words_pool(settings: Settings) -> list[str]:
    if settings.custom_words:
        return list(settings.custom_words)
    return words_for_packs(settings.pack_ids)


# ── WebSocket ───────────────────────────────────────────────────────────────────
@router.websocket("/play/ws/{code}")
async def game_socket(ws: WebSocket, code: str) -> None:
    manager.start()
    room = manager.get(code)
    if room is None:
        await ws.accept()
        await ws.send_json({"type": "fatal", "message": "Room not found."})
        await ws.close()
        return

    await ws.accept()
    pid = (ws.query_params.get("pid") or "").strip()[:64] or uuid.uuid4().hex
    name = ws.query_params.get("name") or ""

    async with room.lock:
        try:
            player = manager.join(room, pid, name)
        except MoveError as exc:
            await ws.send_json({"type": "fatal", "message": str(exc)})
            await ws.close()
            return
        old = room.sockets.get(pid)
        room.sockets[pid] = ws
        room.touch()
        await ws.send_json({"type": "hello", "pid": pid, "code": room.code})
        await manager._broadcast(room)
    if old is not None:
        try:
            await old.close()
        except Exception:
            pass

    try:
        while True:
            msg = await ws.receive_json()
            await _handle(room, pid, msg)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with room.lock:
            if room.sockets.get(pid) is ws:
                room.sockets.pop(pid, None)
            if pid in room.players:
                room.players[pid].connected = False
                room.players[pid].last_seen = time.time()
            manager._ensure_host(room)
            room.touch()
            await manager._broadcast(room)


async def _handle(room, pid: str, msg: dict) -> None:
    if not isinstance(msg, dict):
        return
    mtype = msg.get("type")
    async with room.lock:
        player = room.players.get(pid)
        if player is None:
            return
        try:
            changed = await _dispatch(room, player, mtype, msg)
        except MoveError as exc:
            ws = room.sockets.get(pid)
            if ws:
                await ws.send_json({"type": "error", "message": str(exc)})
            return
        if changed:
            room.touch()
            await manager._broadcast(room)


async def _dispatch(room, player, mtype: str, msg: dict) -> bool:
    """Apply a single client action. Returns True if a broadcast is warranted."""
    game = room.game

    if mtype == "rename":
        player.name = _clean_name(msg.get("name", "")) or player.name
        return True

    if mtype == "setTeam":
        if game.status == "playing":
            raise MoveError("You can't switch teams mid-game.")
        team = msg.get("team")
        if team not in (RED, BLUE, "spectator"):
            raise MoveError("Unknown team.")
        player.team = team
        if team == "spectator":
            player.role = "operative"
        return True

    if mtype == "setRole":
        if game.status == "playing":
            raise MoveError("Roles are locked once the game starts.")
        role = msg.get("role")
        if role not in ("spymaster", "operative"):
            raise MoveError("Unknown role.")
        if role == "spymaster" and player.team not in (RED, BLUE):
            raise MoveError("Join a team before becoming spymaster.")
        player.role = role
        return True

    if mtype == "settings":
        if not player.is_host:
            raise MoveError("Only the host can change settings.")
        if game.status == "playing":
            raise MoveError("Finish or reset the round to change settings.")
        room.settings = _build_settings(msg.get("settings", {}), room.settings)
        game.settings = room.settings
        return True

    if mtype == "start" or mtype == "newGame":
        if not player.is_host:
            raise MoveError("Only the host can start the game.")
        if "settings" in msg:
            room.settings = _build_settings(msg["settings"], room.settings)
            game.settings = room.settings
        _validate_teams(room)
        game.settings = room.settings
        game.new_round(_words_pool(room.settings))
        room.persisted = False  # this new game can be persisted when it ends
        return True

    if mtype == "rematch":
        if not player.is_host:
            raise MoveError("Only the host can start a rematch.")
        if game.status != "ended":
            raise MoveError("The game hasn't ended yet.")
        _validate_teams(room)
        game.new_round(_words_pool(room.settings))
        room.persisted = False
        return True

    if mtype == "reset":
        if not player.is_host:
            raise MoveError("Only the host can reset.")
        from .game import Game
        room.game = Game(settings=room.settings)
        room.persisted = False
        return True

    if mtype == "clue":
        _require_active_spymaster(room, player)
        count = msg.get("count", 0)
        try:
            count = int(count)
        except (TypeError, ValueError):
            raise MoveError("Clue count must be a number.")
        game.give_clue(player.team, str(msg.get("word", "")), count)
        return True

    if mtype == "guess":
        if player.team not in (RED, BLUE):
            raise MoveError("Spectators can't guess.")
        if player.role != "operative":
            raise MoveError("Spymasters give clues, not guesses.")
        try:
            index = int(msg.get("index"))
        except (TypeError, ValueError):
            raise MoveError("Invalid card.")
        game.guess(player.team, index)
        return True

    if mtype == "endTurn":
        if player.team not in (RED, BLUE) or player.role != "operative":
            raise MoveError("Only operatives on the active team can pass.")
        game.end_turn(player.team)
        return True

    if mtype == "chat":
        text = str(msg.get("text", "")).strip()[:_MAX_CHAT]
        if not text:
            return False
        room.chat.append({"id": player.id, "name": player.name,
                          "color": player.color, "team": player.team,
                          "text": text, "ts": time.time(), "kind": "msg"})
        room.chat[:] = room.chat[-200:]
        return True

    if mtype == "reaction":
        emoji = str(msg.get("emoji", ""))
        if emoji not in _REACTIONS:
            return False
        room.chat.append({"id": player.id, "name": player.name,
                          "color": player.color, "team": player.team,
                          "text": emoji, "ts": time.time(), "kind": "reaction"})
        room.chat[:] = room.chat[-200:]
        return True

    if mtype == "ping":
        return False

    return False


def _validate_teams(room) -> None:
    reds = [p for p in room.players.values() if p.team == RED]
    blues = [p for p in room.players.values() if p.team == BLUE]
    if not reds or not blues:
        raise MoveError("Both teams need at least one player.")
    if not any(p.role == "spymaster" for p in reds):
        raise MoveError("Red needs a spymaster.")
    if not any(p.role == "spymaster" for p in blues):
        raise MoveError("Blue needs a spymaster.")


def _require_active_spymaster(room, player) -> None:
    if player.team not in (RED, BLUE):
        raise MoveError("Only a team spymaster can give clues.")
    if player.role != "spymaster":
        raise MoveError("Only the spymaster gives clues.")
