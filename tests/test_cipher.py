"""Tests for the Cipher word-spy game (codenames module)."""

import pytest

from codenames.game import (
    ASSASSIN,
    BLUE,
    NEUTRAL,
    PHASE_CLUE,
    PHASE_GUESS,
    RED,
    STATUS_ENDED,
    STATUS_PLAYING,
    Game,
    MoveError,
    Settings,
    _distribution,
)
from codenames.words import PACKS, pack_meta, words_for


# ── word packs ──────────────────────────────────────────────────────────────
def test_every_pack_has_enough_words_for_largest_board():
    # The biggest supported board is 6×6 = 36 cards.
    for pid, pack in PACKS.items():
        unique = {w.strip() for w in pack["words"] if w.strip()}
        assert len(unique) >= 36, f"pack {pid} too small ({len(unique)})"


def test_pack_meta_shape():
    meta = pack_meta()
    assert {m["id"] for m in meta} == set(PACKS)
    for m in meta:
        assert m["count"] > 0


# ── distribution ─────────────────────────────────────────────────────────────
@pytest.mark.parametrize("total,assassins,expected", [
    (25, 1, (9, 8, 7, 1)),
    (16, 1, (6, 5, 4, 1)),
    (36, 1, (12, 11, 12, 1)),
])
def test_distribution_classic_ratios(total, assassins, expected):
    assert _distribution(total, assassins) == expected


def test_distribution_sums_to_total():
    for n in (4, 5, 6):
        for a in range(1, 6):
            start, second, neutral, ass = _distribution(n * n, a)
            assert start + second + neutral + ass == n * n
            assert start == second + 1  # starting team always +1


def test_distribution_five_assassins_on_classic_board():
    start, second, neutral, ass = _distribution(25, 5)
    assert (start, second, neutral, ass) == (7, 6, 7, 5)


# ── board dealing ────────────────────────────────────────────────────────────
def _new_game(size=5, seed=0):
    g = Game(settings=Settings(board_size=size))
    g.new_round(words_for("classic"), seed=seed)
    return g


def test_new_round_deals_correct_counts():
    g = _new_game()
    assert len(g.cards) == 25
    assert g.status == STATUS_PLAYING
    start = g.starting_team
    other = BLUE if start == RED else RED
    assert g.remaining(start) == 9
    assert g.remaining(other) == 8
    assert sum(1 for c in g.cards if c.kind == NEUTRAL) == 7
    assert sum(1 for c in g.cards if c.kind == ASSASSIN) == 1


def test_round_is_deterministic_with_seed():
    a = _new_game(seed=42)
    b = _new_game(seed=42)
    assert [c.word for c in a.cards] == [c.word for c in b.cards]
    assert [c.kind for c in a.cards] == [c.kind for c in b.cards]


def test_starting_team_alternates_each_round():
    g = _new_game(seed=1)
    first = g.starting_team
    g.new_round(words_for("classic"), seed=1)
    assert g.starting_team != first


def test_not_enough_words_raises():
    g = Game(settings=Settings(board_size=5))
    with pytest.raises(MoveError):
        g.new_round(["only", "three", "words"])


# ── clue + guess flow ────────────────────────────────────────────────────────
def test_clue_requires_active_spymaster_turn():
    g = _new_game()
    other = BLUE if g.current_team == RED else RED
    with pytest.raises(MoveError):
        g.give_clue(other, "ocean", 2)


def test_clue_must_be_single_word():
    g = _new_game()
    with pytest.raises(MoveError):
        g.give_clue(g.current_team, "two words", 2)


def test_clue_count_capped_at_nine():
    g = _new_game()
    with pytest.raises(MoveError, match="0 to 9"):
        g.give_clue(g.current_team, "ocean", 10)


def test_give_clue_sets_phase_and_guesses():
    g = _new_game()
    g.give_clue(g.current_team, "ocean", 2)
    assert g.phase == PHASE_GUESS
    assert g.clue_word == "ocean"
    assert g.guesses_left == 3  # count + 1


def test_correct_guess_keeps_turn_and_decrements_guesses():
    g = _new_game()
    team = g.current_team
    g.give_clue(team, "x", 2)
    idx = next(i for i, c in enumerate(g.cards) if c.kind == team)
    ev = g.guess(team, idx)
    assert ev["result"] == "hit"
    assert g.current_team == team           # still their turn
    assert g.guesses_left == 2


def test_neutral_guess_ends_turn():
    g = _new_game()
    team = g.current_team
    g.give_clue(team, "x", 3)
    idx = next(i for i, c in enumerate(g.cards) if c.kind == NEUTRAL)
    g.guess(team, idx)
    assert g.current_team != team
    assert g.phase == PHASE_CLUE


def test_guessing_enemy_card_ends_turn_and_helps_them():
    g = _new_game()
    team = g.current_team
    other = BLUE if team == RED else RED
    g.give_clue(team, "x", 3)
    before = g.remaining(other)
    idx = next(i for i, c in enumerate(g.cards) if c.kind == other)
    ev = g.guess(team, idx)
    assert ev["result"] == "wrong"
    assert g.remaining(other) == before - 1
    assert g.current_team == other


