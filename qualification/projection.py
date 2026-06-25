"""
Monte-Carlo projection for third-place qualification.

The deterministic engine (``engine.py``) answers "given this exact state, is the
target in?". But whether a third-placed team qualifies depends on the *combined*
outcome of every remaining group game across all 12 groups — no single result
usually settles it. So to answer the questions that actually matter —

  * What are the target's chances of qualifying?
  * Which remaining games affect those chances, and which way?

— we simulate the rest of the group stage many times and measure.

Model: each unplayed game is sampled with independent Poisson goals and a mild
home advantage (evenly-matched assumption — we deliberately don't pretend to
know team strength). For every simulation we recompute the full tables and ask
the engine's qualification rule whether the target is in. The qualification
chance is the fraction of simulations that succeed; a game's *impact* is how the
target's chance shifts depending on that game's result (home win / draw / away
win), marginalised over everything else.

This is a hot path (thousands of trials), so it uses a lean dict/tuple
accumulator rather than the engine's dataclasses, with the completed-game table
computed once and only the sampled results applied per trial. The ranking rule
matches the engine: points → goal difference → goals scored → fair play →
deterministic fallback.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, replace
from typing import Dict, List, Optional, Tuple

from .engine import (
    DEFAULT_CUTOFF,
    DEFAULT_TARGET,
    Fixture,
    Team,
)

# Goal expectation per side for an unplayed game. Symmetric (no home edge): World
# Cup venues are essentially neutral, and an asymmetric model would bias a team's
# chances purely by which fixtures list it as "home". Evenly-matched assumption.
_LAMBDA_HOME = 1.35
_LAMBDA_AWAY = 1.35

_PENDING_STATUSES = ("upcoming", "live", "halfTime")


@dataclass(frozen=True)
class GameImpact:
    """How one remaining game shifts the target's qualification chance."""

    fixture_id: str
    group: Optional[str]
    home: str
    away: str
    chance_if_home_win: float       # P(target qualifies | home win), 0–1
    chance_if_draw: float
    chance_if_away_win: float
    swing: float                    # max − min of the three conditional chances
    favoured_outcome: str           # "home" | "draw" | "away" — best for target
    matters: bool                   # swing is materially above noise


@dataclass(frozen=True)
class Projection:
    """The target's qualification outlook over the remaining games."""

    chance: float                   # overall P(target qualifies), 0–1
    decided: bool                   # no games left → chance is exactly 0 or 1
    trials: int
    impacts: List[GameImpact]       # one per remaining game, sorted by swing desc


# A game is flagged as "mattering" once its swing clears Monte-Carlo noise.
_MATTERS_THRESHOLD = 0.02


def _poisson(rng: random.Random, lam: float) -> int:
    """Knuth's Poisson sampler."""
    target = math.exp(-lam)
    k = 0
    p = 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= target:
            return k - 1


def _sample_score(rng: random.Random) -> Tuple[int, int]:
    return _poisson(rng, _LAMBDA_HOME), _poisson(rng, _LAMBDA_AWAY)


def _fair_play_key(fp: Optional[int]) -> int:
    # Lower fair-play points rank higher; missing data is treated as neutral so
    # ranking falls through to the deterministic id fallback (it never crashes).
    return fp if fp is not None else 0


def project(
    teams: List[Team],
    fixtures: List[Fixture],
    target_team_id: str = DEFAULT_TARGET,
    cutoff: int = DEFAULT_CUTOFF,
    trials: int = 4000,
    seed: int = 20260611,
) -> Projection:
    """Simulate the remaining group games and project the target's chances.

    ``seed`` is fixed by default so the same tournament state always yields the
    same numbers (a poll doesn't make the percentage flicker); a new result
    changes the fixtures and therefore the projection.
    """
    if not any(t.id == target_team_id for t in teams):
        raise ValueError(f"target team {target_team_id!r} not in team list")

    team_group: Dict[str, str] = {t.id: t.group for t in teams}
    team_fp: Dict[str, int] = {t.id: _fair_play_key(t.fair_play) for t in teams}
    groups: Dict[str, List[str]] = {}
    for t in teams:
        groups.setdefault(t.group, []).append(t.id)

    ids = set(team_group)
    target_group = team_group[target_team_id]

    # Base table from completed games — computed once, reused every trial. We also
    # keep the completed games per group so head-to-head ties can be resolved.
    base: Dict[str, List[int]] = {i: [0, 0, 0] for i in ids}  # [pts, gf, ga]
    base_group_matches: Dict[str, List[Tuple[str, str, int, int]]] = {}
    pending: List[Fixture] = []
    for fx in fixtures:
        if fx.stage != "group":
            continue
        if fx.home not in ids or fx.away not in ids:
            continue
        if fx.status in _PENDING_STATUSES:
            pending.append(fx)
        elif fx.status == "done" and fx.home_goals is not None and fx.away_goals is not None:
            _apply(base, fx.home, fx.away, fx.home_goals, fx.away_goals)
            base_group_matches.setdefault(team_group[fx.home], []).append(
                (fx.home, fx.away, fx.home_goals, fx.away_goals)
            )
        # cancelled / scoreless are ignored

    def qualifies(stats, sampled_gm) -> bool:
        return _target_qualifies_fast(
            stats, groups, team_fp, target_team_id, target_group, cutoff,
            base_group_matches, sampled_gm,
        )

    # No games left: the outcome is fixed.
    if not pending:
        return Projection(
            chance=1.0 if qualifies(base, {}) else 0.0,
            decided=True,
            trials=0,
            impacts=[],
        )

    rng = random.Random(seed)
    qual_total = 0
    # Per fixture: {outcome: [qualify_count, total]} for H / D / A.
    cond: Dict[str, Dict[str, List[int]]] = {
        fx.id: {"H": [0, 0], "D": [0, 0], "A": [0, 0]} for fx in pending
    }

    for _ in range(trials):
        stats = {i: base[i][:] for i in base}
        sampled: List[Tuple[str, str]] = []  # (fixture_id, outcome)
        sampled_gm: Dict[str, List[Tuple[str, str, int, int]]] = {}
        for fx in pending:
            hg, ag = _sample_score(rng)
            _apply(stats, fx.home, fx.away, hg, ag)
            sampled_gm.setdefault(team_group[fx.home], []).append((fx.home, fx.away, hg, ag))
            sampled.append((fx.id, "H" if hg > ag else ("D" if hg == ag else "A")))
        q = 1 if qualifies(stats, sampled_gm) else 0
        qual_total += q
        for fid, outcome in sampled:
            bucket = cond[fid][outcome]
            bucket[0] += q
            bucket[1] += 1

    chance = qual_total / trials

    impacts: List[GameImpact] = []
    for fx in pending:
        c = cond[fx.id]

        def rate(key: str) -> float:
            qc, tot = c[key]
            return qc / tot if tot else chance

        r_home, r_draw, r_away = rate("H"), rate("D"), rate("A")
        options = (("home", r_home), ("draw", r_draw), ("away", r_away))
        swing = max(r for _, r in options) - min(r for _, r in options)
        favoured = max(options, key=lambda o: o[1])[0]
        impacts.append(
            GameImpact(
                fixture_id=fx.id,
                group=fx.group,
                home=fx.home,
                away=fx.away,
                chance_if_home_win=r_home,
                chance_if_draw=r_draw,
                chance_if_away_win=r_away,
                swing=swing,
                favoured_outcome=favoured,
                matters=swing >= _MATTERS_THRESHOLD,
            )
        )

    impacts.sort(key=lambda g: g.swing, reverse=True)
    return Projection(chance=chance, decided=False, trials=trials, impacts=impacts)


