"""Per-league tournament selection.

Each league stores the competition it is playing. Before this, the active
tournament was a process-wide env var, so one deployment served exactly one
competition.
"""

import wc_data


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
