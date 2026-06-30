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
        lines.extend(["## Chronicle", ""])
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
        self.corruption = 0
        self.innocent_elims = 0
        self.winner = None
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
    def legal_moves(self, player: PlayerState) -> list[str]:
        return list(D.CONNECTIONS.get(player.location, []))

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
            if location_id not in self.legal_moves(p):
                raise MoveError("That location is not reachable.")
        if location_id not in {loc["id"] for loc in D.LOCATIONS}:
            raise MoveError("Unknown location.")
        if p.location == location_id:
            return
        from_name = next((l["name"] for l in D.LOCATIONS if l["id"] == p.location), "?")
        to_name = next((l["name"] for l in D.LOCATIONS if l["id"] == location_id), "?")
        p.location = location_id
        self._log(f"{p.name} moved {from_name} → {to_name}" + (" (manual)" if manual else "") + ".")

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
            self._log(f"Round {self.round} started.", "system")
        self._log(f"Turn passes to {self.players[idx].name}.")

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

    def play_action_card(
        self,
        pid: str,
        card_id: str,
        *,
        target_id: Optional[str] = None,
        location_id: Optional[str] = None,
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
        if fx.get("needs_target") and not target_id:
            raise MoveError("Choose a target player.")
        target = self.player_by_id(target_id) if target_id else None
        if fx.get("needs_target") and (not target or target.status != "active"):
            raise MoveError("Invalid target.")

        card = D.CARD_BY_ID.get(card_id, {})
        cname = card.get("name", card_id)
        self._log(f"{p.name} plays {cname}.")

        if fx.get("move_pair"):
            src, dest = fx["move_pair"]
            if p.location != src:
                raise MoveError(f"Must be at {src.title()} to play this card.")
            self.move_player(pid, dest, manual=True)
        elif fx.get("move_connected"):
            if not location_id:
                raise MoveError("Choose a destination.")
            if location_id not in self.legal_moves(p):
                raise MoveError("That location is not reachable.")
            self.move_player(pid, location_id, manual=True)

        if fx.get("gold"):
            self.adjust_gold(pid, fx["gold"], cname)
        if fx.get("rep"):
            self.adjust_rep(pid, fx["rep"], cname)
        if fx.get("corruption"):
            self.adjust_corruption(fx["corruption"], cname)
        if fx.get("draw"):
            self.draw_card(pid, fx["draw"], cname)
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
            self.adjust_rep(target.id, fx["target_rep"], cname)
        if fx.get("rumour") and target:
            if target.gold >= 1:
                target.gold -= 1
                p.gold += 1
                self._log(f"{target.name} paid 1 gold to {p.name} to silence the Rumour.")
            else:
                self.adjust_rep(target.id, -1, "Rumour")

        self.discard_card(pid, card_id, "played")
        return {"ok": True}

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
            self.adjust_rep(ap.id, -1, "Scavenge")
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
        else:
            self._log(f"{ap.name} used {defn['name']} (resolve at the table).", "note")
            return {"ok": True, "manual": True}
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
        meta = D.SUCCESSION.get(role_id)
        if not meta:
            raise MoveError("Invalid succession role.")
        p = self.player_by_id(player_id)
        claim = {"id": _uid("sc"), "playerId": player_id, "roleId": role_id,
                 "rank": meta["rank"], "startRound": self.round}
        self.throne["succession"]["claims"].append(claim)
        rname = D.ROLE_META.get(role_id, {}).get("name", role_id)
        self._log(f"{p.name if p else '?'} claims the Throne as {rname}.", "event")

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

    # ---- call out ----
    def call_out(self, caller_id: str, target_id: str, role_id: str) -> None:
        caller = self.player_by_id(caller_id)
        target = self.player_by_id(target_id)
        if not caller or not target:
            raise MoveError("Unknown player.")
        rname = D.ROLE_META.get(role_id, {}).get("name", role_id)
        self._log(f"{caller.name} calls out {target.name} as {rname}!")
        self.adjust_corruption(2, "Call Out")
        correct = role_id in target.hidden_role_ids
        if correct:
            self._log(f"Correct — {rname} is revealed.")
            self.apply_role_discard(target_id, "hidden", role_id)
            if not self.winner:
                self.grant_extra_shown_role(caller_id, "Call Out")
        else:
            self._log(f"Wrong — {target.name} reveals nothing. {caller.name} loses 1 Reputation.")
            self.adjust_rep(caller_id, -1, "wrong Call Out")

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

    def apply_formal_vote(
        self,
        vtype: str,
        target_id: str,
        votes: dict[str, str],
        bonus_yes: int = 0,
        bonus_no: int = 0,
    ) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        target = self.player_by_id(target_id)
        if not target:
            raise MoveError("Unknown target.")
        yes = bonus_yes
        no = bonus_no
        for p in self.players:
            if p.status != "active":
                continue
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
                self.require_role_discard(target_id, "vote", after={"kind": "vote_accuse"})
        else:
            was_innocent = "cursedone" not in target.hidden_role_ids
            self._log(
                f"Banishment vote against {target.name}: "
                f"{'PASSES' if passed else 'fails'} ({yes}–{no})."
            )
            if passed:
                self.require_role_discard(
                    target_id, "vote",
                    after={"kind": "vote_banish", "was_innocent": was_innocent},
                )

    def duel_flee(self, defender_id: str) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        defender = self.player_by_id(defender_id)
        if not defender:
            raise MoveError("Unknown defender.")
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
    ) -> None:
        if self.status != STATUS_PLAY or self.winner:
            raise MoveError("No active game.")
        att = self.player_by_id(attacker_id)
        defn = self.player_by_id(defender_id)
        if not att or not defn:
            raise MoveError("Unknown duelist.")
        a_total = self._role_bonus(att, "duelBonusAttack") + att_bonus
        d_total = self._role_bonus(defn, "duelBonusDefence") + def_bonus
        attacker_wins = a_total > d_total
        winner = att if attacker_wins else defn
        loser = defn if attacker_wins else att
        self._log(f"Duel: {winner.name} beat {loser.name} ({a_total}–{d_total}).")
        if serious:
            att.serious_duel_used = True
        if consequence == "serious":
            self.require_role_discard(loser.id, "serious duel")
        elif consequence == "disarm":
            count = min(2, len(loser.action_card_ids))
            for _ in range(count):
                if not loser.action_card_ids:
                    break
                idx = rng.randrange(len(loser.action_card_ids))
                self.discard_card(loser.id, loser.action_card_ids[idx], "Disarm")
        elif consequence == "shame":
            self.adjust_rep(loser.id, -1, "Shame")
        elif consequence == "wound":
            loser.wounded = True
            self._log(f"{loser.name} is Wounded — no hidden powers next turn.")
        elif consequence == "drive":
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
        if player_id in self.pending_role_discard:
            self._bot_auto_role_discard(player_id, rng)
            return
        ap = self.active_player()
        if not ap or ap.id != player_id:
            raise MoveError("Not this bot's turn.")
        cursed = self.bot_is_cursed(p)
        moves = self.legal_moves(p)
        if moves and rng.random() < 0.85:
            dest = self._bot_step_toward(p.location, "graveyard") if cursed else rng.choice(moves)
            if dest:
                self.move_player(p.id, dest, manual=False, actor_id=p.id)
        if not cursed and self._bot_try_social(p, rng):
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
        doable = [
            a for a in acts
            if not a.get("manual") and p.gold >= a.get("cost", 0)
            and not (a["id"] == "recover" and not (p.wounded or p.rep <= 2))
        ]
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
            "throne": self._throne_public(),
            "contracts": [
                {"id": c.id, "aId": c.a_id, "bId": c.b_id, "promise": c.promise, "status": c.status}
                for c in self.contracts
            ],
            "log": self._log_public(),
            "players": [self._player_public(p, pid) for p in self.players],
            "legalMoves": self.legal_moves(me) if me and self.status == STATUS_PLAY else [],
            "pendingKeepOne": self.pending_keep_one.get(pid),
            "pendingRoleDiscard": self.pending_role_discard.get(pid),
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
            })
        return {
            "version": 1,
            "phase": "play" if v["status"] == STATUS_PLAY else v["status"],
            "round": v["round"],
            "activePlayerIndex": v["activePlayerIndex"],
            "corruption": v["corruption"],
            "innocentElims": v["innocentElims"],
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
            "balance": v["balance"],
            "setup": v["setup"],
        }
