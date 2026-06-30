/* The Cursed Throne — main render + wiring (Phase 1) */
window.CT = window.CT || {};

CT.ui = { privateFor: null, privateRevealed: false, showImport: false, showGuide: false,
  roleDiscardFor: null, roleDiscardRevealed: false, handFixFor: null, keepOne: null, playCard: null,
  logFilter: "all", privateNote: null, finalRiteOffer: null, reactionOffer: null, reactionMove: null };

/* Play vs Test mode — Test reveals referee & per-player override tools (§32, §35).
 * Persisted separately so it applies to the start/setup screens too. */
CT.TESTMODE_KEY = "cursed-throne-testmode";
CT.testMode = false;
CT.setTestMode = function (v) {
  CT.testMode = !!v;
  try { localStorage.setItem(CT.TESTMODE_KEY, v ? "1" : "0"); } catch (e) {}
  CT.render();
};

var TOKEN_COLORS = ["#8c2f23", "#a8842c", "#3f6b4a", "#3a5a78", "#6e4a86", "#9c5a2a"];
function tokenColor(i) { return TOKEN_COLORS[i % TOKEN_COLORS.length]; }
function initials(name) { return (name || "?").trim().slice(0, 1).toUpperCase() || "?"; }

/* ============ top-level render / routing ============ */
CT.render = function () {
  var root = document.getElementById("app");
  if (CT.net && CT.net.online && CT.net.error) {
    root.innerHTML = shell('<div class="panel" style="max-width:560px;margin:24px auto"><p class="muted">' + CT.esc(CT.net.error) + '</p></div>');
    bind(); return;
  }
  if (CT.isSpectator() && CT.net && CT.net.online && CT.net.connected) {
    if (!CT.state || CT.state.phase === "lobby") {
      root.innerHTML = shell(spectatorLobbyScreen());
    } else if (CT.state.phase === "setup") {
      root.innerHTML = shell(spectatorSetupScreen());
    } else {
      root.innerHTML = shell(spectatorGameScreen());
    }
    bind();
    renderSpectatorDock();
    return;
  }
  if (CT.net && CT.net.online && CT.net.room && (!CT.state || CT.state.phase === "lobby")) {
    root.innerHTML = shell(onlineLobbyScreen());
    bind(); return;
  }
  if (CT.net && CT.net.online && CT.state && CT.state.phase === "setup") {
    root.innerHTML = shell(onlineSetupScreen()) + overlays();
    bind(); return;
  }
  if (CT.setup.active) { root.innerHTML = shell(CT.setup.view()); bind(); return; }
  if (!CT.state)       { root.innerHTML = shell(startScreen()); bind(); return; }
  root.innerHTML = shell(gameScreen()) + overlays();
  renderTurnDock();
  bind();
};

CT.registerServiceWorker = function () {
  if (!("serviceWorker" in navigator)) return;
  var scope = (document.querySelector("base") || {}).href || "/dethrone/";
  navigator.serviceWorker.register(scope + "sw.js", { scope: scope }).catch(function () {});
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", CT.registerServiceWorker);
} else {
  CT.registerServiceWorker();
}

function renderTurnDock() {
  var dock = document.getElementById("turn-dock");
  if (!dock || !CT.state || CT.state.phase !== "play" || CT.state.winner || CT.isSpectator()) {
    if (dock) dock.hidden = true;
    return;
  }
  dock.className = "turn-dock";
  var ap = CT.activePlayer();
  if (!ap || ap.status !== "active") { dock.hidden = true; return; }
  var isMyTurn = !CT.isOnline() || ap.id === CT.myId();
  if (!isMyTurn) { dock.hidden = true; return; }
  var loc = CT.locationById(ap.location);
  var limit = CT.getRules().HAND_LIMIT;
  var over = CT.overHandLimit(ap);
  var moved = !!ap.movedThisTurn;
  var chips = '<span class="chip' + (moved ? " ok" : "") + '">' + (moved ? "✓ Moved" : "— Move") + '</span>'
    + '<span class="chip' + (over ? " warn" : " ok") + '">🃏 ' + ap.actionCardIds.length + "/" + limit + "</span>";
  if (CT.state.throne.succession && CT.state.throne.succession.open) {
    chips += '<span class="chip wax">♛ Succession</span>';
  }
  if (CT.ui.reactionMove && CT.ui.reactionMove.playerId === ap.id) {
    chips += '<span class="chip wax">Move ' + CT.ui.reactionMove.maxSteps + "</span>";
  }
  dock.innerHTML = '<div class="turn-dock-inner">'
    + '<div class="turn-meta"><div class="turn-title">Your turn</div>'
    + '<div class="turn-sub">📍 ' + CT.esc(loc ? loc.name : ap.location) + "</div>"
    + '<div class="turn-chips">' + chips + "</div></div>"
    + '<div class="turn-parley">'
    + '<button class="btn btn-ghost btn-sm" data-act="h-open-duel" title="Duel">⚔</button>'
    + '<button class="btn btn-ghost btn-sm" data-act="h-open-vote" title="Vote">⚖</button>'
    + '<button class="btn btn-ghost btn-sm" data-act="h-open-trade" title="Trade">⇄</button>'
    + "</div>"
    + '<button class="btn btn-secondary" data-act="view-private" data-id="' + ap.id + '">Hand</button>'
    + '<button class="btn btn-primary" data-act="end-turn"' + (over ? " disabled" : "") + '>End turn</button>'
    + "</div>";
  dock.hidden = false;
}

function renderSpectatorDock() {
  var dock = document.getElementById("turn-dock");
  if (!dock || !CT.isSpectator() || !CT.state || CT.state.phase !== "play" || CT.state.winner) {
    if (dock) dock.hidden = true;
    return;
  }
  var ap = CT.activePlayer();
  if (!ap || ap.status !== "active") { dock.hidden = true; return; }
  var loc = CT.locationById(ap.location);
  var chips = '<span class="chip ok">R' + CT.state.round + "</span>";
  if (CT.state.throne.succession && CT.state.throne.succession.open) {
    chips += '<span class="chip wax">♛ Succession</span>';
  }
  if (ap.isBot) chips += '<span class="chip">BOT</span>';
  dock.className = "turn-dock spectator-dock";
  dock.innerHTML = '<div class="turn-dock-inner">'
    + '<div class="turn-meta"><div class="turn-title">' + CT.esc(ap.name) + "’s turn</div>"
    + '<div class="turn-sub">📍 ' + CT.esc(loc ? loc.name : ap.location) + "</div>"
    + '<div class="turn-chips">' + chips + "</div></div>"
    + '<span class="tag gold" style="align-self:center">Spectating</span>'
    + "</div>";
  dock.hidden = false;
}

CT.showToast = function (msg) {
  var el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(CT.showToast._t);
  CT.showToast._t = setTimeout(function () { el.hidden = true; }, 3200);
};

CT.isOnline = function () { return CT.net && CT.net.online && CT.net.connected && !CT.isSpectator(); };
CT.isSpectator = function () { return !!(CT.net && CT.net.spectator); };
CT.myId = function () { return CT.isSpectator() ? null : (CT.isOnline() || (CT.net && CT.net.connected && !CT.net.spectator) ? (CT.net.you && CT.net.you.id) : null); };
CT.isHost = function () { return CT.isSpectator() ? false : (CT.isOnline() ? !!(CT.net.you && CT.net.you.isHost) : true); };
CT.netAction = function (msg) { if (CT.isSpectator()) return false; if (CT.net && CT.net.online && CT.net.connected) { CT.net.send(msg); return true; } return false; };

function shell(inner) {
  var testToggle = '<button class="btn btn-sm mode-toggle' + (CT.testMode ? " on" : "") + '" data-act="toggle-test" '
    + 'title="Show referee &amp; override tools">' + (CT.testMode ? "🔧 Test mode" : "Play mode") + '</button>';
  var reconnect = (CT.net && CT.net.online && CT.net.routeCode && !CT.net.connected && !CT.net.error)
    ? '<div class="panel" style="margin-bottom:12px;padding:10px 14px;background:var(--wax-soft);border-color:var(--wax)">'
      + '<span class="muted" style="font-size:14px">Reconnecting to room ' + CT.esc(CT.net.routeCode) + '…</span></div>'
    : "";
  return reconnect + '<div class="app">'
    + '<div class="topbar"><div class="brand"><h1>The Cursed Throne</h1>'
    + '<span class="seal">' + (CT.net && CT.net.routeCode ? (CT.isSpectator() ? "Watching " : "Room ") + CT.net.routeCode : (CT.testMode ? "Playtest Ledger" : "Court of Whispers")) + '</span></div>'
    + '<div class="btn-row">' + (CT.isSpectator() ? '<span class="tag gold">Spectator</span>' : testToggle)
    + (CT.state ? '<button class="btn btn-ghost btn-sm" data-act="export-report">Report</button>'
        + (CT.isSpectator() ? "" : '<button class="btn btn-ghost btn-sm" data-act="show-guide">Guide</button>'
        + '<button class="btn btn-ghost btn-sm" data-act="export">Export</button>'
        + '<button class="btn btn-ghost btn-sm" data-act="show-import">Import</button>'
        + '<button class="btn btn-secondary btn-sm" data-act="new-game">New game</button>') : "")
    + '</div></div>' + inner + '</div>';
}

