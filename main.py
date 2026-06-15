"""
Wheesht — World Cup Sweepstake
FastAPI backend serving the app and the league-scoped game-state API.

Leagues are the unit of isolation. Each league has its own entrants, chat,
results and prediction answers, all stored in Postgres and keyed by league id.
The World Cup fixtures themselves are GLOBAL (everyone shares the same
tournament) — only the human layer is partitioned per league.

The pre-seeded "office" league (code OI) is created from tournament config on
startup; its roster comes from the config [[roster]], while claims/edits/chat
for it persist to the database like any other league.
"""

import asyncio
import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
import uuid

import httpx
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

import standings
import sync
from db import AsyncSessionLocal, engine
from models import AdminOverride, Base, ChatMessage, League, Participant, Profile, ProfileAsset
from wc_data import _initials, generate_wc_data, get_admin_pin, get_league_seed

log = logging.getLogger(__name__)

# Generate the tournament scenario once at startup (teams, fixtures, markets…).
_wc_data = generate_wc_data()
_ROSTER: List[Dict[str, Any]] = _wc_data["people"]  # seeded league base roster
_CONFIG_LEAGUE_CODE: str = _wc_data["league"]["code"]
# Valid team codes a member may pick as their FAVOURITE team (distinct from the
# team they were drawn). Used to validate profile writes.
_TEAM_CODES: set = {t["code"] for t in _wc_data.get("teams", [])}

# Avatar bytes are resized/cropped on the client to a small square before upload;
# this ceiling is a generous backstop against an oversized or hand-crafted body.
_MAX_AVATAR_BYTES = 600 * 1024
_ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_DISPLAY_NAME = 40

_HTML_TEMPLATE = Path("templates/index.html").read_text(encoding="utf-8")

# Master developer key for the hidden cross-league dev console. It must come
# from the deployment environment; there is intentionally no committed fallback.
_DEV_KEY: str = os.environ.get("WC_DEV_KEY", "")

# Google Identity Services. The client_id is public (sent to browsers).
# The client_secret must live ONLY in WC_GOOGLE_CLIENT_SECRET Railway env var;
# it is never shipped to the client and is not used for token verification
# (we use Google's tokeninfo endpoint which needs no secret).
_GOOGLE_CLIENT_ID: str = os.environ.get("WC_GOOGLE_CLIENT_ID", "")

# Organiser PIN for the pre-seeded league. This stays server-side; clients get a
# short-lived HMAC token after proving the code.
_ADMIN_PIN: str = os.environ.get("WC_ADMIN_PIN") or get_admin_pin()
_ADMIN_SECRET: str = (
    os.environ.get("WC_ADMIN_SECRET")
    or os.environ.get("SECRET_KEY")
    or secrets.token_hex(32)
)
_ADMIN_TOKEN_TTL_SECONDS = 12 * 60 * 60

# Legacy JSON store (pre-league). Read-only now, used once for migration.
_DATA_DIR = Path("data")
_PARTICIPANTS_FILE = _DATA_DIR / "participants.json"
_ADMIN_FILE = _DATA_DIR / "admin.json"
_CHAT_FILE = _DATA_DIR / "chat.json"
_MAX_CHAT = 200


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


# ── Passwords ────────────────────────────────────────────────────────────────
# Salted PBKDF2-HMAC-SHA256. No third-party dependency; constant-time compare.

_PBKDF2_ITERS = 200_000


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ITERS)
    return f"pbkdf2_sha256${_PBKDF2_ITERS}${salt}${dk.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt, expected = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(dk.hex(), expected)
    except (ValueError, AttributeError):
        return False


def _admin_token_for(league: League) -> str:
    ts = str(int(time.time()))
    msg = f"{league.id}:{league.code}:{ts}".encode("utf-8")
    sig = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"v1.{ts}.{sig}"


def _admin_token_ok(league: League, token: Optional[str]) -> bool:
    try:
        version, ts_s, sig = (token or "").split(".", 2)
        ts = int(ts_s)
    except (ValueError, AttributeError):
        return False
    if version != "v1" or int(time.time()) - ts > _ADMIN_TOKEN_TTL_SECONDS:
        return False
    msg = f"{league.id}:{league.code}:{ts_s}".encode("utf-8")
    expected = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


def _admin_code_ok(league: League, code: str) -> bool:
    code = code or ""
    if league.seeded and league.code == _CONFIG_LEAGUE_CODE:
        return bool(_ADMIN_PIN) and hmac.compare_digest(code, _ADMIN_PIN)
    return _verify_password(code, league.password_hash)


def _require_admin(league: League, token: Optional[str]) -> None:
    if not _admin_token_ok(league, token):
        raise HTTPException(status_code=403, detail="Organiser access required")


# Per-account sign-in tokens. Same HMAC construction as the organiser token but
# scoped to one participant, with a long TTL (it's a "stay signed in" lock, not
# privileged access). Signed with the same server secret; never leaves verified.
_ACCOUNT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days


def _account_token_for(league: League, participant_id: str) -> str:
    ts = str(int(time.time()))
    msg = f"acct:{league.id}:{participant_id}:{ts}".encode("utf-8")
    sig = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"a1.{ts}.{sig}"


def _account_token_ok(league: League, participant_id: str, token: Optional[str]) -> bool:
    try:
        version, ts_s, sig = (token or "").split(".", 2)
        ts = int(ts_s)
    except (ValueError, AttributeError):
        return False
    if version != "a1" or int(time.time()) - ts > _ACCOUNT_TOKEN_TTL_SECONDS:
        return False
    msg = f"acct:{league.id}:{participant_id}:{ts_s}".encode("utf-8")
    expected = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


async def _verify_google_token(id_token: str) -> dict:
    """Verify a Google ID token via tokeninfo and return the decoded claims.
    Raises HTTPException on any failure (network, invalid, wrong audience)."""
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            r = await client.get(url)
        data = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach Google to verify sign-in")
    if "error" in data or "error_description" in data:
        raise HTTPException(status_code=400, detail="Invalid Google token")
    if _GOOGLE_CLIENT_ID and data.get("aud") != _GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Token was not issued for this app")
    if not data.get("sub"):
        raise HTTPException(status_code=400, detail="Google token missing subject")
    return data


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "league"


# ── Legacy JSON readers (migration only) ──────────────────────────────────────

def _load_json(path: Path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return default
    return default


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _get_league_by_code(session, code: str) -> Optional[League]:
    res = await session.execute(select(League).where(League.code == code))
    return res.scalar_one_or_none()


async def _participant_rows(session, league: League) -> List[Participant]:
    res = await session.execute(
        select(Participant).where(Participant.league_id == league.id)
    )
    return list(res.scalars().all())


async def _get_admin_data(session, league: League) -> Dict[str, Any]:
    row = await session.get(AdminOverride, league.id)
    if row and isinstance(row.data, dict):
        return row.data
    return {"teams": {}, "fixtures": {}, "predictions": {}, "meta": {}}


def _league_public(league: League) -> Dict[str, Any]:
    return {"id": league.id, "code": league.code, "name": league.name, "seeded": league.seeded}


def _participant_to_dict(p: Participant, league_code: str) -> Dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "initials": p.initials,
        "department": p.department,
        "location": p.location,
        "city": p.city,
        "ltMember": p.lt_member,
        "leadership": p.leadership,
        "gender": p.gender,
        "team": p.team,
        "color": p.color,
        "stage": p.stage,
        "alive": p.alive,
        "isYou": False,
        "isDemo": False,
        "isOI": p.is_oi,
        "isOrganiser": p.is_organiser,
        "leagueCode": league_code,
        "picks": p.picks or {},
        "predScore": p.pred_score,
        "joinedAt": p.joined_at,
        # Whether this entry is locked with a password (the hash itself never
        # leaves the server). Lets the client know when to prompt for sign-in.
        "hasPassword": bool(p.password_hash),
    }


