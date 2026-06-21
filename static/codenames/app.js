/* ============================================================================
   Cipher — single-page client
   Vanilla JS, no framework. Manages routing (home ↔ room), the WebSocket
   connection, and full re-renders of the active screen on each state push.
   ========================================================================== */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const app = $("#app");
  const LS = {
    pid: "cipher.pid",
    name: "cipher.name",
    theme: "cipher.theme",
    tab: "cipher.tab",
  };

  // ── persistent identity ────────────────────────────────────────────────────
  function pid() {
    let v = localStorage.getItem(LS.pid);
    if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replace(/-/g, ""); localStorage.setItem(LS.pid, v); }
    return v;
  }
  const getName = () => localStorage.getItem(LS.name) || "";
  const setName = (n) => localStorage.setItem(LS.name, n);

  // ── theme ──────────────────────────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem(LS.theme) || "dark";
    document.documentElement.dataset.theme = saved;
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(LS.theme, next);
  }
  initTheme();

  // ── toasts ─────────────────────────────────────────────────────────────────
  function toast(msg, kind = "") {
    const stack = $("#toast-stack");
    const el = h(`<div class="toast ${kind}">${esc(msg)}</div>`);
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 320); }, 3200);
  }

  // ── tiny sound (web audio, no assets) ──────────────────────────────────────
  let actx = null;
  function beep(freq = 440, dur = 0.08, type = "sine", vol = 0.04) {
    if (state.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (_) { /* audio not available */ }
  }

  // ── client state ───────────────────────────────────────────────────────────
  const state = {
    route: "home",          // home | room
    code: null,
    ws: null,
    connected: false,
    room: null,             // server room snapshot
    you: null,
    packs: [], sizes: [5], timer: { min: 15, max: 300, step: 5 },
    tab: localStorage.getItem(LS.tab) || "players",
    settingsOpen: false,
    muted: false,
    reconnectTimer: null,
    reconnectDelay: 800,
    lastRevealCount: 0,
    lastStatus: null,
    draftSettings: null,
  };

  // ── routing ────────────────────────────────────────────────────────────────
  function parseRoute() {
    const m = location.hash.match(/^#\/room\/([A-Za-z0-9]+)/);
    if (m) { state.route = "room"; state.code = m[1].toUpperCase(); }
    else { state.route = "home"; state.code = null; }
  }
  window.addEventListener("hashchange", () => { parseRoute(); boot(); });

  // ── networking ─────────────────────────────────────────────────────────────
  function connect() {
    if (!state.code) return;
    closeSocket();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/play/ws/${encodeURIComponent(state.code)}`
      + `?pid=${encodeURIComponent(pid())}&name=${encodeURIComponent(getName())}`;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { scheduleReconnect(); return; }
    state.ws = ws;

    ws.onopen = () => { state.connected = true; state.reconnectDelay = 800; renderConnState(); };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      handleMessage(msg);
    };
    ws.onclose = () => {
      state.connected = false; renderConnState();
      if (state.route === "room") scheduleReconnect();
    };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (state.route === "room") connect();
    }, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 1.7, 8000);
  }

  function closeSocket() {
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
    if (state.ws) { try { state.ws.onclose = null; state.ws.close(); } catch (_) {} state.ws = null; }
  }

  function send(obj) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(obj));
    } else {
      toast("Reconnecting…", "");
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case "hello":
        state.code = msg.code; break;
      case "state":
        applyState(msg); break;
      case "error":
        toast(msg.message, "err"); beep(180, 0.12, "square"); break;
      case "fatal":
        toast(msg.message || "Connection closed.", "err");
        state.route = "home"; closeSocket();
        location.hash = ""; break;
      default: break;
    }
  }

  function applyState(msg) {
    const prev = state.room && state.room.game;
    state.room = msg.room;
    state.you = msg.you;
    const g = msg.room.game;

    // Sound + confetti cues from transitions.
    if (prev) {
      const revealed = g.cards.filter((c) => c.revealed).length;
      if (revealed > state.lastRevealCount) beep(520, 0.07, "triangle");
      state.lastRevealCount = revealed;
      if (g.status === "ended" && state.lastStatus !== "ended") {
        const youWin = state.you && g.winner === state.you.team;
        beep(youWin ? 740 : 220, 0.25, "sawtooth", 0.05);
        launchConfetti(g.winner);
      }
    } else {
      state.lastRevealCount = g.cards.filter((c) => c.revealed).length;
    }
    state.lastStatus = g.status;
    renderRoom();
  }

  // ── boot / render dispatch ───────────────────────────────────────────────────
  async function boot() {
    if (state.route === "home") {
      closeSocket();
      state.room = null; state.you = null; state.lastStatus = null;
      await ensurePacks();
      renderHome();
    } else {
      await ensurePacks();
      if (!state.room) renderRoomShell();
      connect();
    }
  }

  async function ensurePacks() {
    if (state.packs.length) return;
    try {
      const r = await fetch("/play/api/packs");
      const d = await r.json();
      state.packs = d.packs || [];
      state.sizes = d.sizes || [5];
      state.timer = d.timer || { min: 15, max: 300, step: 5 };
    } catch (_) { state.packs = []; }
  }

  // ============================================================================
  //  HOME
  // ============================================================================
  function renderHome() {
    app.innerHTML = "";
    const el = h(`
      <div class="home">
        <div class="topbar">
          <div class="brand">
            <span class="brand__mark">🕵️</span>
            <span class="brand__name"><b>CIPHER</b></span>
          </div>
          <button class="icon-btn" id="theme" title="Toggle theme" aria-label="Toggle light/dark theme">🌓</button>
        </div>

        <div class="home__hero">
          <span class="eyebrow">Real-time word-spy party game</span>
          <h1>Two spymasters.<br/>One grid of <span class="grad">secret agents</span>.<br/>Infinite mischief.</h1>
          <p class="lede">Cipher is a free, no-download take on the word-association classic — reimagined to be more customisable and more fun. Make a room, share the code, and out-clue your rivals.</p>
        </div>

        <div class="home__actions">
          <div class="panel action-card">
            <h3>🚀 Start a new game</h3>
            <p class="muted tiny">Pick a vibe, create a private room, invite your crew with a 4-letter code.</p>
            <div class="field">
              <label for="name1">Your name</label>
              <input class="input" id="name1" maxlength="24" placeholder="Agent…" value="${esc(getName())}" />
            </div>
            <button class="btn btn--primary btn--lg btn--block" id="create">Create game →</button>
            <button class="btn btn--lg btn--block mode-dark" id="create-dark">🔞 After Dark game</button>
            <p class="tiny muted" style="text-align:center; margin:0">Standard is family-friendly · After Dark is crude &amp; 18+</p>
          </div>
          <div class="panel action-card">
            <h3>🔑 Join with a code</h3>
            <p class="muted tiny">Got a room code from a friend? Drop in here.</p>
            <div class="field">
              <label for="name2">Your name</label>
              <input class="input" id="name2" maxlength="24" placeholder="Agent…" value="${esc(getName())}" />
            </div>
            <div class="join-row">
              <input class="input code-input" id="joincode" maxlength="6" placeholder="ABCD" aria-label="Room code" />
              <button class="btn btn--lg" id="join">Join</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <span class="eyebrow">Why it's more fun</span>
          <div class="features" style="margin-top:14px">
            <div class="feature"><span class="ico">🎛️</span><h4>Fully customisable</h4><p>4×4, 5×5 or 6×6 boards, optional turn timers, 1–3 assassins.</p></div>
            <div class="feature"><span class="ico">🃏</span><h4>Themed word packs</h4><p>Classic, Movies, Food, Sci-Fi, Emoji chaos, <b>After Dark (18+)</b> — or paste your own.</p></div>
            <div class="feature"><span class="ico">⚡</span><h4>Instant & real-time</h4><p>Live sync over WebSockets. Reconnects automatically if you drop.</p></div>
            <div class="feature"><span class="ico">💬</span><h4>Chat & reactions</h4><p>Trash-talk, emoji bursts and a running play-by-play log.</p></div>
            <div class="feature"><span class="ico">♿</span><h4>Accessible by design</h4><p>Colour-blind glyphs, keyboard play, reduced-motion support.</p></div>
            <div class="feature"><span class="ico">📱</span><h4>Plays anywhere</h4><p>Phones to big screens. No install, no sign-up, no cost.</p></div>
          </div>
        </div>

        <div class="home__foot">
          <span>Part of the Wheesht family · Built for game nights</span>
          <span class="tiny">Tip: one phone per player works great as a "spymaster screen".</span>
        </div>
      </div>`);
    app.appendChild(el);

    $("#theme").onclick = toggleTheme;
    const syncNames = (v) => { $("#name1").value = v; $("#name2").value = v; };
    $("#name1").oninput = (e) => { setName(e.target.value); $("#name2").value = e.target.value; };
    $("#name2").oninput = (e) => { setName(e.target.value); $("#name1").value = e.target.value; };

    const createGame = async (packId, btn, label) => {
      if (packId === "afterdark" &&
          !confirm("After Dark is an 18+ pack with crude, sexual and dark-humour content. Confirm everyone playing is 18 or over.")) {
        return;
      }
      btn.disabled = true; btn.textContent = "Creating…";
      setName($("#name1").value.trim());
      try {
        const r = await fetch("/play/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packId }),
        });
        const d = await r.json();
        location.hash = `#/room/${d.code}`;
      } catch (e) {
        toast("Couldn't create a room. Try again.", "err");
        btn.disabled = false; btn.textContent = label;
      }
    };
    $("#create").onclick = () => createGame("classic", $("#create"), "Create game →");
    $("#create-dark").onclick = () => createGame("afterdark", $("#create-dark"), "🔞 After Dark game");
    const doJoin = () => {
      const code = ($("#joincode").value || "").trim().toUpperCase();
      if (code.length < 4) { toast("Enter a 4-letter room code.", "err"); return; }
      setName($("#name2").value.trim());
      location.hash = `#/room/${code}`;
    };
    $("#join").onclick = doJoin;
    $("#joincode").addEventListener("keydown", (e) => { if (e.key === "Enter") doJoin(); });
    $("#joincode").oninput = (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  }

  // ============================================================================
  //  ROOM
  // ============================================================================
  function renderRoomShell() {
    app.innerHTML = "";
    app.appendChild(h(`<div class="empty" style="padding-top:30vh">Connecting to room <b>${esc(state.code)}</b>…</div>`));
  }

  function renderRoom() {
    if (!state.room) { renderRoomShell(); return; }
    const g = state.room.game;
    app.innerHTML = "";
    app.appendChild(topbar());
    if (g.status === "lobby") {
      app.appendChild(lobby());
    } else {
      app.appendChild(scoreboard());
      const grid = h(`<div class="game-grid"></div>`);
      const main = h(`<div class="board-wrap"></div>`);
      if (g.status === "ended") main.appendChild(winBanner());
      main.appendChild(board());
      main.appendChild(cluebar());
      grid.appendChild(main);
      grid.appendChild(sidePanel());
      app.appendChild(grid);
    }
    if (state.settingsOpen) app.appendChild(settingsModal());
    renderConnState();
  }

  function renderConnState() {
    const c = $("#conn");
    if (c) {
      c.classList.toggle("bad", !state.connected);
      c.querySelector(".lbl").textContent = state.connected ? "Live" : "Reconnecting…";
    }
  }

  function topbar() {
    const isHost = state.you && state.you.isHost;
    const el = h(`
      <div class="topbar">
        <div class="topbar__left">
          <button class="icon-btn" id="leave" title="Back to home" aria-label="Leave room">←</button>
          <span class="brand__mark">🕵️</span>
          <span class="room-code"><small>ROOM</small>${esc(state.room.code)}</span>
          <span class="conn" id="conn"><span class="dot"></span><span class="lbl">Live</span></span>
        </div>
        <div class="topbar__right">
          <button class="btn btn--sm" id="copy">🔗 Invite</button>
          <button class="icon-btn" id="mute" title="Toggle sound" aria-label="Toggle sound">${state.muted ? "🔇" : "🔊"}</button>
          ${isHost ? `<button class="btn btn--sm" id="settings">⚙️ Settings</button>` : ""}
          <button class="icon-btn" id="theme" title="Toggle theme" aria-label="Toggle theme">🌓</button>
        </div>
      </div>`);
    el.querySelector("#leave").onclick = () => { location.hash = ""; };
    el.querySelector("#theme").onclick = toggleTheme;
    el.querySelector("#mute").onclick = () => { state.muted = !state.muted; renderRoom(); };
    el.querySelector("#copy").onclick = copyInvite;
    const s = el.querySelector("#settings"); if (s) s.onclick = openSettings;
    return el;
  }

  function copyInvite() {
    const url = `${location.origin}/play#/room/${state.room.code}`;
    const done = () => toast("Invite link copied!", "ok");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
    } else { fallbackCopy(url, done); }
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (_) { toast(text, ""); }
    ta.remove();
  }

  // ── lobby ────────────────────────────────────────────────────────────────
  function lobby() {
    const players = state.room.players;
    const you = state.you;
    const reds = players.filter((p) => p.team === "red");
    const blues = players.filter((p) => p.team === "blue");
    const specs = players.filter((p) => p.team === "spectator");
    const st = state.room.settings;

    const wrap = h(`<div style="display:grid; gap:18px"></div>`);

    wrap.appendChild(h(`
      <div class="hint-banner">
        <span>🎯</span>
        <span>Pick a team and a role. Each team needs a <b>spymaster</b> (gives clues) and at least one <b>operative</b> (guesses). Share the room code to invite friends.</span>
      </div>`));

    const teams = h(`<div class="lobby-teams"></div>`);
    teams.appendChild(teamCard("red", "🔴 Red Team", reds, you));
    teams.appendChild(teamCard("blue", "🔵 Blue Team", blues, you));
    wrap.appendChild(teams);

    // Spectators + your name
    const meRow = h(`
      <div class="panel" style="display:grid; gap:14px">
        <div class="team-head"><h3>👁️ Spectators</h3>
          <button class="btn btn--sm" id="spec">Spectate</button></div>
        <div class="roster" id="specroster"></div>
        <div class="field" style="max-width:320px">
          <label for="myname">Your name</label>
          <div class="join-row">
            <input class="input" id="myname" maxlength="24" value="${esc(you ? you.name : "")}" />
            <button class="btn btn--sm" id="savename">Save</button>
          </div>
        </div>
      </div>`);
    const sr = meRow.querySelector("#specroster");
    if (specs.length) specs.forEach((p) => sr.appendChild(playerChip(p, you)));
    else sr.appendChild(h(`<div class="empty">No spectators</div>`));
    meRow.querySelector("#spec").onclick = () => send({ type: "setTeam", team: "spectator" });
    meRow.querySelector("#savename").onclick = () => {
      const v = meRow.querySelector("#myname").value.trim();
      if (v) { setName(v); send({ type: "rename", name: v }); toast("Name updated", "ok"); }
    };
    wrap.appendChild(meRow);

    // Settings summary + start
    const startRow = h(`
      <div class="panel" style="display:grid; gap:14px">
        <div class="team-head">
          <h3>⚙️ Match setup</h3>
          ${you && you.isHost ? `<button class="btn btn--sm" id="editset">Edit</button>` : `<span class="tiny muted">Host controls setup</span>`}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <span class="badge">${st.boardSize}×${st.boardSize} board</span>
          <span class="badge">${st.hasCustom ? "Custom words" : esc(st.packName)}</span>
          <span class="badge">${st.turnSeconds ? st.turnSeconds + "s turns" : "No timer"}</span>
          <span class="badge">${st.assassins} assassin${st.assassins > 1 ? "s" : ""}</span>
        </div>
        ${you && you.isHost
          ? `<button class="btn btn--primary btn--lg btn--block" id="start">▶ Start game</button>`
          : `<div class="empty">Waiting for the host to start…</div>`}
      </div>`);
    const es = startRow.querySelector("#editset"); if (es) es.onclick = openSettings;
    const sb = startRow.querySelector("#start");
    if (sb) sb.onclick = () => send({ type: "start" });
    wrap.appendChild(startRow);

    return wrap;
  }

  function teamCard(team, title, members, you) {
    const onTeam = you && you.team === team;
    const card = h(`
      <div class="panel team-card ${team}">
        <h3>${title} <span class="tiny muted">${members.length}</span></h3>
        <div class="roster"></div>
        <div class="ctas">
          <button class="btn btn--sm btn--${team}" data-act="join">Join ${team}</button>
          <button class="btn btn--sm" data-act="spy" ${onTeam ? "" : "disabled"}>🎩 Be spymaster</button>
          <button class="btn btn--sm" data-act="op" ${onTeam ? "" : "disabled"}>🔍 Be operative</button>
        </div>
      </div>`);
    const roster = card.querySelector(".roster");
    if (members.length) members.forEach((p) => roster.appendChild(playerChip(p, you)));
    else roster.appendChild(h(`<div class="empty">No agents yet</div>`));
    card.querySelector('[data-act="join"]').onclick = () => send({ type: "setTeam", team });
    card.querySelector('[data-act="spy"]').onclick = () => send({ type: "setRole", role: "spymaster" });
    card.querySelector('[data-act="op"]').onclick = () => send({ type: "setRole", role: "operative" });
    return card;
  }

  function playerChip(p, you) {
    const initials = (p.name || "?").trim().slice(0, 2).toUpperCase();
    const isYou = you && p.id === you.id;
    return h(`
      <div class="player-chip ${p.role === "spymaster" ? "spy" : ""} ${isYou ? "you" : ""}">
        <span class="av" style="background:${esc(p.color)}">${esc(initials)}</span>
        <span class="nm ${p.connected ? "" : "off"}">${esc(p.name)}${isYou ? " (you)" : ""}</span>
        ${p.isHost ? `<span class="tag" title="Host">👑</span>` : ""}
        <span class="tag">${p.role === "spymaster" ? "🎩 Spy" : "🔍 Op"}</span>
      </div>`);
  }

  // ── scoreboard ───────────────────────────────────────────────────────────
  function scoreboard() {
    const g = state.room.game;
    const active = g.status === "playing" ? g.currentTeam : null;
    const el = h(`
      <div class="scoreboard">
        <div class="team-score team-score--red ${active === "red" ? "active" : ""}">
          <span class="num">${g.remaining.red}</span>
          <div class="meta"><b>Red</b><span class="tiny muted">agents left</span></div>
        </div>
        <div class="turn-pill">
          ${g.status === "ended"
            ? `<span class="who">Game over</span>`
            : `<span class="who" style="color:${g.currentTeam === "red" ? "var(--red)" : "var(--blue)"}">${g.currentTeam === "red" ? "Red" : "Blue"} to ${g.phase === "clue" ? "clue" : "guess"}</span>`}
          <span class="timer" id="timer"></span>
        </div>
        <div class="team-score team-score--blue ${active === "blue" ? "active" : ""}">
          <div class="meta" style="text-align:right"><b>Blue</b><span class="tiny muted">agents left</span></div>
          <span class="num">${g.remaining.blue}</span>
        </div>
      </div>`);
    return el;
  }

  // ── board ────────────────────────────────────────────────────────────────
  function board() {
    const g = state.room.game;
    const you = state.you;
    const isEmoji = state.room.settings.packId === "emoji" && !state.room.settings.hasCustom;
    const canGuess = you && g.status === "playing" && g.phase === "guess"
      && you.team === g.currentTeam && you.role === "operative";

    const grid = h(`<div class="board" style="--cols:${g.board_size}" role="grid" aria-label="Word board"></div>`);
    g.cards.forEach((c) => {
      const hidden = c.kind === "hidden";
      const classes = ["cardx"];
      if (isEmoji) classes.push("emoji");
      if (c.revealed) { classes.push("revealed", "kind-" + c.kind); }
      else if (!hidden) { classes.push("hint-" + c.kind); } // spymaster view
      if (canGuess && !c.revealed) classes.push("clickable");

      const glyph = !c.revealed && !hidden ? glyphFor(c.kind) : (c.revealed ? glyphFor(c.kind) : "");
      const btn = h(`
        <button class="${classes.join(" ")}" ${canGuess && !c.revealed ? "" : "tabindex=\"-1\""}
          role="gridcell" aria-label="${esc(c.word)}${c.revealed ? ", " + c.kind : ""}">
          ${glyph ? `<span class="glyph">${glyph}</span>` : ""}
          <span class="word">${esc(c.word)}</span>
        </button>`);
      if (canGuess && !c.revealed) {
        btn.onclick = () => send({ type: "guess", index: c.i });
      } else if (!canGuess) {
        btn.disabled = true; btn.style.cursor = "default";
      }
      grid.appendChild(btn);
    });
    return grid;
  }

  function glyphFor(kind) {
    return { red: "🔴", blue: "🔵", neutral: "⚪", assassin: "💀", hidden: "" }[kind] || "";
  }

  // ── clue bar ─────────────────────────────────────────────────────────────
  function cluebar() {
    const g = state.room.game;
    const you = state.you;
    if (g.status === "ended") {
      const el = h(`<div class="panel cluebar">
        ${you && you.isHost
          ? `<button class="btn btn--primary" id="again">🔄 Play again</button><button class="btn" id="tolobby">⚙️ Back to lobby</button>`
          : `<span class="muted">Waiting for the host to start a new round…</span>`}
      </div>`);
      const a = el.querySelector("#again"); if (a) a.onclick = () => send({ type: "start" });
      const l = el.querySelector("#tolobby"); if (l) l.onclick = () => send({ type: "reset" });
      return el;
    }

    const isActiveSpy = you && you.role === "spymaster" && you.team === g.currentTeam;
    const isActiveOp = you && you.role === "operative" && you.team === g.currentTeam;

    // Spymaster giving a clue
    if (g.phase === "clue" && isActiveSpy) {
      const el = h(`
        <div class="panel cluebar">
          <form class="clue-form" id="clueform">
            <div class="field">
              <label for="clueword">Your clue (one word)</label>
              <input class="input" id="clueword" maxlength="40" autocomplete="off" placeholder="e.g. OCEAN" />
            </div>
            <div class="field" style="flex:0 0 110px">
              <label for="cluenum">Number</label>
              <select class="select" id="cluenum">
                ${[0,1,2,3,4,5,6,7,8,9].map((n) => `<option value="${n}">${n === 0 ? "∞ (0)" : n}</option>`).join("")}
              </select>
            </div>
            <button class="btn btn--primary" type="submit">Give clue →</button>
          </form>
        </div>`);
      el.querySelector("#clueform").onsubmit = (e) => {
        e.preventDefault();
        const word = el.querySelector("#clueword").value.trim();
        const count = parseInt(el.querySelector("#cluenum").value, 10) || 0;
        if (!word) { toast("Enter a clue word.", "err"); return; }
        send({ type: "clue", word, count });
      };
      return el;
    }

    // Clue is shown to everyone during guessing
    if (g.clue) {
      const el = h(`
        <div class="panel cluebar">
          <div class="clue-display">
            <span class="tiny muted">${g.currentTeam === "red" ? "Red" : "Blue"} clue</span>
            <span class="clue-word">${esc(g.clue.word)}</span>
            <span class="clue-num">${g.clue.count === 0 ? "∞" : g.clue.count}</span>
            <span class="guesses-left">${g.guessesLeft == null ? "unlimited guesses" : `<b>${g.guessesLeft}</b> guess${g.guessesLeft === 1 ? "" : "es"} left`}</span>
          </div>
          ${isActiveOp ? `<button class="btn btn--danger" id="pass">⏭ End turn</button>` : ""}
        </div>`);
      const p = el.querySelector("#pass"); if (p) p.onclick = () => send({ type: "endTurn" });
      return el;
    }

    // Waiting for the other side
    const waitFor = g.currentTeam === "red" ? "Red" : "Blue";
    return h(`<div class="panel cluebar"><span class="muted">⏳ Waiting for the ${waitFor} spymaster's clue…</span></div>`);
  }

  // ── side panel ───────────────────────────────────────────────────────────
  function sidePanel() {
    const el = h(`
      <div class="side">
        <div class="tabs" role="tablist">
          <button role="tab" data-tab="players" aria-selected="${state.tab === "players"}">Teams</button>
          <button role="tab" data-tab="log" aria-selected="${state.tab === "log"}">Log</button>
          <button role="tab" data-tab="chat" aria-selected="${state.tab === "chat"}">Chat</button>
        </div>
        <div class="panel" id="tabbody"></div>
      </div>`);
    el.querySelectorAll("[data-tab]").forEach((b) => {
      b.onclick = () => { state.tab = b.dataset.tab; localStorage.setItem(LS.tab, state.tab); renderRoom(); };
    });
    const body = el.querySelector("#tabbody");
    if (state.tab === "players") body.appendChild(playersTab());
    else if (state.tab === "log") body.appendChild(logTab());
    else body.appendChild(chatTab());
    return el;
  }

  function playersTab() {
    const players = state.room.players;
    const you = state.you;
    const wrap = h(`<div style="display:grid; gap:16px"></div>`);
    [["red", "🔴 Red"], ["blue", "🔵 Blue"]].forEach(([team, label]) => {
      const members = players.filter((p) => p.team === team)
        .sort((a, b) => (a.role === "spymaster" ? 0 : 1) - (b.role === "spymaster" ? 0 : 1));
      const col = h(`<div class="team-col"><div class="team-head ${team}"><h3>${label}</h3></div><div class="roster"></div></div>`);
      const r = col.querySelector(".roster");
      if (members.length) members.forEach((p) => r.appendChild(playerChip(p, you)));
      else r.appendChild(h(`<div class="empty">Nobody</div>`));
      wrap.appendChild(col);
    });
    const specs = players.filter((p) => p.team === "spectator");
    if (specs.length) {
      const col = h(`<div class="team-col"><div class="team-head"><h3>👁️ Spectators</h3></div><div class="roster"></div></div>`);
      const r = col.querySelector(".roster");
      specs.forEach((p) => r.appendChild(playerChip(p, you)));
      wrap.appendChild(col);
    }
    return wrap;
  }

  function logTab() {
    const log = state.room.game.log || [];
    const feed = h(`<div class="feed" id="feed"></div>`);
    if (!log.length) { feed.appendChild(h(`<div class="empty">No moves yet.</div>`)); return feed; }
    log.slice().reverse().forEach((l) => {
      feed.appendChild(h(`<div class="log-line ${l.team || ""} ${l.t === "end" ? "end" : ""}">${esc(l.text)}</div>`));
    });
    return feed;
  }

  function chatTab() {
    const chat = state.room.chat || [];
    const wrap = h(`<div style="display:grid; gap:10px"></div>`);
    const feed = h(`<div class="feed" id="chatfeed"></div>`);
    if (!chat.length) feed.appendChild(h(`<div class="empty">Say hello 👋</div>`));
    chat.forEach((m) => {
      if (m.kind === "reaction") {
        feed.appendChild(h(`<div class="chat-msg reaction"><span class="nm" style="color:${esc(m.color)}">${esc(m.name)}</span><span class="tx">${esc(m.text)}</span></div>`));
      } else {
        feed.appendChild(h(`<div class="chat-msg"><span class="nm" style="color:${esc(m.color)}">${esc(m.name)}:</span><span class="tx">${esc(m.text)}</span></div>`));
      }
    });
    wrap.appendChild(feed);

    const bar = h(`<div class="reaction-bar"></div>`);
    ["🎉","😂","😱","🔥","🧠","💀","👏","🤔","😎","❤️"].forEach((e) => {
      const b = h(`<button title="React">${e}</button>`);
      b.onclick = () => send({ type: "reaction", emoji: e });
      bar.appendChild(b);
    });
    wrap.appendChild(bar);

    const form = h(`<form class="chat-form"><input class="input" id="chatin" maxlength="300" placeholder="Message…" autocomplete="off" /><button class="btn btn--sm btn--primary" type="submit">Send</button></form>`);
    form.onsubmit = (e) => {
      e.preventDefault();
      const inp = form.querySelector("#chatin");
      const text = inp.value.trim();
      if (text) { send({ type: "chat", text }); inp.value = ""; }
    };
    wrap.appendChild(form);
    // Scroll to bottom after paint.
    setTimeout(() => { const f = $("#chatfeed"); if (f) f.scrollTop = f.scrollHeight; }, 0);
    return wrap;
  }

  // ── win banner ───────────────────────────────────────────────────────────
  function winBanner() {
    const g = state.room.game;
    const w = g.winner;
    const youWin = state.you && state.you.team === w;
    return h(`
      <div class="panel win-banner ${w}">
        <div class="trophy">${g.winReason === "assassin" ? "💀" : "🏆"}</div>
        <h2>${w === "red" ? "Red" : "Blue"} wins!</h2>
        <p class="muted">${g.winReason === "assassin" ? "The enemy struck the assassin." : "All their agents were found."} ${youWin ? "That's your team — nice work, agent. 🎉" : ""}</p>
      </div>`);
  }

  // ── settings modal ───────────────────────────────────────────────────────
  function openSettings() {
    const st = state.room.settings;
    state.draftSettings = {
      boardSize: st.boardSize, packId: st.packId, turnSeconds: st.turnSeconds,
      assassins: st.assassins, customWords: st.customWords || "",
    };
    state.settingsOpen = true;
    renderRoom();
  }

  function settingsModal() {
    const d = state.draftSettings;
    const scrim = h(`<div class="scrim" id="scrim"></div>`);
    const modal = h(`
      <div class="panel modal">
        <div class="modal__head">
          <h2>⚙️ Match setup</h2>
          <button class="icon-btn" id="closeset" aria-label="Close">✕</button>
        </div>
        <div class="settings-grid">
          <div class="field">
            <label>Word pack</label>
            <div class="pack-grid" id="packs"></div>
          </div>
          <div class="field">
            <label for="custom">…or paste your own words (comma or line separated)</label>
            <textarea class="input" id="custom" placeholder="apple, rocket, banana, …">${esc(d.customWords)}</textarea>
            <span class="tiny muted">Leave blank to use the pack above. Needs at least board-size² words.</span>
          </div>
          <div class="field">
            <label>Board size</label>
            <div class="segmented" id="sizes">
              ${state.sizes.map((s) => `<button data-v="${s}" aria-pressed="${s === d.boardSize}">${s}×${s}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <div class="timer-head">
              <label for="timerrange">Turn timer</label>
              <label class="switch">
                <input type="checkbox" id="timeron" ${d.turnSeconds > 0 ? "checked" : ""} />
                <span class="track"><span class="thumb"></span></span>
                <span class="switch-lbl" id="timerstate">${d.turnSeconds > 0 ? "On" : "Off"}</span>
              </label>
            </div>
            <div class="slider-row" id="sliderrow" ${d.turnSeconds > 0 ? "" : "data-disabled=\"1\""}>
              <input type="range" id="timerrange" min="${state.timer.min}" max="${state.timer.max}" step="${state.timer.step}"
                value="${d.turnSeconds > 0 ? d.turnSeconds : 60}" ${d.turnSeconds > 0 ? "" : "disabled"}
                aria-label="Seconds per turn" />
              <output class="slider-val" id="timerval">${d.turnSeconds > 0 ? d.turnSeconds + "s" : "Off"}</output>
            </div>
            <span class="tiny muted">No timer means relaxed, turn-when-you're-ready play. Slide to set seconds per turn.</span>
          </div>
          <div class="field">
            <label>Assassins</label>
            <div class="segmented" id="assassins">
              ${[1,2,3].map((a) => `<button data-v="${a}" aria-pressed="${a === d.assassins}">${a}</button>`).join("")}
            </div>
          </div>
          <button class="btn btn--primary btn--lg btn--block" id="applyset">Save setup</button>
        </div>
      </div>`);

    // Pack grid
    const pg = modal.querySelector("#packs");
    state.packs.forEach((p) => {
      const b = h(`<button class="pack-opt" data-v="${p.id}" aria-pressed="${p.id === d.packId}">
        <span class="pemoji">${p.emoji}</span><b>${esc(p.name)}</b><small>${esc(p.blurb)}</small></button>`);
      b.onclick = () => { d.packId = p.id; pg.querySelectorAll(".pack-opt").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === p.id)); };
      pg.appendChild(b);
    });

    const seg = (id, key, cast) => {
      modal.querySelectorAll(`#${id} button`).forEach((b) => {
        b.onclick = () => { d[key] = cast(b.dataset.v); modal.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute("aria-pressed", cast(x.dataset.v) === d[key])); };
      });
    };
    seg("sizes", "boardSize", Number);
    seg("assassins", "assassins", Number);

    // Optional turn timer: a toggle that enables a seconds slider.
    const timerOn = modal.querySelector("#timeron");
    const range = modal.querySelector("#timerrange");
    const valOut = modal.querySelector("#timerval");
    const stateLbl = modal.querySelector("#timerstate");
    const sliderRow = modal.querySelector("#sliderrow");
    const syncTimer = () => {
      const on = timerOn.checked;
      range.disabled = !on;
      sliderRow.toggleAttribute("data-disabled", !on);
      stateLbl.textContent = on ? "On" : "Off";
      d.turnSeconds = on ? Number(range.value) : 0;
      valOut.textContent = on ? range.value + "s" : "Off";
    };
    timerOn.onchange = syncTimer;
    range.oninput = syncTimer;

    const close = () => { state.settingsOpen = false; renderRoom(); };
    modal.querySelector("#closeset").onclick = close;
    scrim.onclick = (e) => { if (e.target === scrim) close(); };
    modal.querySelector("#custom").oninput = (e) => { d.customWords = e.target.value; };
    modal.querySelector("#applyset").onclick = () => {
      send({ type: "settings", settings: {
        boardSize: d.boardSize, packId: d.packId, turnSeconds: d.turnSeconds,
        assassins: d.assassins, customWords: d.customWords,
      } });
      state.settingsOpen = false;
      toast("Setup saved", "ok");
      renderRoom();
    };

    scrim.appendChild(modal);
    return scrim;
  }

  // ── timer tick ─────────────────────────────────────────────────────────────
  setInterval(() => {
    const t = $("#timer");
    if (!t || !state.room) return;
    const g = state.room.game;
    if (g.status !== "playing" || !g.turnDeadline) { t.textContent = ""; return; }
    const left = Math.max(0, Math.round((g.turnDeadline - Date.now()) / 1000));
    t.textContent = `⏱ ${left}s`;
    t.classList.toggle("low", left <= 10);
  }, 250);

  // ── keyboard escape to close settings ──────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.settingsOpen) { state.settingsOpen = false; renderRoom(); }
  });

  // ── confetti ─────────────────────────────────────────────────────────────
  function launchConfetti(team) {
    const cvs = $("#confetti");
    if (!cvs || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cvs.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    cvs.width = innerWidth * dpr; cvs.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const colors = team === "red" ? ["#ff5d5d", "#c2304a", "#ffd0d0"]
      : team === "blue" ? ["#4cc4ff", "#2a6ed6", "#d0f0ff"]
      : ["#b8a6ff", "#ffd166", "#06d6a0"];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
      r: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0],
      vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, rot: Math.random() * 6.28,
      vr: -0.2 + Math.random() * 0.4,
    }));
    let frames = 0;
    (function anim() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.04;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.5); ctx.restore();
      });
      frames++;
      if (frames < 220) requestAnimationFrame(anim);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  // ── go ──────────────────────────────────────────────────────────────────────
  parseRoute();
  boot();
})();
