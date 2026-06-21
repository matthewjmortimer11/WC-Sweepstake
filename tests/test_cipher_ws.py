"""Integration tests for the Cipher HTTP + WebSocket surface.

The app runs in-process under Starlette's TestClient, so where reading a precise
sequence of broadcast messages across several sockets would be racy, we assert
against the in-memory ``manager`` state directly instead.
"""

import time

import pytest
from starlette.testclient import TestClient

import main
from codenames.game import RED
from codenames.manager import manager


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def _settle():
    time.sleep(0.15)


def test_play_page_served(client):
    r = client.get("/play")
    assert r.status_code == 200
    assert "Cipher" in r.text


def test_packs_endpoint(client):
    r = client.get("/play/api/packs")
    assert r.status_code == 200
    body = r.json()
    assert body["packs"]
    assert 5 in body["sizes"]
    assert {"min", "max", "step"} <= set(body["timer"])
    assert body["timer"]["min"] >= 1


def test_assets_served(client):
    assert client.get("/play/assets/app.js").status_code == 200
    assert client.get("/play/assets/styles.css").status_code == 200


def test_assets_path_traversal_blocked(client):
    r = client.get("/play/assets/..%2Frouter.py")
    assert r.status_code in (400, 404)


def test_create_room_and_join_ws(client):
    code = client.post("/play/api/rooms").json()["code"]
    assert len(code) >= 4
    with client.websocket_connect(f"/play/ws/{code}?pid=p1&name=Alice") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        state = ws.receive_json()
        assert state["type"] == "state"
        assert state["room"]["code"] == code
        assert state["you"]["isHost"] is True
        assert any(p["name"] == "Alice" for p in state["room"]["players"])


def test_create_room_with_afterdark_pack_preset(client):
    r = client.post("/play/api/rooms", json={"packId": "afterdark"})
    body = r.json()
    assert body["packId"] == "afterdark"
    code = body["code"]
    room = manager.get(code)
    assert room.settings.pack_id == "afterdark"
    assert room.settings.pack_name == "After Dark"


def test_create_room_unknown_pack_falls_back_to_classic(client):
    r = client.post("/play/api/rooms", json={"packId": "bogus"})
    assert r.json()["packId"] == "classic"


def test_unknown_room_is_fatal(client):
    with client.websocket_connect("/play/ws/ZZZZ?pid=p1") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "fatal"


def test_first_joiner_is_host_and_only_host_starts(client):
    code = client.post("/play/api/rooms").json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=rs&name=RedSpy") as rs, \
         client.websocket_connect(f"/play/ws/{code}?pid=ro&name=RedOp") as ro, \
         client.websocket_connect(f"/play/ws/{code}?pid=bs&name=BlueSpy") as bs, \
         client.websocket_connect(f"/play/ws/{code}?pid=bo&name=BlueOp") as bo:

        rs.send_json({"type": "setTeam", "team": "red"})
        rs.send_json({"type": "setRole", "role": "spymaster"})
        ro.send_json({"type": "setTeam", "team": "red"})
        ro.send_json({"type": "setRole", "role": "operative"})
        bs.send_json({"type": "setTeam", "team": "blue"})
        bs.send_json({"type": "setRole", "role": "spymaster"})
        bo.send_json({"type": "setTeam", "team": "blue"})
        bo.send_json({"type": "setRole", "role": "operative"})
        _settle()

        room = manager.get(code)
        assert room.host_id == "rs"  # first joiner

        # A non-host trying to start is ignored (stays in lobby).
        bo.send_json({"type": "start"})
        _settle()
        assert room.game.status == "lobby"

        # The host can start.
        rs.send_json({"type": "start"})
        _settle()
        assert room.game.status == "playing"

        # Anti-cheat: the red spymaster sees the key; the red operative does not.
        spy_state = room.state_for("rs")
        op_state = room.state_for("ro")
        assert spy_state["you"]["revealKey"] is True
        assert op_state["you"]["revealKey"] is False
        hidden = [c for c in op_state["room"]["game"]["cards"] if not c["revealed"]]
        assert all(c["kind"] == "hidden" for c in hidden)
        assert any(c["kind"] != "hidden" for c in spy_state["room"]["game"]["cards"])


def test_full_round_playable_over_state(client):
    code = client.post("/play/api/rooms").json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=rs") as rs, \
         client.websocket_connect(f"/play/ws/{code}?pid=ro") as ro, \
         client.websocket_connect(f"/play/ws/{code}?pid=bs") as bs, \
         client.websocket_connect(f"/play/ws/{code}?pid=bo") as bo:

        rs.send_json({"type": "setTeam", "team": "red"})
        rs.send_json({"type": "setRole", "role": "spymaster"})
        ro.send_json({"type": "setTeam", "team": "red"})
        ro.send_json({"type": "setRole", "role": "operative"})
        bs.send_json({"type": "setTeam", "team": "blue"})
        bs.send_json({"type": "setRole", "role": "spymaster"})
        bo.send_json({"type": "setTeam", "team": "blue"})
        bo.send_json({"type": "setRole", "role": "operative"})
        _settle()
        rs.send_json({"type": "start"})
        _settle()

        room = manager.get(code)
        game = room.game
        assert game.status == "playing"
        starting = game.current_team
        spy_pid = "rs" if starting == RED else "bs"
        op_pid = "ro" if starting == RED else "bo"
        spy_ws = rs if starting == RED else bs
        op_ws = ro if starting == RED else bo

        # Spymaster gives a clue; operative guesses one of its own agents.
        spy_ws.send_json({"type": "clue", "word": "signal", "count": 1})
        _settle()
        own = next(i for i, c in enumerate(game.cards)
                   if c.kind == starting and not c.revealed)
        before = game.remaining(starting)
        op_ws.send_json({"type": "guess", "index": own})
        _settle()
        assert game.remaining(starting) == before - 1
        assert game.cards[own].revealed is True
