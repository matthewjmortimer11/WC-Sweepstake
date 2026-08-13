"""League state caching: ETags, and Redis-backed reuse.

Every member of a league polls /state every 30 s and usually gets an identical
answer. These cover the two things that makes cheap — a 304 with no body, and a
cached build — plus the invalidation that keeps it honest.

Redis is optional, so the cache layer no-ops without it and these tests run
green in CI with no Redis at all. The one test that needs a real server is
skipped unless WHEESHT_REDIS_URL is set.
"""

import json
import os

import pytest

import cache
import main


@pytest.fixture(autouse=True)
def isolate_cache(monkeypatch):
    """Give every test its own Redis keyspace.

    The `client` fixture builds a fresh schema per test, but Redis persists, so
    without this a test could be served an entry cached from the PREVIOUS
    test's database. Namespacing per test is the same mechanism that keeps two
    deployments from colliding on one Redis.
    """
    monkeypatch.setenv("WHEESHT_CACHE_NAMESPACE", f"test-{os.getpid()}-{id(object()):x}")
    # Clients are keyed per event loop in cache.LeagueCache, so no reset is
    # needed here — each test's loop gets its own.


# ── ETags (no Redis required) ───────────────────────────────────────────────

async def test_state_returns_an_etag(client):
    r = await client.get("/api/leagues/OI/state")
    assert r.status_code == 200
    # Weak: the payload is gzipped downstream, and a strong ETag must be unique
    # per content-coding.
    assert r.headers["ETag"].startswith('W/"')


async def test_matching_etag_returns_304_with_no_body(client):
    first = await client.get("/api/leagues/OI/state")
    assert len(first.content) > 1000

    again = await client.get(
        "/api/leagues/OI/state", headers={"If-None-Match": first.headers["ETag"]}
    )
    assert again.status_code == 304
    assert again.content == b""


async def test_etag_changes_when_the_league_changes(client):
    first = await client.get("/api/leagues/OI/state")

    added = await client.post("/api/leagues/OI/participants", json={
        "id": "etag-test-1", "name": "Etag Tester", "leagueCode": "OI",
    })
    assert added.status_code == 200

    after = await client.get("/api/leagues/OI/state")
    assert after.headers["ETag"] != first.headers["ETag"]

    # The old ETag must NOT produce a 304 now — that would serve stale data.
    stale = await client.get(
        "/api/leagues/OI/state", headers={"If-None-Match": first.headers["ETag"]}
    )
    assert stale.status_code == 200
    assert any(p["id"] == "etag-test-1" for p in json.loads(stale.text)["people"])


async def test_state_body_is_unchanged_by_caching(client):
    """Serialising the payload ourselves (to hash it) must not alter it."""
    body = json.loads((await client.get("/api/leagues/OI/state")).text)
    assert body["league"]["code"] == "OI"
    for key in ("teams", "fixtures", "people", "predictions", "meta", "pot"):
        assert key in body, key


# ── invalidation middleware (no Redis required) ─────────────────────────────

@pytest.fixture
def bumps(monkeypatch):
    """Record which leagues the middleware invalidates."""
    seen = []

    async def fake_bump(code):
        seen.append(code)

    monkeypatch.setattr(main.league_cache, "bump_league", fake_bump)
    return seen


async def test_write_invalidates_that_league(client, bumps):
    r = await client.post("/api/leagues/OI/participants", json={
        "id": "bump-1", "name": "Bumper", "leagueCode": "OI",
    })
    assert r.status_code == 200
    assert bumps == ["OI"]


async def test_reads_do_not_invalidate(client, bumps):
    await client.get("/api/leagues/OI/state")
    await client.get("/api/leagues/OI/chat")
    assert bumps == []


async def test_failed_write_does_not_invalidate(client, bumps):
    """A rejected write changed nothing, so the cache is still valid."""
    r = await client.post("/api/leagues/NOSUCH/participants", json={
        "id": "bump-2", "name": "Nobody", "leagueCode": "NOSUCH",
    })
    assert r.status_code >= 400
    assert bumps == []


async def test_non_league_writes_are_ignored(client, bumps):
    await client.post("/api/events", json={"event": "test", "sessionId": "s1"})
    assert bumps == []


