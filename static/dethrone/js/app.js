/* The Cursed Throne — main render + wiring (Phase 1) */
window.CT = window.CT || {};

CT.ui = { privateFor: null, privateRevealed: false, showImport: false,
  roleDiscardFor: null, roleDiscardRevealed: false, handFixFor: null, keepOne: null };

var TOKEN_COLORS = ["#8c2f23", "#a8842c", "#3f6b4a", "#3a5a78", "#6e4a86", "#9c5a2a"];
function tokenColor(i) { return TOKEN_COLORS[i % TOKEN_COLORS.length]; }
function initials(name) { return (name || "?").trim().slice(0, 1).toUpperCase() || "?"; }

/* ============ top-level render / routing ============ */
CT.render = function () {
  var root = document.getElementById("app");
  if (CT.setup.active) { root.innerHTML = shell(CT.setup.view()); bind(); return; }
  if (!CT.state)       { root.innerHTML = shell(startScreen()); bind(); return; }
  root.innerHTML = shell(gameScreen()) + overlays();
  bind();
};

function shell(inner) {
  return '<div class="app">'
    + '<div class="topbar"><div class="brand"><h1>The Cursed Throne</h1>'
    + '<span class="seal">Playtest Ledger</span></div>'
    + (CT.state ? '<div class="btn-row">'
        + '<button class="btn btn-ghost btn-sm" data-act="export">Export</button>'
        + '<button class="btn btn-ghost btn-sm" data-act="show-import">Import</button>'
        + '<button class="btn btn-secondary btn-sm" data-act="new-game">New game</button>'
        + '</div>' : "")
    + '</div>' + inner + '</div>';
}

/* ============ start (empty state) ============ */
function startScreen() {
  return '<div class="panel" style="max-width:620px;margin:24px auto">'
    + '<div class="empty">'
    + '<div class="seal-big" style="margin-bottom:16px">✦</div>'
    + '<h1 style="margin-bottom:8px">Who is secretly helping the kingdom collapse?</h1>'
    + '<p class="muted" style="max-width:46ch;margin:0 auto 24px">A digital dealer, board tracker and referee for the bluffing board game. '
    + 'Gather 4–6 players around one device and pass it for private moments.</p>'
    + '<button class="btn btn-gold" data-act="start-setup">Set up a new game ✦</button>'
    + '</div></div>';
}

/* ============ game screen ============ */
function gameScreen() {
  var s = CT.state;
  return winBanner()
    + trackers()
    + '<div class="grid grid-main">'
    + '<div>' + boardPanel() + actionsPanel() + parleyPanel() + throneSuccPanel() + manualGlobal() + pactsPanel() + '</div>'
    + '<div>' + playersPanel() + logPanel() + '</div>'
    + '</div>';
}

function winBanner() {
  if (!CT.state.winner) return "";
  var loyal = CT.state.winner === "loyal";
  return '<div class="win-banner ' + (loyal ? "loyal" : "cursed") + '">'
    + '<div class="seal-big" style="width:56px;height:56px;font-size:24px;margin:0">' + (loyal ? "✓" : "☠") + '</div>'
    + '<div><h2>' + (loyal ? "Loyal players win" : "Cursed player wins") + '</h2>'
    + '<div style="opacity:.85;font-size:14px">The game is over. Review the log, then start a new game.</div></div></div>';
}

function trackers() {
  var s = CT.state, ap = CT.activePlayer();
  var corrPct = Math.round((s.corruption / CT.CONST.CORRUPTION_MAX) * 100);
  var warn = s.corruption >= CT.CONST.FINAL_RITE_CORRUPTION;
  var throne = throneLabel();
  return '<div class="trackers">'
    + tracker("Round", s.round)
    + tracker("Active player", ap ? ap.name : "—", "active")
    + '<div class="tracker danger"><div class="k">Corruption</div><div class="v">' + s.corruption + ' / 10</div>'
    + '<div class="vial' + (warn ? " warn" : "") + '"><span style="width:' + corrPct + '%"></span></div></div>'
    + tracker("Innocents lost", s.innocentElims + " / 2", s.innocentElims >= 1 ? "danger" : "")
    + tracker("Throne", throne, "gold")
    + '</div>';
}
function tracker(k, v, cls) {
  return '<div class="tracker ' + (cls || "") + '"><div class="k">' + k + '</div><div class="v">' + CT.esc(v) + '</div></div>';
}
function throneLabel() {
  var t = CT.state.throne;
  var names = [];
  if (t.kingControllerId) { var k = CT.playerById(t.kingControllerId); if (k) names.push(k.name); }
  if (t.queenControllerId) { var q = CT.playerById(t.queenControllerId); if (q) names.push(q.name); }
  if (t.successorId) { var su = CT.playerById(t.successorId); if (su) names.push(su.name + " (successor)"); }
  return names.length ? names.join(" & ") : "Vacant";
}

