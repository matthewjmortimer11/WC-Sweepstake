/* Charades — online multiplayer + local pass-the-phone */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const LS = { pid: "charades.pid", name: "charades.name" };
  const CELEBS = window.IMPOSTER_CELEBS || [];
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 50;

  let timerInterval = null;
  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let routeCode = null;
  let localMode = false;
  let charadeTimerKey = null;
  let lastRouteCode = null;

  const state = { room: null, you: null, pendingSettings: null };

  const lobbyMin = (room) => (room && room.settings && room.settings.minPlayers) || MIN_PLAYERS;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k === "disabled" && v === "disabled") n.disabled = true;
      else n.setAttribute(k, v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c != null && n.append(c));
    return n;
  };

  function pid() {
    try {
      let id = localStorage.getItem(LS.pid);
      if (!id) { id = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem(LS.pid, id); }
      return id;
    } catch (_) { return crypto.randomUUID().replace(/-/g, ""); }
  }

  function playerName() {
    try { return (localStorage.getItem(LS.name) || "").trim(); } catch (_) { return ""; }
  }

  function saveName(n) {
    try { localStorage.setItem(LS.name, n); } catch (_) {}
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    toast("Not connected — wait a moment and try again.");
    return false;
  }

  function parseRoute() {
    localMode = /^#\/local\b/i.test(location.hash || "");
    const m = location.hash.match(/^#\/room\/([A-Za-z0-9]+)/i);
    routeCode = localMode ? null : (m ? m[1].toUpperCase() : null);
  }

  function playerById(id) {
    return (state.room && state.room.players || []).find((p) => p.id === id);
  }

  function readNameFromUrl() {
    try {
      const n = (new URLSearchParams(location.search).get("name") || "").trim();
      if (n) saveName(n);
    } catch (_) {}
  }

  function roomInviteUrl(code) {
    const n = playerName();
    const q = n ? `?name=${encodeURIComponent(n)}` : "";
    return `${location.origin}/charades${q}#/room/${code}`;
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); if (done) done(); } catch (_) { toast(text); }
    ta.remove();
  }

  function copyText(text, okMsg) {
    const done = () => toast(okMsg);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function shareRoomLink(code) {
    const url = roomInviteUrl(code);
    const text = `Join my Charades game — room ${code}`;
    if (navigator.share) {
      navigator.share({ title: "Charades — Wheesht", text, url })
        .then(() => toast("Invite sent"))
        .catch(() => copyText(url, "Invite link copied"));
      return;
    }
    copyText(url, "Invite link copied");
  }

  function connect(code) {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/charades/ws/${code}?pid=${encodeURIComponent(pid())}&name=${encodeURIComponent(playerName())}`;
    ws = new WebSocket(url);
    ws.onopen = () => { reconnectDelay = 800; };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.type === "fatal") {
        toast(msg.message || "Connection failed.");
        if (ws) { try { ws.close(); } catch (_) {} ws = null; }
        state.room = null;
        state.you = null;
        clearTimeout(reconnectTimer);
        location.hash = "";
        return;
      }
      if (msg.type === "error") { toast(msg.message || "Error"); return; }
      if (msg.type === "state") {
        state.room = msg.room;
        state.you = msg.you;
        render();
      }
    };
    ws.onclose = () => {
      if (routeCode) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 1.5, 8000);
          connect(routeCode);
        }, reconnectDelay);
      }
    };
  }

  async function createRoom() {
    const body = state.pendingSettings || { timerSecs: 60 };
    const r = await fetch("/charades/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { toast("Couldn't create room."); return; }
    location.hash = `#/room/${(await r.json()).code}`;
  }

  function timerSeg(current, onPick) {
    return el("div", { class: "timer-seg", role: "group", "aria-label": "Acting timer" },
      [0, 30, 60, 90, 120].map((s) => el("button", {
        class: "timer-opt" + (current === s ? " on" : ""),
        text: s === 0 ? "Off" : s + "s",
        onclick: () => onPick(s),
      }))
    );
  }

  function scorebar(players, scores, actorId) {
    const entries = (players || []).map((p) => ({
      id: p.id, name: p.name, score: (scores && scores[p.id]) || 0,
    }));
    const best = Math.max(0, ...entries.map((e) => e.score));
    return el("div", { class: "scorebar", "aria-label": "Scores" },
      entries.map((e) => el("span", {
        class: "score-chip" + (e.id === actorId ? " act" : "") + (e.score === best && best > 0 ? " lead" : ""),
      }, [
        el("span", { class: "score-chip__n", text: e.name }),
        el("b", { text: String(e.score) }),
      ]))
    );
  }

  function armCharadeTimer(total) {
    if (!total) return;
    const deadline = Date.now() + total * 1000;
    const wrap = document.getElementById("ch-timer");
    const bar = document.getElementById("ch-timer-bar");
    const txt = document.getElementById("ch-timer-text");
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      if (txt) txt.textContent = left > 0 ? Math.ceil(left / 1000) + "s" : "Time's up!";
      if (bar) bar.style.width = (100 * left / (total * 1000)) + "%";
      if (left <= 0) {
        if (wrap) wrap.classList.add("up");
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      }
    };
    tick();
    timerInterval = setInterval(tick, 200);
  }

  function clearCharadeTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function hostLobbyExtras(settings) {
    return [
      el("label", { class: "fl" }, [
        el("span", { text: "Acting timer (optional)" }),
        timerSeg(settings.timerSecs, (s) => {
          send({ type: "settings", settings: { timerSecs: s } });
        }),
      ]),
    ];
  }

  function hostResetBtn() {
    return el("button", {
      class: "btn btn--ghost btn--block", text: "Back to lobby",
      onclick: () => send({ type: "reset" }),
    });
  }

  function homeScreen() {
    readNameFromUrl();
    const nameIn = el("input", { class: "in", maxlength: "24", value: playerName(), placeholder: "Your name" });
    const joinIn = el("input", { class: "in", maxlength: "6", placeholder: "Room code", style: "text-transform:uppercase;letter-spacing:.15em" });
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Online" }),
      el("h1", {}, [document.createTextNode("Act it "), el("span", { class: "em", text: "out" })]),
      el("p", { class: "lede", text: "One celebrity to mime each round — no talking, no pointing. Everyone guesses on their own device." }),
      el("label", { class: "fl" }, [el("span", { text: "Your name" }), nameIn]),
      el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Create room →",
        onclick: () => { saveName(nameIn.value.trim()); createRoom(); },
      }),
      el("div", { class: "row" }, [
        joinIn,
        el("button", {
          class: "btn btn--primary", text: "Join",
          onclick: () => {
            saveName(nameIn.value.trim());
            const c = joinIn.value.trim().toUpperCase();
            if (c) location.hash = `#/room/${c}`;
            else toast("Enter a room code.");
          },
        }),
      ]),
      el("p", { class: "note", text: `Works with ${MIN_PLAYERS}+ players. Share the game link so friends join on their phones.` }),
      el("button", {
        class: "btn btn--ghost btn--block", text: "One phone — pass it around",
        onclick: () => { location.hash = "#/local"; },
      }),
    ]);
  }

  function lobbyScreen() {
    const room = state.room;
    const you = state.you;
    const settings = room.settings;
    const me = playerById(you.id) || you;
    const connected = room.players.filter((p) => p.connected).length;
    const minP = lobbyMin(room);
    const canStart = connected >= minP;
    state.pendingSettings = { timerSecs: settings.timerSecs };

    const nameIn = el("input", {
      class: "in", maxlength: "24", value: you.name || playerName(),
      onchange: (e) => send({ type: "rename", name: e.target.value.trim() }),
    });

    const hostBits = me.isHost ? [
      ...hostLobbyExtras(settings),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: canStart ? `Start game (${connected} players) →` : `Waiting for players (${connected}/${minP})…`,
        disabled: canStart ? false : "disabled",
        onclick: () => send({ type: "start" }),
      }),
    ] : [
      el("p", { class: "note", text: `Waiting for the host to start… (${connected} connected, need ${minP}+)` }),
    ];

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Lobby" }),
      el("div", {
        class: "room-code", text: room.code, style: "cursor:pointer",
        onclick: () => copyText(room.code, "Room code copied"),
      }),
      el("div", { class: "row" }, [
        el("button", { class: "btn btn--primary", text: "Share game link", onclick: () => shareRoomLink(room.code) }),
        el("button", { class: "btn btn--ghost", text: "Copy code", onclick: () => copyText(room.code, "Room code copied") }),
      ]),
      el("label", { class: "fl" }, [el("span", { text: "Your name" }), nameIn]),
      el("div", { class: "players" }, room.players.map((p) => el("div", { class: "player-row" + (p.connected ? "" : " off") }, [
        el("div", { class: "player-row__who" }, [
          el("span", { class: "player-dot", style: `background:${p.color}` }),
          el("span", { class: "player-row__name", text: p.name }),
        ]),
        p.isHost ? el("span", { class: "badge badge--host", text: "host" }) : null,
      ]))),
      ...hostBits,
      el("button", { class: "btn btn--ghost btn--block", text: "Leave room", onclick: () => { location.hash = ""; } }),
    ]);
  }

  function actorScreen() {
    const room = state.room;
    const game = room.game;
    const you = state.you;
    const me = playerById(you.id) || you;
    const others = room.players.filter((p) => p.id !== you.id && p.connected);
    const timer = game.timerSecs > 0 ? el("div", { class: "ch-timer", id: "ch-timer" }, [
      el("div", { class: "ch-timer__bar", id: "ch-timer-bar" }),
      el("span", { class: "ch-timer__text", id: "ch-timer-text", text: game.timerSecs + "s" }),
    ]) : null;

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Charades" }),
      scorebar(room.players, game.scores, you.id),
      el("div", { class: "reveal" }, [
        el("span", { class: "who", text: you.name + " — your charade" }),
        el("span", { class: "role-cap tiny muted", text: "Act this out" }),
        el("div", { class: "role charade", text: game.word || "…" }),
        el("p", { class: "role-sub", text: "No talking, no pointing at words — mime it. Others guess." }),
        timer,
        el("button", { class: "btn btn--ghost btn--block", text: "Different charade", onclick: () => send({ type: "newCharade" }) }),
        el("p", { class: "note tiny muted", text: "Who guessed it? Tap their name — you both score a point." }),
        el("div", { class: "guesser-grid" }, others.map((p) => el("button", {
          class: "btn pick",
          onclick: () => send({ type: "awardCharade", guesserId: p.id }),
        }, [el("span", { text: p.name })]))),
        el("button", { class: "btn btn--block", text: "Nobody got it →", onclick: () => send({ type: "charadeNobody" }) }),
      ]),
      me.isHost ? hostResetBtn() : null,
    ]);
  }

  function waitScreen() {
    const room = state.room;
    const game = room.game;
    const you = state.you;
    const me = playerById(you.id) || you;
    const actor = playerById(game.actorId);
    const bits = [
      el("span", { class: "eyebrow", text: "Charades" }),
      scorebar(room.players, game.scores, game.actorId),
      el("p", { class: "note", text: "Guess the celebrity being acted out." }),
      el("div", { class: "turn-card" }, [
        el("span", { class: "turn-card__cap tiny muted", text: "Up to act" }),
        el("div", { class: "turn-name", text: (actor && actor.name) || "…" }),
      ]),
      el("p", { class: "note", text: "Watch and guess — the actor taps who got it right." }),
    ];
    if (me.isHost) {
      bits.push(el("button", { class: "btn btn--ghost btn--block", text: "Skip turn →", onclick: () => send({ type: "skipCharade" }) }));
      bits.push(hostResetBtn());
    }
    return el("div", { class: "panel" }, bits);
  }

  // ── Local ────────────────────────────────────────────────────────────────

  const local = {
    screen: "setup",
    names: ["Player 1", "Player 2", "Player 3", "Player 4"],
    actor: 0,
    word: "",
    scores: [0, 0, 0, 0],
    timerSecs: 60,
  };

  function localPlayerCount() {
    return local.names.length;
  }

  function addLocalPlayer() {
    if (local.names.length >= MAX_PLAYERS) return;
    local.names.push("Player " + (local.names.length + 1));
    local.scores.push(0);
    renderLocal();
  }

  function removeLocalPlayer() {
    if (local.names.length <= MIN_PLAYERS) return;
    local.names.pop();
    local.scores.pop();
    if (local.actor >= local.names.length) local.actor = 0;
    renderLocal();
  }

  function pickCharade() {
    const prev = local.word;
    let next = pick(CELEBS);
    while (next === prev && CELEBS.length > 1) next = pick(CELEBS);
    local.word = next;
  }

  function localStart() {
    if (!CELEBS.length) { toast("Celebrity list failed to load — refresh the page."); return; }
    local.actor = Math.floor(Math.random() * localPlayerCount());
    local.scores = local.names.map(() => 0);
    pickCharade();
    local.screen = "select";
    renderLocal();
  }

  function nextLocalTurn() {
    local.actor = (local.actor + 1) % localPlayerCount();
    pickCharade();
    local.screen = "select";
    renderLocal();
  }

  function awardLocal(guesserIndex) {
    local.scores[guesserIndex]++;
    local.scores[local.actor]++;
    nextLocalTurn();
  }

  function localSetup() {
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "One phone" }),
      el("h1", {}, [document.createTextNode("Act it "), el("span", { class: "em", text: "out" })]),
      el("p", { class: "lede", text: "One phone, taking turns. Each round one person gets a celebrity to act out while everyone else guesses." }),
      el("label", { class: "fl", text: "Acting timer (optional)" }),
      timerSeg(local.timerSecs, (s) => { local.timerSecs = s; renderLocal(); }),
      el("div", { class: "names" }, local.names.map((name, i) => el("label", { class: "fl" }, [
        el("span", { text: "Player " + (i + 1) }),
        el("input", { class: "in", maxlength: "20", value: name, oninput: (e) => { local.names[i] = e.target.value; } }),
      ]))),
      el("div", { class: "row" }, [
        el("button", { class: "btn btn--ghost", text: "+ Add player", disabled: local.names.length >= MAX_PLAYERS ? "disabled" : false, onclick: addLocalPlayer }),
        el("button", { class: "btn btn--ghost", text: "− Remove player", disabled: local.names.length <= MIN_PLAYERS ? "disabled" : false, onclick: removeLocalPlayer }),
      ]),
      el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Start game →",
        disabled: local.names.length < MIN_PLAYERS ? "disabled" : false,
        onclick: () => {
          local.names = local.names.map((n, i) => (n || "").trim() || ("Player " + (i + 1)));
          localStart();
        },
      }),
      el("button", { class: "btn btn--ghost btn--block", text: "← Online rooms", onclick: () => { location.hash = ""; } }),
    ]);
  }

  function localSelect() {
    const best = Math.max(0, ...local.scores);
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Charades" }),
      el("div", { class: "scorebar" }, local.names.map((n, i) => el("span", {
        class: "score-chip" + (i === local.actor ? " act" : "") + (local.scores[i] === best && best > 0 ? " lead" : ""),
      }, [el("span", { class: "score-chip__n", text: n }), el("b", { text: String(local.scores[i]) })]))),
      el("p", { class: "note", text: "Everyone else: guess the celebrity being acted out." }),
      el("div", { class: "turn-card" }, [
        el("span", { class: "turn-card__cap tiny muted", text: "Up to act" }),
        el("div", { class: "turn-name", text: local.names[local.actor] }),
      ]),
      el("button", { class: "btn btn--primary btn--lg btn--block", text: "Reveal charade →", onclick: () => { local.screen = "reveal"; renderLocal(); } }),
      el("div", { class: "row" }, [
        el("button", { class: "btn btn--ghost", text: "New game", onclick: localStart }),
        el("button", { class: "btn btn--ghost", text: "Edit names", onclick: () => { local.screen = "setup"; renderLocal(); } }),
      ]),
    ]);
  }

  function localReveal() {
    const others = local.names.map((n, idx) => ({ n, idx })).filter((o) => o.idx !== local.actor);
    return el("div", { class: "panel" }, [
      el("div", { class: "reveal" }, [
        el("span", { class: "who", text: local.names[local.actor] + " — your charade" }),
        el("span", { class: "role-cap tiny muted", text: "Act this out" }),
        el("div", { class: "role charade", text: local.word }),
        el("p", { class: "role-sub", text: "No talking, no pointing at words — mime it. Others guess." }),
        local.timerSecs > 0 ? el("div", { class: "ch-timer", id: "ch-timer" }, [
          el("div", { class: "ch-timer__bar", id: "ch-timer-bar" }),
          el("span", { class: "ch-timer__text", id: "ch-timer-text", text: local.timerSecs + "s" }),
        ]) : null,
        el("button", { class: "btn btn--ghost btn--block", text: "Different charade", onclick: () => { pickCharade(); renderLocal(); } }),
        el("p", { class: "note tiny muted", text: "Who guessed it? Tap their name — you both score a point." }),
        el("div", { class: "guesser-grid" }, others.map((o) => el("button", {
          class: "btn pick", onclick: () => awardLocal(o.idx),
        }, [el("span", { text: o.n })]))),
        el("button", { class: "btn btn--block", text: "Nobody got it →", onclick: nextLocalTurn }),
      ]),
    ]);
  }

  function renderLocal() {
    clearCharadeTimer();
    const screen = local.screen === "setup" ? localSetup() : local.screen === "reveal" ? localReveal() : localSelect();
    app.replaceChildren(screen);
    if (local.screen === "reveal" && local.timerSecs > 0) armCharadeTimer(local.timerSecs);
  }

  function syncCharadeTimer(game, you) {
    const nextKey = game.status === "playing" && you.isActor
      ? `${game.actorId}:${game.word}:${game.timerSecs}` : null;
    if (nextKey === charadeTimerKey) return;
    clearCharadeTimer();
    charadeTimerKey = nextKey;
    if (nextKey && game.timerSecs > 0) armCharadeTimer(game.timerSecs);
  }

  function render() {
    if (localMode) { renderLocal(); return; }
    if (!routeCode) {
      clearCharadeTimer();
      charadeTimerKey = null;
      app.replaceChildren(homeScreen());
      return;
    }
    if (!state.room) {
      app.replaceChildren(el("div", { class: "panel" }, [el("p", { class: "note", text: "Connecting to room…" })]));
      return;
    }
    const game = state.room.game;
    const you = state.you;
    if (game.status === "lobby") {
      clearCharadeTimer();
      charadeTimerKey = null;
      app.replaceChildren(lobbyScreen());
    } else {
      app.replaceChildren(you.isActor ? actorScreen() : waitScreen());
      syncCharadeTimer(game, you);
    }
    window.scrollTo(0, 0);
  }

  function boot() {
    readNameFromUrl();
    parseRoute();
    if (localMode && ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
      state.room = null;
      state.you = null;
    }
    const routeChanged = routeCode !== lastRouteCode;
    if (routeChanged) {
      clearTimeout(reconnectTimer);
      lastRouteCode = routeCode;
      charadeTimerKey = null;
      if (!routeCode) {
        if (ws) { try { ws.close(); } catch (_) {} ws = null; }
        state.room = null;
        state.you = null;
      } else {
        state.room = null;
        state.you = null;
        connect(routeCode);
      }
    }
    render();
  }

  window.addEventListener("hashchange", boot);
  boot();
})();
