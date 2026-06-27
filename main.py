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
import csv
import hashlib
import hmac
import html
import io
import json
import logging
import os
import re
import secrets
import time
import uuid
from urllib.parse import quote

import httpx
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError

import standings
from bracket_projection import build_projected_bracket
import sync
from db import AsyncSessionLocal, engine
from models import (
    AdminOverride,
    AuditEvent,
    Base,
    ChatMessage,
    FunnelEvent,
    League,
    LeaguePurchase,
    Participant,
    Payment,
    Profile,
    ProfileAsset,
)
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
_JOIN_TEMPLATE = Path("templates/join.html").read_text(encoding="utf-8")
_OG_IMAGE_PATH = "/og/wheesht-og.png"

# Master developer key for the hidden cross-league dev console. It must come
# from the deployment environment; there is intentionally no committed fallback.
_DEV_KEY: str = os.environ.get("WC_DEV_KEY", "")

# Google Identity Services. The client_id is public (sent to browsers).
# The client_secret must live ONLY in WC_GOOGLE_CLIENT_SECRET Railway env var;
# it is never shipped to the client and is not used for token verification
# (we use Google's tokeninfo endpoint which needs no secret).
_GOOGLE_CLIENT_ID: str = os.environ.get("WC_GOOGLE_CLIENT_ID", "")

_STRIPE_SECRET_KEY: str = os.environ.get("STRIPE_SECRET_KEY", "")
_STRIPE_WEBHOOK_SECRET: str = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
_STRIPE_PUBLISHABLE_KEY: str = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
_STRIPE_PRO_PRICE_ID: str = os.environ.get("STRIPE_PRO_PRICE_ID", "")
try:
    _STRIPE_PRO_AMOUNT_PENCE: int = max(0, int(os.environ.get("STRIPE_PRO_AMOUNT_PENCE", "0") or "0"))
except ValueError:
    _STRIPE_PRO_AMOUNT_PENCE = 0

_PRO_META_KEYS = frozenset({"hiddenPredictions", "predDeadline", "customFields"})

