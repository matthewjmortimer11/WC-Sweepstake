/* The Cursed Throne — static game data (Phase 1)
 * Classic script (no modules) so the app runs from file:// by double-click.
 * Everything hangs off the global `CT` namespace. */
window.CT = window.CT || {};

CT.esc = function (str) {
  return String(str).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
};

CT.CONST = {
  HAND_LIMIT: 5,
  START_GOLD: 2,
  START_REP: 3,
  REP_MIN: 0,
  REP_MAX: 5,
  CORRUPTION_MAX: 10,
  FINAL_RITE_CORRUPTION: 8,
  INNOCENT_ELIMS_TO_LOSE: 2,
  START_LOCATION: "throne", // overwritten below to Market; kept explicit
};
CT.CONST.START_LOCATION = "market";

/* ---- Board: 7 locations + connection graph (§7) ---- */
CT.LOCATIONS = [
  { id: "market",    name: "Market",    theme: "Legal trade, tools, practical advantage", danger: false, connector: true },
  { id: "tavern",    name: "Tavern",    theme: "Rumours, gossip, shady promises", danger: false },
  { id: "college",   name: "College",   theme: "Training, recovery, route access", danger: false },
  { id: "scrolls",   name: "Scrolls",   theme: "Investigation, formal information", danger: false },
  { id: "throne",    name: "Throne",    theme: "Political power", danger: false, throne: true },
  { id: "barracks",  name: "Barracks",  theme: "Duels, intimidation, protection", danger: false },
  { id: "graveyard", name: "Graveyard", theme: "Temptation, dark power, desperate money", danger: true },
];

CT.CONNECTIONS = {
  market:    ["tavern", "college", "throne"],
  tavern:    ["market", "graveyard"],
  college:   ["market", "scrolls"],
  scrolls:   ["college"],
  throne:    ["market", "barracks"],
  barracks:  ["throne", "graveyard"],
  graveyard: ["tavern", "barracks"],
};

