/* The Cursed Throne — Phase 3 social helpers (challenge, vote, duel, Call Out,
 * trade, Blood Contract). They guide + track + log; consequences route through
 * the existing role-discard flow. Social judgement stays at the table. */
window.CT = window.CT || {};
CT.helpers = { ui: {} };

/* ---------- small builders ---------- */
function actives() { return CT.state.players.filter(function (p) { return p.status === "active"; }); }
function isRoyalOrThrone(p) {
  if (!p || !CT.state) return false;
  var roles = CT.allRoleIds(p);
  if (roles.indexOf("king") !== -1 || roles.indexOf("queen") !== -1) return true;
  var t = CT.state.throne;
  return p.id === t.kingControllerId || p.id === t.queenControllerId || p.id === t.successorId;
}
function opt(list, sel, ph) {
  var o = ph != null ? '<option value="">' + ph + '</option>' : "";
  return o + list.map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? " selected" : "") + '>' + CT.esc(p.name) + "</option>"; }).join("");
}
function roleOpts(sel) {
  return '<option value="">— choose a role —</option>' + CT.ROLES.map(function (r) {
    return '<option value="' + r.id + '"' + (r.id === sel ? " selected" : "") + '>' + CT.esc(r.name) + "</option>";
  }).join("");
}
function field(label, inner) { return '<label class="field"><span class="lbl">' + label + "</span>" + inner + "</label>"; }
function wrap(inner, maxw) {
  return '<div class="scrim"><div class="modal" style="max-width:' + (maxw || 560) + 'px">'
    + '<div class="btn-row" style="justify-content:flex-end;margin-bottom:-8px"><button class="btn btn-ghost btn-sm" data-act="h-close">✕ Close</button></div>'
    + inner + "</div></div>";
}
function roleBonus(p, key) { var r = p && p.publicRoleId ? CT.roleById(p.publicRoleId) : null; return (r && r[key]) || 0; }

function duelCardsInHand(player) {
  if (!player || !CT.DUEL_CARD_VALUES) return [];
  return player.actionCardIds.filter(function (id) { return CT.DUEL_CARD_VALUES[id]; });
}
function duelCardBonus(cardIds) {
  var n = 0;
  (cardIds || []).forEach(function (id) { n += CT.DUEL_CARD_VALUES[id] || 0; });
  return n;
}
function duelCardPicker(player, selected, side) {
  if (CT.duelCardPickerHtml) return CT.duelCardPickerHtml(player, selected, side);
  var cards = duelCardsInHand(player);
  if (!cards.length) return '<p class="faint" style="font-size:12px;margin:4px 0">No duel cards in hand.</p>';
  return cards.map(function (id) {
    var c = CT.cardById(id);
    var on = (selected || []).indexOf(id) !== -1;
    return '<label class="row" style="gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" data-act="h-d-duelcard" data-side="' + side + '" data-id="' + id + '" style="width:auto"' + (on ? " checked" : "") + "> "
      + CT.esc(c ? c.name : id) + " (+" + CT.DUEL_CARD_VALUES[id] + ")</label>";
  }).join("");
}
function voteCardsInHand(player) {
  if (!player || !CT.VOTE_CARD_BONUSES) return [];
  return player.actionCardIds.filter(function (id) {
    if (!CT.VOTE_CARD_BONUSES[id]) return false;
    var req = CT.VOTE_CARD_REQUIRES && CT.VOTE_CARD_REQUIRES[id];
    if (req && req.location && player.location !== req.location) return false;
    return true;
  });
}

function roleVotePowersAvailable(player, u) {
  if (!player || !CT.ROLE_VOTE_ABILITIES) return [];
  var out = [];
  CT.allRoleIds(player).forEach(function (rid) {
    var fx = CT.ROLE_VOTE_ABILITIES[rid];
    if (!fx) return;
    if (fx.location && player.location !== fx.location) return;
    if ((u.roleVotePowers || []).some(function (r) {
      return r.playerId === player.id && r.roleId === rid;
    })) return;
    out.push({ roleId: rid, bonus: fx.bonus || 1, name: fx.name || rid });
  });
  return out;
}

function roleVotePowersHtml(ps, u) {
  var rows = ps.map(function (p) {
    return roleVotePowersAvailable(p, u).map(function (power) {
      if (CT.roleVotePowerRowHtml) return CT.roleVotePowerRowHtml(p, power);
      return "";
    }).join("");
  }).join("");
  if (!rows) return "";
  return '<h3 style="margin:14px 0 8px;font-size:15px">Role vote powers</h3><div class="stack" style="gap:6px">' + rows + "</div>";
}

function canOfferBribe(player, u) {
  if (!player || player.actionCardIds.indexOf("bribe") === -1 || player.gold < 1) return false;
  return !(u.bribes || []).some(function (b) { return b.briberId === player.id; });
}

function voteBribesHtml(ps, u) {
  var pending = (u.bribes || []).filter(function (b) { return b.status === "pending"; });
  var offerRows = ps.filter(function (p) { return canOfferBribe(p, u); }).map(function (p) {
    if (CT.bribeOfferRowHtml) return CT.bribeOfferRowHtml(p, ps, u);
    var others = ps.filter(function (x) { return x.id !== p.id; });
    return '<div class="vote-row" style="font-size:13px"><span>' + CT.esc(p.name) + ': Bribe</span>'
      + '<select data-act="h-v-bribe-target" data-briber="' + p.id + '">'
      + '<option value="">— target —</option>'
      + others.map(function (x) { return '<option value="' + x.id + '">' + CT.esc(x.name) + "</option>"; }).join("")
      + '</select><div class="btn-row">'
      + '<button class="btn btn-sm btn-primary" data-act="h-v-bribe-offer" data-briber="' + p.id + '" data-side="yes">Offer 1g → Yes</button>'
      + '<button class="btn btn-sm btn-danger" data-act="h-v-bribe-offer" data-briber="' + p.id + '" data-side="no">Offer 1g → No</button>'
      + "</div></div>";
  }).join("");
  var pendingRows = pending.map(function (b) {
    var briber = CT.playerById(b.briberId), target = CT.playerById(b.targetId);
  var sideLbl = b.side === "yes" ? "Yes" : "No";
    return '<div class="vote-row bribe-pending"><span>'
      + CT.esc(briber ? briber.name : "?") + " offers " + CT.esc(target ? target.name : "?")
      + " <strong>1 gold</strong> to vote " + sideLbl + "</span>"
      + '<div class="btn-row"><button class="btn btn-sm btn-primary" data-act="h-v-bribe-respond" data-briber="' + b.briberId
      + '" data-accept="1">Accept</button><button class="btn btn-sm btn-ghost" data-act="h-v-bribe-respond" data-briber="'
      + b.briberId + '" data-accept="0">Refuse</button></div></div>';
  }).join("");
  if (!offerRows && !pendingRows) return "";
  var html = "";
  if (offerRows) html += '<h3 style="margin:14px 0 8px;font-size:15px">Bribe</h3><div class="stack" style="gap:6px">' + offerRows + "</div>";
  if (pendingRows) html += '<div class="stack" style="gap:6px;margin-top:8px">' + pendingRows + "</div>";
  return html;
}

CT.helpers.view = function () {
  var u = CT.helpers.ui;
  switch (u.open) {
    case "challenge": return CT.helpers.vChallenge();
    case "vote":      return CT.helpers.vVote();
    case "duel":      return CT.helpers.vDuel();
    case "callout":   return CT.helpers.vCallout();
    case "trade":     return CT.helpers.vTrade();
    case "contract":  return CT.helpers.vContract();
    case "royalclaim": return CT.helpers.vRoyalClaim();
    case "succclaim":  return CT.helpers.vSuccClaim();
    case "royalcommand": return CT.helpers.vRoyalCommand();
    case "deepresearch": return CT.helpers.vDeepResearch();
  }
  return "";
};

