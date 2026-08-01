"""Durable storage helpers for Cover Story.

Live room state stays in memory. This module stores reusable custom location
packs and completed round summaries only.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select

from db import AsyncSessionLocal
from models import CoverStoryCustomPack, CoverStoryPlayerProfile, CoverStoryPlaytestReport, CoverStoryRound

_MAX_PACK_NAME = 48
_MAX_PACK_DESC = 160
_MAX_LOCATIONS = 80
_MAX_TEXT = 120
_MAX_TEXTURE = 240
_MAX_ROLES = 16
_MAX_QUESTIONS = 6
_MAX_ALIAS = 24
_MAX_RECENT_ROOMS = 10


class StoreError(Exception):
    """A rejected storage operation; safe to show to clients."""


def _clean_text(value: Any, *, max_len: int = _MAX_TEXT) -> str:
    text = " ".join(str(value or "").strip().split())
    text = "".join(ch for ch in text if ch.isprintable())
    return text[:max_len]


def _slug(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (base or "pack")[:40]


def clean_locations(raw_locations: Any) -> list[dict]:
    if not isinstance(raw_locations, list):
        raise StoreError("Locations must be a list.")
    cleaned = []
    for idx, raw in enumerate(raw_locations[:_MAX_LOCATIONS], start=1):
        if not isinstance(raw, dict):
            continue
        name = _clean_text(raw.get("name"))
        if not name:
            continue
        roles = [
            _clean_text(role, max_len=36)
            for role in (raw.get("roles") or [])
            if _clean_text(role, max_len=36)
        ][:_MAX_ROLES]
        questions = [
            _clean_text(q, max_len=100)
            for q in (raw.get("questions") or [])
            if _clean_text(q, max_len=100)
        ][:_MAX_QUESTIONS]
        if len(roles) < 4:
            raise StoreError(f"{name} needs at least 4 cover roles.")
        if len(questions) < 1:
            raise StoreError(f"{name} needs at least 1 pressure question.")
        cleaned.append({
            "id": _slug(name) + f"-{idx}",
            "pack": "custom",
            "name": name,
            "category": _clean_text(raw.get("category") or "Custom", max_len=48),
            "texture": _clean_text(raw.get("texture") or "A custom Cover Story location.", max_len=_MAX_TEXTURE),
            "roles": roles,
            "questions": questions,
        })
    if len(cleaned) < 3:
        raise StoreError("A custom pack needs at least 3 playable locations.")
    return cleaned


def _pack_public(row: CoverStoryCustomPack) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "count": len(row.locations or []),
        "custom": True,
        "createdAt": row.created_at.isoformat(),
    }


def _profile_public(row: CoverStoryPlayerProfile) -> dict:
    return {
        "playerId": row.player_id,
        "alias": row.alias,
        "preferences": {
            "timerSecs": row.preferred_timer_secs,
            "packIds": list(row.preferred_pack_ids or []),
            "customPackIds": list(row.preferred_custom_pack_ids or []),
            "spyCount": row.preferred_spy_count,
            "viewMode": row.preferred_view_mode,
        },
        "recentRooms": list(row.recent_rooms or []),
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
    }


def _clean_profile_payload(payload: dict, *, current: CoverStoryPlayerProfile | None = None) -> dict:
    prefs = payload.get("preferences") if isinstance(payload.get("preferences"), dict) else {}
    pack_ids = [
        _clean_text(pack_id, max_len=32)
        for pack_id in prefs.get("packIds", current.preferred_pack_ids if current else ["classic", "luxury", "chaos"])
        if _clean_text(pack_id, max_len=32)
    ][:8]
    custom_pack_ids = [
        _clean_text(pack_id, max_len=64)
        for pack_id in prefs.get("customPackIds", current.preferred_custom_pack_ids if current else [])
        if _clean_text(pack_id, max_len=64)
    ][:8]
    try:
        timer_secs = int(prefs.get("timerSecs", current.preferred_timer_secs if current else 420))
    except (TypeError, ValueError):
        timer_secs = 420
    if timer_secs not in {0, 300, 420, 600, 720}:
        timer_secs = current.preferred_timer_secs if current else 420
    try:
        spy_count = int(prefs.get("spyCount", current.preferred_spy_count if current else 1))
    except (TypeError, ValueError):
        spy_count = 1
    if spy_count not in {1, 2}:
        spy_count = current.preferred_spy_count if current else 1
    view_mode = _clean_text(prefs.get("viewMode", current.preferred_view_mode if current else "table"), max_len=12)
    if view_mode not in {"table", "remote"}:
        view_mode = current.preferred_view_mode if current else "table"
    recent = payload.get("recentRooms", current.recent_rooms if current else [])
    cleaned_recent = []
    if isinstance(recent, list):
        seen = set()
        for raw in recent:
            if not isinstance(raw, dict):
                continue
            code = _clean_text(raw.get("code"), max_len=8).upper()
            if not code or code in seen:
                continue
            seen.add(code)
            try:
                at = int(raw.get("at") or 0)
            except (TypeError, ValueError):
                at = 0
            try:
                players = max(0, min(16, int(raw.get("players") or 0)))
            except (TypeError, ValueError):
                players = 0
            cleaned_recent.append({"code": code, "at": at, "players": players})
    return {
        "alias": _clean_text(payload.get("alias", current.alias if current else ""), max_len=_MAX_ALIAS),
        "preferred_timer_secs": timer_secs,
        "preferred_pack_ids": pack_ids or (list(current.preferred_pack_ids) if current else ["classic"]),
        "preferred_custom_pack_ids": custom_pack_ids,
        "preferred_spy_count": spy_count,
        "preferred_view_mode": view_mode,
        "recent_rooms": cleaned_recent[:_MAX_RECENT_ROOMS],
    }


async def get_player_profile(player_id: str) -> dict | None:
    player_id = _clean_text(player_id, max_len=64)
    if not player_id:
        return None
    async with AsyncSessionLocal() as session:
        row = await session.get(CoverStoryPlayerProfile, player_id)
        return _profile_public(row) if row else None


def default_player_profile(player_id: str) -> dict:
    player_id = _clean_text(player_id, max_len=64)
    return {
        "playerId": player_id,
        "alias": "",
        "preferences": {
            "timerSecs": 420,
            "packIds": ["classic", "luxury", "chaos"],
            "customPackIds": [],
            "spyCount": 1,
            "viewMode": "table",
        },
        "recentRooms": [],
        "createdAt": "",
        "updatedAt": "",
        "persisted": False,
    }


async def upsert_player_profile(player_id: str, payload: dict) -> dict:
    player_id = _clean_text(player_id, max_len=64)
    if not player_id:
        raise StoreError("Player id is required.")
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as session:
        row = await session.get(CoverStoryPlayerProfile, player_id)
        if row is None:
            clean = _clean_profile_payload(payload)
            row = CoverStoryPlayerProfile(
                player_id=player_id,
                alias=clean["alias"],
                preferred_timer_secs=clean["preferred_timer_secs"],
                preferred_pack_ids=clean["preferred_pack_ids"],
                preferred_custom_pack_ids=clean["preferred_custom_pack_ids"],
                preferred_spy_count=clean["preferred_spy_count"],
                preferred_view_mode=clean["preferred_view_mode"],
                recent_rooms=clean["recent_rooms"],
                created_at=now,
                updated_at=now,
            )
            session.add(row)
        else:
            clean = _clean_profile_payload(payload, current=row)
            row.alias = clean["alias"]
            row.preferred_timer_secs = clean["preferred_timer_secs"]
            row.preferred_pack_ids = clean["preferred_pack_ids"]
            row.preferred_custom_pack_ids = clean["preferred_custom_pack_ids"]
            row.preferred_spy_count = clean["preferred_spy_count"]
            row.preferred_view_mode = clean["preferred_view_mode"]
            row.recent_rooms = clean["recent_rooms"]
            row.updated_at = now
        await session.commit()
        return _profile_public(row)


async def list_custom_packs() -> list[dict]:
    async with AsyncSessionLocal() as session:
        rows = (await session.scalars(
            select(CoverStoryCustomPack).order_by(desc(CoverStoryCustomPack.created_at))
        )).all()
        return [_pack_public(row) for row in rows]


async def get_custom_pack(pack_id: str) -> dict | None:
    pack_id = (pack_id or "").strip()
    if not pack_id:
        return None
    async with AsyncSessionLocal() as session:
        row = await session.get(CoverStoryCustomPack, pack_id)
        if row is None:
            return None
        return {**_pack_public(row), "locations": list(row.locations or [])}


async def locations_for_custom_packs(pack_ids: list[str]) -> list[dict]:
    ids = [str(pid).strip() for pid in pack_ids if str(pid).strip()]
    if not ids:
        return []
    async with AsyncSessionLocal() as session:
        rows = (await session.scalars(
            select(CoverStoryCustomPack).where(CoverStoryCustomPack.id.in_(ids))
        )).all()
        out = []
        for row in rows:
            for loc in row.locations or []:
                loc = dict(loc)
                loc["pack"] = f"custom:{row.id}"
                out.append(loc)
        return out


async def create_custom_pack(payload: dict) -> dict:
    name = _clean_text(payload.get("name"), max_len=_MAX_PACK_NAME)
    if not name:
        raise StoreError("Pack name is required.")
    description = _clean_text(payload.get("description"), max_len=_MAX_PACK_DESC)
    locations = clean_locations(payload.get("locations"))
    row = CoverStoryCustomPack(
        id=uuid.uuid4().hex[:12],
        name=name,
        description=description,
        locations=locations,
        created_at=datetime.now(timezone.utc),
    )
    async with AsyncSessionLocal() as session:
        session.add(row)
        await session.commit()
        return {**_pack_public(row), "locations": list(row.locations or [])}


async def record_round(room_code: str, summary: dict, *, spy_count: int) -> None:
    row = CoverStoryRound(
        id=uuid.uuid4().hex,
        room_code=room_code.upper(),
        winner=str(summary.get("winner") or ""),
        location_name=str(summary.get("locationName") or ""),
        player_count=int(summary.get("playerCount") or 0),
        timer_secs=int(summary.get("timerSecs") or 0),
        spy_count=int(spy_count or 1),
        pack_ids=list(summary.get("packIds") or []),
        completed_at=datetime.fromtimestamp(int(summary.get("completedAt") or 0), tz=timezone.utc)
        if summary.get("completedAt") else datetime.now(timezone.utc),
    )
    async with AsyncSessionLocal() as session:
        session.add(row)
        await session.commit()


async def recent_rounds(room_code: str, *, limit: int = 25) -> list[dict]:
    room_code = (room_code or "").strip().upper()
    async with AsyncSessionLocal() as session:
        rows = (await session.scalars(
            select(CoverStoryRound)
            .where(CoverStoryRound.room_code == room_code.upper())
            .order_by(desc(CoverStoryRound.completed_at))
            .limit(limit)
        )).all()
        ordered = list(reversed(rows))
        return [
            {
                "round": i + 1,
                "winner": row.winner,
                "locationName": row.location_name,
                "playerCount": row.player_count,
                "timerSecs": row.timer_secs,
                "spyCount": row.spy_count,
                "packIds": list(row.pack_ids or []),
                "completedAt": int(row.completed_at.timestamp()),
            }
            for i, row in enumerate(ordered)
        ]


def _report_public(row: CoverStoryPlaytestReport) -> dict:
    return {
        "id": row.id,
        "tableSize": row.table_size,
        "timerSecs": row.timer_secs,
        "packIds": list(row.pack_ids or []),
        "completedRounds": row.completed_rounds,
        "rejoinIssues": bool(row.rejoin_issues),
        "confusingLocations": list(row.confusing_locations or []),
        "notes": row.notes,
        "rating": row.rating,
        "createdAt": row.created_at.isoformat(),
    }


async def create_playtest_report(payload: dict) -> dict:
    try:
        table_size = max(0, min(50, int(payload.get("tableSize", 0) or 0)))
        timer_secs = max(0, min(3600, int(payload.get("timerSecs", 0) or 0)))
        completed_rounds = max(0, min(50, int(payload.get("completedRounds", 0) or 0)))
        rating = max(0, min(5, int(payload.get("rating", 0) or 0)))
    except (TypeError, ValueError):
        raise StoreError("Invalid playtest numbers.")
    pack_ids = [str(p).strip()[:64] for p in (payload.get("packIds") or []) if str(p).strip()][:12]
    confusing = [
        _clean_text(item, max_len=80)
        for item in (payload.get("confusingLocations") or [])
        if _clean_text(item, max_len=80)
    ][:12]
    row = CoverStoryPlaytestReport(
        id=uuid.uuid4().hex,
        table_size=table_size,
        timer_secs=timer_secs,
        pack_ids=pack_ids,
        completed_rounds=completed_rounds,
        rejoin_issues=bool(payload.get("rejoinIssues")),
        confusing_locations=confusing,
        notes=_clean_text(payload.get("notes"), max_len=1000),
        rating=rating,
        created_at=datetime.now(timezone.utc),
    )
    async with AsyncSessionLocal() as session:
        session.add(row)
        await session.commit()
        return _report_public(row)


async def recent_playtest_reports(*, limit: int = 50) -> list[dict]:
    async with AsyncSessionLocal() as session:
        rows = (await session.scalars(
            select(CoverStoryPlaytestReport)
            .order_by(desc(CoverStoryPlaytestReport.created_at))
            .limit(limit)
        )).all()
        return [_report_public(row) for row in rows]