/* ============ start (empty state) ============ */
function startScreen() {
  var balBlock = CT.testMode
    ? '<div class="panel" style="max-width:560px;margin:16px auto 0;text-align:left"><h3 style="margin:0 0 8px">Balance toggles</h3>'
      + CT.balancePanel(CT.pendingBalance || CT.DEFAULT_BALANCE, true) + '</div>'
    : "";
  return '<div class="panel" style="max-width:620px;margin:24px auto">'
    + '<div class="empty">'
    + '<div class="seal-big" style="margin-bottom:16px">✦</div>'
    + '<h1 style="margin-bottom:8px">Who is secretly helping the kingdom collapse?</h1>'
    + '<p class="muted" style="max-width:46ch;margin:0 auto 24px">A bluffing board game for 4–6 players. '
    + 'Everyone on their own phone, or pass one device around the table.</p>'
    + '<div class="btn-row" style="justify-content:center;flex-wrap:wrap;gap:10px">'
    + '<button class="btn btn-gold" data-act="create-room">Create online room ✦</button>'
    + '<button class="btn btn-primary" data-act="start-setup">Local pass-and-play</button>'
    + '</div>'
    + '<p class="muted" style="font-size:13px;margin-top:20px">Already have a code? Open the invite link (<code>#/room/ABCD</code>), watch without playing (<code>#/room/ABCD/watch</code>), or pass-and-play locally.</p>'
    + '</div></div>' + balBlock;
}

function onlineLobbyScreen() {
  var room = CT.net.room, you = CT.net.you || {}, settings = room.settings || {};
  var count = settings.playerCount || 5;
  var players = (room.players || []).map(function (p) {
    var kick = you.isHost && !p.isHost && p.id !== you.id
      ? ' <button class="btn btn-ghost btn-sm" data-act="kick-player" data-id="' + p.id + '" title="Remove from lobby">×</button>'
      : "";
    return '<li class="lobby-player">' + CT.esc(p.name)
      + (p.isHost ? ' <span class="tag gold">host</span>' : "")
      + (p.isBot ? ' <span class="tag">bot</span>' : "")
      + (p.connected ? ' <span class="tag" style="opacity:.6">here</span>' : ' <span class="tag">away</span>')
      + kick + "</li>";
  }).join("") || '<li class="muted">Waiting for players…</li>';
  var countBtns = [4, 5, 6].map(function (c) {
    return '<button aria-pressed="' + (count === c) + '" data-act="lobby-count" data-n="' + c + '"' + (you.isHost ? "" : " disabled") + '>' + c + '</button>';
  }).join("");
  var connected = (room.players || []).filter(function (p) { return p.connected || p.isBot; }).length;
  var canDeal = you.isHost && connected >= count;
  var waitMsg = "";
  if (!you.isHost) {
    waitMsg = '<div class="host-wait-banner">Waiting for the host to deal roles'
      + (connected < count ? " (" + connected + "/" + count + " players here)" : "…") + "</div>";
  } else if (connected < count) {
    waitMsg = '<div class="host-wait-banner">Need ' + (count - connected) + " more player"
      + (count - connected === 1 ? "" : "s") + ' — share the invite link or fill with bots.</div>';
  }
  return '<div class="panel" style="max-width:560px;margin:24px auto">'
    + '<div class="eyebrow">Online room · <strong>' + CT.esc(room.code) + '</strong></div>'
    + '<h1 style="margin-top:6px">The court gathers</h1>'
    + waitMsg
    + '<hr class="rule">'
    + '<div class="btn-row" style="margin-bottom:12px">'
    + '<button class="btn btn-ghost btn-sm" data-act="show-guide">Host playtest guide</button>'
    + '<button class="btn btn-secondary btn-sm" data-act="copy-invite">Copy invite link</button>'
    + '<button class="btn btn-secondary btn-sm" data-act="copy-watch">Copy watch link</button></div>'
    + '<label class="field"><span class="lbl">Your name</span>'
    + '<input type="text" data-act="lobby-name" data-fkey="lobby-name" value="' + CT.esc(you.name || CT.net.playerName()) + '" autocomplete="off"></label>'
    + '<p class="muted" style="font-size:14px">Players (' + connected + ' / ' + count + ')</p>'
    + '<ul class="stack lobby-list" style="margin:8px 0 16px;padding-left:0;list-style:none">' + players + '</ul>'
    + '<p class="muted" style="font-size:13px">Seats for this game</p>'
    + '<div class="seg" style="margin:8px 0 16px">' + countBtns + '</div>'
    + (you.isHost ? '<h3 style="margin:16px 0 8px">Balance toggles</h3>'
      + CT.balancePanel((room.settings && room.settings.balance) || CT.DEFAULT_BALANCE, true)
      + '<label class="field" style="margin:12px 0 0;display:flex;align-items:center;gap:8px;font-size:14px">'
      + '<input type="checkbox" data-act="toggle-spectators"' + ((room.settings && room.settings.allowSpectators !== false) ? " checked" : "") + '> Allow spectators (watch link)</label>' : "")
    + '<div class="btn-row">'
    + (you.isHost && connected < count ? '<button class="btn btn-secondary" data-act="fill-bots">Fill empty seats with bots</button>' : '')
    + '<div class="spacer"></div>'
    + '<button class="btn btn-gold" data-act="deal-setup"' + (canDeal ? "" : " disabled") + '>Deal roles →</button></div>'
    + '</div>';
}

function spectatorLobbyScreen() {
  var room = CT.net.room, you = CT.net.you || {}, settings = room.settings || {};
  var players = (room.players || []).map(function (p) {
    return "<li>" + CT.esc(p.name) + (p.isHost ? ' <span class="tag gold">host</span>' : "") + "</li>";
  }).join("") || '<li class="muted">No players yet</li>';
  var specs = (room.spectators || []).map(function (s) {
    return "<li>" + CT.esc(s.name) + (s.id === you.id ? " (you)" : "") + "</li>";
  }).join("");
  var status = CT.state && CT.state.phase !== "lobby" ? "Game in progress — loading view…" : "Waiting for the host to deal.";
  return '<div class="panel" style="max-width:560px;margin:24px auto">'
    + '<div class="eyebrow">Spectating · <strong>' + CT.esc(room.code) + '</strong></div>'
    + '<h1 style="margin-top:6px">Watching the court</h1>'
    + '<div class="spectator-banner">Public view only — you cannot play or see hidden cards.</div>'
    + '<p class="muted" style="font-size:14px">' + status + '</p>'
    + '<label class="field"><span class="lbl">Your display name</span>'
    + '<input type="text" data-act="lobby-name" value="' + CT.esc(you.name || CT.net.playerName()) + '" autocomplete="off"></label>'
    + '<p class="muted" style="font-size:14px;margin-top:16px">Players</p>'
    + '<ul class="stack" style="margin:8px 0;padding-left:20px;font-size:14px">' + players + "</ul>"
    + (specs ? '<p class="muted" style="font-size:14px">Also watching</p><ul class="stack" style="margin:8px 0;padding-left:20px;font-size:14px">' + specs + "</ul>" : "")
    + "</div>";
}

function spectatorSetupScreen() {
  var setup = CT.state.setup || {};
  var statusList = (setup.playerStatus || []).map(function (ps) {
    return "<li>" + CT.esc(ps.name) + (ps.setupReady ? ' <span class="tag gold">ready</span>' : ' <span class="tag">choosing…</span>') + "</li>";
  }).join("");
  return '<div class="panel" style="max-width:560px;margin:24px auto">'
    + '<div class="eyebrow">Spectating · setup</div>'
    + '<h1>Players choose public roles</h1>'
    + '<div class="spectator-banner">Hidden roles are not shown to spectators.</div>'
    + '<ul class="stack" style="margin:12px 0;padding-left:20px;font-size:14px">' + statusList + "</ul>"
    + '<p class="muted">The game will begin when the host starts play.</p></div>';
}

function spectatorGameScreen() {
  return '<div class="spectator-banner">👁 Spectating — public view only. Hidden roles and action card names are never shown.</div>'
    + winBanner()
    + trackers()
    + '<div class="grid grid-main">'
    + '<div>' + boardPanel() + spectatorActionsPanel() + throneSuccPanel() + pactsPanel() + "</div>"
    + '<div>' + playersPanelSpectator() + logPanel() + "</div>"
    + "</div>";
}

