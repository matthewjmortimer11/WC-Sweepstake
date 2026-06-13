"""
Wheesht — World Cup Sweepstake
FastAPI backend serving the app and game state API.

Participants are persisted to a small JSON file (data/participants.json) so the
sweepstake survives a restart and works across devices. No auth — each entrant
gets a generated id and can pick their account from any device, exactly like the
front-end mock store, but shared via the server.
"""

import asyncio
import json
import logging
import os
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

import standings
import sync
from db import engine
from models import Base
from wc_data import generate_wc_data

log = logging.getLogger(__name__)

# Generate the tournament scenario once at startup (teams, fixtures, demo field…)
_wc_data = generate_wc_data()

_HTML_TEMPLATE = Path("templates/index.html").read_text(encoding="utf-8")

# ── Participant persistence ───────────────────────────────────────────────────
# Real sign-ups are stored separately from the generated demo field so a restart
# never wipes anyone. They are merged into the people list on every read.

_DATA_DIR = Path("data")
_PARTICIPANTS_FILE = _DATA_DIR / "participants.json"
_ADMIN_FILE = _DATA_DIR / "admin.json"
_CHAT_FILE = _DATA_DIR / "chat.json"
_lock = threading.Lock()
_MAX_CHAT = 200


def _load_participants() -> List[Dict[str, Any]]:
    if _PARTICIPANTS_FILE.exists():
        try:
            return json.loads(_PARTICIPANTS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_participants(rows: List[Dict[str, Any]]) -> None:
    _DATA_DIR.mkdir(exist_ok=True)
    _PARTICIPANTS_FILE.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _load_admin() -> Dict[str, Any]:
    if _ADMIN_FILE.exists():
        try:
            return json.loads(_ADMIN_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"teams": {}, "fixtures": {}, "predictions": {}, "meta": {}}


def _load_chat() -> List[Dict[str, Any]]:
    if _CHAT_FILE.exists():
        try:
            return json.loads(_CHAT_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_chat(messages: List[Dict[str, Any]]) -> None:
    _DATA_DIR.mkdir(exist_ok=True)
    _CHAT_FILE.write_text(
        json.dumps(messages[-_MAX_CHAT:], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _save_admin(data: Dict[str, Any]) -> None:
    _DATA_DIR.mkdir(exist_ok=True)
    _ADMIN_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _merged_people() -> List[Dict[str, Any]]:
    """Demo field + real sign-ups (real entries win on id collision)."""
    real = _load_participants()
    real_ids = {p.get("id") for p in real}
    base = [p for p in _wc_data["people"] if p.get("id") not in real_ids]
    return real + base


def _state() -> Dict[str, Any]:
    data = dict(_wc_data)
    people = _merged_people()

    # Use live fixture cache if populated (from sync worker), else fall back to
    # the statically generated fixtures from wc_data.
    fixtures = sync.fixture_cache if sync.fixture_cache else _wc_data["fixtures"]

    # admin-overrides: merge data/admin.json fixture corrections if present.
    admin = _load_admin()
    admin_fixtures = admin.get("fixtures") or {}
    if admin_fixtures:
        patched = []
        for f in fixtures:
            override = admin_fixtures.get(f["id"])
            if override:
                f = dict(f)
                if "score" in override:
                    f["score"] = override["score"]
                if "status" in override:
                    f["status"] = override["status"]
                if "winner" in override:
                    f["winner"] = override["winner"]
            patched.append(f)
        fixtures = patched
    data["fixtures"] = fixtures

    # Rules engine: recompute each team's alive/stage/rounds from finished
    # fixtures, then mirror that status onto the participants who hold them.
    stage_ladder = _wc_data["meta"]["stageLadder"]
    teams = standings.compute_team_status(_wc_data["teams"], fixtures, stage_ladder)
    data["teams"] = teams
    people = standings.apply_to_people(people, teams)
    data["people"] = people

    # Auto-grade the prediction markets we can settle from results; the rest
    # stay open for the admin panel.
    data["predictions"] = standings.grade_predictions(
        _wc_data["predictions"], teams, fixtures, stage_ladder
    )

    meta = dict(data["meta"])
    meta["groupSize"] = len(people)
    meta["stillIn"] = sum(1 for p in people if p.get("alive"))
    meta["out"] = sum(1 for p in people if not p.get("alive"))
    meta["teamsLeft"] = sum(1 for t in teams if t.get("alive"))
    data["meta"] = meta
    data["pot"] = len(people) * data["fee"]

    return data


def _build_html() -> str:
    # Inject live state + a flag so the front-end store talks to the server
    # instead of falling back to its localStorage mock.
    injection = (
        "<script>window.WC_DATA = "
        + json.dumps(_state(), ensure_ascii=False)
        + ";window.WC_LIVE = true;</script>"
    )
    return _HTML_TEMPLATE.replace("<!-- WC_DATA_INJECTION -->", injection)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables (no-op if they already exist).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Select adapter.
    api_key = os.environ.get("FOOTBALL_DATA_API_KEY", "")
    if api_key:
        from adapters.football_data_org import FootballDataOrgAdapter
        adapter = FootballDataOrgAdapter(api_key)
        log.info("Using FootballDataOrgAdapter")
    else:
        from adapters.mock import MockAdapter
        adapter = MockAdapter()
        log.warning(
            "FOOTBALL_DATA_API_KEY not set — using MockAdapter (no live data)"
        )

    tournament_id = _wc_data["meta"]["id"]
    comp_code = _wc_data["meta"]["competitionCode"]

    task = asyncio.create_task(
        sync.start_sync(adapter, tournament_id, comp_code)
    )

    yield

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await engine.dispose()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Wheesht — World Cup Sweepstake 2026", lifespan=lifespan)


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(content=_build_html())


@app.get("/api/state")
async def get_state():
    return _state()


@app.get("/api/participants")
async def list_participants():
    return _merged_people()


class Participant(BaseModel):
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
    picks: Dict[str, Any] = {}
    predScore: int = 0
    joinedAt: Optional[int] = None


@app.post("/api/participants")
async def create_participant(payload: Participant):
    with _lock:
        rows = _load_participants()
        if any(r.get("id") == payload.id for r in rows):
            raise HTTPException(status_code=409, detail="id already exists")
        rows.append(payload.model_dump())
        _save_participants(rows)
    return {"ok": True, "participant": payload.model_dump()}


@app.put("/api/participants/{participant_id}")
async def update_participant(participant_id: str, payload: Participant):
    with _lock:
        rows = _load_participants()
        idx = next((i for i, r in enumerate(rows) if r.get("id") == participant_id), None)
        if idx is None:
            # Upsert — allows editing a row that only existed client-side
            rows.append(payload.model_dump())
        else:
            rows[idx] = payload.model_dump()
        _save_participants(rows)
    return {"ok": True, "participant": payload.model_dump()}


@app.delete("/api/participants/{participant_id}")
async def delete_participant(participant_id: str):
    with _lock:
        rows = _load_participants()
        new_rows = [r for r in rows if r.get("id") != participant_id]
        if len(new_rows) == len(rows):
            raise HTTPException(status_code=404, detail="participant not found")
        _save_participants(new_rows)
    return {"ok": True}


class PickPayload(BaseModel):
    key: str
    value: Any


@app.put("/api/participants/{participant_id}/picks")
async def set_pick(participant_id: str, payload: PickPayload):
    with _lock:
        rows = _load_participants()
        idx = next((i for i, r in enumerate(rows) if r.get("id") == participant_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="participant not found")
        picks = dict(rows[idx].get("picks") or {})
        picks[payload.key] = payload.value
        rows[idx]["picks"] = picks
        _save_participants(rows)
    return {"ok": True, "picks": rows[idx]["picks"]}


class AdminPayload(BaseModel):
    teams: Dict[str, Any] = {}
    fixtures: Dict[str, Any] = {}
    predictions: Dict[str, Any] = {}
    meta: Dict[str, Any] = {}


@app.put("/api/admin")
async def put_admin(payload: AdminPayload):
    """Persist admin overrides (score corrections etc.) to data/admin.json."""
    _save_admin(payload.model_dump())
    return {"ok": True}


class ChatPayload(BaseModel):
    author_id: str
    text: str


@app.get("/api/chat")
async def get_chat():
    """Return the last 100 chat messages."""
    return _load_chat()[-100:]


@app.post("/api/chat")
async def post_chat(payload: ChatPayload):
    """Append a message from the given participant."""
    text = payload.text.strip()[:280]
    if not text:
        raise HTTPException(status_code=400, detail="empty message")

    people = _merged_people()
    person = next((p for p in people if p.get("id") == payload.author_id), None)
    if not person:
        raise HTTPException(status_code=400, detail="unknown participant")

    import time as _time
    msg = {
        "id": uuid.uuid4().hex[:10],
        "author_id": payload.author_id,
        "author": person["name"],
        "initials": person.get("initials", "?"),
        "color": person.get("color", "#333"),
        "team": person.get("team", ""),
        "text": text,
        "ts": int(_time.time() * 1000),
    }
    with _lock:
        messages = _load_chat()
        messages.append(msg)
        _save_chat(messages)
    return msg


# ── Static file serving ───────────────────────────────────────────────────────
# Serve static files explicitly so they don't interfere with API routes.

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
