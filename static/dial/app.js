/* Dial — online multiplayer client */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const LS = { pid: "dial.pid", name: "dial.name" };

  const CX = 160, CY = 152, R = 122;
  const degForVal = (v) => 180 - (v / 100) * 180;
  const polar = (r, deg) => {
    const a = deg * Math.PI / 180;
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
  };
  const arc = (v1, v2) => {
    const p1 = polar(R, degForVal(v1)), p2 = polar(R, degForVal(v2));
    return `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A${R} ${R} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  };
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const bandArc = (v1, v2, cls) => {
    v1 = clamp(v1); v2 = clamp(v2);
    if (v2 - v1 < 0.5) return "";
    return `<path class="band ${cls}" d="${arc(v1, v2)}"/>`;
  };
  const needle = (v, cls, id) => {
    const p = polar(R - 6, degForVal(v));
    return `<line ${id ? `id="${id}"` : ""} class="${cls}" x1="${CX}" y1="${CY}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`;
  };

  function gaugeHTML(opts) {
    const o = opts || {};
    const bands = o.showBands && o.target != null ? (
      bandArc(o.target - 20, o.target - 12, "band--2") +
      bandArc(o.target + 12, o.target + 20, "band--2") +
      bandArc(o.target - 12, o.target - 4, "band--3") +
      bandArc(o.target + 4, o.target + 12, "band--3") +
      bandArc(o.target - 4, o.target + 4, "band--4")
    ) : "";
    const tn = o.showTarget && o.target != null ? needle(o.target, "tneedle", "tneedle") : "";
    let extra = "";
    if (o.extraNeedles) {
      o.extraNeedles.forEach((n, i) => {
        extra += needle(n.value, n.cls || "needle--alt", n.id || `needle-${i}`);
      });
    }
    const gn = o.showGuess && o.guess != null ? needle(o.guess, "needle", "needle") : "";
    return `<svg viewBox="0 0 320 172" role="img" aria-label="Guessing dial">
      <path class="track" d="${arc(0, 100)}"/>${bands}${tn}${gn}${extra}
      <circle class="hub" cx="${CX}" cy="${CY}" r="9"/></svg>`;
  }

  function pointsFor(target, guess) {
    const d = Math.abs(target - guess);
    return d <= 4 ? 4 : d <= 12 ? 3 : d <= 20 ? 2 : 0;
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c != null && n.append(c));
    return n;
  };

  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let localGuess = 50;
  let routeCode = null;

  const state = {
    connected: false,
    room: null,
    you: null,
    pendingSettings: null,
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

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function parseRoute() {
    const m = location.hash.match(/^#\/room\/([A-Za-z0-9]+)/i);
    routeCode = m ? m[1].toUpperCase() : null;
  }

  function teamLabel(team, names) {
    if (team === "team0") return names[0] || "Team 1";
    if (team === "team1") return names[1] || "Team 2";
    return "Unassigned";
  }

  function playerById(id) {
    return (state.room && state.room.players || []).find((p) => p.id === id);
  }

  function connect(code) {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/wheel/ws/${code}?pid=${encodeURIComponent(pid())}&name=${encodeURIComponent(playerName())}`;
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
        reconnectTimer = setTimeout(() => { reconnectDelay = Math.min(reconnectDelay * 1.5, 8000); connect(routeCode); }, reconnectDelay);
      }
    };
  }

  async function createRoom(mode) {
    const body = state.pendingSettings || { mode, targetScore: 10, teamNames: ["Team 1", "Team 2"] };
    body.mode = mode || body.mode || "teams";
    const r = await fetch("/wheel/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { toast("Couldn't create room."); return; }
    const d = await r.json();
    location.hash = `#/room/${d.code}`;
  }

  function spectrumEl(spec) {
    return el("div", { class: "spectrum" }, [
      el("span", { class: "lft", text: spec[0] }),
      el("span", { class: "vs", text: "↔" }),
      el("span", { class: "rgt", text: spec[1] }),
    ]);
  }

  function scorebar(game, names) {
    if (game.mode === "ffa") {
      const entries = Object.entries(game.playerScores || {}).sort((a, b) => b[1] - a[1]);
      return el("div", { class: "guess-list" }, entries.map(([id, sc]) => {
        const p = playerById(id);
        return el("div", { class: "guess-row" }, [
          el("span", { text: (p && p.name) || "Player" }),
          el("span", { class: "guess-row__pts", text: String(sc) }),
        ]);
      }));
    }
    const active = game.activeTeam;
    return el("div", { class: "scorebar" }, [0, 1].map((i) =>
      el("div", { class: `team-score t${i + 1}${active === i ? " on" : ""}` }, [
        el("span", { class: "team-score__n", text: names[i] || `Team ${i + 1}` }),
        el("span", { class: "team-score__v", text: String((game.teamScores || [])[i] || 0) }),
      ])
    ));
  }

  function homeScreen() {
    const nameIn = el("input", { class: "in", maxlength: "24", value: playerName(), placeholder: "Your name" });
    const joinIn = el("input", { class: "in", maxlength: "6", placeholder: "Room code", style: "text-transform:uppercase;letter-spacing:.15em" });
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Online" }),
      el("h1", {}, [document.createTextNode("Read the "), el("span", { class: "em", text: "room." })]),
      el("p", { class: "lede", text: "Everyone joins on their own phone. Each round one Psychic secretly sees the target zone and gives a clue; everyone else turns their own dial. Closer = more points." }),
      el("label", { class: "fl" }, [el("span", { text: "Your name" }), nameIn]),
      el("button", { class: "btn btn--primary btn--lg btn--block", text: "Create room →",
        onclick: () => { saveName(nameIn.value.trim()); createRoom("teams"); } }),
      el("div", { class: "row" }, [
        joinIn,
        el("button", { class: "btn btn--primary", text: "Join",
          onclick: () => {
            saveName(nameIn.value.trim());
            const c = joinIn.value.trim().toUpperCase();
            if (c) location.hash = `#/room/${c}`;
            else toast("Enter a room code.");
          } }),
      ]),
      el("p", { class: "note", text: "Teams: pick a side and play together. Free-for-all: one Psychic, everyone else guesses solo." }),
      el("div", { class: "seg seg--2" }, [
        el("button", { class: "on", text: "Teams", onclick: () => createRoom("teams") }),
        el("button", { text: "Free-for-all", onclick: () => createRoom("ffa") }),
      ]),
    ]);
  }

  function lobbyScreen() {
    const room = state.room;
    const you = state.you;
    const settings = room.settings;
    const game = room.game;
    const names = settings.teamNames || ["Team 1", "Team 2"];
    state.pendingSettings = {
      mode: settings.mode,
      targetScore: settings.targetScore,
      teamNames: [...names],
    };

    const nameIn = el("input", { class: "in", maxlength: "24", value: you.name || playerName(),
      onchange: (e) => send({ type: "rename", name: e.target.value.trim() }) });

    const teamSeg = settings.mode === "teams" ? el("div", { class: "seg seg--2" }, [
      el("button", { class: you.team === "team0" ? "on" : "", text: names[0],
        onclick: () => send({ type: "setTeam", team: "team0" }) }),
      el("button", { class: you.team === "team1" ? "on" : "", text: names[1],
        onclick: () => send({ type: "setTeam", team: "team1" }) }),
    ]) : null;

    const hostBits = you.isHost ? [
      el("label", { class: "fl" }, [
        el("span", { text: "Play to" }),
        el("div", { class: "seg" }, [10, 15, 20].map((n) =>
          el("button", {
            class: settings.targetScore === n ? "on" : "",
            text: n + " pts",
            onclick: () => send({ type: "settings", settings: { ...state.pendingSettings, targetScore: n } }),
          })
        )),
      ]),
      settings.mode === "teams" ? el("label", { class: "fl" }, [
        el("span", { text: "Team names" }),
        el("div", { class: "row" }, [0, 1].map((i) =>
          el("input", {
            class: "in", maxlength: "18", value: names[i],
            onchange: (e) => {
              const tn = [...names];
              tn[i] = e.target.value;
              send({ type: "settings", settings: { ...state.pendingSettings, teamNames: tn } });
            },
          })
        )),
      ]) : null,
      el("div", { class: "seg seg--2" }, [
        el("button", {
          class: settings.mode === "teams" ? "on" : "",
          text: "Teams",
          onclick: () => send({ type: "settings", settings: { ...state.pendingSettings, mode: "teams" } }),
        }),
        el("button", {
          class: settings.mode === "ffa" ? "on" : "",
          text: "Free-for-all",
          onclick: () => send({ type: "settings", settings: { ...state.pendingSettings, mode: "ffa" } }),
        }),
      ]),
      el("button", { class: "btn btn--primary btn--lg btn--block", text: "Start game →",
        onclick: () => send({ type: "start" }) }),
    ] : [
      el("p", { class: "note", text: "Waiting for the host to start…" }),
    ];

    const playerRows = room.players.map((p) => el("div", { class: "player-row" + (p.connected ? "" : " off") }, [
      el("div", { class: "player-row__who" }, [
        el("span", { class: "player-dot", style: `background:${p.color}` }),
        el("span", { class: "player-row__name", text: p.name }),
      ]),
      el("div", { class: "player-row__meta" }, [
        p.isHost ? el("span", { class: "badge badge--host", text: "host" }) : null,
        settings.mode === "teams" && p.team !== "none"
          ? el("span", { text: " · " + teamLabel(p.team, names) }) : null,
      ].filter(Boolean)),
    ]));

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Lobby" }),
      el("div", { class: "room-code", text: room.code }),
      el("label", { class: "fl" }, [el("span", { text: "Your name" }), nameIn]),
      teamSeg,
      el("div", { class: "players" }, playerRows),
      ...hostBits,
      el("button", { class: "btn btn--ghost btn--block", text: "Leave room",
        onclick: () => { location.hash = ""; } }),
    ]);
  }

  function psychicScreen() {
    const game = state.room.game;
    const target = game.target;
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Psychic — keep this hidden" }),
      scorebar(game, game.teamNames),
      spectrumEl(game.spectrum),
      el("div", { class: "gauge", html: gaugeHTML({ showBands: true, showTarget: true, target }) }),
      el("p", { class: "note", text: "Give your team a one-line clue for where the gold zone sits. Don't say the dial words." }),
      el("button", { class: "btn btn--primary btn--lg btn--block", text: "Ready — let guessers play →",
        onclick: () => send({ type: "psychicReady" }) }),
    ]);
  }

  function guessScreen() {
    const game = state.room.game;
    const you = state.you;
    const val = game.myGuess != null ? game.myGuess : localGuess;
    localGuess = val;

    const live = game.liveGuesses || {};
    const extraNeedles = Object.entries(live).map(([id, v]) => ({
      value: v,
      cls: "needle--alt",
    }));

    const gauge = el("div", { class: "gauge", html: gaugeHTML({
      showGuess: true, guess: val, extraNeedles,
    }) });

    const slider = el("input", {
      type: "range", min: "0", max: "100", step: "1", value: String(val),
      class: "slider", "aria-label": "Turn the dial",
      oninput: (e) => {
        localGuess = Number(e.target.value);
        send({ type: "setGuess", value: localGuess });
        const ln = document.getElementById("needle");
        if (ln) {
          const p = polar(R - 6, degForVal(localGuess));
          ln.setAttribute("x2", p.x.toFixed(1));
          ln.setAttribute("y2", p.y.toFixed(1));
        }
      },
    });

    const locked = game.myLocked;
    const guessers = (game.guesserIds || []).length;
    const lockedCount = Object.keys(live).length + (locked ? 1 : 0);

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Turn the dial" }),
      scorebar(game, game.teamNames),
      spectrumEl(game.spectrum),
      gauge,
      slider,
      el("p", { class: "note", text: locked
        ? "Locked in — waiting for others…"
        : "Move the dial, then lock in your guess." }),
      locked ? null : el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: "Lock in guess",
        onclick: () => send({ type: "lockGuess" }),
      }),
      el("p", { class: "note", text: `${lockedCount} of ${guessers} locked in` }),
    ]);
  }

  function waitScreen(title, note) {
    const game = state.room.game;
    const psychic = playerById(game.psychicId);
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: title }),
      scorebar(game, game.teamNames),
      spectrumEl(game.spectrum),
      el("div", { class: "wait-panel" }, [
        el("p", { text: note }),
        psychic ? el("p", { class: "note", text: `Psychic: ${psychic.name}` }) : null,
      ]),
    ]);
  }

  function revealScreen() {
    const game = state.room.game;
    const target = game.target;
    const guesses = game.guesses || {};
    const pts = game.roundPoints || {};

    const extraNeedles = Object.entries(guesses).map(([id, v]) => ({
      value: v,
      cls: id === state.you.id ? "needle" : "needle--alt",
    }));

    const rows = Object.entries(guesses).map(([id, g]) => {
      const p = playerById(id);
      const point = pts[id] != null ? pts[id] : pointsFor(target, g);
      return el("div", { class: "guess-row" }, [
        el("span", { text: (p && p.name) || "Player" }),
        el("span", { class: "guess-row__pts", text: point ? `+${point}` : "0" }),
      ]);
    });

    const teamPts = game.mode === "teams"
      ? Math.max(...Object.values(pts).map(Number), 0)
      : null;

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Reveal" }),
      spectrumEl(game.spectrum),
      el("div", { class: "gauge", html: gaugeHTML({
        showBands: true, showTarget: true, showGuess: false, target,
        extraNeedles,
      }) }),
      game.mode === "teams" && teamPts != null
        ? el("div", { class: "points" + (teamPts === 0 ? " zero" : ""), text: teamPts ? `+${teamPts} for the team` : "Missed it!" })
        : null,
      el("div", { class: "guess-list" }, rows),
      scorebar(game, game.teamNames),
      state.you.isHost
        ? el("button", { class: "btn btn--primary btn--lg btn--block", text: "Next round →",
            onclick: () => send({ type: "nextRound" }) })
        : el("p", { class: "note", text: "Waiting for host to continue…" }),
    ]);
  }

  function winScreen() {
    const game = state.room.game;
    const names = game.teamNames || ["Team 1", "Team 2"];
    let title = "Game over!";
    if (game.mode === "teams" && game.winner != null) {
      const w = Number(game.winner);
      title = `${names[w] || "Team"} win!`;
    } else if (game.mode === "ffa" && game.winner) {
      const p = playerById(game.winner);
      title = `${(p && p.name) || "Someone"} wins!`;
    }
    return el("div", { class: "panel win" }, [
      el("div", { class: "trophy", text: "🏆" }),
      el("h1", {}, [el("span", { class: "em", text: title })]),
      scorebar(game, names),
      state.you.isHost ? el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Play again",
        onclick: () => send({ type: "rematch" }),
      }) : el("p", { class: "note", text: "Waiting for host…" }),
    ]);
  }

  function gameScreen() {
    const game = state.room.game;
    const you = state.you;
    if (game.status === "ended") return winScreen();
    if (game.phase === "psychic") {
      if (you.isPsychic) return psychicScreen();
      return waitScreen("Psychic's turn", "The Psychic is looking at the hidden zone and preparing a clue…");
    }
    if (game.phase === "guess") {
      if (you.role === "guesser") return guessScreen();
      return waitScreen("Guessing", "Guessers are turning their dials…");
    }
    if (game.phase === "reveal") return revealScreen();
    return lobbyScreen();
  }

  function render() {
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
    else app.replaceChildren(gameScreen());
    window.scrollTo(0, 0);
  }

  function boot() {
    parseRoute();
    render();
    if (routeCode) connect(routeCode);
    else if (ws) { try { ws.close(); } catch (_) {} ws = null; }
  }

  window.addEventListener("hashchange", boot);
  boot();
})();
