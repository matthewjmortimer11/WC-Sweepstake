/* ===========================================================================
   STORE — leagues, participant identity, accounts & persistence.

   A LEAGUE is the unit of isolation: entrants, chat, results and prediction
   answers all belong to one league. World Cup fixtures are global. No accounts
   have passwords; the league has one. Each participant gets a unique id,
   persisted on the device, and carries its leagueCode so the device can hold
   entries in several leagues without mixing them.

   Source of truth:
     • LIVE (window.WC_LIVE) → /api/leagues/{code}/… endpoints (Postgres)
     • MOCK (static / no backend) → localStorage, single implicit league

   Components read the synchronous cache (Store.allSync / getSync), scoped to the
   ACTIVE league, and subscribe for re-renders.
   =========================================================================== */
(function () {
  var WC = window.WC;
  var LIVE = !!window.WC_LIVE;
  var K = {
    mine: 'wheesht_mine_v2', device: 'wheesht_device_v2', active: 'wheesht_active_v2',
    admin: 'wheesht_admin_v1', removed: 'wheesht_removed_v1',
    league: 'wheesht_league_v1', leagues: 'wheesht_leagues_v1',
    adminTokens: 'wheesht_admin_tokens_v1',
    profiles: 'wheesht_profiles_v1',
    acctTokens: 'wheesht_acct_tokens_v1',
  };

  var CHARITY_SPLIT = 0.5;

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ssGet(k, d) { try { var v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function initials(n) { var c = (n || '').trim().replace(/Wee |Big /g, ''); var p = c.split(/\s+/); var i = p[0] ? p[0][0] : '?'; if (p[1] && /[a-z]/i.test(p[1][0])) i += p[1][0]; return (i || '?').toUpperCase(); }
  var COLORS = ['#E8272A', '#1a7a44', '#0a3b8c', '#7A3FB0', '#E07A1A', '#0d8a8a', '#C0246B', '#3a6ea5'];

  // ---- active league ------------------------------------------------------
  function activeLeague() { return lsGet(K.league, null); }
  function leagueCode() { var L = activeLeague(); return L ? L.code : null; }
  function knownLeagues() { return lsGet(K.leagues, {}); }
  function rememberLeague(L) {
    if (!L || !L.code) return;
    var all = knownLeagues(); all[L.code] = L; lsSet(K.leagues, all);
  }
  function setActiveLeague(L) { lsSet(K.league, L); rememberLeague(L); }
  // Build a league-scoped API path. In MOCK mode there is no server, so callers
  // guard on LIVE before fetching.
  function api(path) { var c = leagueCode(); return '/api/leagues/' + encodeURIComponent(c || '') + path; }
  function parseJson(r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) { var e = new Error(j.detail || 'Request failed'); e.status = r.status; throw e; }
      return j;
    });
  }
  function toastError(e, fallback) {
    if (window.wcToast) window.wcToast((e && e.message) || fallback || 'Could not save. Try again.', 'crying');
  }
  // A write was rejected: if the account is password-protected and our token is
  // missing/expired (403), drop it so the next attempt re-prompts for sign-in.
  function onWriteErr(id, e, fallback) {
    if (e && e.status === 403) clearAcctToken(id);
    toastError(e, fallback);
  }
  function adminToken(code) {
    var tokens = ssGet(K.adminTokens, {});
    return tokens[code || leagueCode()] || '';
  }
  function setAdminToken(code, token) {
    if (!code || !token) return;
    var tokens = ssGet(K.adminTokens, {});
    tokens[code] = token;
    ssSet(K.adminTokens, tokens);
  }
  function adminHeaders(extra) {
    var h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    var token = adminToken();
    if (token) h['X-Wheesht-Admin-Token'] = token;
    return h;
  }
  // Per-account sign-in tokens. Persisted (not session) so a device stays signed
  // in across browser restarts for the token's lifetime; keyed by participant id.
  function acctTokens() { return lsGet(K.acctTokens, {}); }
  function acctToken(id) { var t = acctTokens(); return (id && t[id]) || ''; }
  function setAcctToken(id, token) { if (!id || !token) return; var t = acctTokens(); t[id] = token; lsSet(K.acctTokens, t); }
  function clearAcctToken(id) { var t = acctTokens(); if (t[id]) { delete t[id]; lsSet(K.acctTokens, t); } }
  // Headers for a write to a (possibly protected) account: account token if we
  // hold one, plus the organiser token when present (covers admin overrides).
  function acctHeaders(id, extra) {
    var h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    var at = acctToken(id);
    if (at) h['X-Wheesht-Account-Token'] = at;
    var admin = adminToken();
    if (admin) h['X-Wheesht-Admin-Token'] = admin;
    return h;
  }

  // ---- admin overrides ----------------------------------------------------
  // In LIVE mode the SERVER resolves overrides into the league state, so the
  // client never applies them locally — it just hydrates the raw blob from the
  // refresh payload to build the next edit. In MOCK mode applyAdmin() mutates WC
  // in place (the static preview's only path).
  var admin = LIVE ? { teams: {}, fixtures: {}, predictions: {}, meta: {} }
                   : lsGet(K.admin, { teams: {}, fixtures: {}, predictions: {}, meta: {} });

  var BASE = {
    teams: {}, preds: {},
    fee: WC.FEE || 0,
    meta: {
      phase: WC.meta.phase, stageLabel: WC.meta.stageLabel,
      includeDepartment: WC.meta.includeDepartment !== false,
      includeLocation: WC.meta.includeLocation !== false,
      includeLtMember: WC.meta.includeLtMember !== false,
      charitySplit: WC.meta.charitySplit != null ? Number(WC.meta.charitySplit) : CHARITY_SPLIT,
      purpose: WC.meta.purpose || 'work',
      locations: WC.meta.locations || ['Edinburgh', 'London'],
      locationsFreeText: !!WC.meta.locationsFreeText,
      predDeadline: WC.meta.predDeadline || null,
      hiddenPredictions: WC.meta.hiddenPredictions || [],
    },
  };
  WC.TEAM_LIST.forEach(function (t) { BASE.teams[t.code] = { alive: t.alive, stage: t.stage, rounds: t.rounds }; });
  (WC.PREDICTIONS || []).forEach(function (m) { BASE.preds[m.key] = m.answer; });

  function applyAdmin() {
    WC.TEAM_LIST.forEach(function (t) {
      var b = BASE.teams[t.code]; if (b) { t.alive = b.alive; t.stage = b.stage; t.rounds = b.rounds; }
      var o = admin.teams && admin.teams[t.code];
      if (o) { t.alive = o.alive; t.stage = o.stage; if (o.rounds != null) t.rounds = o.rounds; }
    });
    // FIX: only patch fixtures that have an explicit override; never reset the
    // others back to upcoming/null (that wiped the provider/server baseline).
    (WC.FIXTURES || []).forEach(function (f) {
      var o = admin.fixtures && admin.fixtures[f.id];
      if (o) {
        if (o.score !== undefined) f.score = o.score;
        if (o.status !== undefined) f.status = o.status;
        if (o.winner !== undefined) f.winner = o.winner;
      }
    });
    (WC.PREDICTIONS || []).forEach(function (m) {
      m.answer = BASE.preds[m.key];
      if (admin.predictions && admin.predictions.hasOwnProperty(m.key)) m.answer = admin.predictions[m.key];
    });
    WC.meta.phase = (admin.meta && admin.meta.phase) || BASE.meta.phase;
    WC.meta.stageLabel = WC.meta.phase === 'pre' ? 'Group Stage'
      : WC.meta.phase === 'done' ? 'Tournament over' : 'In play';
    WC.meta.teamsLeft = WC.TEAM_LIST.filter(function (t) { return t.alive; }).length;
    WC.meta.includeDepartment = !admin.meta || admin.meta.includeDepartment !== false;
    WC.meta.includeLocation = !admin.meta || admin.meta.includeLocation !== false;
    WC.meta.includeLtMember = !admin.meta || admin.meta.includeLtMember !== false;
    WC.meta.purpose = (admin.meta && admin.meta.purpose) || BASE.meta.purpose;
    WC.meta.locations = (admin.meta && Array.isArray(admin.meta.locations) && admin.meta.locations.length) ? admin.meta.locations : BASE.meta.locations;
    WC.meta.locationsFreeText = admin.meta && admin.meta.locationsFreeText != null ? !!admin.meta.locationsFreeText : BASE.meta.locationsFreeText;
    WC.meta.predDeadline = (admin.meta && admin.meta.predDeadline) || BASE.meta.predDeadline || null;
    WC.meta.hiddenPredictions = (admin.meta && Array.isArray(admin.meta.hiddenPredictions)) ? admin.meta.hiddenPredictions : BASE.meta.hiddenPredictions;
    WC.charitySplit = (admin.meta && admin.meta.charitySplit != null) ? Number(admin.meta.charitySplit) : BASE.meta.charitySplit;
    var fee = admin.meta && admin.meta.entryFee != null ? Number(admin.meta.entryFee) : BASE.fee;
    WC.FEE = isFinite(fee) && fee >= 0 ? fee : BASE.fee;
    WC.POT = (WC.PEOPLE || []).length * WC.FEE;
  }

  function charitySplitValue() {
    if (admin.meta && admin.meta.charitySplit != null) return Number(admin.meta.charitySplit);
    var v = WC.charitySplit != null ? WC.charitySplit : WC.CHARITY_SPLIT;
    return v == null ? CHARITY_SPLIT : Number(v);
  }

  function persistAdmin(nextAdmin) {
    var payload = nextAdmin || admin;
    if (LIVE) {
      var c = leagueCode();
      if (!c) return Promise.reject(new Error('Join a league before changing organiser settings'));
      return fetch(api('/admin'), { method: 'PUT', headers: adminHeaders(), body: JSON.stringify(payload) })
        .then(parseJson);
    }
    lsSet(K.admin, payload);
    return Promise.resolve({ ok: true });
  }
  // After any admin edit: LIVE → push + re-pull resolved state; MOCK → apply locally.
  function commitAdmin() {
    var nextAdmin = JSON.parse(JSON.stringify(admin));
    if (LIVE) {
      return persistAdmin(nextAdmin)
        .then(function () { return Store.refresh(); })
        .catch(function (e) {
          toastError(e, 'Could not save organiser settings');
        });
    }
    applyAdmin(); persistAdmin(nextAdmin); rebuild(); emit();
    return Promise.resolve();
  }

  if (!LIVE) applyAdmin();

  // ---- cache (active-league participants) ---------------------------------
  var mine = lsGet(K.mine, []);
  var cache = [];
  function liveStatus(p) {
    var t = WC.TEAMS[p.team];
    if (!t) return p;
    if (p.alive === t.alive && p.stage === t.stage) return p;
    return Object.assign({}, p, { alive: t.alive, stage: t.stage });
  }
  // ---- profiles (display name, favourite team, avatar) --------------------
  // Device-local cache keyed by participant id. In MOCK mode it is the only
  // source; in LIVE mode it overlays the server fields so an upload/edit shows
  // instantly (the avatarDataUrl gives an immediate preview before the byte
  // round-trip). Server values still flow in via the people payload.
  function localProfiles() { return lsGet(K.profiles, {}); }
  function localProfile(id) { var all = localProfiles(); return (id && all[id]) || null; }
  function setLocalProfile(id, patch) {
    if (!id) return;
    var all = localProfiles();
    all[id] = Object.assign({}, all[id] || {}, patch);
    lsSet(K.profiles, all);
  }

  function overlayProfile(p) {
    var lp = localProfile(p.id);
    if (!lp) return p;
    var out = Object.assign({}, p);
    if (lp.displayName != null) out.displayName = lp.displayName;
    if (lp.favouriteTeam != null) out.favouriteTeam = lp.favouriteTeam;
    if (lp.avatarDataUrl) out._avatarDataUrl = lp.avatarDataUrl;
    if (lp.avatarVersion != null) out.avatarVersion = Math.max(lp.avatarVersion, p.avatarVersion || 0);
    // In MOCK/preview there is no server flag, so a locally-set lock drives the UI.
    if (lp.hasPassword != null && !LIVE) out.hasPassword = lp.hasPassword;
    if (lp.hasGoogleLink != null) out.hasGoogleLink = lp.hasGoogleLink;
    return out;
  }

  // ---- Google Identity Services ------------------------------------------
  // A single credential callback, replaced before each GIS interaction so
  // different UI flows (link vs cross-device login) each get their own handler.
  var _googleCb = null;
  var _googleInitDone = false;

  function _googleGISCallback(response) {
    var cb = _googleCb; _googleCb = null;
    if (cb && response && response.credential) cb(response.credential);
  }

  function _initGoogleOnce() {
    if (_googleInitDone) return true;
    if (!window.google || !window.google.accounts || !window.WC_GOOGLE_CLIENT_ID) return false;
    window.google.accounts.id.initialize({
      client_id: window.WC_GOOGLE_CLIENT_ID,
      callback: _googleGISCallback,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    _googleInitDone = true;
    return true;
  }

  function rebuild() {
    var code = leagueCode();
    var seen = {};
    var removed = lsGet(K.removed, []);
    cache = [];
    // device-created entries: only those for the active league (or untagged)
    mine.forEach(function (p) {
      if (seen[p.id] || removed.indexOf(p.id) >= 0) return;
      if (code && p.leagueCode && p.leagueCode !== code) return;
      seen[p.id] = 1; cache.push(overlayProfile(liveStatus(p)));
    });
    // server/seed people are already league-scoped by the backend
    (WC.PEOPLE || []).forEach(function (p) {
      if (seen[p.id] || removed.indexOf(p.id) >= 0) return;
      seen[p.id] = 1; cache.push(overlayProfile(liveStatus(p)));
    });
  }
  rebuild();

  // ---- subscribers --------------------------------------------------------
  var subs = [];
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }

  // ---- draw (unique within the active league until all teams taken) -------
  function drawTeam(force) {
    if (force && WC.TEAMS[force]) return force;
    var maxTeams = (WC.meta && WC.meta.maxTeams) || WC.TEAM_LIST.length;
    var taken = {};
    cache.forEach(function (p) { if (p.team) taken[p.team] = (taken[p.team] || 0) + 1; });
    var distinct = Object.keys(taken).length;
    var pool;
    if (distinct < maxTeams) {
      pool = WC.TEAM_LIST.filter(function (t) { return !taken[t.code]; }).map(function (t) { return t.code; });
      if (!pool.length) pool = WC.TEAM_LIST.map(function (t) { return t.code; });
    } else {
      var min = Infinity;
      WC.TEAM_LIST.forEach(function (t) { var n = taken[t.code] || 0; if (n < min) min = n; });
      pool = WC.TEAM_LIST.filter(function (t) { return (taken[t.code] || 0) === min; }).map(function (t) { return t.code; });
    }
    return pool[(Math.random() * pool.length) | 0];
  }

  // ---- scoring ------------------------------------------------------------
  function predScoreOf(p) {
    if (!p) return 0;
    if (p.picks) {
      var s = 0;
      (WC.PREDICTIONS || []).forEach(function (m) {
        if (m.answer == null) return;
        var pick = p.picks[m.key];
        if (pick == null) return;
        if (m.kind === 'team2') { if (Array.isArray(pick) && Array.isArray(m.answer) && pick.length === m.answer.length && pick.slice().sort().join() === m.answer.slice().sort().join()) s += m.points; }
        else if (m.kind === 'number') { if (Number(pick) === Number(m.answer)) s += m.points; }
        else if (pick === m.answer) s += m.points;
      });
      return s;
    }
    return p.predScore || 0;
  }
  function visiblePredictions() {
    var hidden = (WC.meta && Array.isArray(WC.meta.hiddenPredictions)) ? WC.meta.hiddenPredictions : [];
    return (WC.PREDICTIONS || []).filter(function (m) { return hidden.indexOf(m.key) < 0; });
  }
  function pickComplete(m, picks) {
    if (!m || !picks) return false;
    var v = picks[m.key];
    if (v == null) return false;
    if (m.kind === 'team2') return Array.isArray(v) && v.length === 2;
    if (m.kind === 'number') return v !== '' && isFinite(Number(v));
    if (m.kind === 'scoreline') { return typeof v === 'string' && /^\d+-\d+$/.test(v); }
    return true;
  }
  function madeVisiblePredictions(p) {
    var picks = (p && p.picks) || {};
    return visiblePredictions().filter(function (m) { return pickComplete(m, picks); }).length;
  }

  function withScores(list) {
    return list.map(function (p) { return Object.assign({}, p, { predScore: predScoreOf(p) }); });
  }
  function rankedByPred() {
    var rows = withScores(cache).sort(function (a, b) { return b.predScore - a.predScore; });
    rows.forEach(function (r, i) { r.predRank = i + 1; });
    return rows;
  }

  function postWheeshtChat(text, mood) {
    if (!LIVE) return;
    var c = leagueCode();
    if (!c) return;
    fetch(api('/chat/system'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ text: text, mood: mood || 'confident' }),
    }).then(parseJson).catch(function () {});
  }

  var Store = {
    live: LIVE,
    PREDICTIONS: WC.PREDICTIONS || [],

    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },

    // ===== LEAGUES =====
    activeLeague: activeLeague,
    leagueCode: leagueCode,
    api: api,
    adminHeaders: adminHeaders,
    hasAdminToken: function () { return !!adminToken(); },
    setAdminToken: setAdminToken,
    verifyAdminCode: function (code) {
      if (!LIVE) return Promise.resolve({ ok: true });
      var c = leagueCode();
      if (!c) return Promise.reject(new Error('Join a league first'));
      return fetch(api('/admin/auth'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code || '' }),
      }).then(parseJson).then(function (j) {
        if (j && j.token) setAdminToken(c, j.token);
        return j;
      });
    },
    knownLeagues: function () { return knownLeagues(); },
    // Create a league on the backend, then make it active.
    createLeague: function (name, code, password) {
      var body = { name: name, code: code, password: password };
      if (!LIVE) {
        var L = { id: 'mock-' + code, code: (code || '').toUpperCase(), name: name || 'Sweepstake', seeded: false };
        setActiveLeague(L); rebuild(); emit();
        return Promise.resolve({ league: L });
      }
      return fetch('/api/leagues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.detail || 'Could not create league'); return j; }); })
        .then(function (j) { setActiveLeague(j.league); rebuild(); emit(); return j; });
    },
    // Validate code+password; on success make the league active. Resolves with
    // the league (incl. seeded flag so onboarding picks roster vs draw).
    joinLeague: function (code, password) {
      if (!LIVE) {
        var def = (WC.league || { code: 'OI', name: 'The Office Sweepstake', seeded: true });
        if ((code || '').toUpperCase() !== def.code) return Promise.reject(new Error('No league with that code'));
        setActiveLeague(def); rebuild(); emit();
        return Promise.resolve({ league: def });
      }
      return fetch('/api/leagues/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code, password: password }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.detail || 'Could not join'); return j; }); })
        .then(function (j) { setActiveLeague(j.league); return Store.refresh().then(function () { return j; }); });
    },
    // Jump back into the league a device account belongs to, then activate it.
    resumeAccount: function (id) {
      var acc = null;
      mine.forEach(function (p) { if (p.id === id) acc = p; });
      var leagues = knownLeagues();
      var L = acc && acc.leagueCode ? leagues[acc.leagueCode] : null;
      if (L) setActiveLeague(L);
      lsSet(K.active, id);
      rebuild(); emit();
      return Store.refresh();
    },

    // device accounts (active league only)
    deviceIds: function () { return lsGet(K.device, []); },
    deviceAccounts: function () {
      var code = leagueCode();
      return this.deviceIds().map(function (id) { return Store.getSync(id); })
        .filter(function (p) { return p && (!code || !p.leagueCode || p.leagueCode === code); });
    },
    // ALL device accounts across every league (for the resume gate).
    allDeviceAccounts: function () {
      return this.deviceIds().map(function (id) {
        var found = null; mine.forEach(function (p) { if (p.id === id) found = p; });
        return found;
      }).filter(Boolean);
    },
    activeId: function () { return lsGet(K.active, null); },
    active: function () { var id = this.activeId(); return id ? this.getSync(id) : null; },
    setActive: function (id) { lsSet(K.active, id); emit(); },
    signOutDevice: function (id) {
      var d = this.deviceIds().filter(function (x) { return x !== id; });
      lsSet(K.device, d);
      if (this.activeId() === id) lsSet(K.active, d[0] || null);
      emit();
    },

    removeParticipant: function (id) {
      function localRemove() {
        mine = mine.filter(function (p) { return p.id !== id; });
        lsSet(K.mine, mine);
        var rem = lsGet(K.removed, []); if (rem.indexOf(id) < 0) { rem.push(id); lsSet(K.removed, rem); }
        var d = Store.deviceIds().filter(function (x) { return x !== id; }); lsSet(K.device, d);
        if (Store.activeId() === id) lsSet(K.active, d[0] || null);
        rebuild(); emit();
      }
      if (LIVE && leagueCode()) {
        return fetch(api('/participants/' + id), { method: 'DELETE', headers: adminHeaders({}) })
          .then(parseJson)
          .then(function () { localRemove(); return { ok: true }; })
          .catch(function (e) { toastError(e, 'Could not remove entrant'); return Store.refresh(); });
      }
      localRemove();
      return Promise.resolve({ ok: true });
    },

    // reads (sync, active-league scoped)
    allSync: function () { return cache.slice(); },
    getSync: function (id) { for (var i = 0; i < cache.length; i++) if (cache[i].id === id) return cache[i]; return null; },
    rankedByPred: rankedByPred,
    predScoreOf: predScoreOf,
    visiblePredictions: visiblePredictions,
    madeVisiblePredictions: madeVisiblePredictions,
    maxPredPoints: function () { return visiblePredictions().reduce(function (a, m) { return a + m.points; }, 0); },
    predictionsLocked: function () {
      var deadline = WC.meta && WC.meta.predDeadline;
      var deadlinePassed = !!(deadline && new Date() > new Date(deadline));
      return !!(WC.meta && WC.meta.predictionsLocked) || deadlinePassed;
    },

    gross: function () { return cache.length * (WC.FEE || 0); },
    charity: function () { return cache.length * (WC.FEE || 0) * charitySplitValue(); },
    pot: function () { return cache.length * (WC.FEE || 0) * (1 - charitySplitValue()); },
    charitySplit: charitySplitValue,

    search: function (q) {
      q = (q || '').trim().toLowerCase();
      if (!q) return [];
      return cache.filter(function (p) { return (p.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
    },

    create: function (profile, opts) {
      opts = opts || {};
      var team = drawTeam(opts.forceTeam);
      var t = WC.TEAMS[team];
      var name = (profile.name || '').trim() || 'Anonymous';
      var p = {
        id: uid(), name: name, initials: initials(name),
        department: profile.department || '', location: profile.location || 'London',
        city: profile.location || 'London', ltMember: !!profile.ltMember, leadership: !!profile.ltMember,
        gender: '—', team: team, color: COLORS[(Math.random() * COLORS.length) | 0],
        stage: t.stage, alive: t.alive, isYou: false, isDemo: false,
        leagueCode: leagueCode(), isOrganiser: !!opts.organiser,
        picks: {}, predScore: 0, joinedAt: Date.now()
      };
      mine = mine.concat([p]); lsSet(K.mine, mine); rebuild();
      var d = this.deviceIds(); if (d.indexOf(p.id) < 0) d.push(p.id); lsSet(K.device, d);
      lsSet(K.active, p.id);
      if (LIVE && leagueCode()) {
        try {
          fetch(api('/participants'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
            .then(parseJson)
            .catch(function (e) {
              // Server rejected a duplicate-name signup — undo the local entry so
              // the device isn't left with a ghost account, then resync.
              if (e && e.status === 409) {
                mine = mine.filter(function (m) { return m.id !== p.id; });
                lsSet(K.mine, mine);
                lsSet(K.device, Store.deviceIds().filter(function (x) { return x !== p.id; }));
                if (lsGet(K.active, null) === p.id) lsSet(K.active, null);
                Store.refresh().then(function () { rebuild(); emit(); });
              }
              toastError(e, 'Could not save entrant');
            });
        } catch (e) { toastError(e, 'Could not save entrant'); }
      }
      emit();
      return p;
    },

    update: function (id, patch) {
      var idx = -1; mine.forEach(function (p, i) { if (p.id === id) idx = i; });
      if (idx < 0) return null;
      mine[idx] = Object.assign({}, mine[idx], patch);
      if (patch.name) mine[idx].initials = initials(patch.name);
      lsSet(K.mine, mine); rebuild();
      if (LIVE && leagueCode()) {
        try {
          fetch(api('/participants/' + id), { method: 'PUT', headers: acctHeaders(id), body: JSON.stringify(mine[idx]) })
            .then(parseJson)
            .catch(function (e) { onWriteErr(id, e, 'Could not save profile'); Store.refresh(); });
        } catch (e) { onWriteErr(id, e, 'Could not save profile'); }
      }
      emit();
      return mine[idx];
    },

    setPick: function (id, key, value) {
      var p = this.getSync(id); if (!p) return;
      var picks = Object.assign({}, p.picks || {}); picks[key] = value;
      // keep a local copy if this is a device-held entry
      var inMine = mine.some(function (m) { return m.id === id; });
      if (inMine) { this.update(id, { picks: picks }); }
      else if (LIVE && leagueCode()) {
        // seeded roster entry not yet in `mine` — persist the pick directly
        try {
          fetch(api('/participants/' + id + '/picks'), { method: 'PUT', headers: acctHeaders(id), body: JSON.stringify({ key: key, value: value }) })
            .then(parseJson)
            .catch(function (e) { onWriteErr(id, e, 'Could not save pick'); Store.refresh(); });
        } catch (e) { onWriteErr(id, e, 'Could not save pick'); }
        emit();
      }
      return picks;
    },

    claimOI: function (id) {
      var d = this.deviceIds();
      if (d.indexOf(id) < 0) { d.push(id); lsSet(K.device, d); }
      lsSet(K.active, id);
      var alreadyMine = mine.some(function (p) { return p.id === id; });
      if (!alreadyMine) {
        var person = this.getSync(id);
        if (person) { person = Object.assign({}, person, { leagueCode: leagueCode() }); mine = mine.concat([person]); lsSet(K.mine, mine); }
      }
      emit();
    },

    // ===== PROFILES (identity layer: display name · favourite team · avatar) =====
    // The shown name everywhere user-facing — the editable display name, falling
    // back to the original full name the organiser always keeps.
    shownName: function (p) {
      if (!p) return '';
      return ((p.displayName || '').trim()) || p.name || '';
    },
    favTeam: function (p) {
      var code = p && (p.favouriteTeam || '').trim();
      return code ? (WC.TEAMS[code] || null) : null;
    },
    // URL/dataURL for a person's avatar image, or null if they have none (the
    // caller falls back to the initials badge). A fresh upload's data URL wins
    // so the change shows instantly; otherwise the versioned server endpoint.
    avatarUrl: function (p) {
      if (!p) return null;
      if (p._avatarDataUrl) return p._avatarDataUrl;
      if (LIVE && (p.avatarVersion || 0) > 0 && leagueCode()) {
        return api('/participants/' + encodeURIComponent(p.id) + '/avatar') + '?v=' + p.avatarVersion;
      }
      return null;
    },
    // Save display name / favourite team. Patch may include either field.
    saveProfile: function (id, patch) {
      patch = patch || {};
      var local = {};
      if (patch.displayName != null) local.displayName = String(patch.displayName).slice(0, 40);
      if (patch.favouriteTeam != null) local.favouriteTeam = (patch.favouriteTeam || '').toUpperCase();
      setLocalProfile(id, local);
      rebuild(); emit();
      if (LIVE && leagueCode()) {
        var body = {};
        if (patch.displayName != null) body.displayName = local.displayName;
        if (patch.favouriteTeam != null) body.favouriteTeam = local.favouriteTeam;
        return fetch(api('/participants/' + id + '/profile'), { method: 'PUT', headers: acctHeaders(id), body: JSON.stringify(body) })
          .then(parseJson).then(function (j) { return j; })
          .catch(function (e) { onWriteErr(id, e, 'Could not save profile'); });
      }
      return Promise.resolve({ ok: true });
    },
    // Store a cropped/resized data URL as the avatar. Keeps it locally for an
    // instant preview, then persists to Postgres in LIVE mode.
    uploadAvatar: function (id, dataUrl) {
      if (!id || !dataUrl) return Promise.resolve({ ok: false });
      var prev = (localProfile(id) || {}).avatarVersion || 0;
      setLocalProfile(id, { avatarDataUrl: dataUrl, avatarVersion: prev + 1 });
      rebuild(); emit();
      if (LIVE && leagueCode()) {
        return fetch(api('/participants/' + id + '/avatar'), { method: 'PUT', headers: acctHeaders(id), body: JSON.stringify({ dataUrl: dataUrl }) })
          .then(parseJson)
          .then(function (j) {
            // Adopt the server's version so the cached URL lines up on refresh.
            if (j && j.avatarVersion != null) setLocalProfile(id, { avatarVersion: j.avatarVersion });
            return j;
          })
          .catch(function (e) { onWriteErr(id, e, 'Could not save photo'); });
      }
      return Promise.resolve({ ok: true });
    },
    removeAvatar: function (id) {
      if (!id) return Promise.resolve({ ok: false });
      var all = localProfiles();
      if (all[id]) { delete all[id].avatarDataUrl; lsSet(K.profiles, all); }
      setLocalProfile(id, { avatarVersion: 0 });
      rebuild(); emit();
      if (LIVE && leagueCode()) {
        return fetch(api('/participants/' + id + '/avatar'), { method: 'DELETE', headers: acctHeaders(id) })
          .then(parseJson).catch(function (e) { onWriteErr(id, e, 'Could not remove photo'); });
      }
      return Promise.resolve({ ok: true });
    },

    // ===== ACCOUNT PASSWORDS (optional sign-in lock) =====
    // Is this entry protected by a password?
    hasPassword: function (p) { return !!(p && p.hasPassword); },
    // Do we hold a sign-in token for this account on this device?
    isSignedIn: function (id) { return !!acctToken(id); },
    // Does taking over this account need authentication we don't hold yet?
    // An entry is protected once it has been claimed — either by setting a
    // password or by linking a Google account. Picking it on a new device then
    // requires the password or a matching Google sign-in.
    needsSignIn: function (p) {
      if (!p || acctToken(p.id)) return false;
      if (p.hasPassword) return true;
      if (p.hasGoogleLink && window.WC_GOOGLE_CLIENT_ID) return true;
      return false;
    },
    // Prove a password; on success store a reusable token for this device.
    authAccount: function (id, password) {
      if (!LIVE) { setAcctToken(id, 'mock'); return Promise.resolve({ ok: true }); }
      var c = leagueCode();
      if (!c) return Promise.reject(new Error('Join a league first'));
      return fetch(api('/participants/' + id + '/auth'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password || '' }) })
        .then(parseJson).then(function (j) { if (j && j.token) setAcctToken(id, j.token); return j; });
    },
    // Set, change or clear a password. opts: {newPassword, currentPassword}.
    // newPassword '' clears the lock. Stores the fresh token on success.
    setAccountPassword: function (id, opts) {
      opts = opts || {};
      var clearing = !opts.newPassword;
      if (!LIVE) {
        setLocalProfile(id, { hasPassword: !clearing });
        if (clearing) clearAcctToken(id); else setAcctToken(id, 'mock');
        rebuild(); emit();
        return Promise.resolve({ ok: true, hasPassword: !clearing });
      }
      var c = leagueCode();
      if (!c) return Promise.reject(new Error('Join a league first'));
      return fetch(api('/participants/' + id + '/password'), {
        method: 'PUT', headers: acctHeaders(id),
        body: JSON.stringify({ newPassword: opts.newPassword || '', currentPassword: opts.currentPassword || '' }),
      }).then(parseJson).then(function (j) {
        if (j && j.token) setAcctToken(id, j.token);
        if (clearing) clearAcctToken(id);
        return Store.refresh().then(function () { return j; });
      });
    },
    signOutAccount: function (id) { clearAcctToken(id); emit(); },

    // ===== GOOGLE SIGN-IN =====
    hasGoogleLink: function(p) { return !!(p && p.hasGoogleLink); },
    // Set/clear the credential callback consumed by the GIS handler.
    setGoogleCallback: function(fn) { _googleCb = fn; },
    clearGoogleCallback: function() { _googleCb = null; },
    // Initialize GIS (idempotent). Returns false if the library isn't ready yet.
    initGoogle: _initGoogleOnce,
    // Render a Google Sign-In button into `el`. Returns false if GIS isn't loaded.
    renderGoogleButton: function(el, opts) {
      if (!el || !_initGoogleOnce()) return false;
      window.google.accounts.id.renderButton(el, Object.assign({
        size: 'large', theme: 'outline', text: 'signin_with', shape: 'rectangular',
      }, opts || {}));
      return true;
    },
    // Link or re-authenticate with Google. Stores account token on success.
    googleLink: function(id, idToken) {
      if (!LIVE || !leagueCode()) return Promise.reject(new Error('Not in a league'));
      return fetch(api('/participants/' + encodeURIComponent(id) + '/google-auth'), {
        method: 'POST', headers: acctHeaders(id),
        body: JSON.stringify({ idToken: idToken }),
      }).then(parseJson).then(function(r) {
        if (r.token) setAcctToken(id, r.token);
        if (r.avatarVersion != null) setLocalProfile(id, { avatarVersion: r.avatarVersion });
        setLocalProfile(id, { hasGoogleLink: true });
        rebuild(); emit();
        return r;
      }).catch(function(e) { onWriteErr(id, e, 'Google sign-in failed'); throw e; });
    },
    // Unlink Google from the given entry.
    googleUnlink: function(id) {
      if (!LIVE || !leagueCode()) return Promise.reject(new Error('Not in a league'));
      return fetch(api('/participants/' + encodeURIComponent(id) + '/google-auth'), {
        method: 'DELETE', headers: acctHeaders(id),
      }).then(parseJson).then(function(r) {
        setLocalProfile(id, { hasGoogleLink: false });
        rebuild(); emit();
        window.wcToast && window.wcToast('Google account unlinked.', 'neutral');
        return r;
      }).catch(function(e) { onWriteErr(id, e, 'Could not unlink Google'); throw e; });
    },
    // Cross-device login: find entry by Google identity and return {participantId, name, token}.
    googleLogin: function(idToken) {
      if (!LIVE || !leagueCode()) return Promise.reject(new Error('Not in a league'));
      return fetch(api('/google-login'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken }),
      }).then(parseJson);
    },
    // Full cross-device login: verify Google, claim the entry, store the token.
    loginWithGoogle: function(idToken) {
      var self = this;
      return this.googleLogin(idToken).then(function(r) {
        if (!r || !r.participantId) throw new Error('No entry found for this Google account');
        setAcctToken(r.participantId, r.token);
        self.claimOI(r.participantId);
        self.refresh && self.refresh();
        return r;
      });
    },

    refresh: function () {
      if (!LIVE) return Promise.resolve();
      var c = leagueCode();
      if (!c) return Promise.resolve();
      return fetch('/api/leagues/' + encodeURIComponent(c) + '/state').then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.people) {
          window.WC_DATA = d;
          if (d.adminOverrides) admin = d.adminOverrides;
          if (window.__rebuildWC) window.__rebuildWC();
          rebuild(); emit();
        }
      }).catch(function () {});
    },

    // ===== DEV CONSOLE (hidden cross-league admin) =====
    // Verify the master key server-side and list every league. Never stores the
    // key; the server never sends it back.
    devListLeagues: function (key) {
      if (!LIVE) {
        var L = activeLeague() || { code: 'OI', name: 'The Office Sweepstake', seeded: true };
        return Promise.resolve({ leagues: [Object.assign({ entrants: cache.length }, L)] });
      }
      return fetch('/api/dev/leagues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.detail || 'Developer access denied'); return j; }); });
    },
    // Make any league active (no password — dev only) and pull its state.
    // Passing null clears the active league. Used to enter and to restore.
    devEnterLeague: function (L) {
      if (L && L.code && L.adminToken) setAdminToken(L.code, L.adminToken);
      if (L && L.code) setActiveLeague({ id: L.id, code: L.code, name: L.name, seeded: !!L.seeded });
      else lsSet(K.league, null);
      return Store.refresh().then(function () { rebuild(); emit(); });
    },

    // ===== ADMIN (scoped to the active league) =====
    adminState: function () { return admin; },
    teamsAlive: function () { return WC.TEAM_LIST.filter(function (t) { return t.alive; }).length; },
    phase: function () { return WC.meta.phase; },
    entryFee: function () { return WC.FEE || 0; },
    includeDepartment: function () { return !WC.meta || WC.meta.includeDepartment !== false; },
    setPhase: function (phase) {
      admin.meta = admin.meta || {}; admin.meta.phase = phase;
      commitAdmin();
    },
    setEntryFee: function (fee) {
      var n = Math.max(0, Math.round(Number(fee) * 100) / 100);
      if (!isFinite(n)) return;
      admin.meta = admin.meta || {}; admin.meta.entryFee = n;
      commitAdmin();
    },
    setIncludeDepartment: function (on) {
      admin.meta = admin.meta || {}; admin.meta.includeDepartment = !!on;
      commitAdmin();
    },
    purpose: function () { return (admin.meta && admin.meta.purpose) || BASE.meta.purpose; },
    setPurpose: function (p) {
      admin.meta = admin.meta || {}; admin.meta.purpose = p;
      if (p === 'friends') {
        admin.meta.includeDepartment = false;
        admin.meta.includeLocation = false;
        admin.meta.includeLtMember = false;
      } else {
        admin.meta.includeDepartment = true;
        admin.meta.includeLocation = true;
        admin.meta.includeLtMember = true;
      }
      commitAdmin();
    },
    includeLocation: function () { return !admin.meta || admin.meta.includeLocation !== false; },
    setIncludeLocation: function (on) {
      admin.meta = admin.meta || {}; admin.meta.includeLocation = !!on;
      commitAdmin();
    },
    includeLtMember: function () { return !admin.meta || admin.meta.includeLtMember !== false; },
    setIncludeLtMember: function (on) {
      admin.meta = admin.meta || {}; admin.meta.includeLtMember = !!on;
      commitAdmin();
    },
    locations: function () {
      var v = admin.meta && admin.meta.locations;
      return (Array.isArray(v) && v.length) ? v : BASE.meta.locations;
    },
    setLocations: function (arr) {
      admin.meta = admin.meta || {}; admin.meta.locations = arr;
      commitAdmin();
    },
    locationsFreeText: function () {
      if (admin.meta && admin.meta.locationsFreeText != null) return !!admin.meta.locationsFreeText;
      return BASE.meta.locationsFreeText;
    },
    setLocationsFreeText: function (on) {
      admin.meta = admin.meta || {}; admin.meta.locationsFreeText = !!on;
      commitAdmin();
    },
    predDeadline: function () { return (admin.meta && admin.meta.predDeadline) || BASE.meta.predDeadline || null; },
    setPredDeadline: function (dt) {
      admin.meta = admin.meta || {};
      var chatText;
      if (dt) {
        admin.meta.predDeadline = dt;
        var dateStr = '';
        try { dateStr = new Date(dt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { dateStr = dt; }
        chatText = ['The prediction deadline has been updated. Picks lock at ' + dateStr + '. Wheesht has made a note.', 'nervous'];
      } else {
        delete admin.meta.predDeadline;
        chatText = ['The prediction deadline has been cleared. Picks are open until further notice. Wheesht is watching.', 'mischievous'];
      }
      commitAdmin();
      if (chatText) postWheeshtChat(chatText[0], chatText[1]);
    },
    hiddenPredictions: function () {
      return (admin.meta && Array.isArray(admin.meta.hiddenPredictions)) ? admin.meta.hiddenPredictions : BASE.meta.hiddenPredictions;
    },
    togglePredictionHidden: function (key) {
      admin.meta = admin.meta || {};
      var hidden = Array.isArray(admin.meta.hiddenPredictions) ? admin.meta.hiddenPredictions.slice() : [];
      var idx = hidden.indexOf(key);
      var nowHidden;
      if (idx >= 0) { hidden.splice(idx, 1); nowHidden = false; }
      else { hidden.push(key); nowHidden = true; }
      admin.meta.hiddenPredictions = hidden;
      commitAdmin();
      if (!nowHidden) {
        var mkt = (WC.PREDICTIONS || []).find(function (m) { return m.key === key; });
        var deadline = admin.meta && admin.meta.predDeadline;
        var afterDeadline = deadline && new Date() > new Date(deadline);
        var msg = 'New prediction available: "' + (mkt ? mkt.q : key) + '". Get your pick in.';
        if (afterDeadline) msg += ' The old deadline has passed, so make the call now.';
        postWheeshtChat(msg, 'mischievous');
        if (window.wcToast) window.wcToast('Prediction opened: ' + (mkt ? mkt.q : key), 'mischievous');
      }
    },
    setCharitySplit: function (split) {
      var n = Math.max(0, Math.min(1, Number(split)));
      if (!isFinite(n)) return;
      admin.meta = admin.meta || {}; admin.meta.charitySplit = n;
      commitAdmin();
    },
    setTeamOut: function (code, out) {
      admin.teams = admin.teams || {};
      if (out) admin.teams[code] = { alive: false, stage: 'out-group', rounds: 1 };
      else admin.teams[code] = { alive: true, stage: (WC.meta.phase === 'pre' ? 'group' : 'r16'), rounds: (WC.meta.phase === 'pre' ? 0 : 3) };
      if (out && WC.meta.phase === 'pre') { admin.meta = admin.meta || {}; admin.meta.phase = 'live'; }
      commitAdmin();
    },
    setFixtureResult: function (id, a, b) {
      admin.fixtures = admin.fixtures || {};
      admin.fixtures[id] = { score: [a, b], status: 'done' };
      if (WC.meta.phase === 'pre') { admin.meta = admin.meta || {}; admin.meta.phase = 'live'; }
      commitAdmin();
    },
    setFixtureLive: function (id, on) {
      admin.fixtures = admin.fixtures || {};
      if (on) { admin.fixtures[id] = { score: (admin.fixtures[id] && admin.fixtures[id].score) || [0, 0], status: 'live' }; }
      else { delete admin.fixtures[id]; }
      commitAdmin();
    },
    clearFixture: function (id) {
      if (admin.fixtures) delete admin.fixtures[id];
      commitAdmin();
    },
    setPredictionAnswer: function (key, answer) {
      admin.predictions = admin.predictions || {};
      if (answer == null) delete admin.predictions[key]; else admin.predictions[key] = answer;
      commitAdmin();
    },
    adminReset: function () {
      var keep = admin.meta || {};
      admin = { teams: {}, fixtures: {}, predictions: {}, meta: {
        entryFee: keep.entryFee,
        includeDepartment: keep.includeDepartment,
        includeLocation: keep.includeLocation,
        includeLtMember: keep.includeLtMember,
        charitySplit: keep.charitySplit,
        purpose: keep.purpose,
        locations: keep.locations,
        locationsFreeText: keep.locationsFreeText,
        predDeadline: keep.predDeadline,
        hiddenPredictions: keep.hiddenPredictions,
      }};
      commitAdmin();
    }
  };

  window.Store = Store;
})();
