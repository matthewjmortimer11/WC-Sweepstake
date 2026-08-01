import asyncio
import random
import time

import pytest
from starlette.testclient import TestClient

import main
from coverstory.game import (
    PHASE_ACCUSE,
    PHASE_PLAY,
    PHASE_REVEAL,
    MIN_PLAYERS,
    CoverStoryGame,
    MoveError,
    Settings,
)
from coverstory.locations import LOCATIONS, locations_for_packs, public_packs
from coverstory.manager import Manager
from coverstory.router import _dispatch, _parse_settings
from coverstory import store


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def _started_game():
    game = CoverStoryGame()
    players = [f"p{i}" for i in range(MIN_PLAYERS)]
    game.start_game(players, random.Random(7))
    return game, players


def test_coverstory_private_views_hide_location_from_spy():
    game, players = _started_game()
    spy = game.spy_id()
    crew = next(pid for pid in players if pid != spy)

    spy_view = game.view(spy, show_secrets=True)
    crew_view = game.view(crew, show_secrets=True)
    public_view = game.view(crew, show_secrets=False)

    assert spy_view["isSpy"] is True
    assert "location" not in spy_view
    assert crew_view["isSpy"] is False
    assert crew_view["location"]["name"] == game.location["name"]
    assert crew_view["myCover"]
    assert "location" not in public_view


def test_coverstory_moves_to_play_when_everyone_has_viewed():
    game, players = _started_game()

    for pid in players:
        game.mark_viewed(pid)

    assert game.phase == PHASE_PLAY
    assert game.started_at > 0


def test_coverstory_reveal_accused_spy_awards_crew():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)

    game.begin_accusation()
    game.reveal(accused_id=game.spy_id())

    assert game.phase == PHASE_REVEAL
    assert game.result["crewWon"] is True
    assert game.result["spyWon"] is False


def test_coverstory_reveal_wrong_accusation_awards_spy():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)
    wrong = next(pid for pid in players if pid != game.spy_id())

    game.begin_accusation()
    game.reveal(accused_id=wrong)

    assert game.result["crewWon"] is False
    assert game.result["spyWon"] is True


def test_coverstory_reveal_correct_location_guess_awards_spy():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)

    game.begin_accusation()
    game.reveal(location_guess=game.location["id"])

    assert game.result["spyWon"] is True


def test_coverstory_reveal_wrong_location_guess_awards_crew():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)
    wrong = next(loc["id"] for loc in game.view(players[0])["locations"] if loc["id"] != game.location["id"])

    game.begin_accusation()
    game.reveal(location_guess=wrong)

    assert game.result["crewWon"] is True
    assert game.result["spyWon"] is False


def test_coverstory_rejects_reveal_before_accusation_phase():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)

    with pytest.raises(MoveError):
        game.reveal(accused_id=game.spy_id())


def test_coverstory_accusation_phase_is_explicit():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)

    game.begin_accusation()

    assert game.phase == PHASE_ACCUSE


def test_coverstory_timer_pause_resume_and_extend():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)
    original_deadline = game.deadline_at

    game.pause_timer()
    paused_at = game.paused_at
    game.extend_timer(60)
    game.resume_timer()

    assert paused_at > 0
    assert game.paused_at == 0
    assert game.deadline_at > original_deadline


def test_coverstory_timer_expiry_enters_accusation():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)
    game.deadline_at = time.time() - 1

    changed = game.expire_timer(time.time())

    assert changed is True
    assert game.phase == PHASE_ACCUSE


def test_coverstory_paused_timer_does_not_expire():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)
    game.pause_timer()
    game.deadline_at = time.time() - 1

    changed = game.expire_timer(time.time())

    assert changed is False
    assert game.phase == PHASE_PLAY


def test_coverstory_question_prompt_advances():
    game, players = _started_game()
    for pid in players:
        game.mark_viewed(pid)

    first = game.question_prompt()
    game.next_question()
    second = game.question_prompt()

    assert first["askerId"] != second["askerId"]
    assert first["targetId"] != first["askerId"]


