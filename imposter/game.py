"""Imposter — core game logic (classic imposter, celebrity dance)."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Optional

from .celebs import CELEBS

MODE_CLASSIC = "classic"
MODE_CELEBRITY = "celebrity"
MODES = {MODE_CLASSIC, MODE_CELEBRITY}

STATUS_LOBBY = "lobby"
STATUS_PLAYING = "playing"

PHASE_PEEK = "peek"
PHASE_PLAY = "play"

MIN_PLAYERS = 2
MAX_PLAYERS = 50
TIMER_OPTIONS = {0, 30, 60, 90, 120}


class MoveError(Exception):
    """A rejected move — message is safe for clients."""


@dataclass
class Settings:
    mode: str = MODE_CLASSIC
    timer_secs: int = 60


@dataclass
class ImposterGame:
    settings: Settings = field(default_factory=Settings)
    status: str = STATUS_LOBBY
    phase: str = PHASE_PEEK
    player_ids: list[str] = field(default_factory=list)
    imposter_index: int = -1
    common_celeb: str = ""
    odd_celeb: str = ""
    celeb_by_pid: dict[str, str] = field(default_factory=dict)
    viewed: set[str] = field(default_factory=set)
    answer_revealed: bool = False

    def _pick(self, rng: random.Random) -> str:
        return rng.choice(CELEBS)

    def _deal_celebs(self, rng: random.Random) -> None:
        common = self._pick(rng)
        odd = common
        while odd == common:
            odd = self._pick(rng)
        self.common_celeb = common
        self.odd_celeb = odd
        self.celeb_by_pid = {}
        for i, pid in enumerate(self.player_ids):
            self.celeb_by_pid[pid] = odd if i == self.imposter_index else common

    def start_game(self, player_ids: list[str], rng: random.Random) -> None:
        if self.status == STATUS_PLAYING:
            raise MoveError("A game is already in progress.")
        n = len(player_ids)
        if n < MIN_PLAYERS:
            raise MoveError(f"Need at least {MIN_PLAYERS} players.")
        if n > MAX_PLAYERS:
            raise MoveError(f"Too many players (max {MAX_PLAYERS}).")
        if self.settings.mode not in MODES:
            raise MoveError("Unknown game mode.")
        self.player_ids = list(player_ids)
        self.viewed.clear()
        self.answer_revealed = False
        self.status = STATUS_PLAYING
        self.imposter_index = rng.randrange(n)
        if self.settings.mode == MODE_CELEBRITY:
            self._deal_celebs(rng)
        else:
            self.common_celeb = ""
            self.odd_celeb = ""
            self.celeb_by_pid = {}
        self.phase = PHASE_PEEK

    def mark_viewed(self, pid: str) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PEEK:
            raise MoveError("Not in the peek phase.")
        if pid not in self.player_ids:
            raise MoveError("Unknown player.")
        self.viewed.add(pid)
        if len(self.viewed) >= len(self.player_ids):
            self.phase = PHASE_PLAY

    def abandon_peek(self, pid: str) -> bool:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PEEK:
            return False
        if pid not in self.player_ids:
            return False
        self.viewed.add(pid)
        if len(self.viewed) >= len(self.player_ids):
            self.phase = PHASE_PLAY
        return True

    def reveal_answer(self) -> None:
        if self.status != STATUS_PLAYING or self.settings.mode != MODE_CELEBRITY:
            raise MoveError("Reveal is only for Celebrity Dance.")
        if self.phase != PHASE_PLAY:
            raise MoveError("Everyone must peek first.")
        self.answer_revealed = True

    def new_round(self, rng: random.Random) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No game in progress.")
        if self.phase != PHASE_PLAY:
            raise MoveError("Everyone must peek first.")
        prev = self.imposter_index
        choices = [i for i in range(len(self.player_ids)) if i != prev]
        self.imposter_index = rng.choice(choices)
        if self.settings.mode == MODE_CELEBRITY:
            self._deal_celebs(rng)
        self.viewed.clear()
        self.answer_revealed = False
        self.phase = PHASE_PEEK

    def imposter_id(self) -> Optional[str]:
        if self.imposter_index < 0 or self.imposter_index >= len(self.player_ids):
            return None
        return self.player_ids[self.imposter_index]

    def view(self, pid: str, *, show_secrets: bool = False) -> dict:
        out: dict = {
            "status": self.status,
            "phase": self.phase,
            "mode": self.settings.mode,
            "timerSecs": self.settings.timer_secs,
            "playerIds": list(self.player_ids),
            "viewed": [p for p in self.player_ids if p in self.viewed],
            "allViewed": len(self.viewed) >= len(self.player_ids) and bool(self.player_ids),
            "revealAnswer": self.answer_revealed,
        }
        if self.answer_revealed and self.settings.mode == MODE_CELEBRITY:
            out["imposterId"] = self.imposter_id()
            out["oddCeleb"] = self.odd_celeb
            out["commonCeleb"] = self.common_celeb
        if not show_secrets:
            return out
        if self.settings.mode == MODE_CLASSIC and self.phase == PHASE_PEEK and pid in self.player_ids:
            out["isImposter"] = self.player_ids.index(pid) == self.imposter_index
        if self.settings.mode == MODE_CELEBRITY and self.phase == PHASE_PEEK and pid in self.celeb_by_pid:
            out["myCeleb"] = self.celeb_by_pid[pid]
        return out
