"""
Adapter for the Football-Data.org v4 API.

Fetches fixtures from:  GET /competitions/{comp_code}/matches?season=2026
Auth header:            X-Auth-Token: <FOOTBALL_DATA_API_KEY>
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from provider import CanonicalFixture

log = logging.getLogger(__name__)

BASE_URL = "https://api.football-data.org/v4"

# ── Stage mapping ─────────────────────────────────────────────────────────────
_STAGE_MAP: dict[str, str] = {
    "GROUP_STAGE": "group",
    "ROUND_OF_32": "r32",
    "ROUND_OF_16": "r16",
    "QUARTER_FINALS": "qf",
    "SEMI_FINALS": "sf",
    "FINAL": "final",
    "THIRD_PLACE": "final",         # treat 3rd-place play-off as a final-stage match
}

# ── Status mapping ────────────────────────────────────────────────────────────
_STATUS_MAP: dict[str, str] = {
    "SCHEDULED": "upcoming",
    "TIMED": "upcoming",
    "IN_PLAY": "live",
    "PAUSED": "halfTime",
    "EXTRA_TIME": "live",
    "PENALTY_SHOOTOUT": "live",
    "FINISHED": "done",
    "AWARDED": "done",
    "CANCELLED": "cancelled",
    "POSTPONED": "cancelled",
    "SUSPENDED": "cancelled",
}

# ── TLA corrections ───────────────────────────────────────────────────────────
# Football-Data.org sometimes uses different three-letter codes than our TOML.
# Map their codes → our codes here.
TLA_OVERRIDES: dict[str, str] = {
    "SAU": "KSA",   # Saudi Arabia
    "CVE": "CPV",   # Cape Verde
    "KOR": "KOR",   # South Korea (same, explicit for clarity)
    "IRN": "IRN",   # Iran (same)
    "CRC": "CRC",   # Costa Rica (same)
    # Add further overrides as mismatches are discovered.
}


def _normalise_tla(tla: str | None) -> str:
    if not tla:
        return "UNK"
    return TLA_OVERRIDES.get(tla, tla)


def _parse_kickoff(utc_str: str | None) -> datetime:
    if not utc_str:
        return datetime.now(tz=timezone.utc)
    # Football-data.org returns ISO-8601 with a trailing 'Z'.
    return datetime.fromisoformat(utc_str.replace("Z", "+00:00"))


def _parse_winner(raw: str | None) -> Optional[str]:
    mapping = {
        "HOME_TEAM": "HOME",
        "AWAY_TEAM": "AWAY",
        "DRAW": "DRAW",
    }
    return mapping.get(raw or "", None)


def _after_extra_time(duration: str | None) -> bool:
    return (duration or "").upper() in ("EXTRA_TIME", "PENALTY_SHOOTOUT")


def _match_to_canonical(
    match: dict[str, Any],
    tournament_id: str,
) -> CanonicalFixture | None:
    """Convert one football-data.org match dict to CanonicalFixture."""
    raw_stage = match.get("stage", "")
    stage = _STAGE_MAP.get(raw_stage)
    if not stage:
        log.debug("Unknown stage %r — skipping match %s", raw_stage, match.get("id"))
        return None

    raw_status = match.get("status", "SCHEDULED")
    status = _STATUS_MAP.get(raw_status, "upcoming")

    home_tla = _normalise_tla(
        (match.get("homeTeam") or {}).get("tla")
    )
    away_tla = _normalise_tla(
        (match.get("awayTeam") or {}).get("tla")
    )

    score = match.get("score") or {}
    ft = score.get("fullTime") or {}
    home_goals: Optional[int] = ft.get("home")
    away_goals: Optional[int] = ft.get("away")

    group_raw: Optional[str] = match.get("group")          # e.g. "GROUP_A"
    group_name: Optional[str] = None
    if group_raw and "_" in group_raw:
        group_name = group_raw.split("_")[-1]              # → "A"
    elif group_raw:
        group_name = group_raw

    matchday: Optional[int] = match.get("matchday")

    return CanonicalFixture(
        id=str(match["id"]),
        tournament_id=tournament_id,
        stage=stage,
        group_name=group_name,
        matchday=matchday,
        home_team=home_tla,
        away_team=away_tla,
        kickoff_utc=_parse_kickoff(match.get("utcDate")),
        venue=(match.get("venue") or None),
        status=status,
        home_goals=home_goals,
        away_goals=away_goals,
        winner=_parse_winner(score.get("winner")),
        after_extra_time=_after_extra_time(score.get("duration")),
        last_updated=datetime.now(tz=timezone.utc),
    )


class FootballDataOrgAdapter:
    """Adapter for Football-Data.org v4 API."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=BASE_URL,
                headers={"X-Auth-Token": self._api_key},
                timeout=30.0,
            )
        return self._client

    async def get_fixtures(
        self,
        tournament_id: str,
        comp_code: str,
    ) -> list[CanonicalFixture]:
        client = self._get_client()
        url = f"/competitions/{comp_code}/matches"
        params = {"season": "2026"}
        log.info("Fetching fixtures from football-data.org: %s %s", url, params)
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        matches = data.get("matches", [])
        log.info("Received %d matches from football-data.org", len(matches))

        fixtures: list[CanonicalFixture] = []
        for m in matches:
            cf = _match_to_canonical(m, tournament_id)
            if cf is not None:
                fixtures.append(cf)

        return fixtures

    async def has_live(
        self,
        tournament_id: str,
        comp_code: str,
    ) -> bool:
        fixtures = await self.get_fixtures(tournament_id, comp_code)
        return any(f.status in ("live", "halfTime") for f in fixtures)
