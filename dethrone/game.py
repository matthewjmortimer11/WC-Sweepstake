"""The Cursed Throne — authoritative game engine (ported from static/dethrone/js/state.js)."""

from __future__ import annotations

import random
import time
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Optional

from . import data as D

STATUS_LOBBY = "lobby"
STATUS_SETUP = "setup"
STATUS_PLAY = "play"


class MoveError(Exception):
    pass


def _uid(prefix: str = "id") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def _now_label() -> str:
    return time.strftime("%H:%M", time.localtime())


@dataclass
class PlayerState:
    id: str
    name: str
    location: str = D.START_LOCATION
    gold: int = D.START_GOLD
    rep: int = D.START_REP
    status: str = "active"
    public_role_id: Optional[str] = None
    hidden_role_ids: list[str] = field(default_factory=list)
    extra_shown_role_ids: list[str] = field(default_factory=list)
    action_card_ids: list[str] = field(default_factory=list)
    wounded: bool = False
    serious_duel_used: bool = False
    moved_this_turn: bool = False
    moves_used_this_turn: int = 0
    prev_location: Optional[str] = None
    location_last_round: str = D.START_LOCATION
    abilities_used_this_round: list[str] = field(default_factory=list)
    abilities_used_this_game: list[str] = field(default_factory=list)
    is_bot: bool = False
    # setup only — dealt roles before public pick
    dealt_role_ids: list[str] = field(default_factory=list)
    setup_ready: bool = False


@dataclass
class SuccessionClaim:
    id: str
    player_id: str
    role_id: str
    rank: int
    start_round: int


@dataclass
class Contract:
    id: str
    a_id: str
    b_id: str
    promise: str
    status: str = "active"


@dataclass
class LogEntry:
    id: str
    t: float
    label: str
    round: int
    text: str
    kind: str = "event"