/* ---- 20 Role cards (§18). abilities trimmed to {name, timing, effect, challengeable, oncePerRound?, oncePerGame?} ---- */
CT.ROLES = [
  {
    id: "king", name: "King", family: "Royal", rarity: "Unique",
    canBePublic: true, canBeHidden: true,
    flavour: "The crown is heavy, expensive and deeply resented.",
    abilities: [
      { name: "Claim Crown", timing: "Setup", effect: "Claim control of the Throne if you privately prove King when challenged.", challengeable: true },
      { name: "Royal Command", timing: "AtLocation", location: "throne", effect: "Use Tax, Pardon or Decree.", challengeable: true, note: "No challenge if public/confirmed controller." },
      { name: "Royal Tax Exemption", timing: "Reaction", effect: "Ignore tax from Queen or successor.", challengeable: true },
    ],
  },
  {
    id: "queen", name: "Queen", family: "Royal", rarity: "Unique",
    canBePublic: true, canBeHidden: true,
    flavour: "Merciful in public, ruthless in private.",
    abilities: [
      { name: "Claim Crown", timing: "Setup", effect: "Claim control of the Throne if you privately prove Queen when challenged.", challengeable: true },
      { name: "Royal Command", timing: "AtLocation", location: "throne", effect: "Use Tax, Pardon or Decree.", challengeable: true, note: "No challenge if public/confirmed controller." },
      { name: "Sanctuary", timing: "Reaction", effect: "Prevent one player from losing Reputation this round.", challengeable: true },
    ],
  },
  {
    id: "cursedone", name: "Cursed One", family: "Cursed", rarity: "Unique",
    canBePublic: false, canBeHidden: true, hiddenOnly: true,
    flavour: "The kingdom rots around you.",
    abilities: [
      { name: "Final Rite", timing: "AtLocation", location: "graveyard", effect: "At end of turn at the Graveyard, if corruption is 8+, reveal this card and win.", challengeable: false },
    ],
    notes: "No normal powers. Revealed/discarded by another effect = loyal players win.",
  },
  {
    id: "firstborn", name: "Firstborn Noble", family: "Succession", rarity: "Unique",
    canBePublic: true, canBeHidden: true,
    flavour: "Born first. Never allowed to forget it.",
    abilities: [
      { name: "First Claim", timing: "Manual", effect: "At Throne during succession: claim immediately unless challenged by hidden King/Queen.", challengeable: true },
      { name: "Tax Exempt", timing: "Reaction", effect: "Ignore royal tax.", challengeable: true },
      { name: "Inheritance Right", timing: "Manual", effect: "When royal wealth is split, gain +1 extra gold if available.", challengeable: true },
    ],
  },
  {
    id: "secondborn", name: "Secondborn Noble", family: "Succession", rarity: "Rare",
    canBePublic: true, canBeHidden: true,
    flavour: "Polite smile, sharpened knife.",
    abilities: [
      { name: "Second Claim", timing: "Manual", effect: "At Throne during succession: claim the Throne. Must survive 1 full round.", challengeable: true },
      { name: "Quiet Ambition", timing: "AtLocation", effect: "At Tavern or Market: gain 1 Reputation if a royal has lost a role card this game.", challengeable: true },
    ],
  },
  {
    id: "tinytyrant", name: "Tiny Tyrant", family: "Succession", rarity: "Rare",
    canBePublic: true, canBeHidden: true,
    flavour: "Too small for the crown, too dangerous to ignore.",
    abilities: [
      { name: "Third Claim", timing: "Manual", effect: "At Throne during succession: claim the Throne. Must survive 2 full rounds.", challengeable: true },
      { name: "Tantrum", timing: "AtLocation", effect: "Once per round, make one player at your location lose 1 Reputation.", challengeable: true, oncePerRound: true },
      { name: "Too Young to Tax", timing: "Reaction", effect: "Ignore royal tax.", challengeable: true },
      { name: "Tiny Tyrant Tax", timing: "AtLocation", location: "throne", effect: "If crowned, your Tax takes +1 extra gold from one chosen player.", challengeable: false },
    ],
  },
  {
    id: "distantcousin", name: "Distant Cousin", family: "Succession", rarity: "Rare",
    canBePublic: true, canBeHidden: true,
    flavour: "Somewhere on the family tree. Probably.",
    abilities: [
      { name: "Weak Claim", timing: "Manual", effect: "At Throne during succession: claim the Throne. Must survive 3 full rounds.", challengeable: true },
      { name: "Name Drop", timing: "AtLocation", effect: "At Tavern or Market: gain 1 gold by reminding everyone you are technically related.", challengeable: true },
      { name: "Dubious Bloodline", timing: "Manual", effect: "After surviving a succession challenge, gain +1 Reputation.", challengeable: false },
    ],
  },
  {
    id: "royalknight", name: "Royal Knight", family: "Knight", rarity: "Uncommon",
    canBePublic: true, canBeHidden: true, duelBonusAttack: 2, duelBonusDefence: 2,
    flavour: "Honourable enough to be dangerous.",
    abilities: [
      { name: "Duel", timing: "Duel", effect: "Start a normal duel against another player at your location.", challengeable: true },
      { name: "Defend the Crown", timing: "Reaction", effect: "At Throne or Barracks: protect one royal from a duel consequence.", challengeable: true },
    ],
  },
  {
    id: "blackknight", name: "Black Knight", family: "Knight", rarity: "Uncommon",
    canBePublic: true, canBeHidden: true, duelBonusAttack: 2, duelBonusDefence: 2,
    flavour: "Nobody likes them. Everyone fears them.",
    abilities: [
      { name: "Duel", timing: "Duel", effect: "Start a normal duel.", challengeable: true },
      { name: "Dirty Blow", timing: "Duel", effect: "Duel at Tavern/Barracks/Graveyard: if you win, choose two duel consequences instead of one. Lose 1 Reputation.", challengeable: true },
    ],
  },
  {
    id: "wanderingknight", name: "Wandering Knight", family: "Knight", rarity: "Common",
    canBePublic: true, canBeHidden: true, duelBonusAttack: 1, duelBonusDefence: 1,
    flavour: "Always arriving exactly when inconvenient.",
    abilities: [
      { name: "Duel", timing: "Duel", effect: "Start a normal duel.", challengeable: true },
      { name: "Stride", timing: "Movement", effect: "Move 2 spaces instead of 1.", challengeable: true },
    ],
  },
  {
    id: "youngknight", name: "Young Knight", family: "Knight", rarity: "Common",
    canBePublic: true, canBeHidden: true, duelBonusAttack: 2, duelBonusDefence: 0,
    flavour: "Brave, stupid, often both.",
    abilities: [
      { name: "Duel", timing: "Duel", effect: "Start a normal duel.", challengeable: true },
      { name: "Reckless Charge", timing: "Movement", effect: "After moving into a location with another player, immediately start a duel. If you lose, lose 1 Reputation.", challengeable: true },
    ],
  },
  {
    id: "royalguard", name: "Royal Guard", family: "Guard", rarity: "Uncommon",
    canBePublic: true, canBeHidden: true, duelBonusDefence: 1,
    flavour: "Loyal to the office, if not the person.",
    abilities: [
      { name: "Protect", timing: "Reaction", effect: "Prevent one player from losing Reputation or being Driven Out.", challengeable: true },
      { name: "Guard the Throne", timing: "AtLocation", location: "throne", effect: "Your defence bonus becomes +2.", challengeable: true },
    ],
  },
  {
    id: "gateguard", name: "Gate Guard", family: "Guard", rarity: "Common",
    canBePublic: true, canBeHidden: true, duelBonusDefence: 1,
    flavour: "A locked gate with boots.",
    abilities: [
      { name: "Block Route", timing: "AtLocation", effect: "Choose one connected path. One named player may not use that path before your next turn.", challengeable: true },
      { name: "Hold Ground", timing: "Duel", effect: "You cannot be Driven Out unless opponent wins by 3+.", challengeable: true },
    ],
  },
  {
    id: "graveyardguard", name: "Graveyard Guard", family: "Guard", rarity: "Common",
    canBePublic: true, canBeHidden: true, duelBonusDefence: 1,
    flavour: "Someone has to watch the worst door in the kingdom.",
    abilities: [
      { name: "Watch the Dead", timing: "AtLocation", effect: "At Barracks/Graveyard: chosen player pays +1 gold if they buy a Graveyard card before your next turn.", challengeable: true },
      { name: "Stand Watch", timing: "AtLocation", location: "graveyard", effect: "Force one arriving player to lose 1 Reputation.", challengeable: true },
    ],
  },
  {
    id: "courtfavourite", name: "Court Favourite", family: "Guard", rarity: "Common",
    canBePublic: true, canBeHidden: true, duelBonusDefence: 1,
    flavour: "Unbearable, but somehow invited to everything.",
    abilities: [
      { name: "Suck Up", timing: "AtLocation", location: "throne", effect: "Gain 1 Reputation if a royal controls the Throne.", challengeable: true },
      { name: "Favoured", timing: "Reaction", effect: "Ignore one Tax per round.", challengeable: true, oncePerRound: true },
    ],
  },
  {
    id: "thief", name: "Thief", family: "ThiefSpy", rarity: "Common",
    canBePublic: true, canBeHidden: true, duelBonusAttack: 1,
    flavour: "Never guilty. Always nearby.",
    abilities: [
      { name: "Steal", timing: "AtLocation", effect: "Take 1 gold from another player at your location.", challengeable: true },
      { name: "Slip Away", timing: "Reaction", effect: "Ignore Tax.", challengeable: true },
    ],
  },
  {
    id: "spy", name: "Spy", family: "ThiefSpy", rarity: "Common",
    canBePublic: true, canBeHidden: true, duelBonusAttack: 1,
    flavour: "Knows too much, says too little.",
    abilities: [
      { name: "Peek", timing: "AtLocation", effect: "Look at one random Action Card from another player at your location.", challengeable: true },
      { name: "False Trail", timing: "AtLocation", effect: "At Tavern/Market: once per game, move 1 Reputation loss from yourself to another player at your location.", challengeable: true, oncePerGame: true },
    ],
  },
  {
    id: "royaladvisor", name: "Royal Advisor", family: "Advisor", rarity: "Uncommon",
    canBePublic: true, canBeHidden: true,
    flavour: "The real power is often standing beside the chair.",
    abilities: [
      { name: "Counsel", timing: "AtLocation", location: "throne", effect: "Draw 1 Royal Action Card for 2 gold even if you do not control the Throne.", challengeable: true },
      { name: "Whisper Vote", timing: "Vote", effect: "During a formal vote at Throne, add +1 vote weight to either side.", challengeable: true },
    ],
  },
  {
    id: "collegeadvisor", name: "College Advisor", family: "Advisor", rarity: "Uncommon",
    canBePublic: true, canBeHidden: true,
    flavour: "Has read the rules. May abuse them.",
    abilities: [
      { name: "Scholar", timing: "Movement", effect: "You may move from College to Scrolls.", challengeable: true },
      { name: "Deep Research", timing: "AtLocation", location: "scrolls", effect: "Use the strong Scrolls action.", challengeable: true },
    ],
  },
  {
    id: "tavernwhisperer", name: "Tavern Whisperer", family: "Advisor", rarity: "Common",
    canBePublic: true, canBeHidden: true,
    flavour: "Nothing said here stays here.",
    abilities: [
      { name: "Rumour", timing: "AtLocation", location: "tavern", effect: "Choose one player at Tavern. They lose 1 Reputation unless they pay you 1 gold.", challengeable: true },
      { name: "Eavesdrop", timing: "AtLocation", location: "tavern", effect: "Look at one Action Card from another player at Tavern.", challengeable: true },
    ],
  },
];