def test_coverstory_reconnect_keeps_viewed_state():
    manager = Manager()
    room = manager.create_room()
    for i in range(MIN_PLAYERS):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    room.game.mark_viewed("p0")

    manager.join(room, "p0", "P0 Again")

    assert room.state_for("p0")["you"]["hasViewed"] is True


def test_coverstory_kicks_disconnected_player_from_lobby():
    manager = Manager()
    room = manager.create_room()
    manager.join(room, "host", "Host")
    target = manager.join(room, "p1", "P1")
    target.connected = False

    manager.kick(room, "p1")

    assert "p1" not in room.players


def test_coverstory_kicks_disconnected_crew_mid_round():
    manager = Manager()
    room = manager.create_room()
    for i in range(MIN_PLAYERS + 1):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)
    target = next(pid for pid in room.game.player_ids if pid != room.game.spy_id() and pid != "p0")
    room.players[target].connected = False

    manager.kick(room, target)

    assert target not in room.players
    assert target not in room.game.player_ids
    assert room.game.phase == PHASE_PLAY


def test_coverstory_blocks_kicking_spy_mid_round():
    manager = Manager()
    room = manager.create_room()
    for i in range(MIN_PLAYERS + 1):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)
    spy = room.game.spy_id()
    if room.players[spy].is_host:
        room.players[spy].is_host = False
        replacement = next(pid for pid in room.players if pid != spy)
        room.players[replacement].is_host = True
        room.host_id = replacement
    room.players[spy].connected = False

    with pytest.raises(MoveError, match="plant"):
        manager.kick(room, spy)


def test_coverstory_rejects_invalid_timer():
    with pytest.raises(MoveError):
        _parse_settings({"timerSecs": 123}, Settings())


def test_coverstory_has_week_three_content_depth():
    assert len(LOCATIONS) >= 60
    packs = public_packs()
    assert {p["id"] for p in packs} >= {"classic", "luxury", "chaos", "football", "weird", "family", "afterdark"}
    assert all(p["count"] > 0 for p in packs)


def test_coverstory_filters_locations_by_pack():
    football = locations_for_packs(["football"])

    assert football
    assert all(loc.get("pack") == "football" for loc in football)


def test_coverstory_parse_settings_keeps_pack_selection():
    settings = _parse_settings({"timerSecs": 300, "packIds": ["football", "weird"], "spyCount": 2}, Settings())

    assert settings.timer_secs == 300
    assert settings.pack_ids == ["football", "weird"]
    assert settings.spy_count == 2


def test_coverstory_rejects_invalid_spy_count():
    with pytest.raises(MoveError):
        _parse_settings({"spyCount": 3}, Settings())


def test_coverstory_start_game_uses_selected_pack():
    game = CoverStoryGame(settings=Settings(pack_ids=["football"]))
    players = [f"p{i}" for i in range(MIN_PLAYERS)]

    game.start_game(players, random.Random(3))

    assert game.location.get("pack") == "football"


def test_coverstory_two_plant_mode_deals_two_spies():
    game = CoverStoryGame(settings=Settings(spy_count=2))
    players = [f"p{i}" for i in range(5)]

    game.start_game(players, random.Random(9))

    assert len(game.spy_ids()) == 2
    for spy_id in game.spy_ids():
        assert game.view(spy_id, show_secrets=True)["isSpy"] is True


def test_coverstory_accusing_either_plant_awards_crew():
    game = CoverStoryGame(settings=Settings(spy_count=2))
    players = [f"p{i}" for i in range(5)]
    game.start_game(players, random.Random(9))
    for pid in players:
        game.mark_viewed(pid)

    game.begin_accusation()
    game.reveal(accused_id=game.spy_ids()[1])

    assert game.result["crewWon"] is True
    assert len(game.result["spyIds"]) == 2


