"""Who Am I? — core game logic."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .characters import CHARACTERS

STATUS_LOBBY = "lobby"
STATUS_PLAYING = "playing"
PHASE_GUESSING = "guessing"

MIN_PLAYERS = 2
MAX_PLAYERS = 50


class MoveError(Exception):
    """A rejected move — message is safe for clients."""


@dataclass
class Settings:
    pass


@dataclass
class WhoAmIGame:
    settings: Settings = field(default_factory=Settings)
    status: str = STATUS_LOBBY
    phase: str = PHASE_GUESSING
    player_ids: list[str] = field(default_factory=list)
    char_by_pid: dict[str, str] = field(default_factory=dict)
    confirmed_by: dict[str, set[str]] = field(default_factory=dict)
    claimed: set[str] = field(default_factory=set)

    def _deal(self, rng: random.Random) -> None:
        pool = list(CHARACTERS)
        if len(pool) < len(self.player_ids):
            raise MoveError("Not enough unique characters for this many players.")
        rng.shuffle(pool)
        self.char_by_pid = {
            pid: pool[i] for i, pid in enumerate(self.player_ids)
        }
        self.confirmed_by = {pid: set() for pid in self.player_ids}
        self.claimed.clear()

    def start_game(self, player_ids: list[str], rng: random.Random) -> None:
        if self.status == STATUS_PLAYING:
            raise MoveError("A game is already in progress.")
        n = len(player_ids)
        if n < MIN_PLAYERS:
            raise MoveError(f"Need at least {MIN_PLAYERS} players.")
        if n > MAX_PLAYERS:
            raise MoveError(f"Too many players (max {MAX_PLAYERS}).")
        self.player_ids = list(player_ids)
        self._deal(rng)
        self.status = STATUS_PLAYING
        self.phase = PHASE_GUESSING

    def new_round(self, rng: random.Random, connected_ids: set[str] | None = None) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No round in progress.")
        if not self.all_claimed(connected_ids):
            raise MoveError("Everyone must guess before the next round.")
        self._deal(rng)
        self.phase = PHASE_GUESSING

    def confirm_guess(self, confirmer_id: str, target_id: str) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No round in progress.")
        if confirmer_id not in self.player_ids:
            raise MoveError("Unknown player.")
        if target_id not in self.player_ids:
            raise MoveError("Unknown player.")
        if confirmer_id == target_id:
            raise MoveError("You can't confirm yourself.")
        if target_id in self.claimed:
            raise MoveError("They already claimed it.")
        self.confirmed_by.setdefault(target_id, set()).add(confirmer_id)

    def claim_got_it(self, pid: str) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No round in progress.")
        if pid not in self.player_ids:
            raise MoveError("Unknown player.")
        if pid in self.claimed:
            raise MoveError("You already claimed it.")
        others = [p for p in self.player_ids if p != pid]
        confirmed = self.confirmed_by.get(pid, set())
        if not any(o in confirmed for o in others):
            raise MoveError("Wait for someone else to confirm you got it.")
        self.claimed.add(pid)

    def _active_ids(self, connected_ids: set[str] | None) -> list[str]:
        if connected_ids is None:
            return list(self.player_ids)
        return [p for p in self.player_ids if p in connected_ids]

    def all_claimed(self, connected_ids: set[str] | None = None) -> bool:
        targets = self._active_ids(connected_ids)
        return bool(targets) and all(p in self.claimed for p in targets)

    def can_claim(self, pid: str) -> bool:
        if pid in self.claimed or pid not in self.player_ids:
            return False
        others = [p for p in self.player_ids if p != pid]
        confirmed = self.confirmed_by.get(pid, set())
        return any(o in confirmed for o in others)

    def view(self, pid: str, *, connected_ids: set[str] | None = None) -> dict:
        cards = []
        for other_id in self.player_ids:
            confirmed = sorted(self.confirmed_by.get(other_id, set()))
            entry = {
                "id": other_id,
                "claimed": other_id in self.claimed,
                "confirmCount": len(confirmed),
                "confirmedByYou": pid in confirmed,
            }
            if other_id == pid and other_id not in self.claimed:
                entry["character"] = None
                entry["hidden"] = True
            else:
                entry["character"] = self.char_by_pid.get(other_id, "")
                entry["hidden"] = False
            cards.append(entry)

        return {
            "status": self.status,
            "phase": self.phase,
            "playerIds": list(self.player_ids),
            "cards": cards,
            "allClaimed": self.all_claimed(connected_ids),
            "canClaim": self.can_claim(pid),
            "youClaimed": pid in self.claimed,
        }
