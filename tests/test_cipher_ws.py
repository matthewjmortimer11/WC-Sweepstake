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
from codenames.manager import ensure_dev_bots, is_dev_bot, manager
from codenames.words import words_for_packs


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


def test_cipher_pwa_files(client):
    manifest = client.get("/play/manifest.webmanifest")
    assert manifest.status_code == 200
    body = manifest.json()
    assert body["name"] == "Wheesht · Cipher"
    assert body["start_url"].startswith("/play")
    assert body["scope"] == "/play/"

    page = client.get("/play")
    assert page.status_code == 200
    assert 'rel="manifest" href="/play/manifest.webmanifest"' in page.text
    assert "/play/assets/app.js" in page.text

    sw = client.get("/play/sw.js")
    assert sw.status_code == 200
    assert "cipher-pwa-" in sw.text


def test_stats_endpoint(client):
    r = client.get("/play/api/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True          # SQLite test DB is configured
    assert "totalGames" in body and "wins" in body and "recent" in body


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
    assert body["packIds"] == ["drinking", "rude", "adult"]
    code = body["code"]
    room = manager.get(code)
    assert room.settings.pack_ids == ["drinking", "rude", "adult"]
    assert "Drinking" in room.settings.pack_name


def test_create_room_with_multi_pack_ids(client):
    r = client.post("/play/api/rooms", json={"packIds": ["classic", "movies", "offensive"]})
    body = r.json()
    assert body["packIds"] == ["classic", "movies", "offensive"]
    room = manager.get(body["code"])
    assert len(words_for_packs(room.settings.pack_ids)) >= 36


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


def test_near_picks_sync_to_all_players(client):
    code = client.post("/play/api/rooms").json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=rs&name=RedSpy") as rs, \
         client.websocket_connect(f"/play/ws/{code}?pid=ro&name=RedOp") as ro, \
         client.websocket_connect(f"/play/ws/{code}?pid=bs&name=BlueSpy") as bs, \
         client.websocket_connect(f"/play/ws/{code}?pid=bo&name=BlueOp") as bo:

        for ws, team, role in [(rs, "red", "spymaster"), (ro, "red", "operative"),
                               (bs, "blue", "spymaster"), (bo, "blue", "operative")]:
            ws.send_json({"type": "setTeam", "team": team})
            ws.send_json({"type": "setRole", "role": role})
        _settle()
        rs.send_json({"type": "start"})
        _settle()

        room = manager.get(code)
        game = room.game
        starting = game.current_team
        spy_ws = rs if starting == RED else bs
        op_ws = ro if starting == RED else bo
        op_pid = "ro" if starting == RED else "bo"

        spy_ws.send_json({"type": "clue", "word": "signal", "count": 2})
        _settle()

        op_ws.send_json({"type": "toggleNearPick", "index": 0})
        op_ws.send_json({"type": "toggleNearPick", "index": 1})
        _settle()

        picks = room.public_near_picks()
        assert len(picks) == 1
        assert picks[0]["id"] == op_pid
        assert picks[0]["indices"] == [0, 1]

        spy_state = room.state_for("rs" if starting == RED else "bs")
        assert spy_state["room"]["game"]["nearPicks"] == picks

        op_ws.send_json({"type": "toggleNearPick", "index": 0})
        _settle()
        assert room.public_near_picks()[0]["indices"] == [1]


def test_rematch_restarts_with_same_settings(client):
    code = client.post("/play/api/rooms", json={"packIds": ["classic", "movies"]}).json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=rs") as rs, \
         client.websocket_connect(f"/play/ws/{code}?pid=ro") as ro, \
         client.websocket_connect(f"/play/ws/{code}?pid=bs") as bs, \
         client.websocket_connect(f"/play/ws/{code}?pid=bo") as bo:

        for ws, team, role in [(rs, "red", "spymaster"), (ro, "red", "operative"),
                               (bs, "blue", "spymaster"), (bo, "blue", "operative")]:
            ws.send_json({"type": "setTeam", "team": team})
            ws.send_json({"type": "setRole", "role": role})
        _settle()
        rs.send_json({"type": "start"})
        _settle()

        room = manager.get(code)
        game = room.game
        round1 = game.round_no
        team = game.current_team
        game.give_clue(team, "zzz", 3)
        idx = next(i for i, c in enumerate(game.cards) if c.kind == "assassin")
        op = ro if team == "red" else bo
        op.send_json({"type": "guess", "index": idx})
        _settle()
        assert game.status == "ended"

        rs.send_json({"type": "rematch"})
        _settle()
        assert game.status == "playing"
        assert game.round_no == round1 + 1
        assert room.settings.pack_ids == ["classic", "movies"]


def test_dev_mode_solo_start(client):
    code = client.post("/play/api/rooms").json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=solo&name=SoloDev") as ws:
        ws.receive_json()  # hello
        ws.receive_json()  # state
        ws.send_json({"type": "setTeam", "team": "red"})
        ws.send_json({"type": "setRole", "role": "spymaster"})
        ws.send_json({"type": "settings", "settings": {"devMode": True}})
        _settle()
        ws.send_json({"type": "start"})
        _settle()

    room = manager.get(code)
    assert room.settings.dev_mode is True
    assert room.game.status == "playing"
    bots = [p for p in room.players.values() if is_dev_bot(p.id)]
    assert len(bots) == 3  # host fills red spymaster; bots fill other slots

    view = room.state_for("solo")
    assert view["you"]["revealKey"] is True
    assert all(c["kind"] != "hidden" for c in view["room"]["game"]["cards"])


def test_dev_mode_spectator_host_gets_team(client):
    """Dev mode must not start with the host stuck as spectator (no human clues)."""
    code = client.post("/play/api/rooms").json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=solo&name=SoloDev") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "settings", "settings": {"devMode": True}})
        _settle()
        ws.send_json({"type": "start"})
        _settle()

    room = manager.get(code)
    host = room.players["solo"]
    assert host.team in ("red", "blue")
    assert host.role == "spymaster"
    assert room.game.status == "playing"


def test_start_rejected_mid_game(client):
    code = client.post("/play/api/rooms").json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=rs") as rs, \
         client.websocket_connect(f"/play/ws/{code}?pid=ro") as ro, \
         client.websocket_connect(f"/play/ws/{code}?pid=bs") as bs, \
         client.websocket_connect(f"/play/ws/{code}?pid=bo") as bo:

        for ws, team, role in [(rs, "red", "spymaster"), (ro, "red", "operative"),
                               (bs, "blue", "spymaster"), (bo, "blue", "operative")]:
            ws.send_json({"type": "setTeam", "team": team})
            ws.send_json({"type": "setRole", "role": role})
        _settle()
        rs.send_json({"type": "start"})
        _settle()
        room = manager.get(code)
        assert room.game.status == "playing"
        round_no = room.game.round_no

        rs.send_json({"type": "start"})
        _settle()
        after = manager.get(code)
        assert after.game.status == "playing"
        assert after.game.round_no == round_no


def test_account_resume_on_second_device(client):
    """Same Cipher account on a new device should take over the in-room seat."""
    from codenames import auth

    uid = "acct-user-1"
    token = auth.cipher_token_for(uid)
    code = client.post("/play/api/rooms").json()["code"]

    with client.websocket_connect(
        f"/play/ws/{code}?pid=phone&name=Alice&cipherToken={token}"
    ) as phone:
        phone.receive_json()  # hello
        phone.receive_json()  # state
        phone.send_json({"type": "setTeam", "team": "red"})
        phone.send_json({"type": "setRole", "role": "spymaster"})
        _settle()

        room = manager.get(code)
        assert room.players["phone"].team == "red"
        assert room.players["phone"].role == "spymaster"
        assert room.players["phone"].cipher_user_id == uid

        with client.websocket_connect(
            f"/play/ws/{code}?pid=laptop&name=Alice&cipherToken={token}"
        ) as laptop:
            hello = laptop.receive_json()
            assert hello["type"] == "hello"
            assert hello.get("resumed") is True
            laptop.receive_json()  # broadcast state
            _settle()

        room = manager.get(code)
        assert "phone" not in room.players
        assert room.players["laptop"].team == "red"
        assert room.players["laptop"].role == "spymaster"
        assert room.players["laptop"].cipher_user_id == uid
        assert room.host_id == "laptop"


def test_dev_mode_allows_mid_game_role_switch(client):
    code = client.post("/play/api/rooms").json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=solo&name=SoloDev") as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "settings", "settings": {"devMode": True}})
        ws.send_json({"type": "setTeam", "team": "red"})
        ws.send_json({"type": "setRole", "role": "spymaster"})
        ws.send_json({"type": "start"})
        _settle()
        ws.send_json({"type": "setRole", "role": "operative"})
        _settle()

    room = manager.get(code)
    assert room.players["solo"].role == "operative"
    assert room.game.status == "playing"


def test_team_names_in_state_and_settable(client):
    code = client.post("/play/api/rooms").json()["code"]
    with client.websocket_connect(f"/play/ws/{code}?pid=host&name=Handler") as host:
        host.receive_json()
        state = host.receive_json()
        names = state["room"]["settings"]["teamNames"]
        assert names["red"] == "Field Crew"
        assert names["blue"] == "The Desk"

        host.send_json({"type": "setTeam", "team": "red"})
        host.send_json({"type": "setTeamName", "team": "red", "name": "Black Bag Unit"})
        _settle()

    room = manager.get(code)
    assert room.settings.team_red_name == "Black Bag Unit"

    with client.websocket_connect(f"/play/ws/{code}?pid=guest&name=Agent") as guest:
        guest.receive_json()
        state = guest.receive_json()
        assert state["room"]["settings"]["teamNames"]["red"] == "Black Bag Unit"

        guest.send_json({"type": "setTeam", "team": "blue"})
        guest.send_json({"type": "setTeamName", "team": "blue", "name": "Whitehall Desk"})
        _settle()

    room = manager.get(code)
    assert room.settings.team_blue_name == "Whitehall Desk"
