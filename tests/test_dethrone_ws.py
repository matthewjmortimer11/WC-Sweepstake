"""Integration tests for The Cursed Throne HTTP + WebSocket."""

import json

import pytest
from starlette.testclient import TestClient

import main
from dethrone.game import STATUS_PLAY, STATUS_SETUP
from dethrone.manager import manager


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clear_dethrone_create_rate_limit():
    from dethrone.router import _CREATE_BUCKETS
    _CREATE_BUCKETS.clear()
    yield
    _CREATE_BUCKETS.clear()


def _room_with_players(code: str, n: int = 4):
    room = manager.get(code)
    pids = [f"p{i}" for i in range(1, n + 1)]
    for i, pid in enumerate(pids):
        manager.join(room, pid, f"Player {i + 1}")
        room.players[pid].connected = True
    return room, pids


def test_create_room(client):
    r = client.post("/dethrone/api/rooms", json={"playerCount": 5})
    assert r.status_code == 200
    data = r.json()
    assert data["code"]
    assert manager.get(data["code"]) is not None


def test_dethrone_page(client):
    r = client.get("/dethrone")
    assert r.status_code == 200
    assert "The Cursed Throne" in r.text
    assert 'base href="/dethrone/"' in r.text
    assert "cards-roles.js" in r.text
    assert "__DETHRONE_CARD_V" in r.text


def test_dethrone_role_card_assets(client):
    import json
    from pathlib import Path

    from dethrone.router import _DETHRONE_ASSET_VERSION

    page = client.get("/dethrone")
    assert page.status_code == 200
    assert "__DETHRONE_CARD_V" in page.text
    assert f'__DETHRONE_CARD_V="{_DETHRONE_ASSET_VERSION}"' in page.text
    assert f"cards-roles.js?v={_DETHRONE_ASSET_VERSION}" in page.text

    manifest = json.loads(
        Path("static/dethrone/cards/roles/manifest.json").read_text(encoding="utf-8")
    )
    for role_id, fname in manifest["cards"].items():
        r = client.get(f"/dethrone/cards/roles/{fname}")
        assert r.status_code == 200, fname
        assert r.headers["content-type"] == "image/png", fname
        assert len(r.content) > 5000, fname
        busted = client.get(f"/dethrone/cards/roles/{fname}?v={_DETHRONE_ASSET_VERSION}")
        assert busted.status_code == 200, fname

    back = manifest["back"]
    r = client.get(f"/dethrone/cards/roles/{back}")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"

    r = client.get("/dethrone/cards/roles/manifest.json")
    assert r.status_code == 200
    assert "king-card-v3b-poker.png" in r.text


def test_dethrone_v3b_board_asset(client):
    from pathlib import Path

    from dethrone.router import _DETHRONE_ASSET_VERSION

    page = client.get("/dethrone")
    assert page.status_code == 200
    assert f"board.js?v={_DETHRONE_ASSET_VERSION}" in page.text
    assert f"cards-map.js?v={_DETHRONE_ASSET_VERSION}" in page.text
    assert f"cards-action.js?v={_DETHRONE_ASSET_VERSION}" in page.text

    action_js = Path("static/dethrone/js/cards-action.js").read_text(encoding="utf-8")
    assert "actionCardStubHtml" in action_js
    assert "actionCardUrl" in action_js
    assert "actionCardArtHtml" in action_js
    assert "handStripHtml" in action_js
    assert "duelCardPickerHtml" in action_js
    assert "reactionCardPickerHtml" in action_js
    assert "privateNoteBannerHtml" in action_js
    assert "setPrivateNote" in Path("static/dethrone/js/state.js").read_text(encoding="utf-8")
    app_js = Path("static/dethrone/js/app.js").read_text(encoding="utf-8")
    assert "handTabPanel" in app_js
    assert "deckArchivesHtml" in action_js
    assert "pactChipBar" in app_js
    assert "h-open-challenge" in app_js
    assert "parleyFooterRow" in app_js

    board = Path("static/dethrone/js/board.js").read_text(encoding="utf-8")
    assert "map-v3b--layered" in board
    assert "map-bg" in board
    assert "mapLocationUrl" in Path("static/dethrone/js/cards-map.js").read_text(encoding="utf-8")
    assert 'viewBox="0 0 1200 800"' in board
    assert 'data-act="board-move"' in board
    assert "CT.MAP_ROUTES" in board
    assert len(board) > 1500
    assert '0.7)"/>' not in board  # syntax error that prevented board.js from loading

    manifest = json.loads(Path("static/dethrone/cards/map/manifest.json").read_text(encoding="utf-8"))
    assert manifest["kingdom"]["file"] == "kingdom-background-v3b.jpg"
    for loc_id, fname in manifest["locations"].items():
        assert fname.endswith(".jpg"), fname
        r = client.get(f"/dethrone/cards/map/{fname}?v={_DETHRONE_ASSET_VERSION}")
        assert r.status_code == 200, fname
        assert r.headers["content-type"] in ("image/jpeg", "image/jpg"), fname
        assert len(r.content) > 10000, fname
    bg = client.get(f"/dethrone/cards/map/{manifest['kingdom']['file']}")
    assert bg.status_code == 200
    assert len(bg.content) > 50000

    action_manifest = json.loads(
        Path("static/dethrone/cards/action/manifest.json").read_text(encoding="utf-8")
    )
    assert action_manifest.get("count") == 76 or len(action_manifest["cards"]) == 76
    assert "stylised" in action_manifest.get("template", "").lower() or "per-card" in action_manifest.get("template", "").lower()
    for card_id, fname in action_manifest["cards"].items():
        assert fname.endswith(".jpg"), fname
        r = client.get(f"/dethrone/cards/action/{fname}?v={_DETHRONE_ASSET_VERSION}")
        assert r.status_code == 200, fname
        assert r.headers["content-type"] in ("image/jpeg", "image/jpg"), fname
        assert len(r.content) > 5000, fname


def test_hidden_roles_not_leaked(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids = _room_with_players(code, 4)
    manager.deal_setup(room)
    view_a = room.state_for(pids[0])["room"]["game"]
    view_b = room.state_for(pids[1])["room"]["game"]
    setup_a = view_a["setup"]["dealtRoleIds"]
    setup_b = view_b["setup"]["dealtRoleIds"]
    assert len(setup_a) == 3
    assert len(setup_b) == 3
    assert setup_a != setup_b or setup_a  # each player sees their own deal
    # Other players' hidden roles not in public player list
    pub_b = next(p for p in view_a["players"] if p["id"] == pids[1])
    assert pub_b["hiddenRoleIds"] == []


def test_setup_and_begin(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids = _room_with_players(code, 4)
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        public = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, public)
    manager.begin_game(room, "random", 0)
    assert g.status == STATUS_PLAY
    assert g.round == 1
    assert g.winner is None


def test_move_and_end_turn_via_websocket(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids = _room_with_players(code, 4)
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        pub = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, pub)
    manager.begin_game(room, "random", 0)
    active = g.active_player().id

    with client.websocket_connect(f"/dethrone/ws/{code}?pid={active}&name=Active") as ws:
        ws.receive_json()  # hello
        state = ws.receive_json()
        assert state["type"] == "state"
        moves = state["room"]["game"]["legalMoves"]
        assert moves
        ws.send_json({"type": "move", "locationId": moves[0]})
        ws.receive_json()
        ws.send_json({"type": "endTurn"})
        nxt = ws.receive_json()
        assert nxt["room"]["game"]["activePlayerId"] != active


def test_wrong_player_cannot_move(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids = _room_with_players(code, 4)
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        pub = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, pub)
    manager.begin_game(room, "random", 0)
    active = g.active_player().id
    other = next(pid for pid in pids if pid != active)

    with client.websocket_connect(f"/dethrone/ws/{code}?pid={other}&name=Other") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "move", "locationId": "tavern"})
        err = ws.receive_json()
        assert err["type"] == "error"