def _league_people(
    league: League,
    rows: List[Participant],
    profiles: Optional[Dict[str, Profile]] = None,
) -> List[Dict[str, Any]]:
    """Seeded base roster (config) overlaid with DB rows (which win on id);
    tombstoned rows hide the matching base entry. Non-seeded leagues are DB-only.

    Profile data (display name, favourite team, avatar version) is additive and
    overlaid on top of BOTH config base entries and DB rows. The base `name` is
    never touched — `displayName` is a separate field so the organiser always
    keeps the original full name.
    """
    by_id: Dict[str, Dict[str, Any]] = {}
    if league.seeded and league.code == _CONFIG_LEAGUE_CODE:
        for p in _ROSTER:
            by_id[p["id"]] = dict(p)
    for r in rows:
        if r.removed:
            by_id.pop(r.id, None)
            continue
        by_id[r.id] = _participant_to_dict(r, league.code)

    profiles = profiles or {}
    for pid, d in by_id.items():
        prof = profiles.get(pid)
        d["displayName"] = (getattr(prof, "display_name", "") or "") if prof else ""
        d["favouriteTeam"] = (getattr(prof, "favourite_team", "") or "") if prof else ""
        d["avatarVersion"] = (getattr(prof, "avatar_version", 0) or 0) if prof else 0
        d["avatarSource"] = (getattr(prof, "avatar_source", "") or "") if prof else ""
        d["hasGoogleLink"] = bool(getattr(prof, "google_id", None)) if prof else False
        # Config base entries (no DB row) are open until a row sets a password.
        d.setdefault("hasPassword", False)
    return list(by_id.values())


async def _profiles_for(session, league: League) -> Dict[str, Profile]:
    res = await session.execute(select(Profile).where(Profile.league_id == league.id))
    return {p.participant_id: p for p in res.scalars().all()}


async def _active_names(session, league: League) -> set:
    """Lower-cased names of every active entry — seeded roster (minus tombstoned
    ids) overlaid with non-removed DB rows. Used to reject duplicate signups."""
    res = await session.execute(select(Participant).where(Participant.league_id == league.id))
    removed_ids: set = set()
    names: set = set()
    for r in res.scalars().all():
        if r.removed:
            removed_ids.add(r.id)
        elif (r.name or "").strip():
            names.add((r.name or "").strip().lower())
    if league.seeded and league.code == _CONFIG_LEAGUE_CODE:
        for rp in _ROSTER:
            if rp["id"] in removed_ids:
                continue
            nm = (rp.get("name") or "").strip().lower()
            if nm:
                names.add(nm)
    return names


async def _participant_in_league(session, league: League, participant_id: str) -> bool:
    """True when this id is a real entrant of the league: a (non-removed) DB row,
    or a seeded base roster id for the config league. Used to gate profile writes
    so a profile can't be attached to a stranger's id."""
    row = await session.get(Participant, participant_id)
    if row is not None and row.league_id == league.id and not row.removed:
        return True
    if league.seeded and league.code == _CONFIG_LEAGUE_CODE:
        return any(rp["id"] == participant_id for rp in _ROSTER)
    return False


def _seeded_base(league: League, participant_id: str) -> Optional[Dict[str, Any]]:
    if league.seeded and league.code == _CONFIG_LEAGUE_CODE:
        return next((rp for rp in _ROSTER if rp["id"] == participant_id), None)
    return None


async def _get_or_materialise(session, league: League, participant_id: str) -> Optional[Participant]:
    """Return the DB row for an entrant, creating one from the seeded roster base
    if it only exists in config so far (same pattern as a first pick)."""
    row = await session.get(Participant, participant_id)
    if row is not None and row.league_id == league.id:
        return row
    base = _seeded_base(league, participant_id)
    if base is None:
        return None
    row = Participant(
        id=participant_id, league_id=league.id, name=base["name"],
        initials=base.get("initials", ""), team=base.get("team", ""),
        color=base.get("color", "#E8272A"), location=base.get("location", "Edinburgh"),
        city=base.get("city", "Edinburgh"), stage=base.get("stage", ""),
        alive=bool(base.get("alive", True)), is_oi=True, picks={}, removed=False,
    )
    session.add(row)
    return row


async def _account_password_hash(session, league: League, participant_id: str) -> Optional[str]:
    row = await session.get(Participant, participant_id)
    if row is not None and row.league_id == league.id and not row.removed:
        return row.password_hash
    return None


async def _guard_account_write(
    session, league: League, participant_id: str,
    account_token: Optional[str], admin_token: Optional[str],
) -> None:
    """Sign-in lock: a write to a CLAIMED entry needs a valid account token
    (obtained once at sign-in, via password or Google) or the organiser's token.
    An entry is claimed once it has a password or a linked Google account. Open
    (unclaimed) entries are unaffected — the existing "just tap who you are"."""
    h = await _account_password_hash(session, league, participant_id)
    prof = await session.get(Profile, participant_id)
    has_google = prof is not None and prof.league_id == league.id and bool(prof.google_id)
    if not h and not has_google:
        return
    if admin_token and _admin_token_ok(league, admin_token):
        return
    if account_token and _account_token_ok(league, participant_id, account_token):
        return
    raise HTTPException(status_code=403, detail="This entry is protected — sign in to edit it.")


# ── State assembly ────────────────────────────────────────────────────────────

def _base_fixtures() -> List[Dict[str, Any]]:
    return sync.fixture_cache if sync.fixture_cache else _wc_data["fixtures"]


