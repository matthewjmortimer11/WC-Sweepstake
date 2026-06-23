/* Imposter — online multiplayer + local pass-the-phone */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const LS = { pid: "imposter.pid", name: "imposter.name" };
  const CELEBS = window.IMPOSTER_CELEBS || [];
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 50;

  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let routeCode = null;
  let localMode = false;
  let lastRouteCode = null;

  const state = {
    connected: false,
    room: null,
    you: null,
    pendingSettings: null,
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const lobbyMin = (room) => (room && room.settings && room.settings.minPlayers) || MIN_PLAYERS;
  const lobbyMax = (room) => (room && room.settings && room.settings.maxPlayers) || MAX_PLAYERS;

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
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
    } catch (_) { return "anon"; }
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
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function parseRoute() {
    localMode = /^#\/local\b/i.test(location.hash || "");
    const m = location.hash.match(/^#\/room\/([A-Za-z0-9]+)/i);
    routeCode = localMode ? null : (m ? m[1].toUpperCase() : null);
  }

  function playerById(id) {
    return (state.room && state.room.players || []).find((p) => p.id === id);
  }

  function roomInviteUrl(code) {
    return `${location.origin}/imposter#/room/${code}`;
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
    const text = `Join my Imposter game — room ${code}`;
    if (navigator.share) {
      navigator.share({ title: "Imposter — Wheesht", text, url })
        .then(() => toast("Invite sent"))
        .catch(() => copyText(url, "Invite link copied"));
      return;
    }
    copyText(url, "Invite link copied");
  }

  function connect(code) {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/imposter/ws/${code}?pid=${encodeURIComponent(pid())}&name=${encodeURIComponent(playerName())}`;
    ws = new WebSocket(url);
    ws.onopen = () => { reconnectDelay = 800; state.connected = true; };
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
      state.connected = false;
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
    const body = state.pendingSettings || { mode: "classic", timerSecs: 60 };
    const r = await fetch("/imposter/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { toast("Couldn't create room."); return; }
    const d = await r.json();
    location.hash = `#/room/${d.code}`;
  }

  function modeBtn(id, label, current, onPick) {
    return el("button", {
      class: "mode-opt" + (current === id ? " on" : ""),
      "aria-pressed": current === id ? "true" : "false",
      onclick: () => onPick(id),
    }, [el("span", { text: label })]);
  }

  // ── Online screens ───────────────────────────────────────────────────────

  function homeScreen() {
    const nameIn = el("input", { class: "in", maxlength: "24", value: playerName(), placeholder: "Your name" });
    const joinIn = el("input", { class: "in", maxlength: "6", placeholder: "Room code", style: "text-transform:uppercase;letter-spacing:.15em" });
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Online" }),
      el("h1", {}, [document.createTextNode("Who's the "), el("span", { class: "em", text: "imposter?" })]),
      el("p", { class: "lede", text: "Classic imposter or Celebrity Dance — everyone sees their own secret on their device." }),
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
      el("p", { class: "note", text: `Need at least ${MIN_PLAYERS} players. Share the game link so friends join on their phones.` }),
    ]);
  }

  function lobbyScreen() {
    const room = state.room;
    const you = state.you;
    const settings = room.settings;
    const connected = room.players.filter((p) => p.connected).length;
    state.pendingSettings = { mode: settings.mode, timerSecs: settings.timerSecs };

    const nameIn = el("input", {
      class: "in", maxlength: "24", value: you.name || playerName(),
      onchange: (e) => send({ type: "rename", name: e.target.value.trim() }),
    });

    const minP = lobbyMin(room);
    const maxP = lobbyMax(room);
    const canStart = connected >= minP;

    const hostBits = you.isHost ? [
      el("div", { class: "modes modes--2", role: "group", "aria-label": "Game mode" }, [
        modeBtn("classic", "🕵️ Imposter", settings.mode, (id) => {
          send({ type: "settings", settings: { ...state.pendingSettings, mode: id } });
        }),
        modeBtn("celebrity", "💃 Celebrity Dance", settings.mode, (id) => {
          send({ type: "settings", settings: { ...state.pendingSettings, mode: id } });
        }),
      ]),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: canStart ? "Start game →" : `Need at least ${minP} players (${connected}${maxP < 99 ? `/${maxP}` : ""})…`,
        disabled: canStart ? null : "disabled",
        onclick: () => send({ type: "start" }),
      }),
    ] : [
      el("p", { class: "note", text: `Waiting for the host to start… (${connected} connected, need ${minP}+)` }),
    ];

    const playerRows = room.players.map((p) => el("div", { class: "player-row" + (p.connected ? "" : " off") }, [
      el("div", { class: "player-row__who" }, [
        el("span", { class: "player-dot", style: `background:${p.color}` }),
        el("span", { class: "player-row__name", text: p.name }),
      ]),
      p.isHost ? el("span", { class: "badge badge--host", text: "host" }) : null,
    ]));

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Lobby" }),
      el("div", {
        class: "room-code", text: room.code, title: "Tap to copy code",
        style: "cursor:pointer", onclick: () => copyText(room.code, "Room code copied"),
      }),
      el("div", { class: "row" }, [
        el("button", { class: "btn btn--primary", text: "Share game link", onclick: () => shareRoomLink(room.code) }),
        el("button", { class: "btn btn--ghost", text: "Copy code", onclick: () => copyText(room.code, "Room code copied") }),
      ]),
      el("p", { class: "note", text: "Send the link — friends land in this room with the code filled in." }),
      el("label", { class: "fl" }, [el("span", { text: "Your name" }), nameIn]),
      el("div", { class: "players" }, playerRows),
      ...hostBits,
      el("button", { class: "btn btn--ghost btn--block", text: "Leave room", onclick: () => { location.hash = ""; } }),
    ]);
  }

  function onlinePeekScreen() {
    const game = state.room.game;
    const you = state.you;
    const mode = game.mode;

    if (you.hasViewed) {
      const waiting = (game.viewed || []).length;
      const total = (game.playerIds || []).length;
      return el("div", { class: "panel" }, [
        el("span", { class: "eyebrow", text: "Waiting" }),
        el("p", { class: "note", text: `You've seen your role. Waiting for others (${waiting}/${total})…` }),
      ]);
    }

    const hideBtn = el("button", {
      class: "btn btn--primary btn--lg btn--block",
      text: mode === "celebrity" ? "Hide" : "Hide role",
      onclick: () => send({ type: "markViewed" }),
    });

    if (mode === "celebrity") {
      return el("div", { class: "panel" }, [
        el("div", { class: "reveal" }, [
          el("span", { class: "who", text: you.name }),
          el("span", { class: "role-cap tiny muted", text: "Your celebrity" }),
          el("div", { class: "role celeb", text: game.myCeleb || "…" }),
          el("p", { class: "role-sub", text: "Dance like them. Accent or impression optional — but mainly dance." }),
          hideBtn,
        ]),
      ]);
    }

    const isImposter = !!game.isImposter;
    return el("div", { class: "panel" }, [
      el("div", { class: "reveal" }, [
        el("span", { class: "who", text: you.name }),
        el("div", { class: "role " + (isImposter ? "imposter" : "safe"), text: isImposter ? "IMPOSTER" : "NOT IMPOSTER" }),
        el("p", { class: "role-sub", text: isImposter ? "Blend in. Don't get caught." : "Work out who the imposter is." }),
        hideBtn,
      ]),
    ]);
  }

  function onlinePlayScreen() {
    const room = state.room;
    const game = room.game;
    const you = state.you;
    const celeb = game.mode === "celebrity";
    const readyNote = celeb
      ? "Everyone's seen their star. Dance! Then vote for the odd one out."
      : "Everyone's seen their role. Time to find the imposter.";

    const bits = [
      el("span", { class: "eyebrow", text: celeb ? "Celebrity Dance" : "Classic" }),
      el("p", { class: "note", text: readyNote }),
    ];

    if (celeb && game.revealAnswer) {
      const imp = playerById(game.imposterId);
      bits.push(el("div", { class: "answer" }, [
        el("p", { class: "answer__line" }, [
          el("b", { text: (imp && imp.name) || "Someone" }),
          document.createTextNode(" was the odd one out — they had "),
          el("b", { text: game.oddCeleb || "?" }),
          document.createTextNode("."),
        ]),
        el("p", { class: "answer__line tiny muted", text: "Everyone else: " + (game.commonCeleb || "?") + "." }),
      ]));
    }

    if (celeb && !game.revealAnswer && you.isHost) {
      bits.push(el("button", {
        class: "btn btn--block", text: "Reveal the odd one out",
        onclick: () => send({ type: "revealAnswer" }),
      }));
    }

    if (you.isHost) {
      bits.push(el("button", {
        class: "btn btn--primary btn--block", text: "New round",
        onclick: () => send({ type: "newRound" }),
      }));
      bits.push(el("button", {
        class: "btn btn--ghost btn--block", text: "Back to lobby",
        onclick: () => send({ type: "reset" }),
      }));
    } else {
      bits.push(el("p", { class: "note", text: "Discuss! The host starts the next round." }));
    }

    return el("div", { class: "panel" }, bits);
  }

  function onlineGameScreen() {
    const game = state.room.game;
    if (game.phase === "peek") return onlinePeekScreen();
    return onlinePlayScreen();
  }

  // ── Local pass-the-phone ─────────────────────────────────────────────────

  const local = {
    screen: "setup",
    mode: "classic",
    names: ["Player 1", "Player 2", "Player 3", "Player 4"],
    imposter: -1,
    celebs: [],
    commonCeleb: "",
    oddCeleb: "",
    revealAnswer: false,
    viewed: [],
    current: -1,
  };

  function localPlayerCount() {
    return local.names.length;
  }

  function addLocalPlayer() {
    if (local.names.length >= MAX_PLAYERS) return;
    local.names.push("Player " + (local.names.length + 1));
    renderLocal();
  }

  function removeLocalPlayer() {
    if (local.names.length <= MIN_PLAYERS) return;
    local.names.pop();
    renderLocal();
  }

  function dealCelebs(oddIndex) {
    const common = pick(CELEBS);
    let odd = common;
    while (odd === common) odd = pick(CELEBS);
    local.commonCeleb = common;
    local.oddCeleb = odd;
    local.celebs = local.names.map((_, i) => (i === oddIndex ? odd : common));
  }

  function localStartGame() {
    if (!CELEBS.length && local.mode === "celebrity") {
      toast("Celebrity list failed to load — refresh the page.");
      return;
    }
    local.imposter = Math.floor(Math.random() * localPlayerCount());
    if (local.mode === "celebrity") dealCelebs(local.imposter);
    local.viewed = [];
    local.revealAnswer = false;
    local.screen = "select";
    renderLocal();
  }

  function localNewRound() {
    const prev = local.imposter;
    do { local.imposter = Math.floor(Math.random() * localPlayerCount()); }
    while (local.imposter === prev);
    if (local.mode === "celebrity") dealCelebs(local.imposter);
    local.viewed = [];
    local.revealAnswer = false;
    local.screen = "select";
    renderLocal();
  }

  function localSetupScreen() {
    const inputs = local.names.map((name, i) =>
      el("label", { class: "fl" }, [
        el("span", { text: "Player " + (i + 1) }),
        el("input", {
          class: "in", type: "text", maxlength: "20", value: name,
          "aria-label": "Player " + (i + 1) + " name",
          oninput: (e) => { local.names[i] = e.target.value; },
        }),
      ])
    );

    const lede = local.mode === "celebrity"
      ? "One phone, pass it around. Everyone gets the same celebrity — except one. Check yours, then dance like them. Spot the odd one out."
      : "One phone, pass it around. Enter names, then pass it so everyone can secretly check their role.";

    const playerControls = el("div", { class: "row" }, [
      el("button", {
        class: "btn btn--ghost",
        text: "+ Add player",
        disabled: local.names.length >= MAX_PLAYERS ? "disabled" : null,
        onclick: addLocalPlayer,
      }),
      el("button", {
        class: "btn btn--ghost",
        text: "− Remove player",
        disabled: local.names.length <= MIN_PLAYERS ? "disabled" : null,
        onclick: removeLocalPlayer,
      }),
    ]);

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "One phone" }),
      el("h1", {}, [document.createTextNode("Who's "), el("span", { class: "em", text: "in?" })]),
      el("div", { class: "modes modes--2", role: "group", "aria-label": "Game mode" }, [
        modeBtn("classic", "🕵️ Imposter", local.mode, (id) => { local.mode = id; renderLocal(); }),
        modeBtn("celebrity", "💃 Celebrity Dance", local.mode, (id) => { local.mode = id; renderLocal(); }),
      ]),
      el("p", { class: "lede", text: lede }),
      playerControls,
      el("div", { class: "names" }, inputs),
      el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Start game →",
        disabled: local.names.length < MIN_PLAYERS ? "disabled" : null,
        onclick: () => {
          local.names = local.names.map((n, i) => (n || "").trim() || ("Player " + (i + 1)));
          localStartGame();
        },
      }),
      el("button", {
        class: "btn btn--ghost btn--block", text: "← Online rooms",
        onclick: () => { location.hash = ""; },
      }),
    ]);
  }

  function localSelectScreen() {
    const allViewed = local.viewed.length >= localPlayerCount();
    const grid = el("div", { class: "pick-grid" },
      local.names.map((name, i) => {
        const done = local.viewed.includes(i);
        return el("button", {
          class: "btn pick" + (done ? " done" : ""),
          onclick: () => { local.current = i; local.screen = "reveal"; renderLocal(); },
        }, [
          done ? el("span", { class: "check", text: "✓", "aria-label": "viewed" }) : null,
          el("span", { text: name }),
        ]);
      })
    );
    const celeb = local.mode === "celebrity";
    const readyNote = celeb
      ? "Everyone's seen their star. Dance! Then vote for the odd one out."
      : "Everyone's seen their role. Time to find the imposter.";

    let answer = null;
    if (celeb && local.revealAnswer) {
      answer = el("div", { class: "answer" }, [
        el("p", { class: "answer__line" }, [
          el("b", { text: local.names[local.imposter] }),
          document.createTextNode(" was the odd one out — they had "),
          el("b", { text: local.oddCeleb }),
          document.createTextNode("."),
        ]),
        el("p", { class: "answer__line tiny muted", text: "Everyone else: " + local.commonCeleb + "." }),
      ]);
    }

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Pass the phone" }),
      el("p", { class: "note", text: "Only click your own name. No peeking." }),
      grid,
      allViewed ? el("p", { class: "note", text: readyNote }) : null,
      answer,
      (celeb && allViewed && !local.revealAnswer)
        ? el("button", { class: "btn btn--block", text: "Reveal the odd one out",
            onclick: () => { local.revealAnswer = true; renderLocal(); } })
        : null,
      el("div", { class: "row" }, [
        el("button", { class: "btn btn--ghost", text: "New round", onclick: localNewRound }),
        el("button", { class: "btn btn--ghost", text: "Edit names", onclick: () => { local.screen = "setup"; renderLocal(); } }),
      ]),
    ]);
  }

  function localRevealScreen() {
    const i = local.current;
    const hideBtn = el("button", {
      class: "btn btn--primary btn--lg btn--block",
      text: local.mode === "celebrity" ? "Hide" : "Hide role",
      onclick: () => {
        if (!local.viewed.includes(i)) local.viewed.push(i);
        local.current = -1;
        local.screen = "select";
        renderLocal();
      },
    });

    if (local.mode === "celebrity") {
      return el("div", { class: "panel" }, [
        el("div", { class: "reveal" }, [
          el("span", { class: "who", text: local.names[i] }),
          el("span", { class: "role-cap tiny muted", text: "Your celebrity" }),
          el("div", { class: "role celeb", text: local.celebs[i] }),
          el("p", { class: "role-sub", text: "Dance like them. Accent or impression optional — but mainly dance." }),
          hideBtn,
        ]),
      ]);
    }

    const isImposter = i === local.imposter;
    return el("div", { class: "panel" }, [
      el("div", { class: "reveal" }, [
        el("span", { class: "who", text: local.names[i] }),
        el("div", { class: "role " + (isImposter ? "imposter" : "safe"), text: isImposter ? "IMPOSTER" : "NOT IMPOSTER" }),
        el("p", { class: "role-sub", text: isImposter ? "Blend in. Don't get caught." : "Work out who the imposter is." }),
        hideBtn,
      ]),
    ]);
  }

  function renderLocal() {
    const screen = local.screen === "setup" ? localSetupScreen()
      : local.screen === "reveal" ? localRevealScreen()
      : localSelectScreen();
    app.replaceChildren(screen);
    window.scrollTo(0, 0);
  }

  function render() {
    if (localMode) {
      renderLocal();
      return;
    }
    if (!routeCode) {
      app.replaceChildren(homeScreen());
      return;
    }
    if (!state.room) {
      app.replaceChildren(el("div", { class: "panel" }, [
        el("p", { class: "note", text: "Connecting to room…" }),
      ]));
      return;
    }
    const game = state.room.game;
    if (game.status === "lobby") app.replaceChildren(lobbyScreen());
    else app.replaceChildren(onlineGameScreen());
    window.scrollTo(0, 0);
  }

  function boot() {
    parseRoute();
    if (localMode && ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
      state.room = null;
      state.you = null;
    }
    if (routeCode !== lastRouteCode) {
      state.room = null;
      state.you = null;
      lastRouteCode = routeCode;
    }
    if (!routeCode) {
      if (ws) { try { ws.close(); } catch (_) {} ws = null; }
      clearTimeout(reconnectTimer);
      state.room = null;
      state.you = null;
      lastRouteCode = null;
    }
    render();
    if (routeCode) connect(routeCode);
  }

  window.addEventListener("hashchange", boot);
  boot();
})();
