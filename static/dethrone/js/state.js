/* The Cursed Throne — game state, logging, save/load (Phase 1) */
window.CT = window.CT || {};

CT.STORAGE_KEY = "cursed-throne-save-v1";
CT.SAVE_VERSION = 1;

/* The single source of truth. Null until a game is set up / loaded. */
CT.state = null;

/* ---- small utilities ---- */
CT.util = {
  uid: function (prefix) {
    return (prefix || "id") + "-" + Math.random().toString(36).slice(2, 9);
  },
  clamp: function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); },
  shuffle: function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },
  nowLabel: function () {
    var d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },
};

/* ---- logging (§34). Never store hidden info unless already revealed. ---- */
CT.log = function (text, kind) {
  if (!CT.state) return;
  CT.state.log.unshift({
    id: CT.util.uid("log"),
    t: Date.now(),
    label: CT.util.nowLabel(),
    round: CT.state.round,
    text: text,
    kind: kind || "event", // event | corruption | note | system
  });
  CT.save();
};

/* ---- create a fresh game from finished setup data ----
 * playersInput: [{ name, dealtRoleIds:[3], publicRoleId, hiddenRoleIds:[2] }]
 * undealtRoleIds: roles not dealt (used for extra-shown roles later)
 * startingActionByPlayer: { playerIndex: [cardId, cardId] }            */
CT.newGame = function (playersInput, undealtRoleIds, startingActionByPlayer, firstPlayerIndex) {
  var C = CT.CONST;
  var R = CT.getRules();
  var balance = Object.assign({}, CT.DEFAULT_BALANCE, CT.pendingBalance || {});
  CT.state = {
    version: CT.SAVE_VERSION,
    createdAt: Date.now(),
    phase: "play",
    round: 1,
    activePlayerIndex: firstPlayerIndex || 0,
    corruption: 0,
    innocentElims: 0,
    balance: balance,
    throne: { kingControllerId: null, queenControllerId: null, successorId: null, claimOrder: [],
              succession: { open: false, claims: [] } },
    winner: null, // null | "loyal" | "cursed"
    undealtRoleIds: undealtRoleIds.slice(),
    players: playersInput.map(function (p, i) {
      return {
        id: CT.util.uid("p"),
        name: p.name,
        isBot: !!p.isBot,
        location: C.START_LOCATION,
        gold: balance.startGold != null ? balance.startGold : R.START_GOLD,
        rep: balance.startRep != null ? balance.startRep : R.START_REP,
        status: "active",
        publicRoleId: p.publicRoleId,
        hiddenRoleIds: p.hiddenRoleIds.slice(),
        extraShownRoleIds: [],
        actionCardIds: (startingActionByPlayer && startingActionByPlayer[i]) ? startingActionByPlayer[i].slice() : [],
        wounded: false,
        seriousDuelUsed: false,
      };
    }),
    decks: {},     // deckName -> [cardId] draw pile (shuffled)
    discards: {},  // deckName -> [cardId]
    contracts: [], // Blood Contracts (§25): {id, aId, bId, promise, status}
    log: [],
  };
  CT.DECK_NAMES.forEach(function (name) {
    CT.state.decks[name] = CT.util.shuffle(CT.ACTION_CARDS.filter(function (c) { return c.deck === name; }).map(function (c) { return c.id; }));
    CT.state.discards[name] = [];
  });
  CT.log("Game started: " + CT.state.players.length + " players. Round 1.", "system");
  CT.log("First to act: " + CT.state.players[CT.state.activePlayerIndex].name + ".", "system");
  CT.save();
  return CT.state;
};

/* ---- player accessors ---- */
CT.activePlayer = function () {
  return CT.state ? CT.state.players[CT.state.activePlayerIndex] : null;
};
CT.playerById = function (id) {
  return CT.state ? CT.state.players.find(function (p) { return p.id === id; }) : null;
};

