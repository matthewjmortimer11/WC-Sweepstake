/* Dial — online multiplayer client */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const LS = { pid: "dial.pid", name: "dial.name", clueBox: "dial.clueBox" };

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
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k === "disabled" && v === "disabled") n.disabled = true;
      else n.setAttribute(k, v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c != null && n.append(c));
    return n;
  };

  // Preserve the focused field (value + caret) across a full re-render, so an
  // incoming state broadcast doesn't wipe what you're typing (e.g. your name).
  function captureFocus() {
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.fkey != null && app.contains(a)) {
      const cap = { key: a.dataset.fkey, value: "value" in a ? a.value : null };
      try { cap.start = a.selectionStart; cap.end = a.selectionEnd; } catch (_) {}
      return cap;
    }
    return null;
  }

  function restoreFocus(cap) {
    if (!cap) return;
    const next = app.querySelector(`[data-fkey="${cap.key}"]`);
    if (!next) return;
    if (cap.value != null && "value" in next) next.value = cap.value;
    try { next.focus({ preventScroll: true }); } catch (_) { try { next.focus(); } catch (_) {} }
    if (cap.start != null) { try { next.setSelectionRange(cap.start, cap.end); } catch (_) {} }
  }

  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let localGuess = 50;
  let routeCode = null;
  let lastRouteCode = null;
  let localMode = false;
  let guessDragActive = false;
  let guessSendTimer = null;
  let pendingGuessValue = null;
  let clueSendTimer = null;
  let renameTimer = null;

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
    } catch (_) { return crypto.randomUUID().replace(/-/g, ""); }
  }

  function playerName() {
    try { return (localStorage.getItem(LS.name) || "").trim(); } catch (_) { return ""; }
  }

  function saveName(n) {
    try { localStorage.setItem(LS.name, n); } catch (_) {}
  }

  // Commit the name to the room as the player types (debounced), so it saves
  // without needing to blur the field.
  function queueRename(name) {
    clearTimeout(renameTimer);
    renameTimer = setTimeout(() => {
      if (name) send({ type: "rename", name });
    }, 250);
  }

  function clueBoxVisible() {
    try { return localStorage.getItem(LS.clueBox) === "1"; } catch (_) { return false; }
  }

  function setClueBoxVisible(on) {
    try { localStorage.setItem(LS.clueBox, on ? "1" : "0"); } catch (_) {}
  }

  function clueToggleButton() {
    const on = clueBoxVisible();
    return el("button", {
      type: "button",
      class: "clue-toggle" + (on ? " on" : ""),
      text: on ? "Text clue on" : "Text clue off",
      title: "Type a clue for players who aren't in the same room",
      onclick: () => {
        setClueBoxVisible(!on);
        render();
      },
    });
  }

  function clueReadout(text) {
    if (!text) return null;
    return el("div", { class: "clue-readout" }, [
      el("div", { class: "clue-readout__label", text: "Psychic's clue" }),
      document.createTextNode(text),
    ]);
  }

  function clueInput(value, onDraft) {
    const ta = el("textarea", {
      class: "in",
      maxlength: "200",
      rows: "2",
      "data-fkey": "clue",
      placeholder: "One-line clue — don't use the dial words",
      oninput: (e) => onDraft(e.target.value),
    });
    ta.value = value || "";
    return el("label", { class: "fl clue-box" }, [
      el("span", { text: "Type your clue (for remote players)" }),
      ta,
    ]);
  }

  function queueClueSend(text) {
    clearTimeout(clueSendTimer);
    clueSendTimer = setTimeout(() => send({ type: "setClue", text: (text || "").trim() }), 180);
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
    return `${location.origin}/wheel${q}#/room/${code}`;
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
    const text = `Join my Dial game — room ${code}`;
    if (navigator.share) {
      navigator.share({ title: "Dial — Wheesht", text, url })
        .then(() => toast("Invite sent"))
        .catch(() => copyText(url, "Invite link copied"));
      return;
    }
    copyText(url, "Invite link copied");
  }

  function updateNeedle(value) {
    const ln = document.getElementById("needle");
    if (!ln) return;
    const p = polar(R - 6, degForVal(value));
    ln.setAttribute("x2", p.x.toFixed(1));
    ln.setAttribute("y2", p.y.toFixed(1));
  }

  function flushGuessSend() {
    if (pendingGuessValue == null) return;
    send({ type: "setGuess", value: pendingGuessValue });
    pendingGuessValue = null;
  }

  function queueGuessSend(value) {
    pendingGuessValue = value;
    clearTimeout(guessSendTimer);
    guessSendTimer = setTimeout(flushGuessSend, 120);
  }

  function syncLiveNeedles(liveGuesses) {
    const gauge = document.querySelector(".gauge svg");
    if (!gauge) return;
    gauge.querySelectorAll(".needle--alt").forEach((n) => n.remove());
    const hub = gauge.querySelector(".hub");
    Object.values(liveGuesses || {}).forEach((v, i) => {
      const p = polar(R - 6, degForVal(v));
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "needle--alt");
      line.setAttribute("x1", String(CX));
      line.setAttribute("y1", String(CY));
      line.setAttribute("x2", p.x.toFixed(1));
      line.setAttribute("y2", p.y.toFixed(1));
      if (hub) gauge.insertBefore(line, hub);
      else gauge.appendChild(line);
    });
  }

  function updateGuessHud(game) {
    const live = game.liveGuesses || {};
    const locked = game.myLocked;
    const guessers = (game.guesserIds || []).length;
    const lockedCount = Object.keys(live).length + (locked ? 1 : 0);
    const note = document.querySelector("[data-dial-hint]");
    if (note) {
      note.textContent = locked
        ? "Locked in — waiting for others…"
        : "Move the dial, then lock in your guess.";
    }
    const tally = document.querySelector("[data-dial-tally]");
    if (tally) tally.textContent = `${lockedCount} of ${guessers} locked in`;
    syncLiveNeedles(live);
  }

  function copyRoomCode(code) {
    copyText(code, "Room code copied");
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    toast("Not connected — wait a moment and try again.");
    return false;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function parseRoute() {
    localMode = /^#\/local\b/i.test(location.hash || "");
    const m = location.hash.match(/^#\/room\/([A-Za-z0-9]+)/i);
    routeCode = localMode ? null : (m ? m[1].toUpperCase() : null);
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
        const game = msg.room.game;
        if (guessDragActive && game.phase === "guess" && state.you.role === "guesser") {
          updateGuessHud(game);
          return;
        }
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
    readNameFromUrl();
    const nameIn = el("input", { class: "in", maxlength: "24", value: playerName(), placeholder: "Your name",
      "data-fkey": "home-name", oninput: (e) => saveName(e.target.value.trim()) });
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
      el("button", {
        class: "btn btn--ghost btn--block", text: "One phone — pass it around",
        onclick: () => { location.hash = "#/local"; },
      }),
    ]);
  }

  function lobbyScreen() {
    const room = state.room;
    const you = state.you;
    const me = playerById(you.id) || you;
    const settings = room.settings;
    const game = room.game;
    const names = settings.teamNames || ["Team 1", "Team 2"];
    state.pendingSettings = {
      mode: settings.mode,
      targetScore: settings.targetScore,
      teamNames: [...names],
    };

    const nameIn = el("input", { class: "in", maxlength: "24", value: you.name || playerName(),
      "data-fkey": "lobby-name",
      oninput: (e) => { const v = e.target.value.trim(); saveName(v); queueRename(v); },
      onchange: (e) => { clearTimeout(renameTimer); send({ type: "rename", name: e.target.value.trim() }); } });

    const teamSeg = settings.mode === "teams" ? el("div", { class: "seg seg--2" }, [
      el("button", { class: you.team === "team0" ? "on" : "", text: names[0],
        onclick: () => send({ type: "setTeam", team: "team0" }) }),
      el("button", { class: you.team === "team1" ? "on" : "", text: names[1],
        onclick: () => send({ type: "setTeam", team: "team1" }) }),
    ]) : null;

    const hostBits = me.isHost ? [
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
      el("div", {
        class: "room-code",
        text: room.code,
        title: "Tap to copy code",
        style: "cursor:pointer",
        onclick: () => copyRoomCode(room.code),
      }),
      el("div", { class: "row" }, [
        el("button", {
          class: "btn btn--primary",
          text: "Share game link",
          onclick: () => shareRoomLink(room.code),
        }),
        el("button", {
          class: "btn btn--ghost",
          text: "Copy code",
          onclick: () => copyRoomCode(room.code),
        }),
      ]),
      el("p", { class: "note", text: "Send the link — friends land in this room with the code filled in." }),
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
    const clueOn = clueBoxVisible();
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Psychic — keep this hidden" }),
      clueToggleButton(),
      scorebar(game, game.teamNames),
      spectrumEl(game.spectrum),
      el("div", { class: "gauge", html: gaugeHTML({ showBands: true, showTarget: true, target }) }),
      el("p", { class: "note", text: clueOn
        ? "Type a clue below or say it out loud. Don't use the dial words."
        : "Give your team a one-line clue for where the gold zone sits. Don't say the dial words." }),
      clueOn ? clueInput(game.clue || "", (text) => queueClueSend(text)) : null,
      el("button", { class: "btn btn--primary btn--lg btn--block", text: "Ready — let guessers play →",
        onclick: (e) => {
          clearTimeout(clueSendTimer);
          if (clueOn) {
            const ta = e.target.closest(".panel")?.querySelector(".clue-box textarea");
            if (ta) send({ type: "setClue", text: ta.value.trim() });
          }
          send({ type: "psychicReady" });
        } }),
    ]);
  }

  function guessScreen() {
    const game = state.room.game;
    const you = state.you;
    const me = playerById(you.id) || you;
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
      onpointerdown: () => { guessDragActive = true; },
      onpointerup: (e) => {
        guessDragActive = false;
        localGuess = Number(e.target.value);
        clearTimeout(guessSendTimer);
        flushGuessSend();
      },
      onchange: (e) => {
        guessDragActive = false;
        localGuess = Number(e.target.value);
        clearTimeout(guessSendTimer);
        flushGuessSend();
      },
      oninput: (e) => {
        localGuess = Number(e.target.value);
        updateNeedle(localGuess);
        queueGuessSend(localGuess);
      },
    });

    const locked = game.myLocked;
    const guessers = (game.guesserIds || []).length;
    const lockedCount = Object.keys(live).length + (locked ? 1 : 0);

    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Turn the dial" }),
      scorebar(game, game.teamNames),
      spectrumEl(game.spectrum),
      clueReadout(game.clue),
      gauge,
      slider,
      el("p", { class: "note", "data-dial-hint": "", text: locked
        ? "Locked in — waiting for others…"
        : "Move the dial, then lock in your guess." }),
      locked ? null : el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: "Lock in guess",
        onclick: () => {
          clearTimeout(guessSendTimer);
          flushGuessSend();
          send({ type: "lockGuess" });
        },
      }),
      el("p", { class: "note", "data-dial-tally": "", text: `${lockedCount} of ${guessers} locked in` }),
    ]);
  }

  function waitScreen(title, note) {
    const game = state.room.game;
    const psychic = playerById(game.psychicId);
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: title }),
      scorebar(game, game.teamNames),
      spectrumEl(game.spectrum),
      clueReadout(game.clue),
      el("div", { class: "wait-panel" }, [
        el("p", { text: note }),
        psychic ? el("p", { class: "note", text: `Psychic: ${psychic.name}` }) : null,
      ]),
    ]);
  }

  function revealScreen() {
    const game = state.room.game;
    const me = playerById(state.you.id) || state.you;
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
      clueReadout(game.clue),
      el("div", { class: "gauge", html: gaugeHTML({
        showBands: true, showTarget: true, showGuess: false, target,
        extraNeedles,
      }) }),
      game.mode === "teams" && teamPts != null
        ? el("div", { class: "points" + (teamPts === 0 ? " zero" : ""), text: teamPts ? `+${teamPts} for the team` : "Missed it!" })
        : null,
      el("div", { class: "guess-list" }, rows),
      scorebar(game, game.teamNames),
      me.isHost
        ? el("button", { class: "btn btn--primary btn--lg btn--block", text: "Next round →",
            onclick: () => send({ type: "nextRound" }) })
        : el("p", { class: "note", text: "Waiting for host to continue…" }),
    ]);
  }

  function winScreen() {
    const game = state.room.game;
    const me = playerById(state.you.id) || state.you;
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
      me.isHost ? el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Play again",
        onclick: () => send({ type: "rematch" }),
      }) : el("p", { class: "note", text: "Waiting for host…" }),
    ]);
  }

  function gameScreen() {
    const game = state.room.game;
    const you = state.you;
    const me = playerById(you.id) || you;
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

  // ── local pass-the-phone (one shared device) ─────────────────────────────
  const SPECTRA = [
    ["Cold", "Hot"], ["Underrated", "Overrated"], ["Useless", "Useful"],
    ["Scary", "Not scary"], ["Cheap", "Expensive"], ["Round", "Pointy"],
    ["Fantasy", "Sci-fi"], ["Bad superpower", "Good superpower"],
    ["Forbidden", "Encouraged"], ["Common", "Rare"], ["Unhealthy", "Healthy"],
    ["Casual", "Formal"], ["Quiet", "Loud"], ["Old", "New"], ["Weird", "Normal"],
    ["Boring", "Exciting"], ["Temporary", "Permanent"], ["Introvert", "Extrovert"],
    ["Guilty pleasure", "Universally loved"], ["Hard to do", "Easy to do"],
    ["Smells bad", "Smells good"], ["A want", "A need"], ["Overrated food", "Underrated food"],
    ["Villain", "Hero"], ["Ugly", "Beautiful"], ["Cringe", "Cool"],
    ["Waste of money", "Worth it"], ["Childish", "Grown-up"], ["Calm", "Chaotic"],
    ["A chore", "A treat"], ["Forgettable", "Iconic"], ["Slow", "Fast"],
    ["Messy", "Tidy"], ["Cursed", "Blessed"], ["Basic", "Fancy"],
    ["Overshare", "Keep to yourself"], ["Soft", "Hard"], ["Dry", "Wet"],
    ["Light", "Heavy"], ["Tame", "Wild"], ["Quiet night in", "Big night out"],
    ["Low effort", "High effort"], ["A myth", "Real"], ["Awkward", "Smooth"],
  ];
  const pickSpectrum = () => SPECTRA[Math.floor(Math.random() * SPECTRA.length)];

  const local = {
    screen: "setup",
    teams: ["Team 1", "Team 2"],
    scores: [0, 0],
    turn: 0,
    targetScore: 10,
    spectrum: ["Cold", "Hot"],
    target: 50,
    guess: 50,
    points: 0,
    clue: "",
  };

  function localSpectrumEl() {
    return spectrumEl(local.spectrum);
  }

  function localScorebar() {
    return el("div", { class: "scorebar" }, [0, 1].map((i) =>
      el("div", { class: "team-score t" + (i + 1) + (local.turn === i ? " on" : "") }, [
        el("span", { class: "team-score__n", text: local.teams[i] }),
        el("span", { class: "team-score__v", text: String(local.scores[i]) }),
      ])
    ));
  }

  function localStartGame() {
    local.scores = [0, 0];
    local.turn = Math.floor(Math.random() * 2);
    localNewRound();
  }

  function localNewRound() {
    local.spectrum = pickSpectrum();
    local.target = 12 + Math.floor(Math.random() * 77);
    local.guess = 50;
    local.points = 0;
    local.clue = "";
    local.screen = "pass";
    renderLocal();
  }

  function localLockIn() {
    local.points = pointsFor(local.target, local.guess);
    local.scores[local.turn] += local.points;
    local.screen = "reveal";
    renderLocal();
  }

  function localNextRound() {
    const [a, b] = local.scores;
    if ((a >= local.targetScore || b >= local.targetScore) && a !== b) {
      local.screen = "win";
      renderLocal();
      return;
    }
    local.turn = 1 - local.turn;
    localNewRound();
  }

  function localSetupScreen() {
    const inputs = local.teams.map((name, i) =>
      el("label", { class: "fl" }, [
        el("span", { text: "Team " + (i + 1) + " name" }),
        el("input", {
          class: "in", maxlength: "18", value: name,
          oninput: (e) => { local.teams[i] = e.target.value; },
        }),
      ])
    );
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "One phone" }),
      el("h1", {}, [document.createTextNode("Read the "), el("span", { class: "em", text: "room." })]),
      el("p", { class: "lede", text: "Pass one device between teams. The Psychic sees a hidden zone on the dial and gives a one-line clue; their team turns the dial to find it. Closer to the middle of the zone = more points." }),
      ...inputs,
      el("label", { class: "fl" }, [
        el("span", { text: "Play to" }),
        el("div", { class: "seg" }, [10, 15, 20].map((n) =>
          el("button", {
            class: local.targetScore === n ? "on" : "",
            text: n + " pts",
            onclick: () => { local.targetScore = n; renderLocal(); },
          })
        )),
      ]),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: "Start game →",
        onclick: () => {
          local.teams = local.teams.map((n, i) => (n || "").trim() || ("Team " + (i + 1)));
          localStartGame();
        },
      }),
      el("button", {
        class: "btn btn--ghost btn--block",
        text: "← Online rooms",
        onclick: () => { location.hash = ""; },
      }),
    ]);
  }

  function localPassScreen() {
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Round" }),
      localScorebar(),
      el("p", { class: "note", text: local.teams[local.turn] + " — pass the phone to your Psychic only." }),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: "I'm the Psychic — reveal the zone",
        onclick: () => { local.screen = "psychic"; renderLocal(); },
      }),
      el("button", {
        class: "btn btn--ghost",
        text: "Edit teams",
        onclick: () => { local.screen = "setup"; renderLocal(); },
      }),
    ]);
  }

  function localPsychicScreen() {
    const clueOn = clueBoxVisible();
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Psychic — keep this hidden" }),
      clueToggleButton(),
      localSpectrumEl(),
      el("div", { class: "gauge", html: gaugeHTML({ showBands: true, showTarget: true, target: local.target }) }),
      el("p", { class: "note", text: clueOn
        ? "Type a clue below or say it out loud. Don't use the dial words."
        : "Give your team a one-line clue for where the gold zone sits on this scale. Don't say the dial words." }),
      clueOn ? clueInput(local.clue, (text) => { local.clue = text.trim(); }) : null,
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: "Hide & pass to team →",
        onclick: (e) => {
          if (clueOn) {
            const ta = e.target.closest(".panel")?.querySelector(".clue-box textarea");
            if (ta) local.clue = ta.value.trim();
          }
          local.guess = 50;
          local.screen = "guess";
          renderLocal();
        },
      }),
    ]);
  }

  function localGuessScreen() {
    const gauge = el("div", { class: "gauge", html: gaugeHTML({ showGuess: true, guess: local.guess }) });
    const slider = el("input", {
      type: "range", min: "0", max: "100", step: "1", value: String(local.guess),
      class: "slider", "aria-label": "Turn the dial",
      oninput: (e) => {
        local.guess = Number(e.target.value);
        updateNeedle(local.guess);
      },
    });
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: local.teams[local.turn] + " — turn the dial" }),
      localSpectrumEl(),
      clueReadout(local.clue),
      gauge,
      slider,
      el("p", { class: "note", text: "Discuss as a team, then lock in where you think the hidden zone is." }),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: "Lock in guess",
        onclick: localLockIn,
      }),
    ]);
  }

  function localRevealScreen() {
    const pts = local.points;
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Reveal" }),
      localSpectrumEl(),
      clueReadout(local.clue),
      el("div", { class: "gauge", html: gaugeHTML({
        showBands: true, showTarget: true, showGuess: true,
        target: local.target, guess: local.guess,
      }) }),
      el("div", {
        class: "points" + (pts === 0 ? " zero" : ""),
        text: pts === 0 ? "Missed it!" : "+" + pts + (pts === 1 ? " point" : " points"),
      }),
      localScorebar(),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: "Next round →",
        onclick: localNextRound,
      }),
    ]);
  }

  function localWinScreen() {
    const w = local.scores[0] >= local.scores[1] ? 0 : 1;
    return el("div", { class: "panel win" }, [
      el("div", { class: "trophy", text: "🏆" }),
      el("h1", {}, [el("span", { class: "em", text: local.teams[w] }), document.createTextNode(" win!")]),
      localScorebar(),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: "Play again",
        onclick: localStartGame,
      }),
      el("button", {
        class: "btn btn--ghost",
        text: "Edit teams",
        onclick: () => { local.screen = "setup"; renderLocal(); },
      }),
    ]);
  }

  // Restore the field being typed in; only scroll to top on a genuine screen
  // change (no field focused), so re-renders don't yank the view mid-type.
  function finishRender(cap) {
    if (cap) restoreFocus(cap);
    else window.scrollTo(0, 0);
  }

  function renderLocal() {
    const cap = captureFocus();
    const screen = local.screen === "setup" ? localSetupScreen()
      : local.screen === "pass" ? localPassScreen()
      : local.screen === "psychic" ? localPsychicScreen()
      : local.screen === "guess" ? localGuessScreen()
      : local.screen === "reveal" ? localRevealScreen()
      : localWinScreen();
    app.replaceChildren(screen);
    finishRender(cap);
  }

  function render() {
    if (localMode) {
      renderLocal();
      return;
    }
    const cap = captureFocus();
    if (!routeCode) {
      app.replaceChildren(homeScreen());
      if (cap) restoreFocus(cap);
      return;
    }
    if (!state.room) {
      app.replaceChildren(el("div", { class: "panel" }, [
        el("p", { class: "note", text: "Connecting to room…" }),
      ]));
      if (cap) restoreFocus(cap);
      return;
    }
    const game = state.room.game;
    if (game.status === "lobby") app.replaceChildren(lobbyScreen());
    else app.replaceChildren(gameScreen());
    finishRender(cap);
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
