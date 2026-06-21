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

from fastapi import APIRouter, Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from pydantic import BaseModel

from . import auth, store
from .avatars import decode_data_url
from .game import BLUE, RED, STATUS_LOBBY, MAX_ASSASSINS, MoveError, Settings, HouseRules
from .game import distribution_preview, effective_assassins, max_assassins_for_board
from .manager import (
    _ALLOWED_SIZES,
    _MAX_CHAT,
    _TIMER_MAX,
    _TIMER_MIN,
    _TIMER_STEP,
    _clean_name,
    clamp_timer,
    ensure_dev_bots,
    ensure_dev_host_playing,
    manager,
    remove_dev_bots,
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
    "script-src 'self' https://accounts.google.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data: https:; "
    "connect-src 'self' ws: wss: https://accounts.google.com https://oauth2.googleapis.com; "
    "frame-src https://accounts.google.com; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; "
    "frame-ancestors 'none'"
)


class GoogleAuthBody(BaseModel):
    idToken: str


class FriendBody(BaseModel):
    userId: str


class NicknameBody(BaseModel):
    nickname: str


class AvatarBody(BaseModel):
    dataUrl: str


class CreateLeagueBody(BaseModel):
    name: str


class JoinLeagueBody(BaseModel):
    code: str
    nickname: str


def _cipher_user_id(
    authorization: str | None = None,
    x_cipher_token: str | None = None,
) -> str:
    token = auth.token_from_header(authorization, x_cipher_token)
    uid = auth.user_id_from_token(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return uid


def get_cipher_user(
    authorization: str | None = Header(None),
    x_cipher_token: str | None = Header(None, alias="X-Cipher-Token"),
) -> str:
    return _cipher_user_id(authorization, x_cipher_token)


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
    previews = {
        str(n): {
            str(a): distribution_preview(n, a)
            for a in range(1, max_assassins_for_board(n) + 1)
        }
        for n in sorted(_ALLOWED_SIZES)
    }
    return JSONResponse({
        "packs": pack_meta(),
        "sizes": sorted(_ALLOWED_SIZES),
        "timer": {"min": _TIMER_MIN, "max": _TIMER_MAX, "step": _TIMER_STEP},
        "maxAssassins": {str(n): max_assassins_for_board(n) for n in sorted(_ALLOWED_SIZES)},
        "agentPreviews": previews,
    })


@router.get("/play/api/stats")
async def stats() -> JSONResponse:
    """Aggregate match stats + recent games. ``{"enabled": false}`` when no
    database is configured (the game still runs fully in-memory)."""
    return JSONResponse(await store.get_stats())


@router.get("/play/api/config")
async def play_config() -> JSONResponse:
    cid = auth.google_client_id()
    return JSONResponse({
        "googleClientId": cid or None,
        "authEnabled": auth.auth_enabled(),
    })


@router.post("/play/api/auth/google")
async def auth_google(body: GoogleAuthBody) -> JSONResponse:
    if not auth.auth_enabled():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
    claims = await auth.verify_google_token(body.idToken)
    try:
        user = await store.upsert_google_user(claims)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Stats storage is not available.")
    token = auth.cipher_token_for(user["id"])
    return JSONResponse({"token": token, "user": user})


@router.get("/play/api/me")
async def me(uid: str = Depends(get_cipher_user)) -> JSONResponse:
    profile = await store.get_user(uid)
    if not profile:
        raise HTTPException(status_code=401, detail="Account not found.")
    await store.touch_user(uid)
    return JSONResponse({"user": profile})


@router.patch("/play/api/me")
async def update_me(body: NicknameBody, uid: str = Depends(get_cipher_user)) -> JSONResponse:
    profile = await store.update_nickname(uid, body.nickname)
    if not profile:
        raise HTTPException(status_code=400, detail="Invalid nickname.")
    return JSONResponse({"user": profile})


@router.put("/play/api/me/avatar")
async def put_my_avatar(body: AvatarBody, uid: str = Depends(get_cipher_user)) -> JSONResponse:
    ctype, raw = decode_data_url(body.dataUrl)
    try:
        profile = await store.save_user_avatar(uid, ctype, raw)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Stats storage is not available.")
    if not profile:
        raise HTTPException(status_code=404, detail="Account not found.")
    return JSONResponse({"ok": True, "user": profile})


@router.delete("/play/api/me/avatar")
async def delete_my_avatar(uid: str = Depends(get_cipher_user)) -> JSONResponse:
    try:
        profile = await store.delete_user_avatar(uid)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Stats storage is not available.")
    if not profile:
        raise HTTPException(status_code=404, detail="Account not found.")
    return JSONResponse({"ok": True, "user": profile})


@router.get("/play/api/users/{user_id}/avatar")
async def get_user_avatar(user_id: str) -> Response:
    asset = await store.get_user_avatar(user_id)
    if not asset:
        raise HTTPException(status_code=404, detail="No avatar.")
    ctype, raw = asset
    return Response(
        content=raw,
        media_type=ctype,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/play/api/me/leagues")
async def my_leagues(uid: str = Depends(get_cipher_user)) -> JSONResponse:
    return JSONResponse(await store.list_user_leagues(uid))


@router.post("/play/api/leagues")
async def create_league_route(
    body: CreateLeagueBody, uid: str = Depends(get_cipher_user),
) -> JSONResponse:
    try:
        league = await store.create_league(uid, body.name)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Stats storage is not available.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return JSONResponse({"ok": True, "league": league})


@router.post("/play/api/leagues/join")
async def join_league_route(
    body: JoinLeagueBody, uid: str = Depends(get_cipher_user),
) -> JSONResponse:
    try:
        result = await store.join_league(uid, body.code, body.nickname)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Stats storage is not available.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "Could not join league."))
    return JSONResponse(result)