function spectatorActionsPanel() {
  var ap = CT.activePlayer();
  if (!ap || CT.state.winner) return "";
  var loc = CT.locationById(ap.location);
  var acts = (CT.LOCATION_ACTIONS[ap.location] || []).map(function (a) {
    return "<li>" + CT.esc(a.name) + (a.cost ? " · " + a.cost + "g" : "") + "</li>";
  }).join("");
  var succ = CT.state.throne.succession || { open: false };
  var succNote = succ.open
    ? '<p class="tag wax" style="margin:0 0 10px">Succession open — watch for claims at the Throne.</p>'
    : "";
  return '<div class="panel spectator-panel"><div class="panel-head"><h2>' + CT.esc(ap.name) + "’s turn"
    + (ap.isBot ? ' <span class="tag">BOT</span>' : "") + '</h2>'
    + '<span class="tag gold">📍 ' + CT.esc(loc ? loc.name : ap.location) + "</span></div><hr class=\"rule\">"
    + succNote
    + '<p class="muted" style="font-size:13px;margin:0 0 8px">Location actions available this turn:</p>'
    + '<ul class="spectator-act-list">' + (acts || "<li class=\"muted\">None</li>") + "</ul></div>";
}

function playersPanelSpectator() {
  var cards = CT.state.players.map(playerCard).join("");
  return '<div class="panel"><div class="panel-head"><h2>The Court</h2>'
    + '<span class="tag">read-only</span></div><hr class="rule"><div class="players">' + cards + "</div></div>";
}

function onlineSetupScreen() {
  var you = CT.net.you || {}, setup = CT.state.setup || {};
  var me = CT.state.players.find(function (p) { return p.id === you.id; });
  if (!me) return '<div class="panel"><p class="muted">Waiting for setup…</p></div>';
  if (setup.setupReady) {
    var all = setup.allReady;
    var hostBegin = CT.isHost() && all;
    var statusList = (setup.playerStatus || []).map(function (ps) {
      return '<li>' + CT.esc(ps.name) + (ps.setupReady ? ' <span class="tag gold">ready</span>' : ' <span class="tag">choosing…</span>') + '</li>';
    }).join("");
    return '<div class="panel" style="max-width:560px;margin:24px auto">'
      + '<div class="eyebrow">Setup</div><h1>Public role chosen</h1>'
      + '<p class="muted">' + (all ? "Everyone is ready." : "Waiting for others to choose a public role…") + '</p>'
      + '<ul class="stack" style="margin:12px 0;padding-left:20px;font-size:14px">' + statusList + '</ul>'
      + (hostBegin ? '<div class="seg" style="margin:16px 0"><button aria-pressed="true" data-act="first-mode" data-m="random">Random first player</button></div>'
        + '<div class="btn-row"><button class="btn btn-gold" data-act="begin-online">Begin the game ✦</button></div>'
        : '<div class="host-wait-banner">' + (CT.isHost() ? "Waiting for all players to finish choosing." : "Waiting for the host to begin…") + '</div>')
      + '</div>';
  }
  var dealt = setup.dealtRoleIds || [];
  if (!CT.ui.setupRevealed) {
    return '<div class="scrim"><div class="modal cover">'
      + '<div class="seal-big">✦</div><h1 style="margin:8px 0">Your three role cards</h1>'
      + '<p class="muted">Only you can see this. Choose one to show the court.</p>'
      + CT.roleCardBacksHtml(3)
      + '<div class="btn-row" style="justify-content:center;margin-top:20px">'
      + '<button class="btn btn-primary" data-act="reveal-setup">Reveal my roles</button></div></div></div>';
  }
  var cards = dealt.map(function (id) {
    var role = CT.roleById(id);
    var disabled = !role.canBePublic;
    var body = disabled
      ? '<div class="tag wax">Must stay hidden</div>'
      : '<button class="btn btn-gold btn-sm" style="width:100%" data-act="pick-public" data-id="' + id + '">Make this my public role</button>';
    return CT.roleCardPickHtml(id, body, { disabled: disabled });
  }).join("");
  return '<div class="scrim"><div class="modal modal--roles"><h2>Choose your public role</h2>'
    + '<div class="role-card-grid">' + cards + '</div></div></div>';
}

/* ============ game screen ============ */
function gameScreen() {
  var s = CT.state;
  return winBanner()
    + waitingBanner()
    + handLimitBanner()
    + trackers()
    + '<div class="grid grid-main">'
    + '<div>' + boardPanel() + actionsPanel() + parleyPanel() + throneSuccPanel() + (CT.testMode ? manualGlobal() : "") + pactsPanel() + '</div>'
    + '<div>' + playersPanel() + logPanel() + '</div>'
    + '</div>';
}

function handLimitBanner() {
  if (CT.state.winner) return "";
  var ap = CT.activePlayer();
  if (!ap || ap.status !== "active") return "";
  var isMyTurn = !CT.isOnline() || ap.id === CT.myId();
  if (!isMyTurn || !CT.overHandLimit(ap)) return "";
  var limit = CT.getRules().HAND_LIMIT;
  return '<div class="hand-limit-banner" role="alert">'
    + '<strong>Hand limit:</strong> discard to ' + limit + ' cards before ending your turn '
    + '(' + ap.actionCardIds.length + ' now). '
    + '<button class="btn btn-gold btn-sm" data-act="fix-hand" data-id="' + ap.id + '">Discard now</button></div>';
}

