"""Dial — core game logic (pure, framework-free)."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Optional

from .spectra import SPECTRA

MODE_TEAMS = "teams"
MODE_FFA = "ffa"

STATUS_LOBBY = "lobby"
STATUS_PLAYING = "playing"
STATUS_ENDED = "ended"

PHASE_PSYCHIC = "psychic"
PHASE_GUESS = "guess"
PHASE_REVEAL = "reveal"

TEAM_UNASSIGNED = "none"
TEAM_0 = "team0"
TEAM_1 = "team1"

ROLE_PSYCHIC = "psychic"
ROLE_GUESSER = "guesser"
ROLE_SPECTATOR = "spectator"

DEFAULT_TEAM_NAMES = ("Team 1", "Team 2")
ALLOWED_TARGET_SCORES = {10, 15, 20}


class MoveError(Exception):
    """A rejected move — message is safe for clients."""


def points_for(target: int, guess: int) -> int:
    d = abs(target - guess)
    if d <= 4:
        return 4
    if d <= 12:
        return 3
    if d <= 20:
        return 2
    return 0


def clean_team_name(name: str, fallback: str) -> str:
    name = (name or "").strip()
    name = " ".join(name.split())
    name = "".join(ch for ch in name if ch.isprintable())
    return (name[:18] or fallback)


@dataclass
class Settings:
    mode: str = MODE_TEAMS
    target_score: int = 10
    team_names: tuple[str, str] = DEFAULT_TEAM_NAMES


@dataclass
class DialGame:
    settings: Settings = field(default_factory=Settings)
    status: str = STATUS_LOBBY
    phase: str = PHASE_PSYCHIC
    spectrum: tuple[str, str] = ("Cold", "Hot")
    target: int = 50
    round_no: int = 0
    # teams mode
    active_team: int = 0
    psychic_id: Optional[str] = None
    team_scores: list[int] = field(default_factory=lambda: [0, 0])
    # per-player guesses this round: pid -> value (None until set)
    guesses: dict[str, int] = field(default_factory=dict)
    locked: dict[str, bool] = field(default_factory=dict)
    # ffa mode scores
    player_scores: dict[str, int] = field(default_factory=dict)
    round_points: dict[str, int] = field(default_factory=dict)
    winner: Optional[str] = None  # team index as "0"/"1" or player id in ffa
    psychic_order: list[str] = field(default_factory=list)
    psychic_index: int = 0

    def _rng_target(self, rng: random.Random) -> int:
        return 12 + rng.randint(0, 76)

    def _pick_spectrum(self, rng: random.Random) -> tuple[str, str]:
        return rng.choice(SPECTRA)

    def start_game(self, player_ids: list[str], rng: random.Random) -> None:
        if self.status == STATUS_PLAYING:
            raise MoveError("A game is already in progress.")
        if len(player_ids) < 2:
            raise MoveError("Need at least two players.")
        if self.settings.mode == MODE_TEAMS:
            self.team_scores = [0, 0]
        else:
            for pid in player_ids:
                self.player_scores.setdefault(pid, 0)
        self.psychic_order = list(player_ids)
        rng.shuffle(self.psychic_order)
        self.psychic_index = 0
        self.status = STATUS_PLAYING
        self.winner = None
        self._begin_round(rng)

    def _begin_round(self, rng: random.Random) -> None:
        self.round_no += 1
        self.spectrum = self._pick_spectrum(rng)
        self.target = self._rng_target(rng)
        self.guesses.clear()
        self.locked.clear()
        self.round_points.clear()
        self.phase = PHASE_PSYCHIC

        if self.settings.mode == MODE_TEAMS:
            self.active_team = (self.round_no - 1) % 2
            self.psychic_id = self._next_team_psychic(rng)
        else:
            if not self.psychic_order:
                raise MoveError("No players in rotation.")
            self.psychic_id = self.psychic_order[self.psychic_index % len(self.psychic_order)]
            self.psychic_index += 1

    def _next_team_psychic(self, rng: random.Random) -> str:
        # Caller supplies team members via manager; psychic_id set externally in teams mode.
        return self.psychic_id or ""

    def psychic_ready(self, pid: str) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PSYCHIC:
            raise MoveError("Not in the psychic phase.")
        if pid != self.psychic_id:
            raise MoveError("Only the Psychic can continue.")
        self.phase = PHASE_GUESS

    def set_guess(self, pid: str, value: int) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_GUESS:
            raise MoveError("Not in the guessing phase.")
        if pid == self.psychic_id:
            raise MoveError("The Psychic can't guess.")
        if self.locked.get(pid):
            raise MoveError("You've already locked in.")
        value = max(0, min(100, int(value)))
        self.guesses[pid] = value

    def lock_guess(self, pid: str) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_GUESS:
            raise MoveError("Not in the guessing phase.")
        if pid == self.psychic_id:
            raise MoveError("The Psychic can't guess.")
        if pid not in self.guesses:
            raise MoveError("Move the dial before locking in.")
        self.locked[pid] = True

    def all_guessers_locked(self, guesser_ids: list[str]) -> bool:
        if not guesser_ids:
            return True
        return all(self.locked.get(pid) for pid in guesser_ids)

    def score_round(self, guesser_ids: list[str]) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No round to score.")
        self.round_points.clear()
        if self.settings.mode == MODE_TEAMS:
            best = 0
            for pid in guesser_ids:
                if pid in self.guesses:
                    pts = points_for(self.target, self.guesses[pid])
                    self.round_points[pid] = pts
                    best = max(best, pts)
            self.team_scores[self.active_team] += best
        else:
            for pid in guesser_ids:
                if pid in self.guesses:
                    pts = points_for(self.target, self.guesses[pid])
                    self.round_points[pid] = pts
                    self.player_scores[pid] = self.player_scores.get(pid, 0) + pts
        self.phase = PHASE_REVEAL

    def next_round(self, rng: random.Random) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_REVEAL:
            raise MoveError("Finish the reveal first.")
        if self._check_winner():
            self.status = STATUS_ENDED
            return
        self._begin_round(rng)

    def _check_winner(self) -> bool:
        target = self.settings.target_score
        if self.settings.mode == MODE_TEAMS:
            a, b = self.team_scores
            if a >= target and a != b:
                self.winner = "0"
                return True
            if b >= target and b != a:
                self.winner = "1"
                return True
            return False
        leaders = [
            pid for pid, sc in self.player_scores.items()
            if sc >= target
        ]
        if not leaders:
            return False
        top = max(self.player_scores[pid] for pid in leaders)
        tied = [pid for pid in leaders if self.player_scores[pid] == top]
        if len(tied) == 1:
            self.winner = tied[0]
            return True
        return False

    def view(
        self,
        *,
        pid: str,
        show_target: bool = False,
        guesser_ids: Optional[list[str]] = None,
    ) -> dict:
        guesser_ids = guesser_ids or []
        out: dict = {
            "status": self.status,
            "phase": self.phase,
            "roundNo": self.round_no,
            "spectrum": list(self.spectrum),
            "mode": self.settings.mode,
            "targetScore": self.settings.target_score,
            "teamNames": list(self.settings.team_names),
            "psychicId": self.psychic_id,
            "activeTeam": self.active_team,
            "teamScores": list(self.team_scores),
            "playerScores": dict(self.player_scores),
            "winner": self.winner,
            "myGuess": self.guesses.get(pid),
            "myLocked": bool(self.locked.get(pid)),
        }
        if show_target:
            out["target"] = self.target
        if self.phase == PHASE_REVEAL:
            out["target"] = self.target
            out["guesses"] = {k: self.guesses[k] for k in guesser_ids if k in self.guesses}
            out["roundPoints"] = dict(self.round_points)
        elif self.phase == PHASE_GUESS:
            # Live teammate guesses only — filled by manager per viewer
            out["liveGuesses"] = {}
        return out
