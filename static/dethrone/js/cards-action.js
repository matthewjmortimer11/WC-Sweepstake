/* The Cursed Throne — action card stubs (V3b deck chrome, no art yet). */
window.CT = window.CT || {};

CT.DECK_ACCENT = {
  Market: "#5b4c38",
  Tavern: "#5b4c38",
  Knowledge: "#2a2014",
  Barracks: "#4a5568",
  Graveyard: "#6b2420",
  Royal: "#8c2f23",
};

CT.TIMING_META = {
  OnTurn: { icon: "⚡", label: "On turn" },
  Movement: { icon: "🚶", label: "Move" },
  Reaction: { icon: "🛡", label: "Reaction" },
  Duel: { icon: "⚔", label: "Duel" },
  Vote: { icon: "⚖", label: "Vote" },
  Manual: { icon: "✦", label: "Manual" },
  Other: { icon: "·", label: "Other" },
};

CT.deckAccent = function (deck) {
  return CT.DECK_ACCENT[deck] || CT.DECK_ACCENT.Market;
};

CT.timingMeta = function (timing) {
  return CT.TIMING_META[timing] || CT.TIMING_META.Other;
};

/* Player whose hand we show on this device (null for spectators). */
CT.handPlayer = function () {
  if (CT.isSpectator && CT.isSpectator()) return null;
  if (CT.isOnline && CT.isOnline()) {
    var id = CT.myId && CT.myId();
    return id ? CT.playerById(id) : null;
  }
  return CT.activePlayer ? CT.activePlayer() : null;
};

CT.actionCardPlayState = function (cardId, player) {
  if (!player || !cardId) return { playable: false, badge: "", mode: "", kind: "none" };
  var c = CT.cardById(cardId);
  if (!c) return { playable: false, badge: "", mode: "", kind: "none" };

  var ap = CT.activePlayer && CT.activePlayer();
  var onTurn = ap && ap.id === player.id && player.status === "active" && !CT.state.winner;

  if (onTurn) {
    var fx = CT.AUTO_PLAY && CT.AUTO_PLAY[cardId];
    if (fx) {
      if (fx.atLocation && player.location !== fx.atLocation) {
        return { playable: false, badge: "Here only", mode: "", kind: "location" };
      }
      var mode = (fx.needsTarget || fx.needsLocation || fx.needsDeck || fx.needsDiscardCard || fx.optionalTarget)
        ? "prompt" : "play";
      return { playable: true, badge: mode === "prompt" ? "Play…" : "Play", mode: mode, kind: "play" };
    }
    if (CT.PROACTIVE_REACTIONS && CT.PROACTIVE_REACTIONS[cardId]) {
      return { playable: true, badge: "Play now", mode: "play", kind: "reaction-proactive" };
    }
  }

  var t = c.timing || "Other";
  if (t === "Reaction") return { playable: false, badge: "When targeted", mode: "", kind: "reaction" };
  if (t === "Duel") return { playable: false, badge: "In duel", mode: "", kind: "duel" };
  if (t === "Vote") return { playable: false, badge: "In vote", mode: "", kind: "vote" };
  if (!onTurn) return { playable: false, badge: "Wait", mode: "", kind: "wait" };
  if (c.requiresManualResolution !== false) {
    return { playable: false, badge: "Manual", mode: "", kind: "manual" };
  }
  return { playable: false, badge: "", mode: "", kind: "other" };
};

