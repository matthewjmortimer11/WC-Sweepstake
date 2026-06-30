/* The Cursed Throne — simple rules-based bots for solo playtesting.
 * Not a real opponent (the game is social) — just enough to drive turns so
 * one person can exercise the systems. Move -> one location action -> end turn. */
window.CT = window.CT || {};
CT.bot = {};

CT.bot.isCursed = function (p) { return p.hiddenRoleIds.indexOf("cursedone") > -1; };

CT.bot.autoDiscard = function (p) {
  if (!p || !p.isBot) return false;
  var choices = [];
  if (p.publicRoleId) choices.push(["public", p.publicRoleId]);
  p.hiddenRoleIds.forEach(function (id) { choices.push(["hidden", id]); });
  p.extraShownRoleIds.forEach(function (id) { choices.push(["extra", id]); });
  if (!choices.length) return false;
  var nonCursed = choices.filter(function (c) { return c[1] !== "cursedone"; });
  var pick = nonCursed.length ? nonCursed[Math.floor(Math.random() * nonCursed.length)] : choices[0];
  CT.applyRoleDiscard(p.id, pick[0], pick[1]);
  if (CT.ui.afterDiscard) { var fn = CT.ui.afterDiscard; CT.ui.afterDiscard = null; fn(); }
  CT.ui.roleDiscardFor = null;
  CT.ui.roleDiscardRevealed = false;
  return true;
};

/* BFS: next step from `a` along the shortest path toward `target` */
CT.bot.stepToward = function (a, target) {
  if (a === target) return null;
  var q = [[a]], seen = {};
  seen[a] = true;
  while (q.length) {
    var path = q.shift(), last = path[path.length - 1];
    var nbrs = CT.CONNECTIONS[last] || [];
    for (var i = 0; i < nbrs.length; i++) {
      var n = nbrs[i];
      if (seen[n]) continue;
      if (n === target) return path.length > 1 ? path[1] : n;
      seen[n] = true;
      q.push(path.concat([n]));
    }
  }
  return null;
};

/* pick & perform one location action */
CT.bot.act = function (p, cursed) {
  var loc = p.location;
  var acts = CT.LOCATION_ACTIONS[loc] || [];

  // Cursed bot at the Graveyard with money -> raise corruption
  if (cursed && loc === "graveyard" && p.gold >= 4) { CT.doLocationAction(p.id, "buy_grave"); return; }

  // low on gold -> grab some if this location offers it
  if (p.gold < 2) {
    if (loc === "tavern") { CT.doLocationAction(p.id, "work_room"); return; }
    if (loc === "graveyard") { CT.doLocationAction(p.id, "scavenge"); return; }
    if (loc === "throne") { CT.doLocationAction(p.id, "petition"); return; }
  }

  // otherwise: any affordable, non-manual action (prefer the basic one)
  var doable = acts.filter(function (a) {
    return !a.manual && p.gold >= (a.cost || 0) && !(a.id === "recover" && !(p.wounded || p.rep <= 2));
  });
  if (!doable.length) return;
  var basic = doable.filter(function (a) { return a.kind === "basic"; });
  var pick = (basic.length && Math.random() < 0.7) ? basic[0] : doable[Math.floor(Math.random() * doable.length)];
  var r = CT.doLocationAction(p.id, pick.id);
  if (r && r.keepOne) CT.resolveKeepOne(p.id, r.keepOne.deck, r.keepOne.cards[0], r.keepOne.cards[1]);
};

CT.bot.trySocial = function (p) {
  var s = CT.state;
  if (!s || s.winner || CT.bot.isCursed(p) || Math.random() > 0.4) return false;
  var cursed = s.players.find(function (x) {
    return x.status === "active" && x.id !== p.id && CT.bot.isCursed(x);
  });
  if (!cursed) return false;
  if (s.corruption >= 3 && Math.random() < 0.55) {
    CT.log(p.name + " calls out " + cursed.name + " as Cursed One!");
    CT.adjustCorruption(2, "Call Out");
    CT.log("Correct — Cursed One is revealed.");
    CT.applyRoleDiscard(cursed.id, "hidden", "cursedone");
    if (!s.winner) CT.grantExtraShownRole(p.id, "Call Out");
    return true;
  }
  if (s.corruption >= 1 && Math.random() < 0.45) {
    var yes = 0, no = 0;
    s.players.forEach(function (v) {
      if (v.status !== "active") return;
      var w = v.rep >= 5 ? 2 : 1;
      if ((v.isBot && !CT.bot.isCursed(v)) || v.id === p.id) yes += w;
      else no += w;
    });
    var pass = yes > no;
    CT.log("Accusation vote against " + cursed.name + ": " + (pass ? "PASSES" : "fails") + " (" + yes + "–" + no + ").");
    if (pass) {
      CT.ui.roleDiscardFor = cursed.id;
      CT.ui.roleDiscardRevealed = false;
      CT.ui.afterDiscard = function () { if (!s.winner) CT.adjustCorruption(2, "Cursed not revealed by accusation"); };
    }
    return true;
  }
  return false;
};

CT.bot.takeTurn = function (playerId) {
  var s = CT.state;
  if (!s || s.winner) return;
  var p = CT.playerById(playerId);
  if (!p || !p.isBot || p.status !== "active") return;
  var cursed = CT.bot.isCursed(p);

  // 1) move (cursed heads for the Graveyard; others wander)
  var moves = CT.legalMoves(p);
  if (moves.length && Math.random() < 0.85) {
    var dest = cursed ? (CT.bot.stepToward(p.location, "graveyard") || moves[0]) : moves[Math.floor(Math.random() * moves.length)];
    if (dest) CT.movePlayer(p.id, dest, false);
  }

  // 2) loyal bots hunt the Cursed One (playtest engine — bots see hidden roles)
  if (!cursed && CT.bot.trySocial(p)) { /* social action taken */ }
  else CT.bot.act(p, cursed);

  // 3) respect the hand limit
  var guard = 0;
  while (CT.overHandLimit(p) && guard++ < 10) CT.discardCard(p.id, p.actionCardIds[0], "hand limit");

  // 4) Final Rite — cursed bot ending at the Graveyard with corruption 8+ wins
  if (cursed && p.location === "graveyard" && s.corruption >= CT.getRules().FINAL_RITE_CORRUPTION && !s.winner) {
    CT.log(p.name + " performs the Final Rite at the Graveyard!", "system");
    CT.declareWinner("cursed", "Final Rite");
  }

  if (!s.winner) CT.endTurn();
};

/* run consecutive bot turns until it's a human's turn (or the game ends) */
CT.bot.autoRun = function () {
  var guard = 0;
  while (CT.state && !CT.state.winner && guard++ < 80) {
    CT.state.players.forEach(function (bp) {
      if (bp.isBot && CT.ui.roleDiscardFor === bp.id) CT.bot.autoDiscard(bp);
    });
    var ap = CT.activePlayer();
    if (!ap || !ap.isBot || ap.status !== "active") break;
    CT.bot.takeTurn(ap.id);
  }
};