/* ---- turn / round advance (§11). Skip eliminated. Round ticks when wrapping. ---- */
CT.endTurn = function () {
  var s = CT.state;
  if (!s || s.winner) return;
  var ap = CT.activePlayer();
  if (ap && CT.overHandLimit(ap)) {
    return { ok: false, msg: "Discard down to " + CT.getRules().HAND_LIMIT + " cards before ending your turn." };
  }
  var n = s.players.length;
  var start = s.activePlayerIndex;
  var idx = start;
  for (var step = 0; step < n; step++) {
    idx = (idx + 1) % n;
    if (s.players[idx].status === "active") break;
  }
  // round increments when the next active player's index is <= current (wrapped around)
  var wrapped = idx <= start;
  s.activePlayerIndex = idx;
  if (wrapped) {
    s.round += 1;
    // once-per-round flags would reset here in later phases
    CT.log("Round " + s.round + " started.", "system");
  }
  CT.log("Turn passes to " + s.players[idx].name + ".");
  CT.save();
  return { ok: true };
};

/* ---- corruption (§15). Always log reason. Detect Cursed win / Final Rite warning. ---- */
CT.setCorruption = function (value, reason) {
  var s = CT.state; if (!s) return;
  var R = CT.getRules();
  var v = CT.util.clamp(Math.round(value), 0, R.CORRUPTION_MAX);
  var prev = s.corruption;
  if (v === prev) return;
  s.corruption = v;
  CT.log("Corruption " + (v > prev ? "rose" : "fell") + " to " + v + (reason ? ": " + reason : "") + ".", "corruption");
  if (v >= R.FINAL_RITE_CORRUPTION && prev < R.FINAL_RITE_CORRUPTION) {
    CT.log("Warning: corruption is " + v + ". Final Rite is now possible at the Graveyard.", "corruption");
  }
  if (v >= R.CORRUPTION_MAX) CT.declareWinner("cursed", "Corruption reached " + R.CORRUPTION_MAX);
  CT.save();
};
CT.adjustCorruption = function (delta, reason) {
  if (!CT.state) return;
  CT.setCorruption(CT.state.corruption + delta, reason);
};

/* ---- innocent eliminations (§20) ---- */
CT.setInnocentElims = function (value, reason) {
  var s = CT.state; if (!s) return;
  var v = CT.util.clamp(Math.round(value), 0, 99);
  if (v === s.innocentElims) return;
  s.innocentElims = v;
  CT.log("Innocent eliminations now " + v + (reason ? ": " + reason : "") + ".", "event");
  if (v >= CT.getRules().INNOCENT_ELIMS_TO_LOSE) CT.declareWinner("cursed", v + " innocent players eliminated");
  CT.save();
};

/* ---- per-player adjustments (§14, §32) ---- */
CT.adjustGold = function (playerId, delta, reason) {
  var p = CT.playerById(playerId); if (!p) return;
  p.gold = Math.max(0, p.gold + delta);
  CT.log(p.name + (delta >= 0 ? " gained " : " lost ") + Math.abs(delta) + " gold" + (reason ? " (" + reason + ")" : "") + ". Now " + p.gold + ".");
  CT.save();
};
CT.adjustRep = function (playerId, delta, reason, allowDebug) {
  var p = CT.playerById(playerId); if (!p) return;
  var lo = allowDebug ? -99 : CT.CONST.REP_MIN, hi = allowDebug ? 99 : CT.CONST.REP_MAX;
  var prev = p.rep;
  p.rep = CT.util.clamp(p.rep + delta, lo, hi);
  if (p.rep === prev) return;
  CT.log(p.name + " Reputation " + (p.rep > prev ? "up" : "down") + " to " + p.rep + (reason ? " (" + reason + ")" : "") + ".");
  CT.save();
};
CT.movePlayer = function (playerId, locationId, manual) {
  var p = CT.playerById(playerId); if (!p) return;
  var from = CT.locationById(p.location), to = CT.locationById(locationId);
  if (!to || p.location === locationId) return;
  p.location = locationId;
  CT.log(p.name + " moved " + (from ? from.name : "?") + " → " + to.name + (manual ? " (manual)" : "") + ".");
  CT.save();
};

/* ---- win detection (§9) ---- */
CT.declareWinner = function (side, reason) {
  var s = CT.state; if (!s || s.winner) return;
  s.winner = side;
  var who = side === "loyal" ? "Loyal players win" : "Cursed player wins";
  CT.log(who + "! " + (reason || ""), "system");
  CT.save();
};

