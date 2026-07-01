/* The Cursed Throne — action card stubs (V3b deck chrome + full-deck vignettes). */
window.CT = window.CT || {};

CT.ACTION_CARD_VERSION = window.__DETHRONE_CARD_V || "20260630-p32";

CT.actionCardUrl = function (cardId, opts) {
  opts = opts || {};
  if (!cardId) return "";
  var v = opts.v != null ? opts.v : CT.ACTION_CARD_VERSION;
  return "cards/action/action-" + cardId + "-v3b.jpg" + (v ? "?v=" + encodeURIComponent(v) : "");
};

CT.actionCardArtHtml = function (cardId, opts) {
  opts = opts || {};
  var url = CT.actionCardUrl(cardId, opts);
  if (!url) return "";
  var c = CT.cardById(cardId);
  var alt = opts.alt || (c ? c.name + " action card" : "Action card");
  var cls = "action-stub__art-img" + (opts.compact ? " action-stub__art-img--compact" : "");
  return '<img class="' + cls + '" src="' + url + '" alt="' + CT.esc(alt)
    + '" loading="lazy" decoding="async">';
};

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

  if (CT.DUEL_CARD_VALUES && CT.DUEL_CARD_VALUES[cardId]) {
    return { playable: false, badge: "+" + CT.DUEL_CARD_VALUES[cardId] + " duel", mode: "", kind: "duel" };
  }
  if (CT.VOTE_CARD_BONUSES && CT.VOTE_CARD_BONUSES[cardId]) {
    return { playable: false, badge: "+" + CT.VOTE_CARD_BONUSES[cardId] + " vote", mode: "", kind: "vote" };
  }

  if (onTurn) {
    var fx = CT.AUTO_PLAY && CT.AUTO_PLAY[cardId];
    if (fx) {
      if (fx.atLocation && player.location !== fx.atLocation) {
        var need = CT.locationById && CT.locationById(fx.atLocation);
        return { playable: false, badge: need ? "At " + need.name : "Wrong site", mode: "", kind: "location" };
      }
      if (cardId === "bought_round" && player.gold < 1) {
        return { playable: false, badge: "Need 1g", mode: "", kind: "gold" };
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
  if (opts.pulse) cls += " action-stub--pulse";
  if (state.kind === "duel") cls += " action-stub--duel";
  if (state.kind === "vote") cls += " action-stub--vote";

  var badge = "";
  if (showBadge && state.badge) {
    badge = '<span class="action-stub__badge' + (state.playable ? " action-stub__badge--play" : "") + '">'
      + CT.esc(state.badge) + "</span>";
  }

  var playAct = "";
  if (state.playable && opts.interactive !== false) {
    playAct = state.mode === "prompt" ? "play-card-prompt" : "play-card";
  }

  var art = CT.actionCardArtHtml(cardId, { compact: compact });
  var artBlock = art ? '<div class="action-stub__art">' + art + "</div>" : "";

  var inner = '<div class="action-stub__frame" style="--stub-deck:' + accent + '">'
    + artBlock
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
  var ids = (player.actionCardIds || []).slice();
  ids.sort(function (a, b) {
    var pa = CT.actionCardPlayState(a, player).playable ? 0 : 1;
    var pb = CT.actionCardPlayState(b, player).playable ? 0 : 1;
    return pa - pb;
  });
  var pulseId = opts.pulseCardId;
  var cards = ids.map(function (id) {
    return CT.actionCardStubHtml(id, player, { compact: true, pulse: pulseId === id });
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

/* Private toast when this device draws a card (never leaks to others). */
CT.notifyCardDraw = function (playerId, cardId) {
  if (!cardId) return;
  var hp = CT.handPlayer && CT.handPlayer();
  if (!hp || hp.id !== playerId) return;
  var c = CT.cardById(cardId);
  if (!c) return;
  CT.ui = CT.ui || {};
  CT.ui.handPulseCard = cardId;
  if (typeof CT.showToast === "function") {
    CT.showToast("Drew " + c.name);
  }
  if (typeof CT.render === "function") CT.render();
  if (CT.ui._handPulseTimer) clearTimeout(CT.ui._handPulseTimer);
  CT.ui._handPulseTimer = setTimeout(function () {
    CT.ui.handPulseCard = null;
    if (typeof CT.render === "function") CT.render();
  }, 1600);
};

CT.duelCardPickerHtml = function (player, selected, side) {
  if (!player || !CT.DUEL_CARD_VALUES) {
    return '<p class="helper-hand-empty">No duel cards in hand.</p>';
  }
  var cards = player.actionCardIds.filter(function (id) { return CT.DUEL_CARD_VALUES[id]; });
  if (!cards.length) return '<p class="helper-hand-empty">No duel cards in hand.</p>';
  return '<div class="helper-hand-picker">' + cards.map(function (id) {
    var on = (selected || []).indexOf(id) !== -1;
    var val = CT.DUEL_CARD_VALUES[id];
    var stub = CT.actionCardStubHtml(id, player, { compact: true, showBadge: false, interactive: false, selected: on });
    return '<label class="helper-hand-pick' + (on ? " helper-hand-pick--on" : "") + '">'
      + '<input type="checkbox" data-act="h-d-duelcard" data-side="' + side + '" data-id="' + id + '" style="width:auto"'
      + (on ? " checked" : "") + ">"
      + stub
      + '<span class="helper-hand-pick__val">+' + val + "</span></label>";
  }).join("") + "</div>";
};

CT.voteCardRowHtml = function (player, cardId, used) {
  if (!player || !cardId || used) return "";
  var c = CT.cardById(cardId);
  var bonus = (CT.VOTE_CARD_BONUSES && CT.VOTE_CARD_BONUSES[cardId]) || 0;
  var stub = CT.actionCardStubHtml(cardId, player, { compact: true, showBadge: false, interactive: false });
  return '<div class="helper-vote-card">'
    + stub
    + '<div class="helper-vote-card__btns">'
    + '<button type="button" class="btn btn-sm btn-primary" data-act="h-v-playcard" data-pid="' + player.id
    + '" data-id="' + cardId + '" data-side="yes">+Yes (' + bonus + ")</button>"
    + '<button type="button" class="btn btn-sm btn-danger" data-act="h-v-playcard" data-pid="' + player.id
    + '" data-id="' + cardId + '" data-side="no">+No (' + bonus + ")</button>"
    + "</div></div>";
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

CT.countPlayableCards = function (player) {
  if (!player || !player.actionCardIds) return 0;
  return player.actionCardIds.filter(function (id) {
    return CT.actionCardPlayState(id, player).playable;
  }).length;
};

CT.deckArchivesHtml = function (player) {
  if (!player || !CT.DECK_NAMES || !CT.state) return "";
  var ap = CT.activePlayer && CT.activePlayer();
  var onTurn = ap && ap.id === player.id && player.status === "active" && !CT.state.winner;
  var atScrolls = player.location === "scrolls";
  var canPeek = onTurn && atScrolls && !CT.isSpectator();

  var rows = CT.DECK_NAMES.map(function (deck) {
    var drawN = (CT.state.decks[deck] && CT.state.decks[deck].length) || 0;
    var discN = (CT.state.discards[deck] && CT.state.discards[deck].length) || 0;
    var peekBtns = canPeek
      ? '<span class="deck-archives__peek">'
        + '<button type="button" class="btn btn-ghost btn-sm" data-act="archive-peek" data-mode="deck_top" data-deck="' + deck + '">Draw</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-act="archive-peek" data-mode="discard_top" data-deck="' + deck + '">Discard</button>'
        + "</span>"
      : "";
    return '<div class="deck-archives__row">'
      + '<span class="deck-archives__name">' + CT.esc(deck) + "</span>"
      + '<span class="deck-archives__counts">' + drawN + " draw · " + discN + " disc</span>"
      + peekBtns
      + "</div>";
  }).join("");

  var hint = canPeek
    ? "At the Scrolls on your turn — peek is private to you."
    : (atScrolls ? "Peek unlocks on your turn at the Scrolls." : "Visit the Scrolls on your turn to peek decks.");

  return '<div class="deck-archives">'
    + '<h3 class="deck-archives__title">Archives</h3>'
    + '<p class="deck-archives__hint">' + hint + "</p>"
    + rows
    + "</div>";
};

CT.hiddenRolePowersHtml = function (player) {
  if (!player || !player.hiddenRoleIds || !player.hiddenRoleIds.length) return "";
  var blocks = player.hiddenRoleIds.map(function (rid) {
    var role = CT.roleById(rid);
    if (!role || !role.abilities || !role.abilities.length) return "";
    var items = role.abilities.map(function (a) {
      var where = a.location ? " @ " + a.location : "";
      return "<li><strong>" + CT.esc(a.name) + "</strong>" + where + " — " + CT.esc(a.effect) + "</li>";
    }).join("");
    return '<div class="role-powers__block"><div class="role-powers__role">' + CT.esc(role.name) + "</div><ul>" + items + "</ul></div>";
  }).join("");
  if (!blocks) return "";
  return '<div class="role-powers"><h3 class="role-powers__title">Hidden role powers</h3>' + blocks + "</div>";
};

/* Parley shortcuts for manual-timing cards (Phase 22). */
CT.MANUAL_CARD_HELPERS = {
  bribe: { helper: "h-open-vote", label: "Open vote helper" },
  hidden_witness: { helper: "h-open-vote", label: "Open vote helper" },
  crown_witness: { helper: "h-open-vote", label: "Open vote helper" },
  disarm_card: { helper: "h-open-duel", label: "Open duel helper" },
  challenged_again: { helper: "h-open-duel", label: "Open duel helper" },
  blood_contract: { helper: "h-open-contract", label: "Open blood contract" },
};

CT.privateNoteBannerHtml = function (player) {
  if (!CT.ui || !CT.ui.privateNote) return "";
  var cardId = CT.ui.privateNoteCardId;
  var stub = cardId
    ? CT.actionCardStubHtml(cardId, player, { compact: false, showEffect: false, interactive: false })
    : "";
  return '<div class="private-note-banner hand-tab-panel__note" role="status">'
    + (stub ? '<div class="private-note-banner__card">' + stub + "</div>" : "")
    + '<p class="private-note-banner__text">' + CT.esc(CT.ui.privateNote) + "</p>"
    + '<button type="button" class="btn btn-ghost btn-sm" data-act="clear-private-note">Dismiss</button>'
    + "</div>";
};

CT.reactionCardPickerHtml = function (player, cardIds) {
  if (!cardIds || !cardIds.length) return "";
  return '<div class="reaction-card-picker">' + cardIds.map(function (id) {
    return '<button type="button" class="reaction-card-pick" data-act="play-reaction" data-id="' + id + '">'
      + CT.actionCardStubHtml(id, player, { compact: true, showBadge: false, interactive: false })
      + "</button>";
  }).join("") + "</div>";
};

CT.fenceCardPickerHtml = function (player, excludeId, selectedId) {
  if (!player) return "";
  var ids = (player.actionCardIds || []).filter(function (id) { return id !== excludeId; });
  if (!ids.length) return '<p class="muted">No other cards to sell.</p>';
  return '<div class="fence-card-picker">' + ids.map(function (id) {
    var on = selectedId === id;
    return '<button type="button" class="fence-card-pick' + (on ? " fence-card-pick--on" : "") + '"'
      + ' data-act="play-fence-pick" data-id="' + id + '">'
      + CT.actionCardStubHtml(id, player, { compact: true, showBadge: false, interactive: false, selected: on })
      + "</button>";
  }).join("") + "</div>";
};

CT.actionCardFocusModalHtml = function (cardId, player) {
  if (!cardId || !player) return "";
  var state = CT.actionCardPlayState(cardId, player);
  var stub = CT.actionCardStubHtml(cardId, player, { compact: false, showEffect: true, interactive: false });
  var helper = CT.MANUAL_CARD_HELPERS[cardId];
  var helperBtn = helper
    ? '<button type="button" class="btn btn-primary" data-act="manual-card-helper" data-helper="' + helper.helper + '">'
      + CT.esc(helper.label) + "</button>"
    : "";
  var hint;
  if (state.playable) hint = "This card is playable — use the Play button on the card.";
  else if (state.kind === "reaction") hint = "Play when a reaction prompt targets you.";
  else if (state.kind === "duel") hint = "Add this card from your hand during a duel.";
  else if (state.kind === "vote") hint = "Play during a formal vote tally.";
  else if (state.kind === "wait") hint = "Wait for your turn to play this card.";
  else if (state.kind === "manual") hint = "Resolve with table talk — use a Parley helper if one applies.";
  else hint = "Read the effect and resolve at the table.";
  return '<div class="scrim"><div class="modal modal--action-card">'
    + '<div class="action-card-focus">' + stub
    + '<p class="action-card-focus__hint">' + CT.esc(hint) + "</p>"
    + '<div class="btn-row" style="margin-top:14px">' + helperBtn
    + '<button type="button" class="btn btn-ghost" data-act="close-action-focus">Close</button>'
    + "</div></div></div></div>";
};