/* ---- Starter Action Cards (§27). Data structure scales to the full 76. ---- */
CT.ACTION_CARDS = [
  // Market
  { id: "secret_passage",  name: "Secret Passage",  deck: "Market", timing: "Movement", effect: "Move to any connected location, then move one extra space.", requiresManualResolution: false },
  { id: "bribe",           name: "Bribe",           deck: "Market", timing: "Vote", effect: "Give another player 1 gold to change or declare their vote. They may refuse.", requiresManualResolution: true },
  { id: "counterfeit_pass",name: "Counterfeit Pass",deck: "Market", timing: "Movement", effect: "Enter a restricted route/location this turn.", requiresManualResolution: false },
  { id: "quick_escape",    name: "Quick Escape",    deck: "Market", timing: "Reaction", effect: "After losing Reputation, move 1 space.", requiresManualResolution: false },
  { id: "trade_licence",   name: "Trade Licence",   deck: "Market", timing: "OnTurn", effect: "Make a Market-style immediate trade even if only one of you is at Market.", requiresManualResolution: true },
  // Tavern
  { id: "rumour_card",     name: "Rumour",          deck: "Tavern", timing: "OnTurn", effect: "Choose a player. They lose 1 Reputation unless they pay you 1 gold.", requiresManualResolution: false },
  { id: "false_rumour",    name: "False Rumour",    deck: "Tavern", timing: "OnTurn", effect: "Choose a player. They lose 1 Reputation. Corruption +1.", corruptionChange: 1, requiresManualResolution: false },
  { id: "flee",            name: "Flee",            deck: "Tavern", timing: "Duel", effect: "Cancel a duel against you. Move up to 2 spaces. Lose 1 Reputation.", reputationChange: -1, requiresManualResolution: false },
  { id: "blood_contract",  name: "Blood Contract",  deck: "Tavern", timing: "Manual", effect: "Make one future promise binding. If broken, breaker loses 1 Reputation and corruption +1.", requiresManualResolution: true },
  { id: "drunken_alibi",   name: "Drunken Alibi",   deck: "Tavern", timing: "Reaction", effect: "Ignore one Reputation loss at Tavern.", requiresManualResolution: false },
  // Knowledge
  { id: "call_out",        name: "Call Out",        deck: "Knowledge", timing: "OnTurn", effect: "Name one player and one hidden role. Corruption +2. If correct, target reveals/discards that role and caller gains one extra shown role. If wrong, caller loses 1 Reputation. If Cursed One correctly named, loyal players win.", corruptionChange: 2, requiresManualResolution: true },
  { id: "trace_steps",     name: "Trace Steps",     deck: "Knowledge", timing: "OnTurn", effect: "Ask where one player moved from on their last turn. They must answer truthfully.", requiresManualResolution: true },
  { id: "read_records",    name: "Read the Records",deck: "Knowledge", timing: "OnTurn", effect: "Inspect one discard pile.", requiresManualResolution: true },
  { id: "route_pass",      name: "Route Pass",      deck: "Knowledge", timing: "Movement", effect: "Move from College to Scrolls.", requiresManualResolution: false },
  { id: "hidden_witness",  name: "Hidden Witness",  deck: "Knowledge", timing: "Vote", effect: "During a vote, add +1 vote weight to either side.", requiresManualResolution: true },
  // Barracks
  { id: "hidden_knife",    name: "Hidden Knife",    deck: "Barracks", timing: "Duel", duelValue: 3, effect: "No extra effect." },
  { id: "shield",          name: "Shield",          deck: "Barracks", timing: "Duel", duelValue: 2, effect: "If you lose, ignore Shame." },
  { id: "dirty_trick",     name: "Dirty Trick",     deck: "Barracks", timing: "Duel", duelValue: 2, effect: "Corruption +1.", corruptionChange: 1 },
  { id: "arrest",          name: "Arrest",          deck: "Barracks", timing: "OnTurn", effect: "Start a duel against a player at your location. If you win, choose Drive Out or Shame.", requiresManualResolution: true },
  { id: "disarm_card",     name: "Disarm",          deck: "Barracks", timing: "Duel", duelValue: 1, effect: "If you win, Disarm discards 3 random Action Cards instead of 2.", requiresManualResolution: true },
  // Graveyard
  { id: "grave_pact",      name: "Grave Pact",      deck: "Graveyard", timing: "OnTurn", effect: "Draw 2 Graveyard cards, keep 1, discard 1. Corruption +1.", corruptionChange: 1, requiresManualResolution: true },
  { id: "blackmail",       name: "Blackmail",       deck: "Graveyard", timing: "Reaction", effect: "Cancel a vote targeting you. Lose 1 Reputation.", reputationChange: -1, requiresManualResolution: true },
  { id: "cursed_blade",    name: "Cursed Blade",    deck: "Graveyard", timing: "Duel", duelValue: 4, effect: "If you win, loser also loses 1 Reputation. Corruption +1.", corruptionChange: 1 },
  { id: "soul_debt",       name: "Soul Debt",       deck: "Graveyard", timing: "OnTurn", effect: "Gain 5 gold. Corruption +1.", corruptionChange: 1, requiresManualResolution: false },
  { id: "royal_sacrifice", name: "Royal Sacrifice", deck: "Graveyard", timing: "OnTurn", effect: "At Graveyard: if you have King or Queen, reveal and discard that royal role. Lower corruption by 3. If no royal remains active, succession begins.", corruptionChange: -3, requiresManualResolution: true },
  // Royal
  { id: "royal_decree",    name: "Royal Decree",    deck: "Royal", timing: "Vote", effect: "Start a formal vote without seconder.", requiresManualResolution: true },
  { id: "pardon_card",     name: "Pardon",          deck: "Royal", timing: "OnTurn", effect: "Give one player +1 Reputation.", reputationChange: 1, requiresManualResolution: false },
  { id: "tax_collector",   name: "Tax Collector",   deck: "Royal", timing: "OnTurn", effect: "Take 1 gold from each non-exempt player.", requiresManualResolution: true },
  { id: "royal_guard_detail", name: "Royal Guard Detail", deck: "Royal", timing: "Reaction", effect: "Cancel Drive Out or Shame against a royal or Throne controller.", requiresManualResolution: true },
  { id: "emergency_council", name: "Emergency Council", deck: "Royal", timing: "Vote", effect: "All players at Throne and Market must vote. Others may abstain.", requiresManualResolution: true },
];