function waitingBanner() {
  if (CT.isSpectator() || !CT.isOnline() || CT.state.winner) return "";
  var ap = CT.activePlayer();
  if (!ap || ap.id === CT.myId()) return "";
  return '<div class="wait-banner" role="status">Waiting for <strong>' + CT.esc(ap.name) + "</strong>…</div>";
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
  var R = CT.getRules();
  var corrPct = Math.round((s.corruption / R.CORRUPTION_MAX) * 100);
  var warn = s.corruption >= R.FINAL_RITE_CORRUPTION;
  var throne = throneLabel();
  return '<div class="trackers">'
    + tracker("Round", s.round)
    + tracker("Active player", ap ? ap.name : "—", "active")
    + '<div class="tracker danger"><div class="k">Corruption</div><div class="v">' + s.corruption + ' / ' + R.CORRUPTION_MAX + '</div>'
    + '<div class="vial' + (warn ? " warn" : "") + '"><span style="width:' + corrPct + '%"></span></div></div>'
    + tracker("Innocents lost", s.innocentElims + " / " + R.INNOCENT_ELIMS_TO_LOSE, s.innocentElims >= 1 ? "danger" : "")
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

/* ---- board: V3b editorial kingdom map (see board.js) ---- */
function boardPanel() {
  var ap = CT.activePlayer();
  var hint = CT.isSpectator()
    ? "Spectator view — tokens show where everyone is"
    : ((ap && ap.status === "active" && !CT.state.winner)
      ? "Glowing sites are within " + CT.esc(ap.name) + "’s reach — tap to move"
      : "Graveyard connects Tavern ↔ Barracks");
  return '<div class="panel board-panel"><div class="panel-head"><h2>The Kingdom</h2>'
    + '<span class="faint" style="font-size:12px">' + hint + '</span></div><hr class="rule">'
    + '<div class="map-wrap">' + CT.boardMapSVG() + '</div></div>';
}

/* ---- active player's location actions (§13) ---- */
function actionsPanel() {
  var p = CT.activePlayer();
  if (!p) return "";
  var over = CT.overHandLimit(p);
  var isMyTurn = !CT.isOnline() || p.id === CT.myId();
  var blockEnd = over && isMyTurn;

  var disabled = CT.state.winner || p.status !== "active" || (CT.isOnline() && !isMyTurn);
  var loc = CT.locationById(p.location);
  var acts = CT.LOCATION_ACTIONS[p.location] || [];
  var buttons = acts.map(function (a) {
    var cant = disabled || p.gold < (a.cost || 0)
      || (a.requiresThrone && p.id !== CT.state.throne.kingControllerId && p.id !== CT.state.throne.queenControllerId)
      || (a.id === "recover" && !(p.wounded || p.rep <= 2))
      || (a.id === "serious_duel" && p.seriousDuelUsed);
    var cls = a.kind === "basic" ? "btn-primary" : "btn-gold";
    var costLbl = a.cost ? ' <span style="opacity:.7;font-weight:600">· ' + a.cost + 'g</span>' : "";
    return '<button class="btn ' + cls + '" data-act="loc-action" data-id="' + a.id + '"' + (cant ? " disabled" : "") + '>'
      + CT.esc(a.name) + costLbl + '</button>'
      + '<div class="act-hint">' + CT.esc(a.hint) + (a.manual ? ' · manual' : '') + '</div>';
  }).join("");

  var roleAbilities = CT.roleAbilitiesAvailable(p);
  var roleBtns = roleAbilities.map(function (a) {
    return '<button class="btn btn-secondary" data-act="role-ability" data-id="' + a.id + '"' + (disabled ? " disabled" : "") + '>'
      + CT.esc(a.name) + ' <span style="opacity:.7;font-size:11px">public</span></button>';
  }).join("");
  var roleSection = roleBtns
    ? '<div class="role-ability-row"><div class="eyebrow" style="margin:14px 0 8px">Public role</div><div class="act-grid">' + roleBtns + "</div></div>"
    : "";

  var succ = CT.state.throne.succession || { open: false };
  var succBanner = "";
  if (succ.open && p.location === "throne" && CT.playerSuccessionRoles(p).length) {
    succBanner = '<div class="reminder">Succession is open — claim from the Throne. '
      + '<button class="btn btn-gold btn-sm" data-act="h-open-succclaim-quick">Claim crown</button></div>';
  }

  var body;
  if (disabled) {
    body = '<p class="muted">' + (CT.state.winner ? "The game is over." : "This player is eliminated.") + '</p>';
  } else if (p.isBot) {
    body = '<div class="bot-controls"><p class="muted" style="margin:0 0 10px;font-size:14px">'
      + CT.esc(p.name) + ' is a bot.'
      + (CT.isOnline() && !CT.isHost() ? ' Waiting for the host to play their turn.' : ' Play their turn, or auto-play through every bot until it’s a human’s turn.') + '</p>'
      + (CT.isOnline() && !CT.isHost() ? '' : '<div class="btn-row"><button class="btn btn-primary" data-act="bot-turn">▶ Play ' + CT.esc(p.name) + '’s turn</button>'
      + '<button class="btn btn-gold" data-act="bot-auto">⏩ Auto-play bots</button></div>')
      + '</div>';
  } else {
    body = '<div class="act-grid">' + buttons + '</div>';
  }
  return '<div class="panel"><div class="panel-head"><h2>' + CT.esc(p.name) + '’s turn'
    + (p.isBot ? ' <span class="tag">BOT</span>' : '') + '</h2>'
    + '<span class="tag gold">📍 ' + loc.name + '</span></div><hr class="rule">'
    + succBanner
    + body
    + roleSection
    + (over ? '<div class="reminder">Hand is over the limit of ' + CT.getRules().HAND_LIMIT + ' (' + p.actionCardIds.length + ' cards). '
        + '<button class="btn btn-secondary btn-sm" data-act="fix-hand" data-id="' + p.id + '">Discard down</button></div>' : "")
    + '<div class="btn-row" style="margin-top:14px"><span class="faint" style="font-size:12px;align-self:center">'
    + (CT.isOnline() && !isMyTurn ? "Waiting for " + CT.esc(p.name) + "…" : "Movement & actions can also be overridden below.") + '</span>'
    + '<div class="spacer"></div><button class="btn btn-secondary" data-act="end-turn"'
    + (CT.state.winner || blockEnd ? " disabled" : "") + (blockEnd ? ' title="Discard down first"' : "")
    + '>End turn →</button></div>'
    + '</div>';
}

/* ---- players panel (public table §30 + manual controls §32) ---- */
function playersPanel() {
  var ap = CT.activePlayer();
  var blockEnd = ap && CT.overHandLimit(ap) && (!CT.isOnline() || ap.id === CT.myId());
  var cards = CT.state.players.map(playerCard).join("");
  return '<div class="panel"><div class="panel-head"><h2>The Court</h2>'
    + '<button class="btn btn-secondary btn-sm" data-act="end-turn"'
    + (CT.state.winner || blockEnd ? " disabled" : "") + '>End turn →</button>'
    + '</div><hr class="rule"><div class="players">' + cards + '</div></div>';
}
function playerCard(p) {
  var spec = CT.isSpectator();
  var i = CT.state.players.indexOf(p);
  var active = p.id === CT.activePlayer().id;
  var role = CT.roleById(p.publicRoleId);
  var extra = p.extraShownRoleIds.map(function (id) { return CT.roleById(id).name; });
  var locName = CT.locationById(p.location).name;
  var moveOpts = CT.LOCATIONS.map(function (l) { return '<option value="' + l.id + '"' + (l.id === p.location ? " selected" : "") + '>' + l.name + '</option>'; }).join("");

  var meta = [];
  meta.push('<span class="tag">📍 ' + locName + '</span>');
  meta.push('<span class="tag">🂠 ' + (p.hiddenRoleCount != null ? p.hiddenRoleCount : p.hiddenRoleIds.length) + ' hidden</span>');
  meta.push('<span class="tag">🃏 ' + (p.actionCardCount != null ? p.actionCardCount : p.actionCardIds.length) + ' cards</span>');
  if (p.wounded) meta.push('<span class="tag wax">Wounded</span>');
  if (p.seriousDuelUsed) meta.push('<span class="tag">Duel used</span>');
  if (extra.length) meta.push('<span class="tag gold">Shown: ' + CT.esc(extra.join(", ")) + '</span>');
  if (p.id === CT.state.throne.kingControllerId || p.id === CT.state.throne.queenControllerId) meta.push('<span class="tag gold">♛ Throne</span>');

  return '<div class="pcard' + (active ? " active" : "") + (p.status === "eliminated" ? " elim" : "") + '">'
    + '<div class="ptop"><div><div class="pname">'
    + '<span class="dot" style="background:' + tokenColor(i) + ';width:18px;height:18px;border-radius:999px;display:inline-grid;place-items:center;color:#fff;font-size:10px;font-weight:800">' + initials(p.name) + '</span>'
    + CT.esc(p.name) + (p.isBot ? ' <span class="tag">BOT</span>' : '') + '</div>'
    + '<div class="prole-with-card">' + (role ? CT.roleCardImg(p.publicRoleId, { size: "thumb" }) : "")
    + '<span>' + (role ? CT.esc(role.name) : "—") + '</span></div></div>'
    + (spec ? "" : '<button class="btn btn-ghost btn-sm" data-act="view-private" data-id="' + p.id + '">'
    + (CT.isOnline() && p.id !== CT.myId() ? "—" : "View private") + '</button>') + '</div>'
    + '<div class="pstats">'
    + pstat("Gold", p.gold, "gold", p.id, "gold")
    + pstat("Rep", p.rep, "rep", p.id, "rep")
    + '<div class="pstat"><div class="k">Status</div><div class="v" style="font-size:14px">' + (p.status === "active" ? "Active" : "Out") + '</div>'
    + (CT.testMode && CT.isHost() && !spec ? '<div class="stepper"><button class="btn btn-ghost btn-sm" data-act="toggle-elim" data-id="' + p.id + '">' + (p.status === "active" ? "Eliminate" : "Restore") + '</button></div>' : "") + '</div>'
    + '</div>'
    + '<div class="pmeta">' + meta.join("") + '</div>'
    + ((!spec && (!CT.isOnline() || CT.isHost())) ? '<div class="row" style="margin-top:10px;gap:8px">'
    + '<label class="field" style="margin:0;flex:1"><span class="lbl" style="font-size:11px">Move to</span>'
    + '<select data-act="move-player" data-id="' + p.id + '">' + moveOpts + '</select></label>'
    + (CT.testMode && CT.isHost() ? '<button class="btn btn-danger btn-sm" data-act="lose-role" data-id="' + p.id + '" style="align-self:end"'
        + (p.status !== "active" || CT.state.winner ? " disabled" : "") + '>Lose a role</button>' : "")
    + '</div>' : "")
    + '</div>';
}
function pstat(label, value, kind, pid, key) {
  return '<div class="pstat"><div class="k">' + label + '</div><div class="v">' + value + '</div>'
    + (CT.testMode && CT.isHost() ? '<div class="stepper"><button class="step" data-act="adj" data-id="' + pid + '" data-key="' + key + '" data-d="-1">−</button>'
        + '<button class="step" data-act="adj" data-id="' + pid + '" data-key="' + key + '" data-d="1">+</button></div>' : "")
    + '</div>';
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
  var spec = CT.isSpectator();
  function crownRow(crown, label) {
    var id = crown === "king" ? t.kingControllerId : crown === "queen" ? t.queenControllerId : t.successorId;
    var p = CT.playerById(id);
    if (spec) {
      return '<div class="vote-row"><span><strong>' + label + ':</strong> '
        + (p ? CT.esc(p.name) : '<span class="faint">Vacant</span>') + "</span></div>";
    }
    var setSel = '<select data-act="h-throne-set" data-crown="' + crown + '"' + off + '><option value="">— set ' + label + ' —</option>'
      + ps.map(function (x) { return '<option value="' + x.id + '"' + (x.id === id ? " selected" : "") + '>' + CT.esc(x.name) + "</option>"; }).join("") + "</select>";
    return '<div class="vote-row"><span><strong>' + label + ':</strong> ' + (p ? CT.esc(p.name) : '<span class="faint">Vacant</span>') + "</span>"
      + '<div class="row" style="gap:6px">' + setSel
      + (p ? '<button class="btn btn-ghost btn-sm" data-act="h-throne-clear" data-crown="' + crown + '"' + off + '>Clear</button>' : "") + "</div></div>";
  }
  var succ = t.succession || { open: false, claims: [] };
  var succBody;
  if (!succ.open) {
    succBody = spec
      ? '<p class="muted" style="font-size:13px;margin:0">No succession in progress.</p>'
      : '<div class="row" style="justify-content:space-between"><span class="muted" style="font-size:13px">No succession in progress.</span>'
        + '<button class="btn btn-secondary btn-sm" data-act="h-succ-open"' + off + '>Open succession</button></div>';
  } else {
    succBody = '<p class="tag wax" style="margin:0 0 10px">Succession open — claimants must be at the Throne and hold a succession role.</p>';
    var claims = succ.claims.slice().sort(function (a, b) { return a.rank - b.rank; }).map(function (c) {
      var p = CT.playerById(c.playerId), left = CT.claimRoundsLeft(c);
      var status = left <= 0 ? '<span class="tag moss">matured</span>' : '<span class="tag">' + left + ' round' + (left === 1 ? "" : "s") + " left</span>";
      var actions = spec ? "" : '<div class="row" style="gap:6px"><button class="btn btn-gold btn-sm" data-act="h-succ-resolve" data-id="' + c.id + '"' + (left > 0 ? " disabled" : "") + '>Resolve</button>'
        + '<button class="btn btn-ghost btn-sm" data-act="h-succ-remove" data-id="' + c.id + '">✕</button></div>';
      return '<div class="vote-row"><span><strong>#' + c.rank + "</strong> " + CT.esc(p ? p.name : "?") + " — " + CT.esc(CT.roleById(c.roleId).name) + " " + status + "</span>"
        + actions + "</div>";
    }).join("") || '<p class="muted" style="font-size:13px">No claims yet.</p>';
    succBody = '<div class="stack" style="gap:6px">' + claims + "</div>";
    if (!spec) {
      succBody += '<div class="btn-row" style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-act="h-open-succclaim"' + off + '>Add claim</button>'
        + '<div class="spacer"></div><button class="btn btn-ghost btn-sm" data-act="h-succ-close">Close succession</button></div>';
    }
  }
  var headBtns = spec ? '<span class="tag">read-only</span>'
    : '<button class="btn btn-gold btn-sm" data-act="h-open-royalclaim"' + off + '>Claim helper ♛</button>';
  return '<div class="panel"><div class="panel-head"><h2>Throne &amp; Succession</h2>'
    + headBtns + '</div><hr class="rule">'
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
    + '<h2 style="margin:18px 0 8px">Balance toggles</h2>'
    + CT.balancePanel(s.balance || CT.DEFAULT_BALANCE, true)
    + '<label class="field" style="margin:16px 0 0"><span class="lbl">Add a playtest note to the log</span>'
    + '<div class="row"><input type="text" id="note-input" placeholder="e.g. Shannon promised Paul a vote at the Tavern" style="flex:1">'
    + '<button class="btn btn-primary" data-act="add-note">Log it</button></div></label>'
    + '</div>';
}

/* ---- log (§34) ---- */
var LOG_FILTERS = [
  { id: "all", label: "All" },
  { id: "event", label: "Events" },
  { id: "corruption", label: "Corruption" },
  { id: "system", label: "System" },
  { id: "note", label: "Notes" },
];

function logPanel() {
  var filt = CT.ui.logFilter || "all";
  var entries = CT.state.log.filter(function (e) {
    return filt === "all" || e.kind === filt;
  }).map(function (e) {
    var kindLbl = e.kind !== "event" ? ' <span class="log-kind">' + e.kind + "</span>" : "";
    return '<div class="entry ' + e.kind + '"><span class="when">R' + e.round + " · " + e.label + kindLbl + '</span>'
      + '<span class="what">' + CT.esc(e.text) + "</span></div>";
  }).join("");
  var filters = LOG_FILTERS.map(function (f) {
    return '<button class="btn btn-sm log-filter' + (filt === f.id ? " on" : "") + '" data-act="log-filter" data-f="' + f.id + '">' + f.label + "</button>";
  }).join("");
  return '<div class="panel"><div class="panel-head"><h2>Chronicle</h2>'
    + '<span class="faint" style="font-size:12px">' + CT.state.log.length + " entries</span></div>"
    + '<div class="log-filters">' + filters + '</div><hr class="rule">'
    + '<div class="log">' + (entries || '<div class="empty">No entries for this filter.</div>') + "</div></div>";
}

/* ============ overlays (private view, import) ============ */
function overlays() {
  if (CT.ui.reactionOffer) return reactionView();
  if (CT.ui.finalRiteOffer) return finalRiteView();
  if (CT.ui.roleAbility) return roleAbilityView();
  if (CT.ui.showGuide) return playtestGuideView();
  if (CT.ui.playCard) return playCardView();
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
      + CT.roleCardBacksHtml(3)
      + '<div class="btn-row" style="justify-content:center;margin-top:20px">'
      + '<button class="btn btn-ghost" data-act="close-lose-role">Cancel</button>'
      + '<button class="btn btn-danger" data-act="reveal-lose-role">Show my role cards</button></div>'
      + '</div></div>';
  }
  var opts = [];
  if (p.publicRoleId) opts.push(roleChoice("public", p.publicRoleId, "Public"));
  p.hiddenRoleIds.forEach(function (id) { opts.push(roleChoice("hidden", id, "Hidden")); });
  p.extraShownRoleIds.forEach(function (id) { opts.push(roleChoice("extra", id, "Shown")); });
  return '<div class="scrim"><div class="modal modal--roles">'
    + '<div class="eyebrow" style="color:var(--wax)">' + CT.esc(p.name) + ' · choose a card to lose</div>'
    + '<h2 style="margin:6px 0 4px">Which role card do you discard?</h2>'
    + '<p class="muted" style="font-size:14px;margin:0 0 12px">A discarded <strong>hidden</strong> role is revealed. Discarding the Cursed One ends the game for the Loyal side.</p>'
    + '<div class="role-card-grid">' + opts.join("") + '</div>'
    + '<div class="btn-row" style="margin-top:16px"><button class="btn btn-ghost" data-act="close-lose-role">Cancel</button></div>'
    + '</div></div>';
}
function roleChoice(slot, roleId, slotLabel) {
  var r = CT.roleById(roleId);
  var body = '<span class="tag">' + slotLabel + '</span>'
    + (r.id === "cursedone" ? ' <span class="tag wax">CURSED</span>' : '')
    + '<button class="btn btn-danger btn-sm" style="width:100%" data-act="confirm-lose-role" data-slot="' + slot + '" data-role="' + roleId + '">Discard ' + CT.esc(r.name) + '</button>';
  return CT.roleCardPickHtml(roleId, body);
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
    + '<h2 style="margin:6px 0 4px">Discard down to ' + CT.getRules().HAND_LIMIT + '</h2>'
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
      + CT.roleCardBacksHtml(Math.max(p.hiddenRoleIds.length, 1))
      + '<div class="btn-row" style="justify-content:center;margin-top:20px">'
      + '<button class="btn btn-ghost" data-act="close-private">Cancel</button>'
      + '<button class="btn btn-primary" data-act="reveal-private-view">Reveal private cards</button></div>'
      + '</div></div>';
  }
  var hidden = p.hiddenRoleIds.map(function (id) {
    var r = CT.roleById(id);
    var body = '<span class="tag">' + r.family + '</span>'
      + (r.id === "cursedone" ? ' <span class="tag wax">CURSED</span>' : '');
    return CT.roleCardPickHtml(id, body, { size: "private" });
  }).join("") || '<p class="muted">No hidden roles remaining.</p>';

  var onTurn = CT.activePlayer() && CT.activePlayer().id === p.id && !CT.state.winner;
  var groups = { OnTurn: [], Movement: [], Duel: [], Vote: [], Reaction: [], Other: [] };
  p.actionCardIds.forEach(function (id) {
    var c = CT.cardById(id);
    if (!c) return;
    var t = c.timing || "Other";
    if (t === "Manual") t = "Other";
    if (!groups[t]) t = "Other";
    groups[t].push(id);
  });
  function cardRow(id) {
    var c = CT.cardById(id);
    var fx = CT.AUTO_PLAY[id];
    var playBtn = "";
    if (fx && onTurn) {
      if (fx.needsTarget || fx.needsLocation || fx.needsDeck || fx.needsDiscardCard || fx.optionalTarget) {
        playBtn = ' <button class="btn btn-ghost btn-sm" data-act="play-card-prompt" data-id="' + id + '">Play…</button>';
      } else {
        playBtn = ' <button class="btn btn-primary btn-sm" data-act="play-card" data-id="' + id + '">Play</button>';
      }
    } else if (CT.PROACTIVE_REACTIONS && CT.PROACTIVE_REACTIONS[id] && onTurn) {
      playBtn = ' <button class="btn btn-primary btn-sm" data-act="play-card" data-id="' + id + '">Play now</button>'
        + ' <span class="tag" style="font-size:11px">or hold for tax</span>';
    } else if (c.timing === "Reaction") {
      playBtn = ' <span class="tag wax" style="font-size:11px">when targeted</span>';
    } else if (c.timing === "Duel" || c.timing === "Vote") {
      playBtn = ' <span class="tag" style="font-size:11px">use in helper</span>';
    } else if (!fx && c.requiresManualResolution !== false) {
      playBtn = ' <span class="tag wax" style="font-size:11px">manual at table</span>';
    }
    return '<div class="pcard" style="padding:12px"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">'
      + '<div><div class="pname" style="font-size:15px">' + CT.esc(c.name)
      + ' <span class="tag">' + c.deck + '</span></div><div class="prole" style="margin-top:4px">' + CT.esc(c.effect) + '</div></div>'
      + playBtn + '</div></div>';
  }
  var cardsBody = "";
  ["OnTurn", "Movement", "Reaction", "Duel", "Vote", "Other"].forEach(function (g) {
    if (!groups[g].length) return;
    cardsBody += '<div class="eyebrow" style="margin:12px 0 6px">' + g + "</div><div class=\"stack\">"
      + groups[g].map(cardRow).join("") + "</div>";
  });
  if (!cardsBody) cardsBody = '<p class="muted">No action cards.</p>';
  return '<div class="scrim"><div class="modal modal--roles" style="max-width:min(96vw,720px)">'
    + '<div class="eyebrow">Private · ' + CT.esc(p.name) + '</div>'
    + (CT.ui.privateNote ? '<div class="private-note-banner">' + CT.esc(CT.ui.privateNote) + '</div>' : '')
    + '<h2 style="margin:6px 0 12px">Your hidden roles</h2><div class="role-card-grid">' + hidden + '</div>'
    + '<h2 style="margin:18px 0 12px">Your action cards</h2>' + cardsBody
    + '<div class="btn-row" style="margin-top:20px"><div class="spacer"></div>'
    + '<button class="btn btn-primary" data-act="close-private">Hide & return to table</button></div>'
    + '</div></div>';
}

