"""Imposter — core game logic (classic, celebrity dance, charades)."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Optional

from .celebs import CELEBS

MODE_CLASSIC = "classic"
MODE_CELEBRITY = "celebrity"
MODE_CHARADES = "charades"
MODES = {MODE_CLASSIC, MODE_CELEBRITY, MODE_CHARADES}

STATUS_LOBBY = "lobby"
STATUS_PLAYING = "playing"

PHASE_PEEK = "peek"       # classic / celebrity — private role view
PHASE_PLAY = "play"       # classic / celebrity — group discussion
PHASE_CHARADE = "charade" # charades — actor performs

REQUIRED_PLAYERS = 4
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
    charades_actor_index: int = 0
    charades_word: str = ""
    charades_scores: dict[str, int] = field(default_factory=dict)

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

    def _pick_charade(self, rng: random.Random) -> str:
        prev = self.charades_word
        nxt = self._pick(rng)
        while nxt == prev and len(CELEBS) > 1:
            nxt = self._pick(rng)
        return nxt

    def start_game(self, player_ids: list[str], rng: random.Random) -> None:
        if self.status == STATUS_PLAYING:
            raise MoveError("A game is already in progress.")
        if len(player_ids) != REQUIRED_PLAYERS:
            raise MoveError(f"Need exactly {REQUIRED_PLAYERS} players.")
        if self.settings.mode not in MODES:
            raise MoveError("Unknown game mode.")
        self.player_ids = list(player_ids)
        self.viewed.clear()
        self.answer_revealed = False
        self.status = STATUS_PLAYING

        if self.settings.mode == MODE_CHARADES:
            self.charades_actor_index = rng.randrange(REQUIRED_PLAYERS)
            self.charades_scores = {pid: 0 for pid in self.player_ids}
            self.charades_word = self._pick_charade(rng)
            self.phase = PHASE_CHARADE
            return

        self.imposter_index = rng.randrange(REQUIRED_PLAYERS)
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

    def reveal_answer(self) -> None:
        if self.status != STATUS_PLAYING or self.settings.mode != MODE_CELEBRITY:
            raise MoveError("Reveal is only for Celebrity Dance.")
        if self.phase != PHASE_PLAY:
            raise MoveError("Everyone must peek first.")
        self.answer_revealed = True

    def new_round(self, rng: random.Random) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No game in progress.")
        if self.settings.mode == MODE_CHARADES:
            self._next_charades_turn(rng)
            return
        prev = self.imposter_index
        choices = [i for i in range(REQUIRED_PLAYERS) if i != prev]
        self.imposter_index = rng.choice(choices)
        if self.settings.mode == MODE_CELEBRITY:
            self._deal_celebs(rng)
        self.viewed.clear()
        self.answer_revealed = False
        self.phase = PHASE_PEEK

    def _next_charades_turn(self, rng: random.Random) -> None:
        self.charades_actor_index = (self.charades_actor_index + 1) % REQUIRED_PLAYERS
        self.charades_word = self._pick_charade(rng)
        self.phase = PHASE_CHARADE

    def award_charade(self, guesser_id: str) -> None:
        if self.status != STATUS_PLAYING or self.settings.mode != MODE_CHARADES:
            raise MoveError("Not in charades.")
        if self.phase != PHASE_CHARADE:
            raise MoveError("Wait for the actor.")
        if guesser_id not in self.player_ids:
            raise MoveError("Unknown player.")
        actor_id = self.player_ids[self.charades_actor_index]
        if guesser_id == actor_id:
            raise MoveError("The actor can't guess.")
        self.charades_scores[guesser_id] = self.charades_scores.get(guesser_id, 0) + 1
        self.charades_scores[actor_id] = self.charades_scores.get(actor_id, 0) + 1

    def charade_nobody(self) -> None:
        if self.status != STATUS_PLAYING or self.settings.mode != MODE_CHARADES:
            raise MoveError("Not in charades.")

    def new_charade_word(self, rng: random.Random) -> None:
        if self.status != STATUS_PLAYING or self.settings.mode != MODE_CHARADES:
            raise MoveError("Not in charades.")
        self.charades_word = self._pick_charade(rng)

    def actor_id(self) -> Optional[str]:
        if not self.player_ids:
            return None
        idx = self.charades_actor_index % len(self.player_ids)
        return self.player_ids[idx]

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
            "charadesScores": dict(self.charades_scores),
            "charadesActorId": self.actor_id(),
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
        if self.settings.mode == MODE_CHARADES and pid == self.actor_id():
            out["charadesWord"] = self.charades_word
        return out