CT.actionCardStubHtml = function (cardId, player, opts) {
  opts = opts || {};
  var c = CT.cardById(cardId);
  if (!c) return "";

  var accent = CT.deckAccent(c.deck);
  var meta = CT.timingMeta(c.timing === "Manual" ? "Manual" : (c.timing || "Other"));
  var state = CT.actionCardPlayState(cardId, player);
  var compact = !!opts.compact;
  var showEffect = opts.showEffect !== false && !compact;
  var showBadge = opts.showBadge !== false;

  var cls = "action-stub" + (compact ? " action-stub--compact" : " action-stub--full");
  if (state.playable) cls += " action-stub--playable";
  if (opts.selected) cls += " action-stub--selected";

  var badge = "";
  if (showBadge && state.badge) {
    badge = '<span class="action-stub__badge' + (state.playable ? " action-stub__badge--play" : "") + '">'
      + CT.esc(state.badge) + "</span>";
  }

  var playAct = "";
  if (state.playable && opts.interactive !== false) {
    playAct = state.mode === "prompt" ? "play-card-prompt" : "play-card";
  }

  var inner = '<div class="action-stub__frame" style="--stub-deck:' + accent + '">'
    + '<div class="action-stub__body">'
    + '<span class="action-stub__timing" title="' + CT.esc(meta.label) + '">' + meta.icon + "</span>"
    + '<div class="action-stub__name">' + CT.esc(c.name) + "</div>"
    + (showEffect ? '<div class="action-stub__effect">' + CT.esc(c.effect) + "</div>" : "")
    + badge
    + "</div>"
    + '<footer class="action-stub__foot">' + CT.esc(c.deck) + "</footer>"
    + "</div>";

  if (playAct) {
    return '<button type="button" class="' + cls + '" data-act="' + playAct + '" data-id="' + cardId + '"'
      + ' aria-label="' + CT.esc(c.name) + ' — ' + CT.esc(state.badge) + '">' + inner + "</button>";
  }
  if (opts.interactive === false) {
    return '<article class="' + cls + '">' + inner + "</article>";
  }
  return '<button type="button" class="' + cls + '" data-act="hand-card-focus" data-id="' + cardId + '"'
    + ' aria-label="' + CT.esc(c.name) + '">' + inner + "</button>";
};

CT.actionCardRowHtml = function (cardId, player, opts) {
  opts = opts || {};
  var c = CT.cardById(cardId);
  if (!c) return "";
  var state = CT.actionCardPlayState(cardId, player);
  var stub = CT.actionCardStubHtml(cardId, player, { compact: false, showEffect: true, interactive: false });
  var playBtn = "";
  if (state.playable && opts.showPlay !== false) {
    var act = state.mode === "prompt" ? "play-card-prompt" : "play-card";
    playBtn = '<button type="button" class="btn btn-primary btn-sm action-row__play" data-act="' + act
      + '" data-id="' + cardId + '">' + CT.esc(state.badge) + "</button>";
  } else if (state.badge) {
    playBtn = '<span class="tag' + (state.kind === "reaction" ? " wax" : "") + '" style="font-size:11px">'
      + CT.esc(state.badge) + "</span>";
  }
  return '<div class="action-row">' + stub + '<div class="action-row__side">' + playBtn + "</div></div>";
};

CT.handStripHtml = function (player, opts) {
  opts = opts || {};
  if (!player) return "";
  var limit = CT.getRules().HAND_LIMIT;
  var ids = player.actionCardIds || [];
  var cards = ids.map(function (id) {
    return CT.actionCardStubHtml(id, player, { compact: true });
  }).join("");

  if (!cards) {
    cards = '<p class="hand-strip__empty">No action cards — buy at Market or draw from location actions.</p>';
  }

  return '<div class="hand-strip">'
    + '<div class="hand-strip__head">'
    + '<span class="hand-strip__title">Your hand</span>'
    + '<span class="hand-strip__count">' + ids.length + "/" + limit + "</span>"
    + '<button type="button" class="btn btn-ghost btn-sm hand-strip__more" data-act="play-tab" data-tab="hand">All cards</button>'
    + "</div>"
    + '<div class="hand-strip__scroll" role="list">' + cards + "</div>"
    + "</div>";
};

CT.handGridHtml = function (player, opts) {
  opts = opts || {};
  if (!player) return '<p class="muted">No hand to show.</p>';
  var groups = { OnTurn: [], Movement: [], Reaction: [], Duel: [], Vote: [], Other: [] };
  (player.actionCardIds || []).forEach(function (id) {
    var c = CT.cardById(id);
    if (!c) return;
    var t = c.timing || "Other";
    if (t === "Manual") t = "Other";
    if (!groups[t]) t = "Other";
    groups[t].push(id);
  });

  var body = "";
  ["OnTurn", "Movement", "Reaction", "Duel", "Vote", "Other"].forEach(function (g) {
    if (!groups[g].length) return;
    body += '<div class="eyebrow" style="margin:14px 0 8px">' + g + "</div>"
      + '<div class="hand-grid">' + groups[g].map(function (id) {
        return CT.actionCardRowHtml(id, player, opts);
      }).join("") + "</div>";
  });
  if (!body) body = '<p class="muted">No action cards in hand.</p>';
  return body;
};
