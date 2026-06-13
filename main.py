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
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select

import standings
import sync
from db import AsyncSessionLocal, engine
from models import AdminOverride, Base, ChatMessage, League, Participant
from wc_data import _initials, generate_wc_data, get_league_seed

log = logging.getLogger(__name__)

# Generate the tournament scenario once at startup (teams, fixtures, markets…).
_wc_data = generate_wc_data()
_ROSTER: List[Dict[str, Any]] = _wc_data["people"]  # seeded league base roster
_CONFIG_LEAGUE_CODE: str = _wc_data["league"]["code"]

_HTML_TEMPLATE = Path("templates/index.html").read_text(encoding="utf-8")

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
    }


def _league_people(league: League, rows: List[Participant]) -> List[Dict[str, Any]]:
    """Seeded base roster (config) overlaid with DB rows (which win on id);
    tombstoned rows hide the matching base entry. Non-seeded leagues are DB-only.
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
    return list(by_id.values())


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
    for m in predictions:
        if m["key"] in admin_preds:
            m["answer"] = admin_preds[m["key"]]

    return teams, fixtures, people, predictions, phase


def _league_state(league: League, league_people: List[Dict[str, Any]], admin: Dict[str, Any]) -> Dict[str, Any]:
    teams, fixtures, people, predictions, phase = _resolve(league_people, admin)
    data = dict(_wc_data)
    data["teams"] = teams
    data["fixtures"] = fixtures
    data["people"] = people
    data["predictions"] = predictions
    data["league"] = _league_public(league)
    # Raw override blob so an organiser's client can hydrate its editor state
    # from the server (keeps admin actions consistent across devices).
    data["adminOverrides"] = admin

    meta = dict(_wc_data["meta"])
    meta["phase"] = phase
    meta["stageLabel"] = (
        "Group stage" if phase == "pre" else "Tournament over" if phase == "done" else "In play"
    )
    meta["groupSize"] = len(people)
    meta["stillIn"] = sum(1 for p in people if p.get("alive"))
    meta["out"] = sum(1 for p in people if not p.get("alive"))
    meta["teamsLeft"] = sum(1 for t in teams if t.get("alive"))
    data["meta"] = meta
    data["pot"] = len(people) * data["fee"]
    return data


def _base_state() -> Dict[str, Any]:
    """League-agnostic payload injected at first paint / used before a league is
    chosen. No participants, no pot — just the shared tournament scaffolding."""
    data = dict(_wc_data)
    data["fixtures"] = _base_fixtures()
    data["people"] = []
    data["league"] = None
    meta = dict(_wc_data["meta"])
    meta["groupSize"] = 0
    meta["stillIn"] = 0
    meta["out"] = 0
    data["meta"] = meta
    data["pot"] = 0
    return data


def _build_html() -> str:
    injection = (
        "<script>window.WC_DATA = "
        + json.dumps(_base_state(), ensure_ascii=False)
        + ";window.WC_LIVE = true;</script>"
    )
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
        await session.commit()
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


@app.get("/api/leagues/{code}/state")
async def league_state(code: str):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        rows = await _participant_rows(session, league)
        admin = await _get_admin_data(session, league)
    return _league_state(league, _league_people(league, rows), admin)


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
async def create_participant(code: str, payload: ParticipantPayload):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        row = await _upsert_participant(session, league, payload)
        return {"ok": True, "participant": _participant_to_dict(row, league.code)}


@app.put("/api/leagues/{code}/participants/{participant_id}")
async def update_participant(code: str, participant_id: str, payload: ParticipantPayload):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        payload.id = participant_id
        row = await _upsert_participant(session, league, payload)
        return {"ok": True, "participant": _participant_to_dict(row, league.code)}


@app.delete("/api/leagues/{code}/participants/{participant_id}")
async def delete_participant(code: str, participant_id: str):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
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
async def set_pick(code: str, participant_id: str, payload: PickPayload):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
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


# ── Admin overrides (league-scoped) ───────────────────────────────────────────

class AdminPayload(BaseModel):
    teams: Dict[str, Any] = {}
    fixtures: Dict[str, Any] = {}
    predictions: Dict[str, Any] = {}
    meta: Dict[str, Any] = {}


@app.put("/api/leagues/{code}/admin")
async def put_admin(code: str, payload: AdminPayload):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
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
        people = _league_people(league, rows)
        person = next((p for p in people if p["id"] == payload.author_id), None)
        if person is None:
            raise HTTPException(status_code=400, detail="unknown participant for this league")
        msg = ChatMessage(
            id=uuid.uuid4().hex[:10], league_id=league.id, author_id=person["id"],
            author=person["name"], initials=person.get("initials", "?"),
            color=person.get("color", "#333"), team=person.get("team", ""),
            text=text, ts=int(time.time() * 1000),
        )
        session.add(msg)
        await session.commit()
        return _chat_to_dict(msg)


@app.delete("/api/leagues/{code}/chat/{message_id}")
async def delete_chat(code: str, message_id: str):
    async with AsyncSessionLocal() as session:
        league = await _get_league_by_code(session, code.upper())
        if league is None:
            raise HTTPException(status_code=404, detail="league not found")
        row = await session.get(ChatMessage, message_id)
        if row is None or row.league_id != league.id:
            raise HTTPException(status_code=404, detail="message not found")
        await session.delete(row)
        await session.commit()
        return {"ok": True}


# ── Static file serving ───────────────────────────────────────────────────────

_STATIC = Path("static")
_JS_TYPES = {
    ".js": "application/javascript",
    ".jsx": "application/javascript",
    ".css": "text/css",
}


@app.get("/tweaks-panel.jsx")
async def tweaks_panel():
    return FileResponse(_STATIC / "tweaks-panel.jsx", media_type="application/javascript")


@app.get("/app/{filename:path}")
async def app_static(filename: str):
    path = _STATIC / "app" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    mt = _JS_TYPES.get(path.suffix, "application/octet-stream")
    return FileResponse(path, media_type=mt)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