_FUNNEL_EVENTS = frozenset({
    "gate_view", "demo_enter", "join_start", "join_success", "draw_complete",
    "share_open", "install_prompt_shown", "invite_view", "pro_checkout_started", "pro_purchase_success",
})

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
_RATE_BUCKETS: Dict[str, List[float]] = {}
_UK_TZ = ZoneInfo("Europe/London")


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _client_key(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    host = forwarded or (request.client.host if request.client else "unknown")
    return host[:80]


def _rate_limit(request: Request, bucket: str, limit: int, window_seconds: int) -> None:
    now = time.time()
    if len(_RATE_BUCKETS) > 5000:
        cutoff = now - window_seconds
        for stale_key in [k for k, vals in _RATE_BUCKETS.items() if not vals or max(vals) < cutoff]:
            _RATE_BUCKETS.pop(stale_key, None)
    key = f"{bucket}:{_client_key(request)}"
    hits = [t for t in _RATE_BUCKETS.get(key, []) if now - t < window_seconds]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again shortly.")
    hits.append(now)
    _RATE_BUCKETS[key] = hits


def _audit_event(data: Dict[str, Any], action: str, actor: str = "organiser", detail: str = "") -> Dict[str, Any]:
    out = dict(data) if isinstance(data, dict) else {}
    audit = [x for x in (out.get("audit") or []) if isinstance(x, dict)]
    audit = audit[-79:]
    audit.append({
        "ts": int(time.time() * 1000),
        "action": str(action or "change")[:40],
        "actor": str(actor or "organiser")[:40],
        "detail": str(detail or "")[:180],
    })
    out["audit"] = audit
    return out


def _log_audit(
    session,
    league_id: str,
    action: str,
    actor: str = "organiser",
    actor_id: Optional[str] = None,
    detail: str = "",
) -> None:
    """Append a durable audit row. Added to the caller's session (not committed
    here) so it lands in the same transaction as the change it records. This is
    the source of truth the Security tab reads; the JSON `audit` array on
    AdminOverride is kept in parallel only for backward compatibility."""
    session.add(AuditEvent(
        id=uuid.uuid4().hex,
        league_id=league_id,
        ts=int(time.time() * 1000),
        action=str(action or "change")[:40],
        actor=str(actor or "organiser")[:40],
        actor_id=(str(actor_id)[:64] if actor_id else None),
        detail=str(detail or "")[:180],
    ))


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


def _admin_token_for(league: League, participant_id: Optional[str] = None) -> str:
    """Mint an organiser token. When the organiser's device participant id is
    known the token is bound to it (`v2.{ts}.{pid}.{sig}`) so the server can
    confirm the holder is still a real entry; otherwise a legacy unbound `v1.`
    token is issued."""
    ts = str(int(time.time()))
    if participant_id:
        msg = f"{league.id}:{league.code}:{participant_id}:{ts}".encode("utf-8")
        sig = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        return f"v2.{ts}.{participant_id}.{sig}"
    msg = f"{league.id}:{league.code}:{ts}".encode("utf-8")
    sig = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"v1.{ts}.{sig}"


def _admin_token_parse(league: League, token: Optional[str]) -> Optional[str]:
    """Validate an admin token's signature and TTL. Returns the bound participant
    id for a valid v2 token, "" for a valid (unbound) v1 token, or None when the
    token is missing, malformed, expired, or wrongly signed."""
    raw = token or ""
    if raw.startswith("v2."):
        try:
            _version, ts_s, pid, sig = raw.split(".", 3)
            ts = int(ts_s)
        except (ValueError, AttributeError):
            return None
        if int(time.time()) - ts > _ADMIN_TOKEN_TTL_SECONDS:
            return None
        msg = f"{league.id}:{league.code}:{pid}:{ts_s}".encode("utf-8")
        expected = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        return pid if hmac.compare_digest(sig, expected) else None
    try:
        version, ts_s, sig = raw.split(".", 2)
        ts = int(ts_s)
    except (ValueError, AttributeError):
        return None
    if version != "v1" or int(time.time()) - ts > _ADMIN_TOKEN_TTL_SECONDS:
        return None
    msg = f"{league.id}:{league.code}:{ts_s}".encode("utf-8")
    expected = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return "" if hmac.compare_digest(sig, expected) else None


def _admin_token_ok(league: League, token: Optional[str]) -> bool:
    """Signature/TTL check only (no DB lookup). Used where a request just needs
    to know the caller is the organiser — chat, password resets, Google unlink.
    Endpoint write-guards use the async _require_admin for the v2 binding check."""
    return _admin_token_parse(league, token) is not None


# Leagues whose organiser code still falls back to the member password are logged
# once per process so the warning is visible without spamming every auth attempt.
_legacy_org_warned: set = set()


def _admin_code_ok(league: League, code: str) -> bool:
    code = code or ""
    # Every organiser code is now verified against a stored PBKDF2 hash — the
    # seeded league's hash is set from the configured PIN at startup, so there is
    # no plaintext comparison anywhere.
    if league.organiser_hash:
        return _verify_password(code, league.organiser_hash)
    # Legacy custom leagues created before separate organiser codes shipped have
    # no organiser_hash; fall back to the member password as the organiser code.
    if league.password_hash:
        if league.id not in _legacy_org_warned:
            _legacy_org_warned.add(league.id)
            log.warning(
                "League %s has no organiser_hash; using legacy member-password fallback",
                league.code,
            )
        return _verify_password(code, league.password_hash)
    return False


async def _require_admin(session, league: League, token: Optional[str]) -> None:
    """Guard every organiser write. Validates the token signature/TTL and, for
    v2 (participant-bound) tokens, confirms the bound entry is still a real,
    non-removed participant in this league — so a token minted for an entry that
    was later removed stops working. v1 tokens stay accepted during transition."""
    pid = _admin_token_parse(league, token)
    if pid is None:
        raise HTTPException(status_code=403, detail="Organiser access required")
    if pid:
        row = await session.get(Participant, pid)
        in_league = row is not None and row.league_id == league.id and not row.removed
        if not in_league and _seeded_base(league, pid) is None:
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


# Per-participant SESSION tokens. A session token is proof that this device
# currently controls a given entry — issued whenever the server has just
# confirmed control (claim, sign-in, or an explicit session request for an open
# entry). It is lighter than an account token: an account token is the
# password/Google sign-in LOCK, whereas a session token just stops a stranger
# from POSTing chat as someone else's id. Same HMAC construction and server
# secret; never leaves the server unverified.
_SESSION_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60  # 90 days


def _session_token_for(league: League, participant_id: str) -> str:
    ts = str(int(time.time()))
    msg = f"sess:{league.id}:{participant_id}:{ts}".encode("utf-8")
    sig = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"s1.{ts}.{sig}"


def _session_token_ok(league: League, participant_id: str, token: Optional[str]) -> bool:
    try:
        version, ts_s, sig = (token or "").split(".", 2)
        ts = int(ts_s)
    except (ValueError, AttributeError):
        return False
    if version != "s1" or int(time.time()) - ts > _SESSION_TOKEN_TTL_SECONDS:
        return False
    msg = f"sess:{league.id}:{participant_id}:{ts_s}".encode("utf-8")
    expected = hmac.new(_ADMIN_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


def _chat_author_ok(
    league: League,
    author_id: str,
    session_token: Optional[str],
    account_token: Optional[str],
    admin_token: Optional[str],
) -> bool:
    """A chat message may only be posted as `author_id` by someone who can prove
    they control that entry: a session token (issued at claim/sign-in), an
    account token (password/Google sign-in), or the organiser's admin token.
    Knowing another entrant's id is no longer enough to post as them."""
    if admin_token and _admin_token_ok(league, admin_token):
        return True
    if session_token and _session_token_ok(league, author_id, session_token):
        return True
    if account_token and _account_token_ok(league, author_id, account_token):
        return True
    return False


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
    has_pro = _league_has_pro(league)
    return {
        "id": league.id,
        "code": league.code,
        "name": league.name,
        "seeded": league.seeded,
        "hasPro": has_pro,
        "proStatus": "pro" if has_pro else "free",
        "proGrandfathered": _league_is_grandfathered(league),
    }


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
        "customFields": p.custom_fields or {},
        "predScore": p.pred_score,
        "joinedAt": p.joined_at,
        "paymentStatus": p.payment_status or "unpaid",
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
        d.setdefault("paymentStatus", "unpaid")
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
        if not isinstance(dm, dict):
            continue
        market_id = str(dm.get("id") or "")
        fixture_id = str(dm.get("fixture_id") or "")
        if not market_id or not fixture_id:
            continue
        f = fix_map.get(fixture_id)
        if not f:
            continue
        ta = team_map.get(f["a"], {}); tb = team_map.get(f["b"], {})
        fa = ta.get("flag", f["a"]); fb = tb.get("flag", f["b"])
        na = ta.get("name", f["a"]); nb = tb.get("name", f["b"])
        dm_type = dm.get("type", "winner")
        try:
            dm_points = max(1, min(50, int(dm.get("points", 5))))
        except (TypeError, ValueError):
            dm_points = 5
        fix_status = f.get("status", "upcoming")
        if dm_type == "winner":
            market = {"key": market_id, "q": fa + " " + na + " vs " + fb + " " + nb + " — who wins?",
                      "kind": "team", "points": dm_points,
                      "options": [f["a"], f["b"], "draw"], "answer": None,
                      "fixture_id": fixture_id, "fixture_status": fix_status}
            sc = f.get("score")
            if _status_is_done(fix_status):
                win = standings._winner_of(f)
                if win == "HOME":
                    market["answer"] = f["a"]
                elif win == "AWAY":
                    market["answer"] = f["b"]
                elif win == "DRAW" and f.get("stage") == "group":
                    market["answer"] = "draw"
        else:
            market = {"key": market_id, "q": fa + " " + na + " vs " + fb + " " + nb + " — exact score?",
                      "kind": "scoreline", "points": dm_points,
                      "options": [f["a"], f["b"]], "answer": None,
                      "fixture_id": fixture_id, "fixture_status": fix_status}
            sc = f.get("score")
            if _status_is_done(fix_status) and isinstance(sc, (list, tuple)) and len(sc) == 2 and None not in sc:
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

    people = standings.apply_pred_scores(people, predictions)

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
    stage_labels = dict(_wc_data["meta"].get("stageLabels") or {})
    meta.update(_tournament_fixture_meta(fixtures, teams, phase, stage_labels))
    meta["groupSize"] = len(people)
    meta["stillIn"] = sum(1 for p in people if p.get("alive"))
    meta["out"] = sum(1 for p in people if not p.get("alive"))
    meta["teamsLeft"] = sum(1 for t in teams if t.get("alive"))
    meta["includeDepartment"] = bool(admin_meta.get("includeDepartment", True))
    meta["includeLocation"] = bool(admin_meta.get("includeLocation", True))
    meta["includeLtMember"] = bool(admin_meta.get("includeLtMember", True))
    meta["purpose"] = str(admin_meta.get("purpose", "work"))
    meta["currency"] = str(admin_meta.get("currency") or "£").strip()[:4] or "£"
    try:
        cs = admin_meta.get("charitySplit")
        meta["charitySplit"] = max(0.0, min(1.0, float(cs))) if cs is not None else 0.5
    except (TypeError, ValueError):
        meta["charitySplit"] = 0.5
    locs = admin_meta.get("locations")
    meta["locations"] = [str(x) for x in locs] if isinstance(locs, list) and locs else ["Edinburgh", "London"]
    meta["locationsFreeText"] = bool(admin_meta.get("locationsFreeText", False))
    meta["customFields"] = _clean_custom_fields(list(admin_meta.get("customFields") or []))
    meta["predDeadline"] = admin_meta.get("predDeadline") or None
    meta["hiddenPredictions"] = list(admin_meta.get("hiddenPredictions") or [])
    meta.update(_pro_meta(league))
    meta.update(_fixture_health(fixtures))
    data["meta"] = meta
    data["pot"] = len(people) * fee
    data["charitySplit"] = meta["charitySplit"]
    group_started = any(
        f.get("stage") == "group" and _status_is_done(f.get("status"))
        for f in fixtures or []
    )
    if group_started or meta.get("knockoutsInFeed"):
        data["projectedBracket"] = build_projected_bracket(teams, fixtures)
    else:
        data["projectedBracket"] = {"rounds": {}, "qualifierCount": 0, "source": "standings"}
    return data


def _status_is_done(status: Any) -> bool:
    return str(status or "").strip().lower() in {
        "done", "ft", "fulltime", "full_time", "full-time", "finished",
    }


def _status_is_live(status: Any) -> bool:
    return str(status or "").strip().lower() in {
        "live", "halftime", "half_time", "half-time", "inplay", "in_play",
        "in-progress", "inprogress", "paused", "ht", "1h", "2h",
    }


def _fixture_health(fixtures: List[Dict[str, Any]]) -> Dict[str, Any]:
    updated: List[str] = [
        str(f.get("updatedAt"))
        for f in fixtures or []
        if f.get("updatedAt")
    ]
    needs_result = 0
    now_ms = int(time.time() * 1000)
    for f in fixtures or []:
        if _status_is_done(f.get("status")):
            continue
        if _status_is_live(f.get("status")):
            continue
        try:
            tm = str(f.get("time") or "00:00")[:5]
            kick = datetime.fromisoformat(str(f.get("dateISO")) + "T" + tm + ":00")
            kick_utc = kick.replace(tzinfo=_UK_TZ).astimezone(timezone.utc)
            if now_ms - int(kick_utc.timestamp() * 1000) > 135 * 60 * 1000:
                needs_result += 1
        except Exception:
            pass
    return {
        "fixturesUpdatedAt": max(updated) if updated else None,
        "liveFixtures": sum(1 for f in fixtures or [] if _status_is_live(f.get("status"))),
        "finishedFixtures": sum(1 for f in fixtures or [] if _status_is_done(f.get("status"))),
        "needsResult": needs_result,
    }


def _tournament_fixture_meta(
    fixtures: List[Dict[str, Any]],
    teams: List[Dict[str, Any]],
    phase: str,
    stage_labels: Dict[str, str],
) -> Dict[str, Any]:
    """Fixture inventory + group/knockout phase signals for client and admin."""
    codes = {t["code"] for t in teams}
    counts: Dict[str, int] = {}
    for f in fixtures or []:
        st = str(f.get("stage") or "group")
        counts[st] = counts.get(st, 0) + 1

    groups: Dict[str, List[str]] = {}
    for t in teams:
        g = t.get("group")
        if g:
            groups.setdefault(g, []).append(t["code"])

    group_done = True
    for g, members in groups.items():
        k = len(members)
        expected = k * (k - 1) // 2 if k > 1 else 0
        done_n = sum(
            1 for f in fixtures or []
            if f.get("stage") == "group" and f.get("group") == g and _status_is_done(f.get("status"))
        )
        if expected > 0 and done_n < expected:
            group_done = False
            break
    if not groups:
        group_done = False

    r32_paired = sum(
        1 for f in fixtures or []
        if f.get("stage") == "r32" and f.get("a") in codes and f.get("b") in codes
    )
    r32_published = r32_paired >= 16

    ko_order = ["r32", "r16", "qf", "sf", "final"]
    knockout_round: Optional[str] = None
    for st in ko_order:
        if counts.get(st, 0) <= 0:
            continue
        if any(
            f.get("stage") == st and not _status_is_done(f.get("status"))
            for f in fixtures or []
        ):
            knockout_round = st
            break
        knockout_round = st

    champion = any(t.get("stage") == "winner" for t in teams)
    if phase == "done" or champion:
        stage_label = "Tournament over"
    elif phase == "pre":
        stage_label = "Group stage"
    elif knockout_round:
        stage_label = stage_labels.get(knockout_round, knockout_round.replace("_", " ").title())
    elif group_done and counts.get("r32", 0) == 0:
        stage_label = "Group stage complete"
    elif not group_done:
        stage_label = "Group stage"
    else:
        stage_label = "In play"

    return {
        "fixtureCounts": counts,
        "groupsComplete": group_done,
        "r32Published": r32_published,
        "knockoutsInFeed": sum(counts.get(st, 0) for st in (*ko_order, "third")) > 0,
        "knockoutRound": knockout_round,
        "stageLabel": stage_label,
    }


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
    meta["currency"] = "£"
    meta.update(_fixture_health(data.get("fixtures") or []))
    stage_labels = dict(_wc_data["meta"].get("stageLabels") or {})
    phase = meta.get("phase") or "pre"
    meta.update(_tournament_fixture_meta(
        data.get("fixtures") or [],
        _wc_data.get("teams") or [],
        phase,
        stage_labels,
    ))
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
    # The hidden dev console is only reachable when a dev key is configured.
    parts.append("window.WC_DEV_ENABLED = " + ("true" if _DEV_KEY else "false") + ";")
    injection = "<script>" + "".join(parts) + "</script>"
    return _HTML_TEMPLATE.replace("<!-- WC_DATA_INJECTION -->", injection)


# ── Startup: seed the config league + migrate any legacy JSON ──────────────────

async def _seed_and_migrate() -> None:
    seed = get_league_seed()
    code = (seed["code"] or "OI").upper()
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code)
        # The organiser PIN is stored only as a hash, re-derived from config on
        # every startup so it can be rotated via WC_ADMIN_PIN without a migration
        # (mirrors how the member password is kept in sync below). Never plaintext.
        organiser_hash = _hash_password(_ADMIN_PIN) if _ADMIN_PIN else None
        if league is None:
            league = League(
                id=uuid.uuid4().hex,
                code=code,
                slug=_slugify(seed["name"]),
                name=seed["name"],
                password_hash=_hash_password(seed["password"]),
                organiser_hash=organiser_hash,
                seeded=bool(seed["seeded"]),
                created_at=_now(),
            )
            session.add(league)
            await session.commit()
            log.info("Seeded league %s (%s)", code, seed["name"])
        else:
            # Keep the seeded league's public details + secrets in sync with config.
            league.name = seed["name"]
            league.seeded = bool(seed["seeded"])
            if seed["password"]:
                league.password_hash = _hash_password(seed["password"])
            if organiser_hash:
                league.organiser_hash = organiser_hash
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
        "ALTER TABLE leagues ADD COLUMN IF NOT EXISTS organiser_hash VARCHAR",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS password_hash VARCHAR",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_id VARCHAR",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS custom_fields JSON NOT NULL DEFAULT '{}'::json",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS payment_status VARCHAR NOT NULL DEFAULT 'unpaid'",
        "ALTER TABLE leagues ADD COLUMN IF NOT EXISTS pro_status VARCHAR NOT NULL DEFAULT 'free'",
        "ALTER TABLE leagues ADD COLUMN IF NOT EXISTS pro_purchased_at TIMESTAMPTZ",
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

    try:
        await _backfill_pro_leagues()
    except Exception as exc:
        log.error("Pro backfill failed: %s", exc)

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

# Cipher — a customisable, real-time word-association party game served from
# /play. Fully self-contained (in-memory rooms + WebSockets); see codenames/.
from codenames import router as cipher_router  # noqa: E402
from charades import router as charades_router  # noqa: E402
from dial import router as dial_router  # noqa: E402
from imposter import router as imposter_router  # noqa: E402
from whoami import router as whoami_router  # noqa: E402

# Qualification tracker — a Wheesht extension served from /qualification. Reuses
# the existing fixture data layer (sync.fixture_cache); see qualification/.
from qualification.router import router as qualification_router  # noqa: E402

app.include_router(cipher_router)
app.include_router(dial_router)
app.include_router(imposter_router)
app.include_router(charades_router)
app.include_router(whoami_router)
app.include_router(qualification_router)

_GAMES_TEMPLATE = Path("templates/games.html")


@app.get("/games", response_class=HTMLResponse)
async def games_page():
    if not _GAMES_TEMPLATE.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return HTMLResponse(content=_GAMES_TEMPLATE.read_text(encoding="utf-8"))


# Content Security Policy. Tuned to exactly what the app loads: React/Babel from
# unpkg, Google Identity, and Google Fonts. 'unsafe-eval' is required because
# Babel compiles the JSX in the browser, and 'unsafe-inline' because the page
# ships inline styles and bootstrap scripts. Tightening these would need a build
# step (item 8+), so this is the safe maximum for the current no-bundler setup.
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://accounts.google.com https://www.gstatic.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https://accounts.google.com https://www.googleapis.com; "
    "frame-src https://accounts.google.com; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; "
    "object-src 'none'; manifest-src 'self'; worker-src 'self'"
)


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Content-Security-Policy", _CSP)
    return response