def test_assassin_loses_instantly():
    g = _new_game()
    team = g.current_team
    other = BLUE if team == RED else RED
    g.give_clue(team, "x", 3)
    idx = next(i for i, c in enumerate(g.cards) if c.kind == ASSASSIN)
    ev = g.guess(team, idx)
    assert ev["result"] == "assassin"
    assert g.status == STATUS_ENDED
    assert g.winner == other


def test_running_out_of_guesses_ends_turn():
    g = _new_game()
    team = g.current_team
    g.give_clue(team, "x", 1)  # 2 guesses allowed
    own = [i for i, c in enumerate(g.cards) if c.kind == team]
    g.guess(team, own[0])
    assert g.current_team == team
    g.guess(team, own[1])      # used the bonus guess
    assert g.current_team != team


def test_clearing_all_agents_wins():
    g = _new_game()
    team = g.current_team
    g.give_clue(team, "x", 0)  # unlimited
    for i, c in list(enumerate(g.cards)):
        if c.kind == team and not c.revealed:
            g.guess(team, i)
    assert g.status == STATUS_ENDED
    assert g.winner == team


def test_guessing_last_enemy_card_wins_for_them():
    g = _new_game(seed=5)
    team = g.current_team
    other = BLUE if team == RED else RED
    # Reveal all but one of the enemy's cards directly, then guess the last.
    enemy_idx = [i for i, c in enumerate(g.cards) if c.kind == other]
    for i in enemy_idx[:-1]:
        g.cards[i].revealed = True
    g.give_clue(team, "x", 3)
    g.guess(team, enemy_idx[-1])
    assert g.status == STATUS_ENDED
    assert g.winner == other


def test_cannot_guess_revealed_card():
    g = _new_game()
    team = g.current_team
    g.give_clue(team, "x", 3)
    idx = next(i for i, c in enumerate(g.cards) if c.kind == team)
    g.guess(team, idx)
    with pytest.raises(MoveError):
        g.guess(team, idx)


def test_pass_switches_turn():
    g = _new_game()
    team = g.current_team
    g.give_clue(team, "x", 2)
    g.end_turn(team)
    assert g.current_team != team
    assert g.phase == PHASE_CLUE


def test_cannot_clue_twice():
    g = _new_game()
    team = g.current_team
    g.give_clue(team, "x", 2)
    with pytest.raises(MoveError):
        g.give_clue(team, "y", 2)


# ── views (anti-cheat) ───────────────────────────────────────────────────────
def test_operative_view_hides_unrevealed_kinds():
    g = _new_game()
    view = g.view(reveal_key=False)
    hidden = [c for c in view["cards"] if not c["revealed"]]
    assert all(c["kind"] == "hidden" for c in hidden)


def test_spymaster_view_reveals_all_kinds():
    g = _new_game()
    view = g.view(reveal_key=True)
    assert all(c["kind"] != "hidden" for c in view["cards"])


def test_ended_game_reveals_to_everyone():
    g = _new_game()
    team = g.current_team
    g.give_clue(team, "x", 3)
    idx = next(i for i, c in enumerate(g.cards) if c.kind == ASSASSIN)
    g.guess(team, idx)
    view = g.view(reveal_key=False)
    assert all(c["kind"] != "hidden" for c in view["cards"])


def test_unlimited_clue_guesses_left_serialises_as_none():
    g = _new_game()
    g.give_clue(g.current_team, "x", 0)
    assert g.view(reveal_key=False)["guessesLeft"] is None


# ── timer ────────────────────────────────────────────────────────────────────
def test_guess_phase_timer_does_not_reset_on_each_correct_card():
    g = Game(settings=Settings(board_size=5, turn_seconds=60))
    g.new_round(words_for("classic"), seed=3)
    team = g.current_team
    g.give_clue(team, "x", 5)
    deadline_after_clue = g.turn_deadline
    assert deadline_after_clue is not None
    own = [i for i, c in enumerate(g.cards) if c.kind == team]
    g.guess(team, own[0])
    # The countdown must keep running from the clue, not restart per guess.
    assert g.turn_deadline == deadline_after_clue


def test_timeout_in_guess_phase_passes_turn():
    g = Game(settings=Settings(board_size=5, turn_seconds=30))
    g.new_round(words_for("classic"), seed=4)
    team = g.current_team
    g.give_clue(team, "x", 2)
    g.on_timeout()
    assert g.current_team != team
    assert g.phase == PHASE_CLUE


@pytest.mark.parametrize("raw,expected", [
    (0, 0), (-10, 0), (5, 15), (15, 15), (62, 60), (63, 65),
    (300, 300), (9999, 300),
])
def test_clamp_timer_snaps_and_clamps(raw, expected):
    from codenames.manager import clamp_timer
    assert clamp_timer(raw) == expected


def test_after_dark_pack_present_and_playable():
    assert "afterdark" in PACKS
    assert "bottomdrawer" in PACKS
    g = Game(settings=Settings(board_size=6, pack_id="afterdark"))
    g.new_round(words_for("afterdark"), seed=7)
    assert len(g.cards) == 36
    g2 = Game(settings=Settings(board_size=6, pack_id="bottomdrawer"))
    g2.new_round(words_for("bottomdrawer"), seed=7)
    assert len(g2.cards) == 36