/* ---- save / load (§33) ---- */
CT.save = function () {
  if (!CT.state) return;
  try {
    localStorage.setItem(CT.STORAGE_KEY, JSON.stringify(CT.state));
  } catch (e) { /* storage may be unavailable on some file:// setups */ }
};
CT.load = function () {
  try {
    var raw = localStorage.getItem(CT.STORAGE_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data || data.version !== CT.SAVE_VERSION) return null;
    if (!data.contracts) data.contracts = []; // backfill saves from before Phase 3
    if (data.throne && !data.throne.succession) { data.throne.successorId = null; data.throne.succession = { open: false, claims: [] }; } // pre-Phase-4
    CT.state = data;
    return CT.state;
  } catch (e) { return null; }
};
CT.exportJSON = function () {
  return JSON.stringify(CT.state, null, 2);
};
CT.importJSON = function (text) {
  var data = JSON.parse(text);
  if (!data || !data.players) throw new Error("Not a valid Cursed Throne save.");
  CT.state = data;
  CT.save();
  return CT.state;
};
CT.resetGame = function () {
  CT.state = null;
  try { localStorage.removeItem(CT.STORAGE_KEY); } catch (e) {}
};

/* ===================== Phase 2: core play ===================== */

/* legal normal moves = directly connected locations (§7). Special movement stays manual. */
CT.legalMoves = function (player) {
  return (CT.CONNECTIONS[player.location] || []).slice();
};

/* ensure a deck draw pile has cards (reshuffle if needed) without drawing. */
CT._ensureDrawPile = function (deckName) {
  var pile = CT.state.decks[deckName];
  if (!pile || !pile.length) {
    if (CT.state.discards[deckName].length) {
      CT.state.decks[deckName] = CT.util.shuffle(CT.state.discards[deckName]);
      CT.state.discards[deckName] = [];
    } else {
      CT.state.decks[deckName] = CT.util.shuffle(CT.ACTION_CARDS.filter(function (c) { return c.deck === deckName; }).map(function (c) { return c.id; }));
    }
    pile = CT.state.decks[deckName];
  }
  return pile;
};

/* draw 1 from a deck into a hand (§26). Generic public log — never reveal the card name. */
CT.drawCard = function (playerId, deckName, reason) {
  var p = CT.playerById(playerId); if (!p) return null;
  var hadCards = CT.state.decks[deckName] && CT.state.decks[deckName].length;
  var pile = CT._ensureDrawPile(deckName);
  if (!hadCards && pile.length) CT.log(deckName + " deck reshuffled.", "system");
  if (!pile.length) return null;
  var id = pile.shift();
  p.actionCardIds.push(id);
  CT.log(p.name + " drew a " + deckName + " card" + (reason ? " (" + reason + ")" : "") + ".");
  CT.save();
  return id;
};

/* discard an action card from a hand to its deck's discard pile. Generic public log. */
CT.discardCard = function (playerId, cardId, reason) {
  var p = CT.playerById(playerId); if (!p) return;
  var i = p.actionCardIds.indexOf(cardId);
  if (i === -1) return;
  p.actionCardIds.splice(i, 1);
  var card = CT.cardById(cardId);
  if (card) CT.state.discards[card.deck].push(cardId);
  CT.log(p.name + " discarded an action card" + (reason ? " (" + reason + ")" : "") + ".");
  CT.save();
};

CT.overHandLimit = function (player) { return player.actionCardIds.length > CT.getRules().HAND_LIMIT; };

CT.togglePlayerElim = function (playerId) {
  var p = CT.playerById(playerId);
  if (!p) return;
  p.status = p.status === "active" ? "eliminated" : "active";
  CT.log(p.name + " was " + (p.status === "eliminated" ? "eliminated" : "restored") + " (manual).");
  CT.save();
};

