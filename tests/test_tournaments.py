"""Per-league tournament selection.

Each league stores the competition it is playing. Before this, the active
tournament was a process-wide env var, so one deployment served exactly one
competition.
"""

import asyncio
import contextlib

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


def test_fixtures_for_keeps_each_tournament_to_its_own_cache(monkeypatch):
    """Each tournament now has its own sync loop and its own cache. No
    tournament may see another's fixtures, and one with no loop running sees
    nothing rather than borrowing."""
    monkeypatch.setitem(sync._caches, "world-cup-2026", [{"id": "wc-live"}])
    monkeypatch.setitem(sync._caches, "euro-2028", [{"id": "eu-live"}])

    assert sync.fixtures_for("world-cup-2026") == [{"id": "wc-live"}]
    assert sync.fixtures_for("euro-2028") == [{"id": "eu-live"}]
    # A tournament with no loop running borrows from neither.
    assert sync.fixtures_for("copa-2027") == []
    assert sync.fixtures_for("") == []


def test_base_fixtures_uses_only_its_own_tournaments_live_cache(monkeypatch):
    monkeypatch.setitem(sync._caches, "world-cup-2026", [{"id": "wc-live"}])

    wc = wc_data.tournament_data("world-cup-2026")
    eu = wc_data.tournament_data("euro-2028")

    assert main._base_fixtures(wc) == [{"id": "wc-live"}]
    # Euro has no live cache here, so it falls back to its own generated
    # fixtures rather than borrowing the World Cup's.
    assert main._base_fixtures(eu) == eu["fixtures"]
    assert main._base_fixtures(eu) != [{"id": "wc-live"}]
    assert len(main._base_fixtures(eu)) == 36


def test_status_is_reported_per_tournament(monkeypatch):
    """An organiser looking at a Euros league must not be shown the World Cup's
    sync health."""
    monkeypatch.setitem(sync._statuses, "euro-2028", dict(sync._new_status(), fixtureCount=36))
    monkeypatch.setattr(sync, "default_tournament_id", "world-cup-2026")
    monkeypatch.setitem(sync.sync_status, "fixtureCount", 72)

    assert sync.status_for("world-cup-2026")["fixtureCount"] == 72
    assert sync.status_for("euro-2028")["fixtureCount"] == 36
    # Never None, and never another tournament's numbers.
    assert sync.status_for("copa-2027")["fixtureCount"] == 0


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


# ── sync supervisor ─────────────────────────────────────────────────────────

async def test_only_tournaments_in_use_are_polled(client):
    """A config file nobody plays should not burn provider quota. The default
    is always included because it backs the pre-league landing payload."""
    # Only the seeded OI league exists so far -> default only.
    assert await sync.tournaments_in_use("world-cup-2026") == {"world-cup-2026"}

    await _make(client, "EUSUP", tournamentId="euro-2028")
    assert await sync.tournaments_in_use("world-cup-2026") == {"world-cup-2026", "euro-2028"}


async def test_supervisor_starts_one_worker_per_tournament(client, monkeypatch):
    await _make(client, "EUSUP2", tournamentId="euro-2028")

    started = []

    async def fake_start_sync(adapter, tournament_id, comp_code):
        started.append((tournament_id, comp_code))
        await asyncio.sleep(3600)  # stand in for the real polling loop

    monkeypatch.setattr(sync, "start_sync", fake_start_sync)

    def make_worker(tid):
        return object(), {"world-cup-2026": "WC", "euro-2028": "EC"}[tid]

    task = asyncio.create_task(sync.start_all_syncs(make_worker, "world-cup-2026", poll_seconds=3600))
    await asyncio.sleep(0.05)
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task

    assert sorted(started) == [("euro-2028", "EC"), ("world-cup-2026", "WC")]


async def test_supervisor_skips_a_tournament_with_no_config(client, monkeypatch):
    """A league whose config file was removed must not stop the others syncing."""
    await _make(client, "EUSUP3", tournamentId="euro-2028")

    started = []

    async def fake_start_sync(adapter, tournament_id, comp_code):
        started.append(tournament_id)
        await asyncio.sleep(3600)

    monkeypatch.setattr(sync, "start_sync", fake_start_sync)
    # euro-2028 reports no usable config.
    make_worker = lambda tid: None if tid == "euro-2028" else (object(), "WC")

    task = asyncio.create_task(sync.start_all_syncs(make_worker, "world-cup-2026", poll_seconds=3600))
    await asyncio.sleep(0.05)
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task

    assert started == ["world-cup-2026"]


async def test_supervisor_cancels_its_workers_on_shutdown(client, monkeypatch):
    cancelled = []

    async def fake_start_sync(adapter, tournament_id, comp_code):
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            cancelled.append(tournament_id)
            raise

    monkeypatch.setattr(sync, "start_sync", fake_start_sync)

    task = asyncio.create_task(
        sync.start_all_syncs(lambda tid: (object(), "WC"), "world-cup-2026", poll_seconds=3600)
    )
    await asyncio.sleep(0.05)
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task

    assert cancelled == ["world-cup-2026"]


async def test_mock_adapter_returns_the_tournament_it_was_asked_for():
    """It used to ignore tournament_id and always build the default tournament,
    then stamp the rows with the requested id — which would fill a Euros
    league's cache with World Cup fixtures."""
    from adapters.mock import MockAdapter
    adapter = MockAdapter()

    eu = await adapter.get_fixtures("euro-2028", "EC")
    assert len(eu) == 36

    eu_codes = {t["code"] for t in wc_data.tournament_data("euro-2028")["teams"]}
    used = {f.home_team for f in eu} | {f.away_team for f in eu}
    assert used <= eu_codes, f"non-Euro teams leaked in: {sorted(used - eu_codes)}"
    assert all(f.tournament_id == "euro-2028" for f in eu)


async def test_mock_fixture_ids_do_not_collide_across_tournaments():
    """Fixture.id is the primary key and is not scoped by tournament. Every
    tournament numbers its generated fixtures f0..fN, so un-namespaced ids made
    two sync workers overwrite each other's rows — the second tournament then
    loaded nothing at all."""
    from adapters.mock import MockAdapter
    adapter = MockAdapter()

    wc = {f.id for f in await adapter.get_fixtures("world-cup-2026", "WC")}
    eu = {f.id for f in await adapter.get_fixtures("euro-2028", "EC")}

    assert len(wc) == 72 and len(eu) == 36
    assert not (wc & eu), f"colliding fixture ids: {sorted(wc & eu)[:5]}"