/* ===================== Challenge (§19) ===================== */
CT.helpers.openChallenge = function () { CT.helpers.ui = { open: "challenge", claimant: "", challenger: "", power: "" }; CT.render(); };
CT.helpers.vChallenge = function () {
  var u = CT.helpers.ui, ps = actives();
  var ready = u.claimant && u.challenger && u.claimant !== u.challenger;
  return wrap('<div class="eyebrow">Helper</div><h2 style="margin:4px 0 2px">Challenge a power</h2>'
    + '<p class="muted" style="font-size:14px;margin:0 0 12px">The claimant proves the power privately to the challenger (physically). Record the outcome — only a discarded card is revealed.</p>'
    + field("Claimant (announced a power)", '<select data-act="h-cl-claimant">' + opt(ps, u.claimant, "— who —") + "</select>")
    + field("Claimed power (optional, for the log)", '<input type="text" data-act="h-cl-power" value="' + CT.esc(u.power || "") + '" placeholder="e.g. Stride">')
    + field("Challenger", '<select data-act="h-cl-challenger">' + opt(ps, u.challenger, "— who —") + "</select>")
    + '<hr class="rule">'
    + '<div class="btn-row"><button class="btn btn-secondary" data-act="h-ch-valid"' + (ready ? "" : " disabled") + '>Proof valid → challenger loses a role</button>'
    + '<button class="btn btn-danger" data-act="h-ch-bluff"' + (ready ? "" : " disabled") + '>Failed bluff → claimant loses a role</button></div>');
};

/* ===================== Formal vote (§21) ===================== */
CT.helpers.openVote = function () {
  CT.helpers.ui = {
    open: "vote", vtype: "accuse", proposer: "", target: "", seconder: false,
    decree: false, emergency: false, phase: "setup", votes: {}, bonusYes: 0, bonusNo: 0, voteCards: [],
    bribes: [], roleVotePowers: [],
  };
  CT.render();
};
CT.helpers.openVoteFromPending = function (pui) {
  CT.helpers.ui = {
    open: "vote", vtype: pui.voteType || "accuse", proposer: pui.proposerId || "",
    target: pui.targetId || "", seconder: false, decree: !!pui.decree, emergency: !!pui.emergency,
    phase: "setup", votes: {}, bonusYes: 0, bonusNo: 0, voteCards: [], bribes: [], roleVotePowers: [],
  };
  if (CT.isOnline()) CT.net.send({ type: "clearPendingUi" });
  CT.render();
};
CT.helpers.openTradeFromPending = function (pui) {
  CT.helpers.ui = { open: "trade", a: pui.playerId || "", b: "", goldAB: 0, goldBA: 0, cardAB: "", cardBA: "" };
  if (CT.isOnline()) CT.net.send({ type: "clearPendingUi" });
  CT.render();
};
CT.helpers.openCalloutFromPending = function (pui) {
  CT.helpers.ui = { open: "callout", caller: pui.playerId || CT.myId() || "", target: "", role: "" };
  if (CT.isOnline()) CT.net.send({ type: "clearPendingUi" });
  CT.render();
};
CT.helpers.openContractFromPending = function (pui) {
  CT.helpers.ui = { open: "contract", a: pui.playerId || "", b: "", promise: "" };
  if (CT.isOnline()) CT.net.send({ type: "clearPendingUi" });
  CT.render();
};
CT.helpers.vVote = function () {
  var u = CT.helpers.ui, ps = actives();
  if (u.phase === "setup") {
    var targets = u.vtype === "banish" ? ps.filter(function (p) { return p.rep <= 2; }) : ps;
    var prop = CT.playerById(u.proposer);
    var note = u.vtype === "accuse"
      ? "Accuser needs Reputation 2+, plus a seconder (unless a Decree bypasses it)."
      : "Banish targets only low-Rep players (≤2). Rep 0 needs no seconder; Rep 1–2 needs one (unless a Decree bypasses it).";
    var ready = u.proposer && u.target && u.proposer !== u.target;
    return wrap('<div class="eyebrow">Helper</div><h2 style="margin:4px 0 2px">Formal vote</h2>'
      + '<div class="seg" style="margin:8px 0 14px">'
      + '<button aria-pressed="' + (u.vtype === "accuse") + '" data-act="h-v-type" data-t="accuse">Accuse Cursed</button>'
      + '<button aria-pressed="' + (u.vtype === "banish") + '" data-act="h-v-type" data-t="banish">Banish Threat</button></div>'
      + '<p class="muted" style="font-size:13px;margin:0 0 12px">' + note + '</p>'
      + field("Proposer", '<select data-act="h-v-proposer">' + opt(ps, u.proposer, "— who —") + "</select>")
      + (u.vtype === "accuse" && prop && prop.rep < 2 ? '<div class="tag wax" style="margin-bottom:12px">Proposer has Rep ' + prop.rep + ' (below 2)</div>' : "")
      + field("Target", '<select data-act="h-v-target">' + opt(targets, u.target, "— who —") + "</select>")
      + '<div class="row" style="gap:18px;margin-bottom:8px">'
      + '<label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" data-act="h-v-seconder" style="width:auto" ' + (u.seconder ? "checked" : "") + '> Has a seconder</label>'
      + '<label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" data-act="h-v-decree" style="width:auto" ' + (u.decree ? "checked" : "") + '> Decree (no seconder needed)</label></div>'
      + (u.emergency ? '<div class="tag wax" style="margin-bottom:10px">Emergency Council — Throne &amp; Market must vote</div>' : "")
      + '<hr class="rule"><div class="btn-row"><div class="spacer"></div><button class="btn btn-primary" data-act="h-v-start"' + (ready ? "" : " disabled") + '>Collect votes →</button></div>');
  }
  // tally phase
  var rows = ps.map(function (p) {
    var v = u.votes[p.id] || null, w = p.rep >= 5 ? 2 : 1;
    function b(val, lbl, cls) { return '<button class="btn btn-sm ' + (v === val ? cls : "btn-secondary") + '" data-act="h-v-cast" data-pid="' + p.id + '" data-v="' + val + '">' + lbl + "</button>"; }
    return '<div class="vote-row"><span>' + CT.esc(p.name) + (w > 1 ? ' <span class="tag gold">×2</span>' : "") + "</span>"
      + '<div class="btn-row">' + b("yes", "Yes", "btn-primary") + b("no", "No", "btn-danger") + b("", "—", "btn-ghost") + "</div></div>";
  }).join("");
  var yes = 0, no = 0;
  ps.forEach(function (p) { var w = p.rep >= 5 ? 2 : 1; if (u.votes[p.id] === "yes") yes += w; else if (u.votes[p.id] === "no") no += w; });
  yes += u.bonusYes; no += u.bonusNo;
  (u.voteCards || []).forEach(function (vc) {
    var b = CT.VOTE_CARD_BONUSES[vc.cardId] || 0;
    if (vc.side === "yes") yes += b; else if (vc.side === "no") no += b;
  });
  (u.roleVotePowers || []).forEach(function (rv) {
    var fx = CT.ROLE_VOTE_ABILITIES && CT.ROLE_VOTE_ABILITIES[rv.roleId];
    var b = (fx && fx.bonus) || 1;
    if (rv.side === "yes") yes += b; else if (rv.side === "no") no += b;
  });
  var pass = yes > no; // ties fail (§21)
  var voteCardBtns = ps.map(function (p) {
    return voteCardsInHand(p).map(function (cid) {
      var used = (u.voteCards || []).some(function (vc) { return vc.playerId === p.id && vc.cardId === cid; });
      if (CT.voteCardRowHtml) return CT.voteCardRowHtml(p, cid, used);
      if (used) return "";
      var c = CT.cardById(cid);
      return '<div class="vote-row" style="font-size:13px"><span>' + CT.esc(p.name) + ": " + CT.esc(c ? c.name : cid) + "</span>"
        + '<div class="btn-row"><button class="btn btn-sm btn-primary" data-act="h-v-playcard" data-pid="' + p.id + '" data-id="' + cid + '" data-side="yes">+Yes</button>'
        + '<button class="btn btn-sm btn-danger" data-act="h-v-playcard" data-pid="' + p.id + '" data-id="' + cid + '" data-side="no">+No</button></div></div>';
    }).join("");
  }).join("");
  var bribeBtns = voteBribesHtml(ps, u);
  var roleVoteBtns = roleVotePowersHtml(ps, u);
  return wrap('<div class="eyebrow">' + (u.vtype === "accuse" ? "Accuse Cursed" : "Banish Threat") + ' · target: ' + CT.esc((CT.playerById(u.target) || {}).name || "?") + '</div>'
    + '<h2 style="margin:4px 0 10px">Cast votes</h2>'
    + (u.emergency ? '<p class="tag wax" style="margin-bottom:8px">Emergency Council — players at Throne &amp; Market must vote</p>' : "")
    + '<div class="stack" style="gap:6px">' + rows + "</div>"
    + (voteCardBtns ? '<h3 style="margin:14px 0 8px;font-size:15px">Vote cards</h3><div class="stack" style="gap:6px">' + voteCardBtns + "</div>" : "")
    + roleVoteBtns
    + bribeBtns
    + '<div class="row" style="gap:18px;margin-top:12px"><span class="muted" style="font-size:13px">Manual extra weight:</span>'
    + '<span>Yes <button class="step" data-act="h-v-bonus" data-side="yes" data-d="-1">−</button> ' + u.bonusYes + ' <button class="step" data-act="h-v-bonus" data-side="yes" data-d="1">+</button></span>'
    + '<span>No <button class="step" data-act="h-v-bonus" data-side="no" data-d="-1">−</button> ' + u.bonusNo + ' <button class="step" data-act="h-v-bonus" data-side="no" data-d="1">+</button></span></div>'
    + '<hr class="rule"><div class="row" style="justify-content:space-between"><strong style="font-family:var(--serif);font-size:20px">' + yes + " – " + no
    + '  <span class="tag ' + (pass ? "moss" : "wax") + '">' + (pass ? "PASSES" : "FAILS") + "</span></strong>"
    + '<div class="btn-row"><button class="btn btn-ghost" data-act="h-v-back">← Back</button>'
    + '<button class="btn btn-primary" data-act="h-v-apply">Apply result</button></div></div>');
};

