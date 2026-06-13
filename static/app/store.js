/* ===========================================================================
   STORE — participant identity, accounts & persistence.
   No passwords, no sessions. Each participant gets a unique id, persisted
   on the device. Multiple people can sign up on one device (account picker),
   and "Find My Entry" recovers an account by name.

   Source of truth:
     • LIVE  (window.WC_LIVE, server present) → /api/participants endpoints
     • MOCK  (static / no backend)            → localStorage

   Components read the synchronous cache (Store.allSync / getSync) and
   subscribe for re-renders. Call Store.refresh() on mount for live sync.
   =========================================================================== */
(function () {
  var WC = window.WC;
  var LIVE = !!window.WC_LIVE;
  var K = { mine: 'wheesht_mine_v2', device: 'wheesht_device_v2', active: 'wheesht_active_v2', admin: 'wheesht_admin_v1', removed: 'wheesht_removed_v1' };

  // Charity split — half of every £5 buy-in goes to charity; the rest is the
  // prize pot for the single winner (whoever holds the champion).
  var CHARITY_SPLIT = 0.5;

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function initials(n) { var c = (n || '').trim().replace(/Wee |Big /g, ''); var p = c.split(/\s+/); var i = p[0] ? p[0][0] : '?'; if (p[1] && /[a-z]/i.test(p[1][0])) i += p[1][0]; return (i || '?').toUpperCase(); }
  var COLORS = ['#E8272A', '#1a7a44', '#0a3b8c', '#7A3FB0', '#E07A1A', '#0d8a8a', '#C0246B', '#3a6ea5'];

  // ---- admin overrides (results / eliminations / prediction answers) ------
  // Persisted locally; in LIVE mode also pushed to the backend so every device
  // picks them up via refresh(). Applied onto window.WC in place so all
  // components that hold WC references see the update.
  var admin = lsGet(K.admin, { teams: {}, fixtures: {}, predictions: {}, meta: {} });
  // Snapshot pristine values BEFORE any override is applied, so clearing an
  // override reverts cleanly instead of leaving a stale in-place mutation.
  var BASE = {
    teams: {}, preds: {},
    meta: { phase: WC.meta.phase, stageLabel: WC.meta.stageLabel }
  };
  WC.TEAM_LIST.forEach(function (t) { BASE.teams[t.code] = { alive: t.alive, stage: t.stage, rounds: t.rounds }; });
  (WC.PREDICTIONS || []).forEach(function (m) { BASE.preds[m.key] = m.answer; });
  function applyAdmin() {
    // teams — reset to baseline, then apply eliminations
    WC.TEAM_LIST.forEach(function (t) {
      var b = BASE.teams[t.code]; if (b) { t.alive = b.alive; t.stage = b.stage; t.rounds = b.rounds; }
      var o = admin.teams && admin.teams[t.code];
      if (o) { t.alive = o.alive; t.stage = o.stage; if (o.rounds != null) t.rounds = o.rounds; }
    });
    // fixtures (results)
    (WC.FIXTURES || []).forEach(function (f) {
      var o = admin.fixtures && admin.fixtures[f.id];
      if (o) { f.score = o.score; f.status = o.status; } else { f.score = null; f.status = 'upcoming'; }
    });
    // prediction answers — reset to baseline, then apply
    (WC.PREDICTIONS || []).forEach(function (m) {
      m.answer = BASE.preds[m.key];
      if (admin.predictions && admin.predictions.hasOwnProperty(m.key)) m.answer = admin.predictions[m.key];
    });
    // meta phase — reset to baseline, then apply
    WC.meta.phase = (admin.meta && admin.meta.phase) || BASE.meta.phase;
    WC.meta.stageLabel = WC.meta.phase === 'pre' ? 'Group Stage'
      : WC.meta.phase === 'done' ? 'Tournament over' : 'In play';
    WC.meta.teamsLeft = WC.TEAM_LIST.filter(function (t) { return t.alive; }).length;
  }
  function persistAdmin() {
    lsSet(K.admin, admin);
    if (LIVE) { try { fetch('/api/admin', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(admin) }); } catch (e) {} }
  }
  applyAdmin();

  // ---- cache (demo field + this-device participants) ----------------------
  var mine = lsGet(K.mine, []);       // full participant objects created here
  var cache = [];
  function liveStatus(p) {
    // A person's alive/stage always reflects their team's CURRENT status, not a
    // snapshot taken at sign-up — so the app tracks live as results come in.
    var t = WC.TEAMS[p.team];
    if (!t) return p;
    if (p.alive === t.alive && p.stage === t.stage) return p;
    return Object.assign({}, p, { alive: t.alive, stage: t.stage });
  }
  function rebuild() {
    var seen = {};
    var removed = lsGet(K.removed, []);
    cache = [];
    mine.forEach(function (p) { if (!seen[p.id] && removed.indexOf(p.id) < 0) { seen[p.id] = 1; cache.push(liveStatus(p)); } });
    (WC.PEOPLE || []).forEach(function (p) { if (!seen[p.id] && removed.indexOf(p.id) < 0) { seen[p.id] = 1; cache.push(liveStatus(p)); } });
  }
  rebuild();

  // ---- subscribers --------------------------------------------------------
  var subs = [];
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }

  // ---- draw ---------------------------------------------------------------
  // Each entrant gets a UNIQUE country until all are taken (maxTeams, ~48);
  // after that, countries can be shared. Returns a team code.
  function drawTeam(force) {
    if (force && WC.TEAMS[force]) return force;
    var maxTeams = (WC.meta && WC.meta.maxTeams) || WC.TEAM_LIST.length;
    var taken = {};
    cache.forEach(function (p) { if (p.team) taken[p.team] = (taken[p.team] || 0) + 1; });
    var distinct = Object.keys(taken).length;
    var pool;
    if (distinct < maxTeams) {
      // uniqueness phase — only hand out countries nobody holds yet
      pool = WC.TEAM_LIST.filter(function (t) { return !taken[t.code]; }).map(function (t) { return t.code; });
      if (!pool.length) pool = WC.TEAM_LIST.map(function (t) { return t.code; });
    } else {
      // sharing phase — everything's taken, double-ups allowed (fewest-held first)
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
        if (m.answer == null) return;            // unresolved
        var pick = p.picks[m.key];
        if (pick == null) return;
        if (m.kind === 'team2') { if (Array.isArray(pick) && Array.isArray(m.answer) && pick.slice().sort().join() === m.answer.slice().sort().join()) s += m.points; }
        else if (pick === m.answer) s += m.points;
      });
      return s;
    }
    return p.predScore || 0;
  }

  // ---- ranking helpers ----------------------------------------------------
  function withScores(list) {
    return list.map(function (p) { return Object.assign({}, p, { predScore: predScoreOf(p) }); });
  }
  function rankedByPred() {
    var rows = withScores(cache).sort(function (a, b) { return b.predScore - a.predScore; });
    rows.forEach(function (r, i) { r.predRank = i + 1; });
    return rows;
  }

  var Store = {
    live: LIVE,
    PREDICTIONS: WC.PREDICTIONS || [],

    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },

    // device accounts
    deviceIds: function () { return lsGet(K.device, []); },
    deviceAccounts: function () {
      return this.deviceIds().map(function (id) { return Store.getSync(id); }).filter(Boolean);
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

    // remove a participant entirely (organiser action). Works for anyone:
    // device-created entries are deleted outright; server/demo entries are
    // tombstoned so they stay gone after a rebuild.
    removeParticipant: function (id) {
      mine = mine.filter(function (p) { return p.id !== id; });
      lsSet(K.mine, mine);
      var rem = lsGet(K.removed, []); if (rem.indexOf(id) < 0) { rem.push(id); lsSet(K.removed, rem); }
      var d = this.deviceIds().filter(function (x) { return x !== id; }); lsSet(K.device, d);
      if (this.activeId() === id) lsSet(K.active, d[0] || null);
      if (LIVE) { try { fetch('/api/participants/' + id, { method: 'DELETE' }); } catch (e) {} }
      rebuild(); emit();
    },

    // reads (sync from cache)
    allSync: function () { return cache.slice(); },
    getSync: function (id) { for (var i = 0; i < cache.length; i++) if (cache[i].id === id) return cache[i]; return null; },
    rankedByPred: rankedByPred,
    predScoreOf: predScoreOf,
    maxPredPoints: function () { return (WC.PREDICTIONS || []).reduce(function (a, m) { return a + m.points; }, 0); },

    // money — gross take grows with every entrant; half to charity, the rest is
  // the single prize pot (winner takes all).
    gross: function () { return cache.length * (WC.FEE || 0); },
    charity: function () { return cache.length * (WC.FEE || 0) * CHARITY_SPLIT; },
    pot: function () { return cache.length * (WC.FEE || 0) * (1 - CHARITY_SPLIT); },
    charitySplit: function () { return CHARITY_SPLIT; },

    // search (Find My Entry)
    search: function (q) {
      q = (q || '').trim().toLowerCase();
      if (!q) return [];
      return cache.filter(function (p) { return (p.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
    },

    // create (onboarding) → assigns id + team, persists, makes active
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
        picks: {}, predScore: 0, joinedAt: Date.now()
      };
      mine = mine.concat([p]); lsSet(K.mine, mine); rebuild();
      var d = this.deviceIds(); if (d.indexOf(p.id) < 0) d.push(p.id); lsSet(K.device, d);
      lsSet(K.active, p.id);
      if (LIVE) { try { fetch('/api/participants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); } catch (e) {} }
      emit();
      return p;
    },

    update: function (id, patch) {
      var idx = -1; mine.forEach(function (p, i) { if (p.id === id) idx = i; });
      if (idx < 0) return null;
      mine[idx] = Object.assign({}, mine[idx], patch);
      if (patch.name) mine[idx].initials = initials(patch.name);
      lsSet(K.mine, mine); rebuild();
      if (LIVE) { try { fetch('/api/participants/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mine[idx]) }); } catch (e) {} }
      emit();
      return mine[idx];
    },

    setPick: function (id, key, value) {
      var p = this.getSync(id); if (!p) return;
      var picks = Object.assign({}, p.picks || {}); picks[key] = value;
      return this.update(id, { picks: picks });
    },

    // claim a pre-seeded OI roster entry (adds to device without re-creating the person)
    claimOI: function (id) {
      var d = this.deviceIds();
      if (d.indexOf(id) < 0) { d.push(id); lsSet(K.device, d); }
      lsSet(K.active, id);
      // Copy into mine so update()/setPick() can find them and sync to the server.
      var alreadyMine = mine.some(function(p) { return p.id === id; });
      if (!alreadyMine) {
        var person = this.getSync(id);
        if (person) { mine = mine.concat([person]); lsSet(K.mine, mine); }
      }
      emit();
    },

    // live refresh (no-op in mock)
    refresh: function () {
      if (!LIVE) return Promise.resolve();
      return fetch('/api/state').then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.people) { window.WC_DATA = d; if (window.__rebuildWC) window.__rebuildWC(); rebuild(); emit(); }
      }).catch(function () {});
    },

    // ===== ADMIN =====
    adminState: function () { return admin; },
    teamsAlive: function () { return WC.TEAM_LIST.filter(function (t) { return t.alive; }).length; },
    phase: function () { return WC.meta.phase; },
    setPhase: function (phase) {
      admin.meta = admin.meta || {}; admin.meta.phase = phase;
      applyAdmin(); persistAdmin(); rebuild(); emit();
    },
    setTeamOut: function (code, out) {
      admin.teams = admin.teams || {};
      if (out) admin.teams[code] = { alive: false, stage: 'out-group', rounds: 1 };
      else admin.teams[code] = { alive: true, stage: (WC.meta.phase === 'pre' ? 'group' : 'r16'), rounds: (WC.meta.phase === 'pre' ? 0 : 3) };
      // first elimination auto-advances the tournament into play
      if (out && WC.meta.phase === 'pre') { admin.meta = admin.meta || {}; admin.meta.phase = 'live'; }
      applyAdmin(); persistAdmin(); rebuild(); emit();
    },
    setFixtureResult: function (id, a, b) {
      admin.fixtures = admin.fixtures || {};
      admin.fixtures[id] = { score: [a, b], status: 'done' };
      if (WC.meta.phase === 'pre') { admin.meta = admin.meta || {}; admin.meta.phase = 'live'; }
      applyAdmin(); persistAdmin(); emit();
    },
    setFixtureLive: function (id, on) {
      admin.fixtures = admin.fixtures || {};
      if (on) { admin.fixtures[id] = { score: (admin.fixtures[id] && admin.fixtures[id].score) || [0, 0], status: 'live' }; }
      else { delete admin.fixtures[id]; }
      applyAdmin(); persistAdmin(); emit();
    },
    clearFixture: function (id) {
      if (admin.fixtures) delete admin.fixtures[id];
      applyAdmin(); persistAdmin(); emit();
    },
    setPredictionAnswer: function (key, answer) {
      admin.predictions = admin.predictions || {};
      if (answer == null) delete admin.predictions[key]; else admin.predictions[key] = answer;
      applyAdmin(); persistAdmin(); emit();
    },
    adminReset: function () {
      admin = { teams: {}, fixtures: {}, predictions: {}, meta: {} };
      applyAdmin(); persistAdmin(); rebuild(); emit();
    }
  };

  window.Store = Store;
})();
