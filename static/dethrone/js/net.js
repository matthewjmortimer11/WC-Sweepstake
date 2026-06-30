/* The Cursed Throne — online multiplayer (WebSocket) */
window.CT = window.CT || {};
CT.net = {
  online: false,
  localMode: false,
  spectator: false,
  connected: false,
  room: null,
  you: null,
  routeCode: null,
  error: null,
  ws: null,
  reconnectTimer: null,
  reconnectDelay: 800,
  pingTimer: null,
  renameTimer: null,
};

CT.net.LS = { pid: "dethrone.pid", spectatorPid: "dethrone.spectator.pid", name: "dethrone.name" };

CT.net.pid = function () {
  var key = CT.net.spectator ? CT.net.LS.spectatorPid : CT.net.LS.pid;
  try {
    var id = localStorage.getItem(key);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).replace(/-/g, "");
      localStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return "p-" + Math.random().toString(36).slice(2, 12);
  }
};

CT.net.playerName = function () {
  try { return (localStorage.getItem(CT.net.LS.name) || "").trim(); } catch (e) { return ""; }
};

CT.net.saveName = function (n) {
  try { localStorage.setItem(CT.net.LS.name, n); } catch (e) {}
};

CT.net.parseRoute = function () {
  CT.net.localMode = /^#\/local\b/i.test(location.hash || "");
  var watch = (location.hash || "").match(/^#\/(?:room\/([A-Za-z0-9]+)\/watch|watch\/([A-Za-z0-9]+))/i);
  var m = (location.hash || "").match(/^#\/room\/([A-Za-z0-9]+)/i);
  CT.net.spectator = !!watch;
  CT.net.routeCode = CT.net.localMode ? null : (watch ? (watch[1] || watch[2]).toUpperCase() : (m ? m[1].toUpperCase() : null));
  CT.net.online = !!CT.net.routeCode;
};

CT.net.readNameFromUrl = function () {
  try {
    var n = (new URLSearchParams(location.search).get("name") || "").trim();
    if (n) CT.net.saveName(n);
  } catch (e) {}
};

CT.net.toast = function (msg) {
  if (typeof CT.showToast === "function") CT.showToast(msg);
  else if (msg) console.warn(msg);
};

CT.net.send = function (msg) {
  if (CT.net.ws && CT.net.ws.readyState === WebSocket.OPEN) {
    CT.net.ws.send(JSON.stringify(msg));
    return true;
  }
  CT.net.toast("Not connected — wait a moment and try again.");
  return false;
};

CT.net.queueRename = function (name) {
  clearTimeout(CT.net.renameTimer);
  CT.net.renameTimer = setTimeout(function () {
    if (name) CT.net.send({ type: "rename", name: name });
  }, 250);
};

CT.net.applyState = function (msg) {
  CT.net.room = msg.room;
  CT.net.you = msg.you;
  CT.net.error = null;
  var cs = msg.room && msg.room.clientState;
  if (cs) {
    CT.state = cs;
    CT.state.phase = cs.phase || "play";
    if (cs.pendingKeepOne && CT.myId()) {
      CT.ui.keepOne = { playerId: CT.myId(), deck: cs.pendingKeepOne.deck, cards: cs.pendingKeepOne.cards };
    } else if (!cs.pendingKeepOne) {
      CT.ui.keepOne = null;
    }
    if (cs.pendingUiAction && CT.myId() && CT.helpers && !CT.helpers.ui.open) {
      var pui = cs.pendingUiAction;
      if (pui.kind === "duel") CT.helpers.openDuelFromPending(pui);
      else if (pui.kind === "royal_command") CT.helpers.openRoyalCommandFromPending(pui);
      else if (pui.kind === "deep_research") CT.helpers.openDeepResearchFromPending(pui);
    }
    if (cs.privateNote && CT.myId()) {
      CT.ui.privateNote = cs.privateNote;
    }
    if (cs.pendingRoleDiscard && CT.myId()) {
      CT.ui.roleDiscardFor = CT.myId();
      CT.ui.roleDiscardRevealed = true;
    } else if (!cs.pendingRoleDiscard || CT.ui.roleDiscardFor === CT.myId()) {
      if (!CT.ui.roleDiscardFor || CT.ui.roleDiscardFor === CT.myId()) {
        if (!cs.pendingRoleDiscard) {
          CT.ui.roleDiscardFor = null;
          CT.ui.roleDiscardRevealed = false;
        }
      }
    }
    var ap = cs.players && cs.players[cs.activePlayerIndex];
    if (ap && ap.id === CT.myId() && ap.actionCardIds && ap.actionCardIds.length > CT.getRules().HAND_LIMIT) {
      if (CT.net._lastActiveId !== ap.id) {
        CT.net._lastActiveId = ap.id;
        CT.showToast("Discard to " + CT.getRules().HAND_LIMIT + " cards before ending your turn.");
      }
    } else if (!ap || ap.id !== CT.myId()) {
      CT.net._lastActiveId = null;
    }
  } else if (!CT.net.localMode && msg.room && msg.room.game && msg.room.game.status === "lobby") {
    CT.state = null;
  }
  CT.render();
};

CT.net.startPing = function () {
  clearInterval(CT.net.pingTimer);
  CT.net.pingTimer = setInterval(function () { CT.net.send({ type: "ping" }); }, 25000);
};

CT.net.connect = function (code) {
  if (CT.net.ws) { try { CT.net.ws.close(); } catch (e) {} CT.net.ws = null; }
  clearInterval(CT.net.pingTimer);
  var proto = location.protocol === "https:" ? "wss:" : "ws:";
  var url = proto + "//" + location.host + "/dethrone/ws/" + code
    + "?pid=" + encodeURIComponent(CT.net.pid())
    + "&name=" + encodeURIComponent(CT.net.playerName())
    + (CT.net.spectator ? "&spectate=1" : "");
  CT.net.ws = new WebSocket(url);
  CT.net.ws.onopen = function () {
    CT.net.connected = true;
    CT.net.reconnectDelay = 800;
    CT.net.startPing();
    CT.render();
  };
  CT.net.ws.onmessage = function (ev) {
    var msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type === "hello") {
      CT.net.routeCode = msg.code;
      CT.net.spectator = !!msg.spectator;
      var hashPath = CT.net.spectator ? "#/room/" + msg.code + "/watch" : "#/room/" + msg.code;
      if (location.hash.indexOf("/room/") === -1 && location.hash.indexOf("/watch/") === -1) {
        history.replaceState(null, "", hashPath);
      }
      return;
    }
    if (msg.type === "state") { CT.net.applyState(msg); return; }
    if (msg.type === "error") { CT.net.toast(msg.message || "Error"); return; }
    if (msg.type === "fatal") {
      CT.net.error = msg.message || "Disconnected";
      CT.net.connected = false;
      CT.render();
    }
  };
  CT.net.ws.onclose = function () {
    CT.net.connected = false;
    clearInterval(CT.net.pingTimer);
    if (CT.net.error) return;
    CT.net.toast("Connection lost — reconnecting…");
    CT.render();
    clearTimeout(CT.net.reconnectTimer);
    CT.net.reconnectTimer = setTimeout(function () {
      CT.net.reconnectDelay = Math.min(CT.net.reconnectDelay * 1.5, 8000);
      if (CT.net.routeCode) CT.net.connect(CT.net.routeCode);
    }, CT.net.reconnectDelay);
  };
};

CT.net.createRoom = function (playerCount, cb) {
  fetch("/dethrone/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerCount: playerCount || 5 }),
  }).then(function (r) { return r.json(); }).then(function (data) {
    if (!data.code) throw new Error("No room code");
    location.hash = "#/room/" + data.code;
    CT.net.parseRoute();
    CT.net.connect(data.code);
    if (cb) cb(null, data);
  }).catch(function (e) {
    CT.net.toast("Could not create room.");
    if (cb) cb(e);
  });
};

