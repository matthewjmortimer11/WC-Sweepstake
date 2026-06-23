"""Dial — FastAPI router (HTTP + WebSocket)."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from party.assets import serve_asset
from party.pages import render_game_page
from party.ratelimit import WsRateLimitError, rate_limit_create, rate_limit_ws_message
from party.stats import ensure_can_create_room

from .game import (
    ALLOWED_TARGET_SCORES,
    MODE_FFA,
    MODE_TEAMS,
    PHASE_GUESS,
    PHASE_PSYCHIC,
    PHASE_REVEAL,
    ROLE_GUESSER,
    ROLE_SPECTATOR,
    STATUS_ENDED,
    STATUS_LOBBY,
    STATUS_PLAYING,
    TEAM_0,
    TEAM_1,
    TEAM_UNASSIGNED,
    MoveError,
    Settings,
    clean_team_name,
)
from .manager import _clean_name, manager

router = APIRouter()

_DIR = Path(__file__).resolve().parent
_TEMPLATE = Path("templates/dial.html")
_ASSETS = Path("static/dial")

_WHEEL_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self' ws: wss:; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; "
    "frame-ancestors 'none'"
)

_MAX_CLUE = 200


def _clean_clue(text: str) -> str:
    text = (text or "").strip()
    text = " ".join(text.split())
    text = "".join(ch for ch in text if ch.isprintable())
    return text[:_MAX_CLUE]


def _parse_settings(payload: dict, current: Settings) -> Settings:
    mode = str(payload.get("mode", current.mode))
    if mode not in (MODE_TEAMS, MODE_FFA):
        raise MoveError("Unknown game mode.")
    try:
        target = int(payload.get("targetScore", current.target_score))
    except (TypeError, ValueError):
        raise MoveError("Invalid target score.")
    if target not in ALLOWED_TARGET_SCORES:
        raise MoveError("Target score must be 10, 15, or 20.")
    names = current.team_names
    raw_names = payload.get("teamNames")
    if isinstance(raw_names, list) and len(raw_names) >= 2:
        names = (
            clean_team_name(str(raw_names[0]), "Team 1"),
            clean_team_name(str(raw_names[1]), "Team 2"),
        )
    return Settings(mode=mode, target_score=target, team_names=names)


@router.get("/wheel", response_class=HTMLResponse)
async def wheel_page() -> HTMLResponse:
    try:
        return render_game_page(_TEMPLATE, _WHEEL_CSP)
    except FileNotFoundError:
        raise HTTPException(status_code=404) from None


@router.post("/wheel/api/rooms")
async def create_room(request: Request) -> JSONResponse:
    rate_limit_create(request)
    ensure_can_create_room()
    manager.start()
    settings = Settings()
    try:
        body = await request.json()
        if isinstance(body, dict):
            settings = _parse_settings(body, settings)
    except MoveError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        pass
    room = manager.create_room(settings)
    return JSONResponse({
        "code": room.code,
        "mode": room.settings.mode,
        "targetScore": room.settings.target_score,
        "teamNames": list(room.settings.team_names),
    })


@router.get("/wheel/assets/{filename:path}")
async def assets(filename: str) -> FileResponse:
    return serve_asset(_ASSETS, filename)


@router.websocket("/wheel/ws/{code}")
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

    for stale in (old,):
        if stale is not None and stale is not ws:
            try:
                await stale.close()
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
            manager.handle_disconnect(room, pid)
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
            rate_limit_ws_message("dial", room.code, pid, mtype=mtype)
            changed = _dispatch(room, player, mtype, msg)
        except MoveError as exc:
            ws = room.sockets.get(pid)
            if ws:
                await ws.send_json({"type": "error", "message": str(exc)})
            return
        except WsRateLimitError as exc:
            ws = room.sockets.get(pid)
            if ws:
                await ws.send_json({"type": "error", "message": str(exc)})
            return
        if changed:
            room.touch()
            await manager._broadcast(room)


def _dispatch(room, player, mtype: str, msg: dict) -> bool:
    game = room.game

    if mtype == "rename":
        player.name = _clean_name(msg.get("name", "")) or player.name
        return True

    if mtype == "setTeam":
        if game.status == STATUS_PLAYING:
            raise MoveError("You can't switch teams mid-game.")
        team = msg.get("team")
        if team not in (TEAM_0, TEAM_1, TEAM_UNASSIGNED):
            raise MoveError("Unknown team.")
        player.team = team
        if team == TEAM_UNASSIGNED:
            player.role = ROLE_GUESSER
        return True

    if mtype == "setRole":
        if game.status == STATUS_PLAYING:
            raise MoveError("Role is locked once the game starts.")
        role = msg.get("role")
        if role not in (ROLE_GUESSER, ROLE_SPECTATOR):
            raise MoveError("Unknown role.")
        player.role = role
        return True

    if mtype == "settings":
        if not player.is_host:
            raise MoveError("Only the host can change settings.")
        if game.status == STATUS_PLAYING:
            raise MoveError("Finish or reset before changing settings.")
        room.settings = _parse_settings(msg.get("settings", {}), room.settings)
        game.settings = room.settings
        return True

    if mtype in ("start", "newGame"):
        if not player.is_host:
            raise MoveError("Only the host can start the game.")
        if game.status == STATUS_PLAYING:
            raise MoveError("A game is already in progress.")
        if "settings" in msg:
            room.settings = _parse_settings(msg["settings"], room.settings)
            game.settings = room.settings
        manager.start_game(room)
        return True

    if mtype == "rematch":
        if not player.is_host:
            raise MoveError("Only the host can start a rematch.")
        if game.status != STATUS_ENDED:
            raise MoveError("The game hasn't ended yet.")
        game.status = STATUS_LOBBY
        game.winner = None
        game.team_scores = [0, 0]
        game.player_scores.clear()
        game.round_no = 0
        manager.start_game(room)
        return True

    if mtype == "reset":
        if not player.is_host:
            raise MoveError("Only the host can reset.")
        from .game import DialGame
        room.game = DialGame(settings=room.settings)
        return True

    if mtype == "psychicReady":
        game.psychic_ready(player.id)
        return True

    if mtype == "setClue":
        game.set_clue(player.id, _clean_clue(str(msg.get("text", ""))))
        return True

    if mtype == "setGuess":
        try:
            value = int(msg.get("value", 50))
        except (TypeError, ValueError):
            raise MoveError("Invalid dial position.")
        game.set_guess(player.id, value)
        return True

    if mtype == "lockGuess":
        game.lock_guess(player.id)
        if manager.maybe_advance_guess(room):
            return True
        return True

    if mtype == "nextRound":
        if not player.is_host:
            raise MoveError("Only the host can advance.")
        if game.status != STATUS_PLAYING or game.phase != PHASE_REVEAL:
            raise MoveError("Wait for the reveal.")
        game.next_round(room.rng)
        if game.status == STATUS_PLAYING and game.settings.mode == MODE_TEAMS:
            game.psychic_id = room.pick_team_psychic()
        return True

    if mtype == "ping":
        return False

    return False