def test_coverstory_manager_needs_three_connected_players():
    manager = Manager()
    room = manager.create_room()
    manager.join(room, "p1", "A")
    manager.join(room, "p2", "B")

    with pytest.raises(MoveError):
        manager.start_game(room)


def test_coverstory_route_and_assets_serve(client):
    assert client.get("/coverstory").status_code == 200
    assert client.get("/coverstory/assets/app.js").status_code == 200
    assert client.get("/coverstory/assets/styles.css").status_code == 200
    manifest = client.get("/coverstory/manifest.webmanifest")
    assert manifest.status_code == 200
    assert manifest.json()["shortcuts"]


def test_coverstory_dispatch_host_controls():
    manager = Manager()
    room = manager.create_room()
    for i in range(MIN_PLAYERS):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)
    host = room.players["p0"]
    host.is_host = True

    _dispatch(room, host, "extendTimer", {"seconds": 60})
    _dispatch(room, host, "nextQuestion", {})
    _dispatch(room, host, "beginAccusation", {})

    assert room.game.phase == PHASE_ACCUSE
    assert room.game.question_prompt()["round"] == 2


def test_coverstory_dispatch_rejects_non_host_controls():
    manager = Manager()
    room = manager.create_room()
    for i in range(MIN_PLAYERS):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)

    with pytest.raises(MoveError, match="host"):
        _dispatch(room, room.players["p1"], "beginAccusation", {})


def test_coverstory_manager_metrics_track_beta_events():
    manager = Manager()
    room = manager.create_room(Settings(pack_ids=["football"], timer_secs=300))
    for i in range(MIN_PLAYERS):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)
    room.game.begin_accusation()
    room.game.reveal(accused_id=room.game.spy_id())
    manager.record_event("round_completed", room, player_count=len(room.game.player_ids))

    stats = manager.stats()

    assert stats["roomsCreated"] == 1
    assert stats["roundsStarted"] == 1
    assert stats["roundsCompleted"] == 1
    assert stats["timerSelections"]["300"] == 1
    assert stats["packSelections"]["football"] == 1
    assert "locationName" not in stats["recentEvents"][-1]


def test_coverstory_score_series_awards_winners():
    manager = Manager()
    room = manager.create_room(Settings(spy_count=2))
    for i in range(5):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)
    accused = room.game.spy_ids()[0]
    room.game.begin_accusation()
    room.game.reveal(accused_id=accused)
    manager.record_event("round_completed", room, player_count=len(room.game.player_ids))

    for pid in room.game.player_ids:
        if pid in room.game.spy_ids():
            assert room.scores.get(pid, 0) == 0
        else:
            assert room.scores[pid] == 1


def test_coverstory_stats_endpoint_serves(client):
    r = client.get("/coverstory/api/stats")

    assert r.status_code == 200
    assert "roomsCreated" in r.json()


def test_coverstory_health_endpoint_reports_capacity(client):
    r = client.get("/coverstory/api/health")

    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["capacity"]["targetActiveRooms"] >= 1000
    assert body["capacity"]["targetConnectedPlayers"] >= 10000
    assert body["realtime"]["mode"] in {"memory", "redis"}
    assert body["realtime"]["roomKeyPattern"] == "coverstory:room:{code}"
    assert body["realtime"]["timerLockPattern"] == "coverstory:room:{code}:timer-lock"
    assert body["realtime"]["mutationLockPattern"] == "coverstory:room:{code}:mutation-lock"


def test_coverstory_public_players_include_idle_seconds():
    manager = Manager()
    room = manager.create_room()
    player = manager.join(room, "p1", "P1")
    player.last_seen = time.time() - 5

    public = room.public_players()[0]

    assert public["idleSecs"] >= 4


class _SentSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, payload):
        self.messages.append(payload)


class _SlowSocket:
    async def send_json(self, payload):
        await asyncio.sleep(10)


class _BrokenSocket:
    async def send_json(self, payload):
        raise RuntimeError("gone")