@router.get("/play/api/leagues/{code}")
async def league_info(code: str) -> JSONResponse:
    league = await store.get_league_by_code(code)
    if not league:
        raise HTTPException(status_code=404, detail="League not found.")
    return JSONResponse({"league": league})


@router.get("/play/api/leagues/{code}/standings")
async def league_standings(code: str) -> JSONResponse:
    league = await store.get_league_by_code(code)
    if not league:
        raise HTTPException(status_code=404, detail="League not found.")
    return JSONResponse(await store.get_league_standings(league["id"]))


@router.get("/play/api/leagues/{code}/games")
async def league_games(code: str) -> JSONResponse:
    league = await store.get_league_by_code(code)
    if not league:
        raise HTTPException(status_code=404, detail="League not found.")
    return JSONResponse(await store.get_league_games(league["id"]))


@router.get("/play/api/me/stats")
async def my_stats(uid: str = Depends(get_cipher_user)) -> JSONResponse:
    return JSONResponse(await store.get_user_stats(uid))


@router.get("/play/api/me/recent")
async def my_recent(uid: str = Depends(get_cipher_user)) -> JSONResponse:
    return JSONResponse(await store.get_recent_players(uid))


@router.get("/play/api/me/pairings")
async def my_pairings(uid: str = Depends(get_cipher_user)) -> JSONResponse:
    return JSONResponse(await store.get_pairings(uid))


@router.get("/play/api/me/friends")
async def my_friends(uid: str = Depends(get_cipher_user)) -> JSONResponse:
    return JSONResponse(await store.list_friends(uid))


@router.post("/play/api/me/friends")
async def add_friend_route(body: FriendBody, uid: str = Depends(get_cipher_user)) -> JSONResponse:
    result = await store.add_friend(uid, body.userId.strip())
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Could not add friend."))
    return JSONResponse(result)


@router.delete("/play/api/me/friends/{friend_id}")
async def delete_friend_route(friend_id: str, uid: str = Depends(get_cipher_user)) -> JSONResponse:
    await store.remove_friend(uid, friend_id)
    return JSONResponse({"ok": True})


@router.get("/play/api/leaderboard")
async def leaderboard() -> JSONResponse:
    return JSONResponse(await store.get_leaderboard())