/* ---- board ---- */
function boardPanel() {
  var locs = {};
  CT.LOCATIONS.forEach(function (l) { locs[l.id] = l; });
  var ap = CT.activePlayer();
  var legal = (ap && ap.status === "active" && !CT.state.winner) ? CT.legalMoves(ap) : [];
  function locCell(id) {
    var l = locs[id];
    var here = CT.state.players.filter(function (p) { return p.location === id; });
    var tokens = here.map(playerToken).join("");
    var isLegal = legal.indexOf(id) > -1;
    var cls = "loc" + (l.throne ? " throne" : "") + (l.connector ? " connector" : "") + (l.danger ? " danger" : "") + (isLegal ? " legal" : "");
    return '<div class="' + cls + '"' + (isLegal ? ' data-act="board-move" data-id="' + id + '" role="button" tabindex="0"' : ' data-id="' + id + '"') + '>'
      + (isLegal ? '<span class="move-here">Move ' + CT.esc(ap.name) + ' here →</span>' : '')
      + '<div class="loc-name">' + l.name + '</div>'
      + '<div class="loc-theme">' + l.theme + '</div>'
      + '<div class="conn">↔ ' + CT.CONNECTIONS[id].map(function (c) { return locs[c].name; }).join(", ") + '</div>'
      + '<div class="tokens">' + tokens + '</div></div>';
  }
  return '<div class="panel"><div class="panel-head"><h2>The Kingdom</h2>'
    + '<span class="faint" style="font-size:12px">Graveyard connects Tavern ↔ Barracks</span></div><hr class="rule">'
    + '<div class="board"><div class="board-grid">'
    + locCell("scrolls") + locCell("college") + locCell("tavern") + locCell("market") + locCell("throne") + locCell("barracks")
    + '</div><div class="gy-row">' + locCell("graveyard") + '</div></div></div>';
}
function playerToken(p) {
  var i = CT.state.players.indexOf(p);
  var active = p.id === CT.activePlayer().id;
  return '<span class="token' + (active ? " active" : "") + (p.status === "eliminated" ? " elim" : "") + '">'
    + '<span class="dot" style="background:' + tokenColor(i) + '">' + initials(p.name) + '</span>' + CT.esc(p.name) + '</span>';
}

/* ---- active player's location actions (§13) ---- */
function actionsPanel() {
  var p = CT.activePlayer();
  if (!p) return "";
  var loc = CT.locationById(p.location);
  var acts = CT.LOCATION_ACTIONS[p.location] || [];
  var over = CT.overHandLimit(p);

  var disabled = CT.state.winner || p.status !== "active";
  var buttons = acts.map(function (a) {
    var cant = disabled || p.gold < (a.cost || 0)
      || (a.requiresThrone && p.id !== CT.state.throne.kingControllerId && p.id !== CT.state.throne.queenControllerId)
      || (a.id === "recover" && !(p.wounded || p.rep <= 2));
    var cls = a.kind === "basic" ? "btn-primary" : "btn-gold";
    var costLbl = a.cost ? ' <span style="opacity:.7;font-weight:600">· ' + a.cost + 'g</span>' : "";
    return '<button class="btn ' + cls + '" data-act="loc-action" data-id="' + a.id + '"' + (cant ? " disabled" : "") + '>'
      + CT.esc(a.name) + costLbl + '</button>'
      + '<div class="act-hint">' + CT.esc(a.hint) + (a.manual ? ' · manual' : '') + '</div>';
  }).join("");

  var body;
  if (disabled) {
    body = '<p class="muted">' + (CT.state.winner ? "The game is over." : "This player is eliminated.") + '</p>';
  } else if (p.isBot) {
    body = '<div class="bot-controls"><p class="muted" style="margin:0 0 10px;font-size:14px">'
      + CT.esc(p.name) + ' is a bot. Play their turn, or auto-play through every bot until it’s a human’s turn.</p>'
      + '<div class="btn-row"><button class="btn btn-primary" data-act="bot-turn">▶ Play ' + CT.esc(p.name) + '’s turn</button>'
      + '<button class="btn btn-gold" data-act="bot-auto">⏩ Auto-play bots</button></div></div>';
  } else {
    body = '<div class="act-grid">' + buttons + '</div>';
  }
  return '<div class="panel"><div class="panel-head"><h2>' + CT.esc(p.name) + '’s turn'
    + (p.isBot ? ' <span class="tag">BOT</span>' : '') + '</h2>'
    + '<span class="tag gold">📍 ' + loc.name + '</span></div><hr class="rule">'
    + body
    + (over ? '<div class="reminder">Hand is over the limit of ' + CT.CONST.HAND_LIMIT + ' (' + p.actionCardIds.length + ' cards). '
        + '<button class="btn btn-secondary btn-sm" data-act="fix-hand" data-id="' + p.id + '">Discard down</button></div>' : "")
    + '<div class="btn-row" style="margin-top:14px"><span class="faint" style="font-size:12px;align-self:center">Movement & actions can also be overridden below.</span>'
    + '<div class="spacer"></div><button class="btn btn-secondary" data-act="end-turn"' + (CT.state.winner ? " disabled" : "") + '>End turn →</button></div>'
    + '</div>';
}