def _apply(stats: Dict[str, List[int]], home: str, away: str, hg: int, ag: int) -> None:
    sh, sa = stats[home], stats[away]
    sh[1] += hg
    sh[2] += ag
    sa[1] += ag
    sa[2] += hg
    if hg > ag:
        sh[0] += 3
    elif ag > hg:
        sa[0] += 3
    else:
        sh[0] += 1
        sa[0] += 1


def _overall_sort_key(i, stats, team_fp):
    return (-stats[i][0], -(stats[i][1] - stats[i][2]), -stats[i][1], team_fp[i], i)


def _same_overall_stats(a: List[int], b: List[int]) -> bool:
    return a[0] == b[0] and (a[1] - a[2]) == (b[1] - b[2]) and a[1] == b[1]


def _h2h_sort(block, stats, team_fp, matches):
    """Order a tied block by head-to-head points → GD → goals → fair play → id."""
    bset = set(block)
    pts = {i: 0 for i in block}
    gd = {i: 0 for i in block}
    gf = {i: 0 for i in block}
    for h, a, hg, ag in matches:
        if h in bset and a in bset:
            gf[h] += hg; gf[a] += ag
            gd[h] += hg - ag; gd[a] += ag - hg
            if hg > ag:
                pts[h] += 3
            elif ag > hg:
                pts[a] += 3
            else:
                pts[h] += 1; pts[a] += 1
    return sorted(block, key=lambda i: (-pts[i], -gd[i], -gf[i], team_fp[i], i))


def _rank_ids(members, stats, team_fp, matches):
    """Rank a group's teams with the full FIFA ladder (overall → head-to-head …)."""
    order = sorted(members, key=lambda i: _overall_sort_key(i, stats, team_fp))
    ranked: List[str] = []
    k, n = 0, len(order)
    while k < n:
        m = k
        while m < n and _same_overall_stats(stats[order[m]], stats[order[k]]):
            m += 1
        if m - k > 1:
            ranked.extend(_h2h_sort(order[k:m], stats, team_fp, matches))
        else:
            ranked.append(order[k])
        k = m
    return ranked


def _target_qualifies_fast(
    stats: Dict[str, List[int]],
    groups: Dict[str, List[str]],
    team_fp: Dict[str, int],
    target: str,
    target_group: str,
    cutoff: int,
    base_gm: Dict[str, List[Tuple[str, str, int, int]]],
    sampled_gm: Dict[str, List[Tuple[str, str, int, int]]],
) -> bool:
    """Lean qualification check used inside the simulation loop.

    Mirrors the engine exactly: top two of each group qualify; the target, if
    third, must rank within ``cutoff`` of the third-placed teams. Group order
    uses the full tie-break ladder including head-to-head; third-placed teams
    (from different groups) are ranked on points → GD → goals → fair play → id.
    """
    thirds: List[str] = []
    for group, members in groups.items():
        matches = base_gm.get(group, ())
        extra = sampled_gm.get(group)
        if extra:
            matches = list(matches) + extra
        ranked = _rank_ids(members, stats, team_fp, matches)
        if target in members:
            pos = ranked.index(target)
            if pos <= 1:
                return True            # group winner or runner-up
            if pos != 2:
                return False           # 4th (or lower) — out via the group
        thirds.append(ranked[2])       # this group's third-placed team

    ranked_thirds = sorted(thirds, key=lambda i: _overall_sort_key(i, stats, team_fp))
    return target in ranked_thirds[:cutoff]