/* ===================== Duel (§22) ===================== */
CT.helpers.openDuel = function () {
  CT.helpers.ui = {
    open: "duel", att: "", def: "", serious: false, override: false,
    attBonus: 0, defBonus: 0, attDuelCards: [], defDuelCards: [], phase: "setup",
  };
  CT.render();
};
CT.helpers.openDuelFromPending = function (ui) {
  CT.helpers.ui = {
    open: "duel", att: ui.attackerId, def: ui.defenderId || "",
    serious: !!ui.serious, override: false, attBonus: 0, defBonus: 0,
    attDuelCards: [], defDuelCards: [], phase: "setup",
    recklessCharge: !!ui.recklessCharge,
  };
  if (CT.isOnline()) CT.net.send({ type: "clearPendingUi" });
  CT.render();
};

/* ===================== Royal Command (§23 strong action) ===================== */
CT.helpers.openRoyalCommandFromPending = function (ui) {
  CT.helpers.ui = { open: "royalcommand", controllerId: ui.controllerId, phase: "choice", target: "" };
  if (CT.isOnline()) CT.net.send({ type: "clearPendingUi" });
  CT.render();
};
CT.helpers.openVoteFromDecree = function (proposerId) {
  CT.helpers.ui = {
    open: "vote", vtype: "accuse", proposer: proposerId || "", target: "",
    seconder: false, decree: true, phase: "setup", votes: {}, bonusYes: 0, bonusNo: 0, voteCards: [], bribes: [], roleVotePowers: [],
  };
  CT.render();
};
CT.helpers.vRoyalCommand = function () {
  var u = CT.helpers.ui, ps = actives();
  var ctrl = CT.playerById(u.controllerId);
  if (u.phase === "pardon") {
    var targets = ps.filter(function (p) { return p.id !== u.controllerId; });
    return wrap('<div class="eyebrow">Royal Command</div><h2 style="margin:4px 0 2px">Royal Pardon</h2>'
      + '<p class="muted" style="font-size:13px;margin:0 0 12px">Choose a player to grant +1 Reputation.</p>'
      + field("Pardon", '<select data-act="h-rcmd-target">' + opt(targets, u.target, "— who —") + "</select>")
      + '<hr class="rule"><div class="btn-row"><button class="btn btn-ghost" data-act="h-rcmd-back">← Back</button>'
      + '<div class="spacer"></div><button class="btn btn-primary" data-act="h-rcmd-pardon"' + (u.target ? "" : " disabled") + '>Issue pardon</button></div>');
  }
  return wrap('<div class="eyebrow">Royal Command</div><h2 style="margin:4px 0 2px">'
    + CT.esc(ctrl ? ctrl.name : "Throne") + " commands</h2>"
    + '<p class="muted" style="font-size:13px;margin:0 0 14px">Tax, Pardon, or Decree. Challengeable at the table unless you are the confirmed public controller.</p>'
    + '<div class="stack" style="gap:10px">'
    + '<button class="btn btn-gold" data-act="h-rcmd-tax">Royal Tax — take 1 gold from each player</button>'
    + '<button class="btn btn-secondary" data-act="h-rcmd-pardon-pick">Royal Pardon — +1 Reputation to one player</button>'
    + '<button class="btn btn-secondary" data-act="h-rcmd-decree">Royal Decree — formal vote without seconder</button>'
    + "</div>");
};
CT.helpers.applyRoyalCommand = function (choice, targetId) {
  if (CT.isOnline()) {
    var msg = { type: "royalCommand", choice: choice };
    if (targetId) msg.targetId = targetId;
    CT.net.send(msg);
    CT.helpers.ui.open = null;
    return CT.render();
  }
  var u = CT.helpers.ui;
  var ap = CT.playerById(u.controllerId);
  if (!ap) { u.open = null; return CT.render(); }
  if (choice === "tax") {
    var royalTaken = CT.collectTax(ap, 1);
    CT.log(ap.name + " levied Royal Tax" + (royalTaken ? " — collected " + royalTaken + " gold." : " — no gold collected."), royalTaken ? "event" : "note");
  } else if (choice === "pardon" && targetId) {
    CT.adjustRep(targetId, 1, "Royal Pardon");
    CT.log(ap.name + " issued a Royal Pardon for " + CT.playerById(targetId).name + ".");
  } else if (choice === "decree") {
    CT.log(ap.name + " issued a Royal Decree — formal vote may proceed without a seconder.", "event");
    u.open = null;
    CT.save();
    return CT.helpers.openVoteFromDecree(ap.id);
  }
  u.open = null;
  CT.save();
  CT.render();
};