function reactionView() {
  var offer = CT.ui.reactionOffer;
  if (!offer) return "";
  var p = CT.playerById(offer.playerId || CT.myId());
  if (!p) { CT.ui.reactionOffer = null; return ""; }
  var cards = (offer.cards || []).map(function (id) {
    var c = CT.cardById(id);
    return '<button class="btn btn-gold" data-act="play-reaction" data-id="' + id + '">Play '
      + CT.esc(c ? c.name : id) + "</button>";
  }).join("");
  var labels = { rumour: "Rumour", callout: "Call Out", vote_pass: "Formal vote", duel_declared: "Duel", rep_loss: "Reputation loss", duel_consequence: "Duel consequence" };
  return '<div class="scrim"><div class="modal cover" style="max-width:480px">'
    + '<div class="seal-big" style="background:var(--gold-soft);color:var(--wax)">⚡</div>'
    + '<h1 style="margin:8px 0">Reaction?</h1>'
    + '<p class="muted" style="font-size:15px">A ' + CT.esc(labels[offer.trigger] || "game") + ' effect targets you. '
    + 'Play a reaction card from your hand, or let it resolve.</p>'
    + '<div class="reaction-cards">' + cards + "</div>"
    + '<div class="btn-row" style="justify-content:center;margin-top:20px">'
    + '<button class="btn btn-ghost" data-act="decline-reaction">Let it happen</button>'
    + "</div></div></div>";
}

