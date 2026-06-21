"""
Cipher — core game logic.

Pure, framework-free game state. The :class:`Game` object knows nothing about
WebSockets, HTTP or storage; it is fully deterministic given a random seed and
is therefore easy to unit-test. The networking layer (``manager.py``) owns the
players, broadcasts and timers and drives this object through validated moves.

Game model (a customisable take on the classic hidden-role word game):

* Two teams, RED and BLUE.
* An N×N board of word cards. Cards are secretly typed RED / BLUE / NEUTRAL /
  ASSASSIN. The starting team gets one extra agent.
* Each team has a SPYMASTER (sees the key) and any number of OPERATIVES.
* On a team's turn the spymaster gives a one-word clue + a count. Operatives then
  reveal cards. Hitting your own colour lets you keep guessing (up to count + 1);
  a neutral or the enemy colour ends the turn; the ASSASSIN loses the game
  instantly.
* First team to reveal all of its agents wins.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

RED = "red"
BLUE = "blue"
NEUTRAL = "neutral"
ASSASSIN = "assassin"

# Phases within a turn.
PHASE_CLUE = "clue"     # waiting for the active spymaster to give a clue
PHASE_GUESS = "guess"   # operatives are revealing cards

# Game lifecycle.
STATUS_LOBBY = "lobby"
STATUS_PLAYING = "playing"
STATUS_ENDED = "ended"


class MoveError(Exception):
    """A rejected move. The message is safe to surface to the client."""


@dataclass
class Card:
    word: str
    kind: str                      # RED | BLUE | NEUTRAL | ASSASSIN
    revealed: bool = False
    revealed_by_team: Optional[str] = None


@dataclass
class Settings:
    board_size: int = 5            # N for an N×N grid (4–6)
    pack_id: str = "classic"
    custom_words: Optional[list[str]] = None
    turn_seconds: int = 0          # 0 = no timer
    assassins: int = 1
    pack_name: str = "Classic"


def _distribution(total: int, assassins: int) -> tuple[int, int, int, int]:
    """Return (starting, second, neutral, assassins) agent counts.

    Generalises the classic 9/8/7/1 (for 25 cards) to any board size: the field
    is split roughly into thirds with the starting team given one extra agent.
    """
    assassins = max(1, min(assassins, max(1, total - 4)))
    field = total - assassins
    base = field // 3
    starting = base + 1
    second = base
    neutral = field - starting - second
    return starting, second, neutral, assassins


@dataclass
class Game:
    settings: Settings = field(default_factory=Settings)
    cards: list[Card] = field(default_factory=list)
    status: str = STATUS_LOBBY
    starting_team: str = RED
    current_team: str = RED
    phase: str = PHASE_CLUE
    clue_word: Optional[str] = None
    clue_count: int = 0            # 0 means "unlimited" (∞)
    guesses_left: int = 0          # remaining guesses this clue (large = unlimited)
    winner: Optional[str] = None
    win_reason: Optional[str] = None
    log: list[dict] = field(default_factory=list)
    turn_deadline: Optional[float] = None   # epoch seconds, or None when off
    round_no: int = 0
    _rng_seed: Optional[int] = None

    # ── board construction ────────────────────────────────────────────────────
    def new_round(self, words_pool: list[str], seed: Optional[int] = None) -> None:
        """Deal a fresh board and start a new round."""
        n = self.settings.board_size
        total = n * n
        rng = random.Random(seed)
        self._rng_seed = seed

        pool = [w for w in dict.fromkeys(w.strip() for w in words_pool) if w]
        if len(pool) < total:
            raise MoveError(
                f"Need at least {total} unique words for a {n}×{n} board "
                f"(got {len(pool)})."
            )
        chosen = rng.sample(pool, total)

        # Alternate the starting team each round so neither side is always +1.
        self.starting_team = RED if self.round_no % 2 == 0 else BLUE
        other = BLUE if self.starting_team == RED else RED

        start_n, second_n, neutral_n, assassin_n = _distribution(
            total, self.settings.assassins
        )
        kinds = (
            [self.starting_team] * start_n
            + [other] * second_n
            + [NEUTRAL] * neutral_n
            + [ASSASSIN] * assassin_n
        )
        rng.shuffle(kinds)

        self.cards = [Card(word=w, kind=k) for w, k in zip(chosen, kinds)]
        self.status = STATUS_PLAYING
        self.current_team = self.starting_team
        self.phase = PHASE_CLUE
        self.clue_word = None
        self.clue_count = 0
        self.guesses_left = 0
        self.winner = None
        self.win_reason = None
        self.round_no += 1
        self.turn_deadline = None
        self.log = [{
            "t": "round", "team": self.starting_team,
            "text": f"New round dealt — {self._team_label(self.starting_team)} starts.",
            "ts": time.time(),
        }]
        self._arm_timer()

    # ── score helpers ─────────────────────────────────────────────────────────
    def remaining(self, team: str) -> int:
        return sum(1 for c in self.cards if c.kind == team and not c.revealed)

    def total_for(self, team: str) -> int:
        return sum(1 for c in self.cards if c.kind == team)

    def _team_label(self, team: str) -> str:
        return "Red" if team == RED else "Blue"

    def _other(self, team: str) -> str:
        return BLUE if team == RED else RED

    # ── timer ─────────────────────────────────────────────────────────────────
    def _arm_timer(self) -> None:
        if self.status == STATUS_PLAYING and self.settings.turn_seconds > 0:
            self.turn_deadline = time.time() + self.settings.turn_seconds
        else:
            self.turn_deadline = None

    def time_expired(self, now: Optional[float] = None) -> bool:
        if self.turn_deadline is None or self.status != STATUS_PLAYING:
            return False
        return (now or time.time()) >= self.turn_deadline

    def on_timeout(self) -> None:
        """Called by the server loop when a turn timer runs out."""
        if self.status != STATUS_PLAYING:
            return
        if self.phase == PHASE_CLUE:
            self._end_turn(reason="The spymaster ran out of time.")
        else:
            self._end_turn(reason="The clock ran out.")

    # ── moves ─────────────────────────────────────────────────────────────────
    def give_clue(self, team: str, word: str, count: int) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("The game isn't in play.")
        if team != self.current_team:
            raise MoveError("It isn't your team's turn.")
        if self.phase != PHASE_CLUE:
            raise MoveError("A clue has already been given this turn.")
        word = (word or "").strip()
        if not word:
            raise MoveError("Enter a clue word.")
        if len(word) > 40:
            raise MoveError("That clue is too long.")
        if " " in word and self.settings.pack_id != "emoji":
            raise MoveError("Clues must be a single word.")
        if count < 0 or count > 9:
            raise MoveError("Pick a number from 0 to 9.")

        self.clue_word = word
        self.clue_count = count
        # count + 1 guesses allowed; 0 (∞) means up to every remaining card.
        self.guesses_left = (count + 1) if count > 0 else 99
        self.phase = PHASE_GUESS
        self.log.append({
            "t": "clue", "team": team, "word": word, "count": count,
            "text": f"{self._team_label(team)} spymaster: “{word}” "
                    f"({'∞' if count == 0 else count})",
            "ts": time.time(),
        })
        self._arm_timer()

    def guess(self, team: str, index: int) -> dict:
        """Reveal a card. Returns an event dict describing what happened."""
        if self.status != STATUS_PLAYING:
            raise MoveError("The game isn't in play.")
        if team != self.current_team:
            raise MoveError("It isn't your team's turn.")
        if self.phase != PHASE_GUESS:
            raise MoveError("Wait for your spymaster's clue.")
        if index < 0 or index >= len(self.cards):
            raise MoveError("That card doesn't exist.")
        card = self.cards[index]
        if card.revealed:
            raise MoveError("That card is already revealed.")

        card.revealed = True
        card.revealed_by_team = team
        event = {"t": "guess", "team": team, "index": index,
                 "word": card.word, "kind": card.kind, "ts": time.time()}

        if card.kind == ASSASSIN:
            self._end_game(self._other(team), reason="assassin")
            event["result"] = "assassin"
            event["text"] = (f"💀 {self._team_label(team)} hit the assassin "
                             f"on “{card.word}”!")
            self.log.append(event)
            return event

        if card.kind == team:
            event["result"] = "hit"
            event["text"] = f"{self._team_label(team)} got “{card.word}”. ✓"
            self.log.append(event)
            if self.remaining(team) == 0:
                self._end_game(team, reason="cleared")
                return event
            self.guesses_left -= 1
            if self.guesses_left <= 0:
                self._end_turn(reason="Out of guesses.")
            # NB: the guess-phase timer keeps running across guesses; it is only
            # (re)armed on a phase change, not on each correct card.
            return event

        # A neutral or the enemy's card — turn ends.
        if card.kind == NEUTRAL:
            event["result"] = "neutral"
            event["text"] = f"“{card.word}” was a bystander. Turn over."
        else:
            event["result"] = "wrong"
            event["text"] = (f"“{card.word}” belonged to "
                             f"{self._team_label(card.kind)}!")
            # The card counts for the other team and may even win it for them.
            if self.remaining(card.kind) == 0:
                self.log.append(event)
                self._end_game(card.kind, reason="cleared")
                return event
        self.log.append(event)
        self._end_turn(reason=None)
        return event

    def end_turn(self, team: str) -> None:
        """Operatives choosing to stop guessing ('pass')."""
        if self.status != STATUS_PLAYING:
            raise MoveError("The game isn't in play.")
        if team != self.current_team:
            raise MoveError("It isn't your team's turn.")
        if self.phase != PHASE_GUESS:
            raise MoveError("There's nothing to pass on yet.")
        self._end_turn(reason="passed")

    def _end_turn(self, reason: Optional[str]) -> None:
        prev = self.current_team
        self.current_team = self._other(self.current_team)
        self.phase = PHASE_CLUE
        self.clue_word = None
        self.clue_count = 0
        self.guesses_left = 0
        if reason == "passed":
            text = f"{self._team_label(prev)} passed. Over to " \
                   f"{self._team_label(self.current_team)}."
        elif reason:
            text = reason + f" {self._team_label(self.current_team)}'s turn."
        else:
            text = f"{self._team_label(self.current_team)}'s turn."
        self.log.append({"t": "turn", "team": self.current_team,
                         "text": text, "ts": time.time()})
        self._arm_timer()

    def _end_game(self, winner: str, reason: str) -> None:
        self.status = STATUS_ENDED
        self.winner = winner
        self.win_reason = reason
        self.turn_deadline = None
        # Reveal everything once the game is decided.
        for c in self.cards:
            if not c.revealed:
                c.revealed = True
        if reason == "assassin":
            text = f"💀 {self._team_label(winner)} wins — the enemy struck the assassin!"
        else:
            text = f"🏆 {self._team_label(winner)} wins — all agents found!"
        self.log.append({"t": "end", "team": winner, "text": text, "ts": time.time()})

    # ── serialisation ─────────────────────────────────────────────────────────
    def view(self, reveal_key: bool) -> dict:
        """A board view. ``reveal_key`` exposes hidden card kinds (spymasters /
        ended games); otherwise unrevealed cards report kind ``"hidden"``."""
        show_all = reveal_key or self.status == STATUS_ENDED
        cards = []
        for i, c in enumerate(self.cards):
            kind = c.kind if (c.revealed or show_all) else "hidden"
            cards.append({
                "i": i, "word": c.word, "kind": kind,
                "revealed": c.revealed, "by": c.revealed_by_team,
            })
        deadline_ms = int(self.turn_deadline * 1000) if self.turn_deadline else None
        return {
            "status": self.status,
            "board_size": self.settings.board_size,
            "cards": cards,
            "startingTeam": self.starting_team,
            "currentTeam": self.current_team,
            "phase": self.phase,
            "clue": {"word": self.clue_word, "count": self.clue_count}
            if self.clue_word else None,
            "guessesLeft": None if self.guesses_left >= 99 else max(0, self.guesses_left),
            "winner": self.winner,
            "winReason": self.win_reason,
            "remaining": {RED: self.remaining(RED), BLUE: self.remaining(BLUE)},
            "totals": {RED: self.total_for(RED), BLUE: self.total_for(BLUE)},
            "turnDeadline": deadline_ms,
            "turnSeconds": self.settings.turn_seconds,
            "round": self.round_no,
            "log": self.log[-40:],
        }