class CursedThroneGame:
    """Server-authoritative game state."""

    def __init__(self) -> None:
        self.status = STATUS_LOBBY
        self.player_count: int = 5
        self.first_player_mode: str = "random"
        self.first_player_index: int = 0
        self.round: int = 1
        self.active_player_index: int = 0
        self.corruption: int = 0
        self.innocent_elims: int = 0
        self.winner: Optional[str] = None
        self.undealt_role_ids: list[str] = []
        self.players: list[PlayerState] = []
        self.player_ids: list[str] = []
        self.decks: dict[str, list[str]] = {}
        self.discards: dict[str, list[str]] = {}
        self.contracts: list[Contract] = []
        self.log: list[LogEntry] = []
        self.throne: dict[str, Any] = {
            "kingControllerId": None,
            "queenControllerId": None,
            "successorId": None,
            "claimOrder": [],
            "succession": {"open": False, "claims": []},
        }
        # pending UI follow-ups keyed by player id
        self.pending_keep_one: dict[str, dict] = {}
        self.pending_role_discard: dict[str, dict] = {}
        self.pending_ui_action: dict[str, dict] = {}
        self.private_notes: dict[str, str] = {}
        self.private_note_card_ids: dict[str, str] = {}
        self.tax_skip_remaining: dict[str, int] = {}
        self.royal_role_lost: bool = False
        self.balance: dict[str, int] = dict(D.DEFAULT_BALANCE)

    def _rule(self, key: str) -> int:
        return int(self.balance.get(key, D.DEFAULT_BALANCE[key]))

    def set_balance(self, updates: dict) -> None:
        if self.status not in (STATUS_LOBBY, STATUS_SETUP):
            raise MoveError("Balance can only change before the game begins.")
        allowed = set(D.DEFAULT_BALANCE.keys())
        for k, v in updates.items():
            if k in allowed and isinstance(v, (int, float)):
                self.balance[k] = int(v)
        # Final Rite must be below corruption max
        if self.balance["finalRiteAt"] >= self.balance["corruptionMax"]:
            self.balance["finalRiteAt"] = self.balance["corruptionMax"] - 1

    def export_report(self, room_code: str = "") -> str:
        """Markdown playtest report (public info only)."""
        lines = [
            "# The Cursed Throne — Playtest Report",
            "",
            f"Generated: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}",
        ]
        if room_code:
            lines.append(f"Room: {room_code}")
        lines.extend([
            "",
            "## Outcome",
            f"- **Winner:** {'Loyal players' if self.winner == 'loyal' else 'Cursed player' if self.winner == 'cursed' else 'In progress'}",
            f"- **Corruption:** {self.corruption} / {self._rule('corruptionMax')}",
            f"- **Innocents lost:** {self.innocent_elims} / {self._rule('innocentElimsToLose')}",
            f"- **Rounds:** {self.round}",
            "",
            "## Balance",
        ])
        for k, v in self.balance.items():
            lines.append(f"- {k}: {v}")
        lines.extend(["", "## Players"])
        for p in self.players:
            role = D.ROLE_META.get(p.public_role_id or "", {}).get("name", "—")
            loc = next((l["name"] for l in D.LOCATIONS if l["id"] == p.location), p.location)
            lines.extend([
                f"### {p.name}" + (" (bot)" if p.is_bot else ""),
                f"- Public role: {role}",
                f"- {loc} · {p.gold}g · Rep {p.rep} · {p.status}",
                f"- Hidden roles: {len(p.hidden_role_ids)} · Cards: {len(p.action_card_ids)}",
                "",
            ])
        t = self.throne
        lines.extend(["## Throne", ""])
        for crown, key in [("King", "kingControllerId"), ("Queen", "queenControllerId"), ("Successor", "successorId")]:
            pid = t.get(key)
            if pid:
                pl = self.player_by_id(pid)
                lines.append(f"- {crown}: {pl.name if pl else pid}")
        succ = t.get("succession") or {}
        claims = succ.get("claims") or []
        if succ.get("open") or claims:
            lines.extend(["", "## Succession", f"- Status: {'open' if succ.get('open') else 'closed'}"])
            for c in sorted(claims, key=lambda x: x.get("rank", 0)):
                pl = self.player_by_id(c.get("playerId", ""))
                role = D.ROLE_META.get(c.get("roleId", ""), {}).get("name", c.get("roleId", "?"))
                lines.append(f"- #{c.get('rank', '?')} {pl.name if pl else '?'} — {role}")
        kinds: dict[str, int] = {}
        for e in self.log:
            kinds[e.kind] = kinds.get(e.kind, 0) + 1
        kind_summary = ", ".join(f"{k}: {v}" for k, v in sorted(kinds.items()))
        lines.extend(["", "## Chronicle", f"- Entries: {len(self.log)}" + (f" ({kind_summary})" if kind_summary else ""), ""])
        for e in reversed(self.log):
            lines.append(f"- **R{e.round}** {e.label} — {e.text}")
        lines.append("\n---\n*Public report — hidden roles omitted.*")
        return "\n".join(lines)

    # ---- logging ----
    def _log(self, text: str, kind: str = "event") -> None:
        self.log.insert(0, LogEntry(
            id=_uid("log"), t=time.time(), label=_now_label(),
            round=self.round, text=text, kind=kind,
        ))

    def player_by_id(self, pid: str) -> Optional[PlayerState]:
        return next((p for p in self.players if p.id == pid), None)

    def active_player(self) -> Optional[PlayerState]:
        if not self.players:
            return None
        return self.players[self.active_player_index]

    # ---- lobby / setup ----
    def set_player_count(self, n: int) -> None:
        if self.status != STATUS_LOBBY:
            raise MoveError("Game already started.")
        if n < D.MIN_PLAYERS or n > D.MAX_PLAYERS:
            raise MoveError(f"Player count must be {D.MIN_PLAYERS}–{D.MAX_PLAYERS}.")
        self.player_count = n

    def assign_seats(self, seat_players: list[tuple[str, str, bool]]) -> None:
        """Map room players to game seats (id, name, is_bot)."""
        if self.status not in (STATUS_LOBBY, STATUS_SETUP):
            raise MoveError("Cannot reassign seats mid-game.")
        n = self.player_count
        if len(seat_players) < n:
            raise MoveError(f"Need {n} players connected.")
        if len(seat_players) > n:
            seat_players = seat_players[:n]
        self.players = [
            PlayerState(id=pid, name=name, is_bot=is_bot)
            for pid, name, is_bot in seat_players
        ]
        self.player_ids = [p.id for p in self.players]

    def deal_setup(self, rng: random.Random) -> None:
        if self.status != STATUS_LOBBY:
            raise MoveError("Setup already dealt.")
        n = len(self.players)
        if n < D.MIN_PLAYERS:
            raise MoveError(f"Need at least {D.MIN_PLAYERS} players.")
        others = [rid for rid in D.ROLE_IDS if rid != "cursedone"]
        pool = ["cursedone"] + rng.sample(others, n * 3 - 1)
        rng.shuffle(pool)
        undealt = [rid for rid in D.ROLE_IDS if rid not in pool]
        self.undealt_role_ids = undealt
        for i, p in enumerate(self.players):
            dealt = pool[i * 3: i * 3 + 3]
            p.dealt_role_ids = dealt
            p.setup_ready = False
            p.public_role_id = None
            p.hidden_role_ids = []
        self.status = STATUS_SETUP
        self._log(f"Roles dealt to {n} players. Choose your public role privately.", "system")

    def pick_public_role(self, pid: str, role_id: str) -> None:
        if self.status != STATUS_SETUP:
            raise MoveError("Not in setup phase.")
        p = self.player_by_id(pid)
        if not p:
            raise MoveError("Unknown player.")
        if p.setup_ready:
            raise MoveError("You already chose your public role.")
        if role_id not in p.dealt_role_ids:
            raise MoveError("That role was not dealt to you.")
        meta = D.ROLE_META.get(role_id, {})
        if not meta.get("canBePublic", True):
            raise MoveError("That role must stay hidden.")
        p.public_role_id = role_id
        p.hidden_role_ids = [r for r in p.dealt_role_ids if r != role_id]
        p.setup_ready = True
        self._log(f"{p.name} chose a public role.", "system")

    def all_setup_ready(self) -> bool:
        return bool(self.players) and all(p.setup_ready for p in self.players)

    def begin_game(self, rng: random.Random, first_mode: str = "random", first_index: int = 0) -> None:
        if self.status != STATUS_SETUP:
            raise MoveError("Finish setup first.")
        if not self.all_setup_ready():
            raise MoveError("Not all players have chosen a public role.")
        n = len(self.players)
        deck = [c["id"] for c in D.ACTION_CARDS]
        rng.shuffle(deck)
        starting: dict[str, list[str]] = {}
        for i, p in enumerate(self.players):
            starting[p.id] = deck[i * 2: i * 2 + 2]
            p.action_card_ids = starting[p.id][:]
            p.dealt_role_ids = []
            p.gold = self._rule("startGold")
            p.rep = self._rule("startRep")
            p.location = D.START_LOCATION
        self.decks = {name: rng.sample(D.CARDS_BY_DECK[name][:], len(D.CARDS_BY_DECK[name]))
                      for name in D.DECK_NAMES}
        for name in D.DECK_NAMES:
            rng.shuffle(self.decks[name])
        self.discards = {name: [] for name in D.DECK_NAMES}
        if first_mode == "random":
            self.active_player_index = rng.randrange(n)
        else:
            self.active_player_index = _clamp(first_index, 0, n - 1)
        self.round = 1
        self._on_new_round()
        self.corruption = 0
        self.innocent_elims = 0
        self.winner = None
        self.royal_role_lost = False
        self.contracts = []
        self.throne = {
            "kingControllerId": None,
            "queenControllerId": None,
            "successorId": None,
            "claimOrder": [],
            "succession": {"open": False, "claims": []},
        }
        self.status = STATUS_PLAY
        self._log(f"Game started: {n} players. Round 1.", "system")
        ap = self.active_player()
        if ap:
            self._log(f"First to act: {ap.name}.", "system")

    # ---- movement & turns ----
    def _move_limit(self, player: PlayerState) -> int:
        return 2 if "wanderingknight" in self._all_role_ids(player) else 1

    def _can_board_move(self, player: PlayerState) -> bool:
        return int(player.moves_used_this_turn) < self._move_limit(player)

    def legal_moves(self, player: PlayerState) -> list[str]:
        moves = list(D.CONNECTIONS.get(player.location, []))
        if player.location == "college" and "collegeadvisor" in self._all_role_ids(player):
            if "scrolls" not in moves:
                moves.append("scrolls")
        return moves

    def move_player(self, pid: str, location_id: str, *, manual: bool = False, actor_id: Optional[str] = None) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        p = self.player_by_id(pid)
        if not p or p.status != "active":
            raise MoveError("Invalid player.")
        if not manual:
            ap = self.active_player()
            mover = actor_id or pid
            if not ap or ap.id != mover or mover != pid:
                raise MoveError("Not your turn.")
            if not self._can_board_move(p):
                raise MoveError("You have already moved this turn.")
            if location_id not in self.legal_moves(p):
                raise MoveError("That location is not reachable.")
        if location_id not in {loc["id"] for loc in D.LOCATIONS}:
            raise MoveError("Unknown location.")
        if p.location == location_id:
            return
        from_name = next((l["name"] for l in D.LOCATIONS if l["id"] == p.location), "?")
        to_name = next((l["name"] for l in D.LOCATIONS if l["id"] == location_id), "?")
        p.prev_location = p.location
        p.location = location_id
        if not manual:
            ap = self.active_player()
            if ap and ap.id == pid:
                ap.moves_used_this_turn = int(ap.moves_used_this_turn) + 1
                ap.moved_this_turn = ap.moves_used_this_turn >= self._move_limit(ap)
        self._log(f"{p.name} moved {from_name} → {to_name}" + (" (manual)" if manual else "") + ".")

    def _all_role_ids(self, p: PlayerState) -> set[str]:
        roles: set[str] = set()
        if p.public_role_id:
            roles.add(p.public_role_id)
        roles.update(p.hidden_role_ids)
        roles.update(p.extra_shown_role_ids)
        return roles

    def _on_new_round(self) -> None:
        """Per-round hooks (Court Favourite tax skip, etc.)."""
        for p in self.players:
            if p.status == "active":
                p.location_last_round = p.location
        self.tax_skip_remaining = {}
        for p in self.players:
            p.abilities_used_this_round = []
            if p.status == "active" and "courtfavourite" in self._all_role_ids(p):
                self.tax_skip_remaining[p.id] = 1

    def _tax_exempt_reason(self, target: PlayerState, collector_id: str) -> Optional[str]:
        if target.id == collector_id:
            return "self"
        roles = self._all_role_ids(target)
        if roles & D.TAX_EXEMPT_ROLE_IDS:
            return "tax exempt role"
        if "king" in roles:
            t = self.throne
            if collector_id in (t.get("queenControllerId"), t.get("successorId")):
                return "Royal Tax Exemption"
        remaining = self.tax_skip_remaining.get(target.id, 0)
        if remaining > 0:
            self.tax_skip_remaining[target.id] = remaining - 1
            return "Favoured"
        if "guild_seal" in target.action_card_ids:
            target.action_card_ids.remove("guild_seal")
            self.discards.setdefault("Market", []).append("guild_seal")
            self._log(f"{target.name} played Guild Seal to ignore tax.", "note")
            return "Guild Seal"
        return None

    def _collect_tax(self, collector: PlayerState, amount: int) -> int:
        taken = 0
        for other in self.players:
            if other.status != "active" or other.id == collector.id:
                continue
            reason = self._tax_exempt_reason(other, collector.id)
            if reason:
                if reason != "self":
                    self._log(f"{other.name} ignored tax ({reason}).", "note")
                continue
            amt = min(amount, other.gold)
            if amt:
                other.gold -= amt
                collector.gold += amt
                taken += amt
        return taken

    def _can_final_rite(self, p: PlayerState) -> bool:
        if self.winner or not p or p.status != "active":
            return False
        if "cursedone" not in p.hidden_role_ids:
            return False
        if p.location != "graveyard":
            return False
        return self.corruption >= self._rule("finalRiteAt")

    def _advance_turn(self) -> None:
        n = len(self.players)
        start = self.active_player_index
        idx = start
        for _ in range(n):
            idx = (idx + 1) % n
            if self.players[idx].status == "active":
                break
        wrapped = idx <= start
        self.active_player_index = idx
        if wrapped:
            self.round += 1
            self._on_new_round()
            self._log(f"Round {self.round} started.", "system")
        for p in self.players:
            p.moved_this_turn = False
            p.moves_used_this_turn = 0
        self._log(f"Turn passes to {self.players[idx].name}.")

    def end_turn(self, actor_id: str) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        ap = self.active_player()
        if not ap or ap.id != actor_id:
            raise MoveError("Not your turn.")
        if self.over_hand_limit(ap):
            limit = self._rule("handLimit")
            raise MoveError(
                f"Discard down to {limit} action cards before ending your turn "
                f"({len(ap.action_card_ids)} in hand)."
            )
        if self._can_final_rite(ap):
            self.pending_ui_action[ap.id] = {"kind": "final_rite", "playerId": ap.id}
            return
        self._advance_turn()

    def perform_final_rite(self, pid: str) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        pending = self.pending_ui_action.get(pid)
        if not pending or pending.get("kind") != "final_rite":
            raise MoveError("No Final Rite to perform.")
        ap = self.active_player()
        if not ap or ap.id != pid:
            raise MoveError("Not your turn.")
        if not self._can_final_rite(ap):
            raise MoveError("Final Rite is not available.")
        self.pending_ui_action.pop(pid, None)
        self._log(f"{ap.name} performs the Final Rite at the Graveyard!", "system")
        self.declare_winner("cursed", "Final Rite")

    def decline_final_rite(self, pid: str) -> None:
        pending = self.pending_ui_action.get(pid)
        if not pending or pending.get("kind") != "final_rite":
            raise MoveError("No Final Rite offer active.")
        ap = self.active_player()
        if not ap or ap.id != pid:
            raise MoveError("Not your turn.")
        self.pending_ui_action.pop(pid, None)
        self._advance_turn()

    # ---- corruption & wins ----
    def set_corruption(self, value: int, reason: str = "") -> None:
        prev = self.corruption
        v = _clamp(round(value), 0, self._rule("corruptionMax"))
        if v == prev:
            return
        self.corruption = v
        direction = "rose" if v > prev else "fell"
        self._log(f"Corruption {direction} to {v}" + (f": {reason}" if reason else "") + ".", "corruption")
        if v >= self._rule("finalRiteAt") and prev < self._rule("finalRiteAt"):
            self._log(
                f"Warning: corruption is {v}. Final Rite is now possible at the Graveyard.",
                "corruption",
            )
        if v >= self._rule("corruptionMax"):
            self.declare_winner("cursed", f"Corruption reached {self._rule('corruptionMax')}")

    def adjust_corruption(self, delta: int, reason: str = "") -> None:
        self.set_corruption(self.corruption + delta, reason)

    def set_innocent_elims(self, value: int, reason: str = "") -> None:
        v = _clamp(round(value), 0, 99)
        if v == self.innocent_elims:
            return
        self.innocent_elims = v
        self._log(f"Innocent eliminations now {v}" + (f": {reason}" if reason else "") + ".", "event")
        if v >= self._rule("innocentElimsToLose"):
            self.declare_winner("cursed", f"{v} innocent players eliminated")

    def declare_winner(self, side: str, reason: str = "") -> None:
        if self.winner:
            return
        self.winner = side
        who = "Loyal players win" if side == "loyal" else "Cursed player wins"
        self._log(f"{who}! {reason}", "system")

    # ---- economy ----
    def adjust_gold(self, pid: str, delta: int, reason: str = "") -> None:
        p = self.player_by_id(pid)
        if not p:
            return
        p.gold = max(0, p.gold + delta)
        word = "gained" if delta >= 0 else "lost"
        self._log(f"{p.name} {word} {abs(delta)} gold" + (f" ({reason})" if reason else "") + f". Now {p.gold}.")

    def adjust_rep(self, pid: str, delta: int, reason: str = "", *, allow_debug: bool = False) -> None:
        p = self.player_by_id(pid)
        if not p:
            return
        lo = -99 if allow_debug else D.REP_MIN
        hi = 99 if allow_debug else D.REP_MAX
        prev = p.rep
        p.rep = _clamp(p.rep + delta, lo, hi)
        if p.rep == prev:
            return
        direction = "up" if p.rep > prev else "down"
        self._log(f"{p.name} Reputation {direction} to {p.rep}" + (f" ({reason})" if reason else "") + ".")

    # ---- decks ----
    def draw_card(self, pid: str, deck_name: str, reason: str = "") -> Optional[str]:
        p = self.player_by_id(pid)
        if not p:
            return None
        pile = self.decks.setdefault(deck_name, [])
        if not pile:
            disc = self.discards.get(deck_name, [])
            if disc:
                self.decks[deck_name] = disc[:]
                rng = random.Random()
                rng.shuffle(self.decks[deck_name])
                self.discards[deck_name] = []
            else:
                self.decks[deck_name] = D.CARDS_BY_DECK[deck_name][:]
                random.shuffle(self.decks[deck_name])
            self._log(f"{deck_name} deck reshuffled.", "system")
            pile = self.decks[deck_name]
        if not pile:
            return None
        card_id = pile.pop(0)
        p.action_card_ids.append(card_id)
        self._log(f"{p.name} drew a {deck_name} card" + (f" ({reason})" if reason else "") + ".")
        return card_id

    def discard_card(self, pid: str, card_id: str, reason: str = "") -> None:
        p = self.player_by_id(pid)
        if not p or card_id not in p.action_card_ids:
            return
        p.action_card_ids.remove(card_id)
        card = D.CARD_BY_ID.get(card_id)
        if card:
            self.discards.setdefault(card["deck"], []).append(card_id)
        self._log(f"{p.name} discarded an action card" + (f" ({reason})" if reason else "") + ".")

    def toggle_player_status(self, player_id: str) -> None:
        p = self.player_by_id(player_id)
        if not p:
            raise MoveError("Unknown player.")
        if p.status == "active":
            p.status = "eliminated"
            self._log(f"{p.name} was eliminated (manual).", "event")
        else:
            p.status = "active"
            self._log(f"{p.name} was restored (manual).", "event")

    def _ensure_draw_pile(self, deck_name: str, rng: random.Random) -> list[str]:
        pile = self.decks.setdefault(deck_name, [])
        if not pile:
            disc = self.discards.get(deck_name, [])
            if disc:
                self.decks[deck_name] = disc[:]
                rng.shuffle(self.decks[deck_name])
                self.discards[deck_name] = []
            else:
                self.decks[deck_name] = D.CARDS_BY_DECK[deck_name][:]
                rng.shuffle(self.decks[deck_name])
            self._log(f"{deck_name} deck reshuffled.", "system")
            pile = self.decks[deck_name]
        return pile

    def _set_private_note(self, pid: str, text: str, card_id: Optional[str] = None) -> None:
        self.private_notes[pid] = text
        if card_id:
            self.private_note_card_ids[pid] = card_id
        else:
            self.private_note_card_ids.pop(pid, None)

    def _players_at(self, location_id: str, *, exclude: Optional[str] = None) -> list[PlayerState]:
        return [
            p for p in self.players
            if p.status == "active" and p.location == location_id and p.id != exclude
        ]

    def play_action_card(
        self,
        pid: str,
        card_id: str,
        *,
        target_id: Optional[str] = None,
        location_id: Optional[str] = None,
        deck_name: Optional[str] = None,
        discard_card_id: Optional[str] = None,
        rng: Optional[random.Random] = None,
    ) -> dict:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        ap = self.active_player()
        if not ap or ap.id != pid:
            raise MoveError("Not your turn.")
        p = self.player_by_id(pid)
        if not p or card_id not in p.action_card_ids:
            raise MoveError("Card not in hand.")
        fx = D.CARD_AUTO_EFFECTS.get(card_id)
        if not fx:
            raise MoveError("This card must be resolved manually at the table.")
        if fx.get("needs_target") and not fx.get("optional_target") and not target_id:
            raise MoveError("Choose a target player.")
        if fx.get("needs_deck") and not deck_name:
            raise MoveError("Choose a deck.")
        if fx.get("needs_discard_card"):
            if not discard_card_id or discard_card_id == card_id:
                raise MoveError("Choose a card to sell.")
            if discard_card_id not in p.action_card_ids:
                raise MoveError("Card not in hand.")
        target = self.player_by_id(target_id) if target_id else None
        if target_id and (not target or target.status != "active"):
            raise MoveError("Invalid target.")
        if fx.get("needs_target") and (not target or target.status != "active"):
            raise MoveError("Invalid target.")
        if fx.get("at_location") and p.location != fx["at_location"]:
            loc_name = next((l["name"] for l in D.LOCATIONS if l["id"] == fx["at_location"]), fx["at_location"])
            raise MoveError(f"Must be at {loc_name} to play this card.")
        if fx.get("smuggle_run") and p.location not in ("tavern", "barracks"):
            raise MoveError("Smuggler's Run must be played from Tavern or Barracks.")
        if fx.get("alibi_check") and not location_id:
            raise MoveError("Name a location.")
        if fx.get("same_location") and target and target.location != p.location:
            raise MoveError("Target must be at your location.")
        if deck_name and deck_name not in D.DECK_NAMES:
            raise MoveError("Unknown deck.")

        card = D.CARD_BY_ID.get(card_id, {})
        cname = card.get("name", card_id)
        self._log(f"{p.name} plays {cname}.")
        rng = rng or random.Random()
        extra: dict[str, Any] = {}

        if fx.get("move_pair"):
            src, dest = fx["move_pair"]
            if p.location != src:
                raise MoveError(f"Must be at {src.title()} to play this card.")
            self.move_player(pid, dest, manual=True)
        elif fx.get("tunnel_pairs"):
            dest = fx["tunnel_pairs"].get(p.location)
            if not dest:
                raise MoveError("Cannot play Map of Tunnels from here.")
            if not location_id:
                raise MoveError("Choose a destination.")
            if location_id != dest:
                raise MoveError("Invalid tunnel route.")
            self.move_player(pid, dest, manual=True)
        elif fx.get("move_connected"):
            if not location_id:
                raise MoveError("Choose a destination.")
            if location_id not in self.legal_moves(p):
                raise MoveError("That location is not reachable.")
            self.move_player(pid, location_id, manual=True)
        elif fx.get("smuggle_run"):
            if not location_id:
                raise MoveError("Choose a destination.")
            routes = {"tavern": "barracks", "barracks": "tavern"}
            expected = routes.get(p.location)
            if not expected or location_id != expected:
                raise MoveError("Smuggler's Run only connects Tavern ↔ Barracks through the Graveyard.")
            self.move_player(pid, location_id, manual=True)

        if fx.get("cost_gold"):
            cost = fx["cost_gold"]
            if p.gold < cost:
                raise MoveError("Not enough gold.")
            p.gold -= cost

        if fx.get("tax_each"):
            taken = self._collect_tax(p, fx["tax_each"])
            if taken:
                self._log(f"{p.name} collected {taken} gold in taxes.")

        if fx.get("take_at_location"):
            loc = fx["at_location"]
            for other in self._players_at(loc, exclude=pid):
                amt = min(fx["take_at_location"], other.gold)
                if amt:
                    other.gold -= amt
                    p.gold += amt
            self._log(f"{p.name} collected offerings at the Graveyard.")

        if fx.get("give_at_location"):
            loc = fx["at_location"]
            for other in self._players_at(loc):
                other.gold += fx["give_at_location"]
                self._log(f"{other.name} gains {fx['give_at_location']} gold (Market Day).")

        if fx.get("take_gold") and target:
            amt = min(fx["take_gold"], target.gold)
            if amt:
                target.gold -= amt
                p.gold += amt
                self._log(f"{p.name} took {amt} gold from {target.name}.")
            elif fx.get("or_target_rep"):
                self.adjust_rep(target.id, fx["or_target_rep"], cname)

        if fx.get("pay_or_rep") and target:
            pay = fx["pay_or_rep"]
            if target.gold >= pay:
                target.gold -= pay
                p.gold += pay
                self._log(f"{target.name} paid {pay} gold to {p.name}.")
            else:
                self._maybe_offer_rep_loss(target.id, -1, cname)

        if fx.get("gold"):
            self.adjust_gold(pid, fx["gold"], cname)
        if fx.get("rep"):
            self.adjust_rep(pid, fx["rep"], cname)
        if fx.get("rep_self"):
            self.adjust_rep(pid, fx["rep_self"], cname)
        if fx.get("corruption"):
            self.adjust_corruption(fx["corruption"], cname)
        if fx.get("draw"):
            self.draw_card(pid, fx["draw"], cname)
        if fx.get("ally_draw") and target and target.location == p.location:
            self.draw_card(target.id, fx["ally_draw"], cname)
        if fx.get("ally_peek_hand") and target and target.location == p.location:
            hand_pick = [c for c in p.action_card_ids if c != card_id]
            if hand_pick:
                pick = hand_pick[rng.randrange(len(hand_pick))]
                label = D.CARD_BY_ID.get(pick, {}).get("name", pick)
                self._set_private_note(
                    target.id,
                    f"{p.name}'s hand includes: {label}",
                    pick,
                )
            else:
                self._set_private_note(target.id, f"{p.name} has no action cards.")
            self._log(
                f"{target.name} looked at {p.name}'s hand (Study Companion).",
                "note",
            )
        if fx.get("guild_seal_proactive"):
            self.tax_skip_remaining[pid] = self.tax_skip_remaining.get(pid, 0) + 1
            self._log(f"{p.name} plays Guild Seal — ignores the next tax this round.", "note")
        if fx.get("peek_hidden_role") and target:
            if not target.hidden_role_ids:
                self._set_private_note(pid, f"{target.name} has no hidden roles.")
            else:
                pick = target.hidden_role_ids[0]
                rname = D.ROLE_META.get(pick, {}).get("name", pick)
                self._set_private_note(pid, f"{target.name}'s hidden role: {rname}")
            self._log(f"{p.name} used Whisper Network on {target.name}.", "note")
        if fx.get("witness_graveyard") and target:
            was = target.location_last_round == "graveyard"
            self._set_private_note(
                pid,
                f"{target.name} {'was' if was else 'was not'} at the Graveyard last round.",
            )
            self._log(f"{p.name} took a witness statement from {target.name}.", "note")
        if fx.get("alibi_check") and target and location_id:
            loc_name = next((l["name"] for l in D.LOCATIONS if l["id"] == location_id), location_id)
            was = target.location_last_round == location_id
            self._set_private_note(
                pid,
                f"{target.name} {'was' if was else 'was not'} at {loc_name} last round.",
            )
            self._log(f"{p.name} ran an alibi check on {target.name}.", "note")
        if fx.get("trace_steps") and target:
            if target.prev_location:
                from_name = next(
                    (l["name"] for l in D.LOCATIONS if l["id"] == target.prev_location),
                    target.prev_location,
                )
                self._set_private_note(pid, f"{target.name} last moved from {from_name}.")
            else:
                self._set_private_note(pid, f"No recorded move for {target.name} yet.")
            self._log(f"{p.name} traced {target.name}'s steps.", "note")
        if fx.get("peek_gold") and target:
            self._set_private_note(
                pid,
                f"{target.name} has {target.gold} gold. (They may lie once per game.)",
            )
            self._log(f"{p.name} inspected {target.name}'s ledger.", "note")
        if fx.get("hangover_cure"):
            if p.wounded:
                p.wounded = False
                self._log(f"{p.name} removed Wound (Hangover Cure).")
            elif p.rep <= 2:
                self.adjust_rep(pid, 1, "Hangover Cure")
            else:
                self._log(f"{p.name} had nothing to cure.", "note")
        if fx.get("last_rites"):
            if self.corruption >= 6:
                self.adjust_rep(pid, 1, "Last Rites")
        if fx.get("royal_purse"):
            t = self.throne
            if pid in (t.get("kingControllerId"), t.get("queenControllerId")):
                self.adjust_gold(pid, 3, "Royal Purse")
            else:
                self._log(f"{p.name} does not control the Throne — no gold from Royal Purse.", "note")
        if fx.get("target_rep") and target:
            self._maybe_offer_rep_loss(target.id, fx["target_rep"], cname)
        if fx.get("rumour") and target:
            if target.gold >= 1:
                target.gold -= 1
                p.gold += 1
                self._log(f"{target.name} paid 1 gold to {p.name} to silence the Rumour.")
            else:
                self._maybe_offer_rep_loss(target.id, -1, "Rumour", trigger="rumour")
        if fx.get("open_succession"):
            self.open_succession()
        if fx.get("bone_dice"):
            if rng.random() < 0.5:
                p.gold += 4
                self._log(f"{p.name} rolled high on the Bone Dice — +4 gold.")
            else:
                self._maybe_offer_rep_loss(pid, -1, "Bone Dice")
        if fx.get("peek_deck_top") and deck_name:
            pile = self._ensure_draw_pile(deck_name, rng)
            top = pile[0] if pile else None
            cmeta = D.CARD_BY_ID.get(top or "", {})
            label = cmeta.get("name", top or "nothing")
            self._set_private_note(pid, f"Top of {deck_name} deck: {label}", top)
            self._log(f"{p.name} consulted the {deck_name} deck.", "note")
        if fx.get("peek_discard_top") and deck_name:
            disc = self.discards.get(deck_name, [])
            top = disc[-1] if disc else None
            cmeta = D.CARD_BY_ID.get(top or "", {})
            label = cmeta.get("name", top or "empty")
            self._set_private_note(pid, f"Top of {deck_name} discard: {label}", top)
            self._log(f"{p.name} read the {deck_name} discard pile.", "note")
        if fx.get("peek_discard_random"):
            dname = fx["peek_discard_random"]
            disc = self.discards.get(dname, [])
            if disc:
                pick = disc[rng.randrange(len(disc))]
                cmeta = D.CARD_BY_ID.get(pick, {})
                label = cmeta.get("name", pick)
                self._set_private_note(pid, f"Graveyard discard (random): {label}", pick)
            else:
                self._set_private_note(pid, "Graveyard discard pile is empty.")
            self._log(f"{p.name} listened to the Graveyard whispers.", "note")
        if fx.get("draw_keep_one"):
            dname = fx["draw_keep_one"]
            pile = self._ensure_draw_pile(dname, rng)
            a = pile.pop(0) if pile else None
            pile = self._ensure_draw_pile(dname, rng)
            b = pile.pop(0) if pile else None
            if not a or not b:
                raise MoveError(f"{dname} deck ran dry.")
            self.pending_keep_one[pid] = {"deck": dname, "cards": [a, b]}
            extra["keepOne"] = True
        if fx.get("needs_discard_card") and discard_card_id:
            sold = D.CARD_BY_ID.get(discard_card_id, {})
            deck = sold.get("deck", "Market")
            gain = max(1, D.DECK_BUY_COST.get(deck, 2) // 2)
            p.action_card_ids.remove(discard_card_id)
            self.discards.setdefault(deck, []).append(discard_card_id)
            p.gold += gain
            self._log(
                f"{p.name} sold {sold.get('name', discard_card_id)} for {gain} gold.",
            )

        if fx.get("move_target") and target:
            dest = fx["move_target"]
            if dest not in {loc["id"] for loc in D.LOCATIONS}:
                raise MoveError("Unknown destination.")
            self.move_player(target.id, dest, manual=True)

        if fx.get("royal_sacrifice"):
            self._royal_sacrifice(p)

        if fx.get("open_vote") and target:
            ov = fx["open_vote"]
            max_rep = ov.get("max_rep")
            if max_rep is not None and target.rep > max_rep:
                raise MoveError(f"Target must have Rep ≤{max_rep}.")
            pending_vote = {
                "kind": "vote",
                "proposerId": pid,
                "voteType": ov.get("vote_type", "accuse"),
                "targetId": target.id,
                "decree": bool(ov.get("decree")),
                "emergency": bool(ov.get("emergency")),
            }
            self.pending_ui_action[pid] = pending_vote
            extra["openVote"] = pending_vote

        if fx.get("open_trade"):
            pending_trade = {"kind": "trade", "playerId": pid}
            self.pending_ui_action[pid] = pending_trade
            extra["openTrade"] = pending_trade

        if fx.get("open_contract"):
            pending_contract = {"kind": "contract", "playerId": pid}
            self.pending_ui_action[pid] = pending_contract
            extra["openContract"] = pending_contract

        if fx.get("open_callout"):
            pending_callout = {"kind": "callout", "playerId": pid}
            self.pending_ui_action[pid] = pending_callout
            extra["openCallout"] = pending_callout

        if fx.get("open_duel") and target:
            pending_duel = {
                "kind": "duel",
                "attackerId": pid,
                "defenderId": target.id,
            }
            self.pending_ui_action[pid] = pending_duel
            extra["openDuel"] = pending_duel
            self._offer_reaction(
                target.id,
                "duel_declared",
                {"effect": "cancel_duel", "attackerId": pid},
            )

        self.discard_card(pid, card_id, "played")
        return {"ok": True, **extra}

    def _royal_sacrifice(self, p: PlayerState) -> None:
        roles = self._all_role_ids(p)
        royal = "king" if "king" in roles else ("queen" if "queen" in roles else None)
        if not royal:
            raise MoveError("You need a King or Queen role.")
        slot = None
        if p.public_role_id == royal:
            slot = "public"
        elif royal in p.hidden_role_ids:
            slot = "hidden"
        elif royal in p.extra_shown_role_ids:
            slot = "extra"
        if not slot:
            raise MoveError("Royal role not found.")
        self.apply_role_discard(p.id, slot, royal)
        self.adjust_corruption(-3, "Royal Sacrifice")
        t = self.throne
        if not t.get("kingControllerId") and not t.get("queenControllerId"):
            self.open_succession()
            self._log("No royal remains on the Throne — succession opens.", "system")

    def _consume_duel_cards(self, player: PlayerState, card_ids: list[str]) -> int:
        bonus = 0
        for cid in card_ids:
            if cid not in player.action_card_ids:
                raise MoveError("Duel card not in hand.")
            val = D.DUEL_CARD_VALUES.get(cid)
            if val is None:
                raise MoveError("Not a duel card.")
            bonus += val
            self.discard_card(player.id, cid, "duel")
        return bonus

    def clear_pending_ui(self, pid: str) -> None:
        self.pending_ui_action.pop(pid, None)

    def apply_royal_command(
        self,
        pid: str,
        choice: str,
        *,
        target_id: Optional[str] = None,
    ) -> None:
        pending = self.pending_ui_action.get(pid)
        if not pending or pending.get("kind") != "royal_command":
            raise MoveError("No Royal Command in progress.")
        ap = self.player_by_id(pid)
        if not ap:
            raise MoveError("Unknown player.")
        t = self.throne
        if ap.id not in (t.get("kingControllerId"), t.get("queenControllerId")):
            raise MoveError("Throne controller only.")
        if ap.location != "throne":
            raise MoveError("Must be at the Throne.")

        if choice == "tax":
            taken = self._collect_tax(ap, 1)
            if taken:
                self._log(f"{ap.name} levied Royal Tax — collected {taken} gold.")
            else:
                self._log(f"{ap.name} levied Royal Tax — no gold collected.", "note")
        elif choice == "pardon":
            if not target_id:
                raise MoveError("Choose a player to pardon.")
            target = self.player_by_id(target_id)
            if not target or target.status != "active":
                raise MoveError("Invalid target.")
            self.adjust_rep(target_id, 1, "Royal Pardon")
            self._log(f"{ap.name} issued a Royal Pardon for {target.name}.")
        elif choice == "decree":
            self._log(
                f"{ap.name} issued a Royal Decree — formal vote may proceed without a seconder.",
                "event",
            )
        else:
            raise MoveError("Unknown Royal Command choice.")
        self.pending_ui_action.pop(pid, None)

    def apply_deep_research(
        self,
        pid: str,
        mode: str,
        *,
        deck_name: Optional[str] = None,
        target_id: Optional[str] = None,
        rng: Optional[random.Random] = None,
    ) -> None:
        pending = self.pending_ui_action.get(pid)
        if not pending or pending.get("kind") != "deep_research":
            raise MoveError("No Deep Research in progress.")
        ap = self.player_by_id(pid)
        if not ap:
            raise MoveError("Unknown player.")
        if ap.location != "scrolls":
            raise MoveError("Must be at the Scrolls.")
        rng = rng or random.Random()

        if mode == "deck_top":
            if not deck_name or deck_name not in D.DECK_NAMES:
                raise MoveError("Choose a deck.")
            pile = self._ensure_draw_pile(deck_name, rng)
            top = pile[0] if pile else None
            label = D.CARD_BY_ID.get(top or "", {}).get("name", top or "nothing")
            self._set_private_note(pid, f"Top of {deck_name} deck: {label}", top)
            self._log(f"{ap.name} surveyed the {deck_name} archives (Deep Research).", "note")
        elif mode == "discard_top":
            if not deck_name or deck_name not in D.DECK_NAMES:
                raise MoveError("Choose a deck.")
            disc = self.discards.get(deck_name, [])
            top = disc[-1] if disc else None
            label = D.CARD_BY_ID.get(top or "", {}).get("name", top or "empty")
            self._set_private_note(pid, f"Top of {deck_name} discard: {label}", top)
            self._log(f"{ap.name} read the {deck_name} ledgers (Deep Research).", "note")
        elif mode == "discard_random":
            if not deck_name or deck_name not in D.DECK_NAMES:
                raise MoveError("Choose a deck.")
            disc = self.discards.get(deck_name, [])
            if disc:
                pick = disc[rng.randrange(len(disc))]
                label = D.CARD_BY_ID.get(pick, {}).get("name", pick)
                self._set_private_note(pid, f"{deck_name} discard (random): {label}", pick)
            else:
                self._set_private_note(pid, f"{deck_name} discard pile is empty.")
            self._log(f"{ap.name} cross-referenced the {deck_name} records (Deep Research).", "note")
        elif mode == "witness":
            if not target_id:
                raise MoveError("Choose a witness.")
            target = self.player_by_id(target_id)
            if not target or target.status != "active" or target.id == pid:
                raise MoveError("Invalid witness.")
            if target.location != ap.location:
                raise MoveError("Witness must be at the Scrolls.")
            if not target.action_card_ids:
                self._set_private_note(pid, f"{target.name} carries no action cards.")
            else:
                pick = target.action_card_ids[rng.randrange(len(target.action_card_ids))]
                label = D.CARD_BY_ID.get(pick, {}).get("name", pick)
                self._set_private_note(pid, f"{target.name}'s hand includes: {label}", pick)
            self._log(f"{ap.name} interviewed {target.name} at the Scrolls (Deep Research).", "note")
        else:
            raise MoveError("Unknown investigation type.")
        self.pending_ui_action.pop(pid, None)

    def over_hand_limit(self, player: PlayerState) -> bool:
        return len(player.action_card_ids) > self._rule("handLimit")

    # ---- location actions ----
    def do_location_action(self, actor_id: str, act_id: str) -> dict:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        ap = self.active_player()
        if not ap or ap.id != actor_id:
            raise MoveError("Not your turn.")
        loc_acts = D.LOCATION_ACTIONS.get(ap.location, [])
        defn = next((a for a in loc_acts if a["id"] == act_id), None)
        if not defn:
            raise MoveError("Unknown action.")
        if ap.gold < defn.get("cost", 0):
            raise MoveError("Not enough gold.")
        if defn.get("requiresThrone"):
            t = self.throne
            if ap.id not in (t.get("kingControllerId"), t.get("queenControllerId")):
                raise MoveError("Throne controller only.")
        if act_id == "recover" and not (ap.wounded or ap.rep <= 2):
            raise MoveError("Nothing to recover.")

        cost = defn.get("cost", 0)
        if cost:
            ap.gold -= cost

        if act_id == "petition":
            before = ap.rep
            ap.rep = min(4, ap.rep + 1)
            msg = f"→ {ap.rep}" if ap.rep > before else "unchanged (cap 4)"
            self._log(f"{ap.name} petitioned the Throne. Reputation {msg}.")
        elif act_id == "work_room":
            ap.gold += 2
            self._log(f"{ap.name} worked the room at the Tavern. +2 gold → {ap.gold}.")
        elif act_id == "scavenge":
            ap.gold += 3
            self._log(f"{ap.name} scavenged the Graveyard. +3 gold → {ap.gold}.")
            self._maybe_offer_rep_loss(ap.id, -1, "Scavenge")
        elif act_id == "buy_grave":
            self._log(f"{ap.name} paid {cost} gold for a Graveyard card.")
            self.adjust_corruption(1, "bought a Graveyard card")
            self.draw_card(ap.id, "Graveyard")
        elif act_id == "recover":
            if ap.wounded:
                ap.wounded = False
                self._log(f"{ap.name} recovered at the College: Wound removed.")
            else:
                self._log(f"{ap.name} recovered at the College.")
                self.adjust_rep(ap.id, 1, "Recover")
        elif act_id in ("buy", "backroom", "study", "research", "arm"):
            loc_name = next(l["name"] for l in D.LOCATIONS if l["id"] == ap.location)
            self._log(f"{ap.name} paid {cost} gold at the {loc_name}.")
            self.draw_card(ap.id, defn["deck"])
        elif act_id == "haggle":
            self._log(f"{ap.name} haggled at the Market (paid {cost} gold).")
            market = self.decks.setdefault("Market", [])
            a = market.pop(0) if market else None
            b = market.pop(0) if market else None
            while not a or not b:
                self.decks["Market"] = D.CARDS_BY_DECK["Market"][:]
                random.shuffle(self.decks["Market"])
                market = self.decks["Market"]
                if not a:
                    a = market.pop(0) if market else None
                if not b:
                    b = market.pop(0) if market else None
            self.pending_keep_one[ap.id] = {"deck": "Market", "cards": [a, b]}
            return {"ok": True, "keepOne": {"deck": "Market", "cards": [a, b]}}
        elif act_id == "royal_command":
            self._log(f"{ap.name} exercises Royal Command.", "event")
            self.pending_ui_action[ap.id] = {"kind": "royal_command", "controllerId": ap.id}
            return {"ok": True}
        elif act_id == "serious_duel":
            if ap.location != "barracks":
                raise MoveError("Must be at the Barracks.")
            if ap.serious_duel_used:
                raise MoveError("Serious Duel already used this game.")
            self._log(f"{ap.name} starts a Serious Duel at the Barracks.", "event")
            self.pending_ui_action[ap.id] = {
                "kind": "duel",
                "attackerId": ap.id,
                "serious": True,
            }
            return {"ok": True}
        elif act_id == "deep_research":
            if ap.location != "scrolls":
                raise MoveError("Must be at the Scrolls.")
            self._log(f"{ap.name} begins Deep Research at the Scrolls (paid {cost} gold).", "event")
            self.pending_ui_action[ap.id] = {"kind": "deep_research", "researcherId": ap.id}
            return {"ok": True}
        else:
            self._log(f"{ap.name} used {defn['name']} (resolve at the table).", "note")
            return {"ok": True, "manual": True}
        return {"ok": True}

    # ---- public role abilities (Phase 14) ----
    def use_role_ability(self, actor_id: str, ability_id: str, target_id: Optional[str] = None) -> dict:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        ap = self.active_player()
        if not ap or ap.id != actor_id:
            raise MoveError("Not your turn.")
        fx = D.ROLE_ABILITY_EFFECTS.get(ability_id)
        if not fx:
            raise MoveError("Unknown ability.")
        if ap.public_role_id != fx["role"]:
            raise MoveError("Your public role does not grant that ability.")
        locs = fx.get("locations")
        if locs and ap.location not in locs:
            raise MoveError("Wrong location for this ability.")
        if fx.get("once_per_round") and ability_id in ap.abilities_used_this_round:
            raise MoveError("Already used this round.")
        if fx.get("requires_royal_throne"):
            t = self.throne
            if not t.get("kingControllerId") and not t.get("queenControllerId"):
                raise MoveError("No royal controls the Throne.")
        if fx.get("requires_royal_role_lost") and not self.royal_role_lost:
            raise MoveError("No royal has lost a role yet.")
        cost = int(fx.get("gold_cost", 0))
        if ap.gold < cost:
            raise MoveError("Not enough gold.")
        target: Optional[PlayerState] = None
        if fx.get("needs_target"):
            if not target_id:
                raise MoveError("Target required.")
            target = self.player_by_id(target_id)
            if not target or target.status != "active":
                raise MoveError("Invalid target.")
            if fx.get("same_location") and target.location != ap.location:
                raise MoveError("Target must be at your location.")
            if fx.get("target_not_self") and target.id == ap.id:
                raise MoveError("Invalid target.")
        if cost:
            ap.gold -= cost
        aname = fx.get("name", ability_id)
        self._log(f"{ap.name} uses {aname} (public role ability).", "event")
        if fx.get("gold_transfer") and target:
            take = min(int(fx["gold_transfer"]), target.gold)
            if take > 0:
                target.gold -= take
                ap.gold += take
                self._log(f"{ap.name} steals {take} gold from {target.name}.")
            else:
                self._log(f"{target.name} has no gold to steal.", "note")
        elif fx.get("peek_card") and target:
            if target.action_card_ids:
                pick = target.action_card_ids[random.randrange(len(target.action_card_ids))]
                label = D.CARD_BY_ID.get(pick, {}).get("name", pick)
                self._set_private_note(ap.id, f"{target.name}'s hand includes: {label}", pick)
            else:
                self._set_private_note(ap.id, f"{target.name} has no action cards.")
            self._log(f"{ap.name} peeked at {target.name}'s hand.", "note")
        elif fx.get("rumour") and target:
            if target.gold >= 1:
                target.gold -= 1
                ap.gold += 1
                self._log(f"{target.name} paid 1 gold to {ap.name} to silence the Rumour.")
            else:
                self._maybe_offer_rep_loss(target.id, -1, aname, trigger="rumour")
        elif fx.get("rep_gain"):
            self.adjust_rep(ap.id, int(fx["rep_gain"]), aname)
        elif fx.get("rep_loss") and target:
            self._maybe_offer_rep_loss(target.id, -int(fx["rep_loss"]), aname)
        elif fx.get("gold_gain"):
            self.adjust_gold(ap.id, int(fx["gold_gain"]), aname)
        elif fx.get("draw_deck"):
            self.draw_card(ap.id, fx["draw_deck"])
        if fx.get("once_per_round"):
            ap.abilities_used_this_round.append(ability_id)
        return {"ok": True}

    def resolve_keep_one(self, pid: str, deck: str, keep_id: str, drop_id: str) -> None:
        p = self.player_by_id(pid)
        if not p:
            raise MoveError("Unknown player.")
        pending = self.pending_keep_one.pop(pid, None)
        if not pending or keep_id not in pending["cards"]:
            raise MoveError("Invalid keep-one choice.")
        p.action_card_ids.append(keep_id)
        self.discards.setdefault(deck, []).append(drop_id)
        self._log(f"{p.name} kept one card and discarded the other.")

    # ---- role discard ----
    def require_role_discard(self, player_id: str, reason: str, *, after: Optional[dict] = None) -> None:
        p = self.player_by_id(player_id)
        if not p or p.status != "active":
            raise MoveError("Invalid player for role discard.")
        self.pending_role_discard[player_id] = {"reason": reason, "after": after or {}}

    def _role_bonus(self, p: PlayerState, key: str) -> int:
        if not p.public_role_id:
            return 0
        return int(D.ROLE_META.get(p.public_role_id, {}).get(key, 0) or 0)

    def apply_role_discard(self, pid: str, slot: str, role_id: str, *, actor_id: Optional[str] = None) -> None:
        p = self.player_by_id(pid)
        if not p:
            raise MoveError("Unknown player.")
        pending = self.pending_role_discard.get(pid)
        if pending and actor_id and actor_id != pid:
            raise MoveError("Only the affected player can choose which role to lose.")
        meta = D.ROLE_META.get(role_id, {})
        name = meta.get("name", role_id)
        if slot == "public" and p.public_role_id == role_id:
            p.public_role_id = None
            self._log(f"{p.name} lost their public role: {name}.")
        elif slot == "hidden" and role_id in p.hidden_role_ids:
            p.hidden_role_ids.remove(role_id)
            self._log(f"{p.name} discarded a hidden role — revealed: {name}.")
        elif slot == "extra" and role_id in p.extra_shown_role_ids:
            p.extra_shown_role_ids.remove(role_id)
            self._log(f"{p.name} lost a shown role: {name}.")
        else:
            raise MoveError("Invalid role discard.")

        if role_id == "cursedone":
            self.pending_role_discard.pop(pid, None)
            self.declare_winner("loyal", "The Cursed One was revealed")
            return

        if role_id in ("king", "queen"):
            self.royal_role_lost = True

        t = self.throne
        if role_id == "king" and t.get("kingControllerId") == pid:
            t["kingControllerId"] = None
            self._log(f"{p.name} is removed as King; the crown's control is lost.", "event")
        if role_id == "queen" and t.get("queenControllerId") == pid:
            t["queenControllerId"] = None
            self._log(f"{p.name} is removed as Queen; the crown's control is lost.", "event")

        remaining = (1 if p.public_role_id else 0) + len(p.hidden_role_ids) + len(p.extra_shown_role_ids)
        if remaining == 0 and p.status == "active":
            p.status = "eliminated"
            self._log(f"{p.name} has no role cards left and is eliminated.", "event")
            if not self.winner:
                self.set_innocent_elims(self.innocent_elims + 1, f"{p.name} eliminated")

        after = self.pending_role_discard.pop(pid, None)
        if after and not self.winner:
            kind = after.get("after", {}).get("kind")
            if kind == "vote_accuse":
                self.adjust_corruption(2, "Cursed not revealed by accusation")
            elif kind == "vote_banish" and after.get("after", {}).get("was_innocent"):
                self.adjust_corruption(1, "innocent banished")

    def grant_extra_shown_role(self, caller_id: str, reason: str = "") -> None:
        p = self.player_by_id(caller_id)
        if not p:
            return
        if p.extra_shown_role_ids:
            self._log(f"{p.name} already has an extra shown role; none granted.", "note")
            return
        if not self.undealt_role_ids:
            self._log("No undealt roles remain to grant.", "note")
            return
        rid = self.undealt_role_ids.pop(0)
        p.extra_shown_role_ids.append(rid)
        rname = D.ROLE_META.get(rid, {}).get("name", rid)
        self._log(f"{p.name} gains an extra shown role: {rname}" + (f" ({reason})" if reason else "") + ".")

    # ---- throne & succession ----
    def set_throne_controller(self, crown: str, player_id: str, reason: str = "") -> None:
        t = self.throne
        if crown == "king":
            t["kingControllerId"] = player_id
        elif crown == "queen":
            t["queenControllerId"] = player_id
        elif crown == "successor":
            t["successorId"] = player_id
        else:
            raise MoveError("Invalid crown.")
        if player_id and player_id not in t["claimOrder"]:
            t["claimOrder"].append(player_id)
        p = self.player_by_id(player_id)
        self._log(f"{p.name if p else '?'} takes the Throne as {crown}" + (f" ({reason})" if reason else "") + ".", "event")

    def clear_throne_controller(self, crown: str) -> None:
        t = self.throne
        key = {"king": "kingControllerId", "queen": "queenControllerId", "successor": "successorId"}.get(crown)
        if not key:
            raise MoveError("Invalid crown.")
        who = t.get(key)
        t[key] = None
        p = self.player_by_id(who) if who else None
        self._log("Throne control cleared" + (f" (was {p.name} as {crown})" if p else "") + ".", "event")

    def open_succession(self) -> None:
        self.throne["succession"] = {"open": True, "claims": []}
        self._log("Succession opened — claimants may move to the Throne and claim.", "system")

    def close_succession(self) -> None:
        self.throne["succession"] = {"open": False, "claims": []}
        self._log("Succession closed.", "system")

    def add_succession_claim(self, player_id: str, role_id: str) -> None:
        succ = self.throne.get("succession", {})
        if not succ.get("open"):
            raise MoveError("Succession is not open.")
        p = self.player_by_id(player_id)
        if not p or p.status != "active":
            raise MoveError("Invalid player.")
        if p.location != "throne":
            raise MoveError("Claimant must be at the Throne.")
        meta = D.SUCCESSION.get(role_id)
        if not meta:
            raise MoveError("Invalid succession role.")
        if role_id not in self._all_role_ids(p):
            raise MoveError("You must hold that succession role.")
        if any(c["playerId"] == player_id for c in succ.get("claims", [])):
            raise MoveError("You already have a claim recorded.")
        claim = {"id": _uid("sc"), "playerId": player_id, "roleId": role_id,
                 "rank": meta["rank"], "startRound": self.round}
        self.throne["succession"]["claims"].append(claim)
        rname = D.ROLE_META.get(role_id, {}).get("name", role_id)
        self._log(f"{p.name} claims the Throne as {rname}.", "event")

    def claim_rounds_left(self, claim: dict) -> int:
        window = D.SUCCESSION.get(claim["roleId"], {}).get("window", 0)
        return (claim["startRound"] + window) - self.round

    def resolve_succession_claim(self, claim_id: str) -> None:
        succ = self.throne["succession"]
        claim = next((c for c in succ["claims"] if c["id"] == claim_id), None)
        if not claim:
            raise MoveError("Claim not found.")
        if self.claim_rounds_left(claim) > 0:
            raise MoveError("Claim has not matured.")
        p = self.player_by_id(claim["playerId"])
        self.throne["successorId"] = claim["playerId"]
        pid = claim["playerId"]
        if pid not in self.throne["claimOrder"]:
            self.throne["claimOrder"].append(pid)
        rname = D.ROLE_META.get(claim["roleId"], {}).get("name", claim["roleId"])
        self._log(f"{p.name if p else '?'} survives the claim window and takes the Throne as {rname}.", "system")
        self.throne["succession"] = {"open": False, "claims": []}

    def remove_succession_claim(self, claim_id: str) -> None:
        succ = self.throne["succession"]
        succ["claims"] = [c for c in succ["claims"] if c["id"] != claim_id]

    # ---- contracts ----
    def add_contract(self, a_id: str, b_id: str, promise: str) -> None:
        self.contracts.append(Contract(id=_uid("ct"), a_id=a_id, b_id=b_id, promise=promise))
        a, b = self.player_by_id(a_id), self.player_by_id(b_id)
        self._log(f"Blood Contract sworn between {a.name if a else '?'} and {b.name if b else '?'}.", "note")

    def resolve_contract(self, contract_id: str, status: str, breaker_id: Optional[str] = None) -> None:
        c = next((x for x in self.contracts if x.id == contract_id), None)
        if not c:
            raise MoveError("Contract not found.")
        c.status = status
        if status == "broken":
            who = self.player_by_id(breaker_id) if breaker_id else None
            self._log(f"Blood Contract broken by {who.name if who else '?'}.", "note")
            if breaker_id:
                self.adjust_rep(breaker_id, -1, "broke a Blood Contract")
            self.adjust_corruption(1, "broken Blood Contract")
        else:
            self._log("Blood Contract fulfilled.", "note")

    def _eligible_reactions(self, player: PlayerState, trigger: str) -> list[str]:
        cards: list[str] = []
        for cid in player.action_card_ids:
            fx = D.REACTION_EFFECTS.get(cid)
            if not fx or fx.get("trigger") != trigger:
                continue
            if fx.get("requires_royal_throne"):
                t = self.throne
                if not t.get("kingControllerId") and not t.get("queenControllerId"):
                    continue
            if fx.get("requires_location") and player.location != fx["requires_location"]:
                continue
            cards.append(cid)
        return cards

    def _offer_reaction(self, target_id: str, trigger: str, resume: dict) -> bool:
        target = self.player_by_id(target_id)
        if not target or target.status != "active":
            return False
        cards = self._eligible_reactions(target, trigger)
        if not cards:
            return False
        self.pending_ui_action[target_id] = {
            "kind": "reaction",
            "trigger": trigger,
            "cards": cards,
            "resume": resume,
        }
        if target.is_bot:
            self._bot_resolve_pending(target_id, random.Random())
        return True

    def resolve_reaction(self, pid: str, card_id: Optional[str] = None) -> None:
        pending = self.pending_ui_action.get(pid)
        if not pending or pending.get("kind") != "reaction":
            raise MoveError("No reaction offered.")
        resume = pending.get("resume") or {}
        if card_id:
            if card_id not in pending.get("cards", []):
                raise MoveError("That reaction is not available.")
            p = self.player_by_id(pid)
            if not p or card_id not in p.action_card_ids:
                raise MoveError("Card not in hand.")
            fx = D.REACTION_EFFECTS.get(card_id, {})
            cname = D.CARD_BY_ID.get(card_id, {}).get("name", card_id)
            self.discard_card(pid, card_id, "reaction")
            if fx.get("cost_rep"):
                self.adjust_rep(pid, -int(fx["cost_rep"]), cname)
            action = fx.get("action")
            if action == "flee_duel":
                att_id = resume.get("attackerId")
                if att_id:
                    self.pending_ui_action.pop(att_id, None)
                self._log(f"{p.name} plays Flee — duel cancelled. Move up to 2 spaces.", "event")
                self.pending_ui_action[pid] = {"kind": "reaction_move", "playerId": pid, "maxSteps": 2}
                return
            if action == "quick_escape":
                self._log(f"{p.name} plays Quick Escape — reputation loss avoided. Move 1 space.", "event")
                self.pending_ui_action[pid] = {"kind": "reaction_move", "playerId": pid, "maxSteps": 1}
                return
            if resume.get("effect") == "duel_consequence":
                self._log(f"{p.name} played {cname} — duel consequence cancelled.", "event")
                self.pending_ui_action.pop(pid, None)
                return
            self._log(f"{p.name} played {cname} — the effect was cancelled.", "event")
            if resume.get("effect") == "cancel_duel":
                att_id = resume.get("attackerId")
                if att_id:
                    self.pending_ui_action.pop(att_id, None)
            self.pending_ui_action.pop(pid, None)
            return
        self.pending_ui_action.pop(pid, None)
        self._resume_effect(resume)

    def reaction_move(self, pid: str, location_id: str) -> None:
        pending = self.pending_ui_action.get(pid)
        if not pending or pending.get("kind") != "reaction_move":
            raise MoveError("No reaction move pending.")
        p = self.player_by_id(pid)
        if not p:
            raise MoveError("Unknown player.")
        if location_id not in self.legal_moves(p):
            raise MoveError("That location is not reachable.")
        self.move_player(pid, location_id, manual=True)
        pending["maxSteps"] = int(pending.get("maxSteps", 1)) - 1
        if pending["maxSteps"] <= 0:
            self.pending_ui_action.pop(pid, None)

    def _is_royal_or_throne(self, p: PlayerState) -> bool:
        roles = self._all_role_ids(p)
        if roles & {"king", "queen"}:
            return True
        t = self.throne
        return p.id in (t.get("kingControllerId"), t.get("queenControllerId"), t.get("successorId"))

    def _resume_effect(self, resume: dict) -> None:
        effect = resume.get("effect")
        if effect == "rep_adjust":
            self.adjust_rep(
                resume["targetId"],
                int(resume.get("delta", 0)),
                resume.get("reason", ""),
            )
        elif effect == "callout_resolve":
            self._resolve_call_out(
                resume["callerId"],
                resume["targetId"],
                resume["roleId"],
            )
        elif effect == "vote_discard":
            target_id = resume["targetId"]
            after = resume.get("after") or {}
            self.require_role_discard(target_id, "vote", after=after)
        elif effect == "cancel_duel":
            pass
        elif effect == "duel_consequence":
            self._apply_duel_consequence_only(resume)

    def _resolve_call_out(self, caller_id: str, target_id: str, role_id: str) -> None:
        caller = self.player_by_id(caller_id)
        target = self.player_by_id(target_id)
        if not caller or not target:
            return
        rname = D.ROLE_META.get(role_id, {}).get("name", role_id)
        correct = role_id in target.hidden_role_ids
        if correct:
            self._log(f"Correct — {rname} is revealed.")
            self.apply_role_discard(target_id, "hidden", role_id)
            if not self.winner:
                self.grant_extra_shown_role(caller_id, "Call Out")
        else:
            self._log(f"Wrong — {target.name} reveals nothing. {caller.name} loses 1 Reputation.")
            self.adjust_rep(caller_id, -1, "wrong Call Out")

    def _can_offer_false_trail(self, player: PlayerState) -> bool:
        if player.status != "active":
            return False
        if "spy" not in self._all_role_ids(player):
            return False
        if player.location not in ("tavern", "market"):
            return False
        if "false_trail" in player.abilities_used_this_game:
            return False
        return any(
            x.status == "active" and x.id != player.id and x.location == player.location
            for x in self.players
        )

    def _next_sanctuary_queens(self) -> list[PlayerState]:
        queens: list[PlayerState] = []
        for p in self.players:
            if p.status != "active":
                continue
            if "queen" not in self._all_role_ids(p):
                continue
            if "sanctuary" in p.abilities_used_this_round:
                continue
            queens.append(p)
        return queens

    def _offer_sanctuary(
        self,
        victim_id: str,
        delta: int,
        reason: str,
        *,
        trigger: str = "rep_loss",
    ) -> bool:
        if delta >= 0:
            return False
        queens = self._next_sanctuary_queens()
        if not queens:
            return False
        queen = queens[0]
        victim = self.player_by_id(victim_id)
        if not victim:
            return False
        self.pending_ui_action[queen.id] = {
            "kind": "sanctuary",
            "queenId": queen.id,
            "victimId": victim_id,
            "delta": delta,
            "reason": reason,
            "trigger": trigger,
            "remainingQueenIds": [q.id for q in queens[1:]],
        }
        if queen.is_bot:
            self._bot_resolve_pending(queen.id, random.Random())
        return True

    def resolve_sanctuary(self, pid: str, *, accept: bool) -> None:
        pending = self.pending_ui_action.get(pid)
        if not pending or pending.get("kind") != "sanctuary":
            raise MoveError("No Sanctuary pending.")
        queen = self.player_by_id(pid)
        if not queen:
            raise MoveError("Unknown player.")
        victim_id = str(pending.get("victimId", ""))
        delta = int(pending.get("delta", 0))
        reason = str(pending.get("reason", ""))
        trigger = str(pending.get("trigger", "rep_loss"))
        remaining = list(pending.get("remainingQueenIds") or [])
        self.pending_ui_action.pop(pid, None)
        victim = self.player_by_id(victim_id)
        if accept:
            queen.abilities_used_this_round.append("sanctuary")
            vname = victim.name if victim else "a player"
            self._log(f"{queen.name} uses Sanctuary — {vname} avoids the reputation loss.", "event")
            return
        self._log(f"{queen.name} declines Sanctuary.", "note")
        while remaining:
            next_id = remaining.pop(0)
            next_queen = self.player_by_id(next_id)
            if (
                not next_queen
                or next_queen.status != "active"
                or "queen" not in self._all_role_ids(next_queen)
                or "sanctuary" in next_queen.abilities_used_this_round
            ):
                continue
            self.pending_ui_action[next_queen.id] = {
                "kind": "sanctuary",
                "queenId": next_queen.id,
                "victimId": victim_id,
                "delta": delta,
                "reason": reason,
                "trigger": trigger,
                "remainingQueenIds": remaining,
            }
            if next_queen.is_bot:
                self._bot_resolve_pending(next_queen.id, random.Random())
            return
        self._finish_rep_loss(victim_id, delta, reason, trigger=trigger, skip_sanctuary=True)

    def _finish_rep_loss(
        self,
        target_id: str,
        delta: int,
        reason: str,
        *,
        trigger: str = "rep_loss",
        skip_sanctuary: bool = False,
    ) -> bool:
        if delta >= 0:
            self.adjust_rep(target_id, delta, reason)
            return False
        if not skip_sanctuary and self._offer_sanctuary(target_id, delta, reason, trigger=trigger):
            return True
        if self._offer_reaction(
            target_id,
            trigger,
            {
                "effect": "rep_adjust",
                "targetId": target_id,
                "delta": delta,
                "reason": reason,
            },
        ):
            return True
        self.adjust_rep(target_id, delta, reason)
        return False

    def _maybe_offer_rep_loss(
        self,
        target_id: str,
        delta: int,
        reason: str,
        *,
        trigger: str = "rep_loss",
    ) -> bool:
        if delta >= 0:
            self.adjust_rep(target_id, delta, reason)
            return False
        target = self.player_by_id(target_id)
        if target and self._can_offer_false_trail(target):
            self.pending_ui_action[target_id] = {
                "kind": "false_trail",
                "playerId": target_id,
                "delta": delta,
                "reason": reason,
                "trigger": trigger,
            }
            if target.is_bot:
                self._bot_resolve_pending(target_id, random.Random())
            return True
        return self._finish_rep_loss(target_id, delta, reason, trigger=trigger)

    def resolve_false_trail(
        self,
        pid: str,
        *,
        accept: bool,
        redirect_id: Optional[str] = None,
    ) -> None:
        pending = self.pending_ui_action.get(pid)
        if not pending or pending.get("kind") != "false_trail":
            raise MoveError("No False Trail pending.")
        delta = int(pending.get("delta", 0))
        reason = str(pending.get("reason", ""))
        trigger = str(pending.get("trigger", "rep_loss"))
        self.pending_ui_action.pop(pid, None)
        player = self.player_by_id(pid)
        if not player:
            raise MoveError("Unknown player.")
        if accept:
            if not redirect_id:
                raise MoveError("Redirect target required.")
            redirect = self.player_by_id(redirect_id)
            if not redirect or redirect.status != "active":
                raise MoveError("Invalid target.")
            if redirect.id == pid:
                raise MoveError("Invalid target.")
            if redirect.location != player.location:
                raise MoveError("Target must be at your location.")
            player.abilities_used_this_game.append("false_trail")
            self._log(
                f"{player.name} uses False Trail — {redirect.name} takes the reputation hit instead.",
                "event",
            )
            self._finish_rep_loss(redirect_id, delta, reason, trigger=trigger)
        else:
            self._log(f"{player.name} declines False Trail.", "note")
            self._finish_rep_loss(pid, delta, reason, trigger=trigger)

    # ---- call out ----
    def call_out(self, caller_id: str, target_id: str, role_id: str) -> None:
        caller = self.player_by_id(caller_id)
        target = self.player_by_id(target_id)
        if not caller or not target:
            raise MoveError("Unknown player.")
        rname = D.ROLE_META.get(role_id, {}).get("name", role_id)
        self._log(f"{caller.name} calls out {target.name} as {rname}!")
        self.adjust_corruption(2, "Call Out")
        if self._offer_reaction(
            target_id,
            "callout",
            {
                "effect": "callout_resolve",
                "callerId": caller_id,
                "targetId": target_id,
                "roleId": role_id,
            },
        ):
            return
        self._resolve_call_out(caller_id, target_id, role_id)

    # ---- trade ----
    def apply_trade(self, a_id: str, b_id: str, gold_ab: int, gold_ba: int,
                    card_ab_idx: Optional[int], card_ba_idx: Optional[int]) -> None:
        a, b = self.player_by_id(a_id), self.player_by_id(b_id)
        if not a or not b:
            raise MoveError("Unknown player.")
        g_ab = min(gold_ab, a.gold)
        g_ba = min(gold_ba, b.gold)
        if g_ab:
            a.gold -= g_ab
            b.gold += g_ab
        if g_ba:
            b.gold -= g_ba
            a.gold += g_ba
        if card_ab_idx is not None and 0 <= card_ab_idx < len(a.action_card_ids):
            b.action_card_ids.append(a.action_card_ids.pop(card_ab_idx))
        if card_ba_idx is not None and 0 <= card_ba_idx < len(b.action_card_ids):
            a.action_card_ids.append(b.action_card_ids.pop(card_ba_idx))
        self._log(f"{a.name} and {b.name} traded.")

    # ---- social: challenge, vote, duel, royal claim ----
    def resolve_challenge(self, claimant_id: str, challenger_id: str, power: str, valid: bool) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        claimant = self.player_by_id(claimant_id)
        challenger = self.player_by_id(challenger_id)
        if not claimant or not challenger:
            raise MoveError("Unknown player.")
        label = power or "their power"
        if valid:
            self._log(
                f"{claimant.name} proved \"{label}\". {challenger.name} challenged wrongly and must lose a role."
            )
            self.require_role_discard(challenger_id, "challenge")
        else:
            self._log(f"{claimant.name}'s \"{label}\" was a failed bluff and they must lose a role.")
            self.require_role_discard(claimant_id, "challenge")

    def _apply_vote_bribes(
        self,
        bribes: Optional[list[dict]],
        votes: dict[str, str],
    ) -> None:
        for br in bribes or []:
            briber_id = str(br.get("briberId", ""))
            target_id = str(br.get("targetId", ""))
            side = br.get("side")
            accepted = bool(br.get("accepted"))
            briber = self.player_by_id(briber_id)
            target = self.player_by_id(target_id)
            if not briber or not target or briber.status != "active" or target.status != "active":
                raise MoveError("Invalid bribe players.")
            if briber_id == target_id:
                raise MoveError("Cannot bribe yourself.")
            if D.VOTE_BRIBE_CARD not in briber.action_card_ids:
                raise MoveError("Bribe card not in hand.")
            if side not in ("yes", "no"):
                raise MoveError("Bribe needs yes or no side.")
            if accepted:
                if briber.gold < 1:
                    raise MoveError("Not enough gold to bribe.")
                briber.gold -= 1
                target.gold += 1
                votes[target_id] = side
                self._log(
                    f"{target.name} accepted {briber.name}'s bribe and votes {side}.",
                    "note",
                )
            else:
                self._log(f"{target.name} refused {briber.name}'s bribe.", "note")
            self.discard_card(briber_id, D.VOTE_BRIBE_CARD, "vote")

    def apply_formal_vote(
        self,
        vtype: str,
        target_id: str,
        votes: dict[str, str],
        bonus_yes: int = 0,
        bonus_no: int = 0,
        *,
        emergency: bool = False,
        vote_cards: Optional[list[dict]] = None,
        bribes: Optional[list[dict]] = None,
        role_vote_powers: Optional[list[dict]] = None,
    ) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        target = self.player_by_id(target_id)
        if not target:
            raise MoveError("Unknown target.")
        self._apply_vote_bribes(bribes, votes)
        yes = bonus_yes
        no = bonus_no
        for vc in vote_cards or []:
            vpid = str(vc.get("playerId", ""))
            cid = str(vc.get("cardId", ""))
            side = vc.get("side")
            pl = self.player_by_id(vpid)
            if not pl or pl.status != "active":
                raise MoveError("Invalid vote card player.")
            if cid not in pl.action_card_ids:
                raise MoveError("Vote card not in hand.")
            bonus = D.VOTE_CARD_BONUSES.get(cid)
            if bonus is None:
                raise MoveError("Not a vote card.")
            req = D.VOTE_CARD_REQUIRES.get(cid, {})
            req_loc = req.get("location")
            if req_loc and pl.location != req_loc:
                loc_name = next(
                    (l["name"] for l in D.LOCATIONS if l["id"] == req_loc),
                    req_loc,
                )
                raise MoveError(f"Must be at {loc_name} to play this card.")
            if side == "yes":
                yes += bonus
            elif side == "no":
                no += bonus
            else:
                raise MoveError("Vote card needs yes or no side.")
            cname = D.CARD_BY_ID.get(cid, {}).get("name", cid)
            self.discard_card(vpid, cid, "vote")
            self._log(f"{pl.name} played {cname} (+{bonus} {side}).", "note")
        for rvp in role_vote_powers or []:
            pid = str(rvp.get("playerId", ""))
            role_id = str(rvp.get("roleId", ""))
            side = rvp.get("side")
            pl = self.player_by_id(pid)
            if not pl or pl.status != "active":
                raise MoveError("Invalid role vote player.")
            fx = D.ROLE_VOTE_ABILITIES.get(role_id)
            if not fx:
                raise MoveError("Not a vote role power.")
            if role_id not in self._all_role_ids(pl):
                raise MoveError("Player does not hold that role.")
            req_loc = fx.get("location")
            if req_loc and pl.location != req_loc:
                loc_name = next(
                    (l["name"] for l in D.LOCATIONS if l["id"] == req_loc),
                    req_loc,
                )
                raise MoveError(f"Must be at {loc_name} to use {fx.get('name', role_id)}.")
            bonus = int(fx.get("bonus", 0))
            if side == "yes":
                yes += bonus
            elif side == "no":
                no += bonus
            else:
                raise MoveError("Role vote power needs yes or no side.")
            self._log(
                f"{pl.name} used {fx.get('name', role_id)} (+{bonus} {side}).",
                "note",
            )
        for p in self.players:
            if p.status != "active":
                continue
            if emergency and p.location in ("throne", "market") and p.id not in votes:
                raise MoveError(f"{p.name} must vote (Emergency Council).")
            weight = 2 if p.rep >= 5 else 1
            v = votes.get(p.id)
            if v == "yes":
                yes += weight
            elif v == "no":
                no += weight
        passed = yes > no
        if vtype == "accuse":
            self._log(
                f"Accusation vote against {target.name}: "
                f"{'PASSES' if passed else 'fails'} ({yes}–{no})."
            )
            if passed:
                after = {"kind": "vote_accuse"}
                if self._offer_reaction(
                    target_id,
                    "vote_pass",
                    {"effect": "vote_discard", "targetId": target_id, "after": after},
                ):
                    return
                self.require_role_discard(target_id, "vote", after=after)
        else:
            was_innocent = "cursedone" not in target.hidden_role_ids
            self._log(
                f"Banishment vote against {target.name}: "
                f"{'PASSES' if passed else 'fails'} ({yes}–{no})."
            )
            if passed:
                after = {"kind": "vote_banish", "was_innocent": was_innocent}
                if self._offer_reaction(
                    target_id,
                    "vote_pass",
                    {"effect": "vote_discard", "targetId": target_id, "after": after},
                ):
                    return
                self.require_role_discard(target_id, "vote", after=after)

    def duel_flee(
        self,
        defender_id: str,
        *,
        att_card_ids: Optional[list[str]] = None,
    ) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        defender = self.player_by_id(defender_id)
        if not defender:
            raise MoveError("Unknown defender.")
        att_cards = list(att_card_ids or [])
        if "iron_gauntlet" in att_cards:
            raise MoveError("Iron Gauntlet — defender cannot flee.")
        self._log(
            f"{defender.name} plays Flee — the duel is cancelled. Move up to 2 spaces (manual).",
            "event",
        )
        self.adjust_rep(defender_id, -1, "Flee")

    def duel_apply_consequence(
        self,
        attacker_id: str,
        defender_id: str,
        att_bonus: int,
        def_bonus: int,
        serious: bool,
        consequence: str,
        rng: random.Random,
        *,
        att_card_ids: Optional[list[str]] = None,
        def_card_ids: Optional[list[str]] = None,
    ) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        att = self.player_by_id(attacker_id)
        defn = self.player_by_id(defender_id)
        if not att or not defn:
            raise MoveError("Unknown duelist.")
        att_cards = list(att_card_ids or [])
        def_cards = list(def_card_ids or [])
        att_bonus += self._consume_duel_cards(att, att_cards)
        def_bonus += self._consume_duel_cards(defn, def_cards)
        a_total = self._role_bonus(att, "duelBonusAttack") + att_bonus
        d_total = self._role_bonus(defn, "duelBonusDefence") + def_bonus
        attacker_wins = a_total > d_total
        winner = att if attacker_wins else defn
        loser = defn if attacker_wins else att
        winner_cards = att_cards if attacker_wins else def_cards
        loser_cards = def_cards if attacker_wins else att_cards
        self._log(f"Duel: {winner.name} beat {loser.name} ({a_total}–{d_total}).")
        if "loaded_dice" in loser_cards:
            self._log(f"{loser.name}'s Loaded Dice cancelled the duel loss.", "event")
            return
        if serious:
            att.serious_duel_used = True
        if "dirty_trick" in att_cards + def_cards:
            self.adjust_corruption(1, "Dirty Trick")
        if consequence == "serious":
            self.require_role_discard(loser.id, "serious duel")
        elif consequence == "disarm":
            disarm_n = 3 if "disarm_card" in winner_cards else 2
            count = min(disarm_n, len(loser.action_card_ids))
            for _ in range(count):
                if not loser.action_card_ids:
                    break
                idx = rng.randrange(len(loser.action_card_ids))
                self.discard_card(loser.id, loser.action_card_ids[idx], "Disarm")
        elif consequence == "shame":
            if "shield" in loser_cards:
                self._log(f"{loser.name}'s Shield ignored Shame.", "note")
            elif self._is_royal_or_throne(loser) and self._offer_reaction(
                loser.id,
                "duel_consequence",
                {
                    "effect": "duel_consequence",
                    "consequence": "shame",
                    "loserId": loser.id,
                    "loserCards": loser_cards,
                },
            ):
                return
            else:
                self._maybe_offer_rep_loss(loser.id, -1, "Shame")
        elif consequence == "wound":
            if "parry" in loser_cards:
                self._log(f"{loser.name}'s Parry ignored Wound.", "note")
            else:
                loser.wounded = True
                self._log(f"{loser.name} is Wounded — no hidden powers next turn.")
        elif consequence == "drive":
            if self._is_royal_or_throne(loser) and self._offer_reaction(
                loser.id,
                "duel_consequence",
                {
                    "effect": "duel_consequence",
                    "consequence": "drive",
                    "loserId": loser.id,
                    "loserCards": loser_cards,
                },
            ):
                return
            moves = self.legal_moves(loser)
            dest = moves[0] if moves else loser.location
            if dest != loser.location:
                self.move_player(loser.id, dest, manual=True)
            self._log(f"{loser.name} was Driven Out.", "event")
        elif consequence == "search":
            self._log(
                f"{winner.name} searches {loser.name} — resolve privately "
                "(show a justifying role or lose 1 Rep).",
                "note",
            )
        if attacker_wins and "cursed_blade" in winner_cards:
            self.adjust_corruption(1, "Cursed Blade")
            self._maybe_offer_rep_loss(loser.id, -1, "Cursed Blade")

    def _apply_duel_consequence_only(self, resume: dict) -> None:
        consequence = resume.get("consequence")
        loser = self.player_by_id(resume.get("loserId", ""))
        if not loser:
            return
        loser_cards = resume.get("loserCards") or []
        if consequence == "shame":
            if "shield" in loser_cards:
                self._log(f"{loser.name}'s Shield ignored Shame.", "note")
            else:
                self._maybe_offer_rep_loss(loser.id, -1, "Shame")
        elif consequence == "drive":
            moves = self.legal_moves(loser)
            dest = moves[0] if moves else loser.location
            if dest != loser.location:
                self.move_player(loser.id, dest, manual=True)
            self._log(f"{loser.name} was Driven Out.", "event")

    def royal_claim_unchallenged(self, claimant_id: str, crown: str) -> None:
        self.set_throne_controller(crown, claimant_id, "claim")

    def royal_claim_resolved(self, claimant_id: str, challenger_id: str, crown: str, valid: bool) -> None:
        if valid:
            self.set_throne_controller(crown, claimant_id, "claim upheld")
            challenger = self.player_by_id(challenger_id)
            if challenger:
                self._log(f"{challenger.name} challenged the crown wrongly and must lose a role.")
            self.require_role_discard(challenger_id, "royal claim")
        else:
            claimant = self.player_by_id(claimant_id)
            if claimant:
                self._log(f"{claimant.name}'s claim to the Throne was a bluff — they must lose a role.")
            self.require_role_discard(claimant_id, "royal claim")

    def disarm_random(self, player_id: str, n: int, rng: random.Random) -> int:
        p = self.player_by_id(player_id)
        if not p:
            return 0
        done = 0
        for _ in range(min(n, len(p.action_card_ids))):
            if not p.action_card_ids:
                break
            idx = rng.randrange(len(p.action_card_ids))
            self.discard_card(player_id, p.action_card_ids[idx], "Disarm")
            done += 1
        return done

    def _bot_step_toward(self, start: str, target: str) -> Optional[str]:
        if start == target:
            return None
        queue: list[list[str]] = [[start]]
        seen = {start}
        while queue:
            path = queue.pop(0)
            last = path[-1]
            for nbr in D.CONNECTIONS.get(last, []):
                if nbr in seen:
                    continue
                if nbr == target:
                    return path[1] if len(path) > 1 else nbr
                seen.add(nbr)
                queue.append(path + [nbr])
        return None

    def bot_is_cursed(self, p: PlayerState) -> bool:
        return "cursedone" in p.hidden_role_ids

    def bot_take_turn(self, player_id: str, rng: random.Random) -> None:
        if self.status != STATUS_PLAY or self.winner:
            return
        p = self.player_by_id(player_id)
        if not p or not p.is_bot or p.status != "active":
            raise MoveError("Not a bot's turn.")
        self._bot_resolve_pending(player_id, rng)
        if player_id in self.pending_role_discard:
            self._bot_auto_role_discard(player_id, rng)
            return
        ap = self.active_player()
        if not ap or ap.id != player_id:
            raise MoveError("Not this bot's turn.")
        cursed = self.bot_is_cursed(p)
        moves = self.legal_moves(p)
        if moves and rng.random() < 0.85:
            if not cursed and self.throne.get("succession", {}).get("open"):
                dest = self._bot_step_toward(p.location, "throne") or (rng.choice(moves) if moves else None)
            else:
                dest = self._bot_step_toward(p.location, "graveyard") if cursed else rng.choice(moves)
            if dest:
                self.move_player(p.id, dest, manual=False, actor_id=p.id)
                if self._can_board_move(p):
                    moves2 = self.legal_moves(p)
                    if moves2 and rng.random() < 0.55:
                        dest2 = (
                            self._bot_step_toward(p.location, "throne")
                            if not cursed and self.throne.get("succession", {}).get("open")
                            else rng.choice(moves2)
                        )
                        if dest2:
                            self.move_player(p.id, dest2, manual=False, actor_id=p.id)
        if not cursed and self._bot_try_social(p, rng):
            pass
        elif self._bot_try_succession(p, rng):
            pass
        elif self._bot_try_duel(p, rng):
            pass
        elif self._bot_try_trade(p, rng):
            pass
        elif self._bot_try_play_card(p, rng):
            pass
        else:
            self._bot_act(p, cursed, rng)
        guard = 0
        while self.over_hand_limit(p) and guard < 10:
            if not p.action_card_ids:
                break
            self.discard_card(p.id, p.action_card_ids[0], "hand limit")
            guard += 1
        if cursed and p.location == "graveyard" and self.corruption >= self._rule("finalRiteAt"):
            self._log(f"{p.name} performs the Final Rite at the Graveyard!", "system")
            self.declare_winner("cursed", "Final Rite")
            return
        if not self.winner:
            self.end_turn(p.id)

    def _bot_resolve_pending(self, player_id: str, rng: random.Random) -> bool:
        """Auto-resolve reaction prompts and reaction moves for bots."""
        pending = self.pending_ui_action.get(player_id)
        if pending and pending.get("kind") == "sanctuary":
            if rng.random() < 0.75:
                self.resolve_sanctuary(player_id, accept=True)
            else:
                self.resolve_sanctuary(player_id, accept=False)
            return True
        if pending and pending.get("kind") == "false_trail":
            p = self.player_by_id(player_id)
            if p and rng.random() < 0.75:
                others = [
                    x for x in self.players
                    if x.status == "active" and x.id != player_id and x.location == p.location
                ]
                if others:
                    self.resolve_false_trail(
                        player_id,
                        accept=True,
                        redirect_id=rng.choice(others).id,
                    )
                    return True
            self.resolve_false_trail(player_id, accept=False)
            return True
        if pending and pending.get("kind") == "reaction":
            cards = pending.get("cards") or []
            if cards and rng.random() < 0.75:
                self.resolve_reaction(player_id, rng.choice(cards))
            else:
                self.resolve_reaction(player_id, None)
            return True
        if pending and pending.get("kind") == "reaction_move":
            p = self.player_by_id(player_id)
            if p:
                moves = self.legal_moves(p)
                if moves:
                    self.reaction_move(player_id, rng.choice(moves))
                    if player_id in self.pending_ui_action:
                        moves2 = self.legal_moves(p)
                        if moves2 and int(self.pending_ui_action[player_id].get("maxSteps", 0)) > 0:
                            self.reaction_move(player_id, rng.choice(moves2))
            else:
                self.pending_ui_action.pop(player_id, None)
            return True
        if player_id in self.pending_role_discard:
            return False
        return False

    def _bot_throne_controller(self, p: PlayerState) -> bool:
        t = self.throne
        return p.id in (t.get("kingControllerId"), t.get("queenControllerId"))

    def _bot_location_action_ok(self, p: PlayerState, act: dict) -> bool:
        if act.get("manual"):
            return False
        if p.gold < act.get("cost", 0):
            return False
        if act["id"] == "recover" and not (p.wounded or p.rep <= 2):
            return False
        if act.get("requiresThrone") and not self._bot_throne_controller(p):
            return False
        if act["id"] == "serious_duel":
            if p.location != "barracks" or p.serious_duel_used:
                return False
        return True

    def _bot_auto_targets(self, p: PlayerState, fx: dict) -> list[PlayerState]:
        others = [x for x in self.players if x.status == "active" and x.id != p.id]
        if fx.get("same_location"):
            others = [x for x in others if x.location == p.location]
        if fx.get("at_location") and p.location != fx["at_location"]:
            return []
        ov = fx.get("open_vote") or {}
        max_rep = ov.get("max_rep")
        if max_rep is not None:
            others = [x for x in others if x.rep <= max_rep]
        return others

    def _bot_try_play_card(self, p: PlayerState, rng: random.Random) -> bool:
        """Play a simple auto card or public role ability when useful."""
        if rng.random() > 0.45:
            return False
        if p.public_role_id:
            for aid, fx in D.ROLE_ABILITY_EFFECTS.items():
                if fx.get("role") != p.public_role_id:
                    continue
                locs = fx.get("locations")
                if locs and p.location not in locs:
                    continue
                if fx.get("once_per_round") and aid in p.abilities_used_this_round:
                    continue
                if fx.get("requires_royal_throne"):
                    t = self.throne
                    if not t.get("kingControllerId") and not t.get("queenControllerId"):
                        continue
                if fx.get("requires_royal_role_lost") and not self.royal_role_lost:
                    continue
                if int(fx.get("gold_cost", 0)) > p.gold:
                    continue
                target_id = None
                if fx.get("needs_target"):
                    others = [
                        x for x in self.players
                        if x.status == "active" and x.id != p.id
                        and (not fx.get("same_location") or x.location == p.location)
                    ]
                    if not others:
                        continue
                    target_id = rng.choice(others).id
                try:
                    self.use_role_ability(p.id, aid, target_id)
                    return True
                except MoveError:
                    continue
        simple = [
            cid for cid in p.action_card_ids
            if cid in D.CARD_AUTO_EFFECTS
            and not D.CARD_AUTO_EFFECTS[cid].get("needs_target")
            and not D.CARD_AUTO_EFFECTS[cid].get("open_duel")
            and not D.CARD_AUTO_EFFECTS[cid].get("open_vote")
            and not D.CARD_AUTO_EFFECTS[cid].get("open_callout")
        ]
        if simple and rng.random() < 0.5:
            try:
                self.play_action_card(p.id, rng.choice(simple))
                return True
            except MoveError:
                pass
        rumour_cards = [c for c in p.action_card_ids if c in ("rumour_card", "false_rumour")]
        if rumour_cards and rng.random() < 0.35:
            others = [x for x in self.players if x.status == "active" and x.id != p.id and x.location == p.location]
            if others:
                try:
                    self.play_action_card(p.id, rng.choice(rumour_cards), target_id=rng.choice(others).id)
                    if p.id in self.pending_ui_action:
                        self._bot_resolve_pending(p.id, rng)
                    return True
                except MoveError:
                    pass
        targeted = [
            cid for cid in p.action_card_ids
            if cid in D.CARD_AUTO_EFFECTS
            and D.CARD_AUTO_EFFECTS[cid].get("needs_target")
            and not D.CARD_AUTO_EFFECTS[cid].get("open_duel")
            and not D.CARD_AUTO_EFFECTS[cid].get("open_vote")
            and not D.CARD_AUTO_EFFECTS[cid].get("open_callout")
        ]
        if targeted and rng.random() < 0.35:
            cid = rng.choice(targeted)
            fx = D.CARD_AUTO_EFFECTS[cid]
            targets = self._bot_auto_targets(p, fx)
            if fx.get("optional_target") or targets:
                target = rng.choice(targets) if targets else None
                kwargs: dict[str, Any] = {"rng": rng}
                skip = False
                if target:
                    kwargs["target_id"] = target.id
                if fx.get("needs_deck"):
                    kwargs["deck_name"] = rng.choice(D.DECK_NAMES)
                if fx.get("needs_location"):
                    if fx.get("named_location"):
                        kwargs["location_id"] = rng.choice([loc["id"] for loc in D.LOCATIONS])
                    elif not self.legal_moves(p):
                        skip = True
                    else:
                        kwargs["location_id"] = rng.choice(self.legal_moves(p))
                if fx.get("needs_discard_card"):
                    sellable = [c for c in p.action_card_ids if c != cid]
                    if sellable:
                        kwargs["discard_card_id"] = rng.choice(sellable)
                    else:
                        skip = True
                if fx.get("cost_gold") and p.gold < int(fx["cost_gold"]):
                    skip = True
                if fx.get("needs_target") and not fx.get("optional_target") and not target:
                    skip = True
                if fx.get("needs_deck") and "deck_name" not in kwargs:
                    skip = True
                if fx.get("needs_location") and "location_id" not in kwargs:
                    skip = True
                if fx.get("needs_discard_card") and "discard_card_id" not in kwargs:
                    skip = True
                if not skip:
                    try:
                        self.play_action_card(p.id, cid, **kwargs)
                        if p.id in self.pending_ui_action:
                            self._bot_resolve_pending(p.id, rng)
                        return True
                    except MoveError:
                        pass
        return False

    def _bot_try_succession(self, p: PlayerState, rng: random.Random) -> bool:
        succ = self.throne.get("succession", {})
        if not succ.get("open") or p.location != "throne":
            return False
        if any(c.get("playerId") == p.id for c in succ.get("claims", [])):
            return False
        held = self._all_role_ids(p)
        order = sorted(D.SUCCESSION.keys(), key=lambda r: D.SUCCESSION[r]["rank"])
        role_id = next((r for r in order if r in held), None)
        if not role_id:
            return False
        try:
            self.add_succession_claim(p.id, role_id)
            return True
        except MoveError:
            return False

    def _bot_try_duel(self, p: PlayerState, rng: random.Random) -> bool:
        if self.bot_is_cursed(p) or rng.random() > 0.22:
            return False
        others = [
            x for x in self.players
            if x.status == "active" and x.id != p.id
            and x.location == p.location and not self.bot_is_cursed(x)
        ]
        if not others:
            return False
        target = rng.choice(others)
        self._log(f"{p.name} starts a duel with {target.name}!", "event")
        conseq = rng.choice(["shame", "disarm", "drive"])
        try:
            self.duel_apply_consequence(p.id, target.id, 0, 0, False, conseq, rng)
        except MoveError:
            return False
        return True

    def _bot_try_trade(self, p: PlayerState, rng: random.Random) -> bool:
        if p.location != "market" or rng.random() > 0.2 or p.gold < 1:
            return False
        others = [
            x for x in self.players
            if x.status == "active" and x.id != p.id
            and x.location == "market" and x.gold >= 1
        ]
        if not others:
            return False
        partner = rng.choice(others)
        try:
            self.apply_trade(p.id, partner.id, 1, 1, None, None)
            return True
        except MoveError:
            return False

    def _bot_auto_role_discard(self, pid: str, rng: random.Random) -> None:
        if pid not in self.pending_role_discard:
            return
        p = self.player_by_id(pid)
        if not p or not p.is_bot:
            return
        choices: list[tuple[str, str]] = []
        if p.public_role_id:
            choices.append(("public", p.public_role_id))
        for rid in p.hidden_role_ids:
            choices.append(("hidden", rid))
        for rid in p.extra_shown_role_ids:
            choices.append(("extra", rid))
        if not choices:
            self.pending_role_discard.pop(pid, None)
            return
        non_cursed = [c for c in choices if c[1] != "cursedone"]
        slot, rid = rng.choice(non_cursed if non_cursed else choices)
        self.apply_role_discard(pid, slot, rid)

    def _bot_try_social(self, p: PlayerState, rng: random.Random) -> bool:
        """Loyal bots hunt the Cursed One so all-bot playtests can end in a Loyal win."""
        if self.winner or self.bot_is_cursed(p):
            return False
        if rng.random() > 0.4:
            return False
        cursed = next(
            (x for x in self.players if x.status == "active" and x.id != p.id and self.bot_is_cursed(x)),
            None,
        )
        if not cursed:
            return False
        if self.corruption >= 3 and rng.random() < 0.55:
            self.call_out(p.id, cursed.id, "cursedone")
            return True
        if self.corruption >= 1 and rng.random() < 0.45:
            votes: dict[str, str] = {}
            for voter in self.players:
                if voter.status != "active":
                    continue
                if voter.is_bot and not self.bot_is_cursed(voter):
                    votes[voter.id] = "yes"
                elif voter.id == p.id:
                    votes[voter.id] = "yes"
                else:
                    votes[voter.id] = "no"
            self.apply_formal_vote("accuse", cursed.id, votes)
            return True
        return False

    def _bot_act(self, p: PlayerState, cursed: bool, rng: random.Random) -> None:
        loc = p.location
        if cursed and loc == "graveyard" and p.gold >= 4:
            self.do_location_action(p.id, "buy_grave")
            return
        if p.gold < 2:
            if loc == "tavern":
                self.do_location_action(p.id, "work_room")
                return
            if loc == "graveyard":
                self.do_location_action(p.id, "scavenge")
                return
            if loc == "throne":
                self.do_location_action(p.id, "petition")
                return
        acts = D.LOCATION_ACTIONS.get(loc, [])
        doable = [a for a in acts if self._bot_location_action_ok(p, a)]
        if not doable:
            return
        basic = [a for a in doable if a.get("kind") == "basic"]
        pick = basic[0] if basic and rng.random() < 0.7 else rng.choice(doable)
        result = self.do_location_action(p.id, pick["id"])
        if result.get("keepOne"):
            cards = result["keepOne"]["cards"]
            self.resolve_keep_one(p.id, result["keepOne"]["deck"], cards[0], cards[1])

    # ---- serialisation ----
    def _player_public(self, p: PlayerState, viewer_id: str) -> dict:
        is_self = p.id == viewer_id
        return {
            "id": p.id,
            "name": p.name,
            "location": p.location,
            "gold": p.gold,
            "rep": p.rep,
            "status": p.status,
            "publicRoleId": p.public_role_id,
            "hiddenRoleIds": p.hidden_role_ids if is_self else [],
            "hiddenRoleCount": len(p.hidden_role_ids) if not is_self else len(p.hidden_role_ids),
            "extraShownRoleIds": p.extra_shown_role_ids,
            "actionCardIds": p.action_card_ids if is_self else [],
            "actionCardCount": len(p.action_card_ids),
            "wounded": p.wounded,
            "seriousDuelUsed": p.serious_duel_used,
            "movedThisTurn": p.moved_this_turn,
            "movesUsedThisTurn": int(p.moves_used_this_turn),
            "moveLimitThisTurn": self._move_limit(p) if is_self else 0,
            "abilitiesUsedThisRound": list(p.abilities_used_this_round),
            "abilitiesUsedThisGame": list(p.abilities_used_this_game) if is_self else [],
            "isBot": p.is_bot,
        }

    def _throne_public(self) -> dict:
        return deepcopy(self.throne)

    def _log_public(self) -> list[dict]:
        return [
            {"id": e.id, "t": e.t, "label": e.label, "round": e.round, "text": e.text, "kind": e.kind}
            for e in self.log
        ]

    def view(self, pid: str) -> dict:
        """Per-player game snapshot (hidden info only for pid)."""
        me = self.player_by_id(pid)
        setup_dealt = me.dealt_role_ids if me and self.status == STATUS_SETUP else []
        return {
            "status": self.status,
            "playerCount": self.player_count,
            "round": self.round,
            "activePlayerIndex": self.active_player_index,
            "activePlayerId": self.active_player().id if self.active_player() else None,
            "corruption": self.corruption,
            "innocentElims": self.innocent_elims,
            "winner": self.winner,
            "royalRoleLost": self.royal_role_lost,
            "throne": self._throne_public(),
            "contracts": [
                {"id": c.id, "aId": c.a_id, "bId": c.b_id, "promise": c.promise, "status": c.status}
                for c in self.contracts
            ],
            "log": self._log_public(),
            "players": [self._player_public(p, pid) for p in self.players],
            "legalMoves": (
                self.legal_moves(me)
                if me and self.status == STATUS_PLAY and self._can_board_move(me)
                else []
            ),
            "pendingKeepOne": self.pending_keep_one.get(pid),
            "pendingRoleDiscard": self.pending_role_discard.get(pid),
            "pendingUiAction": self.pending_ui_action.get(pid),
            "privateNote": self.private_notes.get(pid),
            "privateNoteCardId": self.private_note_card_ids.get(pid),
            "balance": dict(self.balance),
            "setup": {
                "dealtRoleIds": setup_dealt,
                "setupReady": me.setup_ready if me else False,
                "allReady": self.all_setup_ready(),
                "playerStatus": [
                    {"id": p.id, "name": p.name, "setupReady": p.setup_ready}
                    for p in self.players
                ] if self.status == STATUS_SETUP else [],
            },
        }

    def to_client_state(self, pid: str) -> dict:
        """Full CT.state-shaped blob for the viewer."""
        v = self.view(pid)
        players = []
        for p in v["players"]:
            is_self = p["id"] == pid
            players.append({
                "id": p["id"],
                "name": p["name"],
                "isBot": p["isBot"],
                "location": p["location"],
                "gold": p["gold"],
                "rep": p["rep"],
                "status": p["status"],
                "publicRoleId": p["publicRoleId"],
                "hiddenRoleIds": p["hiddenRoleIds"] if is_self else [],
                "hiddenRoleCount": p.get("hiddenRoleCount", len(p["hiddenRoleIds"])),
                "extraShownRoleIds": p["extraShownRoleIds"],
                "actionCardIds": p["actionCardIds"] if is_self else [],
                "actionCardCount": p.get("actionCardCount", len(p["actionCardIds"])),
                "wounded": p["wounded"],
                "seriousDuelUsed": p["seriousDuelUsed"],
                "movedThisTurn": p.get("movedThisTurn", False),
                "movesUsedThisTurn": p.get("movesUsedThisTurn", 0),
                "moveLimitThisTurn": p.get("moveLimitThisTurn", 1),
                "abilitiesUsedThisRound": p.get("abilitiesUsedThisRound", []),
                "abilitiesUsedThisGame": p.get("abilitiesUsedThisGame", []),
            })
        return {
            "version": 1,
            "phase": "play" if v["status"] == STATUS_PLAY else v["status"],
            "round": v["round"],
            "activePlayerIndex": v["activePlayerIndex"],
            "corruption": v["corruption"],
            "innocentElims": v["innocentElims"],
            "royalRoleLost": v.get("royalRoleLost", False),
            "throne": v["throne"],
            "winner": v["winner"],
            "players": players,
            "contracts": v["contracts"],
            "log": v["log"],
            "decks": {},  # hidden from clients
            "discards": {},
            "undealtRoleIds": [],
            "legalMoves": v["legalMoves"],
            "pendingKeepOne": v["pendingKeepOne"],
            "pendingRoleDiscard": v["pendingRoleDiscard"],
            "pendingUiAction": v.get("pendingUiAction"),
            "privateNote": v.get("privateNote"),
            "privateNoteCardId": v.get("privateNoteCardId"),
            "balance": v["balance"],
            "setup": v["setup"],
        }