# ── Pages + global state ──────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(content=_build_html())


@app.get("/welcome", response_class=HTMLResponse)
async def welcome_page():
    path = Path("templates/welcome.html")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return HTMLResponse(content=path.read_text(encoding="utf-8"))


def _public_base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _og_image_url(request: Request) -> str:
    return f"{_public_base(request)}{_OG_IMAGE_PATH}"


def _utm_suffix(request: Request) -> str:
    parts: List[str] = []
    for key in ("utm_source", "utm_medium", "utm_campaign", "utm_content"):
        val = (request.query_params.get(key) or "").strip()[:80]
        if val:
            parts.append(f"{key}={quote(val)}")
    return ("&" + "&".join(parts)) if parts else ""


def _utm_from_request(request: Request) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for key in ("utm_source", "utm_campaign"):
        val = (request.query_params.get(key) or "").strip()[:80]
        if val:
            out[key] = val
    return out


async def _record_funnel_event(
    session,
    *,
    event: str,
    session_id: str,
    league_id: Optional[str] = None,
    utm_source: Optional[str] = None,
    utm_campaign: Optional[str] = None,
    detail: str = "",
) -> None:
    if event not in _FUNNEL_EVENTS:
        return
    sid = (session_id or "").strip()[:64] or "anon"
    session.add(FunnelEvent(
        id=uuid.uuid4().hex,
        league_id=league_id,
        session_id=sid,
        event=event,
        utm_source=(utm_source or "")[:80] or None,
        utm_campaign=(utm_campaign or "")[:80] or None,
        ts=int(time.time() * 1000),
        detail=(detail or "")[:200],
    ))


async def _funnel_counts(session, league_id: str) -> Dict[str, int]:
    res = await session.execute(
        select(FunnelEvent.event, func.count())
        .where(FunnelEvent.league_id == league_id)
        .group_by(FunnelEvent.event)
    )
    return {row[0]: int(row[1]) for row in res.all()}


def _stripe_ready() -> bool:
    return bool(_STRIPE_SECRET_KEY)


def _stripe_client():
    if not _stripe_ready():
        raise HTTPException(status_code=503, detail="Payments are not configured on this server")
    import stripe
    stripe.api_key = _STRIPE_SECRET_KEY
    return stripe


def _league_is_grandfathered(league: League) -> bool:
    return bool(league.seeded and league.code.upper() == _CONFIG_LEAGUE_CODE.upper())


def _league_has_pro(league: League) -> bool:
    if _league_is_grandfathered(league):
        return True
    return (league.pro_status or "free") == "pro"


def _require_pro(league: League) -> None:
    if _league_has_pro(league):
        return
    raise HTTPException(status_code=402, detail="pro_required")


def _pro_meta(league: League) -> Dict[str, Any]:
    has_pro = _league_has_pro(league)
    grandfathered = _league_is_grandfathered(league)
    return {
        "proStatus": "pro" if has_pro else "free",
        "hasPro": has_pro,
        "proGrandfathered": grandfathered,
        "proUpgradeAvailable": bool(
            _stripe_ready() and _pro_checkout_configured() and not has_pro and not grandfathered
        ),
    }


def _pro_checkout_configured() -> bool:
    return bool(_STRIPE_PRO_PRICE_ID or _STRIPE_PRO_AMOUNT_PENCE > 0)


def _pro_line_items(league: League) -> List[Dict[str, Any]]:
    if _STRIPE_PRO_PRICE_ID:
        return [{"price": _STRIPE_PRO_PRICE_ID, "quantity": 1}]
    return [{
        "price_data": {
            "currency": "gbp",
            "unit_amount": _STRIPE_PRO_AMOUNT_PENCE,
            "product_data": {"name": f"Wheesht Pro — {league.name}"},
        },
        "quantity": 1,
    }]