# ── graceful degradation ────────────────────────────────────────────────────

async def test_cache_is_a_no_op_without_redis():
    """No REDIS_URL is the normal local/CI case and must not raise."""
    c = cache.LeagueCache()
    c.url = ""
    assert c.enabled is False
    assert await c.league_version("OI") == 0
    assert await c.get_state("OI", 0, 0) is None
    await c.set_state("OI", 0, 0, "{}")   # must not raise
    await c.bump_league("OI")             # must not raise


async def test_unreachable_redis_degrades_instead_of_failing(client):
    """Redis going down must cost performance, not correctness."""
    broken = cache.LeagueCache()
    broken.url = "redis://127.0.0.1:1/0"  # nothing listening
    assert await broken.league_version("OI") == 0
    assert await broken.get_state("OI", 0, 0) is None
    await broken.set_state("OI", 0, 0, "{}")

    # And the endpoint still serves correctly with that cache installed.
    main.league_cache, original = broken, main.league_cache
    try:
        r = await client.get("/api/leagues/OI/state")
        assert r.status_code == 200
        assert json.loads(r.text)["league"]["code"] == "OI"
    finally:
        main.league_cache = original


# ── real Redis (opt-in) ─────────────────────────────────────────────────────

@pytest.mark.skipif(
    not (os.environ.get("WHEESHT_REDIS_URL") or os.environ.get("REDIS_URL")),
    reason="needs a running Redis; set WHEESHT_REDIS_URL",
)
async def test_second_request_is_served_from_redis(client):
    first = await client.get("/api/leagues/OI/state")
    assert first.headers["X-Wheesht-Cache"] == "miss"

    second = await client.get("/api/leagues/OI/state")
    assert second.headers["X-Wheesht-Cache"] == "hit"
    assert second.text == first.text

    # A write moves the cache key, so the next read rebuilds.
    await client.post("/api/leagues/OI/participants", json={
        "id": "redis-1", "name": "Redis Tester", "leagueCode": "OI",
    })
    third = await client.get("/api/leagues/OI/state")
    assert third.headers["X-Wheesht-Cache"] == "miss"
    assert any(p["id"] == "redis-1" for p in json.loads(third.text)["people"])


# ── leader election ─────────────────────────────────────────────────────────

async def test_without_redis_every_process_leads(monkeypatch):
    """No shared state to coordinate through, so the single-worker default must
    still run its background jobs."""
    monkeypatch.setattr(cache.league_cache, "url", "")
    assert await cache.try_lead("sync", "worker-a", ttl=60) is True
    assert await cache.try_lead("sync", "worker-b", ttl=60) is True


@pytest.mark.skipif(
    not (os.environ.get("WHEESHT_REDIS_URL") or os.environ.get("REDIS_URL")),
    reason="needs a running Redis; set WHEESHT_REDIS_URL",
)
async def test_only_one_worker_leads_and_the_holder_can_renew():
    """With `--workers 4` every process runs lifespan. Unguarded, that polls the
    provider four times over and blows its rate limit."""
    assert await cache.try_lead("sync", "worker-a", ttl=60) is True
    assert await cache.try_lead("sync", "worker-b", ttl=60) is False
    assert await cache.try_lead("sync", "worker-c", ttl=60) is False

    # The holder renews its own claim rather than losing it.
    assert await cache.try_lead("sync", "worker-a", ttl=60) is True


@pytest.mark.skipif(
    not (os.environ.get("WHEESHT_REDIS_URL") or os.environ.get("REDIS_URL")),
    reason="needs a running Redis; set WHEESHT_REDIS_URL",
)
async def test_leadership_passes_on_when_the_leader_stops_renewing():
    """A dead leader must not stop syncing forever — the lock expires and
    another worker picks the job up."""
    assert await cache.try_lead("sync", "worker-a", ttl=1) is True
    assert await cache.try_lead("sync", "worker-b", ttl=1) is False

    import asyncio
    await asyncio.sleep(1.2)  # worker-a "dies": no renewal
    assert await cache.try_lead("sync", "worker-b", ttl=60) is True
