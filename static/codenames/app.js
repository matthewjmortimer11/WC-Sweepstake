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
  };

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
    } catch (_) { state.authUser = null; }
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
          if (d.user && d.user.displayName) setName(d.user.displayName);
          toast(`Welcome, ${d.user.displayName}`, "ok");
          boot();
        } catch (e) {
          toast(e.message || "Sign-in failed", "err");
        }
      },
    });
    return true;
  }

  async function fetchSocialData() {
    if (!getCipherToken()) return null;
    try {
      const [stats, recent, pairings, friends, leaderboard] = await Promise.all([
        authFetch("/play/api/me/stats").then((r) => r.json()),
        authFetch("/play/api/me/recent").then((r) => r.json()),
        authFetch("/play/api/me/pairings").then((r) => r.json()),
        authFetch("/play/api/me/friends").then((r) => r.json()),
        fetch("/play/api/leaderboard").then((r) => r.json()),
      ]);
      return { stats, recent, pairings, friends, leaderboard };
    } catch (_) { return null; }
  }

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
  };
  loadAuthUser();

  function captureUiState() {
    const chatIn = $("#chatin");
    const clueIn = $("#clueword");
    const chatFeed = $("#chatfeed");
    return {
      chatText: chatIn ? chatIn.value : "",
      chatScroll: chatFeed ? chatFeed.scrollTop : 0,
      clueText: clueIn ? clueIn.value : "",
      clueFocus: clueIn && document.activeElement === clueIn,
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
    const focusEl = saved.clueFocus ? clueIn : (saved.activeId ? document.getElementById(saved.activeId) : null);
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
      if (so) so.onclick = () => { setAuth(null, null); location.reload(); };
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
        <div class="stats-ribbon__item"><span class="stats-ribbon__val">${redW}</span><span class="stats-ribbon__lbl">Red wins</span></div>
        <div class="stats-ribbon__item"><span class="stats-ribbon__val">${blueW}</span><span class="stats-ribbon__lbl">Blue wins</span></div>
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

  const ADULT_PACKS = new Set(["drinking", "rude", "adult", "offensive", "unfiltered", "afterdark", "bottomdrawer"]);
  const MATURE_PACKS = new Set(["drinking", "rude"]);

  const adultConfirmPacks = (packIds) => {
    const ids = Array.isArray(packIds) ? packIds : [packIds];
    const tiers = ids.map((id) => {
      const p = state.packs.find((x) => x.id === id);
      return p ? p.tier : (ADULT_PACKS.has(id) ? "adult" : "family");
    });
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
    if (!u || !u.displayName) {
      setAuth(null, null);
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
      ? friends.map((f) => `<li class="social-list__item"><span>${esc(f.displayName)}</span><button class="btn btn--sm" data-unfriend="${esc(f.id)}">Remove</button></li>`).join("")
      : `<li class="tiny muted">No friends yet — add someone from recent players.</li>`;

    const recentList = recent.length
      ? recent.filter((r) => r && r.user).map((r) => `<li class="social-list__item"><span>${esc(r.user.displayName)}${r.wasTeammate ? " · teammate" : " · opponent"}</span><button class="btn btn--sm" data-addfriend="${esc(r.user.id)}">Add friend</button></li>`).join("")
      : `<li class="tiny muted">Play a logged-in match to see recent players.</li>`;

    const pairList = pairings.length
      ? pairings.filter((p) => p && p.user).slice(0, 5).map((p) => `<li class="social-list__item"><span>${esc(p.user.displayName)}</span><span class="tiny muted">${p.winsTogether}/${p.gamesTogether} wins together</span></li>`).join("")
      : `<li class="tiny muted">No pairings yet.</li>`;

    const leaderList = leaders.length
      ? leaders.filter((l) => l && l.user).slice(0, 8).map((l, i) => `<li class="social-list__item"><span>${i + 1}. ${esc(l.user.displayName)}</span><span class="tiny muted">${l.wins} wins</span></li>`).join("")
      : `<li class="tiny muted">Leaderboard fills as logged-in games are played.</li>`;

    return `
      <div class="panel social-panel" id="social-panel">
        <div class="social-panel__head">
          <div class="social-user">
            ${u.avatarUrl ? `<img class="social-user__av" src="${esc(u.avatarUrl)}" alt="" />` : `<span class="social-user__av social-user__av--ph">👤</span>`}
            <div><b>${esc(u.displayName)}</b><div class="tiny muted">Cipher profile</div></div>
          </div>
          <button class="btn btn--sm" id="signout">Sign out</button>
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
    const signout = $("#signout");
    if (signout) {
      signout.onclick = () => { setAuth(null, null); state.social = null; boot(); };
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
        await authFetch(`/play/api/me/friends/${encodeURIComponent(id)}`, { method: "DELETE" });
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
            <span class="brand__name"><b>CIPHER</b></span>
          </div>
          <button class="icon-btn icon-btn--txt" id="theme" title="Toggle theme" aria-label="Toggle light/dark theme">◐</button>
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
            <div class="feature"><span class="ico">🃏</span><h4>Themed word packs</h4><p>Mix &amp; match Classic, Countries, Marvel, UK Snacks, Drinking, Offensive and more — or paste your own.</p></div>
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

    const createGame = async (packIds, btn, label) => {
      if (!adultConfirmPacks(packIds)) return;
      btn.disabled = true; btn.textContent = "Creating…";
      setName($("#name1").value.trim());
      try {
        const r = await fetch("/play/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packIds: Array.isArray(packIds) ? packIds : [packIds] }),
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
    const codeInput = wireCodeBoxes($("#codeboxes"), () => doJoin());
    const doJoin = () => {
      const code = codeInput.code();
      if (code.length < 4) { toast("Enter the full 4-letter room code.", "err"); return; }
      setName($("#name2").value.trim());
      location.hash = `#/room/${code}`;
    };
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
          <button type="button" class="btn btn--sm btn--red" data-team="red" data-role="spymaster">Red SM</button>
          <button type="button" class="btn btn--sm btn--red" data-team="red" data-role="operative">Red OP</button>
          <button type="button" class="btn btn--sm btn--blue" data-team="blue" data-role="spymaster">Blue SM</button>
          <button type="button" class="btn btn--sm btn--blue" data-team="blue" data-role="operative">Blue OP</button>
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
          <button class="icon-btn icon-btn--txt" id="mute" title="Toggle sound" aria-label="Toggle sound">${state.muted ? "×" : "♪"}</button>
          ${isHost ? `<button class="btn btn--sm" id="settings">Setup</button>` : ""}
          <button class="icon-btn icon-btn--txt" id="theme" title="Toggle theme" aria-label="Toggle theme">◐</button>
        </div>
      </div>`);
    el.querySelector("#leave").onclick = () => { location.hash = ""; };
    el.querySelector("#theme").onclick = toggleTheme;
    el.querySelector("#mute").onclick = () => { state.muted = !state.muted; renderRoom(); };
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
        <span>${st.devMode
          ? "<b>Dev mode on</b> — start solo; bots fill empty roles. Switch team/role anytime once the game begins."
          : "Pick a team and a role. Each team needs a <b>spymaster</b> (gives clues) and at least one <b>operative</b> (guesses). Share the room code to invite friends."}</span>
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
        ${p.isHost ? `<span class="tag" title="Host">HOST</span>` : ""}
        ${p.isBot ? `<span class="tag" title="Dev bot">BOT</span>` : ""}
        <span class="tag">${p.role === "spymaster" ? "SM" : p.team === "spectator" ? "—" : "OP"}</span>
      </div>`);
  }

  // ── scoreboard ───────────────────────────────────────────────────────────
  function scoreboard() {
    const g = state.room.game;
    const active = g.status === "playing" ? g.currentTeam : null;
    return h(`
      <div class="scoreboard-wrap">
        <div class="scoreboard">
          <div class="team-score team-score--red ${active === "red" ? "active" : ""}">
            <span class="num">${g.remaining.red}</span>
            <div class="meta"><b>Red</b><span class="tiny muted">remaining</span></div>
          </div>
          <div class="turn-pill">
            ${g.status === "ended"
              ? `<span class="who">Game over</span>`
              : `<span class="who" style="color:${g.currentTeam === "red" ? "var(--red)" : "var(--blue)"}">${g.currentTeam === "red" ? "Red" : "Blue"} to ${g.phase === "clue" ? "clue" : "guess"}</span>`}
            <span class="timer" id="timer"></span>
          </div>
          <div class="team-score team-score--blue ${active === "blue" ? "active" : ""}">
            <div class="meta" style="text-align:right"><b>Blue</b><span class="tiny muted">remaining</span></div>
            <span class="num">${g.remaining.blue}</span>
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
          <span>Index <strong>${g.board_size}×${g.board_size}</strong></span>
          <span>Round ${String(g.round || 1).padStart(2, "0")}</span>
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
    return { red: "R", blue: "B", neutral: "N", assassin: "X", hidden: "" }[kind] || "";
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
      const el = h(`
        <div class="panel cluebar">
          <form class="clue-form" id="clueform">
            <div class="field">
              <label for="clueword">Your clue${compound ? "" : " (one word)"}</label>
              <input class="input" id="clueword" maxlength="40" autocomplete="off" placeholder="${compound ? "e.g. ICE CREAM" : "e.g. OCEAN"}" />
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
        <div class="panel cluebar cluebar--active">
          <div class="clue-display">
            <span class="clue-meta">${g.currentTeam === "red" ? "Red" : "Blue"} field</span>
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
        <p class="win-banner__label">File closed</p>
        <h2>${w === "red" ? "Red" : "Blue"}</h2>
        <p class="muted">${g.winReason === "assassin" ? "Assassin contact." : "All agents accounted for."}${youWin ? " Your side." : ""}</p>
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
              ${[1, 2, 3, 4, 5].map((a) => `<button data-v="${a}" aria-pressed="${a === d.assassins}">${a}</button>`).join("")}
            </div>
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
      const tier = p.tier === "adult" ? " 🔞" : p.tier === "mature" ? " 18+" : "";
      const b = h(`<button type="button" class="pack-opt pack-opt--toggle" data-v="${p.id}" aria-pressed="${on}">
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
      if (!adultConfirmPacks(d.packIds)) return;
      send({ type: "settings", settings: {
        boardSize: d.boardSize, packIds: d.packIds, turnSeconds: d.turnSeconds,
        assassins: d.assassins, customWords: d.customWords,
        houseRules: d.houseRules, devMode: d.devMode,
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