function finalRiteView() {
  var p = CT.playerById(CT.ui.finalRiteOffer);
  if (!p) { CT.ui.finalRiteOffer = null; return ""; }
  return '<div class="scrim"><div class="modal cover" style="max-width:480px">'
    + '<div class="seal-big" style="background:var(--wax-soft);color:var(--wax)">☠</div>'
    + '<h1 style="margin:8px 0">Final Rite</h1>'
    + '<p class="muted" style="font-size:15px">You are at the Graveyard and corruption is '
    + CT.state.corruption + " or higher. Reveal the Cursed One and win — or pass and end your turn normally.</p>"
    + '<p class="muted" style="font-size:13px">Only you see this prompt. The table learns the outcome when you choose.</p>'
    + '<div class="btn-row" style="justify-content:center;margin-top:20px;flex-wrap:wrap;gap:10px">'
    + '<button class="btn btn-ghost" data-act="decline-final-rite">End turn without Rite</button>'
    + '<button class="btn btn-danger" data-act="perform-final-rite">Perform Final Rite ✦</button>'
    + '</div></div></div>';
}

function roleAbilityView() {
  var u = CT.ui.roleAbility;
  if (!u) return "";
  var p = CT.playerById(u.playerId);
  var fx = CT.ROLE_ABILITY_EFFECTS[u.abilityId];
  if (!p || !fx) { CT.ui.roleAbility = null; return ""; }
  var targets = CT.state.players.filter(function (x) {
    if (x.status !== "active" || x.id === p.id) return false;
    if (fx.sameLocation && x.location !== p.location) return false;
    if (fx.targetNotSelf && x.id === p.id) return false;
    return true;
  });
  var opts = targets.map(function (x) {
    return '<option value="' + x.id + '">' + CT.esc(x.name) + "</option>";
  }).join("");
  return '<div class="scrim"><div class="modal" style="max-width:420px">'
    + '<div class="eyebrow">Public role · ' + CT.esc(CT.roleById(p.publicRoleId).name) + '</div>'
    + '<h2 style="margin:6px 0 12px">' + CT.esc(fx.name) + "</h2>"
    + '<label class="field" style="display:block;margin:12px 0"><span>Target</span>'
    + '<select id="role-ability-target">' + opts + "</select></label>"
    + '<div class="btn-row" style="margin-top:16px"><button class="btn btn-ghost" data-act="close-role-ability">Cancel</button>'
    + '<div class="spacer"></div><button class="btn btn-primary" data-act="confirm-role-ability">Use ability</button></div>'
    + "</div></div>";
}

function playtestGuideView() {
  return '<div class="scrim"><div class="modal" style="max-width:560px;max-height:85vh;overflow:auto">'
    + '<div class="eyebrow">Phase 7 · table playtest</div>'
    + '<h2 style="margin:6px 0 12px">Host playtest guide</h2>'
    + (typeof CT.playtestGuideHtml === "function" ? CT.playtestGuideHtml() : "")
    + '<p class="muted" style="font-size:13px;margin-top:12px">Full checklist: <code>PLAYTEST.md</code> in the app folder.</p>'
    + '<div class="btn-row" style="margin-top:16px"><div class="spacer"></div>'
    + '<button class="btn btn-primary" data-act="close-guide">Close</button></div></div></div>';
}

function handleLocActionResult(r) {
  if (!r) return;
  if (!r.ok && r.msg) { alert(r.msg); return; }
  if (r.keepOne) CT.ui.keepOne = { playerId: CT.activePlayer().id, deck: r.keepOne.deck, cards: r.keepOne.cards };
  if (r.openDuel && CT.helpers) CT.helpers.openDuelFromPending(r.openDuel);
  if (r.openRoyalCommand && CT.helpers) CT.helpers.openRoyalCommandFromPending(r.openRoyalCommand);
  if (r.openDeepResearch && CT.helpers) CT.helpers.openDeepResearchFromPending(r.openDeepResearch);
}

function handlePlayCardResult(res) {
  if (!res) return;
  if (!res.ok && res.msg) { alert(res.msg); return; }
  if (res.keepOne) CT.ui.keepOne = { playerId: CT.ui.privateFor || CT.myId(), deck: res.keepOne.deck, cards: res.keepOne.cards };
  if (res.openDuel && CT.helpers) CT.helpers.openDuelFromPending(res.openDuel);
  if (res.openVote && CT.helpers) CT.helpers.openVoteFromPending(res.openVote);
  if (res.openTrade && CT.helpers) CT.helpers.openTradeFromPending(res.openTrade);
  if (res.openContract && CT.helpers) CT.helpers.openContractFromPending(res.openContract);
  if (res.openCallout && CT.helpers) CT.helpers.openCalloutFromPending(res.openCallout);
}