/* ---- players panel (public table §30 + manual controls §32) ---- */
function playersPanel() {
  var cards = CT.state.players.map(playerCard).join("");
  return '<div class="panel"><div class="panel-head"><h2>The Court</h2>'
    + '<button class="btn btn-secondary btn-sm" data-act="end-turn"' + (CT.state.winner ? " disabled" : "") + '>End turn →</button>'
    + '</div><hr class="rule"><div class="players">' + cards + '</div></div>';
}
function playerCard(p) {
  var i = CT.state.players.indexOf(p);
  var active = p.id === CT.activePlayer().id;
  var role = CT.roleById(p.publicRoleId);
  var extra = p.extraShownRoleIds.map(function (id) { return CT.roleById(id).name; });
  var locName = CT.locationById(p.location).name;
  var moveOpts = CT.LOCATIONS.map(function (l) { return '<option value="' + l.id + '"' + (l.id === p.location ? " selected" : "") + '>' + l.name + '</option>'; }).join("");

  var meta = [];
  meta.push('<span class="tag">📍 ' + locName + '</span>');
  meta.push('<span class="tag">🂠 ' + p.hiddenRoleIds.length + ' hidden</span>');
  meta.push('<span class="tag">🃏 ' + p.actionCardIds.length + ' cards</span>');
  if (p.wounded) meta.push('<span class="tag wax">Wounded</span>');
  if (p.seriousDuelUsed) meta.push('<span class="tag">Duel used</span>');
  if (extra.length) meta.push('<span class="tag gold">Shown: ' + CT.esc(extra.join(", ")) + '</span>');
  if (p.id === CT.state.throne.kingControllerId || p.id === CT.state.throne.queenControllerId) meta.push('<span class="tag gold">♛ Throne</span>');

  return '<div class="pcard' + (active ? " active" : "") + (p.status === "eliminated" ? " elim" : "") + '">'
    + '<div class="ptop"><div><div class="pname">'
    + '<span class="dot" style="background:' + tokenColor(i) + ';width:18px;height:18px;border-radius:999px;display:inline-grid;place-items:center;color:#fff;font-size:10px;font-weight:800">' + initials(p.name) + '</span>'
    + CT.esc(p.name) + (p.isBot ? ' <span class="tag">BOT</span>' : '') + '</div>'
    + '<div class="prole">' + (role ? CT.esc(role.name) : "—") + '</div></div>'
    + '<button class="btn btn-ghost btn-sm" data-act="view-private" data-id="' + p.id + '">View private</button></div>'
    + '<div class="pstats">'
    + pstat("Gold", p.gold, "gold", p.id, "gold")
    + pstat("Rep", p.rep, "rep", p.id, "rep")
    + '<div class="pstat"><div class="k">Status</div><div class="v" style="font-size:14px">' + (p.status === "active" ? "Active" : "Out") + '</div>'
    + '<div class="stepper"><button class="btn btn-ghost btn-sm" data-act="toggle-elim" data-id="' + p.id + '">' + (p.status === "active" ? "Eliminate" : "Restore") + '</button></div></div>'
    + '</div>'
    + '<div class="pmeta">' + meta.join("") + '</div>'
    + '<div class="row" style="margin-top:10px;gap:8px">'
    + '<label class="field" style="margin:0;flex:1"><span class="lbl" style="font-size:11px">Move to</span>'
    + '<select data-act="move-player" data-id="' + p.id + '">' + moveOpts + '</select></label>'
    + '<button class="btn btn-danger btn-sm" data-act="lose-role" data-id="' + p.id + '" style="align-self:end"'
    + (p.status !== "active" || CT.state.winner ? " disabled" : "") + '>Lose a role</button>'
    + '</div>'
    + '</div>';
}
function pstat(label, value, kind, pid, key) {
  return '<div class="pstat"><div class="k">' + label + '</div><div class="v">' + value + '</div>'
    + '<div class="stepper"><button class="step" data-act="adj" data-id="' + pid + '" data-key="' + key + '" data-d="-1">−</button>'
    + '<button class="step" data-act="adj" data-id="' + pid + '" data-key="' + key + '" data-d="1">+</button></div></div>';
}