async def _backfill_pro_leagues() -> None:
    """Grandfather leagues that already use Pro features before the paywall shipped."""
    async with AsyncSessionLocal() as session:
        leagues = list((await session.execute(select(League))).scalars().all())
        changed = False
        for league in leagues:
            if _league_is_grandfathered(league) or (league.pro_status or "free") == "pro":
                continue
            rows = await _participant_rows(session, league)
            has_picks = any(bool(r.picks) for r in rows)
            admin = await _get_admin_data(session, league)
            meta = admin.get("meta") or {}
            if has_picks or bool(admin.get("predictions")) or bool(meta.get("customFields")):
                league.pro_status = "pro"
                league.pro_purchased_at = league.pro_purchased_at or _now()
                changed = True
        if changed:
            await session.commit()
            log.info("Backfilled pro_status for leagues with existing prediction activity")


def _entry_fee_pence(admin: Dict[str, Any]) -> int:
    fee = _wc_data["fee"]
    try:
        if (admin.get("meta") or {}).get("entryFee") is not None:
            fee = max(0.0, float((admin.get("meta") or {}).get("entryFee")))
    except (TypeError, ValueError):
        fee = _wc_data["fee"]
    return max(0, int(round(float(fee) * 100)))


def _fill_join_template(
    *,
    title: str,
    description: str,
    heading: str,
    code: str,
    canonical: str,
    og_image: str,
    app_url: str,
) -> str:
    return (
        _JOIN_TEMPLATE.replace("{{TITLE}}", html.escape(title))
        .replace("{{DESCRIPTION}}", html.escape(description))
        .replace("{{HEADING}}", html.escape(heading))
        .replace("{{CODE}}", html.escape(code))
        .replace("{{CANONICAL}}", html.escape(canonical))
        .replace("{{OG_IMAGE}}", html.escape(og_image))
        .replace("{{APP_URL}}", html.escape(app_url))
    )


def _join_not_found_html(request: Request, code: str) -> str:
    base = _public_base(request)
    title = "League not found — Wheesht"
    description = "That invite link doesn't match a league on Wheesht. Ask your organiser for a fresh link."
    return _fill_join_template(
        title=title,
        description=description,
        heading="League not found",
        code=code,
        canonical=f"{base}/join/{code}",
        og_image=_og_image_url(request),
        app_url=f"{base}/",
    )


@app.get("/join/{code}", response_class=HTMLResponse)
async def join_preview_page(code: str, request: Request):
    """Public invite landing with OG tags for link previews (no secrets)."""
    code = (code or "").strip().upper()
    if not code or len(code) > 12:
        raise HTTPException(status_code=404, detail="league not found")
    base = _public_base(request)
    og = _og_image_url(request)
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code)
        if league is None:
            return HTMLResponse(content=_join_not_found_html(request, code), status_code=404)
        league_name = league.name or "a Wheesht league"
        await _record_funnel_event(
            session,
            event="invite_view",
            session_id=request.headers.get("x-wheesht-session") or "invite",
            league_id=league.id,
            utm_source=_utm_from_request(request).get("utm_source"),
            utm_campaign=_utm_from_request(request).get("utm_campaign"),
        )
        await session.commit()
    title = f"Join {league_name} on Wheesht"
    description = (
        f"You're invited to {league_name} — World Cup sweepstake, predictions, and gentle chaos."
    )
    html_body = _fill_join_template(
        title=title,
        description=description,
        heading=league_name,
        code=code,
        canonical=f"{base}/join/{code}",
        og_image=og,
        app_url=f"{base}/?join={code}{_utm_suffix(request)}",
    )
    return HTMLResponse(content=html_body)


@app.get("/api/leagues/{code}/preview")
async def league_public_preview(code: str):
    """Public league teaser for join funnel — name and entrant count only."""
    code = (code or "").strip().upper()
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code)
        if league is None:
            raise HTTPException(status_code=404, detail="No league with that code")
        rows = await _participant_rows(session, league)
        profile_map = await _profiles_for(session, league)
        people = _league_people(league, rows, profile_map)
        return {"name": league.name, "entrantCount": len(people)}


@app.get("/robots.txt", response_class=PlainTextResponse)
async def robots_txt():
    return PlainTextResponse(
        "User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: /sitemap.xml\n",
        media_type="text/plain",
    )


@app.get("/sitemap.xml", response_class=Response)
async def sitemap_xml(request: Request):
    base = _public_base(request)
    demo_code = (_CONFIG_LEAGUE_CODE or "OI").upper()
    urls = ["/", "/welcome", f"/join/{demo_code}"]
    body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for path in urls:
        body += f"  <url><loc>{html.escape(base + path)}</loc></url>\n"
    body += "</urlset>\n"
    return Response(content=body, media_type="application/xml")


class FunnelEventPayload(BaseModel):
    event: str
    sessionId: str = ""
    leagueCode: Optional[str] = None
    utmSource: Optional[str] = None
    utmCampaign: Optional[str] = None
    detail: str = ""


@app.post("/api/events")
async def record_funnel_event(payload: FunnelEventPayload, request: Request):
    """Anonymous growth funnel telemetry — no PII."""
    event = (payload.event or "").strip()
    if event not in _FUNNEL_EVENTS:
        raise HTTPException(status_code=400, detail="Unknown event")
    _rate_limit(request, "funnel:" + _client_key(request), 120, 10 * 60)
    league_id: Optional[str] = None
    code = (payload.leagueCode or "").strip().upper()
    async with AsyncSessionLocal() as session:
        if code:
            league = await _get_league_by_code(session, code)
            if league:
                league_id = league.id
        await _record_funnel_event(
            session,
            event=event,
            session_id=(payload.sessionId or request.headers.get("x-wheesht-session") or "anon"),
            league_id=league_id,
            utm_source=(payload.utmSource or "")[:80] or None,
            utm_campaign=(payload.utmCampaign or "")[:80] or None,
            detail=(payload.detail or "")[:200],
        )
        await session.commit()
    return {"ok": True}


@app.get("/api/state")
async def get_state():
    """League-agnostic baseline (shared fixtures + tournament scaffolding)."""
    return _base_state()


# ── League lifecycle ──────────────────────────────────────────────────────────

class LeagueCreate(BaseModel):
    name: str
    code: str
    password: str
    organiserCode: Optional[str] = None
    purpose: str = "work"
    includeDepartment: bool = True
    includeLocation: bool = True
    includeLtMember: bool = True
    locations: List[str] = Field(default_factory=list)
    locationsFreeText: bool = False
    entryFee: float = 5
    currency: str = "£"
    charitySplit: float = 0.5
    customFields: List[Dict[str, Any]] = Field(default_factory=list)


class LeagueJoin(BaseModel):
    code: str
    password: str


class AdminAuthPayload(BaseModel):
    code: str
    # The device's active participant id, so the issued token can be bound to it.
    participantId: Optional[str] = None


def _clean_custom_fields(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()
    for raw in items or []:
        label = str((raw or {}).get("label") or "").strip()[:40]
        if not label:
            continue
        kind = str((raw or {}).get("type") or "text").strip()
        if kind not in {"text", "select", "suggest", "tags"}:
            kind = "text"
        options = [
            str(x).strip()[:40]
            for x in ((raw or {}).get("options") or [])
            if str(x).strip()
        ][:20]
        if kind in {"select", "suggest", "tags"} and not options:
            kind = "text"
        raw_key = str((raw or {}).get("key") or "").strip().lower()
        raw_key = re.sub(r"[^a-z0-9_]+", "_", raw_key).strip("_")[:32]
        key = raw_key or re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:32] or f"field_{len(out) + 1}"
        base = key
        n = 2
        while key in seen:
            suffix = f"_{n}"
            key = f"{base[:max(1, 32 - len(suffix))]}{suffix}"
            n += 1
        seen.add(key)
        item: Dict[str, Any] = {
            "key": key,
            "label": label,
            "type": kind,
            "required": bool((raw or {}).get("required")),
        }
        if options:
            item["options"] = options
        out.append(item)
        if len(out) >= 6:
            break
    return out


def _clean_custom_answers(values: Dict[str, Any], fields: List[Dict[str, Any]]) -> Dict[str, Any]:
    values = values or {}
    out: Dict[str, Any] = {}
    for f in fields or []:
        key = str(f.get("key") or "")
        if not key:
            continue
        if f.get("type") == "tags":
            raw = values.get(key) or []
            if isinstance(raw, str):
                raw_values = [x.strip() for x in raw.split(",")]
            elif isinstance(raw, list):
                raw_values = raw
            else:
                raw_values = []
            allowed = [str(x) for x in (f.get("options") or [])]
            tags: List[str] = []
            for item in raw_values:
                tag = str(item or "").strip()[:40]
                if tag and tag in allowed and tag not in tags:
                    tags.append(tag)
            if tags:
                out[key] = tags[:20]
            continue
        val = str(values.get(key) or "").strip()[:80]
        if f.get("type") == "select":
            allowed = [str(x) for x in (f.get("options") or [])]
            if val and val not in allowed:
                val = ""
        if val:
            out[key] = val
    return out


