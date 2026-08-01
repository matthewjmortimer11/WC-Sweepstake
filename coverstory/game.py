"""Cover Story — core game logic."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from typing import Optional

from .locations import locations_for_packs, normalise_packs, public_locations, public_packs

STATUS_LOBBY = "lobby"
STATUS_PLAYING = "playing"

PHASE_PEEK = "peek"
PHASE_PLAY = "play"
PHASE_ACCUSE = "accuse"
PHASE_REVEAL = "reveal"

MIN_PLAYERS = 3
MAX_PLAYERS = 16
TIMER_OPTIONS = {0, 300, 420, 600, 720}
SPY_COUNT_OPTIONS = {1, 2}


class MoveError(Exception):
    """A rejected move — message is safe for clients."""


@dataclass
class Settings:
    timer_secs: int = 420
    pack_ids: list[str] = field(default_factory=lambda: ["classic", "luxury", "chaos"])
    custom_pack_ids: list[str] = field(default_factory=list)
    custom_locations: list[dict] = field(default_factory=list)
    spy_count: int = 1


@dataclass
class CoverStoryGame:
    settings: Settings = field(default_factory=Settings)
    status: str = STATUS_LOBBY
    phase: str = PHASE_PEEK
    player_ids: list[str] = field(default_factory=list)
    spy_index: int = -1
    spy_indices: list[int] = field(default_factory=list)
    location: dict = field(default_factory=dict)
    cover_by_pid: dict[str, str] = field(default_factory=dict)
    viewed: set[str] = field(default_factory=set)
    started_at: float = 0
    deadline_at: float = 0
    paused_at: float = 0
    question_index: int = 0
    result: dict = field(default_factory=dict)

    def start_game(self, player_ids: list[str], rng: random.Random) -> None:
        if self.status == STATUS_PLAYING and self.phase != PHASE_REVEAL:
            raise MoveError("A round is already in progress.")
        n = len(player_ids)
        if n < MIN_PLAYERS:
            raise MoveError(f"Need at least {MIN_PLAYERS} players.")
        if n > MAX_PLAYERS:
            raise MoveError(f"Too many players (max {MAX_PLAYERS}).")
        self.player_ids = list(player_ids)
        spy_count = min(max(1, self.settings.spy_count), max(1, n - 1))
        self.spy_indices = sorted(rng.sample(range(n), spy_count))
        self.spy_index = self.spy_indices[0]
        deck = locations_for_packs(self.settings.pack_ids) + list(self.settings.custom_locations)
        self.location = rng.choice(deck)
        roles = list(self.location["roles"])
        rng.shuffle(roles)
        self.cover_by_pid = {}
        for i, pid in enumerate(self.player_ids):
            if i not in self.spy_indices:
                self.cover_by_pid[pid] = roles[i % len(roles)]
        self.viewed.clear()
        self.result = {}
        self.started_at = 0
        self.deadline_at = 0
        self.paused_at = 0
        self.question_index = 0
        self.status = STATUS_PLAYING
        self.phase = PHASE_PEEK

    def _enter_play(self) -> None:
        self.phase = PHASE_PLAY
        self.started_at = time.time()
        self.deadline_at = self.started_at + self.settings.timer_secs if self.settings.timer_secs else 0
        self.paused_at = 0
        self.question_index = 0

    def mark_viewed(self, pid: str) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PEEK:
            raise MoveError("Not in the dossier phase.")
        if pid not in self.player_ids:
            raise MoveError("Unknown player.")
        self.viewed.add(pid)
        if len(self.viewed) >= len(self.player_ids):
            self._enter_play()

    def abandon_peek(self, pid: str) -> bool:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PEEK:
            return False
        if pid not in self.player_ids:
            return False
        self.viewed.add(pid)
        if len(self.viewed) >= len(self.player_ids):
            self._enter_play()
        return True

    def pause_timer(self) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PLAY:
            raise MoveError("Timer can only be paused during questioning.")
        if not self.deadline_at:
            raise MoveError("Timer is off for this round.")
        if not self.paused_at:
            self.paused_at = time.time()

    def resume_timer(self) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PLAY:
            raise MoveError("Timer can only be resumed during questioning.")
        if not self.paused_at:
            return
        paused_for = time.time() - self.paused_at
        self.deadline_at += paused_for
        self.paused_at = 0

    def extend_timer(self, seconds: int) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PLAY:
            raise MoveError("Timer can only be extended during questioning.")
        if seconds not in {30, 60, 120}:
            raise MoveError("Timer can only be extended by 30, 60, or 120 seconds.")
        now = time.time()
        if self.deadline_at:
            self.deadline_at = max(self.deadline_at, self.paused_at or now) + seconds
        else:
            self.deadline_at = now + seconds
            self.started_at = self.started_at or now

    def next_question(self) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PLAY:
            raise MoveError("Question prompts are only available during questioning.")
        if len(self.player_ids) < 2:
            raise MoveError("Need at least two players for question prompts.")
        self.question_index += 1

    def begin_accusation(self) -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PLAY:
            raise MoveError("Accusations can only start after questioning.")
        if self.paused_at:
            self.resume_timer()
        self.phase = PHASE_ACCUSE

    def timer_due(self, now: float | None = None) -> bool:
        if self.status != STATUS_PLAYING or self.phase != PHASE_PLAY:
            return False
        if not self.deadline_at or self.paused_at:
            return False
        return (now if now is not None else time.time()) >= self.deadline_at

    def expire_timer(self, now: float | None = None) -> bool:
        if not self.timer_due(now):
            return False
        self.phase = PHASE_ACCUSE
        return True

    def reveal(self, *, accused_id: str = "", location_guess: str = "") -> None:
        if self.status != STATUS_PLAYING or self.phase != PHASE_ACCUSE:
            raise MoveError("The round must be in accusation before reveal.")
        accused_id = (accused_id or "").strip()
        location_guess = (location_guess or "").strip()
        if accused_id and accused_id not in self.player_ids:
            raise MoveError("Unknown accused player.")
        valid_locations = {
            loc["id"]
            for loc in locations_for_packs(self.settings.pack_ids) + list(self.settings.custom_locations)
        }
        if location_guess and location_guess not in valid_locations:
            raise MoveError("Unknown location guess.")
        if not accused_id and not location_guess:
            raise MoveError("Choose an accused player or a location guess.")
        spy_id = self.spy_id()
        if location_guess:
            spy_won = location_guess == self.location.get("id")
            crew_won = not spy_won
        else:
            crew_won = accused_id in self.spy_ids()
            spy_won = not crew_won
        self.result = {
            "accusedId": accused_id,
            "locationGuess": location_guess,
            "spyId": spy_id,
            "spyIds": self.spy_ids(),
            "locationId": self.location.get("id"),
            "locationName": self.location.get("name"),
            "crewWon": crew_won,
            "spyWon": spy_won,
        }
        self.phase = PHASE_REVEAL

    def remove_player(self, pid: str) -> None:
        if pid not in self.player_ids:
            return
        if self.status == STATUS_PLAYING and self.phase != PHASE_REVEAL and pid == self.spy_id():
            raise MoveError("Restart the round if the plant drops.")
        idx = self.player_ids.index(pid)
        self.player_ids.pop(idx)
        self.viewed.discard(pid)
        self.cover_by_pid.pop(pid, None)
        self.spy_indices = [i - 1 if i > idx else i for i in self.spy_indices if i != idx]
        self.spy_index = self.spy_indices[0] if self.spy_indices else -1
        if self.status == STATUS_PLAYING and self.phase == PHASE_PEEK and len(self.viewed) >= len(self.player_ids):
            self._enter_play()

    def new_round(self, rng: random.Random) -> None:
        if self.status != STATUS_PLAYING:
            raise MoveError("No game in progress.")
        if self.phase != PHASE_REVEAL:
            raise MoveError("Reveal this round before starting another.")
        self.start_game(self.player_ids, rng)

    def spy_id(self) -> Optional[str]:
        if self.spy_index < 0 or self.spy_index >= len(self.player_ids):
            return None
        return self.player_ids[self.spy_index]

    def spy_ids(self) -> list[str]:
        return [
            self.player_ids[i]
            for i in self.spy_indices
            if 0 <= i < len(self.player_ids)
        ]

    def timer_remaining(self) -> int:
        if not self.deadline_at:
            return 0
        now = self.paused_at or time.time()
        return max(0, int(round(self.deadline_at - now)))

    def question_prompt(self) -> dict:
        if len(self.player_ids) < 2:
            return {}
        asker_idx = self.question_index % len(self.player_ids)
        target_idx = (asker_idx + 1 + (self.question_index // len(self.player_ids))) % len(self.player_ids)
        if target_idx == asker_idx:
            target_idx = (target_idx + 1) % len(self.player_ids)
        return {
            "askerId": self.player_ids[asker_idx],
            "targetId": self.player_ids[target_idx],
            "round": self.question_index + 1,
        }

    def view(self, pid: str, *, show_secrets: bool = False) -> dict:
        out: dict = {
            "status": self.status,
            "phase": self.phase,
            "timerSecs": self.settings.timer_secs,
            "packIds": normalise_packs(self.settings.pack_ids),
            "customPackIds": list(self.settings.custom_pack_ids),
            "spyCount": self.settings.spy_count,
            "packs": public_packs(),
            "playerIds": list(self.player_ids),
            "viewed": [p for p in self.player_ids if p in self.viewed],
            "allViewed": len(self.viewed) >= len(self.player_ids) and bool(self.player_ids),
            "startedAt": self.started_at,
            "deadlineAt": self.deadline_at,
            "pausedAt": self.paused_at,
            "timerRemaining": self.timer_remaining(),
            "timerPaused": bool(self.paused_at),
            "questionPrompt": self.question_prompt() if self.phase == PHASE_PLAY else {},
            "locations": public_locations(self.settings.pack_ids) + [
                {
                    "id": loc["id"],
                    "name": loc["name"],
                    "category": loc["category"],
                    "pack": loc.get("pack", "custom"),
                }
                for loc in self.settings.custom_locations
            ],
            "result": dict(self.result),
        }
        if self.phase == PHASE_REVEAL:
            out["location"] = {
                "id": self.location.get("id"),
                "name": self.location.get("name"),
                "category": self.location.get("category"),
                "texture": self.location.get("texture"),
            }
            out["spyId"] = self.spy_id()
            out["spyIds"] = self.spy_ids()
        if not show_secrets:
            return out
        if self.status == STATUS_PLAYING and self.phase == PHASE_PEEK and pid in self.player_ids:
            is_spy = pid in self.spy_ids()
            out["isSpy"] = is_spy
            if is_spy:
                out["spyBrief"] = "You are the plant. Ask careful questions, infer the location, then guess before they expose you."
            else:
                out["myCover"] = self.cover_by_pid.get(pid, "")
                out["location"] = {
                    "id": self.location.get("id"),
                    "name": self.location.get("name"),
                    "category": self.location.get("category"),
                    "texture": self.location.get("texture"),
                    "questions": list(self.location.get("questions", [])),
                }
        return out