/* ===================== Deep Research (§13 Scrolls strong action) ===================== */
CT.helpers.openDeepResearchFromPending = function (ui) {
  CT.helpers.ui = {
    open: "deepresearch", researcherId: ui.researcherId, phase: "choice",
    mode: "", deck: "", target: "",
  };
  if (CT.isOnline()) CT.net.send({ type: "clearPendingUi" });
  CT.render();
};
CT.helpers.vDeepResearch = function () {
  var u = CT.helpers.ui, ps = actives();
  var researcher = CT.playerById(u.researcherId);
  if (u.phase === "deck") {
    var decks = CT.DECK_NAMES.map(function (d) {
      return '<option value="' + d + '"' + (u.deck === d ? " selected" : "") + ">" + d + "</option>";
    }).join("");
    var deckLabel = u.mode === "deck_top" ? "Which deck to survey?"
      : (u.mode === "discard_top" ? "Which discard pile to read?" : "Which records to cross-reference?");
    return wrap('<div class="eyebrow">Deep Research</div><h2 style="margin:4px 0 2px">Choose archives</h2>'
      + '<p class="muted" style="font-size:13px;margin:0 0 12px">' + deckLabel + "</p>"
      + field("Deck", '<select data-act="h-dr-deck">' + decks + "</select>")
      + '<hr class="rule"><div class="btn-row"><button class="btn btn-ghost" data-act="h-dr-back">← Back</button>'
      + '<div class="spacer"></div><button class="btn btn-primary" data-act="h-dr-apply">Investigate</button></div>');
  }
  if (u.phase === "witness") {
    var witnesses = ps.filter(function (p) {
      return p.id !== u.researcherId && researcher && p.location === researcher.location;
    });
    return wrap('<div class="eyebrow">Deep Research</div><h2 style="margin:4px 0 2px">Interview a witness</h2>'
      + '<p class="muted" style="font-size:13px;margin:0 0 12px">Choose someone at the Scrolls. You glimpse one card from their hand — only you see the result.</p>'
      + field("Witness", '<select data-act="h-dr-target">' + opt(witnesses, u.target, "— who —") + "</select>")
      + '<hr class="rule"><div class="btn-row"><button class="btn btn-ghost" data-act="h-dr-back">← Back</button>'
      + '<div class="spacer"></div><button class="btn btn-primary" data-act="h-dr-apply"' + (u.target ? "" : " disabled") + '>Interview</button></div>');
  }
  return wrap('<div class="eyebrow">Deep Research</div><h2 style="margin:4px 0 2px">'
    + CT.esc(researcher ? researcher.name : "Researcher") + " investigates</h2>"
    + '<p class="muted" style="font-size:13px;margin:0 0 14px">Paid 2 gold. Pick an investigation — result shows in your private view only.</p>'
    + '<div class="stack" style="gap:10px">'
    + '<button class="btn btn-secondary" data-act="h-dr-mode" data-m="deck_top">Survey archives — peek top of a draw pile</button>'
    + '<button class="btn btn-secondary" data-act="h-dr-mode" data-m="discard_top">Read ledgers — peek top of a discard pile</button>'
    + '<button class="btn btn-secondary" data-act="h-dr-mode" data-m="discard_random">Cross-reference — random card from a discard pile</button>'
    + '<button class="btn btn-gold" data-act="h-dr-mode" data-m="witness">Interview witness — glimpse one card at the Scrolls</button>'
    + "</div>");
};
CT.helpers.applyDeepResearch = function (mode, deckName, targetId) {
  if (CT.isOnline()) {
    var msg = { type: "deepResearch", mode: mode };
    if (deckName) msg.deckName = deckName;
    if (targetId) msg.targetId = targetId;
    CT.net.send(msg);
    CT.helpers.ui.open = null;
    return CT.render();
  }
  var res = CT.applyDeepResearch(CT.helpers.ui.researcherId, mode, {
    deckName: deckName, targetId: targetId,
  });
  if (res && !res.ok && res.msg) alert(res.msg);
  CT.helpers.ui.open = null;
  CT.render();
};
CT.helpers.vDuel = function () {
  var u = CT.helpers.ui, ps = actives();
  var att = CT.playerById(u.att), def = CT.playerById(u.def);
  if (u.phase === "setup") {
    var defList = (att && !u.override) ? ps.filter(function (p) { return p.location === att.location && p.id !== att.id; }) : ps.filter(function (p) { return !att || p.id !== att.id; });
    var seriousOk = att && def && (u.override || (att.location === "barracks" && def.location === "barracks"));
    return wrap('<div class="eyebrow">Helper</div><h2 style="margin:4px 0 2px">Duel</h2>'
      + '<p class="muted" style="font-size:13px;margin:0 0 12px">Same location (or override). Public-role bonuses are added automatically; add card / claimed-power bonuses by hand.</p>'
      + field("Attacker", '<select data-act="h-d-att">' + opt(ps, u.att, "— who —") + "</select>")
      + field("Defender", '<select data-act="h-d-def">' + opt(defList, u.def, "— who —") + "</select>")
      + '<div class="row" style="gap:18px;margin-bottom:8px">'
      + '<label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" data-act="h-d-override" style="width:auto" ' + (u.override ? "checked" : "") + '> Override location</label>'
      + '<label class="row" style="gap:6px;cursor:pointer' + (att && att.seriousDuelUsed ? ";opacity:.5" : "") + '"><input type="checkbox" data-act="h-d-serious" style="width:auto" ' + (u.serious ? "checked" : "") + (seriousOk && !(att && att.seriousDuelUsed) ? "" : " disabled") + '> Serious Duel (Barracks)</label></div>'
      + (att && att.seriousDuelUsed ? '<div class="tag wax" style="margin-bottom:10px">' + CT.esc(att.name) + ' has already used their Serious Duel</div>' : "")
      + '<div class="row" style="gap:12px">'
      + field("Attacker bonus (powers)", '<input type="number" data-act="h-d-attbonus" value="' + u.attBonus + '">')
      + field("Defender bonus (powers)", '<input type="number" data-act="h-d-defbonus" value="' + u.defBonus + '">') + "</div>"
      + (att ? '<div style="margin-top:10px"><div class="lbl" style="font-size:12px;margin-bottom:4px">Attacker duel cards</div>' + duelCardPicker(att, u.attDuelCards, "att") + "</div>" : "")
      + (def ? '<div style="margin-top:8px"><div class="lbl" style="font-size:12px;margin-bottom:4px">Defender duel cards</div>' + duelCardPicker(def, u.defDuelCards, "def") + "</div>" : "")
      + (att ? '<p class="faint" style="font-size:12px;margin-top:8px">Auto: attacker +' + roleBonus(att, "duelBonusAttack") + ' atk · defender +' + (def ? roleBonus(def, "duelBonusDefence") : 0) + ' def (public roles)'
      + (u.attDuelCards.length ? " · cards +" + duelCardBonus(u.attDuelCards) : "")
      + (u.defDuelCards.length ? " / +" + duelCardBonus(u.defDuelCards) : "") + "</p>" : "")
      + '<hr class="rule"><div class="btn-row"><button class="btn btn-secondary" data-act="h-d-flee"' + (def && u.attDuelCards.indexOf("iron_gauntlet") === -1 ? "" : " disabled") + '>Defender plays Flee</button>'
      + (u.attDuelCards.indexOf("iron_gauntlet") !== -1 ? '<span class="tag wax">Iron Gauntlet blocks Flee</span>' : "")
      + '<div class="spacer"></div><button class="btn btn-primary" data-act="h-d-fight"' + (att && def ? "" : " disabled") + '>Fight →</button></div>');
  }
  // resolve
  var aT = roleBonus(att, "duelBonusAttack") + (+u.attBonus || 0) + duelCardBonus(u.attDuelCards);
  var dT = roleBonus(def, "duelBonusDefence") + (+u.defBonus || 0) + duelCardBonus(u.defDuelCards);
  var attackerWins = aT > dT; // tie -> defender (§22)
  var winner = attackerWins ? att : def, loser = attackerWins ? def : att;
  var conseqs = u.serious
    ? '<button class="btn btn-danger" data-act="h-d-conseq" data-c="serious">' + CT.esc(loser.name) + ' loses a role card</button>'
    : ["Disarm|disarm", "Shame|shame", "Drive Out|drive", "Wound|wound", "Search (manual)|search"].map(function (s) {
        var x = s.split("|"); return '<button class="btn btn-secondary btn-sm" data-act="h-d-conseq" data-c="' + x[1] + '">' + x[0] + "</button>";
      }).join("");
  return wrap('<div class="eyebrow">Duel result' + (u.serious ? " · Serious" : "") + '</div>'
    + '<h2 style="margin:4px 0 8px">' + CT.esc(att.name) + " " + aT + " vs " + dT + " " + CT.esc(def.name) + "</h2>"
    + '<p style="margin:0 0 4px"><strong style="color:var(--gold)">' + CT.esc(winner.name) + " wins.</strong> "
    + (attackerWins ? "" : "(Defender wins ties.) ") + CT.esc(winner.name) + " chooses a consequence for " + CT.esc(loser.name) + ".</p>"
    + '<hr class="rule"><div class="btn-row">' + conseqs + "</div>"
    + '<div class="btn-row" style="margin-top:12px"><button class="btn btn-ghost" data-act="h-d-back">← Back</button></div>');
};

/* ===================== Call Out (§28) ===================== */
CT.helpers.openCallout = function () {
  CT.helpers.ui = { open: "callout", caller: CT.myId() || "", target: "", role: "" };
  CT.render();
};
CT.helpers.vCallout = function () {
  var u = CT.helpers.ui, ps = actives();
  var ready = u.caller && u.target && u.role && u.caller !== u.target;
  return wrap('<div class="eyebrow">Helper</div><h2 style="margin:4px 0 2px">Call Out</h2>'
    + '<p class="muted" style="font-size:14px;margin:0 0 12px">Naming a hidden role. Corruption rises by 2 immediately. If correct, that role is revealed (Cursed One → Loyal win) and the caller gains a shown role. If wrong, the caller loses 1 Reputation. The app checks privately — wrong guesses reveal nothing.</p>'
    + field("Caller", '<select data-act="h-co-caller">' + opt(ps, u.caller, "— who —") + "</select>")
    + field("Target", '<select data-act="h-co-target">' + opt(ps, u.target, "— who —") + "</select>")
    + field("Names this hidden role", '<select data-act="h-co-role">' + roleOpts(u.role) + "</select>")
    + '<hr class="rule"><div class="btn-row"><div class="spacer"></div><button class="btn btn-danger" data-act="h-co-go"' + (ready ? "" : " disabled") + '>Call out (corruption +2)</button></div>');
};