function playCardView() {
  var u = CT.ui.playCard;
  if (!u) return "";
  var p = CT.playerById(u.playerId);
  var c = CT.cardById(u.cardId);
  if (!p || !c) { CT.ui.playCard = null; return ""; }
  var fx = CT.AUTO_PLAY[u.cardId] || {};
  var body = "";
  if (fx.needsTarget) {
    var targets = CT.state.players.filter(function (x) {
      if (x.status !== "active" || x.id === p.id) return false;
      if (fx.sameLocation && x.location !== p.location) return false;
      return true;
    });
    var opts = targets.map(function (x) {
      return '<option value="' + x.id + '">' + CT.esc(x.name) + "</option>";
    }).join("");
    body += '<label class="field" style="display:block;margin:12px 0"><span>Target</span>'
      + '<select id="play-target" style="width:100%">' + opts + "</select></label>";
  }
  if (fx.optionalTarget) {
    var allies = CT.state.players.filter(function (x) {
      return x.status === "active" && x.id !== p.id && x.location === p.location;
    });
    var allyOpts = '<option value="">— none —</option>' + allies.map(function (x) {
      return '<option value="' + x.id + '">' + CT.esc(x.name) + "</option>";
    }).join("");
    body += '<label class="field" style="display:block;margin:12px 0"><span>Ally at your location (optional)</span>'
      + '<select id="play-target" style="width:100%">' + allyOpts + "</select></label>";
  }
  if (fx.needsDeck) {
    var decks = CT.DECK_NAMES.map(function (d) {
      return '<option value="' + d + '">' + d + "</option>";
    }).join("");
    body += '<label class="field" style="display:block;margin:12px 0"><span>Deck</span>'
      + '<select id="play-deck" style="width:100%">' + decks + "</select></label>";
  }
  if (fx.needsLocation) {
    var moves;
    if (fx.smuggleRun) {
      var smDest = p.location === "tavern" ? "barracks" : (p.location === "barracks" ? "tavern" : null);
      moves = smDest ? '<option value="' + smDest + '">' + CT.esc(CT.locationById(smDest).name) + " (via Graveyard)</option>" : "";
      body += '<label class="field" style="display:block;margin:12px 0"><span>Destination</span>'
        + '<select id="play-location" style="width:100%">' + moves + "</select></label>";
    } else if (fx.namedLocation) {
      moves = CT.LOCATIONS.map(function (l) {
        return '<option value="' + l.id + '">' + CT.esc(l.name) + "</option>";
      }).join("");
      body += '<label class="field" style="display:block;margin:12px 0"><span>Location to check</span>'
        + '<select id="play-location" style="width:100%">' + moves + "</select></label>";
    } else {
      if (fx.tunnel) {
        var tun = p.location === "market" ? "scrolls" : (p.location === "college" ? "barracks" : null);
        moves = tun ? '<option value="' + tun + '">' + CT.esc(CT.locationById(tun).name) + "</option>" : "";
      } else {
        moves = CT.legalMoves(p).map(function (lid) {
          return '<option value="' + lid + '">' + CT.esc(CT.locationById(lid).name) + "</option>";
        }).join("");
      }
      body += '<label class="field" style="display:block;margin:12px 0"><span>Move to</span>'
        + '<select id="play-location" style="width:100%">' + moves + "</select></label>";
    }
  }
  if (fx.atLocation && p.location !== fx.atLocation) {
    body += '<p class="muted" style="font-size:13px">Must be at ' + CT.esc(CT.locationById(fx.atLocation).name) + ".</p>";
  }
  if (fx.needsDiscardCard) {
    var sellOpts = p.actionCardIds.filter(function (id) { return id !== u.cardId; }).map(function (id) {
      var sc = CT.cardById(id);
      return '<option value="' + id + '">' + CT.esc(sc ? sc.name : id) + "</option>";
    }).join("");
    body += '<label class="field" style="display:block;margin:12px 0"><span>Card to sell</span>'
      + '<select id="play-discard" style="width:100%">' + sellOpts + "</select></label>";
  }
  return '<div class="scrim"><div class="modal" style="max-width:480px">'
    + '<h2 style="margin-bottom:4px">Play ' + CT.esc(c.name) + '</h2>'
    + '<p class="muted" style="font-size:14px;margin:0 0 8px">' + CT.esc(c.effect) + '</p>'
    + body
    + '<div class="btn-row" style="margin-top:16px"><button class="btn btn-ghost" data-act="close-play-card">Cancel</button>'
    + '<div class="spacer"></div><button class="btn btn-primary" data-act="confirm-play-card" data-id="' + u.cardId + '">Play</button>'
    + '</div></div></div>';
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
    case "log-filter":
      CT.ui.logFilter = el.dataset.f;
      CT.render(); break;
    case "create-room":
      CT.net.createRoom(5);
      break;
    case "copy-invite": CT.net.copyInvite(); break;
    case "copy-watch": CT.net.copyWatchInvite(); break;
    case "toggle-spectators":
      break;
    case "show-guide": CT.ui.showGuide = true; CT.render(); break;
    case "close-guide": CT.ui.showGuide = false; CT.render(); break;
    case "kick-player":
      if (CT.isHost()) CT.net.send({ type: "kickPlayer", playerId: el.dataset.id });
      break;
    case "lobby-count":
      if (CT.isHost()) CT.net.send({ type: "setPlayerCount", playerCount: +el.dataset.n });
      break;
    case "fill-bots":
      if (CT.isHost()) CT.net.send({ type: "fillBots" });
      break;
    case "deal-setup":
      if (CT.isHost()) CT.net.send({ type: "dealSetup" });
      break;
    case "reveal-setup": CT.ui.setupRevealed = true; CT.render(); break;
    case "pick-public":
      CT.net.send({ type: "pickPublicRole", roleId: el.dataset.id });
      CT.ui.setupRevealed = false;
      break;
    case "begin-online":
      if (CT.isHost()) CT.net.send({ type: "beginGame", firstMode: "random", firstPlayerIndex: 0 });
      break;
    case "start-setup": CT.setup.begin(); break;
    case "toggle-test": CT.setTestMode(!CT.testMode); break;
    case "new-game":
      if (confirm("Start a new game? The current game is saved in your export but will be cleared.")) { CT.resetGame(); CT.setup.begin(); }
      break;
    case "end-turn":
      if (CT.netAction({ type: "endTurn" })) break;
      var et = CT.endTurn();
      if (et && et.offerFinalRite) { CT.render(); break; }
      if (et && !et.ok) {
        CT.showToast(et.msg);
        var ap = CT.activePlayer();
        if (ap && CT.overHandLimit(ap)) CT.ui.handFixFor = ap.id;
      }
      CT.render(); break;
    case "perform-final-rite":
      if (CT.netAction({ type: "performFinalRite" })) break;
      CT.performFinalRite(CT.ui.finalRiteOffer || CT.myId());
      CT.render(); break;
    case "decline-final-rite":
      if (CT.netAction({ type: "declineFinalRite" })) break;
      CT.declineFinalRite(CT.ui.finalRiteOffer || CT.myId());
      CT.render(); break;
    case "play-reaction":
      if (CT.netAction({ type: "resolveReaction", cardId: el.dataset.id })) {
        CT.ui.reactionOffer = null; break;
      }
      CT.resolveReaction(el.dataset.id);
      CT.ui.reactionOffer = null;
      CT.render(); break;
    case "decline-reaction":
      if (CT.netAction({ type: "declineReaction" })) {
        CT.ui.reactionOffer = null; break;
      }
      CT.declineReaction();
      CT.ui.reactionOffer = null;
      CT.render(); break;
    case "bot-turn": {
      var bp = CT.activePlayer();
      if (CT.isOnline() && CT.isHost() && bp) {
        CT.net.send({ type: "botTurn", playerId: bp.id });
        break;
      }
      if (bp) CT.bot.takeTurn(bp.id);
      CT.render(); break;
    }
    case "bot-auto":
      if (CT.isOnline() && CT.isHost()) { CT.net.send({ type: "botAuto" }); break; }
      CT.bot.autoRun(); CT.render(); break;
    case "adj": {
      var d = +el.dataset.d;
      if (CT.netAction({ type: el.dataset.key === "gold" ? "adjustGold" : "adjustRep", playerId: el.dataset.id, delta: d, reason: "manual" })) break;
      if (el.dataset.key === "gold") CT.adjustGold(el.dataset.id, d, "manual");
      else CT.adjustRep(el.dataset.id, d, "manual");
      CT.render(); break;
    }
    case "corr":
      if (CT.netAction({ type: "adjustCorruption", delta: +el.dataset.d, reason: "manual adjustment" })) break;
      CT.adjustCorruption(+el.dataset.d, "manual adjustment"); CT.render(); break;
    case "elim":
      if (CT.netAction({ type: "adjustInnocents", delta: +el.dataset.d, reason: "manual adjustment" })) break;
      CT.setInnocentElims(CT.state.innocentElims + (+el.dataset.d), "manual adjustment"); CT.render(); break;
    case "toggle-elim": {
      if (CT.netAction({ type: "toggleElim", playerId: el.dataset.id })) break;
      CT.togglePlayerElim(el.dataset.id);
      CT.render(); break;
    }
    case "win":
      if (CT.netAction({ type: "declareWinner", side: el.dataset.side })) break;
      CT.declareWinner(el.dataset.side, "manual"); CT.render(); break;
    case "add-note": {
      var inp = document.getElementById("note-input");
      if (inp && inp.value.trim()) {
        if (CT.netAction({ type: "addNote", text: inp.value.trim() })) break;
        CT.log(inp.value.trim(), "note"); CT.render();
      }
      break;
    }
    case "board-move": {
      if (CT.isSpectator()) break;
      var rm = CT.ui.reactionMove;
      if (rm && (!CT.isOnline() || rm.playerId === CT.myId())) {
        var rp = CT.playerById(rm.playerId);
        if (rp && CT.legalMoves(rp).indexOf(el.dataset.id) !== -1) {
          if (CT.netAction({ type: "reactionMove", locationId: el.dataset.id })) { CT.render(); break; }
          CT.movePlayer(rm.playerId, el.dataset.id, true);
          rm.maxSteps -= 1;
          if (rm.maxSteps <= 0) CT.ui.reactionMove = null;
          CT.render(); break;
        }
      }
      var apr = CT.activePlayer();
      if (!apr) break;
      if (CT.netAction({ type: "move", locationId: el.dataset.id })) break;
      CT.movePlayer(apr.id, el.dataset.id, false);
      CT.render(); break;
    }
    case "loc-action": {
      var ap2 = CT.activePlayer();
      if (!ap2) break;
      if (CT.netAction({ type: "locAction", actionId: el.dataset.id })) break;
      handleLocActionResult(CT.doLocationAction(ap2.id, el.dataset.id));
      CT.render(); break;
    }
    case "role-ability": {
      var ap3 = CT.activePlayer();
      if (!ap3) break;
      var aid = el.dataset.id;
      var fx = CT.ROLE_ABILITY_EFFECTS[aid];
      if (!fx) break;
      if (fx.needsTarget) {
        CT.ui.roleAbility = { playerId: ap3.id, abilityId: aid };
        CT.render(); break;
      }
      if (CT.netAction({ type: "useRoleAbility", abilityId: aid })) break;
      var res = CT.useRoleAbility(ap3.id, aid);
      if (!res.ok && res.msg) alert(res.msg);
      CT.render(); break;
    }
    case "close-role-ability": CT.ui.roleAbility = null; CT.render(); break;
    case "confirm-role-ability": {
      var u = CT.ui.roleAbility;
      if (!u) break;
      var ts = document.getElementById("role-ability-target");
      var tid = ts ? ts.value : "";
      if (CT.netAction({ type: "useRoleAbility", abilityId: u.abilityId, targetId: tid })) {
        CT.ui.roleAbility = null; break;
      }
      var res2 = CT.useRoleAbility(u.playerId, u.abilityId, { targetId: tid });
      if (!res2.ok && res2.msg) alert(res2.msg);
      CT.ui.roleAbility = null;
      CT.render(); break;
    }
    case "keep-card": {
      var k = CT.ui.keepOne;
      var drop = k.cards.filter(function (id) { return id !== el.dataset.keep; })[0];
      if (CT.netAction({ type: "resolveKeepOne", deck: k.deck, keepId: el.dataset.keep, dropId: drop })) {
        CT.ui.keepOne = null; break;
      }
      CT.resolveKeepOne(k.playerId, k.deck, el.dataset.keep, drop);
      CT.ui.keepOne = null; CT.render(); break;
    }
    case "fix-hand": CT.ui.handFixFor = el.dataset.id; CT.render(); break;
    case "do-discard-hand": {
      if (CT.netAction({ type: "discardCard", cardId: el.dataset.id, reason: "hand limit" })) break;
      CT.discardCard(CT.ui.handFixFor, el.dataset.id, "hand limit");
      if (!CT.overHandLimit(CT.playerById(CT.ui.handFixFor))) CT.ui.handFixFor = null;
      CT.render(); break;
    }
    case "close-hand": CT.ui.handFixFor = null; CT.render(); break;
    case "lose-role":
      if (CT.isOnline() && el.dataset.id !== CT.myId() && !CT.isHost()) break;
      CT.ui.roleDiscardFor = el.dataset.id;
      CT.ui.roleDiscardRevealed = CT.isOnline() && el.dataset.id === CT.myId();
      CT.ui.afterDiscard = null; CT.render(); break;
    case "reveal-lose-role": CT.ui.roleDiscardRevealed = true; CT.render(); break;
    case "confirm-lose-role":
      if (CT.netAction({ type: "discardRole", playerId: CT.ui.roleDiscardFor, slot: el.dataset.slot, roleId: el.dataset.role })) {
        CT.ui.roleDiscardFor = null; CT.ui.roleDiscardRevealed = false; CT.ui.afterDiscard = null; break;
      }
      CT.applyRoleDiscard(CT.ui.roleDiscardFor, el.dataset.slot, el.dataset.role);
      CT.ui.roleDiscardFor = null; CT.ui.roleDiscardRevealed = false;
      if (CT.ui.afterDiscard) { var fn = CT.ui.afterDiscard; CT.ui.afterDiscard = null; fn(); } // vote/duel follow-up effects
      CT.render(); break;
    case "close-lose-role": CT.ui.roleDiscardFor = null; CT.ui.roleDiscardRevealed = false; CT.ui.afterDiscard = null; CT.render(); break;
    case "view-private":
      if (CT.isOnline() && el.dataset.id !== CT.myId()) break;
      CT.ui.privateFor = el.dataset.id; CT.ui.privateRevealed = CT.isOnline(); CT.render(); break;
    case "reveal-private-view": CT.ui.privateRevealed = true; CT.render(); break;
    case "close-private": CT.ui.privateFor = null; CT.ui.privateRevealed = false; CT.render(); break;
    case "play-card": {
      var pid = CT.ui.privateFor || CT.myId();
      var msg = { type: "playCard", cardId: el.dataset.id };
      if (CT.netAction(msg)) { CT.ui.playCard = null; break; }
      handlePlayCardResult(CT.playActionCard(pid, el.dataset.id));
      CT.render(); break;
    }
    case "play-card-prompt":
      CT.ui.playCard = { playerId: CT.ui.privateFor || CT.myId(), cardId: el.dataset.id };
      CT.render(); break;
    case "close-play-card": CT.ui.playCard = null; CT.render(); break;
    case "confirm-play-card": {
      var u = CT.ui.playCard;
      if (!u) break;
      var fx = CT.AUTO_PLAY[u.cardId] || {};
      var payload = { type: "playCard", cardId: u.cardId };
      if (fx.needsTarget) {
        var ts = document.getElementById("play-target");
        if (ts) payload.targetId = ts.value;
      }
      if (fx.optionalTarget) {
        var als = document.getElementById("play-target");
        if (als && als.value) payload.targetId = als.value;
      }
      if (fx.needsDeck) {
        var ds = document.getElementById("play-deck");
        if (ds) payload.deckName = ds.value;
      }
      if (fx.needsLocation) {
        var ls = document.getElementById("play-location");
        if (ls) payload.locationId = ls.value;
      }
      if (fx.needsDiscardCard) {
        var ps = document.getElementById("play-discard");
        if (ps) payload.discardCardId = ps.value;
      }
      if (CT.netAction(payload)) { CT.ui.playCard = null; break; }
      handlePlayCardResult(CT.playActionCard(u.playerId, u.cardId, {
        targetId: payload.targetId, locationId: payload.locationId, deckName: payload.deckName,
        discardCardId: payload.discardCardId,
      }));
      CT.ui.playCard = null;
      CT.render(); break;
    }
    case "export-report":
      if (CT.isOnline()) {
        fetch("/dethrone/api/rooms/" + CT.net.routeCode + "/report").then(function (r) { return r.json(); })
          .then(function (d) {
            var blob = new Blob([d.markdown], { type: "text/markdown" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url; a.download = d.filename || "report.md";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
          }).catch(function () { CT.showToast("Could not export report."); });
      } else {
        CT.downloadPlaytestReport();
      }
      break;
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
  if (act.indexOf("h-") === 0) { CT.helpers.handle(act, el); return; }
  if (act === "toggle-spectators") {
    if (CT.isHost()) CT.net.send({ type: "setAllowSpectators", allow: el.checked });
    return;
  }
  if (act === "move-player") {
    if (CT.netAction({ type: "movePlayer", playerId: el.dataset.id, locationId: el.value })) return;
    CT.movePlayer(el.dataset.id, el.value, true); CT.render();
  }
};
CT.handleInput = function (act, el) {
  if (act.indexOf("bal-") === 0) {
    var bal = CT.readBalanceFromUI();
    if (CT.isOnline() && CT.isHost()) {
      clearTimeout(CT._balTimer);
      CT._balTimer = setTimeout(function () { CT.net.send({ type: "setBalance", balance: bal }); }, 300);
    } else if (CT.testMode) {
      CT.pendingBalance = bal;
      if (CT.state) CT.state.balance = Object.assign({}, bal);
    }
    return;
  }
  if (act === "lobby-name") {
    CT.net.saveName(el.value);
    CT.net.queueRename(el.value);
    return;
  }
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
  try { CT.testMode = localStorage.getItem(CT.TESTMODE_KEY) === "1"; } catch (e) {}
  if (CT.net) CT.net.init();
  else CT.load();
  CT.render();
});
