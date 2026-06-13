"""
Rules engine — derive team & participant status from finished fixtures.

Design principle: provider-driven, never speculative. We do NOT reimplement
FIFA's bracket draw or the full group tiebreaker ladder. Instead:

  * Advancement is read from the fixtures the provider publishes. A team that
    appears in a knockout fixture has qualified to that round; a team that
    loses a finished knockout match is out.
  * Group-stage elimination only removes teams that are unambiguously gone
    (bottom of a fully-played group). Third-placed teams stay alive until the
    knockout fixtures reveal which "best thirds" advanced — so we never guess.

The output is the same shape the frontend already consumes: each team gets
`alive`, `stage`, and `rounds` (index in the stage ladder). Participants then
mirror the status of the team they hold.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _winner_of(fx: Dict[str, Any]) -> Optional[str]:
    """Return HOME / AWAY / DRAW / None for a fixture.

    Prefer the provider's explicit winner (which accounts for extra-time and
    penalty sh-out outcomes); fall back to the full-time score for group games.
    """
    w = fx.get("winner")
    if w in ("HOME", "AWAY", "DRAW"):
        return w
    if fx.get("status") == "done":
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
    knockout_stages = {s for s in stage_ladder if s not in ("group", "winner")}
    codes = {t["code"] for t in teams}

    reached: Dict[str, str] = {c: "group" for c in codes}     # furthest stage seen
    eliminated: Dict[str, bool] = {c: False for c in codes}
    champion: Optional[str] = None

    # Group-stage points table (only finished group games count).
    grec: Dict[str, Dict[str, int]] = {
        c: {"Pts": 0, "GF": 0, "GA": 0} for c in codes
    }

    knockout_fixtures_exist = any(
        f.get("stage") in knockout_stages for f in fixtures
    )

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
            if f.get("status") == "done" and score and None not in score:
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
        if f.get("stage") == "group" and f.get("status") == "done":
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
        if knockout_fixtures_exist:
            # Authoritative: anyone from a finished group who didn't make a
            # knockout fixture is out (covers the best-thirds cut exactly).
            for c in members:
                if reached[c] == "group":
                    eliminated[c] = True
        else:
            # Provisional gap (group done, knockouts not drawn yet): only the
            # bottom team is certainly gone. 3rd may still be a "best third".
            ranked = sorted(
                members,
                key=lambda c: (
                    grec[c]["Pts"],
                    grec[c]["GF"] - grec[c]["GA"],
                    grec[c]["GF"],
                ),
                reverse=True,
            )
            for c in ranked[3:]:
                eliminated[c] = True

    out: List[Dict[str, Any]] = []
    for t in teams:
        c = t["code"]
        stage = "winner" if champion == c else reached[c]
        nt = dict(t)
        nt["stage"] = stage
        nt["alive"] = not eliminated[c]
        nt["rounds"] = ladder_index.get(stage, 0)
        out.append(nt)
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
