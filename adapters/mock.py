"""
Mock adapter — no I/O, pure Python.

Converts the round-robin fixtures produced by wc_data.py's _build_fixtures()
into CanonicalFixture objects so the sync loop works identically whether a real
Football-Data.org API key is present or not.

Kickoff times are parsed as BST (UTC+1) since the schedule config uses local
UK time. has_live() always returns False.
"""

from __future__ import annotations

import datetime as _dt
from datetime import timezone, timedelta
from typing import Any

from provider import CanonicalFixture
from wc_data import generate_wc_data

_BST = timezone(timedelta(hours=1))


def _parse_kickoff(date_iso: str, time_str: str) -> _dt.datetime:
    """Combine a YYYY-MM-DD date and HH:MM time (assumed BST) into UTC datetime."""
    naive = _dt.datetime.fromisoformat(f"{date_iso}T{time_str}:00")
    bst = naive.replace(tzinfo=_BST)
    return bst.astimezone(timezone.utc)


def _fixture_to_canonical(f: dict[str, Any], tournament_id: str) -> CanonicalFixture:
    kickoff_utc = _parse_kickoff(f["dateISO"], f["time"])
    return CanonicalFixture(
        id=f"mock-{f['id']}",
        tournament_id=tournament_id,
        stage=f.get("stage", "group"),
        group_name=f.get("group"),
        matchday=f.get("matchday"),
        home_team=f["a"],
        away_team=f["b"],
        kickoff_utc=kickoff_utc,
        venue=f.get("venue"),
        status=f.get("status", "upcoming"),
        home_goals=None,
        away_goals=None,
        winner=None,
        after_extra_time=False,
        last_updated=_dt.datetime.now(tz=timezone.utc),
    )


class MockAdapter:
    """Adapter that synthesises fixtures from wc_data without any network I/O."""

    async def get_fixtures(
        self,
        tournament_id: str,
        comp_code: str,
    ) -> list[CanonicalFixture]:
        data = generate_wc_data()
        fixtures = data.get("fixtures", [])
        return [_fixture_to_canonical(f, tournament_id) for f in fixtures]

    async def has_live(
        self,
        tournament_id: str,
        comp_code: str,
    ) -> bool:
        return False