def _resolve(league_people: List[Dict[str, Any]], admin: Dict[str, Any]):
    """Resolve a league's full state from the GLOBAL baseline + its own overrides.

    Composition (per league):
      1. fixtures = baseline with this league's explicit result overrides patched
         in; fixtures with no override keep their provider/baseline values (they
         are never reset to upcoming/null).
      2. teams = the rules engine recomputed from THIS league's results, then the
         organiser's manual eliminations/restores applied on top (manual wins).
      3. people = each entrant mirrors the status of the team they hold.
      4. predictions = auto-graded from this league's results, then the
         organiser's manual answers applied on top (manual wins).
    """
    admin_teams = admin.get("teams") or {}
    admin_fixtures = admin.get("fixtures") or {}
    admin_preds = admin.get("predictions") or {}
    phase = (admin.get("meta") or {}).get("phase") or _wc_data["meta"]["phase"]
    ladder = _wc_data["meta"]["stageLadder"]

    # 1. fixtures = baseline + explicit overrides (others untouched)
    fixtures = []
    for f in _base_fixtures():
        o = admin_fixtures.get(f["id"])
        if o:
            f = dict(f)
            if "score" in o:
                f["score"] = o["score"]
            if "status" in o:
                f["status"] = o["status"]
            if "winner" in o:
                f["winner"] = o["winner"]
        fixtures.append(f)

    # 2. rules engine from this league's results, then manual team overrides
    teams = standings.compute_team_status(_wc_data["teams"], fixtures, ladder)
    for t in teams:
        o = admin_teams.get(t["code"])
        if o:
            t["alive"] = o.get("alive", t["alive"])
            t["stage"] = o.get("stage", t["stage"])
            if o.get("rounds") is not None:
                t["rounds"] = o["rounds"]

    # 3. people inherit their team's status
    people = standings.apply_to_people(league_people, teams)

    # 4. auto-grade predictions, then apply manual answers on top
    predictions = standings.grade_predictions(_wc_data["predictions"], teams, fixtures, ladder)

    # 4b. inject dynamic fixture markets (auto-grade from this league's results)
    dm_list = admin.get("dynamicMarkets") or []
    team_map = {t["code"]: t for t in teams}
    fix_map  = {f["id"]: f for f in fixtures}
    for dm in dm_list:
        f = fix_map.get(dm.get("fixture_id", ""))
        if not f:
            continue
        ta = team_map.get(f["a"], {}); tb = team_map.get(f["b"], {})
        fa = ta.get("flag", f["a"]); fb = tb.get("flag", f["b"])
        na = ta.get("name", f["a"]); nb = tb.get("name", f["b"])
        dm_type = dm.get("type", "winner")
        fix_status = f.get("status", "upcoming")
        if dm_type == "winner":
            market = {"key": dm["id"], "q": fa + " " + na + " vs " + fb + " " + nb + " — who wins?",
                      "kind": "team", "points": dm.get("points", 5),
                      "options": [f["a"], f["b"], "draw"], "answer": None,
                      "fixture_id": dm["fixture_id"], "fixture_status": fix_status}
            if fix_status == "done" and f.get("score"):
                sc = f["score"]
                if sc[0] > sc[1]:   market["answer"] = f["a"]
                elif sc[1] > sc[0]: market["answer"] = f["b"]
                else:               market["answer"] = "draw"
        else:
            market = {"key": dm["id"], "q": fa + " " + na + " vs " + fb + " " + nb + " — exact score?",
                      "kind": "scoreline", "points": dm.get("points", 5),
                      "options": [f["a"], f["b"]], "answer": None,
                      "fixture_id": dm["fixture_id"], "fixture_status": fix_status}
            if fix_status == "done" and f.get("score"):
                sc = f["score"]
                market["answer"] = str(sc[0]) + "-" + str(sc[1])
        predictions.append(market)

    for m in predictions:
        if m["key"] in admin_preds:
            ans = admin_preds[m["key"]]
            if m.get("kind") == "team2":
                # Only apply if both teams are known non-null strings (guards stale [null,null] data)
                if isinstance(ans, list) and len(ans) >= 2 and all(isinstance(x, str) and x for x in ans):
                    m["answer"] = ans
            else:
                m["answer"] = ans

    return teams, fixtures, people, predictions, phase


def _league_state(league: League, league_people: List[Dict[str, Any]], admin: Dict[str, Any]) -> Dict[str, Any]:
    teams, fixtures, people, predictions, phase = _resolve(league_people, admin)
    admin_meta = admin.get("meta") or {}
    fee = _wc_data["fee"]
    try:
        if admin_meta.get("entryFee") is not None:
            fee = max(0, float(admin_meta.get("entryFee")))
    except (TypeError, ValueError):
        fee = _wc_data["fee"]
    data = dict(_wc_data)
    data["fee"] = fee
    data["teams"] = teams
    data["fixtures"] = fixtures
    data["people"] = people
    data["predictions"] = predictions
    data["league"] = _league_public(league)
    # Raw override blob so an organiser's client can hydrate its editor state
    # from the server (keeps admin actions consistent across devices).
    data["adminOverrides"] = admin

    meta = dict(_wc_data["meta"])
    meta.pop("adminPin", None)
    meta["phase"] = phase
    meta["stageLabel"] = (
        "Group stage" if phase == "pre" else "Tournament over" if phase == "done" else "In play"
    )
    meta["groupSize"] = len(people)
    meta["stillIn"] = sum(1 for p in people if p.get("alive"))
    meta["out"] = sum(1 for p in people if not p.get("alive"))
    meta["teamsLeft"] = sum(1 for t in teams if t.get("alive"))
    meta["includeDepartment"] = bool(admin_meta.get("includeDepartment", True))
    meta["includeLocation"] = bool(admin_meta.get("includeLocation", True))
    meta["includeLtMember"] = bool(admin_meta.get("includeLtMember", True))
    meta["purpose"] = str(admin_meta.get("purpose", "work"))
    try:
        cs = admin_meta.get("charitySplit")
        meta["charitySplit"] = max(0.0, min(1.0, float(cs))) if cs is not None else 0.5
    except (TypeError, ValueError):
        meta["charitySplit"] = 0.5
    locs = admin_meta.get("locations")
    meta["locations"] = [str(x) for x in locs] if isinstance(locs, list) and locs else ["Edinburgh", "London"]
    meta["locationsFreeText"] = bool(admin_meta.get("locationsFreeText", False))
    meta["predDeadline"] = admin_meta.get("predDeadline") or None
    meta["hiddenPredictions"] = list(admin_meta.get("hiddenPredictions") or [])
    data["meta"] = meta
    data["pot"] = len(people) * fee
    return data


def _base_state() -> Dict[str, Any]:
    """League-agnostic payload injected at first paint / used before a league is
    chosen. No participants, no pot — just the shared tournament scaffolding."""
    data = dict(_wc_data)
    data["fixtures"] = _base_fixtures()
    data["people"] = []
    data["league"] = None
    meta = dict(_wc_data["meta"])
    meta.pop("adminPin", None)
    meta["groupSize"] = 0
    meta["stillIn"] = 0
    meta["out"] = 0
    data["meta"] = meta
    data["pot"] = 0
    return data


def _build_html() -> str:
    parts = []
    # Client ID is public — safe to embed in HTML. Secret stays server-side only.
    if _GOOGLE_CLIENT_ID:
        parts.append(f"window.WC_GOOGLE_CLIENT_ID={json.dumps(_GOOGLE_CLIENT_ID)};")
    parts.append("window.WC_DATA = " + json.dumps(_base_state(), ensure_ascii=False) + ";")
    parts.append("window.WC_LIVE = true;")
    injection = "<script>" + "".join(parts) + "</script>"
    return _HTML_TEMPLATE.replace("<!-- WC_DATA_INJECTION -->", injection)


# ── Startup: seed the config league + migrate any legacy JSON ──────────────────

async def _seed_and_migrate() -> None:
    seed = get_league_seed()
    code = (seed["code"] or "OI").upper()
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code)
        if league is None:
            league = League(
                id=uuid.uuid4().hex,
                code=code,
                slug=_slugify(seed["name"]),
                name=seed["name"],
                password_hash=_hash_password(seed["password"]),
                seeded=bool(seed["seeded"]),
                created_at=_now(),
            )
            session.add(league)
            await session.commit()
            log.info("Seeded league %s (%s)", code, seed["name"])
        else:
            # Keep the seeded league's public details + password in sync with config.
            league.name = seed["name"]
            league.seeded = bool(seed["seeded"])
            if seed["password"]:
                league.password_hash = _hash_password(seed["password"])
            await session.commit()

        await _migrate_legacy_json(session, league)


