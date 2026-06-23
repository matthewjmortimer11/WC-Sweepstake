"""Who Am I? — FastAPI router."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

from party.assets import serve_asset
from party.pages import render_game_page
from party.ratelimit import WsRateLimitError, rate_limit_create, rate_limit_ws_message
from party.stats import ensure_can_create_room

from .game import STATUS_PLAYING, MoveError, Settings
from .manager import _clean_name, manager
from .packs import DEFAULT_PACK_IDS, characters_for_packs, normalize_pack_ids, pack_label, pack_meta

router = APIRouter()

_TEMPLATE = Path("templates/whoami.html")
_ASSETS = Path("static/whoami")

_WHOAMI_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' ws: wss:; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; "
    "frame-ancestors 'none'"
)


@router.get("/whoami", response_class=HTMLResponse)
async def whoami_page() -> HTMLResponse:
    try:
        return render_game_page(_TEMPLATE, _WHOAMI_CSP)
    except FileNotFoundError:
        raise HTTPException(status_code=404) from None


@router.get("/whoami/api/packs")
async def packs() -> JSONResponse:
    return JSONResponse({"packs": pack_meta()})


@router.get("/whoami/api/character-pool")
async def character_pool(packIds: str = "") -> JSONResponse:
    """Identity list for local / pass-the-phone mode (selected packs only)."""
    raw = [x.strip() for x in packIds.split(",") if x.strip()] if packIds else None
    ids = normalize_pack_ids(raw)
    words = characters_for_packs(ids)
    return JSONResponse({"packIds": ids, "count": len(words), "characters": words})


@router.post("/whoami/api/rooms")
async def create_room(request: Request) -> JSONResponse:
    rate_limit_create(request)
    ensure_can_create_room()
    manager.start()
    pack_ids = list(DEFAULT_PACK_IDS)
    try:
        body = await request.json()
        if isinstance(body, dict):
            raw = body.get("packIds")
            if isinstance(raw, list):
                pack_ids = normalize_pack_ids([str(x) for x in raw])
    except Exception:
        pass
    settings = Settings(
        pack_ids=pack_ids,
        pack_name=pack_label(pack_ids),
    )
    room = manager.create_room(settings)
    return JSONResponse({
        "code": room.code,
        "packIds": room.settings.pack_ids,
        "packName": room.settings.pack_name,
    })


@router.get("/whoami/api/rooms/{code}/avatar/{player_id}")
async def get_avatar(code: str, player_id: str) -> Response:
    room = manager.get(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    player = room.players.get(player_id)
    if player is None or not player.has_avatar:
        raise HTTPException(status_code=404, detail="No avatar.")
    return Response(
        content=player.avatar_bytes,
        media_type=player.avatar_ctype,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/whoami/assets/{filename:path}")
async def assets(filename: str) -> FileResponse:
    return serve_asset(_ASSETS, filename)


@router.websocket("/whoami/ws/{code}")
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
            rate_limit_ws_message("whoami", room.code, pid, mtype=mtype)
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

    if mtype == "setAvatar":
        data_url = str(msg.get("dataUrl", ""))
        if not data_url:
            manager.clear_avatar(room, player.id)
        else:
            manager.set_avatar(room, player.id, data_url)
        return True

    if mtype == "clearAvatar":
        manager.clear_avatar(room, player.id)
        return True

    if mtype == "settings":
        if not player.is_host:
            raise MoveError("Only the host can change settings.")
        if game.status == STATUS_PLAYING:
            raise MoveError("Finish the round to change packs.")
        payload = msg.get("settings") or {}
        pack_ids = normalize_pack_ids(payload.get("packIds"))
        room.settings.pack_ids = pack_ids
        room.settings.pack_name = pack_label(pack_ids)
        room.game.settings = room.settings
        return True

    if mtype in ("start", "newGame"):
        if not player.is_host:
            raise MoveError("Only the host can start the game.")
        if game.status == STATUS_PLAYING:
            raise MoveError("A game is already in progress.")
        manager.start_game(room)
        return True

    if mtype == "newRound":
        if not player.is_host:
            raise MoveError("Only the host can start a new round.")
        connected_ids = {p.id for p in room.players.values() if p.connected}
        game.new_round(room.rng, connected_ids)
        return True

    if mtype == "confirmGuess":
        target = str(msg.get("playerId", ""))
        if msg.get("undo"):
            game.unconfirm_guess(player.id, target)
        else:
            game.confirm_guess(player.id, target)
        return True

    if mtype == "claimGotIt":
        game.claim_got_it(player.id)
        return True

    if mtype == "reset":
        if not player.is_host:
            raise MoveError("Only the host can reset.")
        from .game import WhoAmIGame
        room.game = WhoAmIGame(settings=room.settings)
        return True

    if mtype == "ping":
        return False

    return False
