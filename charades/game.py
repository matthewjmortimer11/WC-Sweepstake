"""Charades — core game logic."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Optional

from imposter.celebs import CELEBS

STATUS_LOBBY = "lobby"
STATUS_PLAYING = "playing"
PHASE_CHARADE = "charade"
REQUIRED_PLAYERS = 4
TIMER_OPTIONS = {0, 30, 60, 90, 120}


class MoveError(Exception):
    """A rejected move — message is safe for clients."""


@dataclass
class Settings:
    timer_secs: int = 60


@dataclass
class CharadesGame:
    settings: Settings = field(default_factory=Settings)
    status: str = STATUS_LOBBY
    phase: str = PHASE_CHARADE
    player_ids: list[str] = field(default_factory=list)
    actor_index: int = 0
    word: str = ""
    scores: dict[str, int] = field(default_factory=dict)

    def _pick(self, rng: random.Random) -> str:
        return rng.choice(CELEBS)

    def _pick_word(self, rng: random.Random) -> str:
        prev = self.word
        nxt = self._pick(rng)
        while nxt == prev and len(CELEBS) > 1:
            nxt = self._pick(rng)
        return nxt

    def start_game(self, player_ids: list[str], rng: random.Random) -> None:
        if self.status == STATUS_PLAYING:
            raise MoveError("A game is already in progress.")
        if len(player_ids) != REQUIRED_PLAYERS:
            raise MoveError(f"Need exactly {REQUIRED_PLAYERS} players.")
        self.player_ids = list(player_ids)
        self.actor_index = rng.randrange(REQUIRED_PLAYERS)
        self.scores = {pid: 0 for pid in self.player_ids}
        self.word = self._pick_word(rng)
        self.status = STATUS_PLAYING
        self.phase = PHASE_CHARADE

    def next_turn(self, rng: random.Random) -> None:
        self.actor_index = (self.actor_index + 1) % REQUIRED_PLAYERS
        self.word = self._pick_word(rng)
        self.phase = PHASE_CHARADE

    def award(self, guesser_id: str) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No game in progress.")
        if self.phase != PHASE_CHARADE:
            raise MoveError("Wait for the actor.")
        if guesser_id not in self.player_ids:
            raise MoveError("Unknown player.")
        actor_id = self.player_ids[self.actor_index]
        if guesser_id == actor_id:
            raise MoveError("The actor can't guess.")
        self.scores[guesser_id] = self.scores.get(guesser_id, 0) + 1
        self.scores[actor_id] = self.scores.get(actor_id, 0) + 1

    def nobody_guessed(self) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No game in progress.")
        if self.phase != PHASE_CHARADE:
            raise MoveError("Wait for the actor.")

    def new_word(self, rng: random.Random) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No game in progress.")
        if self.phase != PHASE_CHARADE:
            raise MoveError("Wait for the actor.")
        self.word = self._pick_word(rng)

    def actor_id(self) -> Optional[str]:
        if not self.player_ids:
            return None
        return self.player_ids[self.actor_index % len(self.player_ids)]

    def view(self, pid: str, *, show_word: bool = False) -> dict:
        out: dict = {
            "status": self.status,
            "phase": self.phase,
            "timerSecs": self.settings.timer_secs,
            "playerIds": list(self.player_ids),
            "scores": dict(self.scores),
            "actorId": self.actor_id(),
        }
        if show_word and pid == self.actor_id():
            out["word"] = self.word
        return out