async def _migrate_legacy_json(session, league: League) -> None:
    """One-time import of the pre-league data/*.json into the seeded league.
    Each kind migrates only if that table is still empty for the league."""
    # participants
    n = await session.scalar(
        select(func.count()).select_from(Participant).where(Participant.league_id == league.id)
    )
    if not n:
        legacy = _load_json(_PARTICIPANTS_FILE, [])
        for p in legacy:
            pid = p.get("id") or uuid.uuid4().hex
            session.add(Participant(
                id=pid, league_id=league.id,
                name=p.get("name", ""), initials=p.get("initials") or _initials(p.get("name", "")),
                department=p.get("department", ""), location=p.get("location", "London"),
                city=p.get("city") or p.get("location", "London"), gender=p.get("gender", "—"),
                team=p.get("team", ""), color=p.get("color", "#E8272A"), stage=p.get("stage", ""),
                lt_member=bool(p.get("ltMember")), leadership=bool(p.get("leadership")),
                alive=bool(p.get("alive", True)),
                is_oi=bool(p.get("isOI")) or str(pid).startswith("oi-"),
                is_organiser=False, picks=p.get("picks") or {},
                pred_score=int(p.get("predScore") or 0), joined_at=int(p.get("joinedAt") or 0),
                removed=False,
            ))
        if legacy:
            await session.commit()
            log.info("Migrated %d legacy participants into %s", len(legacy), league.code)

    # chat
    n = await session.scalar(
        select(func.count()).select_from(ChatMessage).where(ChatMessage.league_id == league.id)
    )
    if not n:
        legacy = _load_json(_CHAT_FILE, [])
        for m in legacy:
            session.add(ChatMessage(
                id=m.get("id") or uuid.uuid4().hex[:10], league_id=league.id,
                author_id=m.get("author_id", ""), author=m.get("author", ""),
                initials=m.get("initials", "?"), color=m.get("color", "#333"),
                team=m.get("team", ""), text=m.get("text", ""), ts=int(m.get("ts") or 0),
            ))
        if legacy:
            await session.commit()
            log.info("Migrated %d legacy chat messages into %s", len(legacy), league.code)

    # admin overrides
    if await session.get(AdminOverride, league.id) is None:
        legacy = _load_json(_ADMIN_FILE, {})
        if isinstance(legacy, dict) and any(legacy.get(k) for k in ("teams", "fixtures", "predictions", "meta")):
            session.add(AdminOverride(league_id=league.id, data=legacy, updated_at=_now()))
            await session.commit()
            log.info("Migrated legacy admin overrides into %s", league.code)


# ── Lifespan ──────────────────────────────────────────────────────────────────

async def _ensure_schema() -> None:
    """Idempotent column adds for tables that shipped in an earlier deploy.

    `create_all` only ever CREATEs missing tables — it never ALTERs an existing
    one. The `profiles` table was deployed before `display_name` existed, so on
    any database where that table already exists the column would be missing.
    `ADD COLUMN IF NOT EXISTS` is a no-op when create_all already made the table
    fresh (with the column) and a clean add when it pre-existed without it.
    """
    statements = [
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR NOT NULL DEFAULT ''",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS password_hash VARCHAR",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_id VARCHAR",
        "CREATE INDEX IF NOT EXISTS ix_profiles_google_id ON profiles (google_id) WHERE google_id IS NOT NULL",
    ]
    async with engine.begin() as conn:
        for stmt in statements:
            await conn.execute(text(stmt))


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        await _ensure_schema()
    except Exception as exc:  # never let a migration crash boot
        log.error("Schema ensure failed: %s", exc)

    try:
        await _seed_and_migrate()
    except Exception as exc:  # never let seeding crash boot
        log.error("League seed/migrate failed: %s", exc)

    api_key = os.environ.get("FOOTBALL_DATA_API_KEY", "")
    if api_key:
        from adapters.football_data_org import FootballDataOrgAdapter
        adapter = FootballDataOrgAdapter(api_key)
        log.info("Using FootballDataOrgAdapter")
    else:
        from adapters.mock import MockAdapter
        adapter = MockAdapter()
        log.warning("FOOTBALL_DATA_API_KEY not set — using MockAdapter (no live data)")

    task = asyncio.create_task(
        sync.start_sync(adapter, _wc_data["meta"]["id"], _wc_data["meta"]["competitionCode"])
    )
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await engine.dispose()


app = FastAPI(title="Wheesht — World Cup Sweepstake 2026", lifespan=lifespan)


# ── Pages + global state ──────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(content=_build_html())


@app.get("/api/state")
async def get_state():
    """League-agnostic baseline (shared fixtures + tournament scaffolding)."""
    return _base_state()


# ── League lifecycle ──────────────────────────────────────────────────────────

class LeagueCreate(BaseModel):
    name: str
    code: str
    password: str


class LeagueJoin(BaseModel):
    code: str
    password: str


class AdminAuthPayload(BaseModel):
    code: str


@app.post("/api/leagues")
async def create_league(payload: LeagueCreate):
    code = (payload.code or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{2,12}", code):
        raise HTTPException(status_code=400, detail="Code must be 2–12 letters or numbers")
    name = (payload.name or "").strip()[:60] or "Sweepstake"
    if len(payload.password or "") < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    async with AsyncSessionLocal() as session:
        if await _get_league_by_code(session, code) is not None:
            raise HTTPException(status_code=409, detail="That code is already taken")
        league = League(
            id=uuid.uuid4().hex, code=code, slug=_slugify(name), name=name,
            password_hash=_hash_password(payload.password), seeded=False, created_at=_now(),
        )
        session.add(league)
        try:
            await session.commit()
        except IntegrityError:
            # Another request claimed this code between our check and commit.
            await session.rollback()
            raise HTTPException(status_code=409, detail="That code is already taken")
        return {"league": _league_public(league)}


@app.post("/api/leagues/join")
async def join_league(payload: LeagueJoin):
    code = (payload.code or "").strip().upper()
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code)
        if league is None:
            raise HTTPException(status_code=404, detail="No league with that code")
        if not _verify_password(payload.password or "", league.password_hash):
            raise HTTPException(status_code=401, detail="Wrong password")
        return {"league": _league_public(league)}


@app.post("/api/leagues/{code}/admin/auth")
async def admin_auth(code: str, payload: AdminAuthPayload):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        if not _admin_code_ok(league, payload.code or ""):
            raise HTTPException(status_code=403, detail="Wrong organiser code")
        return {"ok": True, "token": _admin_token_for(league)}


@app.get("/api/leagues/{code}/state")
async def league_state(code: str):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        rows = await _participant_rows(session, league)
        admin = await _get_admin_data(session, league)
        profiles = await _profiles_for(session, league)
    return _league_state(league, _league_people(league, rows, profiles), admin)


# ── Participants (league-scoped) ──────────────────────────────────────────────

class ParticipantPayload(BaseModel):
    id: str
    name: str
    initials: str = ""
    department: str = ""
    location: str = "London"
    city: str = "London"
    ltMember: bool = False
    leadership: bool = False
    gender: str = "—"
    team: str = ""
    color: str = "#E8272A"
    stage: str = ""
    alive: bool = True
    isYou: bool = False
    isDemo: bool = False
    isOI: bool = False
    isOrganiser: bool = False
    leagueCode: str = ""
    picks: Dict[str, Any] = {}
    predScore: int = 0
    joinedAt: Optional[int] = None


