"""
Third-place qualification scenario engine.

Pure, provider-agnostic tournament maths for the 2026 World Cup format:
12 groups of 4, top two of each group plus the eight best third-placed teams
advance to the round of 32. This module never trusts a provider's published
standings — every group table is recomputed from fixture results so a stale or
wrong standings feed can't corrupt the answer.

Everything here is parameterised by ``target_team_id`` (defaults to Scotland,
"SCO", but works for any team), takes plain data in and returns plain data out,
and performs no I/O. The FastAPI route wraps it around the existing fixture
data layer (``sync.fixture_cache`` produced by the Football-Data.org / mock
adapters) — see ``qualification/routes.py``. There is no parallel provider here.

The public function names mirror the agreed engine surface:

    build_group_tables        rank_group              get_third_placed_teams
    rank_third_placed_teams   get_target_team_status  simulate_fixture_outcome
    calculate_relevant_score_bands   calculate_what_target_needs
    explain_requirement

Python uses snake_case, so e.g. ``buildGroupTables`` is ``build_group_tables``.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field, replace
from functools import cmp_to_key
from typing import Dict, List, Literal, Optional, Protocol, Tuple

# ── Constants ────────────────────────────────────────────────────────────────

DEFAULT_TARGET = "SCO"
DEFAULT_CUTOFF = 8          # eight best third-placed teams advance
GROUP_SIZE = 4
_GROUP_GAMES = GROUP_SIZE * (GROUP_SIZE - 1) // 2   # 6 round-robin games

# Realistic scoreline band the engine reasons over: 0–0 up to 8–8.
MIN_GOALS = 0
MAX_GOALS = 8
MIN_MARGIN = MIN_GOALS - MAX_GOALS   # -8
MAX_MARGIN = MAX_GOALS - MIN_GOALS   # +8

# A fixture only contributes to a group table once a result is "known". A live
# or half-time score counts as the provisional current result (so the table —
# and qualification picture — reflect what would happen if play stopped now).
_RESULT_STATUSES = ("done", "live", "halfTime")

MatchStatus = Literal["upcoming", "live", "halfTime", "done", "cancelled"]


# ── Types ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Team:
    """A tournament team, provider-neutral."""

    id: str                              # three-letter code, e.g. "SCO"
    name: str
    group: str                           # "A"–"L"
    fair_play: Optional[int] = None      # fair-play points, lower is better (may be missing)


@dataclass(frozen=True)
class Fixture:
    """A single match in provider-neutral form (group stage is what matters here)."""

    id: str
    home: str                            # team id
    away: str                            # team id
    status: MatchStatus
    group: Optional[str] = None          # group letter for group games, else None
    home_goals: Optional[int] = None
    away_goals: Optional[int] = None
    stage: str = "group"


@dataclass(frozen=True)
class GroupStanding:
    """One row of a recomputed group table."""

    team_id: str
    group: str
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int
    fair_play: Optional[int] = None
    rank: Optional[int] = None           # 1-based position within the group


@dataclass(frozen=True)
class ThirdPlaceStanding:
    """A third-placed team, ranked against the other groups' thirds."""

    team_id: str
    group: str
    points: int
    goal_difference: int
    goals_for: int
    fair_play: Optional[int] = None
    rank: Optional[int] = None           # 1-based among all third-placed teams
    qualifies: bool = False              # rank within the qualifying cutoff


@dataclass(frozen=True)
class QualificationStatus:
    """Where ``target_team_id`` currently stands and whether it is qualifying."""

    team_id: str
    name: str
    group: str
    group_rank: Optional[int]
    group_points: int
    group_goal_difference: int
    group_goals_for: int
    position_label: str                  # "Group winner" / "Runner-up" / "3rd place" / "Bottom"
    third_place_rank: Optional[int]      # position among thirds, if currently third
    qualify_cutoff: int
    qualified: bool                      # currently in a qualifying position
    group_complete: bool
    status: str                          # qualified | third_in | third_out | bottom | eliminated
    headline: str                        # one-line summary for the hero panel


