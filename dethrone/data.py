"""Static game data for The Cursed Throne (mirrors static/dethrone/js/data.js)."""

from __future__ import annotations

HAND_LIMIT = 5
START_GOLD = 2
START_REP = 3
REP_MIN = 0
REP_MAX = 5
CORRUPTION_MAX = 10
FINAL_RITE_CORRUPTION = 8
INNOCENT_ELIMS_TO_LOSE = 2
START_LOCATION = "market"

MIN_PLAYERS = 4
MAX_PLAYERS = 6

LOCATIONS = [
    {"id": "market", "name": "Market", "danger": False, "connector": True, "throne": False},
    {"id": "tavern", "name": "Tavern", "danger": False, "connector": False, "throne": False},
    {"id": "college", "name": "College", "danger": False, "connector": False, "throne": False},
    {"id": "scrolls", "name": "Scrolls", "danger": False, "connector": False, "throne": False},
    {"id": "throne", "name": "Throne", "danger": False, "connector": False, "throne": True},
    {"id": "barracks", "name": "Barracks", "danger": False, "connector": False, "throne": False},
    {"id": "graveyard", "name": "Graveyard", "danger": True, "connector": False, "throne": False},
]

CONNECTIONS: dict[str, list[str]] = {
    "market": ["tavern", "college", "throne"],
    "tavern": ["market", "graveyard"],
    "college": ["market", "scrolls"],
    "scrolls": ["college"],
    "throne": ["market", "barracks"],
    "barracks": ["throne", "graveyard"],
    "graveyard": ["tavern", "barracks"],
}

ROLE_IDS = [
    "king", "queen", "cursedone", "firstborn", "secondborn", "tinytyrant", "distantcousin",
    "royalknight", "blackknight", "wanderingknight", "youngknight", "royalguard",
    "gateguard", "graveyardguard", "courtfavourite", "thief", "spy", "royaladvisor",
    "collegeadvisor", "tavernwhisperer",
]

ROLE_META: dict[str, dict] = {
    "king": {"name": "King", "family": "Royal", "canBePublic": True},
    "queen": {"name": "Queen", "family": "Royal", "canBePublic": True},
    "cursedone": {"name": "Cursed One", "family": "Cursed", "canBePublic": False},
    "firstborn": {"name": "Firstborn Noble", "family": "Succession", "canBePublic": True},
    "secondborn": {"name": "Secondborn Noble", "family": "Succession", "canBePublic": True},
    "tinytyrant": {"name": "Tiny Tyrant", "family": "Succession", "canBePublic": True},
    "distantcousin": {"name": "Distant Cousin", "family": "Succession", "canBePublic": True},
    "royalknight": {"name": "Royal Knight", "family": "Knight", "canBePublic": True,
                     "duelBonusAttack": 2, "duelBonusDefence": 2},
    "blackknight": {"name": "Black Knight", "family": "Knight", "canBePublic": True,
                    "duelBonusAttack": 2, "duelBonusDefence": 2},
    "wanderingknight": {"name": "Wandering Knight", "family": "Knight", "canBePublic": True,
                        "duelBonusAttack": 1, "duelBonusDefence": 1},
    "youngknight": {"name": "Young Knight", "family": "Knight", "canBePublic": True,
                    "duelBonusAttack": 2, "duelBonusDefence": 0},
    "royalguard": {"name": "Royal Guard", "family": "Guard", "canBePublic": True, "duelBonusDefence": 1},
    "gateguard": {"name": "Gate Guard", "family": "Guard", "canBePublic": True, "duelBonusDefence": 1},
    "graveyardguard": {"name": "Graveyard Guard", "family": "Guard", "canBePublic": True, "duelBonusDefence": 1},
    "courtfavourite": {"name": "Court Favourite", "family": "Guard", "canBePublic": True, "duelBonusDefence": 1},
    "thief": {"name": "Thief", "family": "ThiefSpy", "canBePublic": True, "duelBonusAttack": 1},
    "spy": {"name": "Spy", "family": "ThiefSpy", "canBePublic": True, "duelBonusAttack": 1},
    "royaladvisor": {"name": "Royal Advisor", "family": "Advisor", "canBePublic": True},
    "collegeadvisor": {"name": "College Advisor", "family": "Advisor", "canBePublic": True},
    "tavernwhisperer": {"name": "Tavern Whisperer", "family": "Advisor", "canBePublic": True},
}