/* ---- Phase 3: social helper launchers ---- */
function parleyPanel() {
  var off = CT.state.winner ? " disabled" : "";
  function b(act, label, cls) { return '<button class="btn ' + (cls || "btn-secondary") + '" data-act="' + act + '"' + off + '>' + label + '</button>'; }
  return '<div class="panel"><div class="panel-head"><h2>Parley &amp; Conflict</h2>'
    + '<span class="faint" style="font-size:12px">Helpers — they guide &amp; log</span></div><hr class="rule">'
    + '<div class="act-grid" style="grid-template-columns:1fr 1fr 1fr">'
    + b("h-open-challenge", "Challenge")
    + b("h-open-vote", "Formal Vote")
    + b("h-open-duel", "Duel")
    + b("h-open-callout", "Call Out", "btn-danger")
    + b("h-open-trade", "Trade")
    + b("h-open-contract", "Blood Contract")
    + '</div></div>';
}

function pactsPanel() {
  var active = CT.state.contracts.filter(function (c) { return c.status === "active"; });
  if (!CT.state.contracts.length) return "";
  var rows = CT.state.contracts.map(function (c) {
    var a = CT.playerById(c.aId), b = CT.playerById(c.bId);
    var names = (a ? a.name : "?") + " ↔ " + (b ? b.name : "?");
    var statusTag = c.status === "active" ? '' : '<span class="tag ' + (c.status === "broken" ? "wax" : "moss") + '">' + c.status + '</span>';
    var controls = c.status === "active"
      ? '<div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="h-ct-fulfill" data-id="' + c.id + '">Fulfilled</button>'
        + '<button class="btn btn-danger btn-sm" data-act="h-ct-break" data-id="' + c.id + '" data-breaker="' + c.aId + '">' + CT.esc(a ? a.name : "A") + ' broke it</button>'
        + '<button class="btn btn-danger btn-sm" data-act="h-ct-break" data-id="' + c.id + '" data-breaker="' + c.bId + '">' + CT.esc(b ? b.name : "B") + ' broke it</button></div>'
      : '';
    return '<div class="pcard" style="padding:12px"><div class="row" style="justify-content:space-between"><strong>' + CT.esc(names) + '</strong>' + statusTag + '</div>'
      + '<div class="prole" style="margin:4px 0 8px">' + CT.esc(c.promise) + '</div>' + controls + '</div>';
  }).join("");
  return '<div class="panel"><div class="panel-head"><h2>Pacts</h2><span class="faint" style="font-size:12px">' + active.length + ' active</span></div>'
    + '<hr class="rule"><div class="stack">' + rows + '</div></div>';
}

/* ---- Phase 4: Throne & Succession (§23, §24) ---- */
function throneSuccPanel() {
  var t = CT.state.throne, ps = CT.state.players.filter(function (p) { return p.status === "active"; });
  var off = CT.state.winner ? " disabled" : "";
  function crownRow(crown, label) {
    var id = crown === "king" ? t.kingControllerId : crown === "queen" ? t.queenControllerId : t.successorId;
    var p = CT.playerById(id);
    var setSel = '<select data-act="h-throne-set" data-crown="' + crown + '"' + off + '><option value="">— set ' + label + ' —</option>'
      + ps.map(function (x) { return '<option value="' + x.id + '"' + (x.id === id ? " selected" : "") + '>' + CT.esc(x.name) + "</option>"; }).join("") + "</select>";
    return '<div class="vote-row"><span><strong>' + label + ':</strong> ' + (p ? CT.esc(p.name) : '<span class="faint">Vacant</span>') + "</span>"
      + '<div class="row" style="gap:6px">' + setSel
      + (p ? '<button class="btn btn-ghost btn-sm" data-act="h-throne-clear" data-crown="' + crown + '"' + off + '>Clear</button>' : "") + "</div></div>";
  }
  var succ = t.succession || { open: false, claims: [] };
  var succBody;
  if (!succ.open) {
    succBody = '<div class="row" style="justify-content:space-between"><span class="muted" style="font-size:13px">No succession in progress.</span>'
      + '<button class="btn btn-secondary btn-sm" data-act="h-succ-open"' + off + '>Open succession</button></div>';
  } else {
    var claims = succ.claims.slice().sort(function (a, b) { return a.rank - b.rank; }).map(function (c) {
      var p = CT.playerById(c.playerId), left = CT.claimRoundsLeft(c);
      var status = left <= 0 ? '<span class="tag moss">matured</span>' : '<span class="tag">' + left + ' round' + (left === 1 ? "" : "s") + " left</span>";
      return '<div class="vote-row"><span><strong>#' + c.rank + "</strong> " + CT.esc(p ? p.name : "?") + " — " + CT.esc(CT.roleById(c.roleId).name) + " " + status + "</span>"
        + '<div class="row" style="gap:6px"><button class="btn btn-gold btn-sm" data-act="h-succ-resolve" data-id="' + c.id + '"' + (left > 0 ? " disabled" : "") + '>Resolve</button>'
        + '<button class="btn btn-ghost btn-sm" data-act="h-succ-remove" data-id="' + c.id + '">✕</button></div></div>';
    }).join("") || '<p class="muted" style="font-size:13px">No claims yet.</p>';
    succBody = '<div class="stack" style="gap:6px">' + claims + "</div>"
      + '<div class="btn-row" style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-act="h-open-succclaim"' + off + '>Add claim</button>'
      + '<div class="spacer"></div><button class="btn btn-ghost btn-sm" data-act="h-succ-close">Close succession</button></div>';
  }
  return '<div class="panel"><div class="panel-head"><h2>Throne &amp; Succession</h2>'
    + '<button class="btn btn-gold btn-sm" data-act="h-open-royalclaim"' + off + '>Claim helper ♛</button></div><hr class="rule">'
    + '<div class="stack" style="gap:6px">' + crownRow("king", "King") + crownRow("queen", "Queen")
    + (t.successorId ? crownRow("successor", "Successor") : "") + "</div>"
    + '<h3 style="margin:16px 0 8px">Succession</h3>' + succBody + "</div>";
}

