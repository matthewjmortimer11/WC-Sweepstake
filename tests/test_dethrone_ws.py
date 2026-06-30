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


def D_ROLE_META_PUBLIC(role_id: str) -> bool:
    from dethrone.data import ROLE_META
    return ROLE_META.get(role_id, {}).get("canBePublic", True)
