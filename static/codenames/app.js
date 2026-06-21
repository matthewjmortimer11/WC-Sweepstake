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
    token: "cipher.authToken",
    user: "cipher.authUser",
    league: "cipher.league",
  };

  function userLabel(u) {
    if (!u) return "Agent";
    return (u.label || u.nickname || u.displayName || "Agent").trim() || "Agent";
  }

  const DEFAULT_TEAM_NAMES = { red: "Field Crew", blue: "The Desk" };

  function teamNamesMap() {
    const st = state.room && state.room.settings;
    const n = (st && st.teamNames) || DEFAULT_TEAM_NAMES;
    return {
      red: ((n.red || DEFAULT_TEAM_NAMES.red).trim()) || DEFAULT_TEAM_NAMES.red,
      blue: ((n.blue || DEFAULT_TEAM_NAMES.blue).trim()) || DEFAULT_TEAM_NAMES.blue,
    };
  }

  function teamName(team) {
    const n = teamNamesMap();
    if (team === "red") return n.red;
    if (team === "blue") return n.blue;
    return team;
  }

  function teamMark(team) {
    return teamName(team).trim().slice(0, 1).toUpperCase() || "?";
  }

  function canEditTeamName(team, you) {
    if (!you || !state.room || state.room.game.status !== "lobby") return false;
    return you.isHost || you.team === team;
  }

  function avatarImg(u, cls, alt) {
    const url = u && u.avatarUrl;
    const c = cls || "social-user__av";
    if (url) {
      return `<img class="${c}" src="${esc(url)}" alt="${esc(alt || "")}" loading="lazy" decoding="async" />`;
    }
    return `<span class="${c} social-user__av--ph" aria-hidden="true">👤</span>`;
  }

  function resizeImageToDataUrl(file, size, cb) {
    const s = size || 256;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = s;
        canvas.height = s;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(s / img.width, s / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
        try { cb(canvas.toDataURL("image/jpeg", 0.82)); } catch (_) { cb(null); }
      };
      img.onerror = () => cb(null);
      img.src = fr.result;
    };
    fr.onerror = () => cb(null);
    fr.readAsDataURL(file);
  }

  function socialListUser(u, extra) {
    return `<span class="social-list__who">${avatarImg(u, "social-list__av", userLabel(u))}<span>${esc(userLabel(u))}${extra || ""}</span></span>`;
  }

  function agentCounts(boardSize, assassins) {
    const bs = String(boardSize);
    const a = String(assassins);
    if (state.agentPreviews && state.agentPreviews[bs] && state.agentPreviews[bs][a]) {
      return state.agentPreviews[bs][a];
    }
    const total = boardSize * boardSize;
    const maxAss = Math.min(5, Math.max(1, total - 4));
    const eff = Math.max(1, Math.min(assassins, maxAss));
    const field = total - eff;
    const base = Math.floor(field / 3);
    const starting = base + 1;
    const second = base;
    return {
      startingTeamAgents: starting,
      otherTeamAgents: second,
      neutral: field - starting - second,
      assassins: eff,
    };
  }

  function maxAssassinsForBoard(boardSize) {
    const v = state.maxAssassins && state.maxAssassins[String(boardSize)];
    return v || Math.min(5, Math.max(1, boardSize * boardSize - 4));
  }

  function agentCountsLabel(counts) {
    if (!counts) return "";
    const pl = counts.assassins === 1 ? "" : "s";
    return `${counts.startingTeamAgents} vs ${counts.otherTeamAgents} agents (+1 to starting team) · ${counts.neutral} neutral · ${counts.assassins} assassin${pl}`;
  }

  function teamScoreNum(team, g) {
    const rem = g.remaining[team];
    const tot = (g.totals && g.totals[team]) || rem;
    return `<span class="num">${rem}<span class="score-denom">/${tot}</span></span>`;
  }

  function getActiveLeague() {
    try {
      const raw = localStorage.getItem(LS.league);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function setActiveLeague(league) {
    if (league && league.code) localStorage.setItem(LS.league, JSON.stringify(league));
    else localStorage.removeItem(LS.league);
    state.activeLeague = league || null;
  }

  // ── persistent identity ────────────────────────────────────────────────────
  function pid() {
    let v = localStorage.getItem(LS.pid);
    if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replace(/-/g, ""); localStorage.setItem(LS.pid, v); }
    return v;
  }
  const getName = () => localStorage.getItem(LS.name) || "";
  const setName = (n) => localStorage.setItem(LS.name, n);

  function nameFromUrl() {
    try {
      const q = new URLSearchParams(location.search).get("name");
      return q ? q.trim().slice(0, 24) : "";
    } catch (_) { return ""; }
  }

  function initNameFromUrl() {
    const fromUrl = nameFromUrl();
    if (fromUrl && !getName()) setName(fromUrl);
  }
  initNameFromUrl();

  const getCipherToken = () => localStorage.getItem(LS.token) || "";
  function setAuth(token, user) {
    if (token) localStorage.setItem(LS.token, token);
    else localStorage.removeItem(LS.token);
    if (user) localStorage.setItem(LS.user, JSON.stringify(user));
    else localStorage.removeItem(LS.user);
    state.authUser = user || null;
  }
  function loadAuthUser() {
    try {
      const raw = localStorage.getItem(LS.user);
      state.authUser = raw ? JSON.parse(raw) : null;
    } catch (_) {
      state.authUser = null;
      localStorage.removeItem(LS.user);
    }
  }

  function clearAuth() {
    setAuth(null, null);
    state.social = null;
  }

  async function authFetch(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    const tok = getCipherToken();
    if (tok) headers["X-Cipher-Token"] = tok;
    return fetch(path, Object.assign({}, opts, { headers }));
  }

  function formatSecs(s) {
    if (s == null || s === undefined) return "—";
    const n = Number(s);
    if (!Number.isFinite(n)) return "—";
    const m = Math.floor(n / 60);
    const sec = Math.round(n % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  async function ensureConfig() {
    if (state.config) return state.config;
    try {
      const r = await fetch("/play/api/config");
      state.config = await r.json();
    } catch (_) { state.config = { authEnabled: false }; }
    return state.config;
  }

  async function initGoogleSignIn() {
    const cfg = await ensureConfig();
    if (!cfg.authEnabled || !cfg.googleClientId) return false;
    if (!window.google || !window.google.accounts) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    window.google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: async (resp) => {
        try {
          const r = await fetch("/play/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: resp.credential }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.detail || "Sign-in failed");
          setAuth(d.token, d.user);
          const label = userLabel(d.user);
          if (label) setName(label);
          toast(`Welcome, ${label}`, "ok");
          if (state.route === "room" && state.code) connect();
          else boot();
        } catch (e) {
          toast(e.message || "Sign-in failed", "err");
        }
      },
    });
    return true;
  }

  async function fetchJsonOrAuth(path, opts) {
    const r = await authFetch(path, opts);
    if (r.status === 401) return { __auth: true };
    if (!r.ok) return null;
    return r.json();
  }

  async function fetchLeagueData(code) {
    if (!code) return null;
    try {
      const [standings, games] = await Promise.all([
        fetch(`/play/api/leagues/${encodeURIComponent(code)}/standings`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/play/api/leagues/${encodeURIComponent(code)}/games`).then((r) => (r.ok ? r.json() : null)),
      ]);
      return { standings, games };
    } catch (_) { return null; }
  }

  async function fetchSocialData() {
    if (!getCipherToken()) return null;
    try {
      const [stats, recent, pairings, friends, leaderboard] = await Promise.all([
        fetchJsonOrAuth("/play/api/me/stats"),
        fetchJsonOrAuth("/play/api/me/recent"),
        fetchJsonOrAuth("/play/api/me/pairings"),
        fetchJsonOrAuth("/play/api/me/friends"),
        fetch("/play/api/leaderboard").then((r) => (r.ok ? r.json() : null)),
      ]);
      if ([stats, recent, pairings, friends].some((x) => x && x.__auth)) {
        clearAuth();
        return null;
      }
      return { stats, recent, pairings, friends, leaderboard };
    } catch (_) { return null; }
  }

  // ── theme ──────────────────────────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem(LS.theme) || "light";
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
    agentPreviews: null, maxAssassins: null,
    tab: localStorage.getItem(LS.tab) || "players",
    settingsOpen: false,
    settingsSavePending: false,
    reconnectTimer: null,
    reconnectDelay: 800,
    lastRevealCount: 0,
    lastRevealedAt: {},       // card index → timestamp (for stamp animation)
    lastStatus: null,
    draftSettings: null,
    stats: null,
    chatSeen: 0,              // messages seen when chat tab last open
    turnTotal: 0,             // seconds for current turn (timer bar)
    lastTurnDeadline: null,   // ms deadline for active turn (timer bar sync)
    roomEpoch: 0,             // bumps when entering a room (reset per-room UI)
    roomView: null,           // lobby | play — tracks shell mode for partial render
    lastPhase: null,
    lastCurrentTeam: null,
    config: null,
    authUser: null,
    social: null,
    activeLeague: getActiveLeague(),
    leagueData: null,
  };
  loadAuthUser();

  function captureUiState() {
    const chatIn = $("#chatin");
    const clueIn = $("#clueword");
    const chatFeed = $("#chatfeed");
    const myName = $("#myname");
    return {
      chatText: chatIn ? chatIn.value : "",
      chatScroll: chatFeed ? chatFeed.scrollTop : 0,
      clueText: clueIn ? clueIn.value : "",
      clueFocus: clueIn && document.activeElement === clueIn,
      myNameText: myName ? myName.value : "",
      myNameFocus: myName && document.activeElement === myName,
      activeId: document.activeElement && document.activeElement.id ? document.activeElement.id : null,
    };
  }

  function restoreUiState(saved) {
    if (!saved) return;
    const chatIn = $("#chatin");
    if (chatIn && saved.chatText) chatIn.value = saved.chatText;
    const chatFeed = $("#chatfeed");
    if (chatFeed) chatFeed.scrollTop = saved.chatScroll;
    const clueIn = $("#clueword");
    if (clueIn && saved.clueText) clueIn.value = saved.clueText;
    const myName = $("#myname");
    if (myName && saved.myNameText != null) myName.value = saved.myNameText;
    const focusEl = saved.myNameFocus ? myName
      : saved.clueFocus ? clueIn
      : (saved.activeId ? document.getElementById(saved.activeId) : null);
    if (focusEl && focusEl.focus) focusEl.focus();
  }

  function resetRoomUiState() {
    state.lastRevealCount = 0;
    state.lastRevealedAt = {};
    state.lastStatus = null;
    state.chatSeen = 0;
    state.turnTotal = 0;
    state.lastTurnDeadline = null;
    state.roomView = null;
    state.lastPhase = null;
    state.lastCurrentTeam = null;
    state.roomEpoch += 1;
  }

  function chatUnreadCount() {
    const chat = state.room && state.room.chat ? state.room.chat : [];
    // Reactions are ambient noise — only count real messages as unread.
    const seen = Math.min(state.chatSeen, chat.length);
    let unread = 0;
    for (let i = seen; i < chat.length; i++) {
      if (chat[i].kind !== "reaction") unread++;
    }
    return unread;
  }
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
    const tok = getCipherToken();
    const url = `${proto}://${location.host}/play/ws/${encodeURIComponent(state.code)}`
      + `?pid=${encodeURIComponent(pid())}&name=${encodeURIComponent(getName())}`
      + (tok ? `&cipherToken=${encodeURIComponent(tok)}` : "");
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
    state.reconnectDelay = 800;
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
        state.code = msg.code;
        if (msg.resumed) toast("Picked up your game on this device", "ok");
        break;
      case "state":
        applyState(msg); break;
      case "error":
        if (state.settingsSavePending) state.settingsSavePending = false;
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
      if (prev.round !== g.round) {
        state.lastRevealCount = 0;
        state.lastRevealedAt = {};
      }
      if (revealed > state.lastRevealCount) {
        beep(520, 0.07, "triangle");
        const now = Date.now();
        g.cards.forEach((c) => {
          const was = prev.cards.find((x) => x.i === c.i);
          if (c.revealed && !(was && was.revealed)) state.lastRevealedAt[c.i] = now;
        });
      }
      state.lastRevealCount = revealed;
      if (g.status === "ended" && state.lastStatus !== "ended") {
        const youWin = state.you && g.winner === state.you.team;
        beep(youWin ? 740 : 220, 0.25, "sawtooth", 0.05);
        launchConfetti(g.winner);
      }
    } else {
      state.lastRevealCount = g.cards.filter((c) => c.revealed).length;
      state.lastRevealedAt = {};
    }
    if (g.turnDeadline && g.status === "playing") {
      if (g.turnDeadline !== state.lastTurnDeadline) {
        state.lastTurnDeadline = g.turnDeadline;
        state.turnTotal = Math.max(1, Math.round((g.turnDeadline - Date.now()) / 1000));
      }
    } else {
      state.turnTotal = 0;
      state.lastTurnDeadline = null;
    }
    if (state.tab === "chat") {
      state.chatSeen = (state.room.chat || []).length;
    }
    state.lastStatus = g.status;
    if (state.settingsSavePending) {
      state.settingsSavePending = false;
      state.settingsOpen = false;
      toast("Setup saved", "ok");
    }
    renderRoom();
  }

  // ── boot / render dispatch ───────────────────────────────────────────────────
  async function boot() {
    try {
      if (state.route === "home") {
        closeSocket();
        state.room = null; state.you = null;
        resetRoomUiState();
        await ensurePacks();
        await ensureConfig();
        state.social = await fetchSocialData();
        if (state.activeLeague && state.activeLeague.code) {
          state.leagueData = await fetchLeagueData(state.activeLeague.code);
        } else {
          state.leagueData = null;
          if (state.authUser && getCipherToken()) {
            try {
              const lr = await authFetch("/play/api/me/leagues");
              if (lr.ok) {
                const ld = await lr.json();
                if (ld.leagues && ld.leagues.length === 1) {
                  setActiveLeague(ld.leagues[0]);
                  state.leagueData = await fetchLeagueData(ld.leagues[0].code);
                }
              }
            } catch (_) { /* optional */ }
          }
        }
        await renderHome();
      } else {
        if (state.room && state.room.code !== state.code) {
          state.room = null;
          state.you = null;
          resetRoomUiState();
        } else if (!state.room) {
          resetRoomUiState();
        }
        await ensurePacks();
        if (!state.room) renderRoomShell();
        connect();
      }
    } catch (err) {
      console.error("Cipher boot failed:", err);
      app.innerHTML = "";
      app.appendChild(h(`
        <div class="home">
          <div class="panel" style="margin:24px auto; max-width:480px">
            <h2>Something went wrong</h2>
            <p class="muted">The page failed to load. Try refreshing — if you were signed in, signing out may help.</p>
            <button class="btn btn--primary" id="recover">Reload</button>
            <button class="btn" id="signout-recover">Sign out &amp; reload</button>
          </div>
        </div>`));
      const reload = $("#recover");
      if (reload) reload.onclick = () => location.reload();
      const so = $("#signout-recover");
      if (so) so.onclick = () => { clearAuth(); location.reload(); };
    }
  }

  async function ensurePacks() {
    if (!state.packs.length) {
      try {
        const r = await fetch("/play/api/packs");
        const d = await r.json();
        state.packs = d.packs || [];
        state.sizes = d.sizes || [5];
        state.timer = d.timer || { min: 15, max: 300, step: 5 };
        state.agentPreviews = d.agentPreviews || null;
        state.maxAssassins = d.maxAssassins || null;
      } catch (_) { state.packs = []; }
    }
    if (state.stats === null) {
      try {
        const r = await fetch("/play/api/stats");
        state.stats = await r.json();
      } catch (_) { state.stats = { enabled: false }; }
    }
  }

  function statsRibbon() {
    const s = state.stats;
    if (!s || !s.enabled || !s.totalGames) return "";
    const redW = (s.wins && s.wins.red) || 0;
    const blueW = (s.wins && s.wins.blue) || 0;
    return `
      <div class="stats-ribbon" aria-label="Community stats">
        <div class="stats-ribbon__item"><span class="stats-ribbon__val">${s.totalGames}</span><span class="stats-ribbon__lbl">Games played</span></div>
        <div class="stats-ribbon__item"><span class="stats-ribbon__val">${redW}</span><span class="stats-ribbon__lbl">Field wins</span></div>
        <div class="stats-ribbon__item"><span class="stats-ribbon__val">${blueW}</span><span class="stats-ribbon__lbl">Desk wins</span></div>
        ${s.assassinLosses ? `<div class="stats-ribbon__item"><span class="stats-ribbon__val">${s.assassinLosses}</span><span class="stats-ribbon__lbl">Assassin hits</span></div>` : ""}
      </div>`;
  }

  function wireCodeBoxes(container, onComplete) {
    const boxes = [...container.querySelectorAll(".code-box")];
    const syncFilled = () => boxes.forEach((b) => b.classList.toggle("filled", !!b.value));
    const code = () => boxes.map((b) => b.value).join("");
    boxes.forEach((box, i) => {
      box.addEventListener("input", (e) => {
        const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
        e.target.value = v;
        syncFilled();
        if (v && i < boxes.length - 1) boxes[i + 1].focus();
        if (code().length === boxes.length) onComplete();
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ""; syncFilled(); }
        if (e.key === "Enter") onComplete();
        if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
        if (e.key === "ArrowRight" && i < boxes.length - 1) boxes[i + 1].focus();
      });
      box.addEventListener("paste", (e) => {
        e.preventDefault();
        const text = (e.clipboardData.getData("text") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        text.split("").forEach((ch, j) => { if (boxes[j]) boxes[j].value = ch; });
        syncFilled();
        const next = boxes[Math.min(text.length, boxes.length - 1)];
        if (next) next.focus();
        if (text.length === boxes.length) onComplete();
      });
    });
    return { code, boxes, syncFilled };
  }

  const ADULT_PACKS = new Set(["drinking", "rude", "adult", "offensive", "unfiltered", "toofar", "afterdark", "bottomdrawer"]);
  const MATURE_PACKS = new Set(["drinking", "rude"]);
  const TOO_FAR_PACKS = new Set(["toofar"]);

  const adultConfirmPacks = (packIds) => {
    const ids = Array.isArray(packIds) ? packIds : [packIds];
    const tiers = ids.map((id) => {
      const p = state.packs.find((x) => x.id === id);
      if (p) return p.tier;
      if (TOO_FAR_PACKS.has(id)) return "toofar";
      return ADULT_PACKS.has(id) ? "adult" : "family";
    });
    if (tiers.includes("toofar") || ids.some((id) => TOO_FAR_PACKS.has(id))) {
      if (!confirm(
        "You've selected the Too Far pack — taboo, bleak and genuinely awful content "
        + "(violence, death, assault, politics and extreme filth). Everyone must be 18+ and explicitly want this."
      )) return false;
      return confirm(
        "Last chance: Too Far is meant to be offensive on purpose. "
        + "If anyone in the room might be upset, pick a lighter pack instead. Start anyway?"
      );
    }
    if (tiers.includes("adult") || ids.some((id) => ["offensive", "unfiltered", "adult", "afterdark", "bottomdrawer"].includes(id))) {
      return confirm(
        "You've selected 18+ packs (may include crude, sexual, political or offensive content). "
        + "Confirm everyone playing is 18 or over and wants this."
      );
    }
    if (tiers.includes("mature") || ids.some((id) => MATURE_PACKS.has(id))) {
      return confirm(
        "You've selected mature packs with drinking or crude humour. "
        + "Confirm everyone playing is 18 or over."
      );
    }
    return true;
  };

  const packIdsIncludeEmoji = (st) => {
    const ids = st.packIds || (st.packId ? [st.packId] : ["classic"]);
    return ids.includes("emoji") && !st.hasCustom;
  };
  function leaguePanelMarkup() {
    const lg = state.activeLeague;
    const data = state.leagueData || {};
    const standings = (data.standings && data.standings.standings) || [];
    const games = (data.games && data.games.games) || [];
    const signedIn = !!state.authUser;

    if (lg && lg.code) {
      const standRows = standings.length
        ? standings.map((s, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><b>${esc(s.label)}</b></td>
            <td>${s.wins}</td>
            <td>${s.losses}</td>
            <td>${s.games}</td>
          </tr>`).join("")
        : `<tr><td colspan="5" class="tiny muted">No league games yet — start one below.</td></tr>`;
      const gameRows = games.length
        ? games.slice(0, 8).map((g) => `
          <li class="league-game">
            <span class="league-game__meta">${esc(g.winner || "?")} won · ${esc(g.pack || "")} · ${formatSecs(g.durationSecs)}</span>
            <span class="tiny muted">${esc((g.players || []).map((p) => p.name).join(", "))}</span>
          </li>`).join("")
        : `<li class="tiny muted">Finished games show up here automatically.</li>`;
      return `
        <div class="panel league-panel" id="league-panel">
          <div class="league-panel__head">
            <div>
              <h3>🏆 ${esc(lg.name || "Your league")}</h3>
              <p class="tiny muted">League code <b class="league-code">${esc(lg.code)}</b> — share with your crew</p>
            </div>
            <button class="btn btn--sm" id="leave-league" type="button">Leave</button>
          </div>
          <div class="league-panel__actions">
            <button class="btn btn--primary btn--lg" id="league-game" type="button">▶ Start league game</button>
            <button class="btn btn--sm" id="refresh-league" type="button">Refresh stats</button>
          </div>
          <div class="league-grid">
            <div>
              <h4>Standings</h4>
              <table class="league-table">
                <thead><tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>G</th></tr></thead>
                <tbody>${standRows}</tbody>
              </table>
            </div>
            <div>
              <h4>Recent games</h4>
              <ul class="league-games">${gameRows}</ul>
            </div>
          </div>
        </div>`;
    }

    if (!signedIn) {
      return `
        <div class="panel league-panel" id="league-panel">
          <h3>🏆 Friend league</h3>
          <p class="muted tiny">Sign in with Google to create a league that tracks every game with your regular crew. Guests can still join rooms — use nicknames in-game.</p>
          <div id="google-signin-league" class="social-panel__google"></div>
        </div>`;
    }

    const nick = userLabel(state.authUser);
    return `
      <div class="panel league-panel" id="league-panel">
        <h3>🏆 Start a friend league</h3>
        <p class="muted tiny">Create a league for your group — every game you start from here is tracked. Pick a nickname your friends will recognise.</p>
        <div class="league-forms">
          <div class="league-form panel" style="background:var(--panel-2)">
            <h4>Create</h4>
            <div class="field">
              <label for="league-name">League name</label>
              <input class="input" id="league-name" maxlength="32" placeholder="Friday crew" value="Game night" />
            </div>
            <button class="btn btn--primary btn--block" id="create-league" type="button">Create league</button>
          </div>
          <div class="league-form panel" style="background:var(--panel-2)">
            <h4>Join with code</h4>
            <div class="field">
              <label for="join-league-code">League code</label>
              <input class="input" id="join-league-code" maxlength="6" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:0.15em;font-weight:700" />
            </div>
            <div class="field">
              <label for="join-league-nick">Your nickname</label>
              <input class="input" id="join-league-nick" maxlength="24" placeholder="Agent…" value="${esc(nick)}" />
            </div>
            <button class="btn btn--block" id="join-league" type="button">Join league</button>
          </div>
        </div>
      </div>`;
  }

  function wireLeaguePanel() {
    const leave = $("#leave-league");
    if (leave) {
      leave.onclick = () => {
        setActiveLeague(null);
        state.leagueData = null;
        boot();
      };
    }
    const refresh = $("#refresh-league");
    if (refresh) {
      refresh.onclick = async () => {
        if (!state.activeLeague) return;
        state.leagueData = await fetchLeagueData(state.activeLeague.code);
        boot();
      };
    }
    const startLeague = $("#league-game");
    if (startLeague) {
      startLeague.onclick = () => {
        setName($("#name1") ? $("#name1").value.trim() : getName());
        const btn = $("#create");
        if (btn) createGame(["classic"], btn, "Create game →", true);
      };
    }
    const createLeague = $("#create-league");
    if (createLeague) {
      createLeague.onclick = async () => {
        const name = ($("#league-name") && $("#league-name").value.trim()) || "Game night";
        createLeague.disabled = true;
        try {
          const r = await authFetch("/play/api/leagues", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.detail || "Couldn't create league");
          setActiveLeague(d.league);
          toast(`League created — code ${d.league.code}`, "ok");
          boot();
        } catch (e) {
          toast(e.message || "Couldn't create league", "err");
          createLeague.disabled = false;
        }
      };
    }
    const joinLeague = $("#join-league");
    if (joinLeague) {
      joinLeague.onclick = async () => {
        const code = ($("#join-league-code") && $("#join-league-code").value.trim().toUpperCase()) || "";
        const nickname = ($("#join-league-nick") && $("#join-league-nick").value.trim()) || "";
        if (code.length < 4) { toast("Enter the league code", "err"); return; }
        if (!nickname) { toast("Pick a nickname", "err"); return; }
        joinLeague.disabled = true;
        try {
          const r = await authFetch("/play/api/leagues/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, nickname }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.detail || "Couldn't join league");
          setActiveLeague(d.league);
          setName(nickname);
          setAuth(getCipherToken(), Object.assign({}, state.authUser, { nickname, label: nickname }));
          toast(`Joined ${d.league.name}`, "ok");
          boot();
        } catch (e) {
          toast(e.message || "Couldn't join league", "err");
          joinLeague.disabled = false;
        }
      };
    }
    if (!state.authUser && state.config && state.config.authEnabled) {
      initGoogleSignIn().then((ok) => {
        const gsi = $("#google-signin-league");
        if (ok && gsi && window.google && window.google.accounts) {
          window.google.accounts.id.renderButton(gsi, { theme: "outline", size: "large", width: 300 });
        }
      }).catch(() => {});
    }
  }

  function socialPanelMarkup() {
    const cfg = state.config;
    if (!cfg || !cfg.authEnabled) return "";

    if (!state.authUser) {
      return `
        <div class="panel social-panel" id="social-panel">
          <div class="social-panel__head">
            <h3>Stats &amp; friends <span class="tiny muted">optional</span></h3>
          </div>
          <p class="muted tiny">Sign in to track wins, fastest games, best pairings and friends. Guest play still works — this is separate from sweepstake leagues.</p>
          <div id="google-signin" class="social-panel__google"></div>
        </div>`;
    }

    const u = state.authUser;
    if (!u || !u.id) {
      clearAuth();
      return `
        <div class="panel social-panel" id="social-panel">
          <div class="social-panel__head">
            <h3>Stats &amp; friends <span class="tiny muted">optional</span></h3>
          </div>
          <p class="muted tiny">Sign in to track wins, fastest games, best pairings and friends. Guest play still works — this is separate from sweepstake leagues.</p>
          <div id="google-signin" class="social-panel__google"></div>
        </div>`;
    }
    const data = state.social || {};
    const st = data.stats || {};
    const friends = (data.friends && data.friends.friends) || [];
    const recent = (data.recent && data.recent.players) || [];
    const pairings = (data.pairings && data.pairings.pairings) || [];
    const leaders = (data.leaderboard && data.leaderboard.leaders) || [];

    const friendList = friends.length
      ? friends.map((f) => `<li class="social-list__item">${socialListUser(f)}<button class="btn btn--sm" data-unfriend="${esc(f.id)}">Remove</button></li>`).join("")
      : `<li class="tiny muted">No friends yet — add someone from recent players.</li>`;

    const recentList = recent.length
      ? recent.filter((r) => r && r.user).map((r) => `<li class="social-list__item">${socialListUser(r.user, r.wasTeammate ? " · teammate" : " · opponent")}<button class="btn btn--sm" data-addfriend="${esc(r.user.id)}">Add friend</button></li>`).join("")
      : `<li class="tiny muted">Play a logged-in match to see recent players.</li>`;

    const pairList = pairings.length
      ? pairings.filter((p) => p && p.user).slice(0, 5).map((p) => `<li class="social-list__item">${socialListUser(p.user)}<span class="tiny muted">${p.winsTogether}/${p.gamesTogether} wins together</span></li>`).join("")
      : `<li class="tiny muted">No pairings yet.</li>`;

    const leaderList = leaders.length
      ? leaders.filter((l) => l && l.user).slice(0, 8).map((l, i) => `<li class="social-list__item">${socialListUser(l.user, ` · #${i + 1}`)}<span class="tiny muted">${l.wins} wins</span></li>`).join("")
      : `<li class="tiny muted">Leaderboard fills as logged-in games are played.</li>`;

    return `
      <div class="panel social-panel" id="social-panel">
        <div class="social-panel__head">
          <div class="social-user">
            <button type="button" class="social-user__av-btn" id="pick-av" title="Change profile photo" aria-label="Change profile photo">
              ${avatarImg(u, "social-user__av")}
            </button>
            <input type="file" id="av-file" accept="image/jpeg,image/png,image/webp,image/*" hidden />
            <div>
              <b>${esc(userLabel(u))}</b>
              <div class="tiny muted">Cipher profile</div>
              <div class="social-user__av-actions">
                <button class="btn btn--sm" id="change-av" type="button">Change photo</button>
                ${u.avatarSource === "upload" ? `<button class="btn btn--sm btn--ghost" id="remove-av" type="button">Remove</button>` : ""}
              </div>
            </div>
          </div>
          <button class="btn btn--sm" id="signout">Sign out</button>
        </div>
        <div class="field" style="max-width:360px">
          <label for="mynick">Nickname</label>
          <div class="join-row">
            <input class="input" id="mynick" maxlength="24" value="${esc(u.nickname || u.label || "")}" placeholder="How friends see you" />
            <button class="btn btn--sm" id="savenick" type="button">Save</button>
          </div>
        </div>
        <div class="social-stats">
          <div class="social-stat"><span class="social-stat__val">${st.wins || 0}</span><span class="social-stat__lbl">Wins</span></div>
          <div class="social-stat"><span class="social-stat__val">${st.losses || 0}</span><span class="social-stat__lbl">Losses</span></div>
          <div class="social-stat"><span class="social-stat__val">${st.games ? Math.round((st.winRate || 0) * 100) + "%" : "—"}</span><span class="social-stat__lbl">Win rate</span></div>
          <div class="social-stat"><span class="social-stat__val">${formatSecs(st.quickestWinSecs)}</span><span class="social-stat__lbl">Quickest win</span></div>
          <div class="social-stat"><span class="social-stat__val">${formatSecs(st.quickestLossSecs)}</span><span class="social-stat__lbl">Quickest loss</span></div>
        </div>
        <div class="social-cols">
          <div><h4>Best pairings</h4><ul class="social-list">${pairList}</ul></div>
          <div><h4>Recent players</h4><ul class="social-list">${recentList}</ul></div>
          <div><h4>Friends</h4><ul class="social-list">${friendList}</ul></div>
          <div><h4>Leaderboard</h4><ul class="social-list">${leaderList}</ul></div>
        </div>
      </div>`;
  }

  function wireSocialPanel() {
    const openAvPicker = () => {
      const input = $("#av-file");
      if (input) input.click();
    };
    const pickAv = $("#pick-av");
    if (pickAv) pickAv.onclick = openAvPicker;
    const changeAv = $("#change-av");
    if (changeAv) changeAv.onclick = openAvPicker;
    const avFile = $("#av-file");
    if (avFile) {
      avFile.onchange = () => {
        const file = avFile.files && avFile.files[0];
        avFile.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
          toast("Pick an image file", "err");
          return;
        }
        resizeImageToDataUrl(file, 256, async (dataUrl) => {
          if (!dataUrl) { toast("Couldn't read that image", "err"); return; }
          const preview = pickAv && pickAv.querySelector("img");
          if (preview) preview.src = dataUrl;
          const r = await authFetch("/play/api/me/avatar", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { toast(d.detail || "Couldn't save photo", "err"); boot(); return; }
          setAuth(getCipherToken(), d.user);
          toast("Profile photo updated", "ok");
          boot();
        });
      };
    }
    const removeAv = $("#remove-av");
    if (removeAv) {
      removeAv.onclick = async () => {
        const r = await authFetch("/play/api/me/avatar", { method: "DELETE" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast(d.detail || "Couldn't remove photo", "err"); return; }
        setAuth(getCipherToken(), d.user);
        toast("Profile photo removed", "ok");
        boot();
      };
    }
    const savenick = $("#savenick");
    if (savenick) {
      savenick.onclick = async () => {
        const nickname = ($("#mynick") && $("#mynick").value.trim()) || "";
        if (!nickname) { toast("Enter a nickname", "err"); return; }
        const r = await authFetch("/play/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast(d.detail || "Couldn't save nickname", "err"); return; }
        setAuth(getCipherToken(), d.user);
        setName(userLabel(d.user));
        toast("Nickname saved", "ok");
      };
    }
    const signout = $("#signout");
    if (signout) {
      signout.onclick = () => { clearAuth(); boot(); };
    }
    document.querySelectorAll("[data-addfriend]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.addfriend;
        const r = await authFetch("/play/api/me/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast(d.detail || "Couldn't add friend", "err"); return; }
        toast("Friend added", "ok");
        state.social = await fetchSocialData();
        boot();
      };
    });
    document.querySelectorAll("[data-unfriend]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.unfriend;
        const r = await authFetch(`/play/api/me/friends/${encodeURIComponent(id)}`, { method: "DELETE" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast(d.detail || "Couldn't remove friend", "err"); return; }
        toast("Friend removed", "ok");
        state.social = await fetchSocialData();
        boot();
      };
    });
  }

  async function renderHome() {
    app.innerHTML = "";
    const el = h(`
      <div class="home">
        <div class="topbar">
          <div class="brand">
            <span class="brand__name"><b>Wheesht</b> · Cipher</span>
          </div>
          <button class="icon-btn icon-btn--txt" id="theme" title="Toggle theme" aria-label="Toggle light/dark theme">◐</button>
        </div>

        <div class="home__hero">
          <span class="eyebrow">Wheesht · Cipher · planning-room word-spy</span>
          <h1>Two teams. One clue.<br/>Find your agents on a <span class="grad">classified map</span>.</h1>
          <p class="hero-kicker">The free online word game — like Codenames, but you run the op.</p>
          <p class="lede">Spread out around the planning table: <b>Field Crew</b> vs <b>The Desk</b>. One spymaster gives a single-word clue and a number; teammates guess which index cards are theirs. Hit every agent before the other side — or the assassin — ends the mission. Custom word packs, private rooms, no install.</p>
        </div>

        <div id="league-mount"></div>

        <div class="home__actions">
          <div class="panel action-card">
            <h3>🚀 Start a new game</h3>
            <p class="muted tiny">Pick a vibe, create a private room, invite your crew with a 4-letter code.</p>
            <div class="field">
              <label for="name1">Your nickname</label>
              <input class="input" id="name1" maxlength="24" placeholder="Agent…" value="${esc(getName())}" />
            </div>
            <button class="btn btn--primary btn--lg btn--block" id="create">Create game →</button>
            <button class="btn btn--lg btn--block mode-dark" id="create-dark">🔞 After Dark game</button>
            <button class="btn btn--lg btn--block mode-toofar" id="create-toofar">💀 Too Far game</button>
            <p class="tiny muted" style="text-align:center; margin:0">Standard is family-friendly · After Dark is crude &amp; 18+ · Too Far is genuinely awful</p>
          </div>
          <div class="panel action-card">
            <h3>🔑 Join with a code</h3>
            <p class="muted tiny">Got a room code from a friend? Drop in here.</p>
            <div class="field">
              <label for="name2">Your name</label>
              <input class="input" id="name2" maxlength="24" placeholder="Agent…" value="${esc(getName())}" />
            </div>
            <div class="join-row">
              <div class="code-boxes" id="codeboxes" aria-label="Room code">
                <input class="input code-box" maxlength="1" inputmode="text" autocomplete="off" aria-label="Code letter 1" />
                <input class="input code-box" maxlength="1" inputmode="text" autocomplete="off" aria-label="Code letter 2" />
                <input class="input code-box" maxlength="1" inputmode="text" autocomplete="off" aria-label="Code letter 3" />
                <input class="input code-box" maxlength="1" inputmode="text" autocomplete="off" aria-label="Code letter 4" />
              </div>
              <button class="btn btn--lg" id="join">Join</button>
            </div>
          </div>
        </div>

        ${statsRibbon()}
        <div id="social-mount"></div>

        <div class="panel">
          <span class="eyebrow">Why it's more fun</span>
          <div class="features" style="margin-top:14px">
            <div class="feature"><span class="ico">🎛️</span><h4>Fully customisable</h4><p>4×4, 5×5 or 6×6 boards, optional turn timers, 1–5 assassins.</p></div>
            <div class="feature"><span class="ico">🃏</span><h4>Themed word packs</h4><p>Mix &amp; match Classic, Countries, Marvel, UK Snacks, Offensive, Too Far and more — or paste your own.</p></div>
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

    const leagueMount = $("#league-mount");
    if (leagueMount) {
      leagueMount.appendChild(h(leaguePanelMarkup()));
      wireLeaguePanel();
    }

    const socialMount = $("#social-mount");
    if (socialMount && socialPanelMarkup()) {
      socialMount.appendChild(h(socialPanelMarkup()));
      wireSocialPanel();
      if (!state.authUser && state.config && state.config.authEnabled) {
        initGoogleSignIn().then((ok) => {
          const gsi = $("#google-signin");
          if (ok && gsi && window.google && window.google.accounts) {
            window.google.accounts.id.renderButton(gsi, { theme: "outline", size: "large", width: 300 });
          }
        }).catch(() => {});
      }
    }

    $("#theme").onclick = toggleTheme;
    const syncNames = (v) => { $("#name1").value = v; $("#name2").value = v; };
    $("#name1").oninput = (e) => { setName(e.target.value); $("#name2").value = e.target.value; };
    $("#name2").oninput = (e) => { setName(e.target.value); $("#name1").value = e.target.value; };

    const createGame = async (packIds, btn, label, forceLeague) => {
      if (!adultConfirmPacks(packIds)) return;
      btn.disabled = true; btn.textContent = "Creating…";
      setName($("#name1").value.trim());
      try {
        const body = { packIds: Array.isArray(packIds) ? packIds : [packIds] };
        const lg = state.activeLeague || getActiveLeague();
        if ((forceLeague || lg) && lg && lg.code) body.leagueCode = lg.code;
        const r = await fetch("/play/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.code) {
          throw new Error(d.detail || d.message || "create failed");
        }
        location.hash = `#/room/${d.code}`;
      } catch (e) {
        toast("Couldn't create a room. Try again.", "err");
        btn.disabled = false; btn.textContent = label;
      }
    };
    $("#create").onclick = () => createGame(["classic"], $("#create"), "Create game →");
    $("#create-dark").onclick = () => createGame(["drinking", "rude", "adult"], $("#create-dark"), "🔞 After Dark game");
    $("#create-toofar").onclick = () => createGame(["toofar"], $("#create-toofar"), "💀 Too Far game");
    const doJoin = () => {
      const code = codeInput.code();
      if (code.length < 4) { toast("Enter the full 4-letter room code.", "err"); return; }
      setName($("#name2").value.trim());
      location.hash = `#/room/${code}`;
    };
    const codeInput = wireCodeBoxes($("#codeboxes"), doJoin);
    $("#join").onclick = doJoin;
    setTimeout(() => { const n = $("#name1"); if (n && !n.value) n.focus(); }, 80);
  }

  // ============================================================================
  //  ROOM
  // ============================================================================
  function renderRoomShell() {
    app.innerHTML = "";
    app.appendChild(h(`
      <div class="loader">
        <span class="loader__code">${esc(state.code)}</span>
        <span class="loader__status">Connecting<span class="loader__dots"></span></span>
      </div>`));
  }

  function renderRoom() {
    if (!state.room) { renderRoomShell(); return; }
    const g = state.room.game;
    const view = g.status === "lobby" ? "lobby" : "play";
    const saved = captureUiState();
    const canPatch = state.roomView === view && view === "play" && app.querySelector("[data-room-root]");
    const turnChanged = g.currentTeam !== state.lastCurrentTeam || g.phase !== state.lastPhase;

    if (canPatch && !state.settingsOpen) {
      patchPlayingView(turnChanged);
    } else {
      app.innerHTML = "";
      const root = h(`<div data-room-root></div>`);
      app.appendChild(root);
      root.appendChild(topbar());
      if (view === "lobby") {
        root.appendChild(lobby());
      } else {
        const grid = h(`<div class="game-grid" data-game-grid></div>`);
        const main = h(`<div class="board-wrap" data-board-wrap></div>`);
        grid.appendChild(main);
        grid.appendChild(sidePanel());
        root.appendChild(scoreboard());
        if (state.room.settings.devMode && state.you && state.you.isHost) {
          root.appendChild(devModeBar());
        }
        root.appendChild(grid);
        fillPlayingView(main, grid);
      }
      state.roomView = view;
    }

    if (state.settingsOpen) {
      const existing = $("#scrim");
      if (existing) existing.remove();
      app.appendChild(settingsModal());
    }
    state.lastPhase = g.phase;
    state.lastCurrentTeam = g.currentTeam;
    renderConnState();
    requestAnimationFrame(() => restoreUiState(saved));
  }

  function fillPlayingView(main, grid) {
    const g = state.room.game;
    const scoreWrap = $(".scoreboard-wrap");
    if (scoreWrap) scoreWrap.replaceWith(scoreboard());
    if (g.status === "ended" && !main.querySelector(".win-banner")) {
      main.insertBefore(winBanner(), main.firstChild);
    } else if (g.status !== "ended") {
      const wb = main.querySelector(".win-banner");
      if (wb) wb.remove();
    }
    const oldBoard = main.querySelector(".board-frame");
    if (oldBoard) oldBoard.replaceWith(board());
    else main.appendChild(board());
    const oldClue = main.querySelector(".cluebar, .cluebar--active");
    const clueParent = oldClue ? oldClue.parentElement : main;
    const newClue = cluebar();
    if (oldClue) oldClue.replaceWith(newClue);
    else clueParent.appendChild(newClue);
    const oldSide = grid.querySelector(".side");
    if (oldSide) oldSide.replaceWith(sidePanel());
    const root = $("[data-room-root]");
    const oldDev = root && root.querySelector(".dev-bar");
    if (state.room.settings.devMode && state.you && state.you.isHost) {
      const dev = devModeBar();
      if (oldDev) oldDev.replaceWith(dev);
      else if (root) {
        const gridEl = root.querySelector("[data-game-grid]");
        if (gridEl) gridEl.parentElement.insertBefore(dev, gridEl);
      }
    } else if (oldDev) oldDev.remove();
  }

  function devModeBar() {
    const you = state.you;
    const el = h(`
      <div class="dev-bar panel" role="toolbar" aria-label="Dev mode role switcher">
        <span class="dev-bar__label">🛠 Dev</span>
        <span class="tiny muted dev-bar__hint">Switch role anytime — you always see the key</span>
        <div class="dev-bar__btns">
          <button type="button" class="btn btn--sm btn--red" data-team="red" data-role="spymaster">${esc(teamName("red"))} SM</button>
          <button type="button" class="btn btn--sm btn--red" data-team="red" data-role="operative">${esc(teamName("red"))} OP</button>
          <button type="button" class="btn btn--sm btn--blue" data-team="blue" data-role="spymaster">${esc(teamName("blue"))} SM</button>
          <button type="button" class="btn btn--sm btn--blue" data-team="blue" data-role="operative">${esc(teamName("blue"))} OP</button>
          <button type="button" class="btn btn--sm" data-team="spectator" data-role="operative">Spectate</button>
        </div>
      </div>`);
    el.querySelectorAll("[data-team]").forEach((b) => {
      const team = b.dataset.team;
      const role = b.dataset.role;
      const active = you && you.team === team && (team === "spectator" || you.role === role);
      if (active) b.classList.add("active");
      b.onclick = () => {
        send({ type: "setTeam", team });
        if (team !== "spectator") send({ type: "setRole", role });
      };
    });
    return el;
  }

  function patchPlayingView(turnChanged) {
    const grid = $("[data-game-grid]");
    const main = $("[data-board-wrap]");
    if (!grid || !main) { state.roomView = null; renderRoom(); return; }
    fillPlayingView(main, grid);
    if (turnChanged) {
      const pill = $(".turn-pill");
      if (pill) {
        pill.classList.add("turn-swap");
        setTimeout(() => pill.classList.remove("turn-swap"), 500);
      }
      const activeScore = $(".team-score.active");
      if (activeScore) {
        activeScore.classList.add("team-pulse");
        setTimeout(() => activeScore.classList.remove("team-pulse"), 600);
      }
    }
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
          <span class="room-code" id="roomcode" title="Click to copy code"><small>ROOM</small>${esc(state.room.code)}</span>
          <span class="conn" id="conn"><span class="dot"></span><span class="lbl">Live</span></span>
        </div>
        <div class="topbar__right">
          <button class="btn btn--sm" id="copy">Copy link</button>
          ${isHost ? `<button class="btn btn--sm" id="settings">Setup</button>` : ""}
          <button class="icon-btn icon-btn--txt" id="theme" title="Toggle theme" aria-label="Toggle theme">◐</button>
        </div>
      </div>`);
    el.querySelector("#leave").onclick = () => { location.hash = ""; };
    el.querySelector("#theme").onclick = toggleTheme;
    el.querySelector("#copy").onclick = copyInvite;
    const rc = el.querySelector("#roomcode");
    if (rc) rc.onclick = () => {
      const code = state.room.code;
      const done = () => toast("Room code copied", "ok");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
      } else { fallbackCopy(code, done); }
    };
    const s = el.querySelector("#settings"); if (s) s.onclick = openSettings;
    return el;
  }

  function copyInvite() {
    const name = (state.you && state.you.name) || getName();
    const q = name ? `?name=${encodeURIComponent(name)}` : "";
    const url = `${location.origin}/play${q}#/room/${state.room.code}`;
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
  function roleLabel(role, team) {
    if (team === "spectator") return "Spectating";
    return role === "spymaster" ? "Spymaster" : "Operative";
  }

  function lobbyStatusBar(players) {
    const reds = players.filter((p) => p.team === "red");
    const blues = players.filter((p) => p.team === "blue");
    const redSm = reds.find((p) => p.role === "spymaster");
    const blueSm = blues.find((p) => p.role === "spymaster");
    const redOps = reds.filter((p) => p.role === "operative").length;
    const blueOps = blues.filter((p) => p.role === "operative").length;
    const item = (label, ok, detail) => `
      <div class="lobby-status__item ${ok ? "lobby-status__item--ok" : "lobby-status__item--need"}">
        <span class="lobby-status__mark">${ok ? "✓" : "○"}</span>
        <span><b>${label}</b> <span class="tiny muted">${esc(detail)}</span></span>
      </div>`;
    return h(`
      <div class="lobby-status panel" aria-live="polite">
        <div class="lobby-status__title">Who's playing what</div>
        <div class="lobby-status__grid">
          ${item(`${esc(teamName("red"))} spymaster`, !!redSm, redSm ? redSm.name : "pick someone")}
          ${item(`${esc(teamName("red"))} operatives`, redOps > 0, redOps ? `${redOps} ready` : "need at least 1")}
          ${item(`${esc(teamName("blue"))} spymaster`, !!blueSm, blueSm ? blueSm.name : "pick someone")}
          ${item(`${esc(teamName("blue"))} operatives`, blueOps > 0, blueOps ? `${blueOps} ready` : "need at least 1")}
        </div>
      </div>`);
  }

  function roleSlotsMarkup(team, members) {
    const spy = members.find((p) => p.role === "spymaster");
    const ops = members.filter((p) => p.role === "operative");
    const slot = (kind, icon, label, holder, empty) => `
      <div class="role-slot role-slot--${team} role-slot--${kind} ${holder ? "role-slot--filled" : "role-slot--open"}">
        <span class="role-slot__icon" aria-hidden="true">${icon}</span>
        <div class="role-slot__body">
          <span class="role-slot__label">${label}</span>
          <span class="role-slot__name">${holder ? esc(holder.name) : empty}</span>
        </div>
      </div>`;
  return `
      <div class="role-slots">
        ${slot("spy", "🎩", "Spymaster", spy, "Open — tap below")}
        ${slot("ops", "🔍", "Operatives", ops.length ? { name: ops.map((p) => p.name).join(", ") } : null, ops.length ? "" : "Open — tap below")}
      </div>`;
  }

  function lobby() {
    const players = state.room.players;
    const you = state.you;
    const reds = players.filter((p) => p.team === "red");
    const blues = players.filter((p) => p.team === "blue");
    const specs = players.filter((p) => p.team === "spectator");
    const st = state.room.settings;

    const wrap = h(`<div style="display:grid; gap:18px"></div>`);

    wrap.appendChild(lobbyStatusBar(players));

    wrap.appendChild(h(`
      <div class="hint-banner">
        <span>🎯</span>
        <span>${st.devMode
          ? "<b>Dev mode on</b> — start solo; bots fill empty roles. Switch team/role anytime once the game begins."
          : "Pick a unit and role. <b>Field Crew</b> runs the op; <b>The Desk</b> briefs from the planning room. Each unit needs a spymaster and at least one operative. Name your unit before you start."}</span>
      </div>${st.leagueName ? `<div class="hint-banner hint-banner--league"><span>🏆</span><span>League game — <b>${esc(st.leagueName)}</b>${st.leagueCode ? ` <span class="tiny muted">(${esc(st.leagueCode)})</span>` : ""}. This match counts toward your league standings.</span></div>` : ""}`));

    const teams = h(`<div class="lobby-teams"></div>`);
    teams.appendChild(teamCard("red", reds, you));
    teams.appendChild(teamCard("blue", blues, you));
    wrap.appendChild(teams);

    // Spectators + your name
    const meRow = h(`
      <div class="panel" style="display:grid; gap:14px">
        <div class="team-head"><h3>👁️ Spectators</h3>
          <button class="btn btn--sm" id="spec">Spectate</button></div>
        <div class="roster" id="specroster"></div>
        <div class="field" style="max-width:320px">
          <label for="myname">Your nickname</label>
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
          ${st.agentCounts ? `<span class="badge badge--agents" title="${esc(agentCountsLabel(st.agentCounts))}">Win: ${st.agentCounts.startingTeamAgents} vs ${st.agentCounts.otherTeamAgents}</span>` : ""}
          <span class="badge">${st.hasCustom ? "Custom words" : esc(st.packName)}</span>
          <span class="badge">${st.turnSeconds ? st.turnSeconds + "s turns" : "No timer"}</span>
          <span class="badge">${st.assassins} assassin${st.assassins > 1 ? "s" : ""}</span>
          ${st.devMode ? `<span class="badge badge--dev">Dev mode</span>` : ""}
          ${st.houseRules && st.houseRules.compoundClues ? `<span class="badge">Compound clues</span>` : ""}
          ${st.houseRules && !st.houseRules.noBoardWords ? `<span class="badge">Board words OK</span>` : ""}
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

  function teamCard(team, members, you) {
    const label = teamName(team);
    const onTeam = you && you.team === team;
    const canName = canEditTeamName(team, you);
    const card = h(`
      <div class="panel team-card ${team} dossier-card">
        <div class="team-card__head">
          <span class="team-card__sigil" aria-hidden="true">${team === "red" ? "⬤" : "◆"}</span>
          <div class="team-card__title">
            ${canName
    ? `<label class="tiny muted" for="teamname-${team}">Unit designation</label>
               <div class="team-name-row">
                 <input class="input team-name-input" id="teamname-${team}" maxlength="20" value="${esc(label)}" placeholder="${esc(DEFAULT_TEAM_NAMES[team])}" />
                 <button type="button" class="btn btn--sm" data-save-team="${team}">Set</button>
               </div>`
    : `<h3>${esc(label)}</h3><span class="tiny muted">${team === "red" ? "Field unit" : "Desk unit"} · ${members.length} agent${members.length === 1 ? "" : "s"}</span>`}
          </div>
        </div>
        ${roleSlotsMarkup(team, members)}
        <div class="roster" aria-label="${esc(label)} roster"></div>
        <div class="ctas">
          <button class="btn btn--sm btn--${team}" data-act="join">Join ${esc(label)}</button>
          <button class="btn btn--sm" data-act="spy" ${onTeam ? "" : "disabled"}>🎩 Spymaster</button>
          <button class="btn btn--sm" data-act="op" ${onTeam ? "" : "disabled"}>🔍 Operative</button>
        </div>
      </div>`);
    const roster = card.querySelector(".roster");
    if (members.length) members.forEach((p) => roster.appendChild(playerChip(p, you)));
    else roster.appendChild(h(`<div class="empty">No one here yet — be first!</div>`));
    const joinBtn = card.querySelector('[data-act="join"]');
    const spyBtn = card.querySelector('[data-act="spy"]');
    const opBtn = card.querySelector('[data-act="op"]');
    if (onTeam) joinBtn.classList.add("active");
    if (onTeam && you.role === "spymaster") spyBtn.classList.add("active");
    if (onTeam && you.role === "operative") opBtn.classList.add("active");
    joinBtn.onclick = () => send({ type: "setTeam", team });
    spyBtn.onclick = () => send({ type: "setRole", role: "spymaster" });
    opBtn.onclick = () => send({ type: "setRole", role: "operative" });
    const saveTeam = card.querySelector(`[data-save-team="${team}"]`);
    const nameInput = card.querySelector(`#teamname-${team}`);
    if (saveTeam && nameInput) {
      const commitName = () => {
        const v = nameInput.value.trim();
        if (!v) { toast("Enter a unit name", "err"); return; }
        send({ type: "setTeamName", team, name: v });
        toast("Unit name updated", "ok");
      };
      saveTeam.onclick = commitName;
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commitName(); }
      });
    }
    return card;
  }

  function playerChip(p, you) {
    const initials = (p.name || "?").trim().slice(0, 2).toUpperCase();
    const isYou = you && p.id === you.id;
    const roleCls = p.role === "spymaster" ? "role-badge--spy" : "role-badge--op";
    return h(`
      <div class="player-chip ${p.role === "spymaster" ? "spy" : ""} ${isYou ? "you" : ""} player-chip--${p.team}">
        <span class="av" style="background:${esc(p.color)}">${esc(initials)}</span>
        <span class="nm ${p.connected ? "" : "off"}">${esc(p.name)}${isYou ? " (you)" : ""}</span>
        <span class="role-badge ${roleCls}">${esc(roleLabel(p.role, p.team))}</span>
        ${p.isHost ? `<span class="tag tag--host" title="Host">HOST</span>` : ""}
        ${p.isBot ? `<span class="tag tag--bot" title="Dev bot">BOT</span>` : ""}
      </div>`);
  }

  // ── scoreboard ───────────────────────────────────────────────────────────
  function scoreboard() {
    const g = state.room.game;
    const active = g.status === "playing" ? g.currentTeam : null;
    return h(`
      <div class="scoreboard-wrap mission-status">
        <div class="scoreboard mission-status__bar">
          <div class="team-score team-score--red ${active === "red" ? "active" : ""}">
            ${teamScoreNum("red", g)}
            <div class="meta"><b>${esc(teamName("red"))}</b><span class="tiny muted">agents left</span></div>
          </div>
          <div class="turn-pill">
            ${g.status === "ended"
              ? `<span class="who">Game over</span>`
              : `<span class="who" style="color:${g.currentTeam === "red" ? "var(--red)" : "var(--blue)"}">${esc(teamName(g.currentTeam))} — ${g.phase === "clue" ? "briefing" : "in the field"}</span>`}
            <span class="timer" id="timer"></span>
          </div>
          <div class="team-score team-score--blue ${active === "blue" ? "active" : ""}">
            <div class="meta" style="text-align:right"><b>${esc(teamName("blue"))}</b><span class="tiny muted">agents left</span></div>
            ${teamScoreNum("blue", g)}
          </div>
        </div>
        <div class="timer-bar" id="timerbar" hidden><div class="timer-bar__fill" id="timerfill"></div></div>
      </div>`);
  }

  // ── board ────────────────────────────────────────────────────────────────
  function board() {
    const g = state.room.game;
    const you = state.you;
    const isEmoji = packIdsIncludeEmoji(state.room.settings);
    const showKey = !!(you && you.revealKey);
    const canGuess = you && g.status === "playing" && g.phase === "guess"
      && you.team === g.currentTeam && you.role === "operative";

    const frame = h(`
      <div class="board-frame">
        <div class="board-frame__head">
          <span>Ops map <strong>${g.board_size}×${g.board_size}</strong></span>
          <span>Mission ${String(g.round || 1).padStart(2, "0")}</span>
          ${showKey ? `<span class="board-frame__key">Key visible</span>` : ""}
        </div>
      </div>`);
    const grid = h(`<div class="board ${showKey ? "board--key" : "board--blind"}" style="--cols:${g.board_size}" role="grid" aria-label="Word board"></div>`);
    const animCutoff = Date.now() - 600;
    g.cards.forEach((c) => {
      const hidden = c.kind === "hidden";
      const classes = ["cardx"];
      if (isEmoji) classes.push("emoji");
      if (c.revealed) {
        classes.push("revealed", "kind-" + c.kind);
      } else if (showKey && !hidden) {
        classes.push("key-" + c.kind);
      }
      if (canGuess && !c.revealed) classes.push("clickable");
      if (state.lastRevealedAt[c.i] && state.lastRevealedAt[c.i] > animCutoff) classes.push("just-revealed");

      const showMark = c.revealed || (showKey && !hidden);
      const mark = showMark ? markerFor(c.kind) : "";
      const ariaLabel = c.revealed
        ? `${c.word}, ${c.kind}`
        : (showKey && !hidden ? `${c.word}, ${c.kind}` : c.word);

      const btn = h(`
        <button class="${classes.join(" ")}" ${canGuess && !c.revealed ? "" : "tabindex=\"-1\""}
          role="gridcell" aria-label="${esc(ariaLabel)}">
          <span class="cardx__ref" aria-hidden="true">${String(c.i + 1).padStart(2, "0")}</span>
          ${mark ? `<span class="cardx__mark cardx__mark--${c.kind}" aria-hidden="true">${mark}</span>` : ""}
          <span class="word">${esc(c.word)}</span>
        </button>`);
      if (canGuess && !c.revealed) {
        btn.onclick = () => send({ type: "guess", index: c.i });
      } else if (!canGuess) {
        btn.disabled = true;
      }
      grid.appendChild(btn);
    });
    frame.appendChild(grid);
    return frame;
  }

  function markerFor(kind) {
    if (kind === "red") return teamMark("red");
    if (kind === "blue") return teamMark("blue");
    return { neutral: "N", assassin: "X", hidden: "" }[kind] || "";
  }

  // ── clue bar ─────────────────────────────────────────────────────────────
  function cluebar() {
    const g = state.room.game;
    const you = state.you;
    if (g.status === "ended") {
      const el = h(`<div class="panel cluebar">
        ${you && you.isHost
          ? `<button class="btn btn--primary" id="rematch">🔄 Rematch (same setup)</button><button class="btn" id="again">New round</button><button class="btn" id="tolobby">⚙️ Back to lobby</button>`
          : `<span class="muted">Waiting for the host…</span>`}
      </div>`);
      const r = el.querySelector("#rematch"); if (r) r.onclick = () => send({ type: "rematch" });
      const a = el.querySelector("#again"); if (a) a.onclick = () => send({ type: "start" });
      const l = el.querySelector("#tolobby"); if (l) l.onclick = () => send({ type: "reset" });
      return el;
    }

    const isActiveSpy = you && you.role === "spymaster" && you.team === g.currentTeam;
    const isActiveOp = you && you.role === "operative" && you.team === g.currentTeam;

    // Spymaster giving a clue
    if (g.phase === "clue" && isActiveSpy) {
      const compound = state.room.settings.houseRules && state.room.settings.houseRules.compoundClues;
      const teamTotal = (g.totals && g.totals[you.team]) || 9;
      const maxClue = Math.min(9, teamTotal);
      const el = h(`
        <div class="panel cluebar">
          <form class="clue-form" id="clueform">
            <div class="field">
              <label for="clueword">Your clue${compound ? "" : " (one word)"}</label>
              <input class="input" id="clueword" maxlength="40" autocomplete="off" placeholder="${compound ? "e.g. ICE CREAM" : "e.g. OCEAN"}" />
            </div>
            <div class="field" style="flex:0 0 110px">
              <label for="cluenum">Number <span class="tiny muted">(max ${maxClue})</span></label>
              <select class="select" id="cluenum">
                ${Array.from({ length: maxClue + 1 }, (_, n) => `<option value="${n}">${n === 0 ? "∞ (0)" : n}</option>`).join("")}
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
        <div class="panel cluebar cluebar--active">
          <div class="clue-display">
            <span class="clue-meta">${esc(teamName(g.currentTeam))} briefing</span>
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
    return h(`<div class="panel cluebar"><span class="muted">⏳ Awaiting ${esc(teamName(g.currentTeam))}'s briefing…</span></div>`);
  }

  // ── side panel ───────────────────────────────────────────────────────────
  function sidePanel() {
    const unread = state.tab !== "chat" ? chatUnreadCount() : 0;
    const el = h(`
      <div class="side">
        <div class="tabs" role="tablist">
          <button role="tab" data-tab="players" aria-selected="${state.tab === "players"}">Teams</button>
          <button role="tab" data-tab="log" aria-selected="${state.tab === "log"}">Log</button>
          <button role="tab" data-tab="chat" aria-selected="${state.tab === "chat"}">Chat${unread ? `<span class="tab-badge">${unread}</span>` : ""}</button>
        </div>
        <div class="panel" id="tabbody"></div>
      </div>`);
    el.querySelectorAll("[data-tab]").forEach((b) => {
      b.onclick = () => {
        state.tab = b.dataset.tab;
        localStorage.setItem(LS.tab, state.tab);
        if (state.tab === "chat") state.chatSeen = (state.room.chat || []).length;
        renderRoom();
      };
    });
    const body = el.querySelector("#tabbody");
    if (state.tab === "players") body.appendChild(playersTab());
    else if (state.tab === "log") body.appendChild(logTab());
    else {
      state.chatSeen = (state.room.chat || []).length;
      body.appendChild(chatTab());
    }
    return el;
  }

  function playersTab() {
    const players = state.room.players;
    const you = state.you;
    const wrap = h(`<div style="display:grid; gap:16px"></div>`);
    [["red", "red"], ["blue", "blue"]].forEach(([team]) => {
      const members = players.filter((p) => p.team === team)
        .sort((a, b) => (a.role === "spymaster" ? 0 : 1) - (b.role === "spymaster" ? 0 : 1));
      const col = h(`<div class="team-col dossier-card team-col--${team}"><div class="team-head ${team}"><h3>${esc(teamName(team))}</h3></div><div class="roster"></div></div>`);
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
        <p class="win-banner__label">Mission closed</p>
        <h2>${esc(teamName(w))}</h2>
        <p class="muted">${g.winReason === "assassin" ? "Assassin contact — operation blown." : "All agents accounted for."}${youWin ? " Your unit." : ""}</p>
      </div>`);
  }

  // ── settings modal ───────────────────────────────────────────────────────
  function openSettings() {
    const st = state.room.settings;
    const packIds = st.packIds || (st.packId ? [st.packId] : ["classic"]);
    const hr = st.houseRules || {};
    state.draftSettings = {
      boardSize: st.boardSize,
      packIds: [...packIds],
      turnSeconds: st.turnSeconds,
      assassins: st.assassins,
      customWords: st.customWords || "",
      houseRules: {
        compoundClues: !!hr.compoundClues,
        noBoardWords: hr.noBoardWords !== false,
        rhymesBanned: !!hr.rhymesBanned,
      },
      devMode: !!st.devMode,
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
            <label>Word packs <span class="tiny muted">(toggle any combination)</span></label>
            <div class="pack-grid pack-grid--multi" id="packs"></div>
          </div>
          <div class="field">
            <label>House rules</label>
            <div class="house-rules" id="houserules">
              <label class="check-row"><input type="checkbox" id="hr-compound" ${d.houseRules.compoundClues ? "checked" : ""} /> Allow compound clues (multi-word)</label>
              <label class="check-row"><input type="checkbox" id="hr-board" ${d.houseRules.noBoardWords ? "checked" : ""} /> Clue can't match a board word</label>
              <label class="check-row"><input type="checkbox" id="hr-rhyme" ${d.houseRules.rhymesBanned ? "checked" : ""} /> No rhyming clues (honour system)</label>
            </div>
          </div>
          <div class="field dev-mode-field">
            <label class="check-row check-row--dev">
              <input type="checkbox" id="devmode" ${d.devMode ? "checked" : ""} />
              <span><b>Dev mode</b> — solo testing without four players</span>
            </label>
            <span class="tiny muted">Bots fill empty roles. You can switch team/role mid-game and always see the board key.</span>
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
            <p class="tiny muted setup-preview" id="setup-preview">${esc(agentCountsLabel(agentCounts(d.boardSize, d.assassins)))}</p>
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
            <div class="segmented" id="assassins"></div>
          </div>
          <button class="btn btn--primary btn--lg btn--block" id="applyset">Save setup</button>
        </div>
      </div>`);

    // Pack grid — multi-select toggles
    const pg = modal.querySelector("#packs");
    const syncPackBtns = () => {
      pg.querySelectorAll(".pack-opt").forEach((x) => {
        x.setAttribute("aria-pressed", d.packIds.includes(x.dataset.v) ? "true" : "false");
      });
    };
    state.packs.forEach((p) => {
      const on = d.packIds.includes(p.id);
      const tier = p.tier === "toofar" ? " 💀" : p.tier === "adult" ? " 🔞" : p.tier === "mature" ? " 18+" : "";
      const extraCls = p.tier === "toofar" ? " pack-opt--toofar" : "";
      const b = h(`<button type="button" class="pack-opt pack-opt--toggle${extraCls}" data-v="${p.id}" aria-pressed="${on}">
        <span class="pemoji">${p.emoji}</span><b>${esc(p.name)}${tier}</b><small>${esc(p.blurb)} · ${p.count} words</small></button>`);
      b.onclick = () => {
        const id = p.id;
        if (d.packIds.includes(id)) {
          if (d.packIds.length > 1) d.packIds = d.packIds.filter((x) => x !== id);
        } else {
          d.packIds.push(id);
        }
        if (!d.packIds.length) d.packIds = ["classic"];
        syncPackBtns();
      };
      pg.appendChild(b);
    });

    const hrCompound = modal.querySelector("#hr-compound");
    const hrBoard = modal.querySelector("#hr-board");
    const hrRhyme = modal.querySelector("#hr-rhyme");
    hrCompound.onchange = () => { d.houseRules.compoundClues = hrCompound.checked; };
    hrBoard.onchange = () => { d.houseRules.noBoardWords = hrBoard.checked; };
    hrRhyme.onchange = () => { d.houseRules.rhymesBanned = hrRhyme.checked; };
    const devMode = modal.querySelector("#devmode");
    devMode.onchange = () => { d.devMode = devMode.checked; };

    const preview = modal.querySelector("#setup-preview");
    const assassinWrap = modal.querySelector("#assassins");
    const syncSetupPreview = () => {
      if (preview) preview.textContent = agentCountsLabel(agentCounts(d.boardSize, d.assassins));
    };
    const renderAssassinBtns = () => {
      const maxA = maxAssassinsForBoard(d.boardSize);
      if (d.assassins > maxA) d.assassins = maxA;
      assassinWrap.innerHTML = "";
      for (let a = 1; a <= maxA; a += 1) {
        const b = h(`<button type="button" data-v="${a}" aria-pressed="${a === d.assassins}">${a}</button>`);
        b.onclick = () => {
          d.assassins = a;
          renderAssassinBtns();
          syncSetupPreview();
        };
        assassinWrap.appendChild(b);
      }
    };
    renderAssassinBtns();

    const seg = (id, key, cast) => {
      modal.querySelectorAll(`#${id} button`).forEach((b) => {
        b.onclick = () => {
          d[key] = cast(b.dataset.v);
          modal.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute("aria-pressed", cast(x.dataset.v) === d[key]));
          if (key === "boardSize") renderAssassinBtns();
          syncSetupPreview();
        };
      });
    };
    seg("sizes", "boardSize", Number);
    syncSetupPreview();

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
      if (!adultConfirmPacks(d.packIds)) return;
      state.settingsSavePending = true;
      send({ type: "settings", settings: {
        boardSize: d.boardSize, packIds: d.packIds, turnSeconds: d.turnSeconds,
        assassins: d.assassins, customWords: d.customWords,
        houseRules: d.houseRules, devMode: d.devMode,
      } });
      toast("Saving setup…", "");
    };

    scrim.appendChild(modal);
    return scrim;
  }

  // ── timer tick ─────────────────────────────────────────────────────────────
  setInterval(() => {
    const t = $("#timer");
    const bar = $("#timerbar");
    const fill = $("#timerfill");
    if (!t || !state.room) return;
    const g = state.room.game;
    if (g.status !== "playing" || !g.turnDeadline) {
      t.textContent = "";
      if (bar) bar.hidden = true;
      return;
    }
    const left = Math.max(0, Math.round((g.turnDeadline - Date.now()) / 1000));
    const total = state.turnTotal || left || 1;
    t.textContent = `⏱ ${left}s`;
    t.classList.toggle("low", left <= 10);
    if (bar && fill) {
      bar.hidden = false;
      const pct = Math.max(0, Math.min(1, left / total));
      fill.style.transform = `scaleX(${pct})`;
      fill.classList.toggle("low", left <= 10);
    }
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
    const colors = team === "red" ? ["#c0473f", "#7e2b27", "#f3e3df"]
      : team === "blue" ? ["#4d8893", "#2c545c", "#e4f0f1"]
      : ["#c8a13a", "#b3a684", "#8aa24a"];
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