DECK_NAMES = ["Market", "Tavern", "Knowledge", "Barracks", "Graveyard", "Royal"]

ACTION_CARDS: list[dict] = [
    {"id": "secret_passage", "deck": "Market"},
    {"id": "bribe", "deck": "Market"},
    {"id": "counterfeit_pass", "deck": "Market"},
    {"id": "quick_escape", "deck": "Market"},
    {"id": "trade_licence", "deck": "Market"},
    {"id": "rumour_card", "deck": "Tavern"},
    {"id": "false_rumour", "deck": "Tavern", "corruptionChange": 1},
    {"id": "flee", "deck": "Tavern", "reputationChange": -1},
    {"id": "blood_contract", "deck": "Tavern"},
    {"id": "drunken_alibi", "deck": "Tavern"},
    {"id": "call_out", "deck": "Knowledge", "corruptionChange": 2},
    {"id": "trace_steps", "deck": "Knowledge"},
    {"id": "read_records", "deck": "Knowledge"},
    {"id": "route_pass", "deck": "Knowledge"},
    {"id": "hidden_witness", "deck": "Knowledge"},
    {"id": "hidden_knife", "deck": "Barracks"},
    {"id": "shield", "deck": "Barracks"},
    {"id": "dirty_trick", "deck": "Barracks", "corruptionChange": 1},
    {"id": "arrest", "deck": "Barracks"},
    {"id": "disarm_card", "deck": "Barracks"},
    {"id": "grave_pact", "deck": "Graveyard", "corruptionChange": 1},
    {"id": "blackmail", "deck": "Graveyard", "reputationChange": -1},
    {"id": "cursed_blade", "deck": "Graveyard", "corruptionChange": 1},
    {"id": "soul_debt", "deck": "Graveyard", "corruptionChange": 1},
    {"id": "royal_sacrifice", "deck": "Graveyard", "corruptionChange": -3},
    {"id": "royal_decree", "deck": "Royal"},
    {"id": "pardon_card", "deck": "Royal", "reputationChange": 1},
    {"id": "tax_collector", "deck": "Royal"},
    {"id": "royal_guard_detail", "deck": "Royal"},
    {"id": "emergency_council", "deck": "Royal"},
]

LOCATION_ACTIONS: dict[str, list[dict]] = {
    "throne": [
        {"id": "petition", "kind": "basic", "name": "Petition", "cost": 0},
        {"id": "royal_command", "kind": "strong", "name": "Royal Command", "cost": 0, "manual": True, "requiresThrone": True},
    ],
    "market": [
        {"id": "buy", "kind": "basic", "name": "Buy", "cost": 2, "deck": "Market"},
        {"id": "haggle", "kind": "strong", "name": "Haggle", "cost": 3, "deck": "Market"},
    ],
    "tavern": [
        {"id": "work_room", "kind": "basic", "name": "Work the Room", "cost": 0},
        {"id": "backroom", "kind": "strong", "name": "Backroom Deal", "cost": 2, "deck": "Tavern"},
    ],
    "college": [
        {"id": "study", "kind": "basic", "name": "Study", "cost": 2, "deck": "Knowledge"},
        {"id": "recover", "kind": "strong", "name": "Recover", "cost": 2},
    ],
    "scrolls": [
        {"id": "research", "kind": "basic", "name": "Research", "cost": 2, "deck": "Knowledge"},
        {"id": "deep_research", "kind": "strong", "name": "Deep Research", "cost": 2, "manual": True},
    ],
    "barracks": [
        {"id": "arm", "kind": "basic", "name": "Arm Yourself", "cost": 2, "deck": "Barracks"},
        {"id": "serious_duel", "kind": "strong", "name": "Serious Duel", "cost": 0, "manual": True},
    ],
    "graveyard": [
        {"id": "scavenge", "kind": "basic", "name": "Scavenge", "cost": 0},
        {"id": "buy_grave", "kind": "strong", "name": "Buy Graveyard Card", "cost": 4, "deck": "Graveyard"},
    ],
}