@app.post("/api/leagues")
async def create_league(payload: LeagueCreate, request: Request):
    _rate_limit(request, "league:create", 20, 10 * 60)
    code = (payload.code or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{2,12}", code):
        raise HTTPException(status_code=400, detail="Code must be 2–12 letters or numbers")
    name = (payload.name or "").strip()[:60] or "Sweepstake"
    if len(payload.password or "") < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    organiser_code = (payload.organiserCode or payload.password or "").strip()
    if len(organiser_code) < 4:
        raise HTTPException(status_code=400, detail="Organiser code must be at least 4 characters")
    if payload.organiserCode is not None and hmac.compare_digest(organiser_code, payload.password or ""):
        raise HTTPException(status_code=400, detail="Use a different organiser code from the member password")
    purpose = "friends" if payload.purpose == "friends" else "work"
    try:
        entry_fee = max(0.0, round(float(payload.entryFee), 2))
    except (TypeError, ValueError):
        entry_fee = 5.0
    currency = str(payload.currency or "£").strip()[:4] or "£"
    try:
        charity_split = max(0.0, min(1.0, float(payload.charitySplit)))
    except (TypeError, ValueError):
        charity_split = 0.5
    meta = {
        "purpose": purpose,
        "includeDepartment": bool(payload.includeDepartment) if purpose == "work" else False,
        "includeLocation": bool(payload.includeLocation) if purpose == "work" else False,
        "includeLtMember": bool(payload.includeLtMember) if purpose == "work" else False,
        "locations": [str(x).strip()[:40] for x in (payload.locations or []) if str(x).strip()][:12],
        "locationsFreeText": bool(payload.locationsFreeText),
        "entryFee": entry_fee,
        "currency": currency,
        "charitySplit": charity_split,
        "customFields": [],
    }
    if not meta["locations"]:
        meta["locations"] = ["Edinburgh", "London"]

    async with AsyncSessionLocal() as session:
        if await _get_league_by_code(session, code) is not None:
            raise HTTPException(status_code=409, detail="That code is already taken")
        league = League(
            id=uuid.uuid4().hex, code=code, slug=_slugify(name), name=name,
            password_hash=_hash_password(payload.password),
            organiser_hash=_hash_password(organiser_code),
            seeded=False, created_at=_now(),
        )
        try:
            session.add(league)
            # Flush only the league row first. If this fails, it is the unique
            # league-code race and the duplicate-code message is accurate.
            await session.flush()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(status_code=409, detail="That code is already taken")

        initial_admin = _audit_event(
            {"teams": {}, "fixtures": {}, "predictions": {}, "meta": meta},
            "league_created",
            "organiser",
            "League created",
        )
        session.add(AdminOverride(league_id=league.id, data=initial_admin, updated_at=_now()))
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            log.exception("Could not initialise admin overrides for new league %s", code)
            raise HTTPException(status_code=500, detail="Could not initialise league settings. Try again.")
        return {"league": _league_public(league), "adminToken": _admin_token_for(league)}


@app.post("/api/leagues/join")
async def join_league(payload: LeagueJoin, request: Request):
    _rate_limit(request, "league:join:" + (payload.code or "").strip().upper(), 20, 10 * 60)
    code = (payload.code or "").strip().upper()
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code)
        if league is None:
            raise HTTPException(status_code=404, detail="No league with that code")
        if not _verify_password(payload.password or "", league.password_hash):
            raise HTTPException(status_code=401, detail="Wrong password")
        return {"league": _league_public(league)}


@app.post("/api/leagues/{code}/admin/auth")
async def admin_auth(code: str, payload: AdminAuthPayload, request: Request):
    _rate_limit(request, "admin:auth:" + code.upper(), 10, 10 * 60)
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        if not _admin_code_ok(league, payload.code or ""):
            _log_audit(session, league.id, "admin_auth_failed", "unknown", detail="Wrong organiser code")
            await session.commit()
            raise HTTPException(status_code=403, detail="Wrong organiser code")
        # Bind the token to the device's active entry when it is a real member of
        # this league; otherwise fall back to an unbound token.
        pid = (payload.participantId or "").strip()
        if pid and not await _participant_in_league(session, league, pid):
            pid = ""
        _log_audit(session, league.id, "admin_auth", "organiser", actor_id=(pid or None), detail="Organiser signed in")
        await session.commit()
        return {"ok": True, "token": _admin_token_for(league, pid or None)}