/* Play an auto-resolvable action card from hand (active player, OnTurn). */
CT.playActionCard = function (playerId, cardId, opts) {
  opts = opts || {};
  var s = CT.state;
  if (!s || s.winner) return { ok: false, msg: "Game over." };
  var ap = CT.activePlayer();
  if (!ap || ap.id !== playerId) return { ok: false, msg: "Not your turn." };
  var p = CT.playerById(playerId);
  if (!p || p.actionCardIds.indexOf(cardId) === -1) return { ok: false, msg: "Card not in hand." };
  var fx = CT.AUTO_PLAY[cardId];
  if (!fx) return { ok: false, msg: "Resolve this card manually at the table." };
  if (fx.atLocation && p.location !== fx.atLocation) {
    var needLoc = CT.locationById(fx.atLocation);
    return { ok: false, msg: "Must be at " + (needLoc ? needLoc.name : fx.atLocation) + "." };
  }
  var target = opts.targetId ? CT.playerById(opts.targetId) : null;
  if (fx.needsTarget && (!target || target.status !== "active")) return { ok: false, msg: "Choose a target." };
  if (fx.sameLocation && target && target.location !== p.location) return { ok: false, msg: "Target must be at your location." };
  if (fx.needsDeck && !opts.deckName) return { ok: false, msg: "Choose a deck." };
  if (cardId === "bought_round" && p.gold < 1) return { ok: false, msg: "Not enough gold." };

  var card = CT.cardById(cardId);
  var cname = card ? card.name : cardId;
  var extra = {};

  if (cardId === "bought_round") p.gold -= 1;
  CT.log(p.name + " plays " + cname + ".");

  if (cardId === "route_pass") {
    if (p.location !== "college") return { ok: false, msg: "Must be at College." };
    CT.movePlayer(playerId, "scrolls", true);
  } else if (fx.needsLocation) {
    if (!opts.locationId) return { ok: false, msg: "Choose a destination." };
    if (fx.tunnel) {
      var tun = p.location === "market" ? "scrolls" : (p.location === "college" ? "barracks" : null);
      if (!tun || opts.locationId !== tun) return { ok: false, msg: "Invalid tunnel route." };
    } else if (CT.legalMoves(p).indexOf(opts.locationId) === -1) {
      return { ok: false, msg: "Choose a reachable location." };
    }
    CT.movePlayer(playerId, opts.locationId, true);
  }

  if (cardId === "spare_coin_purse") { p.gold += 2; CT.log(p.name + " gained 2 gold. Now " + p.gold + "."); }
  if (cardId === "spirit_coin") { p.gold += 2; CT.adjustCorruption(1, cname); CT.log(p.name + " gained 2 gold. Now " + p.gold + "."); }
  if (cardId === "soul_debt") { p.gold += 5; CT.adjustCorruption(1, cname); CT.log(p.name + " gained 5 gold. Now " + p.gold + "."); }
  if (cardId === "performers_tale") CT.adjustRep(playerId, 1, cname);
  if (cardId === "grave_dust") { CT.adjustCorruption(-1, cname); CT.adjustRep(playerId, -1, cname); }
  if (cardId === "training_dummy") CT.drawCard(playerId, "Barracks", cname);
  if (cardId === "forbidden_tome") { CT.drawCard(playerId, "Graveyard", cname); CT.adjustCorruption(2, cname); }
  if (cardId === "last_rites") { if (s.corruption >= 6) CT.adjustRep(playerId, 1, "Last Rites"); CT.adjustCorruption(1, cname); }
  if (cardId === "royal_purse") {
    var t = s.throne;
    if (p.id === t.kingControllerId || p.id === t.queenControllerId) { p.gold += 3; CT.log(p.name + " gained 3 gold. Now " + p.gold + "."); }
    else CT.log(p.name + " does not control the Throne — no gold from Royal Purse.", "note");
  }
  if (cardId === "hangover_cure") {
    if (p.wounded) { p.wounded = false; CT.log(p.name + " removed Wound (Hangover Cure)."); }
    else if (p.rep <= 2) CT.adjustRep(playerId, 1, "Hangover Cure");
    else CT.log(p.name + " had nothing to cure.", "note");
  }
  if (cardId === "pardon_card" && target) CT.adjustRep(target.id, 1, cname);
  if (cardId === "false_rumour" && target) { CT.adjustRep(target.id, -1, cname); CT.adjustCorruption(1, cname); }
  if (cardId === "rumour_card" && target) {
    if (target.gold >= 1) { target.gold -= 1; p.gold += 1; CT.log(target.name + " paid 1 gold to " + p.name + " to silence the Rumour."); }
    else CT.adjustRep(target.id, -1, "Rumour");
  }

  if (cardId === "tax_collector") {
    var taken = 0;
    s.players.forEach(function (other) {
      if (other.status !== "active" || other.id === playerId) return;
      var amt = Math.min(1, other.gold);
      if (amt) { other.gold -= amt; p.gold += amt; taken += amt; }
    });
    if (taken) CT.log(p.name + " collected " + taken + " gold in taxes.");
  }
  if (cardId === "stolen_offering") {
    s.players.forEach(function (other) {
      if (other.status !== "active" || other.id === playerId || other.location !== "graveyard") return;
      var amt = Math.min(1, other.gold);
      if (amt) { other.gold -= amt; p.gold += amt; }
    });
    CT.log(p.name + " collected offerings at the Graveyard.");
  }
  if (cardId === "market_day") {
    s.players.forEach(function (other) {
      if (other.status === "active" && other.location === "market") {
        other.gold += 1;
        CT.log(other.name + " gains 1 gold (Market Day).");
      }
    });
  }
  if (cardId === "loan_shark" && target) {
    var loan = Math.min(3, target.gold);
    if (loan) { target.gold -= loan; p.gold += loan; CT.log(p.name + " took " + loan + " gold from " + target.name + "."); }
    else CT.adjustRep(target.id, -1, cname);
  }
  if (cardId === "intimidate" && target) {
    if (target.gold >= 2) { target.gold -= 2; p.gold += 2; CT.log(target.name + " paid 2 gold to " + p.name + "."); }
    else CT.adjustRep(target.id, -1, cname);
  }
  if (cardId === "bought_round" && target) {
    CT.adjustRep(playerId, 1, cname);
    CT.adjustRep(target.id, 1, cname);
  }
  if (cardId === "queens_favour" && target) {
    CT.adjustRep(target.id, 1, cname);
    p.gold += 1;
    CT.log(p.name + " gained 1 gold. Now " + p.gold + ".");
  }
  if (cardId === "herald") CT.adjustRep(playerId, 1, cname);
  if (cardId === "succession_edict") CT.openSuccession();
  if (cardId === "caravan_manifest") CT.drawCard(playerId, "Market", cname);
  if (cardId === "study_companion") CT.drawCard(playerId, "Knowledge", cname);
  if (cardId === "bone_dice") {
    CT.adjustCorruption(1, cname);
    if (Math.random() < 0.5) { p.gold += 4; CT.log(p.name + " rolled high on the Bone Dice — +4 gold."); }
    else CT.adjustRep(playerId, -1, "Bone Dice");
  }
  if (cardId === "old_prophecy" && opts.deckName) {
    var peekPile = CT._ensureDrawPile(opts.deckName);
    var topId = peekPile.length ? peekPile[0] : null;
    var topCard = topId ? CT.cardById(topId) : null;
    CT.ui.privateNote = "Top of " + opts.deckName + " deck: " + (topCard ? topCard.name : topId || "nothing");
    CT.log(p.name + " consulted the " + opts.deckName + " deck.", "note");
  }
  if (cardId === "read_records" && opts.deckName) {
    var disc = CT.state.discards[opts.deckName] || [];
    var discTop = disc.length ? disc[disc.length - 1] : null;
    var discCard = discTop ? CT.cardById(discTop) : null;
    CT.ui.privateNote = "Top of " + opts.deckName + " discard: " + (discCard ? discCard.name : discTop || "empty");
    CT.log(p.name + " read the " + opts.deckName + " discard pile.", "note");
  }
  if (cardId === "wraith_whisper") {
    var gdisc = CT.state.discards.Graveyard || [];
    if (gdisc.length) {
      var pick = gdisc[Math.floor(Math.random() * gdisc.length)];
      var pickCard = CT.cardById(pick);
      CT.ui.privateNote = "Graveyard discard (random): " + (pickCard ? pickCard.name : pick);
    } else CT.ui.privateNote = "Graveyard discard pile is empty.";
    CT.log(p.name + " listened to the Graveyard whispers.", "note");
  }
  if (cardId === "grave_pact") {
    CT.adjustCorruption(1, cname);
    var dname = "Graveyard";
    var pactPile = CT._ensureDrawPile(dname);
    var ga = pactPile.shift();
    pactPile = CT._ensureDrawPile(dname);
    var gb = pactPile.shift();
    if (!ga || !gb) return { ok: false, msg: "Graveyard deck ran dry." };
    extra.keepOne = { deck: dname, cards: [ga, gb] };
  }
  if (fx.openDuel && target) {
    extra.openDuel = { attackerId: playerId, defenderId: target.id };
  }

  CT.discardCard(playerId, cardId, "played");
  return Object.assign({ ok: true }, extra);
};

