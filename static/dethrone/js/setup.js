/* The Cursed Throne — setup wizard + pass-and-play dealing (§8) */
window.CT = window.CT || {};

CT.setup = {
  active: false,
  step: "count",      // count | names | private | first
  count: 5,
  names: [],
  bots: [],           // [bool, ...] — true = computer-controlled (testing)
  dealt: [],          // [[roleId x3], ...]
  publicChoice: [],   // [roleId | null, ...]
  hidden: [],         // [[roleId x2], ...]
  undealt: [],        // role ids not dealt
  privateIndex: 0,
  privateRevealed: false,
  firstMode: "random",
  firstPlayerIndex: 0,
};

CT.setup.begin = function () {
  CT.setup.active = true;
  CT.setup.step = "count";
  CT.setup.names = ["", "", "", "", "", ""];
  // default to a proper game: everyone human (flip seats to Bot to test solo)
  CT.setup.bots = [false, false, false, false, false, false];
  CT.render();
};

/* first human seat at or after `from` (-1 if none) */
CT.setup.firstHumanFrom = function (from) {
  for (var i = from; i < CT.setup.count; i++) if (!CT.setup.bots[i]) return i;
  return -1;
};

/* deal exactly 3 to each, always one Cursed One (§8) */
CT.setup.deal = function () {
  var n = CT.setup.count;
  var others = CT.ROLES.filter(function (r) { return r.id !== "cursedone"; }).map(function (r) { return r.id; });
  var pool = ["cursedone"].concat(CT.util.shuffle(others).slice(0, n * 3 - 1));
  pool = CT.util.shuffle(pool);
  CT.setup.dealt = [];
  for (var i = 0; i < n; i++) CT.setup.dealt.push(pool.slice(i * 3, i * 3 + 3));
  CT.setup.publicChoice = new Array(n).fill(null);
  CT.setup.hidden = new Array(n).fill(null);
  CT.setup.undealt = CT.ROLES.map(function (r) { return r.id; }).filter(function (id) { return pool.indexOf(id) === -1; });
  // bots auto-pick their public role (first card that can be public) — no pass-and-play for them
  for (var b = 0; b < n; b++) {
    if (CT.setup.bots[b]) {
      CT.setup.publicChoice[b] = CT.setup.dealt[b].filter(function (id) { return CT.roleById(id).canBePublic; })[0];
    }
  }
  CT.setup.privateIndex = CT.setup.firstHumanFrom(0);
  CT.setup.privateRevealed = false;
};

/* finalise -> create the live game */
CT.setup.finish = function () {
  var n = CT.setup.count;
  // starting action cards: 2 each, drawn without replacement from shuffled pool (§8.8)
  var deck = CT.util.shuffle(CT.ACTION_CARDS.map(function (c) { return c.id; }));
  var startingByPlayer = {};
  for (var i = 0; i < n; i++) startingByPlayer[i] = deck.splice(0, 2);

  var playersInput = [];
  for (var j = 0; j < n; j++) {
    var pub = CT.setup.publicChoice[j];
    var hid = CT.setup.dealt[j].filter(function (id) { return id !== pub; });
    playersInput.push({ name: CT.setup.names[j].trim() || ("Player " + (j + 1)), isBot: !!CT.setup.bots[j], dealtRoleIds: CT.setup.dealt[j], publicRoleId: pub, hiddenRoleIds: hid });
  }
  var first = CT.setup.firstMode === "random" ? Math.floor(Math.random() * n) : CT.setup.firstPlayerIndex;
  CT.newGame(playersInput, CT.setup.undealt, startingByPlayer, first);
  CT.setup.active = false;
  CT.render();
};

/* ---------- views (return HTML strings) ---------- */
CT.setup.view = function () {
  switch (CT.setup.step) {
    case "count":   return CT.setup.viewCount();
    case "names":   return CT.setup.viewNames();
    case "private": return CT.setup.viewPrivate();
    case "first":   return CT.setup.viewFirst();
  }
  return "";
};