/* ---- global manual controls (§32) ---- */
function manualGlobal() {
  var s = CT.state;
  return '<div class="panel"><div class="panel-head"><h2>Referee controls</h2>'
    + '<span class="faint" style="font-size:12px">Manual overrides for playtesting</span></div><hr class="rule">'
    + '<div class="row" style="gap:24px">'
    + '<div><div class="eyebrow">Corruption</div><div class="row" style="margin-top:6px">'
    + '<button class="step" data-act="corr" data-d="-1">−</button><strong style="font-family:var(--serif);font-size:22px;min-width:42px;text-align:center">' + s.corruption + '</strong>'
    + '<button class="step" data-act="corr" data-d="1">+</button></div></div>'
    + '<div><div class="eyebrow">Innocents lost</div><div class="row" style="margin-top:6px">'
    + '<button class="step" data-act="elim" data-d="-1">−</button><strong style="font-family:var(--serif);font-size:22px;min-width:42px;text-align:center">' + s.innocentElims + '</strong>'
    + '<button class="step" data-act="elim" data-d="1">+</button></div></div>'
    + '<div class="spacer"></div>'
    + '<div><div class="eyebrow">Declare win</div><div class="btn-row" style="margin-top:6px">'
    + '<button class="btn btn-secondary btn-sm" data-act="win" data-side="loyal">Loyal</button>'
    + '<button class="btn btn-danger btn-sm" data-act="win" data-side="cursed">Cursed</button></div></div>'
    + '</div>'
    + '<label class="field" style="margin:16px 0 0"><span class="lbl">Add a playtest note to the log</span>'
    + '<div class="row"><input type="text" id="note-input" placeholder="e.g. Shannon promised Paul a vote at the Tavern" style="flex:1">'
    + '<button class="btn btn-primary" data-act="add-note">Log it</button></div></label>'
    + '</div>';
}

/* ---- log (§34) ---- */
function logPanel() {
  var entries = CT.state.log.map(function (e) {
    return '<div class="entry ' + e.kind + '"><span class="when">R' + e.round + ' · ' + e.label + '</span>'
      + '<span class="what">' + CT.esc(e.text) + '</span></div>';
  }).join("");
  return '<div class="panel"><div class="panel-head"><h2>Chronicle</h2>'
    + '<span class="faint" style="font-size:12px">' + CT.state.log.length + ' entries</span></div><hr class="rule">'
    + '<div class="log">' + (entries || '<div class="empty">Nothing has happened yet.</div>') + '</div></div>';
}

/* ============ overlays (private view, import) ============ */
function overlays() {
  if (CT.ui.privateFor) return privateView();
  if (CT.ui.roleDiscardFor) return roleDiscardView();
  if (CT.ui.handFixFor) return handFixView();
  if (CT.ui.keepOne) return keepOneView();
  if (CT.helpers && CT.helpers.ui.open) return CT.helpers.view();
  if (CT.ui.showImport) return importView();
  return "";
}