/* execute a location action's mechanical effect (§13).
 * returns { ok, manual?, keepOne?:{deck, cards:[a,b]}, msg? } so the UI can follow up. */
CT.doLocationAction = function (playerId, actId) {
  var p = CT.playerById(playerId); if (!p) return { ok: false };
  var def = CT.actionDef(p.location, actId);
  if (!def) return { ok: false };
  if (p.gold < (def.cost || 0)) return { ok: false, msg: "Not enough gold." };

  // pay cost up front (logged generically)
  if (def.cost) { p.gold -= def.cost; }

  switch (actId) {
    case "petition":
      var before = p.rep; p.rep = Math.min(4, p.rep + 1);
      CT.log(p.name + " petitioned the Throne. Reputation " + (p.rep > before ? "→ " + p.rep : "unchanged (cap 4)") + ".");
      break;
    case "work_room":
      p.gold += 2; CT.log(p.name + " worked the room at the Tavern. +2 gold → " + p.gold + ".");
      break;
    case "scavenge":
      p.gold += 3; CT.log(p.name + " scavenged the Graveyard. +3 gold → " + p.gold + ".");
      CT.adjustRep(playerId, -1, "Scavenge");
      break;
    case "buy_grave":
      CT.log(p.name + " paid " + def.cost + " gold for a Graveyard card.");
      CT.adjustCorruption(1, "bought a Graveyard card");
      CT.drawCard(playerId, "Graveyard");
      break;
    case "recover":
      if (p.wounded) { p.wounded = false; CT.log(p.name + " recovered at the College: Wound removed."); }
      else if (p.rep <= 2) { CT.log(p.name + " recovered at the College."); CT.adjustRep(playerId, 1, "Recover"); }
      else { p.gold += def.cost; return { ok: false, msg: "Nothing to recover." }; } // refund
      break;
    case "buy": case "backroom": case "study": case "research": case "arm":
      CT.log(p.name + " paid " + def.cost + " gold at the " + CT.locationById(p.location).name + ".");
      CT.drawCard(playerId, def.deck);
      break;
    case "haggle":
      CT.log(p.name + " haggled at the Market (paid " + def.cost + " gold).");
      var a = CT.state.decks.Market.shift(), b = CT.state.decks.Market.shift();
      // refill safety if deck ran dry
      while ((!a || !b)) {
        CT.state.decks.Market = CT.util.shuffle(CT.ACTION_CARDS.filter(function (c) { return c.deck === "Market"; }).map(function (c) { return c.id; }));
        if (!a) a = CT.state.decks.Market.shift();
        if (!b) b = CT.state.decks.Market.shift();
      }
      CT.save();
      return { ok: true, keepOne: { deck: "Market", cards: [a, b] } };
    case "royal_command":
      CT.log(p.name + " exercises Royal Command.", "event");
      return { ok: true, openRoyalCommand: { controllerId: playerId } };
    case "serious_duel":
      if (p.location !== "barracks") return { ok: false, msg: "Must be at the Barracks." };
      if (p.seriousDuelUsed) return { ok: false, msg: "Serious Duel already used this game." };
      CT.log(p.name + " starts a Serious Duel at the Barracks.", "event");
      return { ok: true, openDuel: { attackerId: playerId, serious: true } };
    default:
      // manual actions (deep_research)
      CT.log(p.name + " used " + def.name + " (resolve at the table).", "note");
      CT.save();
      return { ok: true, manual: true };
  }
  CT.save();
  return { ok: true };
};

