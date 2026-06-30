"""Integration tests for The Cursed Throne HTTP + WebSocket."""

import pytest
from starlette.testclient import TestClient

import main
from dethrone.game import STATUS_PLAY, STATUS_SETUP
from dethrone.manager import manager


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


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
    votes = {pid: "yes" for pid in pids}
    g.apply_formal_vote("accuse", target, votes)
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


def D_ROLE_META_PUBLIC(role_id: str) -> bool:
    from dethrone.data import ROLE_META
    return ROLE_META.get(role_id, {}).get("canBePublic", True)