@dataclass(frozen=True)
class Band:
    """A collapsed scoreline band for one fixture, from the home team's view.

    ``kind`` is one of the human conditions the UI renders; ``lo``/``hi``/``k``
    carry the numeric detail where relevant. ``goal_dependent`` flags the rare
    case where two scorelines of the same margin disagree (goals-scored tie-break).
    """

    kind: str
    k: Optional[int] = None
    lo: Optional[int] = None
    hi: Optional[int] = None
    goal_dependent: bool = False


@dataclass(frozen=True)
class ScenarioRequirement:
    """A single condition the target needs from one upcoming fixture."""

    fixture_id: str
    group: Optional[str]
    home: str                            # team id
    away: str                            # team id
    band: Band
    text: str                            # explain_requirement(...) output
    combine: str = "AND"


class ProviderAdapter(Protocol):
    """Port the engine consumes: any source that can supply tournament state.

    The repo's football data layer (Football-Data.org / mock adapter →
    ``sync.fixture_cache``) is wrapped to satisfy this in ``routes.py``; the
    engine never talks to a provider directly.
    """

    def get_teams(self) -> List[Team]: ...

    def get_fixtures(self) -> List[Fixture]: ...


# ── Result helpers ───────────────────────────────────────────────────────────

def _has_result(fx: Fixture, include_live: bool = True) -> bool:
    """True if the fixture carries a usable scoreline."""
    if fx.home_goals is None or fx.away_goals is None:
        return False
    if fx.status == "done":
        return True
    if include_live and fx.status in ("live", "halfTime"):
        return True
    return False


def _is_pending(fx: Fixture) -> bool:
    """True if the fixture is a group game whose final result is not yet settled."""
    return fx.stage == "group" and fx.status in ("upcoming", "live", "halfTime")


# ── build_group_tables ───────────────────────────────────────────────────────

