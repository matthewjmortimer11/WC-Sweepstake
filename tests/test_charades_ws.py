"""Integration tests for Charades HTTP + WebSocket."""

import pytest
from starlette.testclient import TestClient

import main
from charades.manager import manager


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def _room_with_four(code: str):
    room = manager.get(code)
    pids = ["p1", "p2", "p3", "p4"]
    for i, pid in enumerate(pids):
        manager.join(room, pid, f"Player {i + 1}")
        room.players[pid].connected = True
    return room, pids


def test_create_room(client):
    r = client.post("/charades/api/rooms", json={"timerSecs": 30})
    assert r.status_code == 200
    assert manager.get(r.json()["code"]) is not None


def test_actor_sees_word(client):
    code = client.post("/charades/api/rooms").json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    actor_id = room.game.actor_id()
    assert "word" in room.state_for(actor_id)["room"]["game"]
    for pid in pids:
        if pid != actor_id:
            assert "word" not in room.state_for(pid)["room"]["game"]


def test_award_requires_actor(client):
    from charades.game import MoveError
    from charades.manager import Player
    from charades.router import _dispatch

    code = client.post("/charades/api/rooms").json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    actor_id = room.game.actor_id()
    non_actor = next(p for p in pids if p != actor_id)
    guesser = next(p for p in pids if p not in (actor_id, non_actor))
    room.players[actor_id] = Player(id=actor_id, name="Actor", connected=True)
    room.players[non_actor] = Player(id=non_actor, name="Other", connected=True)
    with pytest.raises(MoveError, match="actor"):
        _dispatch(room, room.players[non_actor], "awardCharade", {"guesserId": guesser})


def test_host_can_skip(client):
    from charades.router import _dispatch

    code = client.post("/charades/api/rooms").json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    first = room.game.actor_id()
    host_id = pids[0]
    for p in room.players.values():
        p.is_host = p.id == host_id
    _dispatch(room, room.players[host_id], "skipCharade", {})
    assert room.game.actor_id() != first
