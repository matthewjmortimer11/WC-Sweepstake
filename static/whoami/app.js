/* Who Am I? — online multiplayer */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const LS = { pid: "whoami.pid", name: "whoami.name" };
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 50;

  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let pingTimer = null;
  let routeCode = null;
  let lastRouteCode = null;
  let localMode = false;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const state = { room: null, you: null, packs: [], homePackIds: ["uk_celebs"] };

  const lobbyMin = (room) => (room && room.settings && room.settings.minPlayers) || MIN_PLAYERS;

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

  // Preserve the focused field (and its in-progress text + caret) across a
  // full re-render. Without this, an incoming state broadcast rebuilds the DOM
  // and wipes whatever you're typing — e.g. your name in the lobby.
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

  function readNameFromUrl() {
    try {
      const n = (new URLSearchParams(location.search).get("name") || "").trim();
      if (n) saveName(n);
    } catch (_) {}
  }

  function parseRoute() {
    localMode = /^#\/local\b/i.test(location.hash || "");
    const m = location.hash.match(/^#\/room\/([A-Za-z0-9]+)/i);
    routeCode = localMode ? null : (m ? m[1].toUpperCase() : null);
  }

  function playerById(id) {
    return (state.room && state.room.players || []).find((p) => p.id === id);
  }

  async function loadPacks() {
    if (state.packs.length) return;
    try {
      const r = await fetch("/whoami/api/packs");
      if (r.ok) state.packs = (await r.json()).packs || [];
    } catch (_) {
      state.packs = [];
    }
  }

  function confirmMaturePacks(packIds, prevIds) {
    const prev = new Set(prevIds || []);
    const newlyMature = packIds.filter((id) => {
      if (prev.has(id)) return false;
      const p = state.packs.find((x) => x.id === id);
      return p && p.tier === "mature";
    });
    if (!newlyMature.length) return true;
    const names = newlyMature.map((id) => (state.packs.find((x) => x.id === id) || {}).name).filter(Boolean).join(", ");
    return window.confirm(
      `You've selected mature packs (${names}) — dictators, tyrants and controversial figures. `
      + "Only continue if everyone in the room is comfortable. Start anyway?"
    );
  }

  function refreshPackGrid(grid, selectedIds) {
    const ids = selectedIds || ["uk_celebs"];
    grid.querySelectorAll(".pack-opt").forEach((btn) => {
      const id = btn.dataset.pack;
      const on = ids.includes(id);
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function packToggleGrid(selectedIds, onToggle, editable) {
    const ids = selectedIds || ["uk_celebs"];
    const grid = el("div", { class: "pack-grid" });
    (state.packs.length ? state.packs : [{ id: "uk_celebs", name: "UK Celebs", emoji: "🇬🇧", blurb: "", count: 0, tier: "family" }])
      .forEach((p) => {
        const on = ids.includes(p.id);
        const btn = el("button", {
          type: "button",
          class: "pack-opt" + (on ? " on" : "") + (p.tier === "mature" ? " pack-opt--mature" : ""),
          "data-pack": p.id,
          "aria-pressed": on ? "true" : "false",
          disabled: editable ? false : "disabled",
          onclick: () => {
            if (!editable) return;
            let next = on ? ids.filter((x) => x !== p.id) : [...ids, p.id];
            if (!next.length) next = ["uk_celebs"];
            if (!confirmMaturePacks(next, ids)) return;
            onToggle(next);
            refreshPackGrid(grid, next);
          },
        }, [
          el("span", { class: "pack-opt__emoji", text: p.emoji || "📦" }),
          el("span", { class: "pack-opt__name", text: p.name }),
          p.blurb ? el("span", { class: "pack-opt__blurb tiny muted", text: p.blurb }) : null,
          el("span", { class: "pack-opt__meta tiny muted", text: (p.count || 0) + " identities" }),
        ]);
        grid.append(btn);
      });
    return grid;
  }

  function sendPackSettings(packIds) {
    send({ type: "settings", settings: { packIds } });
  }

  function roomInviteUrl(code) {
    const n = playerName();
    const q = n ? `?name=${encodeURIComponent(n)}` : "";
    return `${location.origin}/whoami${q}#/room/${code}`;
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
    } else fallbackCopy(text, done);
  }

  function shareRoomLink(code) {
    const url = roomInviteUrl(code);
    const text = `Join my Who Am I? game — room ${code}`;
    if (navigator.share) {
      navigator.share({ title: "Who Am I? — Wheesht", text, url })
        .then(() => toast("Invite sent"))
        .catch(() => copyText(url, "Invite link copied"));
      return;
    }
    copyText(url, "Invite link copied");
  }

  function initials(name) {
    return (name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  }

  function avatarNode(player, cls) {
    if (player && player.avatarUrl) {
      return el("img", { class: cls, src: player.avatarUrl, alt: "", loading: "lazy" });
    }
    return el("span", { class: cls + " " + cls + "--ph", text: initials(player && player.name) });
  }

  function resizeAvatar(file, maxPx) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => reject(new Error("bad image"));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }

  function pickAvatar(onDone) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const dataUrl = await resizeAvatar(file, 256);
        onDone(dataUrl);
      } catch (_) {
        toast("Couldn't read that image.");
      }
    };
    input.click();
  }

  function startPing() {
    clearInterval(pingTimer);
    // A periodic ping keeps the socket alive through idle proxy timeouts, so
    // the lobby doesn't churn through reconnect → re-render loops.
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 25000);
  }

  function connect(code) {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    clearInterval(pingTimer);
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/whoami/ws/${code}?pid=${encodeURIComponent(pid())}&name=${encodeURIComponent(playerName())}`;
    ws = new WebSocket(url);
    ws.onopen = () => { reconnectDelay = 800; startPing(); };
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
      if (msg.type === "hello" && msg.pid) {
        try { localStorage.setItem(LS.pid, msg.pid); } catch (_) {}
      }
      if (msg.type === "state") {
        state.room = msg.room;
        state.you = msg.you;
        render();
      }
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      if (routeCode) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 1.5, 8000);
          connect(routeCode);
        }, reconnectDelay);
      }
    };
  }

  async function createRoom(packIds) {
    const ids = packIds && packIds.length ? packIds : state.homePackIds;
    if (!confirmMaturePacks(ids, [])) return;
    const r = await fetch("/whoami/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packIds: ids }),
    });
    if (!r.ok) { toast("Couldn't create room."); return; }
    const code = (await r.json()).code;
    location.hash = `#/room/${code}`;
  }

  function avatarPicker(you) {
    const fileInputId = "av-file";
    const row = el("div", { class: "av-row" }, [
      avatarNode(you, "av"),
      el("div", { class: "av-actions" }, [
        el("button", {
          class: "btn btn--sm btn--ghost", text: "Change photo",
          onclick: () => pickAvatar((dataUrl) => send({ type: "setAvatar", dataUrl })),
        }),
        you.hasAvatar ? el("button", {
          class: "btn btn--sm btn--ghost", text: "Remove",
          onclick: () => send({ type: "clearAvatar" }),
        }) : null,
      ]),
    ]);
    return row;
  }

  function homeScreen() {
    readNameFromUrl();
    const nameIn = el("input", {
      class: "in", maxlength: "24", value: playerName(), placeholder: "Your name",
      "data-fkey": "home-name",
      oninput: (e) => saveName(e.target.value.trim()),
    });
    const joinIn = el("input", { class: "in", maxlength: "6", placeholder: "Room code", "data-fkey": "home-join", style: "text-transform:uppercase;letter-spacing:.15em" });
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Online" }),
      el("h1", {}, [document.createTextNode("Who "), el("span", { class: "em", text: "am I?" })]),
      el("p", { class: "lede", text: "Everyone gets a secret identity stuck to their forehead — UK celebs, Marvel heroes, cartoon characters, random objects, or notorious figures. You see everyone else's card, not your own. Ask yes/no questions until you guess it." }),
      el("label", { class: "fl" }, [
        el("span", { text: "Identity packs" }),
        packToggleGrid(state.homePackIds, (ids) => { state.homePackIds = ids; }, true),
      ]),
      el("label", { class: "fl" }, [el("span", { text: "Your name" }), nameIn]),
      el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Create room →",
        onclick: () => { saveName(nameIn.value.trim()); createRoom(state.homePackIds); },
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
      el("p", { class: "note", text: `Works with ${MIN_PLAYERS}+ players. Share the game link — friends join on their phones, then the host starts when everyone's in.` }),
      el("button", {
        class: "btn btn--ghost btn--block", text: "One phone — pass it around",
        onclick: () => { location.hash = "#/local"; },
      }),
    ]);
  }

  // ── Local pass-the-phone ─────────────────────────────────────────────────

  const local = {
    screen: "setup",
    names: ["Player 1", "Player 2", "Player 3", "Player 4"],
    packIds: ["uk_celebs"],
    chars: [],
    viewed: [],
    claimed: [],
    confirmed: {},
    perspective: 0,
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

  async function fetchCharacterPool(packIds) {
    const q = encodeURIComponent((packIds || ["uk_celebs"]).join(","));
    const r = await fetch(`/whoami/api/character-pool?packIds=${q}`);
    if (!r.ok) throw new Error("pool");
    return (await r.json()).characters;
  }

  function shuffleDeal(pool) {
    const copy = pool.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, localPlayerCount());
  }

  async function localStartGame() {
    let pool;
    try {
      pool = await fetchCharacterPool(local.packIds);
    } catch (_) {
      toast("Couldn't load identities — check your connection.");
      return;
    }
    if (pool.length < localPlayerCount()) {
      toast(`Need more packs — only ${pool.length} identities for ${localPlayerCount()} players.`);
      return;
    }
    if (!confirmMaturePacks(local.packIds, [])) return;
    local.chars = shuffleDeal(pool);
    local.viewed = [];
    local.claimed = [];
    local.confirmed = {};
    local.perspective = 0;
    local.screen = "select";
    renderLocal();
  }

  async function localNewRound() {
    let pool;
    try {
      pool = await fetchCharacterPool(local.packIds);
    } catch (_) {
      toast("Couldn't load identities.");
      return;
    }
    if (pool.length < localPlayerCount()) {
      toast("Add more packs for this many players.");
      return;
    }
    local.chars = shuffleDeal(pool);
    local.viewed = [];
    local.claimed = [];
    local.confirmed = {};
    local.screen = "select";
    renderLocal();
  }

  function localConfirmedSet(targetIdx) {
    if (!local.confirmed[targetIdx]) local.confirmed[targetIdx] = new Set();
    return local.confirmed[targetIdx];
  }

  function localCanClaim(idx) {
    if (local.claimed.includes(idx)) return false;
    const others = local.names.map((_, i) => i).filter((i) => i !== idx);
    const confirmed = local.confirmed[idx] || new Set();
    return others.some((o) => confirmed.has(o));
  }

  function localAllClaimed() {
    return local.names.every((_, i) => local.claimed.includes(i));
  }

  function localSetupScreen() {
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "One phone" }),
      el("h1", {}, [document.createTextNode("Who "), el("span", { class: "em", text: "am I?" })]),
      el("p", { class: "lede", text: "Pass the phone so everyone secretly sees their identity, then ask yes/no questions until each person guesses who they are." }),
      el("label", { class: "fl" }, [
        el("span", { text: "Identity packs" }),
        packToggleGrid(local.packIds, (ids) => { local.packIds = ids; }, true),
      ]),
      el("div", { class: "row" }, [
        el("button", { class: "btn btn--ghost", text: "+ Add player", disabled: local.names.length >= MAX_PLAYERS ? "disabled" : false, onclick: addLocalPlayer }),
        el("button", { class: "btn btn--ghost", text: "− Remove player", disabled: local.names.length <= MIN_PLAYERS ? "disabled" : false, onclick: removeLocalPlayer }),
      ]),
      el("div", { class: "names" }, local.names.map((name, i) => el("label", { class: "fl" }, [
        el("span", { text: "Player " + (i + 1) }),
        el("input", { class: "in", maxlength: "20", value: name, "data-fkey": "local-name-" + i, oninput: (e) => { local.names[i] = e.target.value; } }),
      ]))),
      el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Start game →",
        disabled: local.names.length < MIN_PLAYERS ? "disabled" : false,
        onclick: () => {
          local.names = local.names.map((n, i) => (n || "").trim() || ("Player " + (i + 1)));
          localStartGame();
        },
      }),
      el("button", { class: "btn btn--ghost btn--block", text: "← Online rooms", onclick: () => { location.hash = ""; } }),
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
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Pass the phone" }),
      el("p", { class: "note", text: "Only tap your own name. No peeking." }),
      grid,
      allViewed ? el("p", { class: "note", text: "Everyone's seen their identity. Time to guess!" }) : null,
      allViewed ? el("button", {
        class: "btn btn--primary btn--lg btn--block", text: "Start guessing →",
        onclick: () => { local.screen = "play"; renderLocal(); },
      }) : null,
      el("button", { class: "btn btn--ghost btn--block", text: "← Setup", onclick: () => { local.screen = "setup"; renderLocal(); } }),
    ]);
  }

  function localRevealScreen() {
    const i = local.current;
    return el("div", { class: "panel" }, [
      el("div", { class: "reveal" }, [
        el("span", { class: "who", text: local.names[i] }),
        el("span", { class: "role-cap tiny muted", text: "Your identity" }),
        el("div", { class: "role charade", text: local.chars[i] || "…" }),
        el("p", { class: "role-sub", text: "Remember it — others will see everyone else's card, not their own." }),
        el("button", {
          class: "btn btn--primary btn--lg btn--block", text: "Hide →",
          onclick: () => {
            if (!local.viewed.includes(i)) local.viewed.push(i);
            local.screen = "select";
            renderLocal();
          },
        }),
      ]),
    ]);
  }

  function localPlayScreen() {
    const p = local.perspective;
    const bits = [
      el("span", { class: "eyebrow", text: "Round" }),
      el("label", { class: "fl" }, [
        el("span", { text: "Who's asking?" }),
        el("div", { class: "seg" }, local.names.map((name, i) => el("button", {
          class: local.perspective === i ? "on" : "",
          text: name,
          onclick: () => { local.perspective = i; renderLocal(); },
        }))),
      ]),
      el("p", { class: "note", text: "Ask yes/no questions out loud. When someone guesses right, tap They got it! on their card." }),
      el("div", { class: "card-grid" }, local.names.map((name, i) => {
        const isYou = i === p;
        const claimed = local.claimed.includes(i);
        const confirmed = local.confirmed[i] || new Set();
        const charText = isYou && !claimed ? "???  (ask the others)" : (local.chars[i] || "…");
        const actions = [];
        if (!isYou && !claimed) {
          const byYou = confirmed.has(p);
          actions.push(el("button", {
            class: "btn btn--sm" + (byYou ? " btn--got" : " btn--ghost"),
            text: byYou ? "✓ Confirmed (tap to undo)" : "They got it!",
            onclick: () => {
              const set = localConfirmedSet(i);
              if (set.has(p)) set.delete(p);
              else set.add(p);
              renderLocal();
            },
          }));
        }
        return el("div", { class: "wai-card" + (isYou ? " you" : "") + (claimed ? " done" : "") }, [
          el("div", { class: "wai-card__who" }, [
            el("div", { class: "wai-card__name", text: name }),
            el("div", { class: "wai-card__tag", text: isYou ? "That's you" : (claimed ? "Guessed!" : "Their identity") }),
          ]),
          el("div", { class: "wai-card__char reveal" + (isYou && !claimed ? " hidden" : ""), text: charText }),
          el("div", { class: "wai-card__meta" }, actions),
        ]);
      })),
    ];

    if (localCanClaim(p) && !local.claimed.includes(p)) {
      bits.push(el("button", {
        class: "btn btn--got btn--lg btn--block", text: "I got it! →",
        onclick: () => { local.claimed.push(p); renderLocal(); },
      }));
    }

    if (localAllClaimed()) {
      bits.push(el("p", { class: "note", text: "Everyone guessed!" }));
      bits.push(el("button", { class: "btn btn--primary btn--block", text: "Next round →", onclick: localNewRound }));
    }

    bits.push(el("button", { class: "btn btn--ghost btn--block", text: "New game", onclick: () => { local.screen = "setup"; renderLocal(); } }));
    return el("div", { class: "panel" }, bits);
  }

  function renderLocal() {
    const cap = captureFocus();
    const screen = local.screen === "setup" ? localSetupScreen()
      : local.screen === "reveal" ? localRevealScreen()
      : local.screen === "play" ? localPlayScreen()
      : localSelectScreen();
    app.replaceChildren(screen);
    restoreFocus(cap);
  }

  function lobbyScreen() {
    const room = state.room;
    const you = state.you;
    const me = playerById(you.id) || you;
    const connected = room.players.filter((p) => p.connected).length;
    const minP = lobbyMin(room);
    const canStart = connected >= minP;

    const nameIn = el("input", {
      class: "in", maxlength: "24", value: you.name || playerName(),
      "data-fkey": "lobby-name",
      // Save every keystroke locally so a reconnect re-sends the latest name
      // (instead of reverting to a stale one); commit to the room on blur.
      oninput: (e) => saveName(e.target.value.trim()),
      onchange: (e) => send({ type: "rename", name: e.target.value.trim() }),
    });

    const packIds = (room.settings && room.settings.packIds) || ["uk_celebs"];
    const packName = (room.settings && room.settings.packName) || "UK Celebs";
    const identityCount = (room.settings && room.settings.identityCount) || 0;
    const enoughIdentities = identityCount >= connected;

    const hostBits = me.isHost ? [
      el("label", { class: "fl" }, [
        el("span", { text: "Identity packs" }),
        packToggleGrid(packIds, (ids) => sendPackSettings(ids), true),
      ]),
      enoughIdentities
        ? el("p", { class: "note tiny muted", text: `${identityCount} identities from ${packName}` })
        : el("p", { class: "note", text: `Only ${identityCount} identities in ${packName} — need ${connected}. Add more packs.` }),
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: !canStart
          ? `Waiting for players (${connected}/${minP})…`
          : !enoughIdentities
            ? `Need more packs (${identityCount}/${connected} identities)`
            : `Start game (${connected} players) →`,
        disabled: canStart && enoughIdentities ? false : "disabled",
        onclick: () => send({ type: "start" }),
      }),
    ] : [
      el("p", { class: "note", text: `Packs: ${packName}` }),
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
      el("label", { class: "fl" }, [el("span", { text: "Your photo (shown on your card)" }), avatarPicker(you)]),
      el("div", { class: "players" }, room.players.map((p) => el("div", { class: "player-row" + (p.connected ? "" : " off") }, [
        el("div", { class: "player-row__who" }, [
          p.hasAvatar
            ? el("img", { class: "wai-card__av", src: p.avatarUrl, alt: "", style: "width:36px;height:36px" })
            : el("span", { class: "player-dot", style: `background:${p.color}` }),
          el("span", { class: "player-row__name", text: p.name }),
        ]),
        p.isHost ? el("span", { class: "badge badge--host", text: "host" }) : null,
      ]))),
      ...hostBits,
      el("button", { class: "btn btn--ghost btn--block", text: "Leave room", onclick: () => { location.hash = ""; } }),
    ]);
  }

  function characterCard(card, youId) {
    const player = playerById(card.id);
    const isYou = card.id === youId;
    const cls = "wai-card" + (isYou ? " you" : "") + (card.claimed ? " done" : "");

    const charEl = el("div", {
      class: "wai-card__char" + (card.hidden ? " hidden" : " reveal"),
      text: card.hidden ? "???  (ask the others)" : (card.character || "…"),
    });

    const actions = [];
    if (!isYou && !card.claimed) {
      actions.push(el("button", {
        class: "btn btn--sm" + (card.confirmedByYou ? " btn--got" : " btn--ghost"),
        text: card.confirmedByYou ? "✓ Confirmed (tap to undo)" : "They got it!",
        onclick: () => send({
          type: "confirmGuess",
          playerId: card.id,
          undo: card.confirmedByYou ? true : false,
        }),
      }));
    }

    return el("div", { class: cls }, [
      el("div", { class: "wai-card__top" }, [
        avatarNode(player, "wai-card__av"),
        el("div", { class: "wai-card__who" }, [
          el("div", { class: "wai-card__name", text: (player && player.name) || "…" }),
          el("div", { class: "wai-card__tag", text: isYou ? "That's you" : (card.claimed ? "Guessed!" : "Their identity") }),
        ]),
      ]),
      charEl,
      el("div", { class: "wai-card__meta" }, [
        card.confirmCount > 0
          ? el("span", { class: "wai-card__conf", text: `${card.confirmCount} confirmation${card.confirmCount === 1 ? "" : "s"}` })
          : el("span", { class: "wai-card__conf", text: isYou ? "Get a confirmation to claim" : "" }),
        ...actions,
      ]),
    ]);
  }

  function gameScreen() {
    const room = state.room;
    const you = state.you;
    const me = playerById(you.id) || you;
    const game = room.game;

    const bits = [
      el("span", { class: "eyebrow", text: "Round" }),
      el("p", { class: "note", text: "You can see everyone else's identity. Ask yes/no questions out loud — when someone guesses right, tap They got it! on their card." }),
      el("div", { class: "card-grid" }, (game.cards || []).map((c) => characterCard(c, you.id))),
    ];

    if (game.canClaim && !game.youClaimed) {
      bits.push(el("button", {
        class: "btn btn--got btn--lg btn--block",
        text: "I got it! →",
        onclick: () => send({ type: "claimGotIt" }),
      }));
    }

    if (game.youClaimed) {
      bits.push(el("p", { class: "note", text: "You claimed it — waiting for everyone else…" }));
    }

    if (game.allClaimed) {
      bits.push(el("p", { class: "note", text: "Everyone guessed! Host can deal a new round." }));
      if (me.isHost) {
        bits.push(el("button", {
          class: "btn btn--primary btn--block", text: "Next round →",
          onclick: () => send({ type: "newRound" }),
        }));
      }
    } else if (me.isHost) {
      bits.push(el("button", {
        class: "btn btn--ghost btn--block", text: "Back to lobby",
        onclick: () => send({ type: "reset" }),
      }));
    }

    return el("div", { class: "panel" }, bits);
  }

  function render() {
    if (localMode) {
      renderLocal();
      return;
    }
    const cap = captureFocus();
    app.replaceChildren();
    if (!state.room) {
      if (routeCode) {
        app.append(el("div", { class: "panel" }, [
          el("p", { class: "note", text: "Connecting to room…" }),
        ]));
      } else {
        app.append(homeScreen());
      }
      restoreFocus(cap);
      return;
    }
    const status = state.room.game && state.room.game.status;
    if (status === "playing") app.append(gameScreen());
    else app.append(lobbyScreen());
    restoreFocus(cap);
  }

  async function boot() {
    await loadPacks();
    readNameFromUrl();
    parseRoute();
    if (localMode && ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
      state.room = null;
      state.you = null;
    }
    if (routeCode !== lastRouteCode) {
      clearTimeout(reconnectTimer);
      lastRouteCode = routeCode;
      if (routeCode) {
        state.room = null;
        state.you = null;
        connect(routeCode);
      } else {
        if (ws) { try { ws.close(); } catch (_) {} ws = null; }
        state.room = null;
        state.you = null;
      }
    }
    render();
  }

  window.addEventListener("hashchange", boot);
  boot();
})();