SUCCESSION: dict[str, dict] = {
    "firstborn": {"rank": 1, "window": 0},
    "secondborn": {"rank": 2, "window": 1},
    "tinytyrant": {"rank": 3, "window": 2},
    "distantcousin": {"rank": 4, "window": 3},
}

DEFAULT_BALANCE: dict[str, int] = {
    "handLimit": HAND_LIMIT,
    "corruptionMax": CORRUPTION_MAX,
    "finalRiteAt": FINAL_RITE_CORRUPTION,
    "innocentElimsToLose": INNOCENT_ELIMS_TO_LOSE,
    "startGold": START_GOLD,
    "startRep": START_REP,
}

EXTRA_ACTION_CARD_IDS: list[tuple[str, str]] = [
    ("merchants_map", "Market"), ("smugglers_run", "Market"), ("guild_seal", "Market"),
    ("loaded_dice", "Market"), ("fence", "Market"), ("caravan_manifest", "Market"),
    ("spare_coin_purse", "Market"), ("market_day", "Market"),
    ("bought_round", "Tavern"), ("tavern_brawl", "Tavern"), ("whisper_network", "Tavern"),
    ("loan_shark", "Tavern"), ("stitched_lip", "Tavern"), ("performers_tale", "Tavern"),
    ("hangover_cure", "Tavern"), ("sow_doubt", "Tavern"),
    ("study_companion", "Knowledge"), ("sealed_warrant", "Knowledge"), ("witness_statement", "Knowledge"),
    ("old_prophecy", "Knowledge"), ("map_of_tunnels", "Knowledge"), ("court_summons", "Knowledge"),
    ("alibi_check", "Knowledge"), ("secret_ledger", "Knowledge"),
    ("training_dummy", "Barracks"), ("second_blade", "Barracks"), ("parry", "Barracks"),
    ("intimidate", "Barracks"), ("challenged_again", "Barracks"), ("iron_gauntlet", "Barracks"),
    ("veterans_warning", "Barracks"),
    ("mourning_veil", "Graveyard"), ("spirit_coin", "Graveyard"), ("bone_dice", "Graveyard"),
    ("grave_dust", "Graveyard"), ("last_rites", "Graveyard"), ("stolen_offering", "Graveyard"),
    ("wraith_whisper", "Graveyard"), ("forbidden_tome", "Graveyard"),
    ("queens_favour", "Royal"), ("succession_edict", "Royal"), ("herald", "Royal"),
    ("royal_purse", "Royal"), ("banish_letter", "Royal"), ("kneel", "Royal"), ("crown_witness", "Royal"),
]

ACTION_CARDS = ACTION_CARDS + [{"id": cid, "deck": deck} for cid, deck in EXTRA_ACTION_CARD_IDS]

CARDS_BY_DECK: dict[str, list[str]] = {}
for _card in ACTION_CARDS:
    CARDS_BY_DECK.setdefault(_card["deck"], []).append(_card["id"])

CARD_BY_ID = {c["id"]: c for c in ACTION_CARDS}

# Auto-resolvable action cards (OnTurn / simple Movement). Others stay manual at the table.
CARD_AUTO_EFFECTS: dict[str, dict] = {
    "spare_coin_purse": {"gold": 2},
    "spirit_coin": {"gold": 2, "corruption": 1},
    "soul_debt": {"gold": 5, "corruption": 1},
    "performers_tale": {"rep": 1},
    "grave_dust": {"corruption": -1, "rep": -1},
    "training_dummy": {"draw": "Barracks"},
    "forbidden_tome": {"draw": "Graveyard", "corruption": 2},
    "last_rites": {"last_rites": True, "corruption": 1},
    "royal_purse": {"royal_purse": True},
    "hangover_cure": {"hangover_cure": True},
    "pardon_card": {"target_rep": 1, "needs_target": True},
    "false_rumour": {"target_rep": -1, "corruption": 1, "needs_target": True},
    "rumour_card": {"rumour": True, "needs_target": True},
    "secret_passage": {"move_connected": True, "needs_location": True},
    "merchants_map": {"move_connected": True, "needs_location": True},
    "counterfeit_pass": {"move_connected": True, "needs_location": True},
    "route_pass": {"move_pair": ("college", "scrolls"), "needs_location": False},
}