/* role-discard helper (§20) — cover screen, then the player picks which card to lose */
function roleDiscardView() {
  var p = CT.playerById(CT.ui.roleDiscardFor);
  if (!p) { CT.ui.roleDiscardFor = null; return ""; }
  if (!CT.ui.roleDiscardRevealed) {
    return '<div class="scrim"><div class="modal cover">'
      + '<div class="seal-big" style="background:radial-gradient(circle at 35% 30%,#a8392a,#8c2f23)">✦</div>'
      + '<h1 style="margin:8px 0">' + CT.esc(p.name) + ' must lose a role card</h1>'
      + '<p class="muted">Pass the device to ' + CT.esc(p.name) + '. You choose which card to discard — only that card is revealed to the table.</p>'
      + '<div class="btn-row" style="justify-content:center;margin-top:20px">'
      + '<button class="btn btn-ghost" data-act="close-lose-role">Cancel</button>'
      + '<button class="btn btn-danger" data-act="reveal-lose-role">Show my role cards</button></div>'
      + '</div></div>';
  }
  var opts = [];
  if (p.publicRoleId) opts.push(roleChoice("public", p.publicRoleId, "Public"));
  p.hiddenRoleIds.forEach(function (id) { opts.push(roleChoice("hidden", id, "Hidden")); });
  p.extraShownRoleIds.forEach(function (id) { opts.push(roleChoice("extra", id, "Shown")); });
  return '<div class="scrim"><div class="modal" style="max-width:560px">'
    + '<div class="eyebrow" style="color:var(--wax)">' + CT.esc(p.name) + ' · choose a card to lose</div>'
    + '<h2 style="margin:6px 0 4px">Which role card do you discard?</h2>'
    + '<p class="muted" style="font-size:14px;margin:0 0 12px">A discarded <strong>hidden</strong> role is revealed. Discarding the Cursed One ends the game for the Loyal side.</p>'
    + '<div class="players" style="grid-template-columns:1fr;gap:10px">' + opts.join("") + '</div>'
    + '<div class="btn-row" style="margin-top:16px"><button class="btn btn-ghost" data-act="close-lose-role">Cancel</button></div>'
    + '</div></div>';
}
function roleChoice(slot, roleId, slotLabel) {
  var r = CT.roleById(roleId);
  return '<div class="pcard"><div class="ptop"><div class="pname" style="font-size:16px">' + CT.esc(r.name)
    + (r.id === "cursedone" ? ' <span class="tag wax">CURSED</span>' : '') + '</div>'
    + '<span class="tag">' + slotLabel + '</span></div>'
    + '<div class="prole">' + CT.esc(r.flavour) + '</div>'
    + '<button class="btn btn-danger btn-sm" style="margin-top:10px;width:100%" data-act="confirm-lose-role" data-slot="' + slot + '" data-role="' + roleId + '">Discard ' + CT.esc(r.name) + '</button>'
    + '</div>';
}

/* discard down to the hand limit (§11 step 4) */
function handFixView() {
  var p = CT.playerById(CT.ui.handFixFor);
  if (!p) { CT.ui.handFixFor = null; return ""; }
  var cards = p.actionCardIds.map(function (id) {
    var c = CT.cardById(id);
    return '<div class="pcard" style="padding:12px"><div class="row" style="justify-content:space-between">'
      + '<div><div class="pname" style="font-size:15px">' + CT.esc(c.name) + ' <span class="tag">' + c.deck + '</span></div>'
      + '<div class="prole" style="margin-top:2px">' + CT.esc(c.effect) + '</div></div>'
      + '<button class="btn btn-secondary btn-sm" data-act="do-discard-hand" data-id="' + id + '">Discard</button></div></div>';
  }).join("");
  return '<div class="scrim"><div class="modal" style="max-width:600px">'
    + '<div class="eyebrow">' + CT.esc(p.name) + ' · private</div>'
    + '<h2 style="margin:6px 0 4px">Discard down to ' + CT.CONST.HAND_LIMIT + '</h2>'
    + '<p class="muted" style="font-size:14px;margin:0 0 12px">' + p.actionCardIds.length + ' cards in hand. Others, look away.</p>'
    + '<div class="stack">' + cards + '</div>'
    + '<div class="btn-row" style="margin-top:16px"><div class="spacer"></div>'
    + '<button class="btn btn-primary" data-act="close-hand"' + (CT.overHandLimit(p) ? " disabled" : "") + '>Done</button></div>'
    + '</div></div>';
}