/* ===================== Trade — Market immediate (§25) ===================== */
CT.helpers.openTrade = function () { CT.helpers.ui = { open: "trade", a: "", b: "", goldAB: 0, goldBA: 0, cardAB: "", cardBA: "" }; CT.render(); };
function handOpts(p, sel) {
  if (!p) return '<option value="">—</option>';
  return '<option value="">— no card —</option>' + p.actionCardIds.map(function (id, i) {
    var c = CT.cardById(id); return '<option value="' + i + '"' + (String(i) === String(sel) ? " selected" : "") + '>' + CT.esc(c.name) + "</option>";
  }).join("");
}
CT.helpers.vTrade = function () {
  var u = CT.helpers.ui, ps = actives();
  var a = CT.playerById(u.a), b = CT.playerById(u.b);
  var ready = u.a && u.b && u.a !== u.b;
  return wrap('<div class="eyebrow">Helper</div><h2 style="margin:4px 0 2px">Trade (immediate)</h2>'
    + '<p class="muted" style="font-size:13px;margin:0 0 12px">Immediate exchange of gold and/or one action card each way. Use for Market trades (both at Market).</p>'
    + '<div class="row" style="gap:12px">' + field("Player A", '<select data-act="h-t-a">' + opt(ps, u.a, "— who —") + "</select>")
    + field("Player B", '<select data-act="h-t-b">' + opt(ps, u.b, "— who —") + "</select>") + "</div>"
    + '<div class="row" style="gap:12px">' + field("Gold A → B", '<input type="number" min="0" data-act="h-t-goldab" value="' + u.goldAB + '">')
    + field("Gold B → A", '<input type="number" min="0" data-act="h-t-goldba" value="' + u.goldBA + '">') + "</div>"
    + '<div class="row" style="gap:12px">' + field("Card A → B", '<select data-act="h-t-cardab">' + handOpts(a, u.cardAB) + "</select>")
    + field("Card B → A", '<select data-act="h-t-cardba">' + handOpts(b, u.cardBA) + "</select>") + "</div>"
    + '<hr class="rule"><div class="btn-row"><div class="spacer"></div><button class="btn btn-primary" data-act="h-t-go"' + (ready ? "" : " disabled") + '>Execute trade</button></div>');
};

/* ===================== Blood Contract (§25) ===================== */
CT.helpers.openContract = function () { CT.helpers.ui = { open: "contract", a: "", b: "", promise: "" }; CT.render(); };
CT.helpers.vContract = function () {
  var u = CT.helpers.ui, ps = actives();
  var ready = u.a && u.b && u.a !== u.b && (u.promise || "").trim();
  return wrap('<div class="eyebrow">Helper</div><h2 style="margin:4px 0 2px">Blood Contract</h2>'
    + '<p class="muted" style="font-size:13px;margin:0 0 12px">A binding promise. If broken, the breaker loses 1 Reputation and corruption rises by 1. Manage existing contracts from the Pacts panel.</p>'
    + '<div class="row" style="gap:12px">' + field("Party A", '<select data-act="h-c-a">' + opt(ps, u.a, "— who —") + "</select>")
    + field("Party B", '<select data-act="h-c-b">' + opt(ps, u.b, "— who —") + "</select>") + "</div>"
    + field("The promise", '<textarea data-act="h-c-promise" placeholder="e.g. Paul will vote with Shannon next round">' + CT.esc(u.promise || "") + "</textarea>")
    + '<hr class="rule"><div class="btn-row"><div class="spacer"></div><button class="btn btn-primary" data-act="h-c-swear"' + (ready ? "" : " disabled") + '>Swear contract</button></div>');
};

/* ===================== Royal claim (§23) ===================== */
CT.helpers.openRoyalClaim = function () { CT.helpers.ui = { open: "royalclaim", claimant: "", crown: "king", challenger: "" }; CT.render(); };
CT.helpers.vRoyalClaim = function () {
  var u = CT.helpers.ui, ps = actives();
  var ready = !!u.claimant;
  var challenged = !!u.challenger && u.challenger !== u.claimant;
  return wrap('<div class="eyebrow">Helper</div><h2 style="margin:4px 0 2px">Claim the Throne</h2>'
    + '<p class="muted" style="font-size:14px;margin:0 0 12px">A player with King or Queen may claim the Throne. If challenged, they prove the crown privately. Truthful → challenger loses a role; lying → claimant loses a role.</p>'
    + field("Claimant", '<select data-act="h-rc-claimant">' + opt(ps, u.claimant, "— who —") + "</select>")
    + '<div class="seg" style="margin-bottom:14px"><button aria-pressed="' + (u.crown === "king") + '" data-act="h-rc-crown" data-c="king">King</button>'
    + '<button aria-pressed="' + (u.crown === "queen") + '" data-act="h-rc-crown" data-c="queen">Queen</button></div>'
    + field("Challenger (optional)", '<select data-act="h-rc-challenger">' + opt(ps.filter(function (p) { return p.id !== u.claimant; }), u.challenger, "— unchallenged —") + "</select>")
    + '<hr class="rule">'
    + (challenged
        ? '<div class="btn-row"><button class="btn btn-secondary" data-act="h-rc-proved">Proof valid → challenger loses a role &amp; claimant crowned</button>'
          + '<button class="btn btn-danger" data-act="h-rc-bluff">Bluff → claimant loses a role</button></div>'
        : '<div class="btn-row"><div class="spacer"></div><button class="btn btn-gold" data-act="h-rc-take"' + (ready ? "" : " disabled") + '>Take the Throne ♛</button></div>'));
};
CT.helpers.applyRoyalTake = function () {
  var u = CT.helpers.ui;
  if (CT.isOnline()) {
    CT.net.send({ type: "royalClaim", claimantId: u.claimant, crown: u.crown });
    u.open = null; return CT.render();
  }
  CT.setThroneController(u.crown, u.claimant, "claim");
  u.open = null; CT.render();
};
CT.helpers.applyRoyalProved = function () {
  var u = CT.helpers.ui;
  if (CT.isOnline()) {
    CT.net.send({ type: "royalClaim", claimantId: u.claimant, challengerId: u.challenger, crown: u.crown, valid: true });
    u.open = null; return CT.render();
  }
  CT.setThroneController(u.crown, u.claimant, "claim upheld");
  CT.log(CT.playerById(u.challenger).name + " challenged the crown wrongly and must lose a role.");
  CT.ui.roleDiscardFor = u.challenger; CT.ui.roleDiscardRevealed = false; u.open = null; CT.render();
};
CT.helpers.applyRoyalBluff = function () {
  var u = CT.helpers.ui;
  if (CT.isOnline()) {
    CT.net.send({ type: "royalClaim", claimantId: u.claimant, challengerId: u.challenger, crown: u.crown, valid: false });
    u.open = null; return CT.render();
  }
  CT.log(CT.playerById(u.claimant).name + "'s claim to the Throne was a bluff — they must lose a role.");
  CT.ui.roleDiscardFor = u.claimant; CT.ui.roleDiscardRevealed = false; u.open = null; CT.render();
};

