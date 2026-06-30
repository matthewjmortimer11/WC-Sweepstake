"""The Cursed Throne — FastAPI router (online multiplayer + static assets)."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from .game import STATUS_LOBBY, STATUS_PLAY, STATUS_SETUP, MoveError
from .manager import _clean_name, manager

router = APIRouter()

_STATIC = Path("static/dethrone")
_INDEX = _STATIC / "index.html"
_MEDIA = {
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}

_DETHRONE_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "connect-src 'self' ws: wss:; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; "
    "frame-ancestors 'none'"
)

_DETHRONE_ASSET_VERSION = "20260630-p21"

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


def _safe_static(filename: str) -> Path:
    root = _STATIC.resolve()
    path = (_STATIC / filename).resolve()
    if not path.is_file() or root not in path.parents:
        raise HTTPException(status_code=404)
    return path


@router.get("/dethrone", response_class=HTMLResponse)
@router.get("/dethrone/", response_class=HTMLResponse)
async def dethrone_page() -> HTMLResponse:
    if not _INDEX.is_file():
        raise HTTPException(status_code=404)
    html = _INDEX.read_text(encoding="utf-8")
    html = html.replace("<head>", '<head>\n  <base href="/dethrone/">', 1)
    v = _DETHRONE_ASSET_VERSION
    html = html.replace(
        "<script src=\"js/data.js\"></script>",
        f'<script>window.__DETHRONE_CARD_V="{v}";</script>\n  <script src="js/data.js"></script>',
        1,
    )
    html = html.replace('.css"', f'.css?v={v}"')
    html = html.replace('.js"', f'.js?v={v}"')
    html = html.replace('manifest.webmanifest"', f'manifest.webmanifest?v={v}"')
    html = html.replace('icons/icon.svg"', f'icons/icon.svg?v={v}"')
    return HTMLResponse(content=html, headers={"Content-Security-Policy": _DETHRONE_CSP})


@router.post("/dethrone/api/rooms")
async def create_room(request: Request) -> JSONResponse:
    _rate_limit_create(request)
    manager.start()
    player_count = 5
    try:
        body = await request.json()
        if isinstance(body, dict) and isinstance(body.get("playerCount"), int):
            player_count = body["playerCount"]
    except Exception:
        pass
    room = manager.create_room()
    room.game.set_player_count(player_count)
    return JSONResponse({"code": room.code, "playerCount": room.game.player_count})


@router.get("/dethrone/api/rooms/{code}/report")
async def room_report(code: str) -> JSONResponse:
    manager.start()
    room = manager.get(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    g = room.game
    if g.status == STATUS_LOBBY:
        raise HTTPException(status_code=400, detail="Game has not started.")
    return JSONResponse({
        "markdown": g.export_report(room.code),
        "filename": f"cursed-throne-{room.code}.md",
    })


@router.get("/dethrone/{filename:path}")
async def dethrone_static(filename: str) -> FileResponse:
    path = _safe_static(filename)
    media = _MEDIA.get(path.suffix, "application/octet-stream")
    return FileResponse(path, media_type=media)


@router.websocket("/dethrone/ws/{code}")
async def game_socket(ws: WebSocket, code: str) -> None:
    manager.start()
    room = manager.get(code)
    if room is None:
        await ws.accept()
        await ws.send_json({"type": "fatal", "message": "Room not found."})
        await ws.close()
        return

    await ws.accept()
    is_spectator = (ws.query_params.get("spectate") or "").lower() in ("1", "true", "yes")
    pid = (ws.query_params.get("pid") or "").strip()[:64] or uuid.uuid4().hex
    name = ws.query_params.get("name") or ""

    if is_spectator:
        await _spectator_loop(ws, room, pid, name)
        return

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

    if old is not None and old is not ws:
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


async def _spectator_loop(ws: WebSocket, room, sid: str, name: str) -> None:
    async with room.lock:
        try:
            manager.join_spectator(room, sid, name)
        except MoveError as exc:
            await ws.send_json({"type": "fatal", "message": str(exc)})
            await ws.close()
            return
        old = room.spectator_sockets.get(sid)
        room.spectator_sockets[sid] = ws
        room.touch()
        await ws.send_json({"type": "hello", "pid": sid, "code": room.code, "spectator": True})
        await manager._broadcast(room)

    if old is not None and old is not ws:
        try:
            await old.close()
        except Exception:
            pass

    try:
        while True:
            msg = await ws.receive_json()
            await _handle_spectator(room, sid, msg)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with room.lock:
            if room.spectator_sockets.get(sid) is ws:
                room.spectator_sockets.pop(sid, None)
            if sid in room.spectators:
                room.spectators[sid].connected = False
                room.spectators[sid].last_seen = time.time()
            room.touch()
            await manager._broadcast(room)


async def _handle_spectator(room, sid: str, msg: dict) -> None:
    if not isinstance(msg, dict):
        return
    mtype = msg.get("type")
    async with room.lock:
        spec = room.spectators.get(sid)
        if spec is None:
            return
        if mtype == "rename":
            spec.name = _clean_name(msg.get("name", "")) or spec.name
            room.touch()
            await manager._broadcast(room)
        # ping and unknown types are ignored


async def _handle(room, pid: str, msg: dict) -> None:
    if not isinstance(msg, dict):
        return
    mtype = msg.get("type")
    async with room.lock:
        player = room.players.get(pid)
        if player is None:
            return
        try:
            changed = _dispatch(room, player, mtype, msg)
        except MoveError as exc:
            ws = room.sockets.get(pid)
            if ws:
                await ws.send_json({"type": "error", "message": str(exc)})
            return
        if changed:
            room.touch()
            await manager._broadcast(room)


def _dispatch(room, player, mtype: str, msg: dict) -> bool:
    g = room.game

    if mtype == "rename":
        player.name = _clean_name(msg.get("name", "")) or player.name
        if g.status in (STATUS_SETUP, STATUS_PLAY):
            gp = g.player_by_id(player.id)
            if gp:
                gp.name = player.name
        return True

    if mtype == "setPlayerCount":
        if not player.is_host:
            raise MoveError("Only the host can change player count.")
        if g.status != STATUS_LOBBY:
            raise MoveError("Game already started.")
        g.set_player_count(int(msg.get("playerCount", 5)))
        return True

    if mtype == "setBalance":
        if not player.is_host:
            raise MoveError("Only the host can change balance.")
        bal = msg.get("balance")
        if isinstance(bal, dict):
            g.set_balance(bal)
        return True

    if mtype == "fillBots":
        if not player.is_host:
            raise MoveError("Only the host can add bots.")
        manager.fill_bots(room)
        return True

    if mtype == "kickPlayer":
        if not player.is_host:
            raise MoveError("Only the host can remove players.")
        manager.kick_player(room, player.id, str(msg.get("playerId", "")))
        return True

    if mtype == "setAllowSpectators":
        if not player.is_host:
            raise MoveError("Only the host can change spectator settings.")
        if g.status != STATUS_LOBBY:
            raise MoveError("Change spectator settings before dealing.")
        room.allow_spectators = bool(msg.get("allow", True))
        return True

    if mtype == "dealSetup":
        if not player.is_host:
            raise MoveError("Only the host can deal roles.")
        manager.deal_setup(room)
        return True

    if mtype == "pickPublicRole":
        g.pick_public_role(player.id, str(msg.get("roleId", "")))
        return True

    if mtype == "beginGame":
        if not player.is_host:
            raise MoveError("Only the host can begin the game.")
        first_mode = str(msg.get("firstMode", "random"))
        first_index = int(msg.get("firstPlayerIndex", 0))
        manager.begin_game(room, first_mode, first_index)
        return True

    if mtype == "move":
        g.move_player(player.id, str(msg.get("locationId", "")), actor_id=player.id)
        return True

    if mtype == "movePlayer":
        # referee / manual override (host only in test mode on client)
        if not player.is_host:
            raise MoveError("Only the host can override movement.")
        g.move_player(str(msg.get("playerId", "")), str(msg.get("locationId", "")), manual=True)
        return True

    if mtype == "locAction":
        result = g.do_location_action(player.id, str(msg.get("actionId", "")))
        if result.get("keepOne"):
            return True
        return True

    if mtype == "useRoleAbility":
        g.use_role_ability(
            player.id,
            str(msg.get("abilityId", "")),
            str(msg.get("targetId", "")) or None,
        )
        return True

    if mtype == "resolveKeepOne":
        g.resolve_keep_one(
            player.id,
            str(msg.get("deck", "")),
            str(msg.get("keepId", "")),
            str(msg.get("dropId", "")),
        )
        return True

    if mtype == "endTurn":
        g.end_turn(player.id)
        return True

    if mtype == "performFinalRite":
        g.perform_final_rite(player.id)
        return True

    if mtype == "declineFinalRite":
        g.decline_final_rite(player.id)
        return True

    if mtype == "resolveReaction":
        card_id = msg.get("cardId")
        g.resolve_reaction(player.id, str(card_id) if card_id else None)
        return True

    if mtype == "declineReaction":
        g.resolve_reaction(player.id, None)
        return True

    if mtype == "reactionMove":
        g.reaction_move(player.id, str(msg.get("locationId", "")))
        return True

    if mtype == "discardRole":
        g.apply_role_discard(
            str(msg.get("playerId", player.id)),
            str(msg.get("slot", "")),
            str(msg.get("roleId", "")),
            actor_id=player.id,
        )
        return True

    if mtype == "discardCard":
        g.discard_card(player.id, str(msg.get("cardId", "")), str(msg.get("reason", "")))
        return True

    if mtype == "toggleElim":
        if not player.is_host:
            raise MoveError("Host only.")
        g.toggle_player_status(str(msg.get("playerId", "")))
        return True

    if mtype == "playCard":
        g.play_action_card(
            player.id,
            str(msg.get("cardId", "")),
            target_id=msg.get("targetId") or None,
            location_id=msg.get("locationId") or None,
            deck_name=msg.get("deckName") or None,
            discard_card_id=msg.get("discardCardId") or None,
            rng=room.rng,
        )
        return True

    if mtype == "clearPendingUi":
        g.clear_pending_ui(player.id)
        return True

    if mtype == "royalCommand":
        g.apply_royal_command(
            player.id,
            str(msg.get("choice", "")),
            target_id=msg.get("targetId") or None,
        )
        return True

    if mtype == "deepResearch":
        g.apply_deep_research(
            player.id,
            str(msg.get("mode", "")),
            deck_name=msg.get("deckName") or None,
            target_id=msg.get("targetId") or None,
            rng=room.rng,
        )
        return True

    if mtype == "adjustGold":
        if not player.is_host:
            raise MoveError("Host only.")
        g.adjust_gold(str(msg.get("playerId", "")), int(msg.get("delta", 0)), str(msg.get("reason", "manual")))
        return True

    if mtype == "adjustRep":
        if not player.is_host:
            raise MoveError("Host only.")
        g.adjust_rep(str(msg.get("playerId", "")), int(msg.get("delta", 0)), str(msg.get("reason", "manual")), allow_debug=True)
        return True

    if mtype == "adjustCorruption":
        if not player.is_host:
            raise MoveError("Host only.")
        g.adjust_corruption(int(msg.get("delta", 0)), str(msg.get("reason", "manual adjustment")))
        return True

    if mtype == "adjustInnocents":
        if not player.is_host:
            raise MoveError("Host only.")
        g.set_innocent_elims(g.innocent_elims + int(msg.get("delta", 0)), str(msg.get("reason", "manual adjustment")))
        return True

    if mtype == "declareWinner":
        if not player.is_host:
            raise MoveError("Host only.")
        g.declare_winner(str(msg.get("side", "")), "manual")
        return True

    if mtype == "challenge":
        g.resolve_challenge(
            str(msg.get("claimantId", "")),
            str(msg.get("challengerId", "")),
            str(msg.get("power", "")),
            bool(msg.get("valid")),
        )
        return True

    if mtype == "formalVote":
        g.apply_formal_vote(
            str(msg.get("vtype", "accuse")),
            str(msg.get("targetId", "")),
            dict(msg.get("votes") or {}),
            int(msg.get("bonusYes", 0)),
            int(msg.get("bonusNo", 0)),
            emergency=bool(msg.get("emergency")),
            vote_cards=list(msg.get("voteCards") or []),
        )
        return True

    if mtype == "duelFlee":
        g.duel_flee(
            str(msg.get("defenderId", "")),
            att_card_ids=list(msg.get("attCardIds") or []),
        )
        return True

    if mtype == "duelConsequence":
        g.duel_apply_consequence(
            str(msg.get("attackerId", "")),
            str(msg.get("defenderId", "")),
            int(msg.get("attBonus", 0)),
            int(msg.get("defBonus", 0)),
            bool(msg.get("serious")),
            str(msg.get("consequence", "")),
            room.rng,
            att_card_ids=list(msg.get("attCardIds") or []),
            def_card_ids=list(msg.get("defCardIds") or []),
        )
        return True

    if mtype == "royalClaim":
        if msg.get("challengerId"):
            g.royal_claim_resolved(
                str(msg.get("claimantId", "")),
                str(msg.get("challengerId", "")),
                str(msg.get("crown", "king")),
                bool(msg.get("valid")),
            )
        else:
            g.royal_claim_unchallenged(str(msg.get("claimantId", "")), str(msg.get("crown", "king")))
        return True

    if mtype == "botTurn":
        if not player.is_host:
            raise MoveError("Only the host can run bots.")
        g.bot_take_turn(str(msg.get("playerId", "")), room.rng)
        return True

    if mtype == "botAuto":
        if not player.is_host:
            raise MoveError("Only the host can auto-play bots.")
        guard = 0
        while guard < 80 and g.status == STATUS_PLAY and not g.winner:
            for bp in g.players:
                if bp.is_bot and bp.id in g.pending_role_discard:
                    g._bot_auto_role_discard(bp.id, room.rng)
            ap = g.active_player()
            if not ap or not ap.is_bot or ap.status != "active":
                break
            g.bot_take_turn(ap.id, room.rng)
            guard += 1
        return guard > 0

    if mtype == "callOut":
        g.call_out(player.id, str(msg.get("targetId", "")), str(msg.get("roleId", "")))
        return True

    if mtype == "trade":
        g.apply_trade(
            str(msg.get("aId", "")),
            str(msg.get("bId", "")),
            int(msg.get("goldAB", 0)),
            int(msg.get("goldBA", 0)),
            int(msg["cardAB"]) if msg.get("cardAB") not in (None, "") else None,
            int(msg["cardBA"]) if msg.get("cardBA") not in (None, "") else None,
        )
        return True

    if mtype == "addContract":
        g.add_contract(str(msg.get("aId", "")), str(msg.get("bId", "")), str(msg.get("promise", "")))
        return True

    if mtype == "resolveContract":
        g.resolve_contract(str(msg.get("contractId", "")), str(msg.get("status", "")), msg.get("breakerId"))
        return True

    if mtype == "setThrone":
        if not player.is_host:
            raise MoveError("Host only.")
        g.set_throne_controller(str(msg.get("crown", "")), str(msg.get("playerId", "")), str(msg.get("reason", "")))
        return True

    if mtype == "clearThrone":
        if not player.is_host:
            raise MoveError("Host only.")
        g.clear_throne_controller(str(msg.get("crown", "")))
        return True

    if mtype == "openSuccession":
        g.open_succession()
        return True

    if mtype == "addSuccessionClaim":
        g.add_succession_claim(str(msg.get("playerId", player.id)), str(msg.get("roleId", "")))
        return True

    if mtype == "resolveSuccession":
        g.resolve_succession_claim(str(msg.get("claimId", "")))
        return True

    if mtype == "removeSuccessionClaim":
        g.remove_succession_claim(str(msg.get("claimId", "")))
        return True

    if mtype == "closeSuccession":
        g.close_succession()
        return True

    if mtype == "addNote":
        g._log(str(msg.get("text", "")).strip(), "note")
        return True

    if mtype == "ping":
        return False

    return False