@app.get("/api/leagues/{code}/audit")
async def league_audit(
    code: str,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Durable organiser audit trail for the Security tab. Organiser-only; the
    newest 200 events, newest first."""
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _require_admin(session, league, x_wheesht_admin_token)
        res = await session.execute(
            select(AuditEvent).where(AuditEvent.league_id == league.id)
            .order_by(AuditEvent.ts.desc()).limit(200)
        )
        events = [
            {
                "ts": e.ts,
                "action": e.action,
                "actor": e.actor,
                "actorId": e.actor_id,
                "detail": e.detail,
            }
            for e in res.scalars().all()
        ]
    return {"events": events}


class OrganiserDeleteLeaguePayload(BaseModel):
    confirmCode: str
    confirmName: str


@app.delete("/api/leagues/{code}")
async def delete_league(
    code: str,
    payload: OrganiserDeleteLeaguePayload,
    request: Request,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Organiser-initiated permanent deletion of their own league.

    Requires the organiser token plus exact code + name confirmation (the same
    shape as the dev delete). The seeded flagship league is intentionally not
    deletable here — that stays a dev-only operation so a routine organiser
    action can never wipe the main sweepstake."""
    _rate_limit(request, "league:delete:" + code.upper(), 6, 10 * 60)
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _require_admin(session, league, x_wheesht_admin_token)
        if league.seeded and league.code == _CONFIG_LEAGUE_CODE:
            raise HTTPException(status_code=400, detail="This league can't be deleted from here.")
        if (payload.confirmCode or "").strip().upper() != league.code:
            raise HTTPException(status_code=400, detail="Type the league code exactly to delete it")
        if (payload.confirmName or "").strip() != league.name:
            raise HTTPException(status_code=400, detail="Type the league name exactly to delete it")

        # The league's own audit rows go with it, so record the deletion in the
        # durable application log rather than the table we're about to wipe.
        log.warning("Organiser deleted league %s (%s)", league.code, league.name)
        await session.execute(delete(ChatMessage).where(ChatMessage.league_id == league.id))
        await session.execute(delete(ProfileAsset).where(ProfileAsset.league_id == league.id))
        await session.execute(delete(Profile).where(Profile.league_id == league.id))
        await session.execute(delete(Participant).where(Participant.league_id == league.id))
        await session.execute(delete(AdminOverride).where(AdminOverride.league_id == league.id))
        await session.execute(delete(AuditEvent).where(AuditEvent.league_id == league.id))
        await session.delete(league)
        await session.commit()
        return {"ok": True, "deleted": {"code": league.code, "name": league.name}}


@app.get("/api/leagues/{code}/export")
async def export_league(
    code: str,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Organiser backup of a whole league as a JSON bundle. Organiser-only, and
    deliberately free of secrets: no password or organiser hashes, and Google
    identities are reduced to a boolean. Pair with docs/SECURITY.md."""
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _require_admin(session, league, x_wheesht_admin_token)

        rows = await _participant_rows(session, league)
        profile_map = await _profiles_for(session, league)
        people = _league_people(league, rows, profile_map)  # merged view, no hashes

        # Identity layer, with raw Google ids redacted to a boolean.
        profiles_out = [
            {
                "participantId": p.participant_id,
                "displayName": p.display_name or "",
                "favouriteTeam": p.favourite_team or "",
                "avatarVersion": p.avatar_version or 0,
                "avatarSource": p.avatar_source or "",
                "hasGoogleLink": bool(p.google_id),
            }
            for p in profile_map.values()
        ]

        chat_res = await session.execute(
            select(ChatMessage).where(ChatMessage.league_id == league.id)
            .order_by(ChatMessage.ts.asc())
        )
        chat = [_chat_to_dict(m) for m in chat_res.scalars().all()]

        admin = await _get_admin_data(session, league)

        audit_res = await session.execute(
            select(AuditEvent).where(AuditEvent.league_id == league.id)
            .order_by(AuditEvent.ts.asc())
        )
        audit = [
            {"ts": e.ts, "action": e.action, "actor": e.actor, "actorId": e.actor_id, "detail": e.detail}
            for e in audit_res.scalars().all()
        ]

        return {
            "exportedAt": _now().isoformat(),
            "league": {
                "code": league.code,
                "name": league.name,
                "seeded": league.seeded,
                "createdAt": league.created_at.isoformat() if league.created_at else None,
            },
            "participants": people,
            "profiles": profiles_out,
            "chat": chat,
            "adminOverrides": admin,
            "audit": audit,
        }


def _csv_response(filename: str, rows: List[List[str]]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/leagues/{code}/export/entrants.csv")
async def export_entrants_csv(
    code: str,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _require_admin(session, league, x_wheesht_admin_token)
        _require_pro(league)
        rows = await _participant_rows(session, league)
        profile_map = await _profiles_for(session, league)
        people = _league_people(league, rows, profile_map)
        admin = await _get_admin_data(session, league)
        tag_fields = [
            f for f in (admin.get("meta") or {}).get("customFields") or []
            if isinstance(f, dict) and f.get("type") == "tags"
        ]
        header = ["name", "team", "department", "location", "has_password"]
        for f in tag_fields:
            header.append(f.get("label") or f.get("key") or "tags")
        out = [header]
        for p in people:
            row = [
                p.get("name") or "",
                p.get("team") or "",
                p.get("department") or "",
                p.get("location") or p.get("city") or "",
                "yes" if p.get("hasPassword") else "no",
            ]
            cf = p.get("customFields") or {}
            for f in tag_fields:
                key = f.get("key") or ""
                val = cf.get(key)
                row.append(", ".join(val) if isinstance(val, list) else str(val or ""))
            out.append(row)
        return _csv_response(f"wheesht-{league.code.lower()}-entrants.csv", out)


@app.get("/api/leagues/{code}/export/predictions.csv")
async def export_predictions_csv(
    code: str,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _require_admin(session, league, x_wheesht_admin_token)
        _require_pro(league)
        rows = await _participant_rows(session, league)
        profile_map = await _profiles_for(session, league)
        people = _league_people(league, rows, profile_map)
        admin = await _get_admin_data(session, league)
        hidden = set((admin.get("meta") or {}).get("hiddenPredictions") or [])
        markets = _wc_data.get("predictions") or []
        dyn = [
            {"key": k, "q": k}
            for k in (admin.get("predictions") or {}).keys()
            if str(k).startswith("dm_")
        ]
        for m in markets:
            key = m.get("key") if isinstance(m, dict) else None
            if key and key not in hidden:
                dyn.append({"key": key, "q": m.get("q") or key})
        header = ["participant", "market", "pick"]
        out = [header]
        for p in people:
            picks = p.get("picks") or {}
            name = p.get("name") or p.get("id") or ""
            for m in dyn:
                key = m["key"]
                if key not in picks:
                    continue
                val = picks[key]
                if isinstance(val, list):
                    pick = ", ".join(str(x) for x in val)
                else:
                    pick = str(val)
                out.append([name, m.get("q") or key, pick])
        return _csv_response(f"wheesht-{league.code.lower()}-predictions.csv", out)


class LeagueDuplicate(BaseModel):
    name: str
    code: str
    password: str
    organiserCode: Optional[str] = None


@app.post("/api/leagues/{code}/duplicate")
async def duplicate_league(
    code: str,
    payload: LeagueDuplicate,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        source = await _get_league_by_code(session, code.upper())
        if source is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _require_admin(session, source, x_wheesht_admin_token)
        _require_pro(source)
        new_code = (payload.code or "").strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{2,12}", new_code):
            raise HTTPException(status_code=400, detail="Code must be 2–12 letters or numbers")
        if await _get_league_by_code(session, new_code) is not None:
            raise HTTPException(status_code=409, detail="That code is already taken")
        if len(payload.password or "") < 4:
            raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
        organiser_code = (payload.organiserCode or payload.password or "").strip()
        if len(organiser_code) < 4:
            raise HTTPException(status_code=400, detail="Organiser code must be at least 4 characters")
        name = (payload.name or "").strip()[:60] or "Sweepstake"
        src_admin = await _get_admin_data(session, source)
        meta = dict((src_admin.get("meta") or {}))
        meta.pop("audit", None)
        league = League(
            id=uuid.uuid4().hex, code=new_code, slug=_slugify(name), name=name,
            password_hash=_hash_password(payload.password),
            organiser_hash=_hash_password(organiser_code),
            seeded=False, created_at=_now(),
        )
        session.add(league)
        await session.flush()
        initial_admin = _audit_event(
            {"teams": {}, "fixtures": {}, "predictions": {}, "meta": meta},
            "league_created",
            "organiser",
            f"Duplicated from {source.code}",
        )
        session.add(AdminOverride(league_id=league.id, data=initial_admin, updated_at=_now()))
        _log_audit(session, source.id, "league_duplicated", "organiser", detail=f"New league {new_code}")
        await session.commit()
        return {"league": _league_public(league), "adminToken": _admin_token_for(league)}


@app.get("/api/leagues/{code}/analytics")
async def league_analytics(
    code: str,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _require_admin(session, league, x_wheesht_admin_token)
        _require_pro(league)
        rows = await _participant_rows(session, league)
        profile_map = await _profiles_for(session, league)
        people = _league_people(league, rows, profile_map)
        admin = await _get_admin_data(session, league)
        hidden = set((admin.get("meta") or {}).get("hiddenPredictions") or [])
        markets = [
            m for m in (_wc_data.get("predictions") or [])
            if isinstance(m, dict) and m.get("key") and m["key"] not in hidden
        ]
        for k in (admin.get("predictions") or {}):
            if str(k).startswith("dm_") and k not in hidden:
                markets.append({"key": k, "q": k})
        pred_stats = []
        total = len(people) or 1
        for m in markets:
            key = m.get("key")
            filled = sum(1 for p in people if (p.get("picks") or {}).get(key) not in (None, "", []))
            pred_stats.append({
                "key": key,
                "label": m.get("q") or key,
                "completionPct": round(100 * filled / total),
                "filled": filled,
                "total": len(people),
            })
        week_ago = int((time.time() - 7 * 86400) * 1000)
        chat_total = await session.scalar(
            select(func.count()).select_from(ChatMessage).where(ChatMessage.league_id == league.id)
        ) or 0
        chat_week = await session.scalar(
            select(func.count()).select_from(ChatMessage).where(
                ChatMessage.league_id == league.id,
                ChatMessage.ts >= week_ago,
            )
        ) or 0
        audit_res = await session.execute(
            select(AuditEvent).where(AuditEvent.league_id == league.id)
            .order_by(AuditEvent.ts.desc()).limit(5)
        )
        recent = [
            {"ts": e.ts, "action": e.action, "actor": e.actor, "detail": e.detail}
            for e in audit_res.scalars().all()
        ]
        funnel = await _funnel_counts(session, league.id)
        return {
            "entrants": {
                "total": len(people),
                "withPassword": sum(1 for p in people if p.get("hasPassword")),
                "withTeam": sum(1 for p in people if p.get("team")),
            },
            "funnel": funnel,
            "predictions": pred_stats,
            "chat": {"total": int(chat_total), "last7d": int(chat_week)},
            "recentActivity": recent,
            **_pro_meta(league),
            "stripeConfigured": _stripe_ready(),
        }


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
    picks: Dict[str, Any] = Field(default_factory=dict)
    customFields: Dict[str, Any] = Field(default_factory=dict)
    predScore: int = 0
    joinedAt: Optional[int] = None


def _apply_payload(
    row: Participant,
    p: ParticipantPayload,
    league: League,
    custom_field_defs: Optional[List[Dict[str, Any]]] = None,
) -> None:
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
    row.custom_fields = _clean_custom_answers(p.customFields or {}, custom_field_defs or [])
    row.pred_score = int(p.predScore or 0)
    row.joined_at = int(p.joinedAt or 0)
    row.removed = False


async def _upsert_participant(
    session,
    league: League,
    payload: ParticipantPayload,
    *,
    allow_admin_team: bool = False,
) -> Participant:
    row = await session.get(Participant, payload.id)
    if row is not None and row.league_id != league.id:
        raise HTTPException(status_code=409, detail="id belongs to another league")
    creating = row is None
    if creating:
        # Build the row but do NOT add it to the session yet: _get_admin_data()
        # below issues a query that would autoflush this still-empty row (name is
        # NOT NULL) before _apply_payload() populates it. We add it once it's
        # fully formed, just before the organiser-count query needs to see it.
        row = Participant(id=payload.id, league_id=league.id)
    admin = await _get_admin_data(session, league)
    if payload.picks and dict(payload.picks) != dict(row.picks or {}):
        _require_pro(league)
    meta = admin.get("meta") or {}
    _apply_payload(row, payload, league, _clean_custom_fields(list(meta.get("customFields") or [])))
    if creating:
        session.add(row)
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
        return {
            "ok": True,
            "participant": _participant_to_dict(row, league.code),
            "sessionToken": _session_token_for(league, row.id),
        }


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
        is_admin_edit = bool(x_wheesht_admin_token and _admin_token_ok(league, x_wheesht_admin_token))
        payload.id = participant_id
        row = await _upsert_participant(session, league, payload, allow_admin_team=is_admin_edit)
        if is_admin_edit:
            _log_audit(session, league.id, "participant_edited", "organiser", detail=(row.name or participant_id))
            await session.commit()
        return {
            "ok": True,
            "participant": _participant_to_dict(row, league.code),
            "sessionToken": _session_token_for(league, row.id),
        }


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
        await _require_admin(session, league, x_wheesht_admin_token)
        row = await session.get(Participant, participant_id)
        is_seeded_base = (
            league.seeded and league.code == _CONFIG_LEAGUE_CODE
            and any(rp["id"] == participant_id for rp in _ROSTER)
        )
        if row is not None and row.league_id == league.id:
            removed_name = (row.name or "").strip() or participant_id
            if is_seeded_base:
                row.removed = True  # tombstone, keep the row
            else:
                await session.delete(row)
            # Clear the entry's identity rows too, otherwise a dangling Profile keeps
            # its google_id (blocking re-link) and its avatar stays publicly fetchable.
            await session.execute(
                delete(ProfileAsset).where(
                    ProfileAsset.league_id == league.id,
                    ProfileAsset.participant_id == participant_id,
                )
            )
            await session.execute(
                delete(Profile).where(
                    Profile.league_id == league.id,
                    Profile.participant_id == participant_id,
                )
            )
            _log_audit(session, league.id, "participant_removed", "organiser", detail=removed_name)
            await session.commit()
            return {"ok": True}
        if is_seeded_base:
            # No DB row yet — insert a tombstone to hide the config entry.
            session.add(Participant(
                id=participant_id, league_id=league.id, name="", removed=True,
            ))
            _log_audit(session, league.id, "participant_removed", "organiser", detail=participant_id)
            await session.commit()
            return {"ok": True}
        raise HTTPException(status_code=404, detail="participant not found")


class ProCheckoutPayload(BaseModel):
    successPath: str = "/"
    cancelPath: str = "/"


async def _complete_pro_purchase(
    session,
    *,
    league_id: str,
    amount_pence: int,
    currency: str,
    checkout_session_id: str,
    payment_intent_id: Optional[str] = None,
) -> None:
    league = await session.get(League, league_id)
    if league is None:
        return
    existing = await session.scalar(
        select(LeaguePurchase).where(LeaguePurchase.stripe_checkout_session_id == checkout_session_id)
    )
    if existing and existing.status == "paid" and (league.pro_status or "free") == "pro":
        return
    if existing:
        purchase = existing
    else:
        purchase = LeaguePurchase(
            id=uuid.uuid4().hex,
            league_id=league_id,
            product="pro",
            amount_pence=amount_pence,
            currency=currency,
            status="paid",
            stripe_checkout_session_id=checkout_session_id,
            stripe_payment_intent_id=payment_intent_id,
            created_at=_now(),
            paid_at=_now(),
        )
        session.add(purchase)
    purchase.status = "paid"
    purchase.paid_at = _now()
    if payment_intent_id:
        purchase.stripe_payment_intent_id = payment_intent_id
    league.pro_status = "pro"
    league.pro_purchased_at = _now()
    _log_audit(session, league_id, "pro_purchased", "organiser", detail=str(amount_pence))


@app.post("/api/leagues/{code}/pro/checkout")
async def create_pro_checkout(
    code: str,
    payload: ProCheckoutPayload,
    request: Request,
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    if not _pro_checkout_configured():
        raise HTTPException(status_code=503, detail="Pro checkout is not configured on this server")
    stripe = _stripe_client()
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        await _require_admin(session, league, x_wheesht_admin_token)
        if _league_has_pro(league):
            return {"ok": True, "alreadyPro": True}
        base = _public_base(request)
        success = (payload.successPath or "/").strip() or "/"
        cancel = (payload.cancelPath or "/").strip() or "/"
        if not success.startswith("/"):
            success = "/" + success
        if not cancel.startswith("/"):
            cancel = "/" + cancel
        checkout = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=_pro_line_items(league),
            success_url=f"{base}{success}?pro=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}{cancel}?pro=cancelled",
            metadata={
                "purchase_type": "pro",
                "league_id": league.id,
                "league_code": league.code,
            },
        )
        session.add(LeaguePurchase(
            id=uuid.uuid4().hex,
            league_id=league.id,
            product="pro",
            amount_pence=_STRIPE_PRO_AMOUNT_PENCE or 0,
            currency="gbp",
            status="pending",
            stripe_checkout_session_id=checkout.id,
            created_at=_now(),
        ))
        await session.commit()
        return {"ok": True, "url": checkout.url, "sessionId": checkout.id}


@app.post("/api/leagues/{code}/pro/grant")
async def grant_pro_league(
    code: str,
    x_wheesht_dev_key: Optional[str] = Header(None, alias="X-Wheesht-Dev-Key"),
):
    if not _dev_key_ok(x_wheesht_dev_key or ""):
        raise HTTPException(status_code=403, detail="forbidden")
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        league.pro_status = "pro"
        league.pro_purchased_at = _now()
        _log_audit(session, league.id, "pro_granted", "dev", detail="Dev grant")
        await session.commit()
        return {"ok": True, "proStatus": "pro"}


@app.post("/api/leagues/{code}/pro/revoke")
async def revoke_pro_league(
    code: str,
    x_wheesht_dev_key: Optional[str] = Header(None, alias="X-Wheesht-Dev-Key"),
):
    if not _dev_key_ok(x_wheesht_dev_key or ""):
        raise HTTPException(status_code=403, detail="forbidden")
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        league.pro_status = "free"
        league.pro_purchased_at = None
        _log_audit(session, league.id, "pro_revoked", "dev", detail="Dev revoke")
        await session.commit()
        return {"ok": True, "proStatus": "free"}


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    if not _STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    stripe = _stripe_client()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, _STRIPE_WEBHOOK_SECRET)
    except Exception as exc:
        log.warning("Stripe webhook verify failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature") from exc

    if event["type"] == "checkout.session.completed":
        sess = event["data"]["object"]
        meta = sess.get("metadata") or {}
        # checkout.session.completed also fires for unpaid/delayed-payment sessions;
        # only grant Pro once Stripe confirms the money was actually captured.
        if sess.get("payment_status") != "paid":
            return {"received": True}
        if meta.get("purchase_type") == "pro" and meta.get("league_id"):
            amount = int(sess.get("amount_total") or 0)
            currency = str(sess.get("currency") or "gbp")
            async with AsyncSessionLocal() as session:
                await _complete_pro_purchase(
                    session,
                    league_id=str(meta.get("league_id")),
                    amount_pence=amount,
                    currency=currency,
                    checkout_session_id=str(sess.get("id") or ""),
                    payment_intent_id=str(sess.get("payment_intent") or "") or None,
                )
                await session.commit()
    elif event["type"] == "charge.refunded":
        charge = event["data"]["object"]
        pi = str(charge.get("payment_intent") or "")
        if pi:
            async with AsyncSessionLocal() as session:
                purchase = await session.scalar(
                    select(LeaguePurchase).where(LeaguePurchase.stripe_payment_intent_id == pi)
                )
                if purchase:
                    purchase.status = "refunded"
                    league = await session.get(League, purchase.league_id)
                    if league and not _league_is_grandfathered(league):
                        league.pro_status = "free"
                        league.pro_purchased_at = None
                    _log_audit(session, purchase.league_id, "pro_refunded", "system")
                    await session.commit()
    return {"received": True}


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
        _require_pro(league)
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


@app.post("/api/leagues/{code}/participants/{participant_id}/session")
async def issue_session(
    code: str,
    participant_id: str,
    request: Request,
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    """Issue a session token proving this device controls `participant_id`.

    Open (unclaimed) entries follow the existing "tap who you are" trust model:
    whoever holds the device may take the entry, so a token is issued freely.
    Claimed entries (password or Google) must present a valid account or admin
    token first — exactly like any other protected write. The token is what the
    chat endpoint checks, so this is how a device earns the right to post."""
    _rate_limit(request, "session:" + code.upper() + ":" + participant_id, 30, 10 * 60)
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        if not await _participant_in_league(session, league, participant_id):
            raise HTTPException(status_code=404, detail="participant not found")
        # No-op for open entries; raises 403 for claimed entries without proof.
        await _guard_account_write(session, league, participant_id, x_wheesht_account_token, x_wheesht_admin_token)
        return {"ok": True, "token": _session_token_for(league, participant_id)}


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
async def account_auth(code: str, participant_id: str, payload: AccountAuthPayload, request: Request):
    """Sign in to a password-protected entry; returns a reusable account token."""
    _rate_limit(request, "account:auth:" + code.upper() + ":" + participant_id, 12, 10 * 60)
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        h = await _account_password_hash(session, league, participant_id)
        if not h:
            raise HTTPException(status_code=400, detail="This entry has no password set")
        if not _verify_password(payload.password or "", h):
            raise HTTPException(status_code=403, detail="Wrong password")
        return {
            "ok": True,
            "token": _account_token_for(league, participant_id),
            "sessionToken": _session_token_for(league, participant_id),
        }


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

        # An organiser acting on someone else's entry is a privileged reset and
        # is recorded in the audit trail (a member changing their own is not).
        by_admin = bool(x_wheesht_admin_token and _admin_token_ok(league, x_wheesht_admin_token))

        new = payload.newPassword
        if new:  # set / change
            if len(new) < _MIN_ACCOUNT_PASSWORD:
                raise HTTPException(status_code=400, detail=f"Password must be at least {_MIN_ACCOUNT_PASSWORD} characters")
            row = await _get_or_materialise(session, league, participant_id)
            if row is None:
                raise HTTPException(status_code=404, detail="participant not found")
            row.password_hash = _hash_password(new)
            if by_admin:
                _log_audit(session, league.id, "password_reset", "organiser", detail=(row.name or participant_id))
            await session.commit()
            return {
                "ok": True,
                "hasPassword": True,
                "token": _account_token_for(league, participant_id),
                "sessionToken": _session_token_for(league, participant_id),
            }

        # clear the lock
        row = await session.get(Participant, participant_id)
        if row is not None and row.league_id == league.id:
            row.password_hash = None
            if by_admin:
                _log_audit(session, league.id, "password_cleared", "organiser", detail=(row.name or participant_id))
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
            "sessionToken": _session_token_for(league, participant_id),
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
async def google_login(code: str, payload: GoogleLoginPayload, request: Request):
    """Cross-device login: find the participant in this league linked to the given
    Google account and return a fresh account token. No pre-existing auth needed —
    the Google token is the credential."""
    _rate_limit(request, "google:login:" + code.upper(), 30, 10 * 60)
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
            "sessionToken": _session_token_for(league, prof.participant_id),
        }


# ── Admin overrides (league-scoped) ───────────────────────────────────────────

class AdminPayload(BaseModel):
    teams: Dict[str, Any] = Field(default_factory=dict)
    fixtures: Dict[str, Any] = Field(default_factory=dict)
    predictions: Dict[str, Any] = Field(default_factory=dict)
    meta: Dict[str, Any] = Field(default_factory=dict)


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
        await _require_admin(session, league, x_wheesht_admin_token)
        incoming = payload.model_dump()
        row = await session.get(AdminOverride, league.id)
        existing = row.data if row and isinstance(row.data, dict) else {}
        existing_meta = existing.get("meta") or {}
        incoming_meta = dict(incoming.get("meta") or {})
        if not _league_has_pro(league):
            for key in _PRO_META_KEYS:
                if key == "predDeadline":
                    incoming_meta[key] = existing_meta.get(key)
                elif key == "customFields":
                    incoming_meta[key] = list(existing_meta.get("customFields") or [])
                else:
                    incoming_meta[key] = list(existing_meta.get(key) or [])
            incoming["meta"] = incoming_meta
            incoming["predictions"] = dict(existing.get("predictions") or {})
        else:
            incoming["meta"] = incoming_meta
        if row is None:
            session.add(AdminOverride(
                league_id=league.id,
                data=_audit_event(incoming, "admin_save", "organiser", "Organiser settings saved"),
                updated_at=_now(),
            ))
        else:
            # Older clients only know about teams/fixtures/predictions/meta.
            # Preserve server-owned top-level keys such as dynamicMarkets so a
            # routine settings save cannot wipe live match prediction markets.
            existing = row.data if isinstance(row.data, dict) else {}
            merged = dict(existing)
            for key in ("teams", "fixtures", "predictions", "meta"):
                merged[key] = incoming.get(key) or {}
            merged = _audit_event(merged, "admin_save", "organiser", "Organiser settings saved")
            row.data = merged
            row.updated_at = _now()
        _log_audit(session, league.id, "admin_save", "organiser", detail="Organiser settings saved")
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
async def post_chat(
    code: str,
    payload: ChatPayload,
    x_wheesht_session_token: Optional[str] = Header(None, alias="X-Wheesht-Session-Token"),
    x_wheesht_account_token: Optional[str] = Header(None, alias="X-Wheesht-Account-Token"),
    x_wheesht_admin_token: Optional[str] = Header(None, alias="X-Wheesht-Admin-Token"),
):
    text = payload.text.strip()[:280]
    if not text:
        raise HTTPException(status_code=400, detail="empty message")
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        # The poster must prove they control the entry they are posting as —
        # a stranger knowing an `author_id` can no longer impersonate them.
        if not _chat_author_ok(
            league, payload.author_id,
            x_wheesht_session_token, x_wheesht_account_token, x_wheesht_admin_token,
        ):
            raise HTTPException(status_code=403, detail="Sign in as yourself to post in the chat.")
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
        await _require_admin(session, league, x_wheesht_admin_token)
        msg = ChatMessage(
            id=uuid.uuid4().hex[:10], league_id=league.id,
            author_id="wheesht", author="Wheesht",
            initials="W", color="#1A1A1A",
            team=payload.mood,  # repurpose team field to carry the mood for rendering
            text=text, ts=int(time.time() * 1000),
        )
        session.add(msg)
        row = await session.get(AdminOverride, league.id)
        data = _audit_event(row.data if row and row.data else {}, "wheesht_message", "organiser", text)
        if row:
            row.data = data
            row.updated_at = _now()
        else:
            session.add(AdminOverride(league_id=league.id, data=data, updated_at=_now()))
        _log_audit(session, league.id, "wheesht_message", "organiser", detail=text)
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
        await _require_admin(session, league, x_wheesht_admin_token)
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
        data = _audit_event(data, "prediction_opened", "organiser", label)
        if row:
            row.data = data
            row.updated_at = _now()
        else:
            session.add(AdminOverride(league_id=league.id, data=data, updated_at=_now()))
        _log_audit(session, league.id, "prediction_opened", "organiser", detail=label)
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
        await _require_admin(session, league, x_wheesht_admin_token)
        row = await session.get(AdminOverride, league.id)
        if not row or not row.data:
            return {"ok": True}
        data = dict(row.data)
        dms = [
            m for m in (data.get("dynamicMarkets") or [])
            if isinstance(m, dict) and m.get("id") != market_id
        ]
        data["dynamicMarkets"] = dms
        # also remove any stored answer for this market
        preds = dict(data.get("predictions") or {})
        preds.pop(market_id, None)
        data["predictions"] = preds
        data = _audit_event(data, "prediction_removed", "organiser", market_id)
        row.data = data
        row.updated_at = _now()
        _log_audit(session, league.id, "prediction_removed", "organiser", detail=market_id)
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
        await _require_admin(session, league, x_wheesht_admin_token)
        row = await session.get(ChatMessage, message_id)
        if row is None or row.league_id != league.id:
            raise HTTPException(status_code=404, detail="message not found")
        audit_row = await session.get(AdminOverride, league.id)
        data = _audit_event(
            audit_row.data if audit_row and audit_row.data else {},
            "chat_deleted",
            "organiser",
            (row.author or "unknown") + ": " + (row.text or "")[:80],
        )
        if audit_row:
            audit_row.data = data
            audit_row.updated_at = _now()
        else:
            session.add(AdminOverride(league_id=league.id, data=data, updated_at=_now()))
        _log_audit(
            session, league.id, "chat_deleted", "organiser",
            detail=(row.author or "unknown") + ": " + (row.text or "")[:80],
        )
        await session.delete(row)
        await session.commit()
        return {"ok": True}


# ── Dev console (hidden cross-league admin) ───────────────────────────────────
# A master-keyed endpoint that lists every league so a developer can drop into
# any of them. The key is checked here (constant-time) and never leaves the
# server. Per-league admin/results endpoints are reused once a league is chosen.

class DevAuth(BaseModel):
    key: str


class DevDeleteLeaguePayload(BaseModel):
    key: str
    confirmCode: str
    confirmName: str


def _dev_key_ok(key: str) -> bool:
    if not _DEV_KEY:
        return False
    return hmac.compare_digest(key or "", _DEV_KEY)


@app.post("/api/dev/leagues")
async def dev_list_leagues(payload: DevAuth, request: Request):
    _rate_limit(request, "dev:list", 8, 10 * 60)
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


@app.delete("/api/dev/leagues/{code}")
async def dev_delete_league(code: str, payload: DevDeleteLeaguePayload, request: Request):
    _rate_limit(request, "dev:delete:" + code.upper(), 6, 10 * 60)
    if not _dev_key_ok(payload.key):
        raise HTTPException(status_code=403, detail="Developer access denied")
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="League not found")
        if (payload.confirmCode or "").strip().upper() != league.code:
            raise HTTPException(status_code=400, detail="Type the league code exactly to delete it")
        if (payload.confirmName or "").strip() != league.name:
            raise HTTPException(status_code=400, detail="Type the league name exactly to delete it")

        await session.execute(delete(ChatMessage).where(ChatMessage.league_id == league.id))
        await session.execute(delete(ProfileAsset).where(ProfileAsset.league_id == league.id))
        await session.execute(delete(Profile).where(Profile.league_id == league.id))
        await session.execute(delete(Participant).where(Participant.league_id == league.id))
        await session.execute(delete(AdminOverride).where(AdminOverride.league_id == league.id))
        await session.execute(delete(AuditEvent).where(AuditEvent.league_id == league.id))
        await session.delete(league)
        await session.commit()
        return {"ok": True, "deleted": {"code": league.code, "name": league.name}}


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


@app.get("/og/{filename:path}")
async def og_asset(filename: str):
    path = _safe_static_path(_STATIC / "og", filename)
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
