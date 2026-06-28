"""
Adapter for the Football-Data.org v4 API.

Fetches fixtures from:  GET /competitions/{comp_code}/matches?season=2026
Auth header:            X-Auth-Token: <FOOTBALL_DATA_API_KEY>
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import httpx

from provider import CanonicalFixture

log = logging.getLogger(__name__)

BASE_URL = "https://api.football-data.org/v4"

# ── Stage mapping ─────────────────────────────────────────────────────────────
# football-data.org v4 uses LAST_32 / LAST_16; older docs also mention ROUND_OF_*.
_STAGE_MAP: dict[str, str] = {
    "GROUP_STAGE": "group",
    "LAST_32": "r32",
    "ROUND_OF_32": "r32",
    "LAST_16": "r16",
    "ROUND_OF_16": "r16",
    "QUARTER_FINALS": "qf",
    "SEMI_FINALS": "sf",
    "FINAL": "final",
    "THIRD_PLACE": "third",
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
    "RSA": "RSA",   # South Africa (explicit)
    "KOR": "KOR",
    "IRN": "IRN",
    "CRC": "CRC",
    "CUW": "CUW",   # Curaçao
    "CIV": "CIV",   # Côte d'Ivoire
    "BIH": "BIH",
    "COD": "COD",   # DR Congo
    "CPV": "CPV",
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


def _build_name_index(known_teams: List[Dict[str, Any]] | None) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for t in known_teams or []:
        code = str(t.get("code") or "").strip()
        if not code:
            continue
        name = str(t.get("name") or "").strip()
        if name:
            out[name.lower()] = code
        out[code.lower()] = code
    return out


def resolve_team_code(
    team: dict[str, Any] | None,
    *,
    team_id_map: Dict[int, str],
    name_to_code: Dict[str, str],
    known_codes: Set[str],
) -> str:
    """Map a football-data.org team blob to our three-letter code."""
    if not team:
        return "UNK"

    tid = team.get("id")
    if isinstance(tid, int) and tid in team_id_map:
        code = team_id_map[tid]
        if not known_codes or code in known_codes:
            return code

    for raw in (team.get("tla"), team.get("code")):
        code = _normalise_tla(str(raw) if raw else None)
        if code != "UNK" and (not known_codes or code in known_codes):
            return code

    for key in ("shortName", "name"):
        val = team.get(key)
        if val:
            hit = name_to_code.get(str(val).strip().lower())
            if hit:
                return hit

    return "UNK"


def _match_to_canonical(
    match: dict[str, Any],
    tournament_id: str,
    *,
    team_id_map: Dict[int, str],
    name_to_code: Dict[str, str],
    known_codes: Set[str],
) -> CanonicalFixture | None:
    """Convert one football-data.org match dict to CanonicalFixture."""
    raw_stage = match.get("stage", "")
    stage = _STAGE_MAP.get(raw_stage)
    if not stage:
        log.warning(
            "Unknown football-data.org stage %r — skipping match %s",
            raw_stage, match.get("id"),
        )
        return None

    raw_status = match.get("status", "SCHEDULED")
    status = _STATUS_MAP.get(raw_status, "upcoming")

    home_team = resolve_team_code(
        match.get("homeTeam") or {},
        team_id_map=team_id_map,
        name_to_code=name_to_code,
        known_codes=known_codes,
    )
    away_team = resolve_team_code(
        match.get("awayTeam") or {},
        team_id_map=team_id_map,
        name_to_code=name_to_code,
        known_codes=known_codes,
    )
    if home_team == "UNK" or away_team == "UNK":
        log.warning(
            "Unresolved team on match %s stage=%s (home=%r away=%r)",
            match.get("id"),
            raw_stage,
            match.get("homeTeam"),
            match.get("awayTeam"),
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
        home_team=home_team,
        away_team=away_team,
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

    def __init__(self, api_key: str, known_teams: List[Dict[str, Any]] | None = None) -> None:
        self._api_key = api_key
        self._client: httpx.AsyncClient | None = None
        self._known_codes: Set[str] = {str(t.get("code")) for t in (known_teams or []) if t.get("code")}
        self._name_to_code = _build_name_index(known_teams)
        self._team_id_map: Dict[int, str] = {}
        self._teams_loaded = False

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=BASE_URL,
                headers={"X-Auth-Token": self._api_key},
                timeout=30.0,
            )
        return self._client

    async def _ensure_team_map(self, comp_code: str) -> None:
        if self._teams_loaded:
            return
        client = self._get_client()
        url = f"/competitions/{comp_code}/teams"
        log.info("Fetching team list from football-data.org: %s", url)
        response = await client.get(url)
        response.raise_for_status()
        for t in response.json().get("teams") or []:
            tid = t.get("id")
            code = resolve_team_code(
                t,
                team_id_map={},
                name_to_code=self._name_to_code,
                known_codes=self._known_codes,
            )
            if isinstance(tid, int) and code != "UNK":
                self._team_id_map[tid] = code
        self._teams_loaded = True
        log.info("Loaded %d team id mappings from football-data.org", len(self._team_id_map))

    async def get_fixtures(
        self,
        tournament_id: str,
        comp_code: str,
    ) -> list[CanonicalFixture]:
        await self._ensure_team_map(comp_code)
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
            cf = _match_to_canonical(
                m,
                tournament_id,
                team_id_map=self._team_id_map,
                name_to_code=self._name_to_code,
                known_codes=self._known_codes,
            )
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
