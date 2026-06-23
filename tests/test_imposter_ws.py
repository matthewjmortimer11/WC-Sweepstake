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


def test_peek_advances_when_player_abandons(client):
    code = client.post("/imposter/api/rooms", json={"mode": "classic"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)

    for pid in pids[:3]:
        room.game.mark_viewed(pid)
    assert room.game.phase == "peek"

    room.game.abandon_peek(pids[3])
    assert room.game.phase == "play"
    assert len(room.game.viewed) == 4


def test_award_charade_requires_actor(client):
    from imposter.game import MoveError
    from imposter.manager import Player
    from imposter.router import _dispatch

    code = client.post("/imposter/api/rooms", json={"mode": "charades"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    actor_id = room.game.actor_id()
    non_actor = next(p for p in pids if p != actor_id)
    guesser = next(p for p in pids if p not in (actor_id, non_actor))

    room.players[actor_id] = Player(id=actor_id, name="Actor", connected=True)
    room.players[non_actor] = Player(id=non_actor, name="Other", connected=True)

    with pytest.raises(MoveError, match="actor"):
        _dispatch(room, room.players[non_actor], "awardCharade", {"guesserId": guesser})


def test_host_can_skip_charade(client):
    from imposter.router import _dispatch

    code = client.post("/imposter/api/rooms", json={"mode": "charades"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    first_actor = room.game.actor_id()
    host_id = pids[0]
    for p in room.players.values():
        p.is_host = (p.id == host_id)

    _dispatch(room, room.players[host_id], "skipCharade", {})
    assert room.game.actor_id() != first_actor


def test_ws_join_broadcasts_state(client):
    code = client.post("/imposter/api/rooms", json={"mode": "classic"}).json()["code"]
    with client.websocket_connect(f"/imposter/ws/{code}?pid=p1&name=One") as ws:
        assert ws.receive_json()["type"] == "hello"
        state = ws.receive_json()
        assert state["type"] == "state"
        assert state["room"]["code"] == code
