"""Cover Story — FastAPI router."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from .game import SPY_COUNT_OPTIONS, STATUS_PLAYING, TIMER_OPTIONS, CoverStoryGame, MoveError, Settings
from .locations import normalise_packs, public_locations, public_packs
from .manager import _clean_name, manager
from . import store

router = APIRouter()

_TEMPLATE = Path("templates/coverstory.html")
_ASSETS = Path("static/coverstory")
_MEDIA = {".js": "application/javascript", ".css": "text/css"}

_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self' ws: wss:; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; "
    "frame-ancestors 'none'"
)

_CREATE_BUCKETS: dict[str, list[float]] = {}
_CREATE_LIMIT = 30
_CREATE_WINDOW = 10 * 60


def _rate_limit_create(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.time()
    hits = [t for t in _CREATE_BUCKETS.get(key, []) if now - t < _CREATE_WINDOW]
    if len(hits) >= _CREATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many rooms created — try again shortly.")
    hits.append(now)
    _CREATE_BUCKETS[key] = hits


async def _parse_settings_async(payload: dict, current: Settings) -> Settings:
    try:
        timer = int(payload.get("timerSecs", current.timer_secs))
    except (TypeError, ValueError):
        raise MoveError("Invalid timer.")
    if timer not in TIMER_OPTIONS:
        raise MoveError("Timer must be off, 5, 7, 10, or 12 minutes.")
    pack_ids = payload.get("packIds", current.pack_ids)
    if not isinstance(pack_ids, list):
        raise MoveError("Invalid location packs.")
    custom_pack_ids = payload.get("customPackIds", current.custom_pack_ids)
    if not isinstance(custom_pack_ids, list):
        raise MoveError("Invalid custom packs.")
    custom_pack_ids = [str(pid).strip() for pid in custom_pack_ids if str(pid).strip()][:8]
    custom_locations = await store.locations_for_custom_packs(custom_pack_ids)
    try:
        spy_count = int(payload.get("spyCount", current.spy_count))
    except (TypeError, ValueError):
        raise MoveError("Invalid plant count.")
    if spy_count not in SPY_COUNT_OPTIONS:
        raise MoveError("Plant count must be 1 or 2.")
    return Settings(
        timer_secs=timer,
        pack_ids=normalise_packs(pack_ids),
        custom_pack_ids=custom_pack_ids,
        custom_locations=custom_locations,
        spy_count=spy_count,
    )


def _parse_settings(payload: dict, current: Settings) -> Settings:
    """Synchronous parser used by unit tests for built-in-pack settings."""
    try:
        timer = int(payload.get("timerSecs", current.timer_secs))
    except (TypeError, ValueError):
        raise MoveError("Invalid timer.")
    if timer not in TIMER_OPTIONS:
        raise MoveError("Timer must be off, 5, 7, 10, or 12 minutes.")
    pack_ids = payload.get("packIds", current.pack_ids)
    if not isinstance(pack_ids, list):
        raise MoveError("Invalid location packs.")
    try:
        spy_count = int(payload.get("spyCount", current.spy_count))
    except (TypeError, ValueError):
        raise MoveError("Invalid plant count.")
    if spy_count not in SPY_COUNT_OPTIONS:
        raise MoveError("Plant count must be 1 or 2.")
    return Settings(
        timer_secs=timer,
        pack_ids=normalise_packs(pack_ids),
        custom_pack_ids=list(current.custom_pack_ids),
        custom_locations=list(current.custom_locations),
        spy_count=spy_count,
    )


@router.get("/coverstory", response_class=HTMLResponse)
async def coverstory_page() -> HTMLResponse:
    if not _TEMPLATE.is_file():
        raise HTTPException(status_code=404)
    return HTMLResponse(_TEMPLATE.read_text(encoding="utf-8"), headers={"Content-Security-Policy": _CSP})


@router.get("/coverstory/manifest.webmanifest")
async def coverstory_manifest() -> FileResponse:
    path = _ASSETS / "manifest.webmanifest"
    if not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="application/manifest+json", headers={"Cache-Control": "public, max-age=300"})


@router.get("/coverstory/api/locations")
async def locations_meta() -> JSONResponse:
    return JSONResponse({
        "locations": public_locations(),
        "packs": public_packs(),
        "customPacks": await store.list_custom_packs(),
    })


@router.get("/coverstory/api/custom-packs")
async def custom_packs() -> JSONResponse:
    return JSONResponse({"packs": await store.list_custom_packs()})


@router.post("/coverstory/api/custom-packs")
async def create_custom_pack(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        if not isinstance(body, dict):
            body = {}
        pack = await store.create_custom_pack(body)
    except store.StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse({"pack": pack})


@router.get("/coverstory/api/playtests")
async def playtest_reports() -> JSONResponse:
    return JSONResponse({"reports": await store.recent_playtest_reports()})


@router.post("/coverstory/api/playtests")
async def create_playtest_report(request: Request) -> JSONResponse:
    try:
        body = await request.json()
        if not isinstance(body, dict):
            body = {}
        report = await store.create_playtest_report(body)
    except store.StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse({"report": report})


@router.get("/coverstory/api/profiles/{player_id}")
async def player_profile(player_id: str) -> JSONResponse:
    profile = await store.get_player_profile(player_id)
    if profile is None:
        profile = store.default_player_profile(player_id)
    return JSONResponse({"profile": profile})


@router.put("/coverstory/api/profiles/{player_id}")
async def save_player_profile(player_id: str, request: Request) -> JSONResponse:
    try:
        body = await request.json()
        if not isinstance(body, dict):
            body = {}
        profile = await store.upsert_player_profile(player_id, body)
    except store.StoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse({"profile": profile})


@router.get("/coverstory/api/stats")
async def coverstory_stats() -> JSONResponse:
    return JSONResponse(manager.stats())


@router.get("/coverstory/api/health")
async def coverstory_health() -> JSONResponse:
    stats = manager.stats()
    return JSONResponse({
        "ok": True,
        "activeRooms": stats["activeRooms"],
        "activePlayers": stats["activePlayers"],
        "capacity": stats["capacity"],
        "realtime": await manager.realtime.status(),
    })


@router.get("/coverstory/api/rooms/{code}/history")
async def room_history(code: str) -> JSONResponse:
    room = manager.get(code)
    if room is None:
        return JSONResponse({"code": code.strip().upper(), "history": await store.recent_rounds(code)})
    durable = await store.recent_rounds(room.code)
    history = durable or list(room.history)
    return JSONResponse({"code": room.code, "history": history})


@router.get("/coverstory/api/rooms/{code}/debug")
async def room_debug(code: str) -> JSONResponse:
    room = await manager.get_or_load(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    return JSONResponse(manager.debug_room(room))


@router.post("/coverstory/api/rooms")
async def create_room(request: Request) -> JSONResponse:
    _rate_limit_create(request)
    manager.start()
    settings = Settings()
    try:
        body = await request.json()
        if isinstance(body, dict):
            settings = await _parse_settings_async(body, settings)
    except MoveError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        pass
    room = manager.create_room(settings)
    await manager.persist_room(room)
    return JSONResponse({
        "code": room.code,
        "timerSecs": room.settings.timer_secs,
        "packIds": list(room.settings.pack_ids),
        "customPackIds": list(room.settings.custom_pack_ids),
        "spyCount": room.settings.spy_count,
    })


@router.get("/coverstory/assets/{filename:path}")
async def assets(filename: str) -> FileResponse:
    root = _ASSETS.resolve()
    path = (_ASSETS / filename).resolve()
    if not path.is_file() or root not in path.parents:
        raise HTTPException(status_code=404)
    media = _MEDIA.get(path.suffix, "application/octet-stream")
    return FileResponse(path, media_type=media)


@router.websocket("/coverstory/ws/{code}")
async def game_socket(ws: WebSocket, code: str) -> None:
    manager.start()
    room = await manager.get_or_load(code)
    if room is None:
        await ws.accept()
        await ws.send_json({"type": "fatal", "message": "Room not found."})
        await ws.close()
        return

    await ws.accept()
    pid = (ws.query_params.get("pid") or "").strip()[:64] or uuid.uuid4().hex
    name = ws.query_params.get("name") or ""

    async with room.lock:
        mutation_token = ""
        try:
            if manager.realtime.enabled:
                mutation_token = await manager.realtime.acquire_mutation_lock(room.code)
                if not mutation_token:
                    raise MoveError("Room is busy — try again.")
                snapshot = await manager.realtime.load_room(room.code)
                if snapshot:
                    manager.apply_snapshot(room, snapshot)
            player = manager.join(room, pid, name)
        except MoveError as exc:
            await ws.send_json({"type": "fatal", "message": str(exc)})
            await ws.close()
            return
        try:
            old = room.sockets.get(pid)
            room.sockets[pid] = ws
            room.touch()
            if room.game.status == STATUS_PLAYING and room.game.phase == "peek":
                room.game.viewed.discard(pid)
            await ws.send_json({"type": "hello", "pid": pid, "code": room.code})
            manager.ensure_subscription(room)
            await manager.persist_room(room, publish=True)
        finally:
            if mutation_token:
                await manager.realtime.release_mutation_lock(room.code, mutation_token)
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
            if room.game.status == STATUS_PLAYING:
                room.game.abandon_peek(pid)
            manager._ensure_host(room)
            room.touch()
            await manager.persist_room(room, publish=True)
            await manager._broadcast(room)


async def _handle(room, pid: str, msg: dict) -> None:
    if not isinstance(msg, dict):
        return
    mtype = msg.get("type")
    async with room.lock:
        mutation_token = ""
        player = room.players.get(pid)
        if player is None:
            return
        try:
            if manager.realtime.enabled:
                mutation_token = await manager.realtime.acquire_mutation_lock(room.code)
                if not mutation_token:
                    raise MoveError("Room is busy — try again.")
                snapshot = await manager.realtime.load_room(room.code)
                if snapshot:
                    manager.apply_snapshot(room, snapshot)
                    player = room.players.get(pid)
                    if player is None:
                        return
            if mtype == "settings":
                if not player.is_host:
                    raise MoveError("Only the host can change settings.")
                if room.game.status == STATUS_PLAYING:
                    raise MoveError("Finish the round before changing settings.")
                room.settings = await _parse_settings_async(msg.get("settings", {}), room.settings)
                room.game.settings = room.settings
                changed = True
            else:
                changed = _dispatch(room, player, mtype, msg)
            if changed:
                if mtype == "reveal" and room.history:
                    await store.record_round(
                        room.code,
                        room.history[-1],
                        spy_count=room.settings.spy_count,
                    )
                room.touch()
                await manager.persist_room(room, publish=True)
        except MoveError as exc:
            ws = room.sockets.get(pid)
            if ws:
                await ws.send_json({"type": "error", "message": str(exc)})
            return
        finally:
            if mutation_token:
                await manager.realtime.release_mutation_lock(room.code, mutation_token)
        if changed:
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
            raise MoveError("A round is already in progress.")
        if "settings" in msg:
            room.settings = _parse_settings(msg["settings"], room.settings)
            game.settings = room.settings
        manager.start_game(room)
        return True

    if mtype == "markViewed":
        game.mark_viewed(player.id)
        return True

    if mtype == "pauseTimer":
        if not player.is_host:
            raise MoveError("Only the host can pause the timer.")
        game.pause_timer()
        return True

    if mtype == "resumeTimer":
        if not player.is_host:
            raise MoveError("Only the host can resume the timer.")
        game.resume_timer()
        return True

    if mtype == "extendTimer":
        if not player.is_host:
            raise MoveError("Only the host can extend the timer.")
        try:
            seconds = int(msg.get("seconds", 60))
        except (TypeError, ValueError):
            raise MoveError("Invalid extension.")
        game.extend_timer(seconds)
        return True

    if mtype == "nextQuestion":
        if not player.is_host:
            raise MoveError("Only the host can advance the question prompt.")
        game.next_question()
        return True

    if mtype == "beginAccusation":
        if not player.is_host:
            raise MoveError("Only the host can start accusation.")
        game.begin_accusation()
        return True

    if mtype == "reveal":
        if not player.is_host:
            raise MoveError("Only the host can reveal the round.")
        game.reveal(
            accused_id=str(msg.get("accusedId", "")),
            location_guess=str(msg.get("locationGuess", "")),
        )
        manager.record_event("round_completed", room, player_count=len(game.player_ids))
        return True

    if mtype == "kickPlayer":
        if not player.is_host:
            raise MoveError("Only the host can kick players.")
        stale = manager.kick(room, str(msg.get("playerId", "")))
        if stale is not None:
            import asyncio

            asyncio.create_task(stale.close())
        return True

    if mtype == "newRound":
        if not player.is_host:
            raise MoveError("Only the host can start a new round.")
        game.new_round(room.rng)
        return True

    if mtype == "reset":
        if not player.is_host:
            raise MoveError("Only the host can reset.")
        room.game = CoverStoryGame(settings=room.settings)
        return True

    if mtype == "ping":
        player.last_seen = time.time()
        room.touch()
        return False

    return False
