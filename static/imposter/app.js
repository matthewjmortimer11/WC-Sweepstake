/* Imposter — online multiplayer + local pass-the-phone */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const LS = { pid: "imposter.pid", name: "imposter.name" };
  const CELEBS = window.IMPOSTER_CELEBS || [];

  let timerInterval = null;
  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let routeCode = null;
  let localMode = false;
  let charadeTimerKey = null;

  const state = {
    connected: false,
    room: null,
    you: null,
    pendingSettings: null,
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
      if (msg.type === "fatal") { toast(msg.message || "Connection failed."); location.hash = ""; return; }
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

  function timerSeg(current, onPick) {
    return el("div", { class: "timer-seg", role: "group", "aria-label": "Acting timer" },
      [0, 30, 60, 90, 120].map((s) => el("button", {
        class: "timer-opt" + (current === s ? " on" : ""),
        "aria-pressed": current === s ? "true" : "false",
        text: s === 0 ? "Off" : s + "s",
        onclick: () => onPick(s),
      }))
    );
  }

  function charadesScorebar(players, scores, actorId) {
    const entries = (players || []).map((p) => ({
      id: p.id,
      name: p.name,
      score: (scores && scores[p.id]) || 0,
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

  // ── Online screens ───────────────────────────────────────────────────────

  function homeScreen() {
    const nameIn = el("input", { class: "in", maxlength: "24", value: playerName(), placeholder: "Your name" });
    const joinIn = el("input", { class: "in", maxlength: "6", placeholder: "Room code", style: "text-transform:uppercase;letter-spacing:.15em" });
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Online" }),
      el("h1", {}, [document.createTextNode("Who's the "), el("span", { class: "em", text: "imposter?" })]),
      el("p", { class: "lede", text: "Four players, four phones. Classic imposter, celebrity dance, or charades — everyone sees their own secret on their device." }),
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
      el("p", { class: "note", text: "Need exactly 4 players. Share the game link so friends join on their phones." }),
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

    const hostBits = you.isHost ? [
      el("div", { class: "modes", role: "group", "aria-label": "Game mode" }, [
        modeBtn("classic", "🕵️ Imposter", settings.mode, (id) => {
          send({ type: "settings", settings: { ...state.pendingSettings, mode: id } });
        }),
        modeBtn("celebrity", "💃 Celebrity Dance", settings.mode, (id) => {
          send({ type: "settings", settings: { ...state.pendingSettings, mode: id } });
        }),
        modeBtn("charades", "🎭 Charades", settings.mode, (id) => {
          send({ type: "settings", settings: { ...state.pendingSettings, mode: id } });
        }),
      ]),
      settings.mode === "charades" ? el("label", { class: "fl" }, [
        el("span", { text: "Acting timer (optional)" }),
        timerSeg(settings.timerSecs, (s) => {
          send({ type: "settings", settings: { ...state.pendingSettings, timerSecs: s } });
        }),
      ]) : null,
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: connected === 4 ? "Start game →" : `Waiting for players (${connected}/4)…`,
        disabled: connected !== 4 ? "disabled" : null,
        onclick: () => send({ type: "start" }),
      }),
    ] : [
      el("p", { class: "note", text: `Waiting for the host to start… (${connected}/4 connected)` }),
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
      return el("div", { class: "panel" }, [
        el("span", { class: "eyebrow", text: "Waiting" }),
        el("p", { class: "note", text: `You've seen your role. Waiting for others (${waiting}/4)…` }),
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
    const mode = game.mode;

    if (mode === "charades") {
      return you.isActor ? onlineCharadeActorScreen() : onlineCharadeWaitScreen();
    }

    const celeb = mode === "celebrity";
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

  function onlineCharadeActorScreen() {
    const room = state.room;
    const game = room.game;
    const you = state.you;
    const others = room.players.filter((p) => p.id !== you.id);

    const guessers = el("div", { class: "guesser-grid" },
      others.map((p) => el("button", {
        class: "btn pick",
        onclick: () => send({ type: "awardCharade", guesserId: p.id }),
      }, [el("span", { text: p.name })]))
    );

    const timer = game.timerSecs > 0 ? el("div", { class: "ch-timer", id: "ch-timer" }, [
      el("div", { class: "ch-timer__bar", id: "ch-timer-bar" }),
      el("span", { class: "ch-timer__text", id: "ch-timer-text", text: game.timerSecs + "s" }),
    ]) : null;

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Charades" }),
      charadesScorebar(room.players, game.charadesScores, you.id),
      el("div", { class: "reveal" }, [
        el("span", { class: "who", text: you.name + " — your charade" }),
        el("span", { class: "role-cap tiny muted", text: "Act this out" }),
        el("div", { class: "role charade", text: game.charadesWord || "…" }),
        el("p", { class: "role-sub", text: "No talking, no pointing at words — mime it. Others guess." }),
        timer,
        el("button", {
          class: "btn btn--ghost btn--block", text: "Different charade",
          onclick: () => send({ type: "newCharade" }),
        }),
        el("p", { class: "note tiny muted", text: "Who guessed it? Tap their name — you both score a point." }),
        guessers,
        el("button", {
          class: "btn btn--block", text: "Nobody got it →",
          onclick: () => send({ type: "charadeNobody" }),
        }),
      ]),
    ]);
  }

  function onlineCharadeWaitScreen() {
    const room = state.room;
    const game = room.game;
    const you = state.you;
    const actor = playerById(game.charadesActorId);
    const bits = [
      el("span", { class: "eyebrow", text: "Charades" }),
      charadesScorebar(room.players, game.charadesScores, game.charadesActorId),
      el("p", { class: "note", text: "Guess the celebrity being acted out." }),
      el("div", { class: "turn-card" }, [
        el("span", { class: "turn-card__cap tiny muted", text: "Up to act" }),
        el("div", { class: "turn-name", text: (actor && actor.name) || "…" }),
      ]),
      el("p", { class: "note", text: "Watch and guess — the actor taps who got it right." }),
    ];
    if (you.isHost) {
      bits.push(el("button", {
        class: "btn btn--ghost btn--block", text: "Skip turn →",
        onclick: () => send({ type: "skipCharade" }),
      }));
    }
    return el("div", { class: "panel" }, bits);
  }

  function onlineGameScreen() {
    const game = state.room.game;
    if (game.phase === "peek") return onlinePeekScreen();
    if (game.phase === "play") return onlinePlayScreen();
    if (game.phase === "charade") return state.you.isActor ? onlineCharadeActorScreen() : onlineCharadeWaitScreen();
    return el("div", { class: "panel" }, [el("p", { class: "note", text: "…" })]);
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
    charadesActor: 0,
    charadesWord: "",
    charadesScores: [0, 0, 0, 0],
    timerSecs: 60,
  };

  function dealCelebs(oddIndex) {
    const common = pick(CELEBS);
    let odd = common;
    while (odd === common) odd = pick(CELEBS);
    local.commonCeleb = common;
    local.oddCeleb = odd;
    local.celebs = local.names.map((_, i) => (i === oddIndex ? odd : common));
  }

  function pickCharade() {
    const prev = local.charadesWord;
    let next = pick(CELEBS);
    while (next === prev && CELEBS.length > 1) next = pick(CELEBS);
    local.charadesWord = next;
  }

  function localStartGame() {
    if (local.mode === "charades") {
      local.charadesActor = Math.floor(Math.random() * local.names.length);
      local.charadesScores = local.names.map(() => 0);
      local.charadesWord = "";
      pickCharade();
      local.screen = "select";
      renderLocal();
      return;
    }
    local.imposter = Math.floor(Math.random() * 4);
    if (local.mode === "celebrity") dealCelebs(local.imposter);
    local.viewed = [];
    local.revealAnswer = false;
    local.screen = "select";
    renderLocal();
  }

  function localNewRound() {
    if (local.mode === "charades") { localStartGame(); return; }
    const prev = local.imposter;
    do { local.imposter = Math.floor(Math.random() * 4); }
    while (local.imposter === prev);
    if (local.mode === "celebrity") dealCelebs(local.imposter);
    local.viewed = [];
    local.revealAnswer = false;
    local.screen = "select";
    renderLocal();
  }

  function nextCharadesPlayer() {
    local.charadesActor = (local.charadesActor + 1) % local.names.length;
    pickCharade();
    local.screen = "select";
    renderLocal();
  }

  function awardCharade(guesserIndex) {
    if (!local.charadesScores) local.charadesScores = local.names.map(() => 0);
    local.charadesScores[guesserIndex] = (local.charadesScores[guesserIndex] || 0) + 1;
    local.charadesScores[local.charadesActor] = (local.charadesScores[local.charadesActor] || 0) + 1;
    nextCharadesPlayer();
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
      ? "Four players, one phone. Everyone gets the same celebrity — except one. Check yours, then dance like them (accent or impression optional, but mainly dance). Spot the odd one out."
      : local.mode === "charades"
      ? "One phone, taking turns. Each round one person gets a celebrity to act out (no talking, no pointing at words) while everyone else guesses. Tap “Next player” to pass it on."
      : "Four players, one phone. Enter names, then pass it around so everyone can secretly check their role.";

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "One phone" }),
      el("h1", {}, [document.createTextNode("Who's "), el("span", { class: "em", text: "in?" })]),
      el("div", { class: "modes", role: "group", "aria-label": "Game mode" }, [
        modeBtn("classic", "🕵️ Imposter", local.mode, (id) => { local.mode = id; renderLocal(); }),
        modeBtn("celebrity", "💃 Celebrity Dance", local.mode, (id) => { local.mode = id; renderLocal(); }),
        modeBtn("charades", "🎭 Charades", local.mode, (id) => { local.mode = id; renderLocal(); }),
      ]),
      el("p", { class: "lede", text: lede }),
      local.mode === "charades" ? el("div", { class: "field" }, [
        el("label", { class: "fl", text: "Acting timer (optional)" }),
        timerSeg(local.timerSecs, (s) => { local.timerSecs = s; renderLocal(); }),
      ]) : null,
      el("div", { class: "names" }, inputs),
      el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Start game →",
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
    if (local.mode === "charades") {
      const scores = local.charadesScores || local.names.map(() => 0);
      const best = Math.max(0, ...scores);
      const scorebar = el("div", { class: "scorebar", "aria-label": "Scores" },
        local.names.map((n, i) => el("span", {
          class: "score-chip" + (i === local.charadesActor ? " act" : "") + (scores[i] === best && best > 0 ? " lead" : ""),
        }, [
          el("span", { class: "score-chip__n", text: n }),
          el("b", { text: String(scores[i] || 0) }),
        ]))
      );
      return el("div", { class: "panel" }, [
        el("span", { class: "eyebrow", text: "Charades" }),
        scorebar,
        el("p", { class: "note", text: "Everyone else: guess the celebrity being acted out." }),
        el("div", { class: "turn-card" }, [
          el("span", { class: "turn-card__cap tiny muted", text: "Up to act" }),
          el("div", { class: "turn-name", text: local.names[local.charadesActor] }),
        ]),
        el("button", {
          class: "btn btn--primary btn--lg btn--block", text: "Reveal charade →",
          onclick: () => { local.screen = "reveal"; renderLocal(); },
        }),
        el("div", { class: "row" }, [
          el("button", { class: "btn btn--ghost", text: "New game", onclick: localNewRound }),
          el("button", { class: "btn btn--ghost", text: "Edit names", onclick: () => { local.screen = "setup"; renderLocal(); } }),
        ]),
      ]);
    }

    const allViewed = local.viewed.length >= 4;
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
    if (local.mode === "charades") {
      const others = local.names
        .map((n, idx) => ({ n, idx }))
        .filter((o) => o.idx !== local.charadesActor);
      const guessers = el("div", { class: "guesser-grid" },
        others.map((o) => el("button", {
          class: "btn pick", onclick: () => awardCharade(o.idx),
        }, [el("span", { text: o.n })]))
      );
      return el("div", { class: "panel" }, [
        el("div", { class: "reveal" }, [
          el("span", { class: "who", text: local.names[local.charadesActor] + " — your charade" }),
          el("span", { class: "role-cap tiny muted", text: "Act this out" }),
          el("div", { class: "role charade", text: local.charadesWord }),
          el("p", { class: "role-sub", text: "No talking, no pointing at words — mime it. Others guess." }),
          local.timerSecs > 0 ? el("div", { class: "ch-timer", id: "ch-timer" }, [
            el("div", { class: "ch-timer__bar", id: "ch-timer-bar" }),
            el("span", { class: "ch-timer__text", id: "ch-timer-text", text: local.timerSecs + "s" }),
          ]) : null,
          el("button", { class: "btn btn--ghost btn--block", text: "Different charade", onclick: () => { pickCharade(); renderLocal(); } }),
          el("p", { class: "note tiny muted", text: "Who guessed it? Tap their name — you both score a point." }),
          guessers,
          el("button", { class: "btn btn--block", text: "Nobody got it →", onclick: nextCharadesPlayer }),
        ]),
      ]);
    }

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
    clearCharadeTimer();
    const screen = local.screen === "setup" ? localSetupScreen()
      : local.screen === "reveal" ? localRevealScreen()
      : localSelectScreen();
    app.replaceChildren(screen);
    window.scrollTo(0, 0);
    if (local.mode === "charades" && local.screen === "reveal" && local.timerSecs > 0) {
      armCharadeTimer(local.timerSecs);
    }
  }

  // ── Render router ────────────────────────────────────────────────────────

  function syncCharadeTimer(game, you) {
    const nextKey = game.mode === "charades" && game.phase === "charade" && you.isActor
      ? `${game.charadesActorId}:${game.charadesWord}:${game.timerSecs}`
      : null;
    if (nextKey === charadeTimerKey) return;
    clearCharadeTimer();
    charadeTimerKey = nextKey;
    if (nextKey && game.timerSecs > 0) armCharadeTimer(game.timerSecs);
  }

  function render() {
    if (localMode) {
      renderLocal();
      return;
    }
    if (!routeCode) {
      clearCharadeTimer();
      charadeTimerKey = null;
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
    const you = state.you;
    if (game.status === "lobby") {
      clearCharadeTimer();
      charadeTimerKey = null;
      app.replaceChildren(lobbyScreen());
    } else {
      app.replaceChildren(onlineGameScreen());
      syncCharadeTimer(game, you);
    }
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
    render();
    if (routeCode) connect(routeCode);
    else if (ws) { try { ws.close(); } catch (_) {} ws = null; }
  }

  window.addEventListener("hashchange", boot);
  boot();
})();
