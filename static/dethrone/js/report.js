/* Playtest report — exportable markdown summary (no hidden-info leaks). */
window.CT = window.CT || {};

CT.buildPlaytestReport = function (state, opts) {
  opts = opts || {};
  if (!state) return "# The Cursed Throne — Playtest Report\n\nNo game data.\n";
  var rules = CT.getRules ? CT.getRules() : CT.CONST;
  var lines = [];
  var now = new Date();
  lines.push("# The Cursed Throne — Playtest Report");
  lines.push("");
  lines.push("Generated: " + now.toISOString());
  if (opts.roomCode) lines.push("Room: " + opts.roomCode);
  lines.push("");
  lines.push("## Outcome");
  if (state.winner) {
    lines.push("- **Winner:** " + (state.winner === "loyal" ? "Loyal players" : "Cursed player"));
  } else {
    lines.push("- **Status:** In progress (round " + state.round + ")");
  }
  lines.push("- **Corruption:** " + state.corruption + " / " + rules.CORRUPTION_MAX);
  lines.push("- **Innocents lost:** " + state.innocentElims + " / " + rules.INNOCENT_ELIMS_TO_LOSE);
  lines.push("- **Rounds played:** " + state.round);
  lines.push("");
  lines.push("## Balance settings");
  var bal = state.balance || CT.DEFAULT_BALANCE;
  lines.push("- Hand limit: " + bal.handLimit);
  lines.push("- Final Rite at corruption: " + bal.finalRiteAt);
  lines.push("- Starting gold / Rep: " + bal.startGold + " / " + bal.startRep);
  lines.push("");
  lines.push("## Players (public table)");
  (state.players || []).forEach(function (p) {
    var role = p.publicRoleId ? CT.roleById(p.publicRoleId).name : "—";
    var loc = CT.locationById(p.location).name;
    lines.push("### " + p.name + (p.isBot ? " (bot)" : ""));
    lines.push("- Public role: " + role);
    lines.push("- Location: " + loc);
    lines.push("- Gold: " + p.gold + " · Rep: " + p.rep + " · Status: " + p.status);
    lines.push("- Hidden roles remaining: " + (p.hiddenRoleCount != null ? p.hiddenRoleCount : p.hiddenRoleIds.length));
    lines.push("- Action cards: " + (p.actionCardCount != null ? p.actionCardCount : p.actionCardIds.length));
    if (p.wounded) lines.push("- Wounded");
    if (p.seriousDuelUsed) lines.push("- Serious duel used");
    if (p.extraShownRoleIds && p.extraShownRoleIds.length) {
      lines.push("- Extra shown: " + p.extraShownRoleIds.map(function (id) { return CT.roleById(id).name; }).join(", "));
    }
    lines.push("");
  });
  var throne = state.throne || {};
  lines.push("## Throne");
  ["kingControllerId", "queenControllerId", "successorId"].forEach(function (k) {
    if (throne[k]) {
      var pl = CT.playerById(throne[k]);
      lines.push("- " + k.replace("ControllerId", "").replace("Id", "") + ": " + (pl ? pl.name : throne[k]));
    }
  });
  if ((state.contracts || []).length) {
    lines.push("");
    lines.push("## Blood Contracts");
    state.contracts.forEach(function (c) {
      var a = CT.playerById(c.aId), b = CT.playerById(c.bId);
      lines.push("- " + (a ? a.name : "?") + " ↔ " + (b ? b.name : "?") + ": " + c.promise + " (" + c.status + ")");
    });
  }
  lines.push("");
  lines.push("## Chronicle");
  lines.push("");
  var log = (state.log || []).slice().reverse();
  log.forEach(function (e) {
    lines.push("- **R" + e.round + "** " + e.label + " — " + e.text);
  });
  lines.push("");
  lines.push("---");
  lines.push("*Public report — hidden roles and card names omitted by design.*");
  return lines.join("\n");
};

CT.downloadPlaytestReport = function (opts) {
  var text = CT.buildPlaytestReport(CT.state, opts || {});
  var blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "cursed-throne-report-" + new Date().toISOString().slice(0, 10) + ".md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
};