/* resolve a Haggle keep-1 choice */
CT.resolveKeepOne = function (playerId, deck, keepId, dropId) {
  var p = CT.playerById(playerId); if (!p) return;
  p.actionCardIds.push(keepId);
  CT.state.discards[deck].push(dropId);
  CT.log(p.name + " kept one card and discarded the other.");
  CT.save();
};

/* ---- role-card loss (§20). The central, careful flow. ----
 * slot: "public" | "hidden" | "extra". Reveals only the discarded card. */
CT.applyRoleDiscard = function (playerId, slot, roleId) {
  var p = CT.playerById(playerId); if (!p) return;
  var role = CT.roleById(roleId);
  if (slot === "public" && p.publicRoleId === roleId) {
    p.publicRoleId = null;
    CT.log(p.name + " lost their public role: " + role.name + ".");
  } else if (slot === "hidden") {
    var hi = p.hiddenRoleIds.indexOf(roleId);
    if (hi === -1) return;
    p.hiddenRoleIds.splice(hi, 1);
    CT.log(p.name + " discarded a hidden role — revealed: " + role.name + ".");
  } else if (slot === "extra") {
    var ei = p.extraShownRoleIds.indexOf(roleId);
    if (ei === -1) return;
    p.extraShownRoleIds.splice(ei, 1);
    CT.log(p.name + " lost a shown role: " + role.name + ".");
  } else { return; }

  // Cursed One revealed/discarded -> loyal players win (§9, §20)
  if (roleId === "cursedone") { CT.declareWinner("loyal", "The Cursed One was revealed"); CT.save(); return; }

  // Royal removal (§23): a discarded King/Queen loses any Throne control they held
  if (roleId === "king" && CT.state.throne.kingControllerId === playerId) {
    CT.state.throne.kingControllerId = null; CT.log(p.name + " is removed as King; the crown's control is lost.", "event");
  }
  if (roleId === "queen" && CT.state.throne.queenControllerId === playerId) {
    CT.state.throne.queenControllerId = null; CT.log(p.name + " is removed as Queen; the crown's control is lost.", "event");
  }

  // elimination check (§20)
  var remaining = (p.publicRoleId ? 1 : 0) + p.hiddenRoleIds.length + p.extraShownRoleIds.length;
  if (remaining === 0 && p.status === "active") {
    p.status = "eliminated";
    CT.log(p.name + " has no role cards left and is eliminated.", "event");
    // a Cursed elimination would already have triggered loyal win above, so this is an innocent
    if (!CT.state.winner) CT.setInnocentElims(CT.state.innocentElims + 1, p.name + " eliminated");
  }
  CT.save();
};