CT.net.goLocal = function () {
  CT.net.localMode = true;
  CT.net.online = false;
  CT.net.routeCode = null;
  if (CT.net.ws) { try { CT.net.ws.close(); } catch (e) {} }
  location.hash = "#/local";
  CT.load();
  CT.render();
};

CT.net.watchInviteUrl = function () {
  var base = location.origin + location.pathname;
  var name = CT.net.playerName();
  return base + "#/room/" + (CT.net.routeCode || "") + "/watch" + (name ? "?name=" + encodeURIComponent(name) : "");
};

CT.net.copyWatchInvite = function () {
  var url = CT.net.watchInviteUrl();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { CT.net.toast("Watch link copied!"); });
  } else {
    prompt("Share this watch link:", url);
  }
};

CT.net.inviteUrl = function () {
  var base = location.origin + location.pathname;
  var name = CT.net.playerName();
  return base + "#/room/" + (CT.net.routeCode || "") + (name ? "?name=" + encodeURIComponent(name) : "");
};

CT.net.copyInvite = function () {
  var url = CT.net.inviteUrl();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { CT.net.toast("Invite link copied!"); });
  } else {
    prompt("Share this link:", url);
  }
};

CT.net.init = function () {
  CT.net.readNameFromUrl();
  CT.net.parseRoute();
  if (CT.net.routeCode) {
    CT.net.online = true;
    CT.net.localMode = false;
    CT.net.connect(CT.net.routeCode);
  } else if (CT.net.localMode) {
    CT.net.online = false;
    CT.load();
  }
};

window.addEventListener("hashchange", function () {
  var prev = CT.net.routeCode;
  CT.net.parseRoute();
  if (CT.net.routeCode && CT.net.routeCode !== prev) CT.net.connect(CT.net.routeCode);
});