/* ===================== Succession claim (§24) ===================== */
CT.helpers.openSuccClaim = function (playerId, roleId) {
  var ap = CT.activePlayer();
  var pid = playerId || (ap && ap.location === "throne" ? ap.id : "");
  var roles = CT.playerSuccessionRoles(CT.playerById(pid));
  CT.helpers.ui = { open: "succclaim", player: pid, role: roleId || (roles[0] || "firstborn") };
  CT.render();
};
CT.helpers.vSuccClaim = function () {
  var u = CT.helpers.ui, ps = actives().filter(function (x) { return x.location === "throne"; });
  var sel = CT.playerById(u.player);
  var held = CT.playerSuccessionRoles(sel);
  var roleBtns = CT.SUCCESSION_ORDER.filter(function (id) { return held.indexOf(id) !== -1; }).map(function (id) {
    return '<button aria-pressed="' + (u.role === id) + '" data-act="h-sc-role" data-r="' + id + '">' + CT.esc(CT.roleById(id).name) + "</button>";
  }).join("");
  var throneNote = ps.length ? "" : '<p class="muted" style="font-size:13px">No active players at the Throne yet.</p>';
  return wrap('<div class="eyebrow">Helper</div><h2 style="margin:4px 0 2px">Add a succession claim</h2>'
    + '<p class="muted" style="font-size:13px;margin:0 0 12px">Claimant must be at the Throne and hold the succession role. '
    + (u.role && CT.SUCCESSION[u.role] ? CT.esc(CT.SUCCESSION[u.role].note) + "." : "") + '</p>'
    + throneNote
    + field("Claimant (at Throne)", '<select data-act="h-sc-player">' + opt(ps, u.player, "— who —") + "</select>")
    + (roleBtns ? '<div class="seg" style="flex-wrap:wrap;margin-bottom:12px">' + roleBtns + "</div>"
      : '<p class="muted" style="font-size:13px">Selected player holds no succession roles.</p>')
    + '<hr class="rule"><div class="btn-row"><div class="spacer"></div><button class="btn btn-primary" data-act="h-sc-add"'
    + (u.player && held.indexOf(u.role) !== -1 ? "" : " disabled") + '>Record claim</button></div>');
};

/* ===================== handler ===================== */
CT.helpers.handle = function (act, el) {
  var u = CT.helpers.ui;
  switch (act) {
    // open / close
    case "h-open-challenge": return CT.helpers.openChallenge();
    case "h-open-vote": return CT.helpers.openVote();
    case "h-open-duel": return CT.helpers.openDuel();
    case "h-open-callout": return CT.helpers.openCallout();
    case "h-open-trade": return CT.helpers.openTrade();
    case "h-open-contract": return CT.helpers.openContract();
    case "h-close": u.open = null; return CT.render();

    // challenge (selects re-render; power input silent)
    case "h-cl-claimant": u.claimant = el.value; return CT.render();
    case "h-cl-challenger": u.challenger = el.value; return CT.render();
    case "h-cl-power": u.power = el.value; return; // silent
    case "h-ch-valid":
      if (CT.isOnline()) {
        CT.net.send({ type: "challenge", claimantId: u.claimant, challengerId: u.challenger, power: u.power || "", valid: true });
        u.open = null; return CT.render();
      }
      CT.log(CT.playerById(u.claimant).name + " proved \"" + (u.power || "their power") + "\". " + CT.playerById(u.challenger).name + " challenged wrongly and must lose a role.");
      CT.ui.roleDiscardFor = u.challenger; CT.ui.roleDiscardRevealed = false; u.open = null; return CT.render();
    case "h-ch-bluff":
      if (CT.isOnline()) {
        CT.net.send({ type: "challenge", claimantId: u.claimant, challengerId: u.challenger, power: u.power || "", valid: false });
        u.open = null; return CT.render();
      }
      CT.log(CT.playerById(u.claimant).name + "'s \"" + (u.power || "claim") + "\" was a failed bluff and they must lose a role.");
      CT.ui.roleDiscardFor = u.claimant; CT.ui.roleDiscardRevealed = false; u.open = null; return CT.render();

    // vote
    case "h-v-type": u.vtype = el.dataset.t; u.target = ""; return CT.render();
    case "h-v-proposer": u.proposer = el.value; return CT.render();
    case "h-v-target": u.target = el.value; return CT.render();
    case "h-v-seconder": u.seconder = el.checked; return CT.render();
    case "h-v-decree": u.decree = el.checked; return CT.render();
    case "h-v-start": u.phase = "tally"; return CT.render();
    case "h-v-back": u.phase = "setup"; return CT.render();
    case "h-v-cast": u.votes[el.dataset.pid] = el.dataset.v; return CT.render();
    case "h-v-bonus":
      var k = el.dataset.side === "yes" ? "bonusYes" : "bonusNo";
      u[k] = Math.max(0, u[k] + (+el.dataset.d)); return CT.render();
    case "h-v-playcard":
      if (!u.voteCards) u.voteCards = [];
      u.voteCards.push({ playerId: el.dataset.pid, cardId: el.dataset.id, side: el.dataset.side });
      return CT.render();
    case "h-v-rolevote":
      if (!u.roleVotePowers) u.roleVotePowers = [];
      u.roleVotePowers.push({ playerId: el.dataset.pid, roleId: el.dataset.role, side: el.dataset.side });
      return CT.render();
    case "h-v-bribe-offer": {
      var briberId = el.dataset.briber, side = el.dataset.side;
      var sel = document.querySelector('select[data-act="h-v-bribe-target"][data-briber="' + briberId + '"]');
      var targetId = sel ? sel.value : "";
      if (!targetId || targetId === briberId) { alert("Choose a different player to bribe."); return; }
      var briber = CT.playerById(briberId);
      if (!canOfferBribe(briber, u)) { alert("Cannot offer a bribe."); return; }
      if (!u.bribes) u.bribes = [];
      u.bribes.push({ briberId: briberId, targetId: targetId, side: side, status: "pending" });
      return CT.render();
    }
    case "h-v-bribe-respond": {
      var briberId = el.dataset.briber;
      var accepted = el.dataset.accept === "1";
      var b = (u.bribes || []).find(function (x) { return x.briberId === briberId && x.status === "pending"; });
      if (!b) return;
      var briber = CT.playerById(b.briberId), target = CT.playerById(b.targetId);
      if (accepted) {
        if (!briber || briber.gold < 1) { alert("Briber cannot pay."); return; }
        if (!CT.isOnline()) {
          briber.gold -= 1;
          target.gold += 1;
        }
        u.votes[b.targetId] = b.side;
        CT.log((target ? target.name : "?") + " accepted " + (briber ? briber.name : "?")
          + "'s bribe and votes " + b.side + ".", "note");
        b.status = "accepted";
      } else {
        CT.log((target ? target.name : "?") + " refused " + (briber ? briber.name : "?") + "'s bribe.", "note");
        b.status = "refused";
      }
      if (!CT.isOnline() && briber && briber.actionCardIds.indexOf("bribe") !== -1) {
        CT.discardCard(b.briberId, "bribe", "vote");
      }
      return CT.render();
    }
    case "h-v-apply": return CT.helpers.applyVote();

    // duel
    case "h-d-att": u.att = el.value; u.def = ""; u.attDuelCards = []; return CT.render();
    case "h-d-def": u.def = el.value; u.defDuelCards = []; return CT.render();
    case "h-d-override": u.override = el.checked; return CT.render();
    case "h-d-serious": u.serious = el.checked; return CT.render();
    case "h-d-attbonus": u.attBonus = +el.value || 0; return; // silent
    case "h-d-defbonus": u.defBonus = +el.value || 0; return; // silent
    case "h-d-duelcard": {
      var key = el.dataset.side === "def" ? "defDuelCards" : "attDuelCards";
      if (!u[key]) u[key] = [];
      var cid = el.dataset.id, ix = u[key].indexOf(cid);
      if (ix === -1) u[key].push(cid); else u[key].splice(ix, 1);
      return CT.render();
    }
    case "h-d-fight": u.phase = "resolve"; return CT.render();
    case "h-d-back": u.phase = "setup"; return CT.render();
    case "h-d-flee": return CT.helpers.applyFlee();
    case "h-d-conseq": return CT.helpers.applyDuelConseq(el.dataset.c);

    // call out
    case "h-co-caller": u.caller = el.value; return CT.render();
    case "h-co-target": u.target = el.value; return CT.render();
    case "h-co-role": u.role = el.value; return CT.render();
    case "h-co-go": return CT.helpers.applyCallout();

    // trade
    case "h-t-a": u.a = el.value; u.cardAB = ""; return CT.render();
    case "h-t-b": u.b = el.value; u.cardBA = ""; return CT.render();
    case "h-t-goldab": u.goldAB = Math.max(0, +el.value || 0); return; // silent
    case "h-t-goldba": u.goldBA = Math.max(0, +el.value || 0); return; // silent
    case "h-t-cardab": u.cardAB = el.value; return CT.render();
    case "h-t-cardba": u.cardBA = el.value; return CT.render();
    case "h-t-go": return CT.helpers.applyTrade();

    // contract
    case "h-c-a": u.a = el.value; return CT.render();
    case "h-c-b": u.b = el.value; return CT.render();
    case "h-c-promise": u.promise = el.value; return; // silent
    case "h-c-swear":
      if (CT.isOnline()) { CT.net.send({ type: "addContract", aId: u.a, bId: u.b, promise: u.promise.trim() }); u.open = null; return CT.render(); }
      CT.addContract(u.a, u.b, u.promise.trim()); u.open = null; return CT.render();
    case "h-ct-fulfill":
      if (CT.isOnline()) { CT.net.send({ type: "resolveContract", contractId: el.dataset.id, status: "fulfilled" }); return CT.render(); }
      CT.resolveContract(el.dataset.id, "fulfilled"); return CT.render();
    case "h-ct-break":
      if (CT.isOnline()) { CT.net.send({ type: "resolveContract", contractId: el.dataset.id, status: "broken", breakerId: el.dataset.breaker }); return CT.render(); }
      CT.resolveContract(el.dataset.id, "broken", el.dataset.breaker); return CT.render();

    // royal claim
    case "h-open-royalclaim": return CT.helpers.openRoyalClaim();
    case "h-rc-claimant": u.claimant = el.value; if (u.challenger === u.claimant) u.challenger = ""; return CT.render();
    case "h-rc-crown": u.crown = el.dataset.c; return CT.render();
    case "h-rc-challenger": u.challenger = el.value; return CT.render();
    case "h-rc-take": return CT.helpers.applyRoyalTake();
    case "h-rc-proved": return CT.helpers.applyRoyalProved();
    case "h-rc-bluff": return CT.helpers.applyRoyalBluff();

    // royal command (strong location action)
    case "h-rcmd-tax": return CT.helpers.applyRoyalCommand("tax");
    case "h-rcmd-pardon-pick": u.phase = "pardon"; return CT.render();
    case "h-rcmd-target": u.target = el.value; return CT.render();
    case "h-rcmd-back": u.phase = "choice"; u.target = ""; return CT.render();
    case "h-rcmd-pardon": return CT.helpers.applyRoyalCommand("pardon", u.target);
    case "h-rcmd-decree":
      if (CT.isOnline()) {
        CT.net.send({ type: "royalCommand", choice: "decree" });
        u.open = null;
        return CT.helpers.openVoteFromDecree(u.controllerId);
      }
      return CT.helpers.applyRoyalCommand("decree");

    // deep research (Scrolls strong action)
    case "h-dr-mode":
      u.mode = el.dataset.m;
      u.deck = CT.DECK_NAMES[0];
      u.target = "";
      u.phase = u.mode === "witness" ? "witness" : "deck";
      return CT.render();
    case "h-dr-back": u.phase = "choice"; u.mode = ""; return CT.render();
    case "h-dr-deck": u.deck = el.value; return CT.render();
    case "h-dr-target": u.target = el.value; return CT.render();
    case "h-dr-apply":
      return CT.helpers.applyDeepResearch(
        u.mode, u.mode === "witness" ? null : u.deck, u.mode === "witness" ? u.target : null
      );

    // succession
    case "h-open-succclaim": return CT.helpers.openSuccClaim();
    case "h-open-succclaim-quick": return CT.helpers.openSuccClaim();
    case "h-sc-player":
      u.player = el.value;
      var roles = CT.playerSuccessionRoles(CT.playerById(u.player));
      if (roles.indexOf(u.role) === -1) u.role = roles[0] || u.role;
      return CT.render();
    case "h-sc-role": u.role = el.dataset.r; return CT.render();
    case "h-sc-add":
      if (CT.isOnline()) { CT.net.send({ type: "addSuccessionClaim", playerId: u.player, roleId: u.role }); u.open = null; return CT.render(); }
      CT.addSuccessionClaim(u.player, u.role); u.open = null; return CT.render();

    // throne panel controls
    case "h-throne-set":
      if (CT.isOnline()) { if (el.value) CT.net.send({ type: "setThrone", crown: el.dataset.crown, playerId: el.value, reason: "manual" }); return CT.render(); }
      el.value ? CT.setThroneController(el.dataset.crown, el.value, "manual") : null; return CT.render();
    case "h-throne-clear":
      if (CT.isOnline()) { CT.net.send({ type: "clearThrone", crown: el.dataset.crown }); return CT.render(); }
      CT.clearThroneController(el.dataset.crown); return CT.render();
    case "h-succ-open":
      if (CT.isOnline()) { CT.net.send({ type: "openSuccession" }); return CT.render(); }
      CT.openSuccession(); return CT.render();
    case "h-succ-close":
      if (CT.isOnline()) { CT.net.send({ type: "closeSuccession" }); return CT.render(); }
      CT.closeSuccession(); return CT.render();
    case "h-succ-resolve":
      if (CT.isOnline()) { CT.net.send({ type: "resolveSuccession", claimId: el.dataset.id }); return CT.render(); }
      CT.resolveSuccessionClaim(el.dataset.id); return CT.render();
    case "h-succ-remove":
      if (CT.isOnline()) { CT.net.send({ type: "removeSuccessionClaim", claimId: el.dataset.id }); return CT.render(); }
      CT.removeSuccessionClaim(el.dataset.id); return CT.render();
  }
};