def _apply_payload(row: Participant, p: ParticipantPayload, league: League) -> None:
    row.league_id = league.id
    row.name = p.name
    row.initials = p.initials or _initials(p.name)
    row.department = p.department
    row.location = p.location
    row.city = p.city or p.location
    row.gender = p.gender
    row.team = p.team
    row.color = p.color
    row.stage = p.stage
    row.lt_member = bool(p.ltMember)
    row.leadership = bool(p.leadership)
    row.alive = bool(p.alive)
    row.is_oi = bool(p.isOI) or str(p.id).startswith("oi-")
    row.picks = p.picks or {}
    row.pred_score = int(p.predScore or 0)
    row.joined_at = int(p.joinedAt or 0)
    row.removed = False


async def _upsert_participant(session, league: League, payload: ParticipantPayload) -> Participant:
    row = await session.get(Participant, payload.id)
    if row is not None and row.league_id != league.id:
        raise HTTPException(status_code=409, detail="id belongs to another league")
    creating = row is None
    if creating:
        row = Participant(id=payload.id, league_id=league.id)
        session.add(row)
    _apply_payload(row, payload, league)
    # First self-signup in a fresh (non-seeded) league becomes the organiser.
    if creating and not league.seeded:
        existing = await session.scalar(
            select(func.count()).select_from(Participant)
            .where(Participant.league_id == league.id, Participant.removed == False)  # noqa: E712
        )
        if existing <= 1:  # this row already added
            row.is_organiser = True
    await session.commit()
    return row


