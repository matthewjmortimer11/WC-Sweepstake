"""
Rules engine — derive team & participant status from finished fixtures.

Design principle: provider-driven, never speculative. We do NOT reimplement
FIFA's bracket draw or the full group tiebreaker ladder. Instead:

  * Advancement is read from the fixtures the provider publishes. A team that
    appears in a knockout fixture has qualified to that round; a team that
    loses a finished knockout match is out.
  * Group-stage elimination removes teams unambiguously gone (bottom of a
    fully-played group). Once every group is complete, non-qualifiers are cut
    using the same top-two + best-thirds projection as the R32 bracket — still
    no predicted knockout winners. If the full opening knockout round is later
    published in the feed, that remains authoritative.

The output is the same shape the frontend already consumes: each team gets
`alive`, `stage`, and `rounds` (index in the stage ladder). Participants then
mirror the status of the team they hold.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from qualification.engine import (
    Fixture,
    Team,
    build_group_tables,
    get_third_placed_teams,
    rank_third_placed_teams,
)

_DONE = frozenset({"done", "ft", "fulltime", "full_time", "full-time", "finished"})


def _fixture_finished(fx: Dict[str, Any]) -> bool:
    st = str(fx.get("status") or "").strip().lower()
    if st in _DONE:
        return True
    return bool(fx.get("done"))


def _first_knockout_round(stage_ladder: List[str]) -> Optional[str]:
    for stage in stage_ladder:
        if stage not in ("group", "winner"):
            return stage
    return None


def _opening_knockout_draw_complete(
    fixtures: List[Dict[str, Any]],
    codes: set,
    stage_ladder: List[str],
) -> bool:
    """True once the full opening knockout round is published.

  World Cup 2026: 32 teams → 16 round-of-32 ties. We only treat the bracket
  as authoritative for cutting group stragglers once every one of those ties
  is in the feed. A lone later-round fixture (or a partial R32 list) must not
  knock out group winners whose tie has not been published yet.
    """
    opening = _first_knockout_round(stage_ladder)
    if not opening:
        return False
    opening_fx = [f for f in fixtures if f.get("stage") == opening]
    # 48-team format: 32 advance, 16 first-knockout fixtures.
    if len(opening_fx) < 16:
        return False
    paired = 0
    teams: set = set()
    for f in opening_fx:
        a, b = f.get("a"), f.get("b")
        if a in codes and b in codes:
            paired += 1
            teams.add(a)
            teams.add(b)
    return paired >= 16 and len(teams) >= 32


def _to_qual_team(t: Dict[str, Any]) -> Team:
    return Team(id=t["code"], name=t.get("name") or t["code"], group=t.get("group") or "?")


def _to_qual_fixture(f: Dict[str, Any]) -> Fixture:
    st = str(f.get("status") or "upcoming").strip().lower()
    if st in ("done", "ft", "fulltime", "full_time", "full-time", "finished"):
        qst = "done"
    elif st in ("live", "halftime", "half_time", "half-time", "ht", "paused", "1h", "2h"):
        qst = "live"
    else:
        qst = "upcoming"
    score = f.get("score")
    hg = ag = None
    if isinstance(score, (list, tuple)) and len(score) == 2:
        hg, ag = score[0], score[1]
    return Fixture(
        id=str(f.get("id") or ""),
        home=f["a"],
        away=f["b"],
        status=qst,  # type: ignore[arg-type]
        group=f.get("group"),
        home_goals=hg,
        away_goals=ag,
        stage=str(f.get("stage") or "group"),
    )


def _projected_qualifier_codes(
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
) -> List[str]:
    """32 team codes projected to advance (top two per group + eight best thirds)."""
    qual_teams = [_to_qual_team(t) for t in teams]
    qual_fixtures = [_to_qual_fixture(f) for f in fixtures if f.get("stage") == "group"]
    tables = build_group_tables(qual_teams, qual_fixtures, include_live=True)
    thirds = rank_third_placed_teams(get_third_placed_teams(tables), cutoff=8)

    ordered: List[str] = []
    for group in sorted(tables.keys()):
        rows = tables[group]
        first = next((r for r in rows if r.rank == 1), None)
        second = next((r for r in rows if r.rank == 2), None)
        if first:
            ordered.append(first.team_id)
        if second:
            ordered.append(second.team_id)
    for t in thirds:
        if t.qualifies:
            ordered.append(t.team_id)

    seen = set()
    out: List[str] = []
    for code in ordered:
        if code not in seen:
            seen.add(code)
            out.append(code)
    for t in teams:
        if len(out) >= 32:
            break
        if t["code"] not in seen:
            seen.add(t["code"])
            out.append(t["code"])
    return out[:32]


def _winner_of(fx: Dict[str, Any]) -> Optional[str]:
    """Return HOME / AWAY / DRAW / None for a fixture.

    Prefer the provider's explicit winner (which accounts for extra-time and
    penalty sh-out outcomes); fall back to the full-time score for group games.
    """
    w = fx.get("winner")
    if w in ("HOME", "AWAY", "DRAW"):
        return w
    if _fixture_finished(fx):
        score = fx.get("score")
        if score and len(score) == 2 and score[0] is not None and score[1] is not None:
            if score[0] > score[1]:
                return "HOME"
            if score[1] > score[0]:
                return "AWAY"
            return "DRAW"
    return None


def compute_team_status(
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
    stage_ladder: List[str],
) -> List[Dict[str, Any]]:
    """Return a copy of `teams` with alive/stage/rounds recomputed from results."""
    ladder_index = {s: i for i, s in enumerate(stage_ladder)}
    codes = {t["code"] for t in teams}

    reached: Dict[str, str] = {c: "group" for c in codes}     # furthest stage seen
    eliminated: Dict[str, bool] = {c: False for c in codes}
    champion: Optional[str] = None

    # Group-stage points table (only finished group games count).
    grec: Dict[str, Dict[str, int]] = {
        c: {"Pts": 0, "GF": 0, "GA": 0} for c in codes
    }

    knockout_draw_complete = _opening_knockout_draw_complete(fixtures, codes, stage_ladder)

    for f in fixtures:
        a, b, stage = f.get("a"), f.get("b"), f.get("stage")
        if a not in codes or b not in codes:
            continue

        # Appearing in a fixture proves the team reached that stage.
        si = ladder_index.get(stage, 0)
        if si > ladder_index.get(reached[a], 0):
            reached[a] = stage
        if si > ladder_index.get(reached[b], 0):
            reached[b] = stage

        if stage == "group":
            score = f.get("score")
            if _fixture_finished(f) and score and None not in score:
                ga, gb = score[0], score[1]
                grec[a]["GF"] += ga; grec[a]["GA"] += gb
                grec[b]["GF"] += gb; grec[b]["GA"] += ga
                if ga > gb:
                    grec[a]["Pts"] += 3
                elif gb > ga:
                    grec[b]["Pts"] += 3
                else:
                    grec[a]["Pts"] += 1; grec[b]["Pts"] += 1
        else:
            win = _winner_of(f)
            if win == "HOME":
                eliminated[b] = True
                if stage == "final":
                    champion = a
            elif win == "AWAY":
                eliminated[a] = True
                if stage == "final":
                    champion = b

    # Group membership + completion.
    groups: Dict[str, List[str]] = {}
    for t in teams:
        groups.setdefault(t.get("group"), []).append(t["code"])

    # A group is only "complete" once the full round-robin has actually been
    # played (k teams → k*(k-1)/2 matches). Counting finished matches against
    # that expected total is robust to a partial fixture list — we never
    # eliminate on an incomplete group.
    done_count: Dict[str, int] = {g: 0 for g in groups}
    for f in fixtures:
        if f.get("stage") == "group" and _fixture_finished(f):
            g = f.get("group")
            if g in done_count:
                done_count[g] += 1
    group_done: Dict[str, bool] = {}
    for g, members in groups.items():
        k = len(members)
        expected = k * (k - 1) // 2
        group_done[g] = expected > 0 and done_count[g] >= expected

    for g, members in groups.items():
        if not group_done.get(g):
            continue
        ranked = sorted(
            members,
            key=lambda c: (
                grec[c]["Pts"],
                grec[c]["GF"] - grec[c]["GA"],
                grec[c]["GF"],
            ),
            reverse=True,
        )
        if knockout_draw_complete:
            # Full opening bracket published: anyone still only at "group" did
            # not make the cut (covers best-thirds exactly once every tie exists).
            for c in members:
                if reached[c] == "group":
                    eliminated[c] = True
        else:
            # Bracket incomplete or not drawn yet: only the bottom team is
            # certainly gone while groups are still playing.
            for c in ranked[3:]:
                eliminated[c] = True

    all_groups_complete = bool(groups) and all(group_done.get(g) for g in groups if g)
    if all_groups_complete and not knockout_draw_complete and len(codes) >= 32:
        qualifiers = set(_projected_qualifier_codes(teams, fixtures))
        for c in codes:
            if reached[c] == "group" and c not in qualifiers:
                eliminated[c] = True

    out: List[Dict[str, Any]] = []
    for t in teams:
        c = t["code"]
        stage = "winner" if champion == c else reached[c]
        if eliminated[c]:
            if reached[c] == "group":
                stage = "out-group"
            elif champion != c:
                stage = "out-" + reached[c]
        nt = dict(t)
        nt["stage"] = stage
        nt["alive"] = not eliminated[c]
        furthest = reached[c] if eliminated[c] else stage
        if str(furthest).startswith("out-"):
            furthest = furthest[4:]
        nt["rounds"] = ladder_index.get(furthest, ladder_index.get("group", 0))
        out.append(nt)
    return out


def _clean_sheets(code: str, fixtures: List[Dict[str, Any]]) -> int:
    """Count finished matches where `code` kept a clean sheet (conceded 0)."""
    n = 0
    for f in fixtures:
        if f.get("status") != "done":
            continue
        score = f.get("score")
        if not score or None in score:
            continue
        if f.get("a") == code and score[1] == 0:
            n += 1
        elif f.get("b") == code and score[0] == 0:
            n += 1
    return n


def grade_predictions(
    predictions: List[Dict[str, Any]],
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
    stage_ladder: List[str],
) -> List[Dict[str, Any]]:
    """Fill in `answer` for the markets we can settle directly from results.

    Auto-graded (everything else is left for the admin panel — it needs
    player-level data or human judgement):

      winner      → the champion, once the final is decided.
      final       → the two teams in the final fixture, once it exists.
      scotland /  → that nation's furthest stage, once they're out (or champion).
        england
      cleanSheets → option team with most clean sheets, once the tournament ends.

    An answer that is already set (e.g. an admin/config value) is never
    overwritten.
    """
    ladder_index = {s: i for i, s in enumerate(stage_ladder)}
    by_code = {t["code"]: t for t in teams}
    champion = next((t["code"] for t in teams if t.get("stage") == "winner"), None)
    final_fx = next((f for f in fixtures if f.get("stage") == "final"), None)

    special_stage_keys = {"scotland": "SCO", "england": "ENG"}

    out: List[Dict[str, Any]] = []
    for m in predictions:
        nm = dict(m)
        if nm.get("answer") is not None:
            out.append(nm)
            continue

        key = m.get("key")
        ans: Any = None

        if key == "winner":
            ans = champion
        elif key == "final" and final_fx:
            a, b = final_fx.get("a"), final_fx.get("b")
            if a and b:  # only grade once both finalists are known
                ans = [a, b]
        elif key in special_stage_keys:
            t = by_code.get(special_stage_keys[key])
            # Only settle once they can't progress further.
            if t and (not t.get("alive") or t.get("stage") == "winner"):
                stage = t.get("stage")
                if stage and str(stage).startswith("out-"):
                    stage = str(stage)[4:]
                idx = ladder_index.get(stage)
                opts = m.get("options") or []
                # The stage-market options are positionally aligned with the
                # stage ladder (group → winner).
                if idx is not None and idx < len(opts):
                    ans = opts[idx]
        elif key == "cleanSheets" and champion is not None:
            best, best_n = None, -1
            for code in (m.get("options") or []):
                n = _clean_sheets(code, fixtures)
                if n > best_n:
                    best_n, best = n, code
            ans = best

        nm["answer"] = ans
        out.append(nm)
    return out


def _market_resolved(m: Dict[str, Any]) -> bool:
    if not m:
        return False
    if str(m.get("key") or "").startswith("dm_"):
        st = str(m.get("fixture_status") or m.get("fixtureStatus") or m.get("status") or "").lower()
        if st not in ("done", "ft", "fulltime", "full_time", "full-time", "finished"):
            return False
    if m.get("kind") == "team2":
        ans = m.get("answer")
        return isinstance(ans, list) and len(ans) > 0 and all(x is not None for x in ans)
    return m.get("answer") is not None


def score_participant_picks(
    picks: Dict[str, Any],
    predictions: List[Dict[str, Any]],
) -> int:
    """Server-authoritative prediction points for one entrant."""
    total = 0
    picks = picks or {}
    for m in predictions:
        if not _market_resolved(m):
            continue
        pts = int(m.get("points") or 0)
        pick = picks.get(m.get("key"))
        if pick is None:
            continue
        kind = m.get("kind")
        ans = m.get("answer")
        if kind == "team2":
            if (
                isinstance(pick, list)
                and isinstance(ans, list)
                and len(pick) == len(ans)
                and sorted(pick) == sorted(ans)
            ):
                total += pts
        elif kind == "number":
            try:
                if int(pick) == int(ans):
                    total += pts
            except (TypeError, ValueError):
                pass
        elif pick == ans:
            total += pts
    return total


def apply_pred_scores(
    people: List[Dict[str, Any]],
    predictions: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Attach server-graded predScore to each participant."""
    out: List[Dict[str, Any]] = []
    for p in people:
        np = dict(p)
        np["predScore"] = score_participant_picks(p.get("picks") or {}, predictions)
        out.append(np)
    return out


def apply_to_people(
    people: List[Dict[str, Any]],
    teams: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Mirror each participant's alive/stage onto the team they hold."""
    by_code = {t["code"]: t for t in teams}
    out: List[Dict[str, Any]] = []
    for p in people:
        t = by_code.get(p.get("team"))
        if t is None:
            out.append(p)
            continue
        np = dict(p)
        np["alive"] = t["alive"]
        np["stage"] = t["stage"]
        out.append(np)
    return out
