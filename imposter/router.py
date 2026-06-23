"""Imposter — FastAPI router."""

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

from .celebs import CELEBS
from .game import MODES, TIMER_OPTIONS, MODE_CLASSIC, PHASE_PEEK, STATUS_LOBBY, STATUS_PLAYING, MoveError, Settings
from .manager import _clean_name, manager

router = APIRouter()

_TEMPLATE = Path("templates/imposter.html")
_ASSETS = Path("static/imposter")

_IMPOSTER_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self' ws: wss:; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; "
    "frame-ancestors 'none'"
)


def _parse_settings(payload: dict, current: Settings) -> Settings:
    mode = str(payload.get("mode", current.mode))
    if mode not in MODES:
        raise MoveError("Unknown game mode.")
    try:
        timer = int(payload.get("timerSecs", current.timer_secs))
    except (TypeError, ValueError):
        raise MoveError("Invalid timer.")
    if timer not in TIMER_OPTIONS:
        raise MoveError("Timer must be off, 30, 60, 90, or 120 seconds.")
    return Settings(mode=mode, timer_secs=timer)


@router.get("/imposter", response_class=HTMLResponse)
async def imposter_page() -> HTMLResponse:
    try:
        return render_game_page(_TEMPLATE, _IMPOSTER_CSP)
    except FileNotFoundError:
        raise HTTPException(status_code=404) from None


@router.get("/imposter/api/celebs")
async def celebs_meta() -> JSONResponse:
    return JSONResponse({"count": len(CELEBS)})


@router.post("/imposter/api/rooms")
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
        "timerSecs": room.settings.timer_secs,
    })


@router.get("/imposter/assets/{filename:path}")
async def assets(filename: str) -> FileResponse:
    return serve_asset(_ASSETS, filename)


@router.websocket("/imposter/ws/{code}")
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
        game = room.game
        if game.status == STATUS_PLAYING and game.phase == PHASE_PEEK:
            game.viewed.discard(pid)
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
            game = room.game
            if game.status == STATUS_PLAYING:
                game.abandon_peek(pid)
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
            rate_limit_ws_message("imposter", room.code, pid, mtype=mtype)
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

    if mtype == "settings":
        if not player.is_host:
            raise MoveError("Only the host can change settings.")
        if game.status == STATUS_PLAYING:
            raise MoveError("Finish the round before changing settings.")
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

    if mtype == "newRound":
        if not player.is_host:
            raise MoveError("Only the host can start a new round.")
        if game.status != STATUS_PLAYING:
            raise MoveError("No round in progress.")
        game.new_round(room.rng)
        return True

    if mtype == "markViewed":
        game.mark_viewed(player.id)
        return True

    if mtype == "revealAnswer":
        if not player.is_host:
            raise MoveError("Only the host can reveal the answer.")
        game.reveal_answer()
        return True

    if mtype == "reset":
        if not player.is_host:
            raise MoveError("Only the host can reset.")
        from .game import ImposterGame
        room.game = ImposterGame(settings=room.settings)
        return True

    if mtype == "ping":
        return False

    return False