CT.DECK_NAMES = ["Market", "Tavern", "Knowledge", "Barracks", "Graveyard", "Royal"];

/* ---- Location actions (§13). kind: basic | strong. `manual` = log-only (resolve at table). ---- */
CT.LOCATION_ACTIONS = {
  throne: [
    { id: "petition", kind: "basic", name: "Petition", cost: 0, hint: "Gain +1 Reputation (max 4)" },
    { id: "royal_command", kind: "strong", name: "Royal Command", cost: 0, hint: "Tax / Pardon / Decree — Throne controller only", requiresThrone: true },
  ],
  market: [
    { id: "buy", kind: "basic", name: "Buy", cost: 2, hint: "Draw 1 Market card", deck: "Market" },
    { id: "haggle", kind: "strong", name: "Haggle", cost: 3, hint: "Draw 2 Market, keep 1", deck: "Market" },
  ],
  tavern: [
    { id: "work_room", kind: "basic", name: "Work the Room", cost: 0, hint: "Gain 2 gold" },
    { id: "backroom", kind: "strong", name: "Backroom Deal", cost: 2, hint: "Draw 1 Tavern card", deck: "Tavern" },
  ],
  college: [
    { id: "study", kind: "basic", name: "Study", cost: 2, hint: "Draw 1 Knowledge card", deck: "Knowledge" },
    { id: "recover", kind: "strong", name: "Recover", cost: 2, hint: "Remove a negative effect, or regain Rep if 1–2" },
  ],
  scrolls: [
    { id: "research", kind: "basic", name: "Research", cost: 2, hint: "Draw 1 Knowledge card", deck: "Knowledge" },
    { id: "deep_research", kind: "strong", name: "Deep Research", cost: 2, hint: "Investigate — peek decks, discards, or interview a witness" },
  ],
  barracks: [
    { id: "arm", kind: "basic", name: "Arm Yourself", cost: 2, hint: "Draw 1 Barracks card", deck: "Barracks" },
    { id: "serious_duel", kind: "strong", name: "Serious Duel", cost: 0, hint: "Start a Serious Duel — Barracks, once per game", oncePerGame: true },
  ],
  graveyard: [
    { id: "scavenge", kind: "basic", name: "Scavenge", cost: 0, hint: "Gain 3 gold, lose 1 Reputation" },
    { id: "buy_grave", kind: "strong", name: "Buy Graveyard Card", cost: 4, hint: "Corruption +1, draw 1 Graveyard card", deck: "Graveyard" },
  ],
};
CT.actionDef = function (locId, actId) {
  return (CT.LOCATION_ACTIONS[locId] || []).find(function (a) { return a.id === actId; });
};

