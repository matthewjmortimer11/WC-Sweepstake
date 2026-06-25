"""Unit tests for the third-place qualification scenario engine.

These exercise the pure maths only (no FastAPI, no DB, no network). The Group C
scenario mirrors the real config: Scotland on 3 pts, −3 GD, 1 GF, alongside
Brazil, Morocco and Haiti.
"""

import pytest

from qualification import engine
from qualification.engine import (
    Fixture,
    Team,
    build_group_tables,
    calculate_what_target_needs,
    get_target_team_status,
    get_third_placed_teams,
    rank_third_placed_teams,
    simulate_fixture_outcome,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _done(fid, group, home, away, hg, ag, status="done"):
    return Fixture(id=fid, home=home, away=away, status=status, group=group,
                   home_goals=hg, away_goals=ag, stage="group")


def _upcoming(fid, group, home, away):
    return Fixture(id=fid, home=home, away=away, status="upcoming", group=group, stage="group")


def _fx_done(home, away, hg, ag, group="A"):
    """Completed group game in ``group`` (id derived from the teams)."""
    return Fixture(id=f"{home}-{away}", home=home, away=away, status="done",
                   group=group, home_goals=hg, away_goals=ag, stage="group")


def _four(group, codes, fair_play=None):
    fair_play = fair_play or {}
    return [Team(id=c, name=c, group=group, fair_play=fair_play.get(c)) for c in codes]


def _third_standing(team_id, group, points, gd, gf, fair_play=None):
    return engine.ThirdPlaceStanding(
        team_id=team_id, group=group, points=points,
        goal_difference=gd, goals_for=gf, fair_play=fair_play,
    )


# A completed Group C that lands Scotland third on 3 pts, −3 GD, 1 GF.
#   Brazil    : beat everyone        → 9 pts
#   Morocco   : 2nd                  → 6 pts (loses only to Brazil)
#   Scotland  : beat Haiti, lost rest→ 3 pts, GF 1, GA 4 → −3, GF 1
#   Haiti     : lost everything      → 0 pts
def _group_c_complete():
    teams = _four("C", ["BRA", "MAR", "SCO", "HAI"])
    fixtures = [
        _done("c1", "C", "BRA", "MAR", 1, 0),   # BRA beats MAR
        _done("c2", "C", "BRA", "SCO", 2, 0),   # BRA beats SCO
        _done("c3", "C", "BRA", "HAI", 3, 0),   # BRA beats HAI
        _done("c4", "C", "MAR", "SCO", 2, 0),   # MAR beats SCO
        _done("c5", "C", "MAR", "HAI", 2, 0),   # MAR beats HAI
        _done("c6", "C", "SCO", "HAI", 1, 0),   # SCO beats HAI  → SCO: 3pts, GF1 GA4
    ]
    return teams, fixtures


# ── Group table recompute ────────────────────────────────────────────────────

def test_group_table_recomputed_from_results():
    teams, fixtures = _group_c_complete()
    tables = build_group_tables(teams, fixtures)
    rows = {r.team_id: r for r in tables["C"]}
    assert rows["BRA"].rank == 1 and rows["BRA"].points == 9
    assert rows["MAR"].rank == 2 and rows["MAR"].points == 6
    assert rows["SCO"].rank == 3 and rows["SCO"].points == 3
    assert rows["SCO"].goal_difference == -3 and rows["SCO"].goals_for == 1
    assert rows["HAI"].rank == 4 and rows["HAI"].points == 0


# ── Third-place ranking ──────────────────────────────────────────────────────

def test_head_to_head_breaks_group_tie_over_id_fallback():
    """Two teams level on points, GD and goals scored are separated by their
    head-to-head result — not by the alphabetical fallback.

    'ZED' and 'ABE' finish identical overall (6 pts, +1 GD, 5 GF), but ZED beat
    ABE. ZED must rank above ABE, even though the id fallback alone would put
    ABE first.
    """
    teams = _four("A", ["ZED", "ABE", "MID", "LOW"])
    fixtures = [
        _fx_done("ZED", "ABE", 2, 1),   # ZED win the head-to-head
        _fx_done("MID", "ZED", 2, 1),   # ZED lose to MID
        _fx_done("ZED", "LOW", 2, 1),
        _fx_done("ABE", "MID", 2, 1),
        _fx_done("ABE", "LOW", 2, 1),
        _fx_done("MID", "LOW", 1, 1),
    ]
    tables = build_group_tables(teams, fixtures)
    rows = {r.team_id: r for r in tables["A"]}
    # identical overall
    assert (rows["ZED"].points, rows["ZED"].goal_difference, rows["ZED"].goals_for) == (6, 1, 5)
    assert (rows["ABE"].points, rows["ABE"].goal_difference, rows["ABE"].goals_for) == (6, 1, 5)
    # head-to-head puts ZED above ABE
    assert rows["ZED"].rank == 1
    assert rows["ABE"].rank == 2


def test_head_to_head_decides_who_is_third():
    """Head-to-head can change which team is third — and therefore who enters the
    best-thirds race. MIDX and MIDY are level overall (4 pts, 0 GD, 2 GF), but
    MIDY beat MIDX, so MIDY is runner-up and MIDX is the third-placed team.

    The id fallback alone would (wrongly) put MIDX above MIDY, so this only comes
    out right if head-to-head is applied.
    """
    teams = _four("A", ["TOP", "MIDX", "MIDY", "BOT"])
    fixtures = [
        _fx_done("MIDY", "MIDX", 1, 0),   # head-to-head: MIDY beat MIDX
        _fx_done("TOP", "MIDY", 1, 0),
        _fx_done("TOP", "MIDX", 1, 1),
        _fx_done("MIDX", "BOT", 1, 0),
        _fx_done("MIDY", "BOT", 1, 1),
        _fx_done("TOP", "BOT", 1, 0),
    ]
    tables = build_group_tables(teams, fixtures)
    rows = {r.team_id: r for r in tables["A"]}
    # MIDX and MIDY level on points/GD/GF
    assert (rows["MIDX"].points, rows["MIDX"].goal_difference, rows["MIDX"].goals_for) == (4, 0, 2)
    assert (rows["MIDY"].points, rows["MIDY"].goal_difference, rows["MIDY"].goals_for) == (4, 0, 2)
    assert rows["MIDY"].rank == 2          # won the head-to-head → runner-up
    assert rows["MIDX"].rank == 3          # third-placed team
    thirds = [t.team_id for t in get_third_placed_teams(tables)]
    assert thirds == ["MIDX"]


def test_third_place_ranking_by_points():
    thirds = [
        _third_standing("AAA", "A", points=4, gd=0, gf=2),
        _third_standing("BBB", "B", points=3, gd=5, gf=9),
        _third_standing("CCC", "C", points=6, gd=1, gf=3),
    ]
    ranked = rank_third_placed_teams(thirds, cutoff=8)
    assert [t.team_id for t in ranked] == ["CCC", "AAA", "BBB"]
    assert all(t.qualifies for t in ranked)            # only three, all inside top 8


def test_third_place_goal_difference_tiebreak():
    # Equal points → higher goal difference ranks above.
    thirds = [
        _third_standing("LOWGD", "A", points=3, gd=0, gf=5),
        _third_standing("HIGD", "B", points=3, gd=4, gf=5),
    ]
    ranked = rank_third_placed_teams(thirds, cutoff=8)
    assert [t.team_id for t in ranked] == ["HIGD", "LOWGD"]


def test_third_place_goals_scored_tiebreak():
    # Equal points and GD → more goals scored ranks above.
    thirds = [
        _third_standing("FEWGOALS", "A", points=3, gd=1, gf=2),
        _third_standing("MANYGOALS", "B", points=3, gd=1, gf=7),
    ]
    ranked = rank_third_placed_teams(thirds, cutoff=8)
    assert [t.team_id for t in ranked] == ["MANYGOALS", "FEWGOALS"]


def test_cutoff_marks_only_top_eight():
    thirds = [_third_standing(f"G{i}", chr(65 + i), points=12 - i, gd=0, gf=0) for i in range(12)]
    ranked = rank_third_placed_teams(thirds, cutoff=8)
    qualifying = [t.team_id for t in ranked if t.qualifies]
    assert len(qualifying) == 8
    assert ranked[7].qualifies is True
    assert ranked[8].qualifies is False


# ── Missing fair-play data ───────────────────────────────────────────────────

def test_missing_fair_play_falls_back_without_crashing():
    # Identical points/GD/GF; one team missing fair-play. Must not crash and must
    # fall through to the deterministic alphabetical fallback.
    thirds = [
        _third_standing("ZED", "A", points=3, gd=0, gf=2, fair_play=None),
        _third_standing("ABE", "B", points=3, gd=0, gf=2, fair_play=None),
    ]
    ranked = rank_third_placed_teams(thirds, cutoff=8)
    assert [t.team_id for t in ranked] == ["ABE", "ZED"]


def test_fair_play_used_only_when_both_present():
    # When both have fair-play, the cleaner (lower) record ranks above; the
    # alphabetical fallback would have ordered them the other way.
    thirds = [
        _third_standing("ZED", "A", points=3, gd=0, gf=2, fair_play=1),
        _third_standing("ABE", "B", points=3, gd=0, gf=2, fair_play=4),
    ]
    ranked = rank_third_placed_teams(thirds, cutoff=8)
    assert [t.team_id for t in ranked] == ["ZED", "ABE"]


# ── Target status ────────────────────────────────────────────────────────────

def test_target_status_third_in_when_inside_cutoff():
    teams, fixtures = _group_c_complete()
    # Scotland is the only third-placed team in this isolated group → rank 1 of
    # thirds → comfortably inside the top 8.
    status = get_target_team_status(teams, fixtures, target_team_id="SCO")
    assert status.group_rank == 3
    assert status.third_place_rank == 1
    assert status.qualified is True
    assert status.status == "third_in"


def test_target_status_third_out_when_below_cutoff():
    # Build Scotland as a weak third plus eight stronger thirds → 9th best → out.
    teams, fixtures = _group_c_complete()
    extra_teams = []
    extra_fixtures = []
    for i in range(8):
        g = chr(ord("D") + i)
        codes = [f"{g}W", f"{g}R", f"{g}T", f"{g}B"]   # winner, runner, third, bottom
        extra_teams += _four(g, codes)
        # Third-placed team here gets 4 points (strong third) — better than SCO's 3.
        extra_fixtures += [
            _done(f"{g}1", g, codes[0], codes[3], 3, 0),
            _done(f"{g}2", g, codes[0], codes[1], 1, 0),
            _done(f"{g}3", g, codes[0], codes[2], 1, 0),
            _done(f"{g}4", g, codes[1], codes[2], 1, 1),
            _done(f"{g}5", g, codes[1], codes[3], 1, 0),
            _done(f"{g}6", g, codes[2], codes[3], 2, 0),  # third: 4 pts, +2 GD
        ]
    status = get_target_team_status(
        teams + extra_teams, fixtures + extra_fixtures, target_team_id="SCO"
    )
    assert status.group_rank == 3
    assert status.third_place_rank == 9
    assert status.qualified is False
    assert status.status == "third_out"


# ── Scenario: draw helps ─────────────────────────────────────────────────────

def test_draw_helps_case():
    """A draw (or rival loss) keeps Scotland in; a rival win knocks them out.

    Group C done with Scotland third (3 pts). Group D's third-place team DY sits
    on 1 pt with one game left. Any DY win lifts it above Scotland on points and
    bumps Scotland out of the single qualifying slot (cutoff = 1); a draw or a
    DY defeat leaves Scotland through. So Scotland 'need DY to avoid winning' —
    a draw is good enough.
    """
    teams_c, fixtures_c = _group_c_complete()
    teams_d = _four("D", ["DW", "DX", "DY", "DB"])
    fixtures_d = [
        _done("d1", "D", "DW", "DX", 0, 0),
        _done("d2", "D", "DX", "DB", 3, 0),
        _done("d3", "D", "DW", "DB", 3, 0),
        _done("d4", "D", "DX", "DY", 2, 0),   # DY lose 0-2
        _done("d5", "D", "DY", "DB", 1, 1),   # DY draw → 1 pt, GD −2, GF 1
        _upcoming("d6", "D", "DY", "DW"),     # DY's last game
    ]
    teams = teams_c + teams_d
    fixtures = fixtures_c + fixtures_d

    reqs = calculate_what_target_needs(teams, fixtures, target_team_id="SCO", cutoff=1)
    decider = [r for r in reqs if r.fixture_id == "d6"]
    assert decider, "DY's last game should be flagged as relevant"
    assert decider[0].band.kind == "avoid_win"
    assert "must not win" in decider[0].text.lower()

    # Concretely: a draw keeps Scotland in; a DY win knocks them out.
    drawn = simulate_fixture_outcome(fixtures, "d6", 1, 1)
    won = simulate_fixture_outcome(fixtures, "d6", 1, 0)
    assert get_target_team_status(teams, drawn, "SCO", cutoff=1).qualified is True
    assert get_target_team_status(teams, won, "SCO", cutoff=1).qualified is False


# ── Scenario: narrow win helps but big win hurts ─────────────────────────────

def test_narrow_win_helps_but_big_win_hurts_case():
    """A rival can win small without overtaking Scotland on GD, but a big win
    flips the goal-difference tie-break and knocks Scotland out → 'must not win
    by N+'."""
    teams_c, fixtures_c = _group_c_complete()   # SCO third: 3 pts, −3 GD, GF 1
    # Group D: DX and DW are safely through (top two); DY is D's third-place team
    # on 0 pts with a dreadful GD. DY's last game is against group-winner DW, so
    # the opponent can never become a third-place rival. A small DY win leaves
    # its GD below Scotland's (Scotland stay in); a 2+ goal win lifts DY's GD to
    # or above Scotland's and bumps them out → "DY must not win by 2+".
    teams_d = _four("D", ["DW", "DX", "DY", "DB"])
    fixtures_d = [
        _done("d1", "D", "DW", "DX", 0, 0),
        _done("d2", "D", "DX", "DB", 3, 0),
        _done("d3", "D", "DW", "DB", 3, 0),
        _done("d4", "D", "DX", "DY", 3, 0),    # DY lose 0-3
        _done("d5", "D", "DB", "DY", 2, 0),    # DY lose 0-2 → 0 pts, GD −5, GF 0
        _upcoming("d6", "D", "DY", "DW"),      # DY can reach 3 pts (= SCO) here
    ]
    teams = teams_c + teams_d
    fixtures = fixtures_c + fixtures_d

    reqs = calculate_what_target_needs(teams, fixtures, target_team_id="SCO", cutoff=1)
    decider = [r for r in reqs if r.fixture_id == "d6"]
    assert decider, "DY's final game should be relevant to Scotland"
    band = decider[0].band
    assert band.kind == "not_win_by"
    assert band.k == 2
    assert "must not win by 2+" in decider[0].text.lower()

    # A 1-0 DY win keeps Scotland in; a 2-0 win knocks them out.
    narrow = simulate_fixture_outcome(fixtures, "d6", 1, 0)
    big = simulate_fixture_outcome(fixtures, "d6", 2, 0)
    assert get_target_team_status(teams, narrow, "SCO", cutoff=1).qualified is True
    assert get_target_team_status(teams, big, "SCO", cutoff=1).qualified is False


# ── Scenario: no longer matters ──────────────────────────────────────────────

def test_no_longer_matters_case():
    """Once Scotland are mathematically through (group winners), no remaining
    fixture changes anything → empty checklist / 'any result works'."""
    teams = _four("C", ["SCO", "BRA", "MAR", "HAI"])
    fixtures = [
        _done("c1", "C", "SCO", "BRA", 1, 0),
        _done("c2", "C", "SCO", "MAR", 1, 0),
        _done("c3", "C", "SCO", "HAI", 1, 0),   # SCO 9 pts → group winners
        _done("c4", "C", "BRA", "MAR", 1, 0),
        _done("c5", "C", "BRA", "HAI", 1, 0),
        _upcoming("c6", "C", "MAR", "HAI"),     # dead rubber for Scotland
    ]
    status = get_target_team_status(teams, fixtures, target_team_id="SCO")
    assert status.qualified is True
    assert status.status == "qualified"
    reqs = calculate_what_target_needs(teams, fixtures, target_team_id="SCO")
    assert reqs == []


# ── Live score flips qualification ───────────────────────────────────────────

def test_live_score_flips_qualification_status():
    """A live scoreline counts as the current result, so it can flip the target
    in or out in real time."""
    teams_c, fixtures_c = _group_c_complete()    # SCO third, 3 pts, −3, GF 1
    # Rival group D where third-placed DY hosts group-winner DW in a LIVE game.
    teams_d = _four("D", ["DW", "DX", "DY", "DB"])
    base_d = [
        _done("d1", "D", "DW", "DX", 0, 0),
        _done("d2", "D", "DX", "DB", 3, 0),
        _done("d3", "D", "DW", "DB", 3, 0),
        _done("d4", "D", "DX", "DY", 3, 0),
        _done("d5", "D", "DB", "DY", 2, 0),      # DY 0 pts, GD −5
    ]
    teams = teams_c + teams_d

    def _live(hg, ag):
        return base_d + [Fixture(id="d6", home="DY", away="DW", status="live",
                                 group="D", home_goals=hg, away_goals=ag, stage="group")]

    # Live 0–0: DY still below Scotland → Scotland provisionally IN.
    status_drawing = get_target_team_status(teams, fixtures_c + _live(0, 0),
                                            target_team_id="SCO", cutoff=1)
    # Live 2–0 to DY: DY jumps Scotland on the GD tie-break → Scotland OUT, live.
    status_winning = get_target_team_status(teams, fixtures_c + _live(2, 0),
                                            target_team_id="SCO", cutoff=1)
    assert status_drawing.qualified is True
    assert status_winning.qualified is False
    assert status_drawing.status != status_winning.status


# ── simulate_fixture_outcome purity ──────────────────────────────────────────

def test_third_out_does_not_list_unhelpful_fixtures():
    """A team just outside the cut must not get a checklist of 'no result helps'
    lines — fixtures that can't single-handedly help are dropped, not listed."""
    teams, fixtures = _group_c_complete()           # SCO third, 3 pts
    # Eight stronger thirds (4 pts each) push Scotland to 9th, plus a pending
    # dead-rubber in each of those groups that cannot rescue Scotland alone.
    for i in range(8):
        g = chr(ord("D") + i)
        codes = [f"{g}W", f"{g}R", f"{g}T", f"{g}B"]
        teams += _four(g, codes)
        fixtures += [
            _done(f"{g}1", g, codes[0], codes[3], 3, 0),
            _done(f"{g}2", g, codes[0], codes[1], 1, 0),
            _done(f"{g}3", g, codes[0], codes[2], 1, 0),
            _done(f"{g}4", g, codes[1], codes[2], 1, 1),
            _done(f"{g}5", g, codes[1], codes[3], 1, 0),
            _done(f"{g}6", g, codes[2], codes[3], 2, 0),  # third on 4 pts
            _upcoming(f"{g}p", g, codes[0], codes[1]),    # cannot help Scotland alone
        ]
    status = get_target_team_status(teams, fixtures, "SCO")
    assert status.status == "third_out"
    reqs = calculate_what_target_needs(teams, fixtures, "SCO")
    assert all(r.band.kind != "none" for r in reqs)
    assert not any("no realistic result" in r.text.lower() for r in reqs)


def test_simulate_fixture_outcome_is_pure():
    teams, fixtures = _group_c_complete()
    upcoming = fixtures[:-1] + [_upcoming("c6", "C", "SCO", "HAI")]
    simulated = simulate_fixture_outcome(upcoming, "c6", 5, 0)
    # original untouched
    assert upcoming[-1].home_goals is None
    # simulated reflects the new score
    sim_fx = next(f for f in simulated if f.id == "c6")
    assert sim_fx.home_goals == 5 and sim_fx.status == "done"


def test_target_team_must_exist():
    teams, fixtures = _group_c_complete()
    with pytest.raises(ValueError):
        get_target_team_status(teams, fixtures, target_team_id="NOPE")


# ── Band collapse vocabulary (direct, deterministic) ─────────────────────────

def _grid_from_margin(predicate):
    """Build an 81-cell scoreline grid whose truth depends only on the margin."""
    return {
        (hg, ag): predicate(hg - ag)
        for hg in range(engine.MIN_GOALS, engine.MAX_GOALS + 1)
        for ag in range(engine.MIN_GOALS, engine.MAX_GOALS + 1)
    }


@pytest.mark.parametrize(
    "predicate, expected_kind, expected_k, phrase",
    [
        (lambda m: True,            "any",          None, "any result works"),
        (lambda m: False,           "none",         None, "no realistic result helps"),
        (lambda m: m >= 0,          "avoid_defeat", None, "avoid defeat"),
        (lambda m: m >= 1,          "win",          None, "to win"),
        (lambda m: m >= 2,          "win_by",       2,    "win by 2+"),
        (lambda m: m == 0,          "draw_only",    None, "draw"),
        (lambda m: m <= 0,          "avoid_win",    None, "must not win"),
        (lambda m: m <= 3,          "not_win_by",   4,    "must not win by 4+"),
        (lambda m: m <= -1,         "lose",         None, "to lose"),
    ],
)
def test_band_collapse_vocabulary(predicate, expected_kind, expected_k, phrase):
    band = engine._collapse_band(_grid_from_margin(predicate))
    assert band.kind == expected_kind
    if expected_k is not None:
        assert band.k == expected_k
    assert phrase in engine.explain_requirement(band, "Brazil", "Haiti").lower()


def test_band_collapse_bounded_interval():
    # Helpful only on a narrow home win (1–3): both a draw and a big win hurt.
    band = engine._collapse_band(_grid_from_margin(lambda m: 1 <= m <= 3))
    assert band.kind == "interval"
    assert band.lo == 1 and band.hi == 3
    assert "win by 1–3" in engine.explain_requirement(band, "Brazil", "Haiti").lower()


def test_band_goal_dependent_flag_when_same_margin_disagrees():
    # Qualify on any 1-goal home win EXCEPT the high-scoring 8–7; a goals-scored
    # tie-break swing → flagged goal_dependent so the wording can hedge.
    grid = _grid_from_margin(lambda m: m == 1)
    grid[(8, 7)] = False
    band = engine._collapse_band(grid)
    assert band.goal_dependent is True