@router.post("/play/api/rooms")
async def create_room(request: Request) -> JSONResponse:
    manager.start()
    # An optional packId lets the home screen spin up a room pre-tuned to a
    # mode (e.g. "afterdark") so the choice is made upfront, not buried in
    # settings. Unknown/missing values fall back to the classic default.
    pack_id = "classic"
    pack_ids: list[str] | None = None
    league_code = ""
    try:
        body = await request.json()
        if isinstance(body, dict):
            raw_ids = body.get("packIds")
            if isinstance(raw_ids, list) and raw_ids:
                pack_ids = normalize_pack_ids([str(x) for x in raw_ids])
            elif str(body.get("packId", "")) in PACKS:
                pack_id = str(body["packId"])
                pack_ids = normalize_pack_ids([pack_id])
            league_code = str(body.get("leagueCode", "") or "").strip().upper()
    except Exception:
        pass
    room = manager.create_room()
    if league_code:
        league = await store.get_league_by_code(league_code)
        if league:
            room.settings.league_id = league["id"]
            room.settings.league_code = league["code"]
            room.settings.league_name = league["name"]
            room.game.settings = room.settings
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
        "leagueCode": room.settings.league_code,
        "leagueName": room.settings.league_name,
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
    total = size * size
    if assassins < 1:
        raise MoveError("Pick at least 1 assassin.")
    eff_max = max_assassins_for_board(size)
    if assassins > eff_max:
        raise MoveError(f"Pick 1–{eff_max} assassins on a {size}×{size} board.")
    assassins = effective_assassins(total, assassins)

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
    dev_mode = bool(payload.get("devMode", current.dev_mode))

    return Settings(
        board_size=size, pack_ids=pack_ids, pack_id=pack_id, custom_words=custom,
        turn_seconds=timer, assassins=assassins, pack_name=pack_name,
        house_rules=house_rules, dev_mode=dev_mode,
        league_id=current.league_id,
        league_code=current.league_code,
        league_name=current.league_name,
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
    cipher_uid = auth.user_id_from_token(ws.query_params.get("cipherToken"))
    if cipher_uid:
        if room.settings.league_id:
            league_nick = await store.league_nickname_for_user(
                room.settings.league_id, cipher_uid,
            )
            if league_nick:
                name = league_nick
        if not name.strip():
            profile = await store.get_user(cipher_uid)
            if profile and profile.get("label"):
                name = profile["label"]

    displaced_ws = None
    async with room.lock:
        try:
            player, displaced_pid = manager.join(
                room, pid, name, cipher_user_id=cipher_uid,
            )
        except MoveError as exc:
            await ws.send_json({"type": "fatal", "message": str(exc)})
            await ws.close()
            return
        resumed = displaced_pid is not None
        if resumed:
            displaced_ws = room.sockets.pop(displaced_pid, None)
        old = room.sockets.get(pid)
        room.sockets[pid] = ws
        room.touch()
        hello = {"type": "hello", "pid": pid, "code": room.code}
        if resumed:
            hello["resumed"] = True
        await ws.send_json(hello)
        await manager._broadcast(room)
    for stale in (old, displaced_ws):
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
        if game.status == "playing" and not room.settings.dev_mode:
            raise MoveError("You can't switch teams mid-game.")
        team = msg.get("team")
        if team not in (RED, BLUE, "spectator"):
            raise MoveError("Unknown team.")
        player.team = team
        if team == "spectator":
            player.role = "operative"
        return True

    if mtype == "setRole":
        if game.status == "playing" and not room.settings.dev_mode:
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
        if room.settings.dev_mode:
            ensure_dev_bots(room)
        else:
            remove_dev_bots(room)
        return True

    if mtype == "start" or mtype == "newGame":
        if not player.is_host:
            raise MoveError("Only the host can start the game.")
        if game.status == "playing":
            raise MoveError("A game is already in progress.")
        if "settings" in msg:
            room.settings = _build_settings(msg["settings"], room.settings)
            game.settings = room.settings
        if room.settings.dev_mode:
            ensure_dev_host_playing(room)
            ensure_dev_bots(room)
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
        if room.settings.dev_mode:
            ensure_dev_host_playing(room)
            ensure_dev_bots(room)
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
    if room.settings.dev_mode:
        ensure_dev_bots(room)
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
