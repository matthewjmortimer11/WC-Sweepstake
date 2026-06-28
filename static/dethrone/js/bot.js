/* The Cursed Throne — simple rules-based bots for solo playtesting.
 * Not a real opponent (the game is social) — just enough to drive turns so
 * one person can exercise the systems. Move -> one location action -> end turn. */
window.CT = window.CT || {};
CT.bot = {};

CT.bot.isCursed = function (p) { return p.hiddenRoleIds.indexOf("cursedone") > -1; };

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

  // 2) one action
  CT.bot.act(p, cursed);

  // 3) respect the hand limit
  var guard = 0;
  while (CT.overHandLimit(p) && guard++ < 10) CT.discardCard(p.id, p.actionCardIds[0], "hand limit");

  // 4) Final Rite — cursed bot ending at the Graveyard with corruption 8+ wins
  if (cursed && p.location === "graveyard" && s.corruption >= CT.CONST.FINAL_RITE_CORRUPTION && !s.winner) {
    CT.log(p.name + " performs the Final Rite at the Graveyard!", "system");
    CT.declareWinner("cursed", "Final Rite");
  }

  if (!s.winner) CT.endTurn();
};

/* run consecutive bot turns until it's a human's turn (or the game ends) */
CT.bot.autoRun = function () {
  var guard = 0;
  while (CT.state && !CT.state.winner && guard++ < 80) {
    var ap = CT.activePlayer();
    if (!ap || !ap.isBot || ap.status !== "active") break;
    CT.bot.takeTurn(ap.id);
  }
};
