/* ===========================================================================
   DATA LAYER — builds window.WC from server-injected window.WC_DATA.
   The Python backend (main.py) injects WC_DATA before this file loads.

   build() mutates the SAME window.WC object in place so modules that captured
   `const X = window.WC` at load keep a live reference. window.__rebuildWC re-runs
   it after Store.refresh() swaps in fresh league state (teams, fixtures, people,
   predictions, meta) — without that, a live refresh updated nothing.
   =========================================================================== */
(function () {
  function build() {
    var d = window.WC_DATA;
    if (!d) { console.error('WC_DATA not injected by server'); return; }

    var TEAMS = {};
    var TEAM_LIST = (d.teams || []).map(function (t) {
      TEAMS[t.code] = t;
      return t;
    });

    var PEOPLE = d.people || [];
    var YOU = PEOPLE[0]; // YOU is always index 0 (when present)

    function ownersOf(code) {
      return PEOPLE.filter(function (p) { return p.team === code; });
    }
    function rate(list) {
      if (!list.length) return 0;
      return Math.round(100 * list.filter(function (p) { return p.alive; }).length / list.length);
    }

    var SEGMENTS = [
      {
        key: 'city', label: 'London vs Edinburgh',
        a: { name: 'London', list: PEOPLE.filter(function (p) { return p.city === 'London'; }) },
        b: { name: 'Edinburgh', list: PEOPLE.filter(function (p) { return p.city === 'Edinburgh'; }) },
      },
      {
        key: 'gender', label: 'Girls vs Boys',
        a: { name: 'Girls', list: PEOPLE.filter(function (p) { return p.gender === 'F'; }) },
        b: { name: 'Boys', list: PEOPLE.filter(function (p) { return p.gender === 'M'; }) },
      },
      {
        key: 'rank', label: 'Leadership vs Everyone',
        a: { name: 'Leadership', list: PEOPLE.filter(function (p) { return p.leadership; }) },
        b: { name: 'Everyone else', list: PEOPLE.filter(function (p) { return !p.leadership && !p.isYou; }) },
      },
    ];

    var GROUPS = 'ABCDEFGHIJKL'.split('').map(function (g) {
      return { id: g, teams: TEAM_LIST.filter(function (t) { return t.group === g; }) };
    });

    // Mutate the existing object (don't reassign) so captured refs stay valid.
    var WC = window.WC || {};
    WC.TEAMS = TEAMS;
    WC.TEAM_LIST = TEAM_LIST;
    WC.GROUPS = GROUPS;
    WC.R16 = d.r16;
    WC.FIXTURES = d.fixtures || [];
    WC.PEOPLE = PEOPLE;
    WC.YOU = YOU;
    WC.ownersOf = ownersOf;
    WC.SEGMENTS = SEGMENTS;
    WC.rate = rate;
    WC.FEE = d.fee;
    WC.POT = d.pot;
    var cs = d.charitySplit != null ? d.charitySplit : (d.meta && d.meta.charitySplit);
    WC.charitySplit = cs;
    WC.CHARITY_SPLIT = cs;
    WC.PAYOUTS = d.payouts;
    WC.LINES = d.lines;
    WC.predictions = d.predictions || [];
    WC.PREDICTIONS = d.predictions || [];
    WC.meta = d.meta;
    WC.league = d.league || null;
    WC.projectedBracket = d.projectedBracket || { rounds: {}, qualifierCount: 0, source: 'standings' };

    // Fixture helpers — single source for next-tie, bracket, status (all read WC.FIXTURES).
    var DONE = ['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'];
    var LIVE = ['live', 'inplay', 'in_play', 'in-progress', 'inprogress', '1h', '2h'];
    var HALF = ['halftime', 'half_time', 'half-time', 'ht', 'paused'];
    var KO_STAGES = ['r32', 'r16', 'qf', 'sf', 'final', 'third'];

    function kickoffMs(f) {
      try {
        var tm = (f && f.time && /^\d{2}:\d{2}/.test(f.time)) ? f.time.slice(0, 5) : '00:00';
        var t = new Date(((f && f.dateISO) || '') + 'T' + tm + ':00').getTime();
        return isFinite(t) ? t : null;
      } catch (e) { return null; }
    }

    function fixtureStatus(f) {
      var raw = String((f && f.status) || 'upcoming').trim().toLowerCase();
      if (DONE.indexOf(raw) >= 0) return 'done';
      if (HALF.indexOf(raw) >= 0) return 'halfTime';
      if (LIVE.indexOf(raw) >= 0) return 'live';
      if (raw === 'cancelled' || raw === 'postponed') return 'cancelled';
      var ko = kickoffMs(f);
      if (ko == null) return raw || 'upcoming';
      var age = Date.now() - ko;
      if (age < 0) return 'upcoming';
      if (age <= 135 * 60 * 1000) return 'live';
      return 'needsResult';
    }

    function fixtureDone(f) {
      return fixtureStatus(f) === 'done' && f.score && f.score[0] != null && f.score[1] != null;
    }

    function stageLabelForFixture(f) {
      var st = (f && f.stage) || 'group';
      var labels = (WC.meta && WC.meta.stageLabels) || {};
      if (st === 'group') return 'Group ' + (f.group || '?');
      return labels[st] || st.toUpperCase();
    }

    function stageNameForTeam(t) {
      if (!t) return '';
      var labels = (WC.meta && WC.meta.stageLabels) || {};
      var st = t.stage || 'group';
      if (labels[st]) return labels[st];
      if (st === 'group') return 'Group stage';
      if (st === 'winner') return 'Winners';
      if (String(st).indexOf('out-') === 0) {
        var base = st.slice(4);
        return 'Out · ' + (labels[base] || base);
      }
      return st;
    }

    function statusRank(st) {
      if (st === 'live' || st === 'halfTime') return 0;
      if (st === 'upcoming') return 1;
      if (st === 'needsResult') return 2;
      return 3;
    }

    function nextFixtureForTeam(teamCode) {
      if (!teamCode) return null;
      var candidates = (WC.FIXTURES || []).filter(function (f) {
        if (f.a !== teamCode && f.b !== teamCode) return false;
        if (fixtureDone(f)) return false;
        if (fixtureStatus(f) === 'cancelled') return false;
        return true;
      });
      candidates.sort(function (a, b) {
        var ra = statusRank(fixtureStatus(a));
        var rb = statusRank(fixtureStatus(b));
        if (ra !== rb) return ra - rb;
        return (kickoffMs(a) || 0) - (kickoffMs(b) || 0);
      });
      var f = candidates[0];
      if (!f) return null;
      var oppCode = f.a === teamCode ? f.b : f.a;
      var st = fixtureStatus(f);
      return {
        fixture: f,
        opponent: TEAMS[oppCode] || { code: oppCode, name: oppCode, flag: '🏳️' },
        stageLabel: stageLabelForFixture(f),
        isLive: st === 'live' || st === 'halfTime',
        status: st,
      };
    }

    function fixtureWinnerSide(f) {
      if (!f || !fixtureDone(f)) return null;
      var w = f.winner;
      if (w === 'HOME') return f.a;
      if (w === 'AWAY') return f.b;
      if (f.score && f.score[0] != null && f.score[1] != null) {
        if (f.score[0] > f.score[1]) return f.a;
        if (f.score[1] > f.score[0]) return f.b;
      }
      return null;
    }

    function buildKnockoutBracket() {
      var active = (window.Store && window.Store.active) ? window.Store.active() : null;
      var me = active || YOU;
      var myCode = me && me.team;
      var rounds = {};
      KO_STAGES.forEach(function (st) { rounds[st] = []; });
      (WC.FIXTURES || []).forEach(function (f) {
        var st = f.stage;
        if (KO_STAGES.indexOf(st) < 0) return;
        var ownersA = ownersOf(f.a);
        var ownersB = ownersOf(f.b);
        var you = !!(myCode && (f.a === myCode || f.b === myCode));
        var entrant = ownersA.length + ownersB.length > 0;
        rounds[st].push({
          id: f.id,
          a: f.a,
          b: f.b,
          teamA: TEAMS[f.a],
          teamB: TEAMS[f.b],
          score: f.score,
          done: fixtureDone(f),
          winner: fixtureWinnerSide(f),
          stageLabel: stageLabelForFixture(f),
          afterExtraTime: !!f.afterExtraTime,
          pens: fixtureDone(f) && f.winner && f.score && f.score[0] === f.score[1],
          you: you,
          entrant: entrant,
          ownersA: ownersA.length,
          ownersB: ownersB.length,
          dateLabel: f.dateLabel,
          time: f.time,
          kickoff: kickoffMs(f),
        });
      });
      KO_STAGES.forEach(function (st) {
        rounds[st].sort(function (a, b) { return (a.kickoff || 0) - (b.kickoff || 0); });
      });
      return rounds;
    }

    function buildProjectedKnockoutBracket() {
      var raw = WC.projectedBracket;
      if (!raw || !raw.rounds) return {};
      var active = (window.Store && window.Store.active) ? window.Store.active() : null;
      var me = active || YOU;
      var myCode = me && me.team;
      var rounds = {};
      Object.keys(raw.rounds).forEach(function (st) {
        rounds[st] = (raw.rounds[st] || []).map(function (t) {
          var ownersA = ownersOf(t.a);
          var ownersB = ownersOf(t.b);
          var you = !!(myCode && (t.a === myCode || t.b === myCode));
          var winner = t.winner || null;
          return {
            id: t.id || ('proj-' + st + '-' + t.a + '-' + t.b),
            a: t.a,
            b: t.b,
            teamA: TEAMS[t.a],
            teamB: TEAMS[t.b],
            score: t.score,
            done: !!t.done,
            winner: winner,
            stageLabel: stageLabelForFixture(t),
            afterExtraTime: !!t.afterExtraTime,
            pens: !!t.pens,
            you: you,
            entrant: ownersA.length + ownersB.length > 0,
            ownersA: ownersA.length,
            ownersB: ownersB.length,
            projectedWinner: !!t.projectedWinner,
            projectedPairing: !!t.projectedPairing,
            dateLabel: t.dateLabel,
            time: t.time,
            kickoff: kickoffMs(t),
          };
        });
        rounds[st].sort(function (a, b) { return (a.kickoff || 0) - (b.kickoff || 0); });
      });
      return rounds;
    }

    function projectedBracketVisible() {
      var raw = WC.projectedBracket;
      if (!raw || !raw.rounds) return false;
      return (raw.rounds.r32 || []).length > 0;
    }

    function projectedR32Opponent(teamCode) {
      var rounds = (WC.projectedBracket && WC.projectedBracket.rounds) || {};
      var ties = rounds.r32 || [];
      for (var i = 0; i < ties.length; i++) {
        var t = ties[i];
        if (t.a === teamCode) return t.b;
        if (t.b === teamCode) return t.a;
      }
      return null;
    }

    function localTodayISO() {
      var d = new Date();
      var m = d.getMonth() + 1;
      var day = d.getDate();
      return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
    }

    function todaysEntrantFixtures() {
      var today = localTodayISO();
      return (WC.FIXTURES || []).filter(function (f) {
        if (f.dateISO !== today) return false;
        if (fixtureDone(f)) return false;
        return ownersOf(f.a).length + ownersOf(f.b).length > 0;
      }).sort(function (a, b) { return (kickoffMs(a) || 0) - (kickoffMs(b) || 0); });
    }

    function teamProgressMax() {
      var ladder = (WC.meta && WC.meta.stageLadder) || ['group', 'r32', 'r16', 'qf', 'sf', 'final', 'winner'];
      return Math.max(1, ladder.length - 1);
    }

    function knockoutsVisible(meta) {
      meta = meta || WC.meta || {};
      if (meta.r32Published || meta.knockoutsInFeed) return true;
      var fc = meta.fixtureCounts || {};
      var ko = ['r32', 'r16', 'qf', 'sf', 'final', 'third'];
      for (var i = 0; i < ko.length; i++) {
        if ((fc[ko[i]] || 0) > 0) return true;
      }
      return false;
    }

    WC.fixtures = {
      kickoffMs: kickoffMs,
      status: fixtureStatus,
      done: fixtureDone,
      stageLabel: stageLabelForFixture,
      stageNameForTeam: stageNameForTeam,
      nextForTeam: nextFixtureForTeam,
      buildKnockoutBracket: buildKnockoutBracket,
      buildProjectedKnockoutBracket: buildProjectedKnockoutBracket,
      projectedBracketVisible: projectedBracketVisible,
      projectedR32Opponent: projectedR32Opponent,
      todaysEntrantFixtures: todaysEntrantFixtures,
      winnerSide: fixtureWinnerSide,
      teamProgressMax: teamProgressMax,
      knockoutsVisible: knockoutsVisible,
    };
    window.WheeshtFixtures = WC.fixtures;

    window.WC = WC;
  }

  build();
  window.__rebuildWC = build;
})();
