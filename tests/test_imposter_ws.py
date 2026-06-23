"""Integration tests for Imposter HTTP + WebSocket."""

import pytest
from starlette.testclient import TestClient

import main
from imposter.manager import manager


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
    r = client.post("/imposter/api/rooms", json={"mode": "classic"})
    assert r.status_code == 200
    assert manager.get(r.json()["code"]) is not None


def test_classic_role_secrecy(client):
    code = client.post("/imposter/api/rooms", json={"mode": "classic"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    for pid in pids:
        assert "isImposter" in room.state_for(pid)["room"]["game"]
    room.game.mark_viewed(pids[0])
    assert "isImposter" not in room.state_for(pids[0])["room"]["game"]


def test_celebrity_peek_and_reveal(client):
    code = client.post("/imposter/api/rooms", json={"mode": "celebrity"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    for pid in pids:
        assert "myCeleb" in room.state_for(pid)["room"]["game"]
    for pid in pids:
        room.game.mark_viewed(pid)
    room.game.reveal_answer()
    view = room.state_for(pids[0])["room"]["game"]
    assert "imposterId" in view and "oddCeleb" in view


def test_peek_advances_when_player_abandons(client):
    code = client.post("/imposter/api/rooms", json={"mode": "classic"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    for pid in pids[:3]:
        room.game.mark_viewed(pid)
    room.game.abandon_peek(pids[3])
    assert room.game.phase == "play"


def test_new_round_blocked_during_peek(client):
    from imposter.game import MoveError

    code = client.post("/imposter/api/rooms", json={"mode": "classic"}).json()["code"]
    room, _ = _room_with_four(code)
    manager.start_game(room)
    with pytest.raises(MoveError, match="peek"):
        room.game.new_round(room.rng)


def test_reconnect_can_peek_again(client):
    code = client.post("/imposter/api/rooms", json={"mode": "classic"}).json()["code"]
    room, pids = _room_with_four(code)
    manager.start_game(room)
    room.game.mark_viewed(pids[0])
    room.game.viewed.discard(pids[0])
    assert "isImposter" in room.state_for(pids[0])["room"]["game"]