/* Succession ranks & claim windows (§24). window = full rounds the claimant must survive. */
CT.SUCCESSION = {
  firstborn:     { rank: 1, window: 0, label: "First Claim",  note: "immediate unless challenged by hidden King/Queen" },
  secondborn:    { rank: 2, window: 1, label: "Second Claim", note: "survive 1 full round" },
  tinytyrant:    { rank: 3, window: 2, label: "Third Claim",  note: "survive 2 full rounds" },
  distantcousin: { rank: 4, window: 3, label: "Weak Claim",   note: "survive 3 full rounds" },
};
CT.SUCCESSION_ORDER = ["firstborn", "secondborn", "tinytyrant", "distantcousin"];

/* lookups */
CT.roleById = function (id) { return CT.ROLES.find(function (r) { return r.id === id; }); };
CT.cardById = function (id) { return CT.ACTION_CARDS.find(function (c) { return c.id === id; }); };
CT.locationById = function (id) { return CT.LOCATIONS.find(function (l) { return l.id === id; }); };

/* Auto-playable action cards (mirrors dethrone/data.py CARD_AUTO_EFFECTS). */
CT.AUTO_PLAY = {
  spare_coin_purse: {}, spirit_coin: {}, soul_debt: {}, performers_tale: {}, grave_dust: {},
  training_dummy: {}, forbidden_tome: {}, last_rites: {}, royal_purse: {}, hangover_cure: {},
  pardon_card: { needsTarget: true }, false_rumour: { needsTarget: true }, rumour_card: { needsTarget: true },
  secret_passage: { needsLocation: true }, merchants_map: { needsLocation: true },
  counterfeit_pass: { needsLocation: true }, route_pass: {},
  tax_collector: {},
  stolen_offering: { atLocation: "graveyard" },
  market_day: { atLocation: "market" },
  loan_shark: { needsTarget: true, sameLocation: true },
  intimidate: { needsTarget: true, sameLocation: true },
  bought_round: { needsTarget: true, sameLocation: true },
  queens_favour: { needsTarget: true }, herald: {}, succession_edict: {},
  caravan_manifest: { optionalTarget: true, sameLocation: true },
  study_companion: { optionalTarget: true, sameLocation: true },
  bone_dice: {}, old_prophecy: { needsDeck: true }, read_records: { needsDeck: true },
  wraith_whisper: {}, grave_pact: {},
  map_of_tunnels: { needsLocation: true, tunnel: true },
  arrest: { needsTarget: true, sameLocation: true, openDuel: true },
  tavern_brawl: { needsTarget: true, sameLocation: true, atLocation: "tavern", openDuel: true },
  fence: { needsDiscardCard: true },
  sow_doubt: { needsTarget: true },
  court_summons: { needsTarget: true },
  royal_sacrifice: { atLocation: "graveyard" },
  royal_decree: { needsTarget: true, openVote: true },
  sealed_warrant: { needsTarget: true, openVote: true, maxRep: 2 },
  banish_letter: { needsTarget: true, openVote: true, maxRep: 1 },
  emergency_council: { needsTarget: true, openVote: true, emergency: true },
  trade_licence: { openTrade: true },
  blood_contract: { openContract: true },
  call_out: { openCallout: true },
  smugglers_run: { needsLocation: true, smuggleRun: true },
  whisper_network: { needsTarget: true, sameLocation: true, atLocation: "tavern" },
  witness_statement: { needsTarget: true },
  alibi_check: { needsTarget: true, needsLocation: true, namedLocation: true },
  trace_steps: { needsTarget: true },
  secret_ledger: { needsTarget: true },
  guild_seal: {},
};
CT.PROACTIVE_REACTIONS = { guild_seal: true };
CT.DUEL_CARD_VALUES = {
  hidden_knife: 3, shield: 2, dirty_trick: 2, disarm_card: 1, cursed_blade: 4,
  loaded_dice: 1, second_blade: 2, parry: 2, iron_gauntlet: 1,
};
CT.VOTE_CARD_BONUSES = { hidden_witness: 1, crown_witness: 2 };
CT.VOTE_CARD_REQUIRES = { crown_witness: { location: "throne" } };
CT.ROLE_VOTE_ABILITIES = { royaladvisor: { bonus: 1, name: "Whisper Vote", location: "throne" } };
CT.DECK_BUY_COST = { Market: 2, Tavern: 2, Knowledge: 2, Barracks: 2, Graveyard: 4, Royal: 2 };
CT.REACTION_EFFECTS = {
  stitched_lip: { trigger: "rumour", costRep: 0 },
  mourning_veil: { trigger: "callout" },
  blackmail: { trigger: "vote_pass", costRep: 1 },
  kneel: { trigger: "vote_pass", requiresRoyalThrone: true },
  veterans_warning: { trigger: "duel_declared" },
  flee: { trigger: "duel_declared", costRep: 1, flee: true },
  drunken_alibi: { trigger: "rep_loss", requiresLocation: "tavern" },
  quick_escape: { trigger: "rep_loss", quickEscape: true },
  royal_guard_detail: { trigger: "duel_consequence" },
};
/* Public-role AtLocation abilities (Phase 14) — mechanical subset. */
CT.ROLE_ABILITY_EFFECTS = {
  thief_steal: { role: "thief", name: "Steal", goldTransfer: 1, needsTarget: true, sameLocation: true },
  spy_peek: { role: "spy", name: "Peek", peekCard: true, needsTarget: true, sameLocation: true },
  whisperer_eavesdrop: { role: "tavernwhisperer", name: "Eavesdrop", locations: ["tavern"], peekCard: true, needsTarget: true, sameLocation: true },
  whisperer_rumour: { role: "tavernwhisperer", name: "Rumour", locations: ["tavern"], rumour: true, needsTarget: true, sameLocation: true },
  favourite_suck_up: { role: "courtfavourite", name: "Suck Up", locations: ["throne"], repGain: 1, requiresRoyalThrone: true },
  advisor_counsel: { role: "royaladvisor", name: "Counsel", locations: ["throne"], goldCost: 2, drawDeck: "Royal" },
  secondborn_ambition: { role: "secondborn", name: "Quiet Ambition", locations: ["tavern", "market"], repGain: 1, requiresRoyalRoleLost: true },
  tyrant_tantrum: { role: "tinytyrant", name: "Tantrum", repLoss: 1, needsTarget: true, sameLocation: true, oncePerRound: true },
  cousin_name_drop: { role: "distantcousin", name: "Name Drop", locations: ["tavern", "market"], goldGain: 1 },
  graveguard_watch: { role: "graveyardguard", name: "Stand Watch", locations: ["graveyard"], repLoss: 1, needsTarget: true, targetNotSelf: true },
};
CT.roleAbilitiesAvailable = function (p) {
  if (!p || !p.publicRoleId || p.status !== "active" || !CT.state) return [];
  var out = [];
  Object.keys(CT.ROLE_ABILITY_EFFECTS).forEach(function (aid) {
    var fx = CT.ROLE_ABILITY_EFFECTS[aid];
    if (fx.role !== p.publicRoleId) return;
    if (fx.locations && fx.locations.indexOf(p.location) === -1) return;
    if (fx.oncePerRound && (p.abilitiesUsedThisRound || []).indexOf(aid) !== -1) return;
    if (fx.requiresRoyalThrone) {
      var t = CT.state.throne;
      if (!t.kingControllerId && !t.queenControllerId) return;
    }
    if (fx.requiresRoyalRoleLost && !CT.state.royalRoleLost) return;
    if ((fx.goldCost || 0) > p.gold) return;
    out.push({ id: aid, name: fx.name, needsTarget: !!fx.needsTarget });
  });
  return out;
};
CT.playerSuccessionRoles = function (p) {
  if (!p) return [];
  var held = CT.allRoleIds(p);
  return CT.SUCCESSION_ORDER.filter(function (rid) { return held.indexOf(rid) !== -1; });
};
CT.canAutoPlayCard = function (cardId) { return !!CT.AUTO_PLAY[cardId]; };