@pytest.mark.asyncio
async def test_coverstory_broadcast_drops_slow_socket(monkeypatch):
    import coverstory.manager as manager_mod

    monkeypatch.setattr(manager_mod, "_SOCKET_SEND_TIMEOUT", 0.01)
    manager = Manager()
    room = manager.create_room()
    manager.join(room, "fast", "Fast")
    manager.join(room, "slow", "Slow")
    fast = _SentSocket()
    room.sockets["fast"] = fast
    room.sockets["slow"] = _SlowSocket()

    await manager._broadcast(room)

    assert fast.messages
    assert "slow" not in room.sockets
    assert room.players["slow"].connected is False
    assert manager.stats()["slowSocketDrops"] == 1


@pytest.mark.asyncio
async def test_coverstory_broadcast_counts_broken_socket():
    manager = Manager()
    room = manager.create_room()
    manager.join(room, "broken", "Broken")
    room.sockets["broken"] = _BrokenSocket()

    await manager._broadcast(room)

    assert "broken" not in room.sockets
    assert room.players["broken"].connected is False
    assert manager.stats()["broadcastErrors"] == 1


def test_coverstory_ping_updates_last_seen():
    manager = Manager()
    room = manager.create_room()
    player = manager.join(room, "p1", "P1")
    player.last_seen = time.time() - 60

    changed = _dispatch(room, player, "ping", {})

    assert changed is False
    assert player.last_seen > time.time() - 5


def test_coverstory_round_history_records_completed_summary():
    manager = Manager()
    room = manager.create_room()
    for i in range(MIN_PLAYERS):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)
    room.game.begin_accusation()
    room.game.reveal(accused_id=room.game.spy_id())

    manager.record_event("round_completed", room, player_count=len(room.game.player_ids))

    assert room.history[-1]["winner"] == "crew"
    assert room.history[-1]["locationName"]
    assert "spyId" not in room.history[-1]


class _FakeRealtime:
    enabled = True

    def __init__(self):
        self.saved = {}
        self.published = []

    async def save_room(self, code, snapshot, *, ttl_secs):
        self.saved[code] = {"snapshot": snapshot, "ttl": ttl_secs}
        return True

    async def load_room(self, code):
        row = self.saved.get(code)
        return row and row["snapshot"]

    async def publish_room(self, code):
        self.published.append(code)
        return True

    async def acquire_timer_lock(self, code, *, ttl_secs=5):
        return True

    async def status(self):
        return {"mode": "fake"}


class _DenyTimerLockRealtime(_FakeRealtime):
    async def acquire_timer_lock(self, code, *, ttl_secs=5):
        return False


@pytest.mark.asyncio
async def test_coverstory_room_snapshot_round_trips_live_state():
    manager = Manager()
    room = manager.create_room(Settings(timer_secs=300, pack_ids=["football"], spy_count=2))
    for i in range(5):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    room.game.mark_viewed("p0")
    room.scores["p0"] = 2

    snapshot = manager.room_snapshot(room)
    restored = manager.room_from_snapshot(snapshot)

    assert restored.code == room.code
    assert restored.settings.pack_ids == ["football"]
    assert restored.settings.spy_count == 2
    assert restored.game.spy_ids() == room.game.spy_ids()
    assert restored.game.location == room.game.location
    assert restored.game.cover_by_pid == room.game.cover_by_pid
    assert restored.game.viewed == {"p0"}
    assert restored.scores["p0"] == 2
    assert restored.sockets == {}


@pytest.mark.asyncio
async def test_coverstory_manager_can_reload_persisted_room_snapshot():
    fake = _FakeRealtime()
    first = Manager()
    first.realtime = fake
    room = first.create_room()
    for i in range(MIN_PLAYERS):
        first.join(room, f"p{i}", f"P{i}")
    first.start_game(room)

    await first.persist_room(room, publish=True)

    second = Manager()
    second.realtime = fake
    loaded = await second.get_or_load(room.code)

    assert loaded is not None
    assert loaded.code == room.code
    assert loaded.game.location == room.game.location
    assert fake.published == [room.code]
    assert fake.saved[room.code]["ttl"] >= 120