/* Haggle keep-one (§13 Market) */
function keepOneView() {
  var k = CT.ui.keepOne;
  var cards = k.cards.map(function (id) {
    var c = CT.cardById(id);
    return '<div class="pcard"><div class="pname" style="font-size:16px">' + CT.esc(c.name) + ' <span class="tag">' + c.deck + '</span></div>'
      + '<div class="prole" style="margin:4px 0 10px">' + CT.esc(c.effect) + '</div>'
      + '<button class="btn btn-primary btn-sm" style="width:100%" data-act="keep-card" data-keep="' + id + '">Keep this</button></div>';
  }).join("");
  return '<div class="scrim"><div class="modal">'
    + '<h2 style="margin-bottom:4px">Haggle — keep one</h2>'
    + '<p class="muted" style="font-size:14px;margin:0 0 12px">Others, look away. Keep one; the other is discarded.</p>'
    + '<div class="players" style="grid-template-columns:1fr 1fr;gap:10px">' + cards + '</div></div></div>';
}
function privateView() {
  var p = CT.playerById(CT.ui.privateFor);
  if (!p) { CT.ui.privateFor = null; return ""; }
  if (!CT.ui.privateRevealed) {
    return '<div class="scrim"><div class="modal cover">'
      + '<div class="seal-big">✦</div><h1 style="margin:8px 0">Private view for ' + CT.esc(p.name) + '</h1>'
      + '<p class="muted">Pass the device to ' + CT.esc(p.name) + '. Hidden roles and cards are about to show.</p>'
      + '<div class="btn-row" style="justify-content:center;margin-top:20px">'
      + '<button class="btn btn-ghost" data-act="close-private">Cancel</button>'
      + '<button class="btn btn-primary" data-act="reveal-private-view">Reveal private cards</button></div>'
      + '</div></div>';
  }
  var hidden = p.hiddenRoleIds.map(function (id) {
    var r = CT.roleById(id);
    return '<div class="pcard"><div class="ptop"><div class="pname">' + CT.esc(r.name)
      + (r.id === "cursedone" ? ' <span class="tag wax">CURSED</span>' : '') + '</div><span class="tag">' + r.family + '</span></div>'
      + '<div class="prole">' + CT.esc(r.flavour) + '</div></div>';
  }).join("") || '<p class="muted">No hidden roles remaining.</p>';
  var cards = p.actionCardIds.map(function (id) {
    var c = CT.cardById(id);
    return '<div class="pcard" style="padding:12px"><div class="pname" style="font-size:15px">' + CT.esc(c.name)
      + ' <span class="tag">' + c.deck + '</span></div><div class="prole" style="margin-top:4px">' + CT.esc(c.effect) + '</div></div>';
  }).join("") || '<p class="muted">No action cards.</p>';
  return '<div class="scrim"><div class="modal" style="max-width:620px">'
    + '<div class="eyebrow">Private · ' + CT.esc(p.name) + '</div>'
    + '<h2 style="margin:6px 0 12px">Your hidden roles</h2><div class="players" style="grid-template-columns:1fr;gap:10px">' + hidden + '</div>'
    + '<h2 style="margin:18px 0 12px">Your action cards</h2><div class="stack">' + cards + '</div>'
    + '<div class="btn-row" style="margin-top:20px"><div class="spacer"></div>'
    + '<button class="btn btn-primary" data-act="close-private">Hide & return to table</button></div>'
    + '</div></div>';
}
function importView() {
  return '<div class="scrim"><div class="modal">'
    + '<h2 style="margin-bottom:8px">Import saved game</h2>'
    + '<p class="muted" style="font-size:14px">Paste exported JSON below. This replaces the current game.</p>'
    + '<textarea id="import-text" style="min-height:160px" placeholder="{ ... }"></textarea>'
    + '<div class="btn-row" style="margin-top:12px"><button class="btn btn-ghost" data-act="close-import">Cancel</button>'
    + '<div class="spacer"></div><button class="btn btn-primary" data-act="do-import">Import</button></div>'
    + '</div></div>';
}

/* ============ event wiring (single delegated listener) ============ */
function bind() { /* listeners attached once in init via document */ }