/* ---------- apply functions ---------- */
CT.helpers.applyVote = function () {
  var u = CT.helpers.ui, ps = actives();
  if ((u.bribes || []).some(function (b) { return b.status === "pending"; })) {
    alert("Resolve pending bribes before applying the vote.");
    return;
  }
  var resolvedBribes = (u.bribes || []).map(function (b) {
    return { briberId: b.briberId, targetId: b.targetId, side: b.side, accepted: b.status === "accepted" };
  });
  if (CT.isOnline()) {
    CT.net.send({
      type: "formalVote", vtype: u.vtype, targetId: u.target,
      proposerId: u.proposer, seconder: !!u.seconder, decree: !!u.decree,
      votes: u.votes, bonusYes: u.bonusYes, bonusNo: u.bonusNo,
      emergency: !!u.emergency, voteCards: u.voteCards || [], bribes: resolvedBribes,
      roleVotePowers: u.roleVotePowers || [],
    });
    u.open = null;
    return CT.render();
  }
  var prop = CT.playerById(u.proposer);
  var target = CT.playerById(u.target);
  if (!prop || !target) { alert("Choose proposer and target."); return; }
  if (u.vtype === "accuse") {
    if (prop.rep < 2) { alert("Accuser needs Reputation 2+."); return; }
    if (!u.decree && !u.seconder) { alert("Accusation needs a seconder (unless Decree)."); return; }
  } else {
    if (target.rep > 2) { alert("Banish targets must have Rep ≤2."); return; }
    if (!u.decree && target.rep > 0 && !u.seconder) { alert("Banish needs a seconder (unless Rep 0 or Decree)."); return; }
  }
  var yes = 0, no = 0;
  if (u.emergency) {
    for (var ei = 0; ei < ps.length; ei++) {
      var ep = ps[ei];
      if ((ep.location === "throne" || ep.location === "market") && !u.votes[ep.id]) {
        alert(ep.name + " must vote (Emergency Council).");
        return;
      }
    }
  }
  ps.forEach(function (p) { var w = p.rep >= 5 ? 2 : 1; if (u.votes[p.id] === "yes") yes += w; else if (u.votes[p.id] === "no") no += w; });
  yes += u.bonusYes; no += u.bonusNo;
  (u.voteCards || []).forEach(function (vc) {
    var pl = CT.playerById(vc.playerId);
    var bonus = CT.VOTE_CARD_BONUSES[vc.cardId] || 0;
    if (vc.side === "yes") yes += bonus; else if (vc.side === "no") no += bonus;
    if (pl && pl.actionCardIds.indexOf(vc.cardId) !== -1) {
      CT.discardCard(vc.playerId, vc.cardId, "vote");
      CT.log(pl.name + " played " + CT.cardById(vc.cardId).name + " (+" + bonus + " " + vc.side + ").", "note");
    }
  });
  (u.roleVotePowers || []).forEach(function (rv) {
    var pl = CT.playerById(rv.playerId);
    var fx = CT.ROLE_VOTE_ABILITIES && CT.ROLE_VOTE_ABILITIES[rv.roleId];
    var bonus = (fx && fx.bonus) || 1;
    if (rv.side === "yes") yes += bonus; else if (rv.side === "no") no += bonus;
    if (pl) {
      CT.log(pl.name + " used " + ((fx && fx.name) || rv.roleId) + " (+" + bonus + " " + rv.side + ").", "note");
    }
  });
  var pass = yes > no;
  if (u.vtype === "accuse") {
    CT.log("Accusation vote against " + target.name + ": " + (pass ? "PASSES" : "fails") + " (" + yes + "–" + no + ").");
    if (pass) {
      CT.ui.roleDiscardFor = u.target; CT.ui.roleDiscardRevealed = false;
      CT.ui.afterDiscard = function () { if (!CT.state.winner) CT.adjustCorruption(2, "Cursed not revealed by accusation"); };
    }
  } else {
    var innocent = target.hiddenRoleIds.indexOf("cursedone") === -1; // public can't be Cursed
    CT.log("Banishment vote against " + target.name + ": " + (pass ? "PASSES" : "fails") + " (" + yes + "–" + no + ").");
    if (pass) {
      CT.ui.roleDiscardFor = u.target; CT.ui.roleDiscardRevealed = false;
      CT.ui.afterDiscard = function () { if (!CT.state.winner && innocent) CT.adjustCorruption(1, "innocent banished"); };
    }
  }
  u.open = null; CT.render();
};