@pytest.mark.asyncio
async def test_coverstory_manager_tick_expires_due_timer():
    fake = _FakeRealtime()
    manager = Manager()
    manager.realtime = fake
    room = manager.create_room(Settings(timer_secs=300))
    for i in range(MIN_PLAYERS):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)
    room.game.deadline_at = time.time() - 1

    await manager._tick()

    assert room.game.phase == PHASE_ACCUSE
    assert manager.stats()["timerExpiries"] == 1
    assert manager.stats()["recentEvents"][-1]["event"] == "timer_expired"
    assert fake.published == [room.code]


@pytest.mark.asyncio
async def test_coverstory_manager_timer_lock_prevents_duplicate_expiry():
    manager = Manager()
    manager.realtime = _DenyTimerLockRealtime()
    room = manager.create_room(Settings(timer_secs=300))
    for i in range(MIN_PLAYERS):
        manager.join(room, f"p{i}", f"P{i}")
    manager.start_game(room)
    for pid in list(room.game.player_ids):
        room.game.mark_viewed(pid)
    room.game.deadline_at = time.time() - 1

    await manager._tick()

    assert room.game.phase == PHASE_PLAY
    assert manager.stats()["timerExpiries"] == 0


def test_coverstory_history_endpoint_serves(client):
    code = client.post("/coverstory/api/rooms").json()["code"]
    r = client.get(f"/coverstory/api/rooms/{code}/history")

    assert r.status_code == 200
    assert r.json()["code"] == code
    assert r.json()["history"] == []


def test_coverstory_debug_endpoint_is_non_secret(client):
    code = client.post("/coverstory/api/rooms", json={"spyCount": 2}).json()["code"]
    r = client.get(f"/coverstory/api/rooms/{code}/debug")

    assert r.status_code == 200
    body = r.json()
    assert body["code"] == code
    assert body["settings"]["spyCount"] == 2
    assert "spyIds" not in body
    assert "locationName" not in body


def _custom_pack_payload():
    return {
        "name": "Test Custom Pack",
        "description": "Only for tests.",
        "locations": [
            {
                "name": "Server Room",
                "category": "Custom / Office",
                "texture": "Cold air, blinking racks, and one forbidden switch.",
                "roles": ["Engineer", "Intern", "Manager", "Security"],
                "questions": ["What is too loud here?"],
            },
            {
                "name": "Boardroom",
                "category": "Custom / Office",
                "texture": "Glass walls, water jugs, and one tense agenda.",
                "roles": ["Chair", "Finance", "Guest", "Assistant"],
                "questions": ["Who talks the most?"],
            },
            {
                "name": "Rooftop",
                "category": "Custom / Office",
                "texture": "City lights, paper cups, and gossip in the wind.",
                "roles": ["Host", "New Starter", "Director", "Caterer"],
                "questions": ["What can you see from here?"],
            },
        ],
    }


def test_coverstory_custom_pack_create_and_list(client):
    r = client.post("/coverstory/api/custom-packs", json=_custom_pack_payload())

    assert r.status_code == 200, r.text
    pack = r.json()["pack"]
    assert pack["id"]
    assert pack["count"] == 3

    listed = client.get("/coverstory/api/custom-packs").json()["packs"]
    assert any(p["id"] == pack["id"] for p in listed)


def test_coverstory_custom_pack_requires_playable_locations(client):
    payload = _custom_pack_payload()
    payload["locations"] = payload["locations"][:2]

    r = client.post("/coverstory/api/custom-packs", json=payload)

    assert r.status_code == 400


def test_coverstory_room_can_use_custom_pack(client):
    pack = client.post("/coverstory/api/custom-packs", json=_custom_pack_payload()).json()["pack"]

    r = client.post("/coverstory/api/rooms", json={
        "packIds": ["classic"],
        "customPackIds": [pack["id"]],
        "timerSecs": 300,
    })

    assert r.status_code == 200
    code = r.json()["code"]
    assert r.json()["customPackIds"] == [pack["id"]]
    from coverstory.router import manager as route_manager

    room = route_manager.get(code)
    assert room.settings.custom_locations
    assert {loc["name"] for loc in room.settings.custom_locations} >= {"Server Room", "Boardroom", "Rooftop"}