def _start_game(code: str, n: int = 4):
    room, pids = _room_with_players(code, n)
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        pub = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, pub)
    manager.begin_game(room, "random", 0)
    return room, pids, g


def _set_non_exempt_roles(p, g=None):
    """Deterministic roles for tax tests (no spy/firstborn/tinytyrant/courtfavourite)."""
    p.public_role_id = "gateguard"
    p.hidden_role_ids = ["thief", "wanderingknight"]
    p.extra_shown_role_ids = []
    p.action_card_ids = [c for c in p.action_card_ids if c != "guild_seal"]
    if g is not None:
        g.tax_skip_remaining.pop(p.id, None)


def _strip_queens(g):
    for p in g.players:
        if p.public_role_id == "queen":
            p.public_role_id = "gateguard"
        p.hidden_role_ids = [r for r in p.hidden_role_ids if r != "queen"]


def _strip_spies(g):
    for p in g.players:
        if p.public_role_id == "spy":
            p.public_role_id = "gateguard"
        p.hidden_role_ids = [r for r in p.hidden_role_ids if r != "spy"]


def _prepare_rep_victim(p, g=None):
    """Plain player for rep-loss tests — no queen/spy intercepts or reaction cards."""
    _set_non_exempt_roles(p, g)
    p.action_card_ids = []


def _strip_royal_guards(g, keep_id=None):
    for p in g.players:
        if keep_id and p.id == keep_id:
            continue
        if p.public_role_id == "royalguard":
            p.public_role_id = "gateguard"
        p.hidden_role_ids = [r for r in p.hidden_role_ids if r != "royalguard"]


def _strip_royal_knights(g, keep_id=None):
    for p in g.players:
        if keep_id and p.id == keep_id:
            continue
        if p.public_role_id == "royalknight":
            p.public_role_id = "gateguard"
        p.hidden_role_ids = [r for r in p.hidden_role_ids if r != "royalknight"]


def _vote_opts(proposer_id, *, seconder=True, decree=False, max_rep=None):
    opts = {"proposer_id": proposer_id, "seconder": seconder, "decree": decree}
    if max_rep is not None:
        opts["max_rep"] = max_rep
    return opts