@app.post("/api/leagues/{code}/participants")
async def create_participant(
    code: str,
    payload: ParticipantPayload,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _guard_account_write(session, league, payload.id, x_wheesht_account_token, x_wheesht_admin_token)
        # Guard against duplicate signups in the fixed seeded roster: if this is a
        # brand-new id whose name already belongs to an active entry, the user
        # should claim that entry, not create a second "Matthew Mortimer".
        existing_row = await session.get(Participant, payload.id)
        if existing_row is None and league.seeded and league.code == _CONFIG_LEAGUE_CODE:
            target = (payload.name or "").strip().lower()
            if target and target in await _active_names(session, league):
                raise HTTPException(
                    status_code=409,
                    detail="An entry already exists for that name — find it and sign in instead of creating a new one.",
                )
        row = await _upsert_participant(session, league, payload)
        return {"ok": True, "participant": _participant_to_dict(row, league.code)}


@app.put("/api/leagues/{code}/participants/{participant_id}")
async def update_participant(
    code: str,
    participant_id: str,
    payload: ParticipantPayload,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _guard_account_write(session, league, participant_id, x_wheesht_account_token, x_wheesht_admin_token)
        payload.id = participant_id
        row = await _upsert_participant(session, league, payload)
        return {"ok": True, "participant": _participant_to_dict(row, league.code)}


@app.delete("/api/leagues/{code}/participants/{participant_id}")
async def delete_participant(
    code: str,
    participant_id: str,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        _require_admin(league, x_wheesht_admin_token)
        row = await session.get(Participant, participant_id)
        is_seeded_base = (
            league.seeded and league.code == _CONFIG_LEAGUE_CODE
            and any(rp["id"] == participant_id for rp in _ROSTER)
        )
        if row is not None and row.league_id == league.id:
            if is_seeded_base:
                row.removed = True  # tombstone, keep the row
            else:
                await session.delete(row)
            await session.commit()
            return {"ok": True}
        if is_seeded_base:
            # No DB row yet — insert a tombstone to hide the config entry.
            session.add(Participant(
                id=participant_id, league_id=league.id, name="", removed=True,
            ))
            await session.commit()
            return {"ok": True}
        raise HTTPException(status_code=404, detail="participant not found")


class PickPayload(BaseModel):
    key: str
    value: Any


@app.put("/api/leagues/{code}/participants/{participant_id}/picks")
async def set_pick(
    code: str,
    participant_id: str,
    payload: PickPayload,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _guard_account_write(session, league, participant_id, x_wheesht_account_token, x_wheesht_admin_token)
        row = await session.get(Participant, participant_id)
        if row is None or row.league_id != league.id:
            # Seeded base entry making its first pick → materialise a DB row.
            base = next((rp for rp in _ROSTER if rp["id"] == participant_id), None) \
                if (league.seeded and league.code == _CONFIG_LEAGUE_CODE) else None
            if base is None:
                raise HTTPException(status_code=404, detail="participant not found")
            row = Participant(
                id=participant_id, league_id=league.id, name=base["name"],
                initials=base.get("initials", ""), team=base.get("team", ""),
                color=base.get("color", "#E8272A"), location=base.get("location", "Edinburgh"),
                city=base.get("city", "Edinburgh"), stage=base.get("stage", ""),
                alive=bool(base.get("alive", True)), is_oi=True, picks={}, removed=False,
            )
            session.add(row)
        picks = dict(row.picks or {})
        picks[payload.key] = payload.value
        row.picks = picks
        await session.commit()
        return {"ok": True, "picks": picks}


# ── Profiles & avatars (league-scoped) ────────────────────────────────────────
# Identity layer: an editable display name, a favourite team, and an avatar image
# stored in Postgres. All keyed by participant id, additive to the existing
# entrant — the base `name` is never overwritten (organiser keeps the original).
# Writes are open (no admin token) to match the existing trust model where
# anyone on the device can edit entrant details; hard moderation lives in the
# organiser tools.

class ProfilePayload(BaseModel):
    displayName: Optional[str] = None
    favouriteTeam: Optional[str] = None


def _profile_to_dict(prof: Optional[Profile]) -> Dict[str, Any]:
    return {
        "displayName": (getattr(prof, "display_name", "") or "") if prof else "",
        "favouriteTeam": (getattr(prof, "favourite_team", "") or "") if prof else "",
        "avatarSource": (getattr(prof, "avatar_source", "") or "") if prof else "",
        "avatarVersion": (getattr(prof, "avatar_version", 0) or 0) if prof else 0,
    }


@app.get("/api/leagues/{code}/participants/{participant_id}/profile")
async def get_profile(code: str, participant_id: str):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        prof = await session.get(Profile, participant_id)
        if prof is not None and prof.league_id != league.id:
            prof = None
        return _profile_to_dict(prof)


@app.put("/api/leagues/{code}/participants/{participant_id}/profile")
async def put_profile(
    code: str,
    participant_id: str,
    payload: ProfilePayload,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        if not await _participant_in_league(session, league, participant_id):
            raise HTTPException(status_code=404, detail="participant not found")
        await _guard_account_write(session, league, participant_id, x_wheesht_account_token, x_wheesht_admin_token)

        fav = payload.favouriteTeam
        if fav is not None:
            fav = (fav or "").strip().upper()
            if fav and fav not in _TEAM_CODES:
                raise HTTPException(status_code=400, detail="unknown team")

        prof = await session.get(Profile, participant_id)
        if prof is None:
            prof = Profile(
                participant_id=participant_id, league_id=league.id,
                display_name="", favourite_team="", avatar_source="",
                avatar_version=0, updated_at=_now(),
            )
            session.add(prof)
        if payload.displayName is not None:
            prof.display_name = (payload.displayName or "").strip()[:_MAX_DISPLAY_NAME]
        if fav is not None:
            prof.favourite_team = fav
        prof.updated_at = _now()
        await session.commit()
        return {"ok": True, "profile": _profile_to_dict(prof)}


class AvatarPayload(BaseModel):
    # A data URL: "data:image/jpeg;base64,…". The client crops/resizes first.
    dataUrl: str


def _decode_data_url(data_url: str) -> tuple[str, bytes]:
    m = re.match(r"data:([\w/+.\-]+);base64,(.*)$", data_url or "", re.DOTALL)
    if not m:
        raise HTTPException(status_code=400, detail="expected a base64 image data URL")
    ctype = m.group(1).lower()
    if ctype not in _ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="unsupported image type")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="invalid base64 image")
    if not raw:
        raise HTTPException(status_code=400, detail="empty image")
    if len(raw) > _MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="image too large")
    return ctype, raw


@app.put("/api/leagues/{code}/participants/{participant_id}/avatar")
async def put_avatar(
    code: str,
    participant_id: str,
    payload: AvatarPayload,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    ctype, raw = _decode_data_url(payload.dataUrl)
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        if not await _participant_in_league(session, league, participant_id):
            raise HTTPException(status_code=404, detail="participant not found")
        await _guard_account_write(session, league, participant_id, x_wheesht_account_token, x_wheesht_admin_token)

        asset = await session.get(ProfileAsset, participant_id)
        if asset is None:
            asset = ProfileAsset(
                participant_id=participant_id, league_id=league.id,
                content_type=ctype, data=raw, updated_at=_now(),
            )
            session.add(asset)
        else:
            asset.league_id = league.id
            asset.content_type = ctype
            asset.data = raw
            asset.updated_at = _now()

        prof = await session.get(Profile, participant_id)
        if prof is None:
            prof = Profile(
                participant_id=participant_id, league_id=league.id,
                display_name="", favourite_team="", avatar_source="upload",
                avatar_version=1, updated_at=_now(),
            )
            session.add(prof)
        else:
            prof.avatar_source = "upload"
            prof.avatar_version = (prof.avatar_version or 0) + 1
            prof.updated_at = _now()
        await session.commit()
        return {"ok": True, "avatarVersion": prof.avatar_version}


@app.get("/api/leagues/{code}/participants/{participant_id}/avatar")
async def get_avatar(code: str, participant_id: str):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        asset = await session.get(ProfileAsset, participant_id)
        if asset is None or asset.league_id != league.id:
            raise HTTPException(status_code=404, detail="no avatar")
        # The URL carries a ?v={version} cache-buster, so the bytes for a given
        # URL never change — safe to cache hard.
        return Response(
            content=asset.data,
            media_type=asset.content_type or "image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )


@app.delete("/api/leagues/{code}/participants/{participant_id}/avatar")
async def delete_avatar(
    code: str,
    participant_id: str,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _guard_account_write(session, league, participant_id, x_wheesht_account_token, x_wheesht_admin_token)
        asset = await session.get(ProfileAsset, participant_id)
        if asset is not None and asset.league_id == league.id:
            await session.delete(asset)
        prof = await session.get(Profile, participant_id)
        if prof is not None and prof.league_id == league.id:
            prof.avatar_source = ""
            prof.avatar_version = (prof.avatar_version or 0) + 1
            prof.updated_at = _now()
        await session.commit()
        return {"ok": True}


# ── Per-account passwords (optional sign-in lock) ─────────────────────────────
# An account may set an OPTIONAL password. Once set it locks taking the account
# over / resuming it on a new device, and gates writes to the entry (sign-in
# lock: prove the password once, reuse the token). Passwordless accounts keep the
# open "just tap who you are" behaviour. The organiser can clear a password
# (admin token) so nobody is ever permanently locked out.

_MIN_ACCOUNT_PASSWORD = 4


class AccountAuthPayload(BaseModel):
    password: str


class AccountPasswordPayload(BaseModel):
    # newPassword: non-empty → set/change; "" → clear the lock. None is invalid.
    newPassword: Optional[str] = None
    currentPassword: Optional[str] = None


@app.post("/api/leagues/{code}/participants/{participant_id}/auth")
async def account_auth(code: str, participant_id: str, payload: AccountAuthPayload):
    """Sign in to a password-protected entry; returns a reusable account token."""
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        h = await _account_password_hash(session, league, participant_id)
        if not h:
            raise HTTPException(status_code=400, detail="This entry has no password set")
        if not _verify_password(payload.password or "", h):
            raise HTTPException(status_code=403, detail="Wrong password")
        return {"ok": True, "token": _account_token_for(league, participant_id)}


@app.put("/api/leagues/{code}/participants/{participant_id}/password")
async def set_account_password(
    code: str,
    participant_id: str,
    payload: AccountPasswordPayload,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Set, change or clear an entry's password.

    Changing/clearing an EXISTING password requires proof: the current password,
    a valid account token, or the organiser token (reset / unlock). Setting the
    FIRST password on an open entry is allowed for whoever holds it — the same
    open trust as today, but strictly more protection from then on.
    """
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        if not await _participant_in_league(session, league, participant_id):
            raise HTTPException(status_code=404, detail="participant not found")

        existing = await _account_password_hash(session, league, participant_id)
        gprof = await session.get(Profile, participant_id)
        has_google = gprof is not None and gprof.league_id == league.id and bool(gprof.google_id)
        # Changing an existing password — or setting one on an entry already claimed
        # via Google — requires proof, so a bystander can't lock the owner out.
        if existing or has_google:
            ok = (
                (existing and payload.currentPassword and _verify_password(payload.currentPassword, existing))
                or (x_wheesht_account_token and _account_token_ok(league, participant_id, x_wheesht_account_token))
                or (x_wheesht_admin_token and _admin_token_ok(league, x_wheesht_admin_token))
            )
            if not ok:
                raise HTTPException(status_code=403, detail="Sign in first to set a password on this entry")

        new = payload.newPassword
        if new:  # set / change
            if len(new) < _MIN_ACCOUNT_PASSWORD:
                raise HTTPException(status_code=400, detail=f"Password must be at least {_MIN_ACCOUNT_PASSWORD} characters")
            row = await _get_or_materialise(session, league, participant_id)
            if row is None:
                raise HTTPException(status_code=404, detail="participant not found")
            row.password_hash = _hash_password(new)
            await session.commit()
            return {"ok": True, "hasPassword": True, "token": _account_token_for(league, participant_id)}

        # clear the lock
        row = await session.get(Participant, participant_id)
        if row is not None and row.league_id == league.id:
            row.password_hash = None
            await session.commit()
        return {"ok": True, "hasPassword": False}


# ── Google Sign-In ────────────────────────────────────────────────────────────
# Participants may link their Google identity (via ID token → tokeninfo) to their
# profile. Once linked they can authenticate anywhere without a password. The link
# endpoint doubles as a re-authentication path: if the incoming google_id already
# matches the stored one, the Google token itself is treated as proof of identity
# (bypassing the normal account-token/password guard).

class GoogleAuthPayload(BaseModel):
    idToken: str


@app.post("/api/leagues/{code}/participants/{participant_id}/google-auth")
async def google_auth_link(
    code: str,
    participant_id: str,
    payload: GoogleAuthPayload,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Link (or re-authenticate with) a Google account. Returns a fresh account token."""
    if not _GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured on this server")
    claims = await _verify_google_token(payload.idToken)
    google_sub = claims["sub"]

    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        if not await _participant_in_league(session, league, participant_id):
            raise HTTPException(status_code=404, detail="participant not found")

        # Make sure the entry exists as a real row (seeded base entries are
        # otherwise config-only) so cross-device Google login can find it later.
        await _get_or_materialise(session, league, participant_id)
        prof = await session.get(Profile, participant_id)

        # Re-auth path: existing link matches → Google token IS the auth proof.
        re_auth = prof is not None and prof.google_id == google_sub

        if not re_auth:
            # New link: ensure this Google account is not already linked elsewhere.
            conflict = await session.execute(
                select(Profile).where(
                    Profile.league_id == league.id,
                    Profile.google_id == google_sub,
                )
            )
            if conflict.scalar_one_or_none() is not None:
                raise HTTPException(status_code=409, detail="This Google account is already linked to another entry in this league")
            # Guard just like any other profile write.
            await _guard_account_write(session, league, participant_id, x_wheesht_account_token, x_wheesht_admin_token)

        if prof is None:
            prof = Profile(
                participant_id=participant_id, league_id=league.id,
                display_name="", favourite_team="", avatar_source="",
                avatar_version=0, google_id=google_sub, updated_at=_now(),
            )
            session.add(prof)
        else:
            prof.google_id = google_sub
            prof.updated_at = _now()

        # Pull the Google profile picture as the avatar when no photo is set yet.
        picture_url = claims.get("picture")
        if picture_url and prof.avatar_source in ("", "google"):
            try:
                asset = await session.get(ProfileAsset, participant_id)
                if asset is None or prof.avatar_source == "google":
                    async with httpx.AsyncClient(timeout=8.0) as client:
                        img_r = await client.get(picture_url)
                    if img_r.status_code == 200:
                        ct = img_r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                        data = img_r.content
                        if len(data) <= _MAX_AVATAR_BYTES:
                            if asset is None:
                                asset = ProfileAsset(
                                    participant_id=participant_id, league_id=league.id,
                                    content_type=ct, data=data, updated_at=_now(),
                                )
                                session.add(asset)
                            else:
                                asset.content_type = ct
                                asset.data = data
                                asset.updated_at = _now()
                            prof.avatar_source = "google"
                            prof.avatar_version = (prof.avatar_version or 0) + 1
            except Exception:
                pass  # avatar fetch failure is non-fatal

        await session.commit()
        return {
            "ok": True,
            "token": _account_token_for(league, participant_id),
            "avatarVersion": prof.avatar_version,
        }


@app.delete("/api/leagues/{code}/participants/{participant_id}/google-auth")
async def google_auth_unlink(
    code: str,
    participant_id: str,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Unlink the Google identity from this participant's profile."""
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        if not await _participant_in_league(session, league, participant_id):
            raise HTTPException(status_code=404, detail="participant not found")

        prof = await session.get(Profile, participant_id)
        # To unlink Google, require a valid account token OR admin token.
        # This prevents a bystander from unlinking someone else's Google account.
        has_auth = (
            (x_wheesht_admin_token and _admin_token_ok(league, x_wheesht_admin_token))
            or (x_wheesht_account_token and _account_token_ok(league, participant_id, x_wheesht_account_token))
        )
        if not has_auth:
            raise HTTPException(status_code=403, detail="Sign in first to unlink Google")

        if prof and prof.league_id == league.id and prof.google_id:
            prof.google_id = None
            prof.updated_at = _now()
            await session.commit()
        return {"ok": True}


class GoogleLoginPayload(BaseModel):
    idToken: str


@app.post("/api/leagues/{code}/google-login")
async def google_login(code: str, payload: GoogleLoginPayload):
    """Cross-device login: find the participant in this league linked to the given
    Google account and return a fresh account token. No pre-existing auth needed —
    the Google token is the credential."""
    if not _GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured on this server")
    claims = await _verify_google_token(payload.idToken)
    google_sub = claims["sub"]

    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")

        res = await session.execute(
            select(Profile).where(Profile.league_id == league.id, Profile.google_id == google_sub)
        )
        prof = res.scalar_one_or_none()
        if prof is None:
            raise HTTPException(status_code=404, detail="No entry in this league is linked to that Google account")

        p = await session.get(Participant, prof.participant_id)
        base = _seeded_base(league, prof.participant_id)
        if p is not None and p.removed:
            raise HTTPException(status_code=404, detail="participant not found")
        if p is None and base is None:
            raise HTTPException(status_code=404, detail="participant not found")

        display = (prof.display_name or "").strip() or (p.name if p else base.get("name", ""))
        return {
            "ok": True,
            "participantId": prof.participant_id,
            "name": display,
            "token": _account_token_for(league, prof.participant_id),
        }


# ── Admin overrides (league-scoped) ───────────────────────────────────────────

class AdminPayload(BaseModel):
    teams: Dict[str, Any] = {}
    fixtures: Dict[str, Any] = {}
    predictions: Dict[str, Any] = {}
    meta: Dict[str, Any] = {}


@app.put("/api/leagues/{code}/admin")
async def put_admin(
    code: str,
    payload: AdminPayload,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        _require_admin(league, x_wheesht_admin_token)
        row = await session.get(AdminOverride, league.id)
        if row is None:
            session.add(AdminOverride(league_id=league.id, data=payload.model_dump(), updated_at=_now()))
        else:
            row.data = payload.model_dump()
            row.updated_at = _now()
        await session.commit()
        return {"ok": True}


# ── Chat (league-scoped) ──────────────────────────────────────────────────────

class ChatPayload(BaseModel):
    author_id: str
    text: str


def _chat_to_dict(m: ChatMessage) -> Dict[str, Any]:
    return {
        "id": m.id, "author_id": m.author_id, "author": m.author,
        "initials": m.initials, "color": m.color, "team": m.team,
        "text": m.text, "ts": m.ts,
    }


@app.get("/api/leagues/{code}/chat")
async def get_chat(code: str):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        res = await session.execute(
            select(ChatMessage).where(ChatMessage.league_id == league.id)
            .order_by(ChatMessage.ts.desc()).limit(100)
        )
        rows = list(res.scalars().all())
    rows.reverse()  # oldest → newest for the wall
    return [_chat_to_dict(m) for m in rows]


@app.post("/api/leagues/{code}/chat")
async def post_chat(code: str, payload: ChatPayload):
    text = payload.text.strip()[:280]
    if not text:
        raise HTTPException(status_code=400, detail="empty message")
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        rows = await _participant_rows(session, league)
        profiles = await _profiles_for(session, league)
        people = _league_people(league, rows, profiles)
        person = next((p for p in people if p["id"] == payload.author_id), None)
        if person is None:
            raise HTTPException(status_code=400, detail="unknown participant for this league")
        # Show the member's chosen display name on the wall; fall back to base.
        author_name = (person.get("displayName") or "").strip() or person["name"]
        msg = ChatMessage(
            id=uuid.uuid4().hex[:10], league_id=league.id, author_id=person["id"],
            author=author_name, initials=person.get("initials", "?"),
            color=person.get("color", "#333"), team=person.get("team", ""),
            text=text, ts=int(time.time() * 1000),
        )
        session.add(msg)
        await session.commit()
        return _chat_to_dict(msg)


class SystemChatPayload(BaseModel):
    text: str
    mood: str = "confident"


@app.post("/api/leagues/{code}/chat/system")
async def post_system_chat(
    code: str,
    payload: SystemChatPayload,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Post a Wheesht announcement banner to the league chat.
    Triggered server-side by admin actions (deadline change, market toggle)."""
    text = payload.text.strip()[:400]
    if not text:
        raise HTTPException(status_code=400, detail="empty message")
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        _require_admin(league, x_wheesht_admin_token)
        msg = ChatMessage(
            id=uuid.uuid4().hex[:10], league_id=league.id,
            author_id="wheesht", author="Wheesht",
            initials="W", color="#1A1A1A",
            team=payload.mood,  # repurpose team field to carry the mood for rendering
            text=text, ts=int(time.time() * 1000),
        )
        session.add(msg)
        await session.commit()
        return _chat_to_dict(msg)


class DynamicMarketPayload(BaseModel):
    fixture_id: str
    type: str  # "winner" | "scoreline"
    points: int = 5
    notify_chat: bool = True


@app.post("/api/leagues/{code}/predictions/match")
async def create_match_prediction(
    code: str,
    payload: DynamicMarketPayload,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Admin creates an ad-hoc fixture prediction market."""
    if payload.type not in ("winner", "scoreline"):
        raise HTTPException(status_code=400, detail="type must be winner or scoreline")
    if not 1 <= payload.points <= 50:
        raise HTTPException(status_code=400, detail="points must be 1–50")
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        _require_admin(league, x_wheesht_admin_token)
        # validate fixture exists and is upcoming
        fix = next((f for f in _base_fixtures() if f["id"] == payload.fixture_id), None)
        if fix is None:
            raise HTTPException(status_code=404, detail="fixture not found")
        team_map = {t["code"]: t for t in _wc_data["teams"]}
        ta = team_map.get(fix["a"], {}); tb = team_map.get(fix["b"], {})
        na = ta.get("name", fix["a"]); nb = tb.get("name", fix["b"])
        fa = ta.get("flag", ""); fb = tb.get("flag", "")
        market_id = "dm_" + fix["id"].replace("-", "_") + "_" + str(int(time.time()))
        label = fa + " " + na + " vs " + fb + " " + nb + " — " + payload.type
        # load / create AdminOverride
        row = await session.get(AdminOverride, league.id)
        data = dict(row.data) if row and row.data else {}
        dms = list(data.get("dynamicMarkets") or [])
        dms.append({"id": market_id, "fixture_id": payload.fixture_id,
                    "type": payload.type, "points": payload.points, "label": label})
        data["dynamicMarkets"] = dms
        if row:
            row.data = data
        else:
            session.add(AdminOverride(league_id=league.id, data=data))
        # optional chat announcement
        if payload.notify_chat:
            type_label = "winner" if payload.type == "winner" else "exact scoreline"
            chat_text = ("New match prediction: " + fa + " " + na + " vs " + fb + " " + nb +
                         " — predict the " + type_label + "! Worth " + str(payload.points) +
                         " point" + ("s" if payload.points != 1 else "") + ". Head to Predictions to pick.")
            chat_msg = ChatMessage(
                id=uuid.uuid4().hex[:10], league_id=league.id,
                author_id="wheesht", author="Wheesht",
                initials="W", color="#1A1A1A", team="mischievous",
                text=chat_text, ts=int(time.time() * 1000),
            )
            session.add(chat_msg)
        await session.commit()
        return {"id": market_id, "label": label}


@app.delete("/api/leagues/{code}/predictions/match/{market_id}")
async def delete_match_prediction(
    code: str,
    market_id: str,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Admin removes a dynamic fixture prediction market."""
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        _require_admin(league, x_wheesht_admin_token)
        row = await session.get(AdminOverride, league.id)
        if not row or not row.data:
            return {"ok": True}
        data = dict(row.data)
        dms = [m for m in (data.get("dynamicMarkets") or []) if m["id"] != market_id]
        data["dynamicMarkets"] = dms
        # also remove any stored answer for this market
        preds = dict(data.get("predictions") or {})
        preds.pop(market_id, None)
        data["predictions"] = preds
        row.data = data
        await session.commit()
        return {"ok": True}


@app.delete("/api/leagues/{code}/chat/{message_id}")
async def delete_chat(
    code: str,
    message_id: str,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        _require_admin(league, x_wheesht_admin_token)
        row = await session.get(ChatMessage, message_id)
        if row is None or row.league_id != league.id:
            raise HTTPException(status_code=404, detail="message not found")
        await session.delete(row)
        await session.commit()
        return {"ok": True}


# ── Dev console (hidden cross-league admin) ───────────────────────────────────
# A master-keyed endpoint that lists every league so a developer can drop into
# any of them. The key is checked here (constant-time) and never leaves the
# server. Per-league admin/results endpoints are reused once a league is chosen.

class DevAuth(BaseModel):
    key: str


def _dev_key_ok(key: str) -> bool:
    if not _DEV_KEY:
        return False
    return hmac.compare_digest(key or "", _DEV_KEY)


@app.post("/api/dev/leagues")
async def dev_list_leagues(payload: DevAuth):
    if not _dev_key_ok(payload.key):
        # Same shape whether the key is wrong or the feature is off — no probing.
        raise HTTPException(status_code=403, detail="Developer access denied")
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(League).order_by(League.created_at.desc()))
        leagues = list(res.scalars().all())
        out: List[Dict[str, Any]] = []
        for lg in leagues:
            rows = await _participant_rows(session, lg)
            entrants = len(_league_people(lg, rows))
            item = _league_public(lg)
            item["entrants"] = entrants
            item["createdAt"] = lg.created_at.isoformat() if lg.created_at else None
            item["adminToken"] = _admin_token_for(lg)
            out.append(item)
    return {"leagues": out}


# ── Static file serving ───────────────────────────────────────────────────────

_STATIC = Path("static")
_JS_TYPES = {
    ".js": "application/javascript",
    ".jsx": "application/javascript",
    ".css": "text/css",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
}


def _safe_static_path(base: Path, filename: str) -> Path:
    root = base.resolve()
    path = (base / filename).resolve()
    if not path.is_file() or root not in path.parents:
        raise HTTPException(status_code=404)
    return path


@app.get("/manifest.webmanifest")
async def web_manifest():
    return FileResponse(
        _STATIC / "manifest.webmanifest",
        media_type="application/manifest+json",
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/sw.js")
async def service_worker():
    return FileResponse(
        _STATIC / "sw.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.get("/icons/{filename:path}")
async def pwa_icon(filename: str):
    path = _safe_static_path(_STATIC / "icons", filename)
    return FileResponse(
        path,
        media_type=_JS_TYPES.get(path.suffix, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@app.get("/tweaks-panel.jsx")
async def tweaks_panel():
    return FileResponse(_STATIC / "tweaks-panel.jsx", media_type="application/javascript")


@app.get("/app/{filename:path}")
async def app_static(filename: str):
    path = _safe_static_path(_STATIC / "app", filename)
    mt = _JS_TYPES.get(path.suffix, "application/octet-stream")
    return FileResponse(path, media_type=mt)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