@pytest.mark.asyncio
async def test_coverstory_store_persists_round_history_without_room(client):
    await store.record_round("ZZ99", {
        "winner": "crew",
        "locationName": "Server Room",
        "playerCount": 5,
        "timerSecs": 300,
        "packIds": ["classic"],
        "completedAt": int(time.time()),
    }, spy_count=2)

    rows = await store.recent_rounds("ZZ99")

    assert rows[-1]["winner"] == "crew"
    assert rows[-1]["locationName"] == "Server Room"
    assert rows[-1]["spyCount"] == 2
    assert "spyIds" not in rows[-1]

    r = client.get("/coverstory/api/rooms/ZZ99/history")
    assert r.status_code == 200
    assert r.json()["history"][-1]["locationName"] == "Server Room"


def test_coverstory_playtest_report_create_and_list(client):
    r = client.post("/coverstory/api/playtests", json={
        "tableSize": 6,
        "timerSecs": 420,
        "packIds": ["classic", "football"],
        "completedRounds": 3,
        "rejoinIssues": False,
        "confusingLocations": ["VAR Control Room"],
        "notes": "Good tension. One player wanted clearer final-call wording.",
        "rating": 5,
    })

    assert r.status_code == 200, r.text
    report = r.json()["report"]
    assert report["tableSize"] == 6
    assert report["rating"] == 5
    assert "Good tension" in report["notes"]

    listed = client.get("/coverstory/api/playtests").json()["reports"]
    assert any(item["id"] == report["id"] for item in listed)


def test_coverstory_player_profile_create_get_and_update(client):
    payload = {
        "alias": "  Agent Blue  ",
        "preferences": {
            "timerSecs": 300,
            "packIds": ["classic", "football"],
            "customPackIds": ["custom-one"],
            "spyCount": 2,
            "viewMode": "remote",
        },
        "recentRooms": [
            {"code": "ab12", "at": 123, "players": 5},
            {"code": "ab12", "at": 456, "players": 9},
            {"code": "cd34", "at": 789, "players": 99},
        ],
    }

    r = client.put("/coverstory/api/profiles/player-1", json=payload)

    assert r.status_code == 200, r.text
    profile = r.json()["profile"]
    assert profile["alias"] == "Agent Blue"
    assert profile["preferences"]["timerSecs"] == 300
    assert profile["preferences"]["packIds"] == ["classic", "football"]
    assert profile["preferences"]["customPackIds"] == ["custom-one"]
    assert profile["preferences"]["spyCount"] == 2
    assert profile["preferences"]["viewMode"] == "remote"
    assert profile["recentRooms"] == [
        {"code": "AB12", "at": 123, "players": 5},
        {"code": "CD34", "at": 789, "players": 16},
    ]

    got = client.get("/coverstory/api/profiles/player-1")
    assert got.status_code == 200
    assert got.json()["profile"]["alias"] == "Agent Blue"

    updated = client.put("/coverstory/api/profiles/player-1", json={
        "alias": "Agent Green",
        "preferences": {"timerSecs": 999, "viewMode": "cinema"},
        "recentRooms": [],
    }).json()["profile"]
    assert updated["alias"] == "Agent Green"
    assert updated["preferences"]["timerSecs"] == 300
    assert updated["preferences"]["viewMode"] == "remote"


def test_coverstory_player_profile_missing_returns_default(client):
    r = client.get("/coverstory/api/profiles/missing-player")

    assert r.status_code == 200
    profile = r.json()["profile"]
    assert profile["playerId"] == "missing-player"
    assert profile["persisted"] is False
    assert profile["preferences"]["timerSecs"] == 420
