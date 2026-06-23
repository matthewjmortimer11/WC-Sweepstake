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
  let routeCode = null;
  let lastRouteCode = null;

  const state = { room: null, you: null };

  const lobbyMin = (room) => (room && room.settings && room.settings.minPlayers) || MIN_PLAYERS;

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
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
    const m = location.hash.match(/^#\/room\/([A-Za-z0-9]+)/i);
    routeCode = m ? m[1].toUpperCase() : null;
  }

  function playerById(id) {
    return (state.room && state.room.players || []).find((p) => p.id === id);
  }

  function roomInviteUrl(code) {
    return `${location.origin}/whoami#/room/${code}`;
  }

  function copyText(text, okMsg) {
    const done = () => toast(okMsg);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => toast(text));
    } else toast(text);
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

  function connect(code) {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/whoami/ws/${code}?pid=${encodeURIComponent(pid())}&name=${encodeURIComponent(playerName())}`;
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
    const r = await fetch("/whoami/api/rooms", { method: "POST" });
    if (!r.ok) { toast("Couldn't create room."); return; }
    location.hash = `#/room/${(await r.json()).code}`;
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
    const nameIn = el("input", { class: "in", maxlength: "24", value: playerName(), placeholder: "Your name" });
    const joinIn = el("input", { class: "in", maxlength: "6", placeholder: "Room code", style: "text-transform:uppercase;letter-spacing:.15em" });
    return el("div", { class: "panel" }, [
      el("span", { class: "eyebrow", text: "Online" }),
      el("h1", {}, [document.createTextNode("Who "), el("span", { class: "em", text: "am I?" })]),
      el("p", { class: "lede", text: "Everyone gets a daft secret identity — Hitler, a light bulb, a hung parliament. You can see everyone else's card, but not your own. Ask yes/no questions until you guess it." }),
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
    const connected = room.players.filter((p) => p.connected).length;
    const minP = lobbyMin(room);
    const canStart = connected >= minP;

    const nameIn = el("input", {
      class: "in", maxlength: "24", value: you.name || playerName(),
      onchange: (e) => send({ type: "rename", name: e.target.value.trim() }),
    });

    const hostBits = you.isHost ? [
      el("button", {
        class: "btn btn--primary btn--lg btn--block",
        text: canStart ? "Start game →" : `Need at least ${minP} players (${connected})…`,
        disabled: canStart ? null : "disabled",
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
      class: "wai-card__char" + (card.hidden ? " hidden" : ""),
      text: card.hidden ? "???  (ask the others)" : (card.character || "…"),
    });

    const actions = [];
    if (!isYou && !card.claimed) {
      actions.push(el("button", {
        class: "btn btn--sm" + (card.confirmedByYou ? " btn--got" : " btn--ghost"),
        text: card.confirmedByYou ? "✓ Confirmed" : "They got it!",
        onclick: () => send({ type: "confirmGuess", playerId: card.id }),
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
      if (you.isHost) {
        bits.push(el("button", {
          class: "btn btn--primary btn--block", text: "Next round →",
          onclick: () => send({ type: "newRound" }),
        }));
      }
    } else if (you.isHost) {
      bits.push(el("button", {
        class: "btn btn--ghost btn--block", text: "Back to lobby",
        onclick: () => send({ type: "reset" }),
      }));
    }

    return el("div", { class: "panel" }, bits);
  }

  function render() {
    app.replaceChildren();
    if (!state.room) {
      app.append(homeScreen());
      return;
    }
    const status = state.room.game && state.room.game.status;
    if (status === "playing") app.append(gameScreen());
    else app.append(lobbyScreen());
  }

  function boot() {
    parseRoute();
    if (routeCode !== lastRouteCode) {
      lastRouteCode = routeCode;
      if (routeCode) connect(routeCode);
      else {
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