/* ===================== Phase 3: social-mechanic engine bits ===================== */

/* Call Out success grants the caller one extra shown role (§28), drawn face-up
 * from the undealt role deck. Limit one extra shown role at a time. */
CT.grantExtraShownRole = function (callerId, reason) {
  var p = CT.playerById(callerId); if (!p) return;
  if (p.extraShownRoleIds.length > 0) { CT.log(p.name + " already has an extra shown role; none granted.", "note"); return; }
  if (!CT.state.undealtRoleIds.length) { CT.log("No undealt roles remain to grant.", "note"); return; }
  var id = CT.state.undealtRoleIds.shift();
  p.extraShownRoleIds.push(id);
  CT.log(p.name + " gains an extra shown role: " + CT.roleById(id).name + (reason ? " (" + reason + ")" : "") + ".");
  CT.save();
};

/* Duel "Disarm": loser discards up to n random action cards (§22). */
CT.disarmRandom = function (playerId, n) {
  var p = CT.playerById(playerId); if (!p) return 0;
  var count = Math.min(n, p.actionCardIds.length), done = 0;
  for (var i = 0; i < count; i++) {
    var idx = Math.floor(Math.random() * p.actionCardIds.length);
    CT.discardCard(p.id, p.actionCardIds[idx], "Disarm"); done++;
  }
  return done;
};