def build_group_tables(
    teams: List[Team],
    fixtures: List[Fixture],
    include_live: bool = True,
) -> Dict[str, List[GroupStanding]]:
    """Recompute every group table from fixture results (never from a feed).

    A live/half-time score is treated as the current provisional result when
    ``include_live`` is True, so the table reflects the live picture.
    Returns ``{group: [GroupStanding, ...]}`` ranked, with ``rank`` filled in.
    """
    fair_play = {t.id: t.fair_play for t in teams}
    by_group: Dict[str, List[Team]] = {}
    for t in teams:
        by_group.setdefault(t.group, []).append(t)

    acc: Dict[str, Dict[str, int]] = {
        t.id: {"P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "Pts": 0}
        for t in teams
    }
    ids = set(acc)

    for fx in fixtures:
        if fx.stage != "group" or not _has_result(fx, include_live):
            continue
        if fx.home not in ids or fx.away not in ids:
            continue
        hg, ag = fx.home_goals, fx.away_goals
        h, a = acc[fx.home], acc[fx.away]
        h["P"] += 1; a["P"] += 1
        h["GF"] += hg; h["GA"] += ag
        a["GF"] += ag; a["GA"] += hg
        if hg > ag:
            h["W"] += 1; a["L"] += 1; h["Pts"] += 3
        elif ag > hg:
            a["W"] += 1; h["L"] += 1; a["Pts"] += 3
        else:
            h["D"] += 1; a["D"] += 1; h["Pts"] += 1; a["Pts"] += 1

    tables: Dict[str, List[GroupStanding]] = {}
    for group, group_teams in by_group.items():
        rows = []
        for t in group_teams:
            r = acc[t.id]
            rows.append(
                GroupStanding(
                    team_id=t.id,
                    group=group,
                    played=r["P"],
                    won=r["W"],
                    drawn=r["D"],
                    lost=r["L"],
                    goals_for=r["GF"],
                    goals_against=r["GA"],
                    goal_difference=r["GF"] - r["GA"],
                    points=r["Pts"],
                    fair_play=fair_play.get(t.id),
                )
            )
        tables[group] = rank_group(rows, fixtures, include_live)
    return tables


# ── ranking ──────────────────────────────────────────────────────────────────
#
# Official FIFA group-stage tie-break ladder, applied in order:
#   1. points
#   2. goal difference (all group games)
#   3. goals scored (all group games)
#   4. head-to-head among the teams still level: points, then GD, then goals
#      scored in the matches played between those teams only
#   5. fair-play points (fewer is better)
#   6. drawing of lots  — replaced here by a deterministic id fallback so the
#      tracker never invents or randomises an order.

def _overall_key(s: GroupStanding) -> tuple:
    return (-s.points, -s.goal_difference, -s.goals_for)


def _same_overall(a: GroupStanding, b: GroupStanding) -> bool:
    return (
        a.points == b.points
        and a.goal_difference == b.goal_difference
        and a.goals_for == b.goals_for
    )


def _head_to_head(
    team_ids: set, fixtures: Optional[List[Fixture]], include_live: bool
) -> Dict[str, tuple]:
    """Mini-table (points, GD, goals) among ``team_ids`` from games between them."""
    pts = {i: 0 for i in team_ids}
    gd = {i: 0 for i in team_ids}
    gf = {i: 0 for i in team_ids}
    for fx in fixtures or []:
        if fx.stage != "group" or not _has_result(fx, include_live):
            continue
        if fx.home in team_ids and fx.away in team_ids:
            hg, ag = fx.home_goals, fx.away_goals
            gf[fx.home] += hg; gf[fx.away] += ag
            gd[fx.home] += hg - ag; gd[fx.away] += ag - hg
            if hg > ag:
                pts[fx.home] += 3
            elif ag > hg:
                pts[fx.away] += 3
            else:
                pts[fx.home] += 1; pts[fx.away] += 1
    return {i: (pts[i], gd[i], gf[i]) for i in team_ids}


def _break_group_tie(
    block: List[GroupStanding], fixtures: Optional[List[Fixture]], include_live: bool
) -> List[GroupStanding]:
    """Order teams level on points/GD/goals: head-to-head, then fair play, then id."""
    ids = {s.team_id for s in block}
    h2h = _head_to_head(ids, fixtures, include_live)
    # Fair play only applies if every level team has the data (else skip to id).
    all_fp = all(s.fair_play is not None for s in block)

    def key(s: GroupStanding) -> tuple:
        hp, hgd, hgf = h2h[s.team_id]
        return (-hp, -hgd, -hgf, (s.fair_play if all_fp else 0), s.team_id)

    return sorted(block, key=key)


def rank_group(
    standings: List[GroupStanding],
    fixtures: Optional[List[Fixture]] = None,
    include_live: bool = True,
) -> List[GroupStanding]:
    """Rank a group with the full FIFA tie-break ladder and assign 1-based ``rank``.

    ``fixtures`` are needed for the head-to-head step; if omitted, ranking uses
    points → GD → goals → fair play → id only (head-to-head is skipped).
    """
    by_overall = sorted(standings, key=_overall_key)
    ranked: List[GroupStanding] = []
    i, n = 0, len(by_overall)
    while i < n:
        j = i
        while j < n and _same_overall(by_overall[j], by_overall[i]):
            j += 1
        block = by_overall[i:j]
        ranked.extend(_break_group_tie(block, fixtures, include_live) if len(block) > 1 else block)
        i = j
    return [replace(s, rank=k + 1) for k, s in enumerate(ranked)]


def _third_cmp(a: ThirdPlaceStanding, b: ThirdPlaceStanding) -> int:
    """Same tie-break ladder as groups, applied across third-placed teams."""
    if a.points != b.points:
        return b.points - a.points
    if a.goal_difference != b.goal_difference:
        return b.goal_difference - a.goal_difference
    if a.goals_for != b.goals_for:
        return b.goals_for - a.goals_for
    if a.fair_play is not None and b.fair_play is not None and a.fair_play != b.fair_play:
        return a.fair_play - b.fair_play
    if a.team_id != b.team_id:
        return -1 if a.team_id < b.team_id else 1
    return 0


def get_third_placed_teams(
    tables: Dict[str, List[GroupStanding]],
) -> List[ThirdPlaceStanding]:
    """Pull the third-placed team from each fully-formed group table."""
    thirds: List[ThirdPlaceStanding] = []
    for group, rows in tables.items():
        third = next((r for r in rows if r.rank == 3), None)
        if third is None:
            continue
        thirds.append(
            ThirdPlaceStanding(
                team_id=third.team_id,
                group=group,
                points=third.points,
                goal_difference=third.goal_difference,
                goals_for=third.goals_for,
                fair_play=third.fair_play,
            )
        )
    return thirds


def rank_third_placed_teams(
    thirds: List[ThirdPlaceStanding],
    cutoff: int = DEFAULT_CUTOFF,
) -> List[ThirdPlaceStanding]:
    """Rank third-placed teams and flag the ``cutoff`` that qualify."""
    ordered = sorted(thirds, key=cmp_to_key(_third_cmp))
    return [
        replace(s, rank=i + 1, qualifies=(i + 1) <= cutoff)
        for i, s in enumerate(ordered)
    ]


# ── target status ────────────────────────────────────────────────────────────

_POSITION_LABELS = {1: "Group winner", 2: "Runner-up", 3: "3rd place", 4: "Bottom"}


def _group_complete(group: str, fixtures: List[Fixture]) -> bool:
    played = sum(
        1
        for fx in fixtures
        if fx.stage == "group" and fx.group == group and fx.status == "done"
    )
    return played >= _GROUP_GAMES


def get_target_team_status(
    teams: List[Team],
    fixtures: List[Fixture],
    target_team_id: str = DEFAULT_TARGET,
    cutoff: int = DEFAULT_CUTOFF,
    include_live: bool = True,
) -> QualificationStatus:
    """Compute the target's current group position and qualification standing."""
    team = next((t for t in teams if t.id == target_team_id), None)
    if team is None:
        raise ValueError(f"target team {target_team_id!r} not in team list")

    tables = build_group_tables(teams, fixtures, include_live)
    row = next(r for r in tables[team.group] if r.team_id == target_team_id)
    rank = row.rank
    group_complete = _group_complete(team.group, fixtures)

    third_rank: Optional[int] = None
    qualified = False
    status = "bottom"

    if rank in (1, 2):
        qualified = True
        status = "qualified"
    elif rank == 3:
        ranked_thirds = rank_third_placed_teams(get_third_placed_teams(tables), cutoff)
        me = next((t for t in ranked_thirds if t.team_id == target_team_id), None)
        if me is not None:
            third_rank = me.rank
            qualified = me.qualifies
            status = "third_in" if qualified else "third_out"
    else:  # rank == 4
        status = "eliminated" if group_complete else "bottom"

    return QualificationStatus(
        team_id=target_team_id,
        name=team.name,
        group=team.group,
        group_rank=rank,
        group_points=row.points,
        group_goal_difference=row.goal_difference,
        group_goals_for=row.goals_for,
        position_label=_POSITION_LABELS.get(rank or 0, "—"),
        third_place_rank=third_rank,
        qualify_cutoff=cutoff,
        qualified=qualified,
        group_complete=group_complete,
        status=status,
        headline=_headline(team.name, rank, third_rank, qualified, status, cutoff, group_complete),
    )


def _headline(
    name: str,
    rank: Optional[int],
    third_rank: Optional[int],
    qualified: bool,
    status: str,
    cutoff: int,
    group_complete: bool,
) -> str:
    if status == "qualified":
        tail = "as group winners" if rank == 1 else "as runners-up"
        return f"{name} have qualified {tail}."
    if status == "third_in":
        nth = _ordinal(third_rank) if third_rank else "—"
        if group_complete:
            return f"{name} are {nth} of the third-placed teams — inside the top {cutoff} and through, pending other groups."
        return f"{name} sit {nth} among the third-placed teams — currently inside the top {cutoff}."
    if status == "third_out":
        nth = _ordinal(third_rank) if third_rank else "—"
        return f"{name} are {nth} of the third-placed teams — just outside the top {cutoff} for now."
    if status == "eliminated":
        return f"{name} have finished bottom of the group and are out."
    return f"{name} are bottom of the group with work to do."


def _ordinal(n: Optional[int]) -> str:
    if n is None:
        return "—"
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


# ── Mathematical certainty (exact, not estimated) ────────────────────────────

_CLINCH_MARGIN = 9      # an extreme scoreline used to probe worst/best cases


def assess_group_certainty(
    teams: List[Team],
    fixtures: List[Fixture],
    target_team_id: str = DEFAULT_TARGET,
    include_live: bool = True,
) -> str:
    """Is the target's fate already settled by its OWN group, whatever else happens?

    Returns one of:
      ``"through"``     — guaranteed to finish in the group's top two (qualified
                          no matter how every remaining game goes),
      ``"eliminated"``  — guaranteed to finish 4th (can't even be a third-placed
                          team, so cannot qualify),
      ``"open"``        — not certain from the group alone.

    This is *sound and conservative*: it probes the worst (and best) cases for the
    target using extreme scorelines, so it never claims a certainty that isn't
    real — though it may answer ``"open"`` when a subtle clinch exists. Third-place
    qualification (the cross-group "best 8") is never claimed certain here, because
    that genuinely depends on other groups.
    """
    team = next((t for t in teams if t.id == target_team_id), None)
    if team is None:
        return "open"

    group_teams = [t for t in teams if t.group == team.group]
    gids = {t.id for t in group_teams}
    group_fx = [
        fx for fx in fixtures
        if fx.stage == "group" and fx.home in gids and fx.away in gids
    ]
    remaining = [fx for fx in group_fx if fx.status in ("upcoming", "live", "halfTime")]
    settled = [fx for fx in group_fx if fx not in remaining]

    target_games = [fx for fx in remaining if target_team_id in (fx.home, fx.away)]
    rival_games = [fx for fx in remaining if fx not in target_games]
    big = _CLINCH_MARGIN

    def _target_score(fx: Fixture, target_wins: bool) -> Tuple[int, int]:
        win, lose = (big, 0)
        if (fx.home == target_team_id) == target_wins:
            return win, lose
        return lose, win

    def _rank_when(rival_combo, target_wins: bool) -> int:
        fxs = list(settled)
        for fx in target_games:
            hg, ag = _target_score(fx, target_wins)
            fxs.append(replace(fx, home_goals=hg, away_goals=ag, status="done"))
        for fx, outcome in zip(rival_games, rival_combo):
            hg, ag = outcome
            fxs.append(replace(fx, home_goals=hg, away_goals=ag, status="done"))
        table = build_group_tables(group_teams, fxs, include_live)[team.group]
        return next(r.rank for r in table if r.team_id == target_team_id)

    # Every way a rival-vs-rival game can resolve, at extreme margins.
    rival_outcomes = [(big, 0), (0, 0), (0, big)]
    combos = list(itertools.product(rival_outcomes, repeat=len(rival_games)))

    # Guaranteed through: even in the worst case (target loses everything heavily,
    # rivals win heavily), is the target still top two?
    worst_rank = max(_rank_when(combo, target_wins=False) for combo in combos)
    if worst_rank <= 2:
        return "through"

    # Eliminated: even in the best case (target wins everything heavily), is the
    # target still 4th — unable to even be a third-placed team?
    best_rank = min(_rank_when(combo, target_wins=True) for combo in combos)
    if best_rank >= 4:
        return "eliminated"

    return "open"


# ── simulation ───────────────────────────────────────────────────────────────

def simulate_fixture_outcome(
    fixtures: List[Fixture],
    fixture_id: str,
    home_goals: int,
    away_goals: int,
    status: MatchStatus = "done",
) -> List[Fixture]:
    """Return a new fixture list with one fixture's scoreline applied.

    Pure — the input list is not mutated. Used to ask "what if this match ends
    h–a?" without disturbing the rest of the tournament state.
    """
    out: List[Fixture] = []
    for fx in fixtures:
        if fx.id == fixture_id:
            out.append(replace(fx, home_goals=home_goals, away_goals=away_goals, status=status))
        else:
            out.append(fx)
    return out


def _target_qualifies(
    teams: List[Team],
    fixtures: List[Fixture],
    target_team_id: str,
    cutoff: int,
) -> bool:
    """Boolean: would the target qualify given this exact fixture state?"""
    tables = build_group_tables(teams, fixtures, include_live=True)
    team = next(t for t in teams if t.id == target_team_id)
    row = next(r for r in tables[team.group] if r.team_id == target_team_id)
    if row.rank in (1, 2):
        return True
    if row.rank == 3:
        thirds = rank_third_placed_teams(get_third_placed_teams(tables), cutoff)
        me = next((t for t in thirds if t.team_id == target_team_id), None)
        return bool(me and me.qualifies)
    return False


# ── score bands ──────────────────────────────────────────────────────────────

def calculate_relevant_score_bands(
    teams: List[Team],
    fixtures: List[Fixture],
    fixture_id: str,
    target_team_id: str = DEFAULT_TARGET,
    cutoff: int = DEFAULT_CUTOFF,
) -> Dict[Tuple[int, int], bool]:
    """For one fixture, map every scoreline (0–0 … 8–8) → does the target qualify?

    All other fixtures are held at their current state. The grid is the raw
    material that ``calculate_what_target_needs`` collapses into a human band.
    """
    grid: Dict[Tuple[int, int], bool] = {}
    for hg in range(MIN_GOALS, MAX_GOALS + 1):
        for ag in range(MIN_GOALS, MAX_GOALS + 1):
            sim = simulate_fixture_outcome(fixtures, fixture_id, hg, ag)
            grid[(hg, ag)] = _target_qualifies(teams, sim, target_team_id, cutoff)
    return grid


def _collapse_band(grid: Dict[Tuple[int, int], bool]) -> Band:
    """Collapse an 81-cell scoreline grid into a single human-readable band.

    Reasoning is by margin (home goals − away goals), the way people actually
    talk about results. The lowest-scoring scoreline of each margin is the
    representative; if a higher-scoring scoreline of the same margin disagrees
    (a goals-scored tie-break swing) we still classify by margin but flag it
    ``goal_dependent`` so the caller can hedge the wording.
    """
    rep: Dict[int, bool] = {}
    goal_dependent = False
    for m in range(MIN_MARGIN, MAX_MARGIN + 1):
        cells = [
            (hg, ag)
            for hg in range(MIN_GOALS, MAX_GOALS + 1)
            for ag in range(MIN_GOALS, MAX_GOALS + 1)
            if hg - ag == m
        ]
        vals = [grid[c] for c in cells]
        # Representative = lowest-scoring scoreline of this margin (first in cells).
        rep[m] = vals[0]
        if any(v != vals[0] for v in vals):
            goal_dependent = True

    trues = [m for m in range(MIN_MARGIN, MAX_MARGIN + 1) if rep[m]]
    if not trues:
        return Band(kind="none", goal_dependent=goal_dependent)
    if len(trues) == (MAX_MARGIN - MIN_MARGIN + 1):
        return Band(kind="any", goal_dependent=goal_dependent)

    lo, hi = min(trues), max(trues)
    contiguous = all(rep[m] for m in range(lo, hi + 1))
    touches_low = lo == MIN_MARGIN
    touches_high = hi == MAX_MARGIN

    if contiguous and touches_high and not touches_low:
        k = lo
        if k == 0:
            return Band(kind="avoid_defeat", goal_dependent=goal_dependent)
        if k == 1:
            return Band(kind="win", goal_dependent=goal_dependent)
        if k > 1:
            return Band(kind="win_by", k=k, goal_dependent=goal_dependent)
        return Band(kind="avoid_loss_by", k=(-k) + 1, goal_dependent=goal_dependent)

    if contiguous and touches_low and not touches_high:
        k = hi
        if k == 0:
            return Band(kind="avoid_win", goal_dependent=goal_dependent)
        if k == -1:
            return Band(kind="lose", goal_dependent=goal_dependent)
        if k >= 1:
            return Band(kind="not_win_by", k=k + 1, goal_dependent=goal_dependent)
        return Band(kind="lose_by", k=-k, goal_dependent=goal_dependent)

    if contiguous:                         # bounded interval, both ends open
        if lo == hi == 0:
            return Band(kind="draw_only", goal_dependent=goal_dependent)
        return Band(kind="interval", lo=lo, hi=hi, goal_dependent=goal_dependent)

    if trues == [0]:
        return Band(kind="draw_only", goal_dependent=goal_dependent)
    return Band(kind="complex", goal_dependent=goal_dependent)


# ── what the target needs ────────────────────────────────────────────────────

def calculate_what_target_needs(
    teams: List[Team],
    fixtures: List[Fixture],
    target_team_id: str = DEFAULT_TARGET,
    cutoff: int = DEFAULT_CUTOFF,
) -> List[ScenarioRequirement]:
    """The checklist: every pending fixture whose result still matters, collapsed.

    Each pending group fixture is simulated across all scorelines (others held
    at their current state). A fixture that changes nothing ("any result works")
    is dropped; the rest become requirements. Same-group dependencies are
    naturally combined with AND — every requirement must hold.
    """
    status = get_target_team_status(teams, fixtures, target_team_id, cutoff)
    # Already through or already out → nothing left to depend on.
    if status.status in ("qualified", "eliminated"):
        return []

    target_group = status.group
    # Cross-group third-place dependencies only make sense once the target is
    # actually in the third-place picture (currently 3rd, or its group is done).
    # Before then the only fixtures that matter are the target's own remaining
    # games — which decide whether it even reaches third. This also stops a
    # degenerate all-square (pre-tournament) state spamming spurious conditions.
    include_cross_group = status.group_rank == 3 or status.group_complete

    name_of = {t.id: t.name for t in teams}
    requirements: List[ScenarioRequirement] = []

    pending = [fx for fx in fixtures if _is_pending(fx)]
    # Stable, human order: by group then by fixture id.
    pending.sort(key=lambda fx: (fx.group or "~", fx.id))

    for fx in pending:
        if not include_cross_group and fx.group != target_group:
            continue
        grid = calculate_relevant_score_bands(teams, fixtures, fx.id, target_team_id, cutoff)
        band = _collapse_band(grid)
        # "any"  → every result of this match keeps the target's fate unchanged.
        # "none" → no result of this match alone helps (the target needs other
        #          things to fall into place first). Neither is an actionable
        #          single-match requirement, so don't list it — otherwise a team
        #          just outside the cut gets a checklist full of "no result
        #          helps" lines. The headline/status already conveys the bind.
        if band.kind in ("any", "none"):
            continue
        text = explain_requirement(band, name_of.get(fx.home, fx.home), name_of.get(fx.away, fx.away))
        requirements.append(
            ScenarioRequirement(
                fixture_id=fx.id,
                group=fx.group,
                home=fx.home,
                away=fx.away,
                band=band,
                text=text,
            )
        )
    return requirements


# ── explanation ──────────────────────────────────────────────────────────────

def explain_requirement(band: Band, home_name: str, away_name: str) -> str:
    """Render a collapsed band as a plain-English condition."""
    hedge = " (margin permitting)" if band.goal_dependent and band.kind not in ("any", "none") else ""

    if band.kind == "any":
        return "Any result works"
    if band.kind == "none":
        return "No realistic result helps"
    if band.kind == "avoid_defeat":
        return f"{home_name} to avoid defeat" + hedge
    if band.kind == "win":
        return f"{home_name} to win" + hedge
    if band.kind == "win_by":
        return f"{home_name} to win by {band.k}+" + hedge
    if band.kind == "avoid_win":
        return f"{home_name} must not win" + hedge
    if band.kind == "lose":
        return f"{home_name} to lose" + hedge
    if band.kind == "not_win_by":
        return f"{home_name} must not win by {band.k}+" + hedge
    if band.kind == "lose_by":
        return f"{home_name} to lose by {band.k}+" + hedge
    if band.kind == "avoid_loss_by":
        return f"{home_name} must not lose by {band.k}+" + hedge
    if band.kind == "draw_only":
        return f"{home_name} and {away_name} to draw" + hedge
    if band.kind == "interval":
        return _interval_text(band, home_name, away_name) + hedge
    return f"{home_name} v {away_name}: a specific result is needed"


def _interval_text(band: Band, home_name: str, away_name: str) -> str:
    lo, hi = band.lo, band.hi
    if lo is None or hi is None:
        return f"{home_name} v {away_name}: a specific result is needed"
    if lo >= 1:                            # win by lo..hi
        if lo == hi:
            return f"{home_name} to win by exactly {lo}"
        return f"{home_name} to win by {lo}–{hi}"
    if hi <= -1:                           # lose by |hi|..|lo|
        if lo == hi:
            return f"{home_name} to lose by exactly {-lo}"
        return f"{home_name} to lose by {-hi}–{-lo}"
    return f"{home_name} v {away_name}: result between {lo:+d} and {hi:+d} goals"
