"""
Wheesht — World Cup Sweepstake
FastAPI backend serving the app and game state API.

Participants are persisted to a small JSON file (data/participants.json) so the
sweepstake survives a restart and works across devices. No auth — each entrant
gets a generated id and can pick their account from any device, exactly like the
front-end mock store, but shared via the server.
"""

import json
import threading
from pathlib import Path
from typing import Optional, Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from wc_data import generate_wc_data

app = FastAPI(title="Wheesht — World Cup Sweepstake 2026")

# Generate the tournament scenario once at startup (teams, fixtures, demo field…)
_wc_data = generate_wc_data()

_HTML_TEMPLATE = Path("templates/index.html").read_text(encoding="utf-8")

# ── Participant persistence ───────────────────────────────────────────────────
# Real sign-ups are stored separately from the generated demo field so a restart
# never wipes anyone. They are merged into the people list on every read.

_DATA_DIR = Path("data")
_PARTICIPANTS_FILE = _DATA_DIR / "participants.json"
_lock = threading.Lock()


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


def _merged_people() -> List[Dict[str, Any]]:
    """Demo field + real sign-ups (real entries win on id collision)."""
    real = _load_participants()
    real_ids = {p.get("id") for p in real}
    base = [p for p in _wc_data["people"] if p.get("id") not in real_ids]
    return real + base


def _state() -> Dict[str, Any]:
    data = dict(_wc_data)
    people = _merged_people()
    data["people"] = people
    meta = dict(data["meta"])
    meta["groupSize"] = len(people)
    meta["stillIn"] = sum(1 for p in people if p.get("alive"))
    meta["out"] = sum(1 for p in people if not p.get("alive"))
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