CT.setup.viewCount = function () {
  var s = CT.setup, opts = [4, 5, 6].map(function (c) {
    return '<button class="" aria-pressed="' + (s.count === c) + '" data-act="count" data-n="' + c + '">' + c + '</button>';
  }).join("");
  return '<div class="panel" style="max-width:560px;margin:0 auto">'
    + '<div class="eyebrow">New game · Step 1 of 3</div>'
    + '<h1 style="margin-top:6px">How many at the table?</h1>'
    + '<hr class="rule">'
    + '<p class="muted">Best at five. Each player is dealt three role cards — one becomes public, two stay hidden, and one of you is secretly the Cursed One.</p>'
    + '<div class="seg" style="margin:16px 0">' + opts + '</div>'
    + '<div class="btn-row"><button class="btn btn-primary" data-act="to-names">Continue →</button></div>'
    + '</div>';
};

CT.setup.viewNames = function () {
  var s = CT.setup, fields = "";
  for (var i = 0; i < s.count; i++) {
    var bot = s.bots[i];
    fields += '<div class="seat-row">'
      + '<input type="text" data-act="name" data-i="' + i + '" value="' + (s.names[i] || "").replace(/"/g, "&quot;") + '" placeholder="Seat ' + (i + 1) + ' name" autocomplete="off">'
      + '<div class="seg seg-sm">'
      + '<button aria-pressed="' + (!bot) + '" data-act="seat-type" data-i="' + i + '" data-bot="0">You</button>'
      + '<button aria-pressed="' + (!!bot) + '" data-act="seat-type" data-i="' + i + '" data-bot="1">Bot</button>'
      + '</div></div>';
  }
  return '<div class="panel" style="max-width:560px;margin:0 auto">'
    + '<div class="eyebrow">New game · Step 2 of 3</div>'
    + '<h1 style="margin-top:6px">Who is playing?</h1>'
    + '<hr class="rule">'
    + '<p class="muted" style="font-size:14px;margin-top:0">Mark a seat <strong>Bot</strong> to have the computer play it — handy for testing the game solo. Bots skip private role selection.</p>'
    + fields
    + '<div class="btn-row"><button class="btn btn-ghost" data-act="back-count">← Back</button>'
    + '<div class="spacer"></div><button class="btn btn-primary" data-act="to-private">Deal roles →</button></div>'
    + '</div>';
};

CT.setup.viewPrivate = function () {
  var s = CT.setup, name = s.names[s.privateIndex].trim() || ("Player " + (s.privateIndex + 1));
  // count humans for a sensible "x of y" that ignores bot seats
  var humans = [], pos = 0;
  for (var hi = 0; hi < s.count; hi++) if (!s.bots[hi]) { humans.push(hi); if (hi === s.privateIndex) pos = humans.length; }
  var progress = "Player " + pos + " of " + humans.length;

  if (!s.privateRevealed) {
    // cover screen (§8)
    return '<div class="scrim"><div class="modal cover">'
      + '<div class="seal-big">✦</div>'
      + '<div class="eyebrow">' + progress + '</div>'
      + '<h1 style="margin:8px 0">Private setup for ' + esc(name) + '</h1>'
      + '<p class="muted">Pass the device to ' + esc(name) + ' only. Everyone else, look away.</p>'
      + '<div class="btn-row" style="justify-content:center;margin-top:20px">'
      + '<button class="btn btn-primary" data-act="reveal-private">Reveal my 3 roles</button></div>'
      + '</div></div>';
  }

  // revealed: choose public role
  var cards = s.dealt[s.privateIndex].map(function (id) {
    var role = CT.roleById(id);
    var sel = s.publicChoice[s.privateIndex] === id;
    var disabled = !role.canBePublic;
    var abilities = role.abilities.map(function (a) { return '<div style="font-size:12px;color:var(--ink-soft)"><strong>' + esc(a.name) + '</strong> — ' + esc(a.effect) + '</div>'; }).join("");
    return '<div class="pcard' + (sel ? " active" : "") + '" style="' + (disabled ? "border-color:var(--wax-soft)" : "") + '">'
      + '<div class="ptop"><div class="pname">' + esc(role.name) + '</div>'
      + '<span class="tag ' + (role.family === "Cursed" ? "wax" : "") + '">' + role.family + '</span></div>'
      + '<div class="prole">' + esc(role.flavour) + '</div>'
      + '<div class="stack" style="margin-top:10px">' + abilities + '</div>'
      + (disabled
          ? '<div class="tag wax" style="margin-top:12px">Must stay hidden — cannot be public</div>'
          : '<button class="btn ' + (sel ? "btn-gold" : "btn-secondary") + ' btn-sm" style="margin-top:12px;width:100%" data-act="choose-public" data-id="' + id + '">' + (sel ? "✓ Public role" : "Make this my public role") + '</button>')
      + '</div>';
  }).join("");

  var chosen = s.publicChoice[s.privateIndex];
  return '<div class="scrim"><div class="modal">'
    + '<div class="eyebrow">' + progress + ' · ' + esc(name) + '</div>'
    + '<h2 style="margin:6px 0 2px">Choose your public role</h2>'
    + '<p class="muted" style="margin:0 0 8px;font-size:14px">The other two stay hidden. If the Cursed One is here, it can never be public.</p>'
    + '<div class="players" style="grid-template-columns:1fr;gap:12px">' + cards + '</div>'
    + '<div class="btn-row" style="margin-top:16px"><div class="spacer"></div>'
    + '<button class="btn btn-primary" data-act="confirm-private"' + (chosen ? "" : " disabled") + '>'
    + (s.firstHumanFrom(s.privateIndex + 1) > -1 ? "Confirm & pass device →" : "Confirm — last player") + '</button></div>'
    + '</div></div>';
};

CT.setup.viewFirst = function () {
  var s = CT.setup;
  var nameOpts = s.names.map(function (nm, i) { return '<option value="' + i + '"' + (s.firstPlayerIndex === i ? " selected" : "") + '>' + esc(nm.trim() || ("Player " + (i + 1))) + '</option>'; }).join("");
  return '<div class="panel" style="max-width:560px;margin:0 auto">'
    + '<div class="eyebrow">New game · Final step</div>'
    + '<h1 style="margin-top:6px">Who acts first?</h1>'
    + '<hr class="rule">'
    + '<div class="seg" style="margin-bottom:16px">'
    + '<button aria-pressed="' + (s.firstMode === "random") + '" data-act="first-mode" data-m="random">Random</button>'
    + '<button aria-pressed="' + (s.firstMode === "choose") + '" data-act="first-mode" data-m="choose">Choose</button></div>'
    + (s.firstMode === "choose" ? '<label class="field"><span class="lbl">First player</span><select data-act="first-pick">' + nameOpts + '</select></label>' : "")
    + '<p class="muted" style="font-size:14px">Everyone starts at the Market with 2 gold and 3 Reputation. Corruption begins at 0.</p>'
    + '<div class="btn-row"><button class="btn btn-ghost" data-act="back-private">← Re-deal</button>'
    + '<div class="spacer"></div><button class="btn btn-gold" data-act="begin-game">Begin the game ✦</button></div>'
    + '</div>';
};

/* ---------- action handler ---------- */
CT.setup.handle = function (act, el) {
  var s = CT.setup;
  switch (act) {
    case "count": s.count = +el.dataset.n; CT.render(); break;
    case "to-names":
      s.names = s.names.slice(0, s.count);
      while (s.names.length < s.count) s.names.push("");
      s.step = "names"; CT.render(); break;
    case "name": s.names[+el.dataset.i] = el.value; break; // no re-render (keep focus)
    case "seat-type": s.bots[+el.dataset.i] = el.dataset.bot === "1"; CT.render(); break;
    case "back-count": s.step = "count"; CT.render(); break;
    case "to-private":
      s.deal();
      // if every seat is a bot, there's nothing to pass-and-play — go straight to first player
      s.step = (s.privateIndex === -1) ? "first" : "private";
      CT.render(); break;
    case "reveal-private": s.privateRevealed = true; CT.render(); break;
    case "choose-public": s.publicChoice[s.privateIndex] = el.dataset.id; CT.render(); break;
    case "confirm-private":
      if (!s.publicChoice[s.privateIndex]) return;
      var next = s.firstHumanFrom(s.privateIndex + 1);
      if (next > -1) { s.privateIndex = next; s.privateRevealed = false; CT.render(); }
      else { s.step = "first"; CT.render(); }
      break;
    case "back-private":
      s.privateIndex = s.firstHumanFrom(0);
      s.step = (s.privateIndex === -1) ? "first" : "private"; // all-bots: nothing to revisit
      s.privateRevealed = false; CT.render(); break;
    case "first-mode": s.firstMode = el.dataset.m; CT.render(); break;
    case "first-pick": s.firstPlayerIndex = +el.value; break;
    case "begin-game":
      if (CT.testMode && CT.readBalanceFromUI) CT.pendingBalance = CT.readBalanceFromUI();
      s.finish(); break;
  }
};

function esc(str) {
  return String(str).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
CT.esc = esc;
