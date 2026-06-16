"""Security regression suite for Wheesht (item 6).

Covers the guarantees that must hold on every push: no chat impersonation, no
cross-league leakage, organiser writes gated, safe delete, redacted exports, and
the standard security headers. Run before any push touching auth, chat,
organiser actions, or isolation:

    pip install -r requirements-dev.txt
    pytest tests/test_security.py
"""

import uuid

import pytest

from conftest import add_participant, make_league


async def test_security_headers_present(client):
    for path in ("/",):
        r = await client.get(path)
        assert r.headers.get("X-Content-Type-Options") == "nosniff"
        assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Content-Security-Policy" in r.headers
        assert "geolocation=()" in r.headers.get("Permissions-Policy", "")


async def test_join_wrong_password(client):
    lg = await make_league(client, password="correcthorse")
    bad = await client.post("/api/leagues/join", json={"code": lg["code"], "password": "nope"})
    assert bad.status_code == 401
    good = await client.post("/api/leagues/join", json={"code": lg["code"], "password": "correcthorse"})
    assert good.status_code == 200


async def test_admin_write_requires_token(client):
    lg = await make_league(client)
    no_token = await client.put(f"/api/leagues/{lg['code']}/admin", json={
        "teams": {}, "fixtures": {}, "predictions": {}, "meta": {},
    })
    assert no_token.status_code == 403
    with_token = await client.put(
        f"/api/leagues/{lg['code']}/admin",
        json={"teams": {}, "fixtures": {}, "predictions": {}, "meta": {}},
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert with_token.status_code == 200


async def test_chat_impersonation_blocked(client):
    lg = await make_league(client)
    alice = await add_participant(client, lg["code"], "Alice")

    # Knowing the author id is not enough — no token means rejected.
    spoof = await client.post(f"/api/leagues/{lg['code']}/chat", json={
        "author_id": alice["id"], "text": "I am Alice (not really)",
    })
    assert spoof.status_code == 403

    # With the session token issued at claim time, the same post succeeds.
    ok = await client.post(
        f"/api/leagues/{lg['code']}/chat",
        json={"author_id": alice["id"], "text": "Hello, really Alice"},
        headers={"X-Wheesht-Session-Token": alice["sessionToken"]},
    )
    assert ok.status_code == 200


async def test_cross_league_chat_isolation(client):
    a = await make_league(client, name="Alpha")
    b = await make_league(client, name="Bravo")
    a_alice = await add_participant(client, a["code"], "Alice")
    b_bob = await add_participant(client, b["code"], "Bob")

    # League A's session token cannot post as a League B participant.
    leak = await client.post(
        f"/api/leagues/{b['code']}/chat",
        json={"author_id": b_bob["id"], "text": "cross-league spoof"},
        headers={"X-Wheesht-Session-Token": a_alice["sessionToken"]},
    )
    assert leak.status_code == 403


async def test_state_isolation(client):
    a = await make_league(client, name="Alpha")
    b = await make_league(client, name="Bravo")
    a_alice = await add_participant(client, a["code"], "Alice")
    b_bob = await add_participant(client, b["code"], "Bob")

    state = await client.get(f"/api/leagues/{a['code']}/state")
    assert state.status_code == 200
    ids = {p["id"] for p in state.json().get("people", [])}
    assert a_alice["id"] in ids
    assert b_bob["id"] not in ids


async def test_export_redacts_secrets(client):
    lg = await make_league(client)
    alice = await add_participant(client, lg["code"], "Alice")
    # Give the entry a password so a hash exists server-side to (not) leak.
    await client.put(
        f"/api/leagues/{lg['code']}/participants/{alice['id']}/password",
        json={"newPassword": "hunter2"},
        headers={"X-Wheesht-Session-Token": alice["sessionToken"]},
    )

    no_token = await client.get(f"/api/leagues/{lg['code']}/export")
    assert no_token.status_code == 403

    r = await client.get(
        f"/api/leagues/{lg['code']}/export",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert r.status_code == 200
    text = r.text
    assert "password_hash" not in text
    assert "organiser_hash" not in text
    assert "pbkdf2" not in text  # no PBKDF2 hash string leaked


async def test_organiser_delete_requires_exact_confirmation(client):
    lg = await make_league(client, name="Deletable")

    no_token = await client.request("DELETE", f"/api/leagues/{lg['code']}", json={
        "confirmCode": lg["code"], "confirmName": lg["name"],
    })
    assert no_token.status_code == 403

    wrong_name = await client.request(
        "DELETE", f"/api/leagues/{lg['code']}",
        json={"confirmCode": lg["code"], "confirmName": "Wrong Name"},
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert wrong_name.status_code == 400

    ok = await client.request(
        "DELETE", f"/api/leagues/{lg['code']}",
        json={"confirmCode": lg["code"], "confirmName": lg["name"]},
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert ok.status_code == 200
    gone = await client.get(f"/api/leagues/{lg['code']}/state")
    assert gone.status_code == 404


async def test_admin_auth_rate_limited(client):
    lg = await make_league(client)
    statuses = []
    for _ in range(11):
        r = await client.post(f"/api/leagues/{lg['code']}/admin/auth", json={"code": "wrong"})
        statuses.append(r.status_code)
    assert statuses[:10] == [403] * 10
    assert statuses[10] == 429


async def test_session_endpoint_issues_token_for_open_entry(client):
    lg = await make_league(client)
    pid = uuid.uuid4().hex[:12]
    # Materialise an open entry, then ask for a session token directly.
    await client.post(f"/api/leagues/{lg['code']}/participants", json={
        "id": pid, "name": "Open Entry", "leagueCode": lg["code"],
    })
    r = await client.post(f"/api/leagues/{lg['code']}/participants/{pid}/session")
    assert r.status_code == 200
    token = r.json()["token"]
    assert token.startswith("s1.")
    posted = await client.post(
        f"/api/leagues/{lg['code']}/chat",
        json={"author_id": pid, "text": "hi from a fresh session"},
        headers={"X-Wheesht-Session-Token": token},
    )
    assert posted.status_code == 200


async def test_admin_token_v2_binding_revoked_when_entry_removed(client):
    lg = await make_league(client)
    organiser = await add_participant(client, lg["code"], "Organiser")

    # Authenticate as the organiser, binding the token to their entry.
    auth = await client.post(f"/api/leagues/{lg['code']}/admin/auth", json={
        "code": lg["organiser"], "participantId": organiser["id"],
    })
    assert auth.status_code == 200
    bound = auth.json()["token"]
    assert bound.startswith("v2.")

    # The bound token works while the entry exists.
    ok = await client.put(
        f"/api/leagues/{lg['code']}/admin",
        json={"teams": {}, "fixtures": {}, "predictions": {}, "meta": {}},
        headers={"X-Wheesht-Admin-Token": bound},
    )
    assert ok.status_code == 200

    # Remove the bound entry (using the league's unbound organiser token).
    removed = await client.delete(
        f"/api/leagues/{lg['code']}/participants/{organiser['id']}",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert removed.status_code == 200

    # The v2 token bound to the now-removed entry is rejected.
    after = await client.put(
        f"/api/leagues/{lg['code']}/admin",
        json={"teams": {}, "fixtures": {}, "predictions": {}, "meta": {}},
        headers={"X-Wheesht-Admin-Token": bound},
    )
    assert after.status_code == 403