def test_challenge_sets_pending_discard(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    claimant, challenger = pids[0], pids[1]
    g.resolve_challenge(claimant, challenger, "Stride", valid=True)
    assert challenger in g.pending_role_discard
    view = room.state_for(challenger)["room"]["game"]
    assert view["pendingRoleDiscard"] is not None


def test_formal_vote_accuse(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target = pids[2]
    g.player_by_id(target).action_card_ids = []
    votes = {pid: "yes" for pid in pids}
    g.apply_formal_vote("accuse", target, votes, **_vote_opts(pids[0]))
    assert target in g.pending_role_discard


def test_reconnect_mid_game(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = pids[0]
    room.players[pid].connected = False
    with client.websocket_connect(f"/dethrone/ws/{code}?pid={pid}&name=Rejoin") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        state = ws.receive_json()
        assert state["type"] == "state"
        assert state["you"]["id"] == pid


def test_fill_bots_and_bot_turn(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room = manager.get(code)
    manager.join(room, "human1", "Alice")
    room.players["human1"].connected = True
    manager.fill_bots(room)
    assert len(room.players) == 4
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        pub = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, pub)
    manager.begin_game(room, "random", 0)
    # find a bot active player or run until bot turn
    for _ in range(8):
        ap = g.active_player()
        if ap and ap.is_bot:
            g.bot_take_turn(ap.id, room.rng)
            break
        g.end_turn(ap.id)
    else:
        pytest.skip("No bot turn in sample")
    assert g.round >= 1


def test_action_deck_has_76_cards():
    from dethrone import data as d
    assert len(d.ACTION_CARDS) == 76
    assert len(d.CARDS_BY_DECK["Market"]) == 13


def test_balance_settings(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room = manager.get(code)
    room.game.set_balance({"corruptionMax": 12, "finalRiteAt": 9})
    assert room.game._rule("corruptionMax") == 12
    assert room.game._rule("finalRiteAt") == 9


def test_report_endpoint(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, _, g = _start_game(code)
    r = client.get(f"/dethrone/api/rooms/{code}/report")
    assert r.status_code == 200
    md = r.json()["markdown"]
    assert "Playtest Report" in md
    assert "Chronicle" in md


def test_toggle_elimination_host(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target = pids[1]
    host = room.host_id
    with client.websocket_connect(f"/dethrone/ws/{code}?pid={host}&name=Host") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "toggleElim", "playerId": target})
        state = ws.receive_json()
        pub = next(p for p in state["room"]["game"]["players"] if p["id"] == target)
        assert pub["status"] == "eliminated"


def test_play_action_card(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    g.player_by_id(active).action_card_ids.append("spare_coin_purse")
    before = g.player_by_id(active).gold
    with client.websocket_connect(f"/dethrone/ws/{code}?pid={active}&name=Active") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "playCard", "cardId": "spare_coin_purse"})
        state = ws.receive_json()
        me = next(p for p in state["room"]["game"]["players"] if p["id"] == active)
        assert me["gold"] == before + 2
        assert "spare_coin_purse" not in me["actionCardIds"]


def test_tax_collector_takes_from_others(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    for p in g.players:
        _set_non_exempt_roles(p, g)
        if p.id != active:
            p.gold = 2
    ap = g.player_by_id(active)
    ap.action_card_ids.append("tax_collector")
    before = ap.gold
    g.play_action_card(active, "tax_collector")
    assert ap.gold == before + 3  # 3 other players × 1 gold


def test_tax_skips_exempt_firstborn(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    for p in g.players:
        _set_non_exempt_roles(p, g)
    victim = next(pid for pid in pids if pid != active)
    vp = g.player_by_id(victim)
    vp.public_role_id = "firstborn"
    vp.gold = 5
    ap = g.player_by_id(active)
    ap.action_card_ids.append("tax_collector")
    before = ap.gold
    g.play_action_card(active, "tax_collector")
    assert vp.gold == 5
    assert ap.gold == before + 2  # only 2 payers


def test_guild_seal_ignores_tax(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    for p in g.players:
        _set_non_exempt_roles(p, g)
    victim = next(pid for pid in pids if pid != active)
    vp = g.player_by_id(victim)
    vp.gold = 3
    vp.action_card_ids = ["guild_seal"]
    ap = g.player_by_id(active)
    ap.action_card_ids.append("tax_collector")
    g.play_action_card(active, "tax_collector")
    assert "guild_seal" not in vp.action_card_ids
    assert vp.gold == 3


def test_end_turn_offers_final_rite(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.hidden_role_ids = ["cursedone", "thief", "spy"]
    ap.public_role_id = None
    ap.location = "graveyard"
    g.corruption = 8
    g.end_turn(active)
    assert g.active_player().id == active
    assert g.pending_ui_action[active]["kind"] == "final_rite"


def test_perform_final_rite_wins(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.hidden_role_ids = ["cursedone", "thief", "spy"]
    ap.public_role_id = None
    ap.location = "graveyard"
    g.corruption = 8
    g.end_turn(active)
    g.perform_final_rite(active)
    assert g.winner == "cursed"


def test_decline_final_rite_advances_turn(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.hidden_role_ids = ["cursedone", "thief", "spy"]
    ap.public_role_id = None
    ap.location = "graveyard"
    g.corruption = 8
    g.end_turn(active)
    g.decline_final_rite(active)
    assert g.active_player().id != active
    assert active not in g.pending_ui_action


def test_market_day_gives_gold_at_market(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.location = "market"
    ap.action_card_ids.append("market_day")
    before = ap.gold
    g.play_action_card(active, "market_day")
    assert ap.gold == before + 1


def test_bought_round_costs_gold_and_boosts_rep(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    target = next(pid for pid in pids if pid != active)
    ap = g.player_by_id(active)
    tp = g.player_by_id(target)
    ap.location = tp.location = "tavern"
    ap.gold = 3
    ap.action_card_ids.append("bought_round")
    before_gold = ap.gold
    before_rep = ap.rep
    g.play_action_card(active, "bought_round", target_id=target)
    assert ap.gold == before_gold - 1
    assert ap.rep == before_rep + 1
    assert tp.rep == 4  # started at 3


def test_old_prophecy_sets_private_note(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.action_card_ids.append("old_prophecy")
    g.decks["Market"] = ["caravan_manifest", "tax_collector"]
    g.play_action_card(active, "old_prophecy", deck_name="Market")
    view = room.state_for(active)["room"]["game"]
    assert "caravan_manifest" in view["privateNote"]


def test_grave_pact_pending_keep_one(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.action_card_ids.append("grave_pact")
    g.decks["Graveyard"] = ["forbidden_tome", "grave_dust", "last_rites"]
    result = g.play_action_card(active, "grave_pact", rng=__import__("random").Random(0))
    assert result.get("keepOne")
    assert active in g.pending_keep_one
    view = room.state_for(active)["room"]["game"]
    assert view["pendingKeepOne"] is not None
    assert len(view["pendingKeepOne"]["cards"]) == 2


def test_arrest_opens_duel_pending(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    target = next(pid for pid in pids if pid != active)
    ap = g.player_by_id(active)
    tp = g.player_by_id(target)
    ap.location = tp.location = "barracks"
    ap.action_card_ids.append("arrest")
    g.play_action_card(active, "arrest", target_id=target)
    view = room.state_for(active)["room"]["game"]
    assert view["pendingUiAction"]["kind"] == "duel"
    assert view["pendingUiAction"]["defenderId"] == target


def test_royal_command_tax(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.location = "throne"
    g.throne["kingControllerId"] = active
    for p in g.players:
        _set_non_exempt_roles(p, g)
        if p.id != active:
            p.gold = 2
    g.do_location_action(active, "royal_command")
    assert active in g.pending_ui_action
    before = ap.gold
    g.apply_royal_command(active, "tax")
    assert ap.gold == before + 3
    assert active not in g.pending_ui_action


def test_royal_command_pardon(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    target = next(pid for pid in pids if pid != active)
    ap = g.player_by_id(active)
    tp = g.player_by_id(target)
    ap.location = "throne"
    g.throne["queenControllerId"] = active
    g.do_location_action(active, "royal_command")
    before = tp.rep
    g.apply_royal_command(active, "pardon", target_id=target)
    assert tp.rep == before + 1


def test_serious_duel_location_action(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.location = "barracks"
    g.do_location_action(active, "serious_duel")
    view = room.state_for(active)["room"]["game"]
    pui = view["pendingUiAction"]
    assert pui["kind"] == "duel"
    assert pui["attackerId"] == active
    assert pui["serious"] is True


def test_serious_duel_blocked_if_used(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.location = "barracks"
    ap.serious_duel_used = True
    from dethrone.game import MoveError
    with pytest.raises(MoveError, match="Serious Duel already used"):
        g.do_location_action(active, "serious_duel")


def test_deep_research_opens_pending(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.location = "scrolls"
    ap.gold = 5
    g.do_location_action(active, "deep_research")
    assert ap.gold == 3
    view = room.state_for(active)["room"]["game"]
    assert view["pendingUiAction"]["kind"] == "deep_research"


def test_deep_research_deck_top_note(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.location = "scrolls"
    ap.gold = 5
    g.do_location_action(active, "deep_research")
    g.decks["Knowledge"] = ["old_prophecy", "read_records"]
    g.apply_deep_research(active, "deck_top", deck_name="Knowledge")
    view = room.state_for(active)["room"]["game"]
    assert "old_prophecy" in view["privateNote"]
    assert view.get("privateNoteCardId") == "old_prophecy"
    cs = room.state_for(active)["room"]["clientState"]
    assert cs.get("privateNoteCardId") == "old_prophecy"
    assert active not in g.pending_ui_action


def test_deep_research_witness_note(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    witness = next(pid for pid in pids if pid != active)
    ap = g.player_by_id(active)
    wp = g.player_by_id(witness)
    ap.location = wp.location = "scrolls"
    ap.gold = 5
    wp.action_card_ids = ["spare_coin_purse"]
    g.do_location_action(active, "deep_research")
    g.apply_deep_research(active, "witness", target_id=witness, rng=__import__("random").Random(0))
    view = room.state_for(active)["room"]["game"]
    assert "spare_coin_purse" in view["privateNote"]
    assert view.get("privateNoteCardId") == "spare_coin_purse"


def test_bot_skips_royal_command_without_throne(client):
    """Bots at the Throne must not exercise Royal Command unless they control it."""
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room = manager.get(code)
    manager.join(room, "human1", "Alice")
    room.players["human1"].connected = True
    manager.fill_bots(room)
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        pub = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, pub)
    manager.begin_game(room, "random", 0)
    bot = next(p for p in g.players if p.is_bot)
    bot.location = "throne"
    g.throne["kingControllerId"] = None
    g.throne["queenControllerId"] = None
    g.active_player_index = g.players.index(bot)
    rng = __import__("random").Random(42)
    g.bot_take_turn(bot.id, rng)
    assert g.pending_ui_action.get(bot.id, {}).get("kind") != "royal_command"


def test_loyal_bot_can_call_out_cursed(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room = manager.get(code)
    manager.join(room, "human1", "Alice")
    room.players["human1"].connected = True
    manager.fill_bots(room)
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        pub = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, pub)
    manager.begin_game(room, "random", 0)
    cursed = next(p for p in g.players if g.bot_is_cursed(p))
    loyal = next(p for p in g.players if p.is_bot and not g.bot_is_cursed(p))
    g.corruption = 4

    class _Rng:
        def __init__(self):
            self.n = 0
        def random(self):
            self.n += 1
            return 0.1  # always take social branch
        def choice(self, seq):
            return seq[0]
        def randrange(self, n):
            return 0

    g._bot_try_social(loyal, _Rng())
    assert g.winner == "loyal"


def test_bot_auto_role_discard(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room = manager.get(code)
    manager.fill_bots(room)
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        pub = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, pub)
    manager.begin_game(room, "random", 0)
    bot = next(p for p in g.players if p.is_bot)
    before_roles = len(bot.hidden_role_ids) + (1 if bot.public_role_id else 0)
    g.require_role_discard(bot.id, "test")
    g._bot_auto_role_discard(bot.id, room.rng)
    assert bot.id not in g.pending_role_discard
    after_roles = len(bot.hidden_role_ids) + (1 if bot.public_role_id else 0)
    assert after_roles < before_roles


def test_kick_player_in_lobby(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room = manager.get(code)
    host = "host1"
    manager.join(room, host, "Host")
    room.players[host].connected = True
    manager.join(room, "guest1", "Guest")
    room.players["guest1"].connected = True
    manager.kick_player(room, host, "guest1")
    assert "guest1" not in room.players
    assert len(room.players) == 1


def test_end_turn_blocked_over_hand_limit(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    p = g.player_by_id(active)
    limit = g._rule("handLimit")
    while len(p.action_card_ids) <= limit:
        p.action_card_ids.append("spare_coin_purse")
    from dethrone.game import MoveError
    with pytest.raises(MoveError, match="Discard down"):
        g.end_turn(active)


def test_spectator_sees_no_hidden_roles(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    with client.websocket_connect(f"/dethrone/ws/{code}?pid=spec1&name=Watcher&spectate=1") as ws:
        hello = ws.receive_json()
        assert hello.get("spectator") is True
        state = ws.receive_json()
        assert state["you"]["isSpectator"] is True
        for p in state["room"]["game"]["players"]:
            assert p["hiddenRoleIds"] == []
            assert p["actionCardIds"] == []


def test_spectators_disabled(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room = manager.get(code)
    room.allow_spectators = False
    with client.websocket_connect(f"/dethrone/ws/{code}?pid=spec2&name=Watcher&spectate=1") as ws:
        fatal = ws.receive_json()
        assert fatal["type"] == "fatal"


def test_set_allow_spectators_host(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids = _room_with_players(code, 2)
    host = room.host_id
    with client.websocket_connect(f"/dethrone/ws/{code}?pid={host}&name=Host") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "setAllowSpectators", "allow": False})
        state = ws.receive_json()
        assert state["room"]["settings"]["allowSpectators"] is False


def test_fence_sells_card(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.action_card_ids = ["fence", "spare_coin_purse"]
    before = ap.gold
    g.play_action_card(active, "fence", discard_card_id="spare_coin_purse")
    assert "spare_coin_purse" not in ap.action_card_ids
    assert ap.gold == before + 1  # Market deck buy cost 2 → sell for 1


def test_court_summons_moves_target(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    target = next(pid for pid in pids if pid != active)
    ap = g.player_by_id(active)
    ap.action_card_ids.append("court_summons")
    g.play_action_card(active, "court_summons", target_id=target)
    assert g.player_by_id(target).location == "throne"


def test_royal_decree_opens_vote(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    target = next(pid for pid in pids if pid != active)
    ap = g.player_by_id(active)
    ap.action_card_ids.append("royal_decree")
    g.play_action_card(active, "royal_decree", target_id=target)
    assert active in g.pending_ui_action
    assert g.pending_ui_action[active]["kind"] == "vote"
    assert g.pending_ui_action[active]["decree"] is True


def test_duel_card_bonuses(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    att, defn = pids[0], pids[1]
    ap = g.player_by_id(att)
    dp = g.player_by_id(defn)
    _set_non_exempt_roles(dp, g)
    ap.action_card_ids = ["hidden_knife"]
    dp.action_card_ids = []
    ap.location = dp.location = "tavern"
    g.duel_apply_consequence(att, defn, 0, 0, False, "shame", room.rng, att_card_ids=["hidden_knife"])
    assert "hidden_knife" not in ap.action_card_ids
    assert dp.rep == 2  # shame -1 from start rep 3


def test_vote_card_hidden_witness(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target = pids[2]
    voter = pids[1]
    vp = g.player_by_id(voter)
    vp.action_card_ids = ["hidden_witness"]
    votes = {pid: "yes" for pid in pids}
    g.apply_formal_vote(
        "accuse", target, votes, vote_cards=[{"playerId": voter, "cardId": "hidden_witness", "side": "yes"}],
        **_vote_opts(pids[0]),
    )
    assert "hidden_witness" not in vp.action_card_ids


def test_bribe_accepted_transfers_gold_and_sets_vote(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target_id = pids[2]
    briber_id = pids[1]
    voter_id = pids[3]
    briber = g.player_by_id(briber_id)
    target = g.player_by_id(target_id)
    briber.gold = 3
    target.gold = 1
    briber.action_card_ids = ["bribe"]
    votes = {voter_id: "no", briber_id: "yes"}
    g.apply_formal_vote(
        "accuse",
        target_id,
        votes,
        bribes=[{
            "briberId": briber_id,
            "targetId": voter_id,
            "side": "yes",
            "accepted": True,
        }],
        **_vote_opts(pids[0]),
    )
    assert briber.gold == 2
    assert g.player_by_id(voter_id).gold == 3
    assert "bribe" not in briber.action_card_ids
    assert target_id in g.pending_role_discard


def test_bribe_refused_discards_without_gold(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target_id = pids[2]
    briber_id = pids[1]
    voter_id = pids[3]
    briber = g.player_by_id(briber_id)
    voter = g.player_by_id(voter_id)
    briber.gold = 3
    voter.gold = 2
    briber.action_card_ids = ["bribe"]
    votes = {voter_id: "no", briber_id: "yes", pids[0]: "no"}
    g.apply_formal_vote(
        "accuse",
        target_id,
        votes,
        bribes=[{
            "briberId": briber_id,
            "targetId": voter_id,
            "side": "yes",
            "accepted": False,
        }],
        **_vote_opts(pids[0]),
    )
    assert briber.gold == 3
    assert voter.gold == 2
    assert "bribe" not in briber.action_card_ids
    assert target_id not in g.pending_role_discard


def test_crown_witness_requires_throne(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target = pids[2]
    voter = pids[1]
    vp = g.player_by_id(voter)
    vp.action_card_ids = ["crown_witness"]
    vp.location = "market"
    votes = {pid: "yes" for pid in pids}
    with pytest.raises(Exception) as exc:
        g.apply_formal_vote(
            "accuse",
            target,
            votes,
            vote_cards=[{"playerId": voter, "cardId": "crown_witness", "side": "yes"}],
            **_vote_opts(pids[0]),
        )
    assert "Throne" in str(exc.value)


def test_crown_witness_at_throne(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target = pids[2]
    voter = pids[1]
    vp = g.player_by_id(voter)
    tp = g.player_by_id(target)
    tp.action_card_ids = []
    vp.action_card_ids = ["crown_witness"]
    vp.location = "throne"
    votes = {pid: "yes" for pid in pids}
    g.apply_formal_vote(
        "accuse",
        target,
        votes,
        vote_cards=[{"playerId": voter, "cardId": "crown_witness", "side": "yes"}],
        **_vote_opts(pids[0]),
    )
    assert "crown_witness" not in vp.action_card_ids
    assert target in g.pending_role_discard


def test_whisper_vote_at_throne(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target = pids[2]
    advisor = pids[1]
    g.player_by_id(target).action_card_ids = []
    ap = g.player_by_id(advisor)
    ap.location = "throne"
    ap.hidden_role_ids = ["royaladvisor", "thief"]
    votes = {pid: "yes" for pid in pids}
    g.apply_formal_vote(
        "accuse",
        target,
        votes,
        role_vote_powers=[{"playerId": advisor, "roleId": "royaladvisor", "side": "yes"}],
        **_vote_opts(pids[0]),
    )
    assert target in g.pending_role_discard


def test_whisper_vote_requires_throne(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target = pids[2]
    advisor = pids[1]
    ap = g.player_by_id(advisor)
    ap.location = "market"
    ap.hidden_role_ids = ["royaladvisor", "thief"]
    votes = {pid: "yes" for pid in pids}
    with pytest.raises(Exception) as exc:
        g.apply_formal_vote(
            "accuse",
            target,
            votes,
            role_vote_powers=[{"playerId": advisor, "roleId": "royaladvisor", "side": "yes"}],
            **_vote_opts(pids[0]),
        )
    assert "Throne" in str(exc.value)


def test_study_companion_ally_peek(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player()
    ally = next(p for p in g.players if p.id != active.id)
    active.location = ally.location = "college"
    active.action_card_ids = ["study_companion", "spare_coin_purse"]
    g.decks["Knowledge"] = ["old_prophecy", "read_records"]
    g.play_action_card(active.id, "study_companion", target_id=ally.id, rng=__import__("random").Random(0))
    assert "study_companion" not in active.action_card_ids
    assert len(active.action_card_ids) == 2  # kept spare_coin_purse + drew one
    note = g.private_notes.get(ally.id, "")
    assert "hand includes" in note
    assert g.private_note_card_ids.get(ally.id) in ("spare_coin_purse", "old_prophecy")
    ally_view = room.state_for(ally.id)["room"]["game"]
    assert "hand includes" in ally_view.get("privateNote", "")
    active_view = room.state_for(active.id)["room"]["game"]
    assert not active_view.get("privateNote")


def test_stitched_lip_offers_on_rumour(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    active = g.active_player().id
    victim = next(pid for pid in pids if pid != active)
    vp = g.player_by_id(victim)
    _set_non_exempt_roles(vp, g)
    vp.gold = 0
    vp.action_card_ids = ["stitched_lip"]
    ap = g.player_by_id(active)
    ap.action_card_ids.append("rumour_card")
    g.play_action_card(active, "rumour_card", target_id=victim)
    assert victim in g.pending_ui_action
    assert g.pending_ui_action[victim]["kind"] == "reaction"


def test_stitched_lip_cancels_rumour(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    active = g.active_player().id
    victim = next(pid for pid in pids if pid != active)
    vp = g.player_by_id(victim)
    _set_non_exempt_roles(vp, g)
    before_rep = vp.rep
    vp.gold = 0
    vp.action_card_ids = ["stitched_lip"]
    ap = g.player_by_id(active)
    ap.action_card_ids.append("rumour_card")
    g.play_action_card(active, "rumour_card", target_id=victim)
    g.resolve_reaction(victim, "stitched_lip")
    assert vp.rep == before_rep
    assert "stitched_lip" not in vp.action_card_ids


def test_move_sets_moved_flag(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.public_role_id = "gateguard"
    ap.hidden_role_ids = ["thief", "royalguard"]
    dest = g.legal_moves(ap)[0]
    g.move_player(active, dest)
    assert ap.moved_this_turn is True


def test_role_ability_steal(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    victim = next(pid for pid in pids if pid != active)
    vp = g.player_by_id(victim)
    ap.public_role_id = "thief"
    ap.location = vp.location = "market"
    vp.gold = 3
    before = ap.gold
    g.use_role_ability(active, "thief_steal", victim)
    assert ap.gold == before + 1
    assert vp.gold == 2


def test_role_ability_wrong_public_role(client):
    from dethrone.game import MoveError
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.public_role_id = "gateguard"
    with pytest.raises(MoveError, match="public role"):
        g.use_role_ability(active, "thief_steal", pids[1])


def test_succession_claim_requires_throne(client):
    from dethrone.game import MoveError
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = pids[0]
    p = g.player_by_id(pid)
    p.location = "market"
    p.public_role_id = "firstborn"
    p.hidden_role_ids = ["thief", "wanderingknight"]
    g.open_succession()
    with pytest.raises(MoveError, match="Throne"):
        g.add_succession_claim(pid, "firstborn")


def test_succession_claim_requires_role(client):
    from dethrone.game import MoveError
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = pids[0]
    p = g.player_by_id(pid)
    p.location = "throne"
    p.public_role_id = "gateguard"
    p.hidden_role_ids = ["thief", "wanderingknight"]
    g.open_succession()
    with pytest.raises(MoveError, match="succession role"):
        g.add_succession_claim(pid, "firstborn")


def test_royal_role_lost_on_king_discard(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = pids[0]
    p = g.player_by_id(pid)
    p.public_role_id = "king"
    p.hidden_role_ids = ["thief", "wanderingknight"]
    g.apply_role_discard(pid, "public", "king")
    assert g.royal_role_lost is True


def test_quick_escape_cancels_rep_loss(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    active = g.active_player().id
    ap = g.player_by_id(active)
    _set_non_exempt_roles(ap, g)
    ap.action_card_ids = ["quick_escape"]
    before_rep = ap.rep
    assert g._maybe_offer_rep_loss(active, -1, "Test", trigger="rep_loss")
    g.resolve_reaction(active, "quick_escape")
    assert g.pending_ui_action.get(active, {}).get("kind") == "reaction_move"
    assert ap.rep == before_rep


def test_drunken_alibi_at_tavern(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    victim = pids[1]
    vp = g.player_by_id(victim)
    vp.location = "tavern"
    vp.action_card_ids = ["drunken_alibi"]
    before = vp.rep
    assert g._maybe_offer_rep_loss(victim, -1, "Test", trigger="rep_loss")
    g.resolve_reaction(victim, "drunken_alibi")
    assert vp.rep == before


def test_drunken_alibi_requires_tavern(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    victim = pids[1]
    vp = g.player_by_id(victim)
    vp.location = "market"
    vp.action_card_ids = ["drunken_alibi"]
    assert g._eligible_reactions(vp, "rep_loss") == []
    vp.location = "tavern"
    assert "drunken_alibi" in g._eligible_reactions(vp, "rep_loss")


def test_flee_reaction_cancels_duel_pending(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    att = g.active_player().id
    deff = next(pid for pid in pids if pid != att)
    dp = g.player_by_id(deff)
    dp.location = g.player_by_id(att).location
    dp.action_card_ids = ["flee"]
    g.pending_ui_action[att] = {"kind": "duel", "attackerId": att, "defenderId": deff}
    g.pending_ui_action[deff] = {
        "kind": "reaction",
        "trigger": "duel_declared",
        "cards": ["flee"],
        "resume": {"effect": "cancel_duel", "attackerId": att},
    }
    before_rep = dp.rep
    g.resolve_reaction(deff, "flee")
    assert att not in g.pending_ui_action
    assert g.pending_ui_action.get(deff, {}).get("kind") == "reaction_move"
    assert dp.rep == before_rep - 1


def test_bot_succession_claim_at_throne(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    room.players[pids[0]].is_bot = True
    bot = g.players[0]
    bot.is_bot = True
    bot.location = "throne"
    bot.public_role_id = "firstborn"
    bot.hidden_role_ids = ["thief", "wanderingknight"]
    g.open_succession()
    import random
    assert g._bot_try_succession(bot, random.Random(0)) is True
    claims = g.throne["succession"]["claims"]
    assert any(c["playerId"] == bot.id and c["roleId"] == "firstborn" for c in claims)


def test_bot_duel_same_location(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    att = g.active_player()
    att.is_bot = True
    _set_non_exempt_roles(att, g)
    victim = next(x for x in g.players if x.id != att.id and x.status == "active")
    _set_non_exempt_roles(victim, g)
    victim.location = att.location
    import random
    rng = random.Random(1)
    before_rep = victim.rep
    assert g._bot_try_duel(att, rng) is True
    assert victim.rep <= before_rep


def test_export_report_includes_throne_and_chronicle_stats(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    g.throne["kingControllerId"] = pids[0]
    g.open_succession()
    claimant = g.player_by_id(pids[1])
    claimant.location = "throne"
    claimant.hidden_role_ids = ["firstborn", "thief"]
    g.add_succession_claim(pids[1], "firstborn")
    g._log("Test event", "event")
    g._log("Corruption tick", "corruption")
    md = g.export_report(code)
    assert "## Throne" in md
    assert "King:" in md
    assert "## Succession" in md
    assert "## Chronicle" in md
    assert "event:" in md
    assert "corruption:" in md
    resp = client.get(f"/dethrone/api/rooms/{code}/report")
    assert resp.status_code == 200
    assert "## Throne" in resp.json()["markdown"]


def test_smugglers_run_tavern_to_barracks(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player()
    active.location = "tavern"
    active.action_card_ids.append("smugglers_run")
    g.play_action_card(active.id, "smugglers_run", location_id="barracks")
    assert active.location == "barracks"
    assert "smugglers_run" not in active.action_card_ids


def test_witness_statement_graveyard_last_round(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player()
    target = next(p for p in g.players if p.id != active.id)
    target.location_last_round = "graveyard"
    active.action_card_ids.append("witness_statement")
    g.play_action_card(active.id, "witness_statement", target_id=target.id)
    assert "Graveyard" in g.private_notes.get(active.id, "")
    assert "was" in g.private_notes.get(active.id, "")


def test_guild_seal_proactive_tax_skip(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player()
    collector = next(p for p in g.players if p.id != active.id)
    _set_non_exempt_roles(active, g)
    active.gold = 5
    active.action_card_ids.append("guild_seal")
    g.play_action_card(active.id, "guild_seal")
    assert g.tax_skip_remaining.get(active.id) == 1
    assert "guild_seal" not in active.action_card_ids
    g._collect_tax(collector, 1)
    assert active.gold == 5


def test_trace_steps_prev_location(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player()
    target = next(p for p in g.players if p.id != active.id)
    target.prev_location = "market"
    target.location = "tavern"
    active.action_card_ids.append("trace_steps")
    g.play_action_card(active.id, "trace_steps", target_id=target.id)
    note = g.private_notes.get(active.id, "")
    assert "Market" in note or "market" in note.lower()


def test_scholar_college_to_scrolls(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = pids[0]
    p = g.player_by_id(pid)
    p.location = "college"
    p.public_role_id = "gateguard"
    p.hidden_role_ids = ["thief", "wanderingknight"]
    assert "scrolls" not in g.legal_moves(p)
    p.hidden_role_ids = ["collegeadvisor", "wanderingknight"]
    assert "scrolls" in g.legal_moves(p)
    g.move_player(pid, "scrolls", manual=True)
    assert p.location == "scrolls"


def test_false_trail_redirects_rep(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    spy_id, victim_id = pids[0], pids[1]
    spy = g.player_by_id(spy_id)
    victim = g.player_by_id(victim_id)
    _prepare_rep_victim(victim, g)
    spy.location = victim.location = "market"
    spy.hidden_role_ids = ["spy", "thief"]
    spy.public_role_id = "gateguard"
    before_spy = spy.rep
    before_victim = victim.rep
    assert g._maybe_offer_rep_loss(spy_id, -1, "Test", trigger="rep_loss")
    assert g.pending_ui_action.get(spy_id, {}).get("kind") == "false_trail"
    g.resolve_false_trail(spy_id, accept=True, redirect_id=victim_id)
    assert spy.rep == before_spy
    assert victim.rep == before_victim - 1
    assert "false_trail" in spy.abilities_used_this_game


def test_false_trail_before_reaction(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    spy_id = pids[0]
    other_id = pids[1]
    spy = g.player_by_id(spy_id)
    other = g.player_by_id(other_id)
    spy.location = other.location = "tavern"
    spy.hidden_role_ids = ["spy", "thief"]
    spy.public_role_id = "gateguard"
    spy.action_card_ids = ["drunken_alibi"]
    assert g._maybe_offer_rep_loss(spy_id, -1, "Test", trigger="rep_loss")
    assert g.pending_ui_action.get(spy_id, {}).get("kind") == "false_trail"
    g.resolve_false_trail(spy_id, accept=False)
    assert g.pending_ui_action.get(spy_id, {}).get("kind") == "reaction"
    g.resolve_reaction(spy_id, "drunken_alibi")
    assert spy.rep == 3


def test_stride_two_moves(client):
    from dethrone.game import MoveError
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = g.active_player().id
    p = g.player_by_id(pid)
    p.hidden_role_ids = ["wanderingknight", "thief"]
    p.public_role_id = "gateguard"
    dest1 = g.legal_moves(p)[0]
    g.move_player(pid, dest1)
    assert p.moves_used_this_turn == 1
    assert p.moved_this_turn is False
    dest2 = g.legal_moves(p)[0]
    g.move_player(pid, dest2)
    assert p.moves_used_this_turn == 2
    assert p.moved_this_turn is True
    with pytest.raises(MoveError, match="already moved"):
        g.move_player(pid, g.legal_moves(p)[0])


def test_sanctuary_blocks_rep_loss(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    victim_id, queen_id = pids[0], pids[1]
    victim = g.player_by_id(victim_id)
    queen = g.player_by_id(queen_id)
    _prepare_rep_victim(victim, g)
    queen.hidden_role_ids = ["queen", "thief"]
    queen.public_role_id = "gateguard"
    before = victim.rep
    assert g._maybe_offer_rep_loss(victim_id, -1, "Test", trigger="rep_loss")
    assert g.pending_ui_action.get(queen_id, {}).get("kind") == "sanctuary"
    g.resolve_sanctuary(queen_id, accept=True)
    assert victim.rep == before
    assert "sanctuary" in queen.abilities_used_this_round


def test_sanctuary_before_reaction(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    victim_id, queen_id = pids[0], pids[1]
    victim = g.player_by_id(victim_id)
    queen = g.player_by_id(queen_id)
    _prepare_rep_victim(victim, g)
    victim.action_card_ids = ["quick_escape"]
    queen.hidden_role_ids = ["queen", "thief"]
    queen.public_role_id = "gateguard"
    assert g._maybe_offer_rep_loss(victim_id, -1, "Test", trigger="rep_loss")
    assert g.pending_ui_action.get(queen_id, {}).get("kind") == "sanctuary"
    g.resolve_sanctuary(queen_id, accept=False)
    assert g.pending_ui_action.get(victim_id, {}).get("kind") == "reaction"


def test_stride_via_websocket(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    ap = g.player_by_id(active)
    ap.hidden_role_ids = ["wanderingknight", "thief"]
    ap.public_role_id = "gateguard"

    with client.websocket_connect(f"/dethrone/ws/{code}?pid={active}&name=Active") as ws:
        ws.receive_json()
        state = ws.receive_json()
        moves = state["room"]["game"]["legalMoves"]
        assert moves
        ws.send_json({"type": "move", "locationId": moves[0]})
        state = ws.receive_json()
        assert state["type"] == "state"
        assert state["room"]["game"]["legalMoves"], "stride should allow a second move"
        ws.send_json({"type": "move", "locationId": state["room"]["game"]["legalMoves"][0]})
        state = ws.receive_json()
        assert state["room"]["game"]["legalMoves"] == []


def test_false_trail_via_websocket(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    spy_id = pids[0]
    victim_id = pids[1]
    spy = g.player_by_id(spy_id)
    victim = g.player_by_id(victim_id)
    _prepare_rep_victim(victim, g)
    spy.location = victim.location = "market"
    spy.hidden_role_ids = ["spy", "thief"]
    spy.public_role_id = "gateguard"
    g.pending_ui_action[spy_id] = {
        "kind": "false_trail",
        "playerId": spy_id,
        "delta": -1,
        "reason": "Test",
        "trigger": "rep_loss",
    }
    before_victim = victim.rep

    with client.websocket_connect(f"/dethrone/ws/{code}?pid={spy_id}&name=Spy") as ws:
        ws.receive_json()
        state = ws.receive_json()
        assert state["room"]["game"]["pendingUiAction"]["kind"] == "false_trail"
        ws.send_json({"type": "resolveFalseTrail", "targetId": victim_id})
        ws.receive_json()
    assert victim.rep == before_victim - 1
    assert spy.rep == 3


def test_multi_turn_online_smoke(client):
    """Play four full turns online — move + end turn each."""
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids = _room_with_players(code, 4)
    manager.deal_setup(room)
    g = room.game
    for p in g.players:
        pub = next(r for r in p.dealt_role_ids if D_ROLE_META_PUBLIC(r))
        g.pick_public_role(p.id, pub)
    manager.begin_game(room, "random", 0)
    for p in g.players:
        p.hidden_role_ids = [r for r in p.hidden_role_ids if r != "youngknight"]
        if p.public_role_id == "youngknight":
            p.public_role_id = "gateguard"

    for _ in range(4):
        active = g.active_player().id
        with client.websocket_connect(f"/dethrone/ws/{code}?pid={active}&name=Act") as ws:
            ws.receive_json()
            state = ws.receive_json()
            moves = state["room"]["game"]["legalMoves"]
            if moves:
                ws.send_json({"type": "move", "locationId": moves[0]})
                ws.receive_json()
            ws.send_json({"type": "endTurn"})
            nxt = ws.receive_json()
            assert nxt["type"] == "state"
            assert nxt["room"]["game"]["activePlayerId"] != active
    assert g.round >= 1


def test_sanctuary_via_websocket(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    victim_id, queen_id = pids[0], pids[1]
    victim = g.player_by_id(victim_id)
    queen = g.player_by_id(queen_id)
    _prepare_rep_victim(victim, g)
    queen.hidden_role_ids = ["queen", "thief"]
    queen.public_role_id = "gateguard"
    before = victim.rep
    g.pending_ui_action[queen_id] = {
        "kind": "sanctuary",
        "queenId": queen_id,
        "victimId": victim_id,
        "delta": -1,
        "reason": "Test",
        "trigger": "rep_loss",
        "remainingQueenIds": [],
    }

    with client.websocket_connect(f"/dethrone/ws/{code}?pid={queen_id}&name=Queen") as ws:
        ws.receive_json()
        state = ws.receive_json()
        assert state["room"]["game"]["pendingUiAction"]["kind"] == "sanctuary"
        ws.send_json({"type": "resolveSanctuary"})
        ws.receive_json()
    assert victim.rep == before
    assert "sanctuary" in queen.abilities_used_this_round


def test_protect_blocks_rep_loss(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    victim_id, guard_id = pids[0], pids[1]
    victim = g.player_by_id(victim_id)
    guard = g.player_by_id(guard_id)
    _strip_royal_guards(g, keep_id=guard_id)
    _prepare_rep_victim(victim, g)
    guard.hidden_role_ids = ["royalguard", "thief"]
    guard.public_role_id = "gateguard"
    before = victim.rep
    assert g._maybe_offer_rep_loss(victim_id, -1, "Test", trigger="rep_loss")
    assert g.pending_ui_action.get(guard_id, {}).get("kind") == "protect"
    g.resolve_protect(guard_id, accept=True)
    assert victim.rep == before
    assert "protect" in guard.abilities_used_this_round


def test_protect_before_reaction(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    victim_id, guard_id = pids[0], pids[1]
    victim = g.player_by_id(victim_id)
    guard = g.player_by_id(guard_id)
    _strip_royal_guards(g, keep_id=guard_id)
    _prepare_rep_victim(victim, g)
    victim.action_card_ids = ["quick_escape"]
    guard.hidden_role_ids = ["royalguard", "thief"]
    guard.public_role_id = "gateguard"
    assert g._maybe_offer_rep_loss(victim_id, -1, "Test", trigger="rep_loss")
    assert g.pending_ui_action.get(guard_id, {}).get("kind") == "protect"
    g.resolve_protect(guard_id, accept=False)
    assert g.pending_ui_action.get(victim_id, {}).get("kind") == "reaction"


def test_protect_blocks_drive_out(client):
    import random
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    victim_id, guard_id = pids[0], pids[1]
    victim = g.player_by_id(victim_id)
    guard = g.player_by_id(guard_id)
    _strip_royal_knights(g)
    _strip_royal_guards(g, keep_id=guard_id)
    _strip_queens(g)
    _prepare_rep_victim(victim, g)
    victim.location = "barracks"
    guard.hidden_role_ids = ["royalguard", "thief"]
    guard.public_role_id = "gateguard"
    start_loc = victim.location
    g.duel_apply_consequence(
        pids[2], victim_id, 5, 0, False, "drive", random.Random(0),
    )
    assert g.pending_ui_action.get(guard_id, {}).get("kind") == "protect"
    g.resolve_protect(guard_id, accept=True)
    assert victim.location == start_loc
    assert "protect" in guard.abilities_used_this_round


def test_defend_crown_blocks_shame(client):
    import random
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    royal_id, knight_id = pids[0], pids[1]
    royal = g.player_by_id(royal_id)
    knight = g.player_by_id(knight_id)
    _strip_royal_knights(g, keep_id=knight_id)
    _prepare_rep_victim(royal, g)
    royal.hidden_role_ids = ["thief", "wanderingknight"]
    royal.public_role_id = "gateguard"
    g.set_throne_controller("king", royal_id, "test")
    knight.location = "barracks"
    royal.location = "barracks"
    knight.hidden_role_ids = ["royalknight", "thief"]
    knight.public_role_id = "gateguard"
    before = royal.rep
    g.duel_apply_consequence(
        pids[2], royal_id, 5, 0, False, "shame", random.Random(0),
    )
    assert g.pending_ui_action.get(knight_id, {}).get("kind") == "defend_crown"
    g.resolve_defend_crown(knight_id, accept=True)
    assert royal.rep == before
    assert "defend_crown" in knight.abilities_used_this_round


def test_reckless_charge_offers_after_move(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = g.active_player().id
    knight = g.player_by_id(pid)
    other = g.player_by_id(next(x for x in pids if x != pid))
    knight.hidden_role_ids = ["youngknight", "thief"]
    knight.public_role_id = "gateguard"
    dest = g.legal_moves(knight)[0]
    other.location = dest
    g.move_player(pid, dest)
    assert g.pending_ui_action.get(pid, {}).get("kind") == "reckless_charge"
    assert other.id in g.pending_ui_action[pid]["opponentIds"]


def test_reckless_charge_penalty_on_loss(client):
    import random
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    _strip_royal_guards(g)
    att_id, def_id = pids[0], pids[1]
    att = g.player_by_id(att_id)
    deff = g.player_by_id(def_id)
    _prepare_rep_victim(att, g)
    _prepare_rep_victim(deff, g)
    att.location = deff.location = "barracks"
    before = att.rep
    g.duel_apply_consequence(
        att_id, def_id, 0, 5, False, "disarm", random.Random(0), reckless_charge=True,
    )
    assert att.rep == before - 1


def test_reckless_charge_via_websocket(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = g.active_player().id
    knight = g.player_by_id(pid)
    other = g.player_by_id(next(x for x in pids if x != pid))
    knight.hidden_role_ids = ["youngknight", "thief"]
    knight.public_role_id = "gateguard"
    dest = g.legal_moves(knight)[0]
    other.location = dest
    g.pending_ui_action[pid] = {
        "kind": "reckless_charge",
        "attackerId": pid,
        "opponentIds": [other.id],
    }

    with client.websocket_connect(f"/dethrone/ws/{code}?pid={pid}&name=Knight") as ws:
        ws.receive_json()
        state = ws.receive_json()
        assert state["room"]["game"]["pendingUiAction"]["kind"] == "reckless_charge"
        ws.send_json({"type": "resolveRecklessCharge", "targetId": other.id})
        state = ws.receive_json()
        assert state["room"]["game"]["pendingUiAction"]["kind"] == "duel"
        assert state["room"]["game"]["pendingUiAction"]["recklessCharge"] is True


def test_protect_via_websocket(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    victim_id, guard_id = pids[0], pids[1]
    victim = g.player_by_id(victim_id)
    guard = g.player_by_id(guard_id)
    _strip_queens(g)
    _strip_royal_guards(g)
    _strip_spies(g)
    _strip_royal_guards(g, keep_id=guard_id)
    _prepare_rep_victim(victim, g)
    guard.hidden_role_ids = ["royalguard", "thief"]
    guard.public_role_id = "gateguard"
    before = victim.rep
    g.pending_ui_action[guard_id] = {
        "kind": "protect",
        "guardId": guard_id,
        "victimId": victim_id,
        "eventKind": "rep_loss",
        "delta": -1,
        "reason": "Test",
        "trigger": "rep_loss",
        "remainingGuardIds": [],
    }

    with client.websocket_connect(f"/dethrone/ws/{code}?pid={guard_id}&name=Guard") as ws:
        ws.receive_json()
        state = ws.receive_json()
        assert state["room"]["game"]["pendingUiAction"]["kind"] == "protect"
        ws.send_json({"type": "resolveProtect"})
        ws.receive_json()
    assert victim.rep == before
    assert "protect" in guard.abilities_used_this_round


def test_vote_accuse_without_seconder_fails(client):
    from dethrone.game import MoveError
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    target = pids[2]
    votes = {pid: "yes" for pid in pids}
    with pytest.raises(MoveError, match="seconder"):
        g.apply_formal_vote(
            "accuse", target, votes,
            proposer_id=pids[0], seconder=False, decree=False,
        )


def test_duel_flee_grants_reaction_move(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    att, deff = pids[0], pids[1]
    g.pending_ui_action[att] = {"kind": "duel", "attackerId": att, "defenderId": deff}
    g.duel_flee(deff)
    assert att not in g.pending_ui_action
    assert g.pending_ui_action.get(deff, {}).get("kind") == "reaction_move"
    assert g.pending_ui_action[deff]["maxSteps"] == 2


def test_wounded_blocks_hidden_stride(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = g.active_player().id
    p = g.player_by_id(pid)
    p.public_role_id = "gateguard"
    p.hidden_role_ids = ["wanderingknight", "thief"]
    p.wounded = True
    assert g._move_limit(p) == 1


def test_end_turn_blocked_by_reckless_charge(client):
    from dethrone.game import MoveError
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    pid = g.active_player().id
    g.pending_ui_action[pid] = {
        "kind": "reckless_charge",
        "attackerId": pid,
        "opponentIds": [pids[1]],
    }
    with pytest.raises(MoveError, match="pending prompt"):
        g.end_turn(pid)


def test_formal_vote_via_websocket(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    proposer = g.active_player().id
    target = next(pid for pid in pids if pid != proposer)
    g.player_by_id(target).action_card_ids = []
    votes = {pid: "yes" for pid in pids}

    with client.websocket_connect(f"/dethrone/ws/{code}?pid={proposer}&name=Prop") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({
            "type": "formalVote",
            "vtype": "accuse",
            "targetId": target,
            "proposerId": proposer,
            "seconder": True,
            "decree": False,
            "votes": votes,
            "bonusYes": 0,
            "bonusNo": 0,
        })
        ws.receive_json()
    assert target in g.pending_role_discard


def test_inactive_player_cannot_formal_vote(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    other = next(pid for pid in pids if pid != active)
    target = next(pid for pid in pids if pid not in (active, other))
    votes = {pid: "yes" for pid in pids}
    with client.websocket_connect(f"/dethrone/ws/{code}?pid={other}&name=Other") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({
            "type": "formalVote",
            "vtype": "accuse",
            "targetId": target,
            "proposerId": other,
            "seconder": True,
            "decree": False,
            "votes": votes,
        })
        err = ws.receive_json()
        assert err["type"] == "error"
        assert "active player" in err["message"].lower()


def test_inactive_player_cannot_trade(client):
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    other = next(pid for pid in pids if pid != active)
    partner = next(pid for pid in pids if pid not in (active, other))
    with client.websocket_connect(f"/dethrone/ws/{code}?pid={other}&name=Other") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({
            "type": "trade",
            "aId": other,
            "bId": partner,
            "goldAB": 1,
            "goldBA": 0,
        })
        err = ws.receive_json()
        assert err["type"] == "error"
        assert "active player" in err["message"].lower()


def test_inactive_player_cannot_resolve_duel(client):
    import random
    code = client.post("/dethrone/api/rooms", json={"playerCount": 4}).json()["code"]
    room, pids, g = _start_game(code)
    active = g.active_player().id
    other = next(pid for pid in pids if pid != active)
    defender = next(pid for pid in pids if pid not in (active, other))
    with client.websocket_connect(f"/dethrone/ws/{code}?pid={other}&name=Other") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({
            "type": "duelConsequence",
            "attackerId": other,
            "defenderId": defender,
            "attBonus": 0,
            "defBonus": 0,
            "serious": False,
            "consequence": "shame",
        })
        err = ws.receive_json()
        assert err["type"] == "error"
        assert "active player" in err["message"].lower()


def D_ROLE_META_PUBLIC(role_id: str) -> bool:
    from dethrone.data import ROLE_META
    return ROLE_META.get(role_id, {}).get("canBePublic", True)
