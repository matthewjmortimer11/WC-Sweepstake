"""Per-league tournament selection.

Each league stores the competition it is playing. Before this, the active
tournament was a process-wide env var, so one deployment served exactly one
competition.
"""

import wc_data
from conftest import add_participant


def test_registry_lists_configured_tournaments():
    ids = wc_data.available_tournaments()
    assert "world-cup-2026" in ids
    # The default sorts first so a picker shows it at the top.
    assert ids[0] == wc_data.default_tournament()


def test_tournament_exists_rejects_unknown_and_empty():
    assert wc_data.tournament_exists("world-cup-2026")
    assert not wc_data.tournament_exists("not-a-real-cup")
    assert not wc_data.tournament_exists("")
    # Must not be foolable into walking out of tournaments/.
    assert not wc_data.tournament_exists("../requirements")


def test_tournament_data_is_cached():
    """Building a payload parses TOML and generates every fixture, so it must
    not repeat per request once leagues span several competitions."""
    assert wc_data.tournament_data("world-cup-2026") is wc_data.tournament_data("world-cup-2026")


async def test_tournaments_endpoint_lists_choices(client):
    body = (await client.get("/api/tournaments")).json()
    ids = [t["id"] for t in body["tournaments"]]
    assert "world-cup-2026" in ids
    wc = next(t for t in body["tournaments"] if t["id"] == "world-cup-2026")
    assert wc["teams"] == 48
    assert wc["isDefault"] is True


async def _make(client, code, **extra):
    payload = {
        "name": f"League {code}",
        "code": code,
        "password": "pass1234",
        "organiserCode": "admin1234",
    }
    payload.update(extra)
    return await client.post("/api/leagues", json=payload)


async def test_league_stores_its_tournament(client):
    assert (await _make(client, "TRNA", tournamentId="world-cup-2026")).status_code == 200


async def test_unknown_tournament_is_rejected(client):
    """Falling back silently would draw the wrong teams, which is not
    recoverable once entrants have been assigned."""
    r = await _make(client, "TRNB", tournamentId="not-a-real-cup")
    assert r.status_code == 400
    assert r.json()["detail"] == "Unknown tournament"


async def test_omitted_tournament_falls_back_for_older_clients(client):
    assert (await _make(client, "TRNC")).status_code == 200


# ── tournament isolation in state assembly ──────────────────────────────────
#
# The sync cache holds exactly one competition's fixtures. Before leagues could
# choose a tournament, every reader took it unconditionally — which would hand
# a Euros league the World Cup schedule.

import main
import sync


def test_data_for_falls_back_on_unknown_tournament():
    """A league naming a tournament whose config has been removed should degrade
    to the default rather than 500."""
    assert main._data_for("deleted-cup")["meta"]["id"] == wc_data.default_tournament()
    assert main._data_for(None)["meta"]["id"] == wc_data.default_tournament()


def test_fixtures_for_refuses_another_tournaments_cache(monkeypatch):
    monkeypatch.setattr(sync, "fixture_cache", [{"id": "live-1"}])
    monkeypatch.setattr(sync, "synced_tournament", "world-cup-2026")

    assert sync.fixtures_for("world-cup-2026") == [{"id": "live-1"}]
    # A different competition must not see them.
    assert sync.fixtures_for("euro-2028") == []
    assert sync.fixtures_for("") == []


def test_base_fixtures_uses_live_cache_only_for_its_own_tournament(monkeypatch):
    monkeypatch.setattr(sync, "fixture_cache", [{"id": "live-1"}])
    monkeypatch.setattr(sync, "synced_tournament", "world-cup-2026")

    wc = wc_data.tournament_data("world-cup-2026")
    assert main._base_fixtures(wc) == [{"id": "live-1"}]

    # Same payload shape, different competition -> falls back to generated
    # fixtures instead of borrowing the World Cup's live ones.
    other = dict(wc)
    other["meta"] = dict(wc["meta"], id="euro-2028")
    assert main._base_fixtures(other) == other["fixtures"]
    assert main._base_fixtures(other) != [{"id": "live-1"}]


# ── a real second tournament ────────────────────────────────────────────────
#
# euro-2028 exists to prove the config drives the app rather than the code. It
# is deliberately a different SHAPE: 24 teams in 6 groups, and a ladder with no
# round of 32. If bracket depth were hardcoded anywhere, these would fail.

def test_second_tournament_has_a_different_shape():
    wc = wc_data.tournament_data("world-cup-2026")
    eu = wc_data.tournament_data("euro-2028")

    assert len(wc["teams"]) == 48 and len(eu["teams"]) == 24
    # 12 groups of 4 -> 72 group games; 6 groups of 4 -> 36.
    assert len(wc["fixtures"]) == 72 and len(eu["fixtures"]) == 36

    assert "r32" in wc["meta"]["stageLadder"]
    assert "r32" not in eu["meta"]["stageLadder"]
    assert eu["meta"]["stageLadder"] == ["group", "r16", "qf", "sf", "final", "winner"]

    groups = {t["group"] for t in eu["teams"]}
    assert groups == set("ABCDEF")
    for g in groups:
        assert sum(1 for t in eu["teams"] if t["group"] == g) == 4


def test_second_tournament_seeds_no_league():
    """Only the DEFAULT tournament's [league] is seeded at startup. A second
    config must not create a competing League row."""
    seed = wc_data.get_league_seed("euro-2028")
    assert seed["seeded"] is False
    assert seed["code"] != wc_data.get_league_seed("world-cup-2026")["code"]


async def test_two_leagues_on_different_tournaments_get_different_state(client):
    """The point of the whole phase: one deployment, two competitions."""
    assert (await _make(client, "WCUP", tournamentId="world-cup-2026")).status_code == 200
    assert (await _make(client, "EURO", tournamentId="euro-2028")).status_code == 200

    wc = (await client.get("/api/leagues/WCUP/state")).json()
    eu = (await client.get("/api/leagues/EURO/state")).json()

    assert wc["meta"]["season"] == "World Cup 2026"
    assert eu["meta"]["season"] == "Euro 2028"
    assert len(wc["teams"]) == 48 and len(eu["teams"]) == 24
    assert len(wc["fixtures"]) == 72 and len(eu["fixtures"]) == 36
    assert "r32" in wc["meta"]["stageLadder"]
    assert "r32" not in eu["meta"]["stageLadder"]


async def test_favourite_team_validated_against_the_leagues_own_tournament(client):
    """WAL plays at the Euros but not this World Cup. A global team-code set
    would reject a legitimate pick."""
    assert "WAL" not in {t["code"] for t in wc_data.tournament_data("world-cup-2026")["teams"]}
    assert "WAL" in {t["code"] for t in wc_data.tournament_data("euro-2028")["teams"]}

    lg = (await _make(client, "EURO2", tournamentId="euro-2028")).json()
    token = lg["adminToken"]
    ent = await add_participant(client, "EURO2", "Gwen")

    r = await client.put(
        f"/api/leagues/EURO2/participants/{ent['id']}/profile",
        json={"favouriteTeam": "WAL"},
        headers={"X-Wheesht-Admin-Token": token},
    )
    assert r.status_code == 200, r.text