/* Blood Contract (§25) — manual note with a break penalty. */
CT.addContract = function (aId, bId, promise) {
  CT.state.contracts.push({ id: CT.util.uid("ct"), aId: aId, bId: bId, promise: promise, status: "active" });
  var a = CT.playerById(aId), b = CT.playerById(bId);
  CT.log("Blood Contract sworn between " + (a ? a.name : "?") + " and " + (b ? b.name : "?") + ".", "note");
  CT.save();
};
CT.resolveContract = function (id, status, breakerId) {
  var c = CT.state.contracts.find(function (x) { return x.id === id; });
  if (!c) return;
  c.status = status;
  if (status === "broken") {
    var who = CT.playerById(breakerId);
    CT.log("Blood Contract broken by " + (who ? who.name : "?") + ".", "note");
    if (who) CT.adjustRep(breakerId, -1, "broke a Blood Contract");
    CT.adjustCorruption(1, "broken Blood Contract");
  } else {
    CT.log("Blood Contract fulfilled.", "note");
  }
  CT.save();
};

/* ===================== Phase 4: Throne & Succession ===================== */

/* set/clear a Throne controller. crown: "king" | "queen" | "successor" */
CT.setThroneController = function (crown, playerId, reason) {
  var t = CT.state.throne, p = CT.playerById(playerId);
  if (crown === "king") t.kingControllerId = playerId;
  else if (crown === "queen") t.queenControllerId = playerId;
  else if (crown === "successor") t.successorId = playerId;
  if (playerId && t.claimOrder.indexOf(playerId) === -1) t.claimOrder.push(playerId);
  CT.log((p ? p.name : "?") + " takes the Throne as " + crown + (reason ? " (" + reason + ")" : "") + ".", "event");
  CT.save();
};
CT.clearThroneController = function (crown) {
  var t = CT.state.throne;
  var who = crown === "king" ? t.kingControllerId : crown === "queen" ? t.queenControllerId : t.successorId;
  if (crown === "king") t.kingControllerId = null;
  else if (crown === "queen") t.queenControllerId = null;
  else if (crown === "successor") t.successorId = null;
  var p = CT.playerById(who);
  CT.log("Throne control cleared" + (p ? " (was " + p.name + " as " + crown + ")" : "") + ".", "event");
  CT.save();
};

/* whether any royal currently controls the Throne (used to gate succession) */
CT.throneHeld = function () {
  var t = CT.state.throne; return !!(t.kingControllerId || t.queenControllerId || t.successorId);
};

/* ---- succession (§24), manual-first ---- */
CT.openSuccession = function () {
  CT.state.throne.succession.open = true;
  CT.log("Succession opened — claimants may move to the Throne and claim.", "system");
  CT.save();
};
CT.closeSuccession = function () {
  CT.state.throne.succession = { open: false, claims: [] };
  CT.log("Succession closed.", "system");
  CT.save();
};
CT.addSuccessionClaim = function (playerId, roleId) {
  var meta = CT.SUCCESSION[roleId]; if (!meta) return;
  var p = CT.playerById(playerId);
  CT.state.throne.succession.claims.push({
    id: CT.util.uid("sc"), playerId: playerId, roleId: roleId,
    rank: meta.rank, startRound: CT.state.round,
  });
  CT.log((p ? p.name : "?") + " claims the Throne as " + CT.roleById(roleId).name + " (" + meta.note + ").", "event");
  CT.save();
};
CT.removeSuccessionClaim = function (id) {
  var s = CT.state.throne.succession;
  s.claims = s.claims.filter(function (c) { return c.id !== id; });
  CT.save();
};
/* rounds still to survive before a claim matures (0 or less = ready to resolve) */
CT.claimRoundsLeft = function (claim) {
  return (claim.startRound + CT.SUCCESSION[claim.roleId].window) - CT.state.round;
};
CT.resolveSuccessionClaim = function (id) {
  var s = CT.state.throne.succession, c = s.claims.find(function (x) { return x.id === id; });
  if (!c) return;
  var p = CT.playerById(c.playerId);
  CT.state.throne.successorId = c.playerId;
  if (CT.state.throne.claimOrder.indexOf(c.playerId) === -1) CT.state.throne.claimOrder.push(c.playerId);
  CT.log((p ? p.name : "?") + " survives the claim window and takes the Throne as " + CT.roleById(c.roleId).name + ".", "system");
  CT.state.throne.succession = { open: false, claims: [] };
  CT.save();
};