CT.handleAction = function (act, el, ev) {
  if (CT.setup.active && CT.setup.handle && setupActs[act]) { CT.setup.handle(act, el); return; }
  if (act.indexOf("h-") === 0) { CT.helpers.handle(act, el); return; }
  switch (act) {
    case "start-setup": CT.setup.begin(); break;
    case "new-game":
      if (confirm("Start a new game? The current game is saved in your export but will be cleared.")) { CT.resetGame(); CT.setup.begin(); }
      break;
    case "end-turn": CT.endTurn(); CT.render(); break;
    case "bot-turn": { var bp = CT.activePlayer(); if (bp) CT.bot.takeTurn(bp.id); CT.render(); break; }
    case "bot-auto": CT.bot.autoRun(); CT.render(); break;
    case "adj": {
      var d = +el.dataset.d;
      if (el.dataset.key === "gold") CT.adjustGold(el.dataset.id, d, "manual");
      else CT.adjustRep(el.dataset.id, d, "manual");
      CT.render(); break;
    }
    case "corr": CT.adjustCorruption(+el.dataset.d, "manual adjustment"); CT.render(); break;
    case "elim": CT.setInnocentElims(CT.state.innocentElims + (+el.dataset.d), "manual adjustment"); CT.render(); break;
    case "toggle-elim": {
      var p = CT.playerById(el.dataset.id);
      p.status = p.status === "active" ? "eliminated" : "active";
      CT.log(p.name + " was " + (p.status === "eliminated" ? "eliminated" : "restored") + " (manual).");
      CT.save(); CT.render(); break;
    }
    case "win": CT.declareWinner(el.dataset.side, "manual"); CT.render(); break;
    case "add-note": {
      var inp = document.getElementById("note-input");
      if (inp && inp.value.trim()) { CT.log(inp.value.trim(), "note"); CT.render(); }
      break;
    }
    case "board-move": {
      var apr = CT.activePlayer();
      if (apr) CT.movePlayer(apr.id, el.dataset.id, false);
      CT.render(); break;
    }
    case "loc-action": {
      var ap2 = CT.activePlayer();
      var r = CT.doLocationAction(ap2.id, el.dataset.id);
      if (r && r.keepOne) CT.ui.keepOne = { playerId: ap2.id, deck: r.keepOne.deck, cards: r.keepOne.cards };
      else if (r && !r.ok && r.msg) alert(r.msg);
      CT.render(); break;
    }
    case "keep-card": {
      var k = CT.ui.keepOne;
      var drop = k.cards.filter(function (id) { return id !== el.dataset.keep; })[0];
      CT.resolveKeepOne(k.playerId, k.deck, el.dataset.keep, drop);
      CT.ui.keepOne = null; CT.render(); break;
    }
    case "fix-hand": CT.ui.handFixFor = el.dataset.id; CT.render(); break;
    case "do-discard-hand": {
      CT.discardCard(CT.ui.handFixFor, el.dataset.id, "hand limit");
      if (!CT.overHandLimit(CT.playerById(CT.ui.handFixFor))) CT.ui.handFixFor = null;
      CT.render(); break;
    }
    case "close-hand": CT.ui.handFixFor = null; CT.render(); break;
    case "lose-role": CT.ui.roleDiscardFor = el.dataset.id; CT.ui.roleDiscardRevealed = false; CT.ui.afterDiscard = null; CT.render(); break;
    case "reveal-lose-role": CT.ui.roleDiscardRevealed = true; CT.render(); break;
    case "confirm-lose-role":
      CT.applyRoleDiscard(CT.ui.roleDiscardFor, el.dataset.slot, el.dataset.role);
      CT.ui.roleDiscardFor = null; CT.ui.roleDiscardRevealed = false;
      if (CT.ui.afterDiscard) { var fn = CT.ui.afterDiscard; CT.ui.afterDiscard = null; fn(); } // vote/duel follow-up effects
      CT.render(); break;
    case "close-lose-role": CT.ui.roleDiscardFor = null; CT.ui.roleDiscardRevealed = false; CT.ui.afterDiscard = null; CT.render(); break;
    case "view-private": CT.ui.privateFor = el.dataset.id; CT.ui.privateRevealed = false; CT.render(); break;
    case "reveal-private-view": CT.ui.privateRevealed = true; CT.render(); break;
    case "close-private": CT.ui.privateFor = null; CT.ui.privateRevealed = false; CT.render(); break;
    case "export": doExport(); break;
    case "show-import": CT.ui.showImport = true; CT.render(); break;
    case "close-import": CT.ui.showImport = false; CT.render(); break;
    case "do-import": {
      var t = document.getElementById("import-text");
      try { CT.importJSON(t.value); CT.ui.showImport = false; CT.render(); }
      catch (e) { alert("Import failed: " + e.message); }
      break;
    }
  }
};

CT.handleChange = function (act, el) {
  if (CT.setup.active && setupChangeActs[act]) { CT.setup.handle(act, el); return; }
  if (act.indexOf("h-") === 0) { CT.helpers.handle(act, el); return; } // helper selects & checkboxes
  if (act === "move-player") { CT.movePlayer(el.dataset.id, el.value, true); CT.render(); }
};
CT.handleInput = function (act, el) {
  if (CT.setup.active && act === "name") { CT.setup.handle(act, el); return; }
  if (act.indexOf("h-") === 0) { CT.helpers.handle(act, el); } // silent text/number updates
};

var setupActs = { "count":1,"to-names":1,"seat-type":1,"back-count":1,"to-private":1,"reveal-private":1,"choose-public":1,"confirm-private":1,"back-private":1,"first-mode":1,"begin-game":1 };
var setupChangeActs = { "first-pick":1 };

function doExport() {
  var data = CT.exportJSON();
  var blob = new Blob([data], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = "cursed-throne-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

/* ============ init ============ */
document.addEventListener("click", function (ev) {
  var el = ev.target.closest("[data-act]");
  if (!el) return;
  // selects/inputs handle their own events
  if (el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
  CT.handleAction(el.dataset.act, el, ev);
});
document.addEventListener("change", function (ev) {
  var el = ev.target.closest("[data-act]");
  if (!el) return;
  if (el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type === "checkbox")) CT.handleChange(el.dataset.act, el);
});
document.addEventListener("input", function (ev) {
  var el = ev.target.closest("[data-act]");
  if (!el) return;
  if (el.type === "checkbox") return; // checkboxes handled on change
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") CT.handleInput(el.dataset.act, el);
});

document.addEventListener("DOMContentLoaded", function () {
  CT.load(); // resume if present
  CT.render();
});
