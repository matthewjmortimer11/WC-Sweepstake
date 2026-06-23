"""Integration tests for Imposter HTTP + WebSocket multiplayer."""

import time

import pytest
from starlette.testclient import TestClient

import main
from imposter.manager import manager


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def _settle():
    time.sleep(0.15)


def _room_with_four(code: str):
    room = manager.get(code)
    pids = ["p1", "p2", "p3", "p4"]
    for i, pid in enumerate(pids):
        manager.join(room, pid, f"Player {i + 1}")
        room.players[pid].connected = True
    return room, pids


def test_create_room(client):
    r = client.post("/imposter/api/rooms", json={"mode": "classic", "timerSecs": 60})
    assert r.status_code == 200
    body = r.json()
    assert len(body["code"]) >= 4
    assert body["mode"] == "classic"
    room = manager.get(body["code"])
    assert room is not None


def test_unknown_room_is_fatal(client):
    with client.websocket_connect("/imposter/ws/ZZZZ?pid=p1") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "fatal"


def test_classic_role_secrecy(client):
    code = client.post("/imposter/api/rooms", json={"mode": "classic"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)

    assert room.game.status == "playing"
    assert room.game.phase == "peek"

    for pid in pids:
        view = room.state_for(pid)["room"]["game"]
        assert "isImposter" in view

    room.game.mark_viewed(pids[0])
    hidden = room.state_for(pids[0])["room"]["game"]
    assert "isImposter" not in hidden


def test_celebrity_peek_and_reveal(client):
    code = client.post("/imposter/api/rooms", json={"mode": "celebrity"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)

    for pid in pids:
        peek = room.state_for(pid)["room"]["game"]
        assert "myCeleb" in peek

    for pid in pids:
        room.game.mark_viewed(pid)
    assert room.game.phase == "play"

    room.game.reveal_answer()
    view = room.state_for(pids[0])["room"]["game"]
    assert "imposterId" in view
    assert "oddCeleb" in view
    assert "commonCeleb" in view


def test_charades_actor_sees_word(client):
    code = client.post("/imposter/api/rooms", json={"mode": "charades", "timerSecs": 30}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)

    actor_id = room.game.actor_id()
    assert actor_id in pids

    actor_view = room.state_for(actor_id)["room"]["game"]
    assert "charadesWord" in actor_view

    for pid in pids:
        if pid == actor_id:
            continue
        view = room.state_for(pid)["room"]["game"]
        assert "charadesWord" not in view


def test_ws_join_broadcasts_state(client):
    code = client.post("/imposter/api/rooms", json={"mode": "classic"}).json()["code"]
    with client.websocket_connect(f"/imposter/ws/{code}?pid=p1&name=One") as ws:
        assert ws.receive_json()["type"] == "hello"
        state = ws.receive_json()
        assert state["type"] == "state"
        assert state["room"]["code"] == code
