/* Cover Story - online location deduction */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const LS = {
    pid: "coverstory.pid",
    name: "coverstory.name",
    viewMode: "coverstory.viewMode",
    recentRooms: "coverstory.recentRooms",
  };
  const MIN_PLAYERS = 3;

  let ws = null;
  let routeCode = null;
  let lastRouteCode = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let timerInterval = null;
  let timerKey = null;
  let profileSaveTimer = null;

  const state = {
    connected: false,
    room: null,
    you: null,
    pendingSettings: null,
    revealMode: "accuse",
    accusedId: "",
    locationGuess: "",
    dossierOpen: false,
    viewMode: "table",
    customPacks: [],
    customPacksLoaded: false,
    customPackOpen: false,
    customPackDraft: null,
    playtestOpen: false,
    profileLoaded: false,
    profileSaving: false,
    profileSavedAt: 0,
  };

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
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
      if (!id) {
        id = crypto.randomUUID().replace(/-/g, "");
        localStorage.setItem(LS.pid, id);
      }
      return id;
    } catch (_) {
      return crypto.randomUUID().replace(/-/g, "");
    }
  }

  function playerName() {
    try { return (localStorage.getItem(LS.name) || "").trim(); } catch (_) { return ""; }
  }

  function saveName(n) {
    try { localStorage.setItem(LS.name, n); } catch (_) {}
    scheduleProfileSave();
  }

  function profilePayload() {
    const settings = state.pendingSettings || {
      timerSecs: 420,
      packIds: ["classic", "luxury", "chaos"],
      customPackIds: [],
      spyCount: 1,
    };
    return {
      alias: playerName(),
      preferences: {
        timerSecs: settings.timerSecs,
        packIds: settings.packIds || ["classic", "luxury", "chaos"],
        customPackIds: settings.customPackIds || [],
        spyCount: settings.spyCount || 1,
        viewMode: state.viewMode,
      },
      recentRooms: recentRooms(),
    };
  }

  async function saveProfileNow() {
    state.profileSaving = true;
    try {
      const r = await fetch(`/coverstory/api/profiles/${encodeURIComponent(pid())}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profilePayload()),
      });
      if (r.ok) state.profileSavedAt = Date.now();
    } catch (_) {
      // Profile sync should never block play.
    } finally {
      state.profileSaving = false;
    }
  }

  function scheduleProfileSave() {
    clearTimeout(profileSaveTimer);
    profileSaveTimer = setTimeout(saveProfileNow, 450);
  }

  async function loadProfile() {
    if (state.profileLoaded) return;
    state.profileLoaded = true;
    try {
      const r = await fetch(`/coverstory/api/profiles/${encodeURIComponent(pid())}`);
      if (!r.ok) {
        scheduleProfileSave();
        return;
      }
      const body = await r.json();
      const profile = body.profile || {};
      if (profile.persisted === false) scheduleProfileSave();
      if (profile.alias && !playerName()) saveName(profile.alias);
      const prefs = profile.preferences || {};
      state.pendingSettings = {
        timerSecs: Number.isInteger(prefs.timerSecs) ? prefs.timerSecs : 420,
        packIds: prefs.packIds && prefs.packIds.length ? prefs.packIds : ["classic", "luxury", "chaos"],
        customPackIds: prefs.customPackIds || [],
        spyCount: prefs.spyCount || 1,
      };
      if (prefs.viewMode === "remote" || prefs.viewMode === "table") setViewMode(prefs.viewMode, { quiet: true });
      if (Array.isArray(profile.recentRooms)) {
        try { localStorage.setItem(LS.recentRooms, JSON.stringify(profile.recentRooms.slice(0, 5))); } catch (_) {}
      }
      render();
    } catch (_) {}
  }

  function loadViewMode() {
    try {
      const mode = localStorage.getItem(LS.viewMode);
      if (mode === "remote" || mode === "table") state.viewMode = mode;
    } catch (_) {}
  }

  function setViewMode(mode, opts = {}) {
    state.viewMode = mode === "remote" ? "remote" : "table";
    try { localStorage.setItem(LS.viewMode, state.viewMode); } catch (_) {}
    if (!opts.quiet) scheduleProfileSave();
    render();
  }

  function recentRooms() {
    try {
      const rooms = JSON.parse(localStorage.getItem(LS.recentRooms) || "[]");
      return Array.isArray(rooms) ? rooms.slice(0, 5) : [];
    } catch (_) {
      return [];
    }
  }

  function rememberRoom(room) {
    if (!room || !room.code) return;
    try {
      const next = [
        { code: room.code, at: Date.now(), players: (room.players || []).length },
        ...recentRooms().filter((r) => r.code !== room.code),
      ].slice(0, 5);
      localStorage.setItem(LS.recentRooms, JSON.stringify(next));
      scheduleProfileSave();
    } catch (_) {}
  }

  async function loadCustomPacks() {
    if (state.customPacksLoaded) return;
    state.customPacksLoaded = true;
    try {
      const r = await fetch("/coverstory/api/custom-packs");
      if (!r.ok) return;
      const body = await r.json();
      state.customPacks = body.packs || [];
      render();
    } catch (_) {}
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
    toast("Not connected yet.");
    return false;
  }

  function parseRoute() {
    const m = location.hash.match(/^#\/room\/([A-Za-z0-9]+)/i);
    routeCode = m ? m[1].toUpperCase() : null;
  }

  function readNameFromUrl() {
    try {
      const n = (new URLSearchParams(location.search).get("name") || "").trim();
      if (n) saveName(n);
    } catch (_) {}
  }

  function playerById(id) {
    return (state.room && state.room.players || []).find((p) => p.id === id);
  }

  function playerLabel(id, fallback = "Someone") {
    const p = playerById(id);
    return p ? p.name : fallback;
  }

  function locationById(id) {
    return (state.room && state.room.game && state.room.game.locations || []).find((l) => l.id === id);
  }

  function roomInviteUrl(code) {
    const n = playerName();
    const q = n ? `?name=${encodeURIComponent(n)}` : "";
    return `${location.origin}/coverstory${q}#/room/${code}`;
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
    const text = `Join my Cover Story game - room ${code}`;
    if (navigator.share) {
      navigator.share({ title: "Cover Story - Wheesht", text, url })
        .then(() => toast("Invite sent"))
        .catch(() => copyText(url, "Invite link copied"));
      return;
    }
    copyText(url, "Invite link copied");
  }

  function connect(code) {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/coverstory/ws/${code}?pid=${encodeURIComponent(pid())}&name=${encodeURIComponent(playerName())}`;
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
        rememberRoom(msg.room);
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
    const body = state.pendingSettings || {
      timerSecs: 420,
      packIds: ["classic", "luxury", "chaos"],
      customPackIds: [],
      spyCount: 1,
    };
    const r = await fetch("/coverstory/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { toast("Couldn't create room."); return; }
    const d = await r.json();
    scheduleProfileSave();
    location.hash = `#/room/${d.code}`;
  }

  function timerSeg(current, onPick) {
    const opts = [[0, "Off"], [300, "5m"], [420, "7m"], [600, "10m"], [720, "12m"]];
    return el("div", { class: "timer-seg", role: "group", "aria-label": "Round timer" },
      opts.map(([s, label]) => el("button", {
        class: "timer-opt" + (current === s ? " on" : ""),
        text: label,
        onclick: () => onPick(s),
      }))
    );
  }

  function packSelector(packs, selected, onPick) {
    const active = new Set((selected && selected.length ? selected : ["classic"]));
    const toggle = (id) => {
      const next = new Set(active);
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      onPick(Array.from(next));
    };
    return el("div", { class: "pack-grid", role: "group", "aria-label": "Location packs" },
      (packs || []).map((pack) => el("button", {
        class: "pack-card" + (active.has(pack.id) ? " on" : ""),
        "aria-pressed": active.has(pack.id) ? "true" : "false",
        onclick: () => toggle(pack.id),
      }, [
        el("b", { text: pack.name }),
        el("span", { text: `${pack.count || 0} locations` }),
      ]))
    );
  }

  function plantCountSeg(current, onPick) {
    return el("div", { class: "mode-tabs", role: "group", "aria-label": "Number of plants" }, [
      el("button", { class: "tab" + (current === 1 ? " on" : ""), text: "1 plant", onclick: () => onPick(1) }),
      el("button", { class: "tab" + (current === 2 ? " on" : ""), text: "2 plants", onclick: () => onPick(2) }),
    ]);
  }

  function defaultCustomDraft() {
    return {
      name: "Office After Hours",
      description: "A private pack for tonight's table.",
      locations: [
        {
          name: "Server Room",
          category: "Office",
          texture: "Cold air, blinking racks, cable labels, and one forbidden switch.",
          roles: "Engineer\nIntern\nManager\nSecurity\nCleaner",
          questions: "What is too loud here?",
        },
        {
          name: "Boardroom",
          category: "Office",
          texture: "Glass walls, water jugs, expensive chairs, and one tense agenda.",
          roles: "Chair\nFinance Lead\nGuest\nAssistant\nConsultant",
          questions: "Who talks the most?",
        },
        {
          name: "Rooftop Terrace",
          category: "Office",
          texture: "City lights, paper cups, locked doors, and gossip in the wind.",
          roles: "Host\nNew Starter\nDirector\nPhotographer\nCaterer",
          questions: "What can you see from here?",
        },
      ],
    };
  }

  function splitLines(text) {
    return String(text || "")
      .split(/\n|,/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function ensureCustomDraft() {
    if (!state.customPackDraft) state.customPackDraft = defaultCustomDraft();
    return state.customPackDraft;
  }

  function draftInput(label, value, oninput, attrs = {}) {
    return el("label", { class: "fl" }, [
      el("span", { text: label }),
      el("input", { class: "in", value, oninput: (e) => oninput(e.target.value), ...attrs }),
    ]);
  }

  function draftTextarea(label, value, oninput) {
    return el("label", { class: "fl" }, [
      el("span", { text: label }),
      el("textarea", {
        class: "pack-lines pack-lines--short",
        text: value,
        oninput: (e) => oninput(e.target.value),
      }),
    ]);
  }

  function locationDraftCard(loc, index, draft) {
    const roles = el("textarea", {
      class: "pack-lines",
      text: loc.roles || "",
      oninput: (e) => { loc.roles = e.target.value; },
    });
    const questions = el("textarea", {
      class: "pack-lines pack-lines--short",
      text: loc.questions || "",
      oninput: (e) => { loc.questions = e.target.value; },
    });
    return el("div", { class: "location-builder" }, [
      el("div", { class: "location-builder__head" }, [
        el("b", { text: `Location ${index + 1}` }),
        draft.locations.length > 3 ? el("button", {
          class: "agent-kick",
          text: "Remove",
          onclick: () => { draft.locations.splice(index, 1); render(); },
        }) : null,
      ]),
      draftInput("Name", loc.name || "", (value) => { loc.name = value; }),
      draftInput("Category", loc.category || "", (value) => { loc.category = value; }),
      draftTextarea("Atmosphere", loc.texture || "", (value) => { loc.texture = value; }),
      el("label", { class: "fl" }, [el("span", { text: "Cover roles" }), roles]),
      el("label", { class: "fl" }, [el("span", { text: "Pressure questions" }), questions]),
    ]);
  }

  function customDraftPayload(draft) {
    return {
      name: draft.name,
      description: draft.description,
      locations: draft.locations.map((loc) => ({
        name: loc.name,
        category: loc.category,
        texture: loc.texture,
        roles: splitLines(loc.roles),
        questions: splitLines(loc.questions),
      })),
    };
  }

  function customPackBuilder() {
    if (!state.customPackOpen) {
      return el("button", {
        class: "btn btn--ghost btn--block",
        text: "Build custom pack",
        onclick: () => { state.customPackOpen = true; ensureCustomDraft(); render(); },
      });
    }
    const draft = ensureCustomDraft();
    return el("div", { class: "custom-pack-box" }, [
      el("span", { class: "eyebrow", text: "Custom pack" }),
      el("div", { class: "pack-form" }, [
        draftInput("Pack name", draft.name, (value) => { draft.name = value; }),
        draftTextarea("Description", draft.description, (value) => { draft.description = value; }),
      ]),
      ...draft.locations.map((loc, i) => locationDraftCard(loc, i, draft)),
      el("div", { class: "join-row" }, [
        el("button", {
          class: "btn btn--ghost",
          text: "Add location",
          onclick: () => {
            draft.locations.push({ name: "", category: "", texture: "", roles: "", questions: "" });
            render();
          },
        }),
        el("button", {
          class: "btn btn--primary",
          text: "Save pack",
          onclick: async () => {
            const r = await fetch("/coverstory/api/custom-packs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(customDraftPayload(draft)),
            });
            if (!r.ok) {
              let detail = "Could not save pack.";
              try { detail = (await r.json()).detail || detail; } catch (_) {}
              toast(detail);
              return;
            }
            const body = await r.json();
            state.customPacks = [body.pack].concat(state.customPacks.filter((p) => p.id !== body.pack.id));
            state.pendingSettings = state.pendingSettings || { timerSecs: 420, packIds: ["classic"], customPackIds: [], spyCount: 1 };
            state.pendingSettings.customPackIds = [body.pack.id].concat(state.pendingSettings.customPackIds || []);
            state.customPackOpen = false;
            state.customPackDraft = null;
            toast("Custom pack saved");
            render();
          },
        }),
      ]),
      el("div", { class: "join-row" }, [
        el("button", {
          class: "btn btn--ghost",
          text: "Reset sample",
          onclick: () => { state.customPackDraft = defaultCustomDraft(); render(); },
        }),
        el("button", {
          class: "btn btn--ghost",
          text: "Close",
          onclick: () => { state.customPackOpen = false; render(); },
        }),
      ]),
    ]);
  }

  function playtestReporter() {
    if (!state.playtestOpen) {
      return el("button", {
        class: "btn btn--ghost btn--block",
        text: "Send playtest notes",
        onclick: () => { state.playtestOpen = true; render(); },
      });
    }
    const tableSize = el("input", { class: "in", type: "number", min: "0", max: "50", value: "6" });
    const rounds = el("input", { class: "in", type: "number", min: "0", max: "50", value: "1" });
    const rating = el("input", { class: "in", type: "number", min: "0", max: "5", value: "4" });
    const notes = el("textarea", { class: "pack-import playtest-notes", placeholder: "What confused players? What felt great? Any reconnect or mobile issues?" });
    return el("div", { class: "custom-pack-box" }, [
      el("span", { class: "eyebrow", text: "Beta playtest notes" }),
      el("div", { class: "mini-fields" }, [
        el("label", { class: "fl" }, [el("span", { text: "Players" }), tableSize]),
        el("label", { class: "fl" }, [el("span", { text: "Rounds" }), rounds]),
        el("label", { class: "fl" }, [el("span", { text: "Rating /5" }), rating]),
      ]),
      notes,
      el("div", { class: "join-row" }, [
        el("button", {
          class: "btn btn--primary",
          text: "Submit notes",
          onclick: async () => {
            const body = {
              tableSize: Number(tableSize.value || 0),
              completedRounds: Number(rounds.value || 0),
              rating: Number(rating.value || 0),
              timerSecs: (state.pendingSettings && state.pendingSettings.timerSecs) || 0,
              packIds: (state.pendingSettings && state.pendingSettings.packIds) || [],
              notes: notes.value,
            };
            const r = await fetch("/coverstory/api/playtests", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!r.ok) { toast("Could not save playtest notes."); return; }
            state.playtestOpen = false;
            toast("Playtest notes saved");
            render();
          },
        }),
        el("button", { class: "btn btn--ghost", text: "Close", onclick: () => { state.playtestOpen = false; render(); } }),
      ]),
    ]);
  }

  function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function syncTimer(game) {
    const nextKey = game.status === "playing" && game.phase === "play"
      ? `${game.deadlineAt}:${game.pausedAt}:${game.timerRemaining}` : null;
    if (nextKey === timerKey) return;
    clearTimer();
    timerKey = nextKey;
    if (!nextKey || !game.deadlineAt) return;

    const deadline = game.deadlineAt * 1000;
    const pausedLeft = game.timerRemaining || 0;
    const wrap = document.getElementById("cs-timer");
    const bar = document.getElementById("cs-timer-bar");
    const txt = document.getElementById("cs-timer-text");
    const tick = () => {
      const left = game.timerPaused ? pausedLeft * 1000 : Math.max(0, deadline - Date.now());
      const total = Math.max(1, game.timerSecs * 1000);
      const secs = Math.ceil(left / 1000);
      const min = Math.floor(secs / 60);
      const sec = String(secs % 60).padStart(2, "0");
      if (txt) txt.textContent = game.timerPaused ? `Paused ${min}:${sec}` : (left > 0 ? `${min}:${sec}` : "Cover blown");
      if (bar) bar.style.width = `${100 * left / total}%`;
      if (left <= 0) {
        if (wrap) wrap.classList.add("up");
        clearTimer();
      }
    };
    tick();
    timerInterval = setInterval(tick, 250);
  }

  function playerRows(room, opts = {}) {
    const me = state.you && playerById(state.you.id);
    const game = room.game || {};
    return room.players.map((p) => el("div", { class: "agent" + (opts.large ? " agent--large" : "") + (p.connected ? "" : " off") }, [
      el("span", { class: "agent-dot", style: `background:${p.color}` }),
      el("span", { class: "agent-name", text: p.name }),
      p.isHost ? el("span", { class: "badge", text: "host" }) : null,
      opts.kicks && me && me.isHost && !p.isHost && (game.status !== "playing" || !p.connected)
        ? el("button", {
            class: "agent-kick",
            text: "Kick",
            onclick: () => send({ type: "kickPlayer", playerId: p.id }),
          })
        : null,
    ]));
  }

  function profileStatus() {
    const label = state.profileSaving
      ? "Saving profile"
      : (state.profileSavedAt ? "Profile synced" : "Profile ready");
    return el("div", { class: "profile-status" }, [
      el("span", { class: "agent-dot", style: "background:#12A594" }),
      el("span", { text: label }),
    ]);
  }

  function homeScreen() {
    readNameFromUrl();
    const nameIn = el("input", { class: "in", maxlength: "24", value: playerName(), placeholder: "Your name" });
    const joinIn = el("input", { class: "in code-in", maxlength: "6", placeholder: "CODE" });
    state.pendingSettings = state.pendingSettings || {
      timerSecs: 420,
      packIds: ["classic", "luxury", "chaos"],
      customPackIds: [],
      spyCount: 1,
    };
    const recent = recentRooms();
    return el("section", { class: "shell home-shell" }, [
      el("div", { class: "hero-pane" }, [
        el("span", { class: "eyebrow", text: "Social deduction" }),
        el("h1", {}, [document.createTextNode("Build the "), el("span", { class: "em", text: "cover." })]),
        el("p", { class: "lede", text: "Everyone receives the same secret location and a cover identity. One plant gets nothing but a list of possible places and a very sweaty smile." }),
        el("div", { class: "dossier-stack", "aria-hidden": "true" }, [
          el("div", { class: "mini-card a" }, [el("b", { text: "LOCATION" }), el("span", { text: "Moonlit Vineyard" })]),
          el("div", { class: "mini-card b" }, [el("b", { text: "COVER" }), el("span", { text: "Sommelier" })]),
          el("div", { class: "mini-card c" }, [el("b", { text: "PLANT" }), el("span", { text: "Unknown" })]),
        ]),
      ]),
      el("div", { class: "panel" }, [
        profileStatus(),
        el("label", { class: "fl" }, [el("span", { text: "Your name" }), nameIn]),
        el("label", { class: "fl" }, [
          el("span", { text: "Round timer" }),
          timerSeg(state.pendingSettings.timerSecs, (s) => { state.pendingSettings.timerSecs = s; scheduleProfileSave(); render(); }),
        ]),
        state.customPacks.length ? el("label", { class: "fl" }, [
          el("span", { text: "Custom packs" }),
          packSelector(state.customPacks, state.pendingSettings.customPackIds || [], (customPackIds) => {
            state.pendingSettings.customPackIds = customPackIds;
            scheduleProfileSave();
            render();
          }),
        ]) : null,
        customPackBuilder(),
        playtestReporter(),
        el("button", {
          class: "btn btn--primary btn--lg btn--block",
        text: "Create room",
          onclick: () => { saveName(nameIn.value.trim()); createRoom(); },
        }),
        el("div", { class: "join-row" }, [
          joinIn,
          el("button", {
            class: "btn btn--ink",
            text: "Join",
            onclick: () => {
              saveName(nameIn.value.trim());
              const c = joinIn.value.trim().toUpperCase();
              if (c) location.hash = `#/room/${c}`;
              else toast("Enter a room code.");
            },
          }),
        ]),
        el("p", { class: "note", text: `Best with ${MIN_PLAYERS}-10 players, each on their own phone.` }),
        recent.length ? el("div", { class: "recent-rooms" }, [
          el("span", { class: "eyebrow", text: "Recent rooms" }),
          ...recent.map((r) => el("button", {
            class: "recent-room",
            text: `${r.code} - ${r.players || 0} agents`,
            onclick: () => { location.hash = `#/room/${r.code}`; },
          })),
        ]) : null,
      ]),
    ]);
  }

  function lobbyScreen() {
    const room = state.room;
    const you = state.you;
    const me = playerById(you.id) || you;
    const connected = room.players.filter((p) => p.connected).length;
    const minP = (room.settings && room.settings.minPlayers) || MIN_PLAYERS;
    const settings = room.settings;
    const canStart = connected >= minP;
    state.pendingSettings = {
      timerSecs: settings.timerSecs,
      packIds: settings.packIds || ["classic"],
      customPackIds: settings.customPackIds || [],
      spyCount: settings.spyCount || 1,
    };
    const nameIn = el("input", {
      class: "in",
      maxlength: "24",
      value: you.name || playerName(),
      onchange: (e) => {
        saveName(e.target.value.trim());
        send({ type: "rename", name: e.target.value.trim() });
      },
    });

    const hostControls = me.isHost ? [
      el("label", { class: "fl" }, [
        el("span", { text: "Location packs" }),
        packSelector(room.game.packs || [], settings.packIds, (packIds) => {
          state.pendingSettings.packIds = packIds;
          scheduleProfileSave();
          send({ type: "settings", settings: { ...state.pendingSettings, packIds } });
        }),
      ]),
      state.customPacks.length ? el("label", { class: "fl" }, [
        el("span", { text: "Custom packs" }),
        packSelector(state.customPacks, settings.customPackIds || [], (customPackIds) => {
          state.pendingSettings.customPackIds = customPackIds;
          scheduleProfileSave();
          send({ type: "settings", settings: { ...state.pendingSettings, customPackIds } });
        }),
      ]) : customPackBuilder(),
      el("label", { class: "fl" }, [
        el("span", { text: "Plants" }),
        plantCountSeg(settings.spyCount || 1, (spyCount) => {
          state.pendingSettings.spyCount = spyCount;
          scheduleProfileSave();
          send({ type: "settings", settings: { ...state.pendingSettings, spyCount } });
        }),
      ]),
      el("label", { class: "fl" }, [
        el("span", { text: "Round timer" }),
        timerSeg(settings.timerSecs, (s) => {
          state.pendingSettings.timerSecs = s;
          scheduleProfileSave();
          send({ type: "settings", settings: { ...state.pendingSettings, timerSecs: s } });
        }),
      ]),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: canStart ? `Open dossiers (${connected} agents)` : `Waiting for agents (${connected}/${minP})`,
        disabled: canStart ? false : "disabled",
        onclick: () => send({ type: "start" }),
      }),
    ] : [
      el("p", { class: "note", text: `Waiting for the host to open dossiers. ${connected}/${minP} agents connected.` }),
    ];

    return el("section", { class: "shell" }, [
      el("div", { class: "panel room-panel" }, [
        el("span", { class: "eyebrow", text: "Room" }),
        el("button", {
          class: "room-code",
          text: room.code,
          title: "Copy room code",
          onclick: () => copyText(room.code, "Room code copied"),
        }),
        el("div", { class: "join-row" }, [
          el("button", { class: "btn btn--primary", text: "Share link", onclick: () => shareRoomLink(room.code) }),
          el("button", { class: "btn btn--ghost", text: "Copy code", onclick: () => copyText(room.code, "Room code copied") }),
        ]),
        el("label", { class: "fl" }, [el("span", { text: "Your alias" }), nameIn]),
        el("div", { class: "agents" }, playerRows(room, { kicks: true })),
        ...hostControls,
        el("button", { class: "btn btn--ghost btn--block", text: "Leave room", onclick: () => { location.hash = ""; } }),
      ]),
    ]);
  }

  function peekScreen() {
    const game = state.room.game;
    const you = state.you;
    if (you.hasViewed) {
      const waiting = (game.viewed || []).length;
      const total = (game.playerIds || []).length;
      return el("section", { class: "shell" }, [
        el("div", { class: "panel wait-panel" }, [
          el("span", { class: "eyebrow", text: "Dossier sealed" }),
          el("h1", {}, [document.createTextNode("Hold your "), el("span", { class: "em", text: "nerve." })]),
          el("p", { class: "note", text: `Waiting for others (${waiting}/${total}).` }),
        ]),
      ]);
    }

    if (!state.dossierOpen) {
      return el("section", { class: "shell" }, [
        el("div", { class: "sealed-dossier" }, [
          el("span", { class: "eyebrow", text: "Eyes only" }),
          el("div", { class: "seal-mark", text: "CLASSIFIED" }),
          el("h1", {}, [document.createTextNode("Open away from "), el("span", { class: "em", text: "the table." })]),
          el("p", { class: "lede", text: "Tilt your phone down, open your dossier, memorise it, then seal it before passing the screen around." }),
          el("button", {
            class: "btn btn--primary btn--lg btn--block",
            text: "Open private dossier",
            onclick: () => { state.dossierOpen = true; render(); },
          }),
        ]),
      ]);
    }

    const hideBtn = el("button", {
      class: "btn btn--primary btn--lg btn--block",
      text: "Seal dossier",
      onclick: () => {
        state.dossierOpen = false;
        send({ type: "markViewed" });
      },
    });

    if (game.isSpy) {
      return el("section", { class: "shell" }, [
        el("div", { class: "dossier dossier--spy" }, [
          el("span", { class: "eyebrow", text: "Private dossier" }),
          el("div", { class: "stamp", text: "PLANT" }),
          el("h1", { text: "You have no location." }),
          el("p", { class: "lede", text: game.spyBrief || "Blend in and infer the location." }),
          hideBtn,
        ]),
      ]);
    }

    const loc = game.location || {};
    return el("section", { class: "shell" }, [
      el("div", { class: "dossier" }, [
        el("span", { class: "eyebrow", text: "Private dossier" }),
        el("div", { class: "loc-card" }, [
          el("span", { class: "k", text: "Location" }),
          el("strong", { text: loc.name || "Unknown" }),
          el("small", { text: loc.category || "" }),
        ]),
        el("div", { class: "cover-card" }, [
          el("span", { class: "k", text: "Your cover" }),
          el("strong", { text: game.myCover || "Guest" }),
        ]),
        el("p", { class: "texture", text: loc.texture || "" }),
        el("div", { class: "prompt-strip" }, (loc.questions || []).map((q) => el("span", { text: q }))),
        hideBtn,
      ]),
    ]);
  }

  function locationGrid(game) {
    return el("details", { class: "locations" }, [
      el("summary", { text: "Location board" }),
      el("div", { class: "location-grid" },
        (game.locations || []).map((l) => el("div", { class: "location-chip" }, [
          el("b", { text: l.name }),
          el("span", { text: l.category }),
        ]))
      ),
    ]);
  }

  function revealControls(room, game) {
    const players = room.players.filter((p) => (game.playerIds || []).includes(p.id));
    const locations = game.locations || [];
    const modeAccuse = state.revealMode === "accuse";
    const canReveal = modeAccuse ? !!state.accusedId : !!state.locationGuess;
    return el("div", { class: "panel call-panel" }, [
      el("span", { class: "eyebrow", text: "End round" }),
      el("div", { class: "mode-tabs" }, [
        el("button", {
          class: "tab" + (modeAccuse ? " on" : ""),
          text: "Accuse",
          onclick: () => { state.revealMode = "accuse"; render(); },
        }),
        el("button", {
          class: "tab" + (!modeAccuse ? " on" : ""),
          text: "Plant guessed",
          onclick: () => { state.revealMode = "guess"; render(); },
        }),
      ]),
      modeAccuse
        ? el("select", {
            class: "select",
            onchange: (e) => { state.accusedId = e.target.value; },
          }, [
            el("option", { value: "", text: "Choose accused player" }),
            ...players.map((p) => el("option", { value: p.id, text: p.name, selected: state.accusedId === p.id ? "selected" : null })),
          ])
        : el("select", {
            class: "select",
            onchange: (e) => { state.locationGuess = e.target.value; },
          }, [
            el("option", { value: "", text: "Choose location guess" }),
            ...locations.map((l) => el("option", { value: l.id, text: l.name, selected: state.locationGuess === l.id ? "selected" : null })),
          ]),
      el("button", {
        class: "btn btn--primary btn--block",
        text: "Reveal result",
        disabled: canReveal ? false : "disabled",
        onclick: () => {
          if (modeAccuse) send({ type: "reveal", accusedId: state.accusedId });
          else send({ type: "reveal", locationGuess: state.locationGuess });
        },
      }),
    ]);
  }

  function questionPrompt(game) {
    const q = game.questionPrompt || {};
    if (!q.askerId || !q.targetId) return null;
    return el("div", { class: "prompt-card" }, [
      el("span", { class: "eyebrow", text: "Next question" }),
      el("p", {}, [
        el("b", { text: playerLabel(q.askerId) }),
        document.createTextNode(" asks "),
        el("b", { text: playerLabel(q.targetId) }),
        document.createTextNode("."),
      ]),
      el("small", { text: "Keep it oblique. Prove you know the place without handing it to the plant." }),
    ]);
  }

  function hostRoundControls(game) {
    return el("div", { class: "panel call-panel" }, [
      el("span", { class: "eyebrow", text: "Host controls" }),
      el("div", { class: "control-grid" }, [
        game.timerPaused
          ? el("button", { class: "btn btn--primary", text: "Resume", onclick: () => send({ type: "resumeTimer" }) })
          : el("button", {
              class: "btn btn--ghost",
              text: "Pause",
              disabled: game.deadlineAt ? false : "disabled",
              onclick: () => send({ type: "pauseTimer" }),
            }),
        el("button", { class: "btn btn--ghost", text: "+60s", onclick: () => send({ type: "extendTimer", seconds: 60 }) }),
        el("button", { class: "btn btn--ghost", text: "Next prompt", onclick: () => send({ type: "nextQuestion" }) }),
        el("button", { class: "btn btn--ink", text: "Accuse", onclick: () => send({ type: "beginAccusation" }) }),
      ]),
      el("button", { class: "btn btn--ghost btn--block", text: "Restart to lobby", onclick: () => send({ type: "reset" }) }),
    ]);
  }

  function viewToggle() {
    return el("div", { class: "mode-tabs view-tabs", role: "group", "aria-label": "Table view mode" }, [
      el("button", {
        class: "tab" + (state.viewMode === "table" ? " on" : ""),
        text: "Table",
        onclick: () => setViewMode("table"),
      }),
      el("button", {
        class: "tab" + (state.viewMode === "remote" ? " on" : ""),
        text: "Remote",
        onclick: () => setViewMode("remote"),
      }),
    ]);
  }

  function scoreBoard(room) {
    const scores = room.scores || {};
    const scored = room.players
      .map((p) => ({ ...p, score: scores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    if (!scored.some((p) => p.score > 0)) return null;
    return el("div", { class: "score-strip" },
      scored.map((p) => el("span", {}, [
        el("b", { text: p.name }),
        document.createTextNode(` ${p.score}`),
      ]))
    );
  }

  function playScreen() {
    const room = state.room;
    const game = room.game;
    const you = state.you;
    const me = playerById(you.id) || you;
    const timer = game.timerSecs > 0 ? el("div", { class: "timer", id: "cs-timer" }, [
      el("div", { class: "timer-bar", id: "cs-timer-bar" }),
      el("span", { class: "timer-text", id: "cs-timer-text", text: "--:--" }),
    ]) : null;

    const remote = state.viewMode === "remote";
    return el("section", { class: "shell play-shell" + (remote ? " remote-shell" : "") }, [
      el("div", { class: "panel table-panel" + (remote ? " table-panel--remote" : "") }, [
        el("span", { class: "eyebrow", text: "Questioning" }),
        el("h1", {}, [document.createTextNode("Ask without "), el("span", { class: "em", text: "leaking." })]),
        viewToggle(),
        timer,
        questionPrompt(game),
        scoreBoard(room),
        el("div", { class: "agents" }, playerRows(room, { kicks: true, large: remote })),
        el("div", { class: "question-bank" }, [
          el("span", { text: "Good pressure questions" }),
          el("b", { text: "What would you complain about here?" }),
          el("b", { text: "Who has the hardest job?" }),
          el("b", { text: "What would be expensive here?" }),
        ]),
        locationGrid(game),
      ]),
      me.isHost ? hostRoundControls(game) : el("div", { class: "panel" }, [
        el("p", { class: "note", text: "The host can pause, add time, advance prompts, or start the accusation." }),
      ]),
    ]);
  }

  function accusationScreen() {
    const room = state.room;
    const game = room.game;
    const me = playerById(state.you.id) || state.you;
    return el("section", { class: "shell play-shell" }, [
      el("div", { class: "panel table-panel" }, [
        el("span", { class: "eyebrow", text: "Final call" }),
        el("h1", {}, [document.createTextNode("Make the "), el("span", { class: "em", text: "accusation." })]),
        el("p", { class: "lede", text: "The table has stopped questioning. Either accuse the plant, or record the plant's location guess." }),
        viewToggle(),
        el("div", { class: "agents" }, playerRows(room, { large: state.viewMode === "remote" })),
        locationGrid(game),
      ]),
      me.isHost ? revealControls(room, game) : el("div", { class: "panel" }, [
        el("p", { class: "note", text: "The host is recording the final call." }),
      ]),
    ]);
  }

  function resultScreen() {
    const room = state.room;
    const game = room.game;
    const me = playerById(state.you.id) || state.you;
    const res = game.result || {};
    const spies = (res.spyIds || [res.spyId]).filter(Boolean).map((id) => playerLabel(id)).join(", ");
    const accused = playerById(res.accusedId);
    const guessed = locationById(res.locationGuess);
    const crewWon = !!res.crewWon;
    const title = crewWon ? "Cover blown." : "The plant escaped.";
    const line = res.locationGuess
      ? `${spies || "The plant"} guessed ${guessed ? guessed.name : "the location"}.`
      : `${accused ? accused.name : "Someone"} was accused.`;
    const shareLine = `Cover Story: ${crewWon ? "crew exposed the plant" : "the plant escaped"} at ${res.locationName || "the secret location"} in room ${room.code}.`;

    return el("section", { class: "shell" }, [
      el("div", { class: "panel result-panel " + (crewWon ? "crew" : "spy") }, [
        el("div", { class: "result-burst", text: crewWon ? "EXPOSED" : "ESCAPED" }),
        el("span", { class: "eyebrow", text: crewWon ? "Crew win" : "Plant win" }),
        el("h1", { text: title }),
        el("p", { class: "lede", text: line }),
        el("div", { class: "answer-grid" }, [
          el("div", {}, [el("span", { text: "Plant" }), el("b", { text: spies || "Unknown" })]),
          el("div", {}, [el("span", { text: "Location" }), el("b", { text: res.locationName || "Unknown" })]),
        ]),
        scoreBoard(room),
        el("button", { class: "btn btn--ghost btn--block", text: "Copy result summary", onclick: () => copyText(shareLine, "Result copied") }),
        (room.history || []).length ? el("div", { class: "history-strip" },
          room.history.slice(-5).map((h) => el("span", { text: `R${h.round}: ${h.winner}` }))
        ) : null,
        me.isHost ? el("div", { class: "join-row" }, [
          el("button", {
            class: "btn btn--primary",
            text: "New round",
            onclick: () => {
              state.accusedId = "";
              state.locationGuess = "";
              send({ type: "newRound" });
            },
          }),
          el("button", { class: "btn btn--ghost", text: "Back to lobby", onclick: () => send({ type: "reset" }) }),
        ]) : el("p", { class: "note", text: "The host can start the next round." }),
      ]),
    ]);
  }

  function gameScreen() {
    const game = state.room.game;
    if (game.phase === "peek") return peekScreen();
    if (game.phase === "accuse") return accusationScreen();
    if (game.phase === "reveal") return resultScreen();
    return playScreen();
  }

  function render() {
    if (!routeCode) {
      clearTimer();
      timerKey = null;
      app.replaceChildren(homeScreen());
      window.scrollTo(0, 0);
      return;
    }
    if (!state.room) {
      clearTimer();
      timerKey = null;
      app.replaceChildren(el("section", { class: "shell" }, [
        el("div", { class: "panel" }, [el("p", { class: "note", text: "Connecting to room..." })]),
      ]));
      return;
    }
    const game = state.room.game;
    if (game.status === "lobby") {
      clearTimer();
      timerKey = null;
      app.replaceChildren(lobbyScreen());
    } else {
      app.replaceChildren(gameScreen());
      syncTimer(game);
    }
    window.scrollTo(0, 0);
  }

  function boot() {
    readNameFromUrl();
    loadViewMode();
    loadProfile();
    loadCustomPacks();
    parseRoute();
    const routeChanged = routeCode !== lastRouteCode;
    if (routeChanged) {
      clearTimeout(reconnectTimer);
      lastRouteCode = routeCode;
      timerKey = null;
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
