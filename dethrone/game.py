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

    def assign_seats(self, seat_players: list[tuple[str, str]]) -> None:
        """Map connected room players to game seats (id, name)."""
        if self.status not in (STATUS_LOBBY, STATUS_SETUP):
            raise MoveError("Cannot reassign seats mid-game.")
        n = self.player_count
        if len(seat_players) < n:
            raise MoveError(f"Need {n} players connected.")
        if len(seat_players) > n:
            seat_players = seat_players[:n]
        self.players = [
            PlayerState(id=pid, name=name)
            for pid, name in seat_players
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
        v = _clamp(round(value), 0, D.CORRUPTION_MAX)
        if v == prev:
            return
        self.corruption = v
        direction = "rose" if v > prev else "fell"
        self._log(f"Corruption {direction} to {v}" + (f": {reason}" if reason else "") + ".", "corruption")
        if v >= D.FINAL_RITE_CORRUPTION and prev < D.FINAL_RITE_CORRUPTION:
            self._log(
                f"Warning: corruption is {v}. Final Rite is now possible at the Graveyard.",
                "corruption",
            )
        if v >= D.CORRUPTION_MAX:
            self.declare_winner("cursed", f"Corruption reached {D.CORRUPTION_MAX}")

    def adjust_corruption(self, delta: int, reason: str = "") -> None:
        self.set_corruption(self.corruption + delta, reason)

    def set_innocent_elims(self, value: int, reason: str = "") -> None:
        v = _clamp(round(value), 0, 99)
        if v == self.innocent_elims:
            return
        self.innocent_elims = v
        self._log(f"Innocent eliminations now {v}" + (f": {reason}" if reason else "") + ".", "event")
        if v >= D.INNOCENT_ELIMS_TO_LOSE:
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

    def over_hand_limit(self, player: PlayerState) -> bool:
        return len(player.action_card_ids) > D.HAND_LIMIT

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
    def apply_role_discard(self, pid: str, slot: str, role_id: str) -> None:
        p = self.player_by_id(pid)
        if not p:
            raise MoveError("Unknown player.")
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
            "isBot": False,
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
            "setup": {
                "dealtRoleIds": setup_dealt,
                "setupReady": me.setup_ready if me else False,
                "allReady": self.all_setup_ready(),
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
                "isBot": False,
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
            "setup": v["setup"],
        }
