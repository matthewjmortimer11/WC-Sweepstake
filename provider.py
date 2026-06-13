"""
Provider abstraction layer.

CanonicalFixture is the common representation that all adapters produce.
ProviderAdapter is the Protocol that every adapter must satisfy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Protocol, runtime_checkable


@dataclass
class CanonicalFixture:
    """A single fixture in provider-neutral form."""

    id: str                          # stable provider-assigned id
    tournament_id: str               # e.g. "world-cup-2026"
    stage: str                       # group | r32 | r16 | qf | sf | final
    group_name: Optional[str]        # "A"–"L" (None for knockout rounds)
    matchday: Optional[int]          # 1–3 for group stage; None for knockouts
    home_team: str                   # three-letter code (matches TOML)
    away_team: str                   # three-letter code
    kickoff_utc: datetime            # timezone-aware UTC
    venue: Optional[str]
    status: str                      # upcoming | live | done | cancelled
    home_goals: Optional[int] = None
    away_goals: Optional[int] = None
    winner: Optional[str] = None     # HOME | AWAY | DRAW
    after_extra_time: bool = False
    last_updated: datetime = field(default_factory=lambda: datetime.utcnow())


@runtime_checkable
class ProviderAdapter(Protocol):
    """Protocol that every fixture-data adapter must implement."""

    async def get_fixtures(
        self,
        tournament_id: str,
        comp_code: str,
    ) -> list[CanonicalFixture]:
        """Fetch all fixtures for *tournament_id* from the underlying source."""
        ...

    async def has_live(
        self,
        tournament_id: str,
        comp_code: str,
    ) -> bool:
        """Return True if any fixture is currently live (IN_PLAY / PAUSED etc.)."""
        ...
