"""Integration tests for Who Am I? HTTP + game logic."""

import base64

import pytest
from starlette.testclient import TestClient

import main
from whoami.manager import manager


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


_TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def test_create_room(client):
    r = client.post("/whoami/api/rooms")
    assert r.status_code == 200
    assert manager.get(r.json()["code"]) is not None


def test_own_identity_hidden(client):
    code = client.post("/whoami/api/rooms").json()["code"]
    room, pids = _room_with_players(code, 3)
    manager.start_game(room)
    view = room.state_for(pids[0])["room"]["game"]
    own = next(c for c in view["cards"] if c["id"] == pids[0])
    other = next(c for c in view["cards"] if c["id"] == pids[1])
    assert own["hidden"] is True
    assert own["character"] is None
    assert other["hidden"] is False
    assert other["character"]


def test_confirm_then_claim(client):
    code = client.post("/whoami/api/rooms").json()["code"]
    room, pids = _room_with_players(code, 3)
    manager.start_game(room)
    game = room.game
    target, confirmer, _other = pids
    game.confirm_guess(confirmer, target)
    assert game.can_claim(target)
    game.claim_got_it(target)
    assert target in game.claimed


def test_claim_requires_confirmation(client):
    from whoami.game import MoveError

    code = client.post("/whoami/api/rooms").json()["code"]
    room, pids = _room_with_players(code, 2)
    manager.start_game(room)
    with pytest.raises(MoveError, match="confirm"):
        room.game.claim_got_it(pids[0])


def test_avatar_upload_and_serve(client):
    code = client.post("/whoami/api/rooms").json()["code"]
    room, pids = _room_with_players(code, 1)
    data_url = "data:image/png;base64," + base64.b64encode(_TINY_PNG).decode()
    manager.set_avatar(room, pids[0], data_url)
    r = client.get(f"/whoami/api/rooms/{code}/avatar/{pids[0]}")
    assert r.status_code == 200
    assert r.content == _TINY_PNG


def test_variable_player_count(client):
    code = client.post("/whoami/api/rooms").json()["code"]
    room, pids = _room_with_players(code, 5)
    manager.start_game(room)
    assert len(room.game.player_ids) == 5
    assert len(set(room.game.char_by_pid.values())) == 5


def test_own_identity_revealed_after_claim(client):
    code = client.post("/whoami/api/rooms").json()["code"]
    room, pids = _room_with_players(code, 2)
    manager.start_game(room)
    a, b = pids
    room.game.confirm_guess(b, a)
    room.game.claim_got_it(a)
    own = next(c for c in room.state_for(a)["room"]["game"]["cards"] if c["id"] == a)
    assert own["hidden"] is False
    assert own["character"]


def test_disconnect_does_not_block_round(client):
    code = client.post("/whoami/api/rooms").json()["code"]
    room, pids = _room_with_players(code, 3)
    manager.start_game(room)
    a, b, c = pids
    room.game.confirm_guess(b, a)
    room.game.claim_got_it(a)
    room.game.confirm_guess(a, b)
    room.game.claim_got_it(b)
    room.players[c].connected = False
    connected = {p.id for p in room.players.values() if p.connected}
    assert room.game.all_claimed(connected)


def test_two_player_start_via_websocket(client):
    import time

    code = client.post("/whoami/api/rooms").json()["code"]
    with client.websocket_connect(f"/whoami/ws/{code}?pid=h1&name=Host") as host, \
         client.websocket_connect(f"/whoami/ws/{code}?pid=h2&name=Guest") as guest:
        host.receive_json()
        host.receive_json()
        guest.receive_json()
        guest.receive_json()
        host.receive_json()
        host.send_json({"type": "start"})
        time.sleep(0.05)
        playing = None
        for _ in range(8):
            msg = host.receive_json()
            if msg.get("type") == "state" and msg["room"]["game"]["status"] == "playing":
                playing = msg
                break
        assert playing is not None
        assert len(playing["room"]["game"]["playerIds"]) == 2

    from whoami.game import MoveError

    code = client.post("/whoami/api/rooms").json()["code"]
    room, _ = _room_with_players(code, 2)
    manager.start_game(room)
    with pytest.raises(MoveError, match="in progress"):
        manager.join(room, "newbie", "Latecomer")