CT.helpers.applyFlee = function () {
  var u = CT.helpers.ui, def = CT.playerById(u.def);
  if ((u.attDuelCards || []).indexOf("iron_gauntlet") !== -1) { alert("Iron Gauntlet blocks Flee."); return; }
  if (CT.isOnline()) {
    CT.net.send({ type: "duelFlee", defenderId: u.def, attCardIds: u.attDuelCards || [] });
    u.open = null;
    return;
  }
  CT.log(def.name + " plays Flee — the duel is cancelled. Move up to 2 spaces.", "event");
  CT.adjustRep(u.def, -1, "Flee");
  CT.ui.reactionMove = { playerId: u.def, maxSteps: 2 };
  u.open = null; CT.render();
};

CT.helpers.applyDuelConseq = function (c) {
  var u = CT.helpers.ui;
  if (CT.isOnline()) {
    CT.net.send({
      type: "duelConsequence",
      attackerId: u.att, defenderId: u.def,
      attBonus: +u.attBonus || 0, defBonus: +u.defBonus || 0,
      serious: !!u.serious, consequence: c,
      attCardIds: u.attDuelCards || [], defCardIds: u.defDuelCards || [],
      recklessCharge: !!u.recklessCharge,
    });
    u.open = null;
    return;
  }
  var att = CT.playerById(u.att), def = CT.playerById(u.def);
  var attCards = u.attDuelCards || [], defCards = u.defDuelCards || [];
  attCards.forEach(function (cid) { if (att.actionCardIds.indexOf(cid) !== -1) CT.discardCard(att.id, cid, "duel"); });
  defCards.forEach(function (cid) { if (def.actionCardIds.indexOf(cid) !== -1) CT.discardCard(def.id, cid, "duel"); });
  var aT = roleBonus(att, "duelBonusAttack") + (+u.attBonus || 0) + duelCardBonus(attCards);
  var dT = roleBonus(def, "duelBonusDefence") + (+u.defBonus || 0) + duelCardBonus(defCards);
  var attackerWins = aT > dT;
  var winner = attackerWins ? att : def, loser = attackerWins ? def : att;
  var winnerCards = attackerWins ? attCards : defCards;
  var loserCards = attackerWins ? defCards : attCards;
  CT.log("Duel: " + winner.name + " beat " + loser.name + " (" + aT + "–" + dT + ").");
  if (loserCards.indexOf("loaded_dice") !== -1) {
    CT.log(loser.name + "'s Loaded Dice cancelled the duel loss.", "event");
    u.open = null; CT.save(); return CT.render();
  }
  if (u.serious) att.seriousDuelUsed = true;
  if (attCards.indexOf("dirty_trick") !== -1 || defCards.indexOf("dirty_trick") !== -1) CT.adjustCorruption(1, "Dirty Trick");
  switch (c) {
    case "serious": CT.ui.roleDiscardFor = loser.id; CT.ui.roleDiscardRevealed = false; break;
    case "disarm": CT.disarmRandom(loser.id, winnerCards.indexOf("disarm_card") !== -1 ? 3 : 2); break;
    case "shame":
      if (loserCards.indexOf("shield") !== -1) CT.log(loser.name + "'s Shield ignored Shame.", "note");
      else if (CT._offerDefendCrown && CT._offerDefendCrown(loser.id, "shame", loserCards)) { break; }
      else if (isRoyalOrThrone(loser) && CT._offerReaction(loser.id, "duel_consequence", {
        effect: "duel_consequence", consequence: "shame", loserId: loser.id, loserCards: loserCards,
      })) { break; }
      else CT._maybeOfferRepLoss(loser.id, -1, "Shame");
      break;
    case "wound":
      if (loserCards.indexOf("parry") !== -1) CT.log(loser.name + "'s Parry ignored Wound.", "note");
      else { loser.wounded = true; CT.log(loser.name + " is Wounded — no hidden powers next turn."); }
      break;
    case "drive":
      if (CT._offerDefendCrown && CT._offerDefendCrown(loser.id, "drive", loserCards)) { break; }
      if (isRoyalOrThrone(loser) && CT._offerReaction(loser.id, "duel_consequence", {
        effect: "duel_consequence", consequence: "drive", loserId: loser.id, loserCards: loserCards,
      })) { break; }
      if (CT._offerProtect && CT._offerProtect(loser.id, "drive_out")) { break; }
      CT._driveOutPlayer(loser.id);
      break;
    case "search": CT.log(winner.name + " searches " + loser.name + " — resolve privately (show a justifying role or lose 1 Rep).", "note"); break;
  }
  if (winnerCards.indexOf("cursed_blade") !== -1) {
    CT.adjustCorruption(1, "Cursed Blade");
    CT._maybeOfferRepLoss(loser.id, -1, "Cursed Blade");
  }
  if (u.recklessCharge && loser.id === u.att) {
    CT._maybeOfferRepLoss(u.att, -1, "Reckless Charge");
  }
  CT.save(); u.open = null; CT.render();
};

CT.helpers.applyCallout = function () {
  var u = CT.helpers.ui;
  if (CT.isOnline()) {
    CT.net.send({ type: "callOut", targetId: u.target, roleId: u.role });
    CT.helpers.ui.open = null;
    return;
  }
  var caller = CT.playerById(u.caller), target = CT.playerById(u.target), role = CT.roleById(u.role);
  CT.log(caller.name + " calls out " + target.name + " as " + role.name + "!");
  CT.adjustCorruption(2, "Call Out");
  if (CT._offerReaction(target.id, "callout", {
    effect: "callout_resolve", callerId: caller.id, targetId: target.id, roleId: u.role,
  })) {
    CT.helpers.ui.open = null;
    return CT.render();
  }
  CT._resolveCallOut(caller.id, target.id, u.role);
  CT.helpers.ui.open = null; CT.render();
};

CT.helpers.applyTrade = function () {
  var u = CT.helpers.ui;
  if (CT.isOnline()) {
    CT.net.send({
      type: "trade", aId: u.a, bId: u.b,
      goldAB: +u.goldAB || 0, goldBA: +u.goldBA || 0,
      cardAB: u.cardAB !== "" ? +u.cardAB : "",
      cardBA: u.cardBA !== "" ? +u.cardBA : "",
    });
    u.open = null;
    return;
  }
  var a = CT.playerById(u.a), b = CT.playerById(u.b);
  var gAB = Math.min(+u.goldAB || 0, a.gold), gBA = Math.min(+u.goldBA || 0, b.gold);
  if (gAB) { a.gold -= gAB; b.gold += gAB; }
  if (gBA) { b.gold -= gBA; a.gold += gBA; }
  if (u.cardAB !== "" && a.actionCardIds[+u.cardAB] != null) { b.actionCardIds.push(a.actionCardIds.splice(+u.cardAB, 1)[0]); }
  if (u.cardBA !== "" && b.actionCardIds[+u.cardBA] != null) { a.actionCardIds.push(b.actionCardIds.splice(+u.cardBA, 1)[0]); }
  CT.log(a.name + " and " + b.name + " traded" + (gAB || gBA ? " gold" : "") + ".");
  CT.save(); u.open = null; CT.render();
};
