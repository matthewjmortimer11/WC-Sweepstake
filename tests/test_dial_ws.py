"""Integration tests for Dial HTTP + WebSocket multiplayer."""

import time

import pytest
from starlette.testclient import TestClient

import main
from dial.game import points_for
from dial.manager import manager


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def _settle():
    time.sleep(0.15)


def test_wheel_page_served(client):
    r = client.get("/wheel")
    assert r.status_code == 200
    assert "Dial" in r.text
    assert "/wheel/assets/app.js" in r.text


def test_wheel_assets_served(client):
    assert client.get("/wheel/assets/app.js").status_code == 200
    assert client.get("/wheel/assets/styles.css").status_code == 200


def test_points_for_scoring():
    assert points_for(50, 50) == 4
    assert points_for(50, 54) == 4
    assert points_for(50, 60) == 3
    assert points_for(50, 70) == 2
    assert points_for(50, 90) == 0


def test_create_room(client):
    r = client.post("/wheel/api/rooms", json={"mode": "teams", "targetScore": 15})
    assert r.status_code == 200
    body = r.json()
    assert len(body["code"]) >= 4
    assert body["targetScore"] == 15
    room = manager.get(body["code"])
    assert room is not None
    assert room.settings.mode == "teams"


def test_unknown_room_is_fatal(client):
    with client.websocket_connect("/wheel/ws/ZZZZ?pid=p1") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "fatal"


def test_teams_game_psychic_sees_target(client):
    code = client.post("/wheel/api/rooms", json={"mode": "teams"}).json()["code"]
    with client.websocket_connect(f"/wheel/ws/{code}?pid=p1&name=Alice") as p1, \
         client.websocket_connect(f"/wheel/ws/{code}?pid=p2&name=Bob") as p2, \
         client.websocket_connect(f"/wheel/ws/{code}?pid=p3&name=Cara") as p3:

        for ws in (p1, p2, p3):
            assert ws.receive_json()["type"] == "hello"
            ws.receive_json()  # state

        p1.send_json({"type": "setTeam", "team": "team0"})
        p2.send_json({"type": "setTeam", "team": "team1"})
        p3.send_json({"type": "setTeam", "team": "team0"})
        p1.send_json({"type": "start"})
        _settle()

        room = manager.get(code)
        assert room.game.status == "playing"
        psychic_id = room.game.psychic_id
        assert psychic_id

        psychic_view = room.state_for(psychic_id)
        assert "target" in psychic_view["room"]["game"]

        for pid in ("p1", "p2", "p3"):
            if pid == psychic_id:
                continue
            view = room.state_for(pid)
            assert "target" not in view["room"]["game"]


def test_ffa_round_flow(client):
    code = client.post("/wheel/api/rooms", json={"mode": "ffa"}).json()["code"]
    with client.websocket_connect(f"/wheel/ws/{code}?pid=a&name=Ann") as a, \
         client.websocket_connect(f"/wheel/ws/{code}?pid=b&name=Ben") as b:

        for ws in (a, b):
            ws.receive_json()  # hello
            ws.receive_json()  # state

        a.send_json({"type": "start"})
        _settle()

        room = manager.get(code)
        psychic = room.game.psychic_id
        guesser = "b" if psychic == "a" else "a"
        ws_psy = a if psychic == "a" else b
        ws_guess = b if guesser == "b" else a

        ws_psy.send_json({"type": "psychicReady"})
        _settle()
        ws_guess.send_json({"type": "setGuess", "value": 50})
        ws_guess.send_json({"type": "lockGuess"})
        _settle()

        room = manager.get(code)
        assert room.game.phase == "reveal"
        assert room.game.guesses.get(guesser) == 50


def test_target_not_leaked_before_reveal(client):
    code = client.post("/wheel/api/rooms").json()["code"]
    with client.websocket_connect(f"/wheel/ws/{code}?pid=p1&name=One") as p1, \
         client.websocket_connect(f"/wheel/ws/{code}?pid=p2&name=Two") as p2:

        for ws in (p1, p2):
            ws.receive_json()
            ws.receive_json()
        p1.send_json({"type": "setTeam", "team": "team0"})
        p2.send_json({"type": "setTeam", "team": "team1"})
        p1.send_json({"type": "start"})
        _settle()

        room = manager.get(code)
        psychic_id = room.game.psychic_id
        guesser_id = "p2" if psychic_id == "p1" else "p1"

        room.game.psychic_ready(psychic_id)
        room.game.set_guess(guesser_id, 40)

        guesser_view = room.state_for(guesser_id)
        assert guesser_view["room"]["game"]["phase"] == "guess"
        assert "target" not in guesser_view["room"]["game"]


def test_clue_hidden_until_guess_phase(client):
    code = client.post("/wheel/api/rooms").json()["code"]
    with client.websocket_connect(f"/wheel/ws/{code}?pid=p1&name=One") as p1, \
         client.websocket_connect(f"/wheel/ws/{code}?pid=p2&name=Two") as p2:

        for ws in (p1, p2):
            ws.receive_json()
            ws.receive_json()
        p1.send_json({"type": "setTeam", "team": "team0"})
        p2.send_json({"type": "setTeam", "team": "team1"})
        p1.send_json({"type": "start"})
        _settle()

        room = manager.get(code)
        psychic_id = room.game.psychic_id
        psychic_ws = p1 if psychic_id == "p1" else p2
        guesser_ws = p2 if psychic_ws is p1 else p1

        psychic_ws.send_json({"type": "setClue", "text": "Think tropical"})
        _settle()

        psychic_view = room.state_for(psychic_id)
        assert psychic_view["room"]["game"].get("clue") == "Think tropical"

        guesser_id = "p2" if psychic_id == "p1" else "p1"
        guesser_view = room.state_for(guesser_id)
        assert "clue" not in guesser_view["room"]["game"]

        psychic_ws.send_json({"type": "psychicReady"})
        _settle()

        guesser_view = room.state_for(guesser_id)
        assert guesser_view["room"]["game"].get("clue") == "Think tropical"


def test_party_games_routes_all_serve(client):
    for path in ("/games", "/play", "/imposter", "/charades", "/wheel", "/whoami"):
        assert client.get(path).status_code == 200


def test_disconnected_guesser_does_not_block_reveal(client):
    """A dropped guesser must not stall the round for connected players."""
    code = client.post("/wheel/api/rooms", json={"mode": "ffa"}).json()["code"]
    with client.websocket_connect(f"/wheel/ws/{code}?pid=a&name=Ann") as a, \
         client.websocket_connect(f"/wheel/ws/{code}?pid=b&name=Ben") as b, \
         client.websocket_connect(f"/wheel/ws/{code}?pid=c&name=Cara") as c:

        for ws in (a, b, c):
            ws.receive_json()
            ws.receive_json()

        a.send_json({"type": "start"})
        _settle()

        room = manager.get(code)
        psychic = room.game.psychic_id
        guessers = [p for p in ("a", "b", "c") if p != psychic]
        ws_psy = a if psychic == "a" else (b if psychic == "b" else c)
        ws_g1 = b if psychic != "b" else c
        ws_g2 = c if psychic != "c" else b

        ws_psy.send_json({"type": "psychicReady"})
        _settle()

        # One guesser locks in; the other disconnects.
        ws_g1.send_json({"type": "setGuess", "value": 50})
        ws_g1.send_json({"type": "lockGuess"})
        room.players[guessers[1]].connected = False
        manager.handle_disconnect(room, guessers[1])
        _settle()

        room = manager.get(code)
        assert room.game.phase == "reveal"
