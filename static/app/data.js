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

    function tieFinished(t) {
      return !!(t && (t.done || fixtureDone(t)));
    }

    function tieWinner(t) {
      if (!tieFinished(t)) return null;
      if (fixtureDone(t)) {
        var fromStatus = fixtureWinnerSide(t);
        if (fromStatus) return fromStatus;
      }
      if (t.winner === 'HOME') return t.a;
      if (t.winner === 'AWAY') return t.b;
      if (t.winner && t.winner !== 'DRAW') return t.winner;
      if (t.score && t.score[0] != null && t.score[1] != null) {
        if (t.score[0] > t.score[1]) return t.a;
        if (t.score[1] > t.score[0]) return t.b;
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
          teamA: TEAMS[f.a] || (f.a === 'TBD' ? { code: 'TBD', flag: '🏳️', name: 'TBD' } : undefined),
          teamB: TEAMS[f.b] || (f.b === 'TBD' ? { code: 'TBD', flag: '🏳️', name: 'TBD' } : undefined),
          score: f.score,
          done: tieFinished(f),
          winner: tieWinner(f),
          stageLabel: stageLabelForFixture(f),
          afterExtraTime: !!f.afterExtraTime,
          pens: tieFinished(f) && f.winner && f.score && f.score[0] === f.score[1],
          you: you,
          entrant: entrant,
          ownersA: ownersA.length,
          ownersB: ownersB.length,
          projectedPairing: false,
          bracketPad: false,
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

    var BRACKET_ROUND_SIZES = { r32: 16, r16: 8, qf: 4, sf: 2, final: 1 };
    var BRACKET_TREE_STAGES = ['r32', 'r16', 'qf', 'sf', 'final'];

    function r32SlotNum(t) {
      var id = String((t && t.id) || '');
      if (id.indexOf('proj-r32-') === 0) {
        var n = parseInt(id.split('proj-r32-')[1], 10);
        if (!isNaN(n)) return n;
      }
      return 9999;
    }

    function sortBracketRound(ties, stage) {
      ties = (ties || []).slice();
      if (stage === 'r32') {
        ties.sort(function (a, b) {
          var da = r32SlotNum(a) - r32SlotNum(b);
          if (da) return da;
          return (a.kickoff || 0) - (b.kickoff || 0);
        });
      } else {
        ties.sort(function (a, b) { return (a.kickoff || 0) - (b.kickoff || 0); });
      }
      return ties;
    }

    function padPlaceholderTie(stage, index) {
      return {
        id: 'pad-' + stage + '-' + index,
        a: 'TBD',
        b: 'TBD',
        stage: stage,
        done: false,
        winner: null,
        projectedPairing: false,
        bracketPad: true,
        teamA: { code: 'TBD', flag: '🏳️', name: 'TBD' },
        teamB: { code: 'TBD', flag: '🏳️', name: 'TBD' },
        kickoff: 0,
      };
    }

    function padBracketRound(ties, stage) {
      var need = BRACKET_ROUND_SIZES[stage];
      if (!need) return ties || [];
      ties = sortBracketRound(ties, stage);
      while (ties.length < need) {
        ties.push(padPlaceholderTie(stage, ties.length));
      }
      return ties.slice(0, need);
    }

    function padKnockoutBracket(rounds) {
      rounds = rounds || {};
      var hasKo = BRACKET_TREE_STAGES.some(function (k) {
        return (rounds[k] || []).some(function (t) { return !t.bracketPad && (t.a !== 'TBD' || t.b !== 'TBD'); });
      });
      if (!hasKo) return rounds;
      var out = Object.assign({}, rounds);
      BRACKET_TREE_STAGES.forEach(function (st) {
        out[st] = padBracketRound(rounds[st] || [], st);
      });
      if ((rounds.third || []).length) out.third = rounds.third;
      return out;
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
          var done = tieFinished(t);
          var winner = tieWinner(t);
          return {
            id: t.id || ('proj-' + st + '-' + t.a + '-' + t.b),
            a: t.a,
            b: t.b,
            teamA: TEAMS[t.a] || (t.a === 'TBD' ? { code: 'TBD', flag: '🏳️', name: 'TBD' } : undefined),
            teamB: TEAMS[t.b] || (t.b === 'TBD' ? { code: 'TBD', flag: '🏳️', name: 'TBD' } : undefined),
            score: t.score,
            done: done,
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
        if (st === 'r32') rounds[st] = sortBracketRound(rounds[st], st);
        else rounds[st].sort(function (a, b) { return (a.kickoff || 0) - (b.kickoff || 0); });
      });
      return rounds;
    }

    function bracketPairKey(a, b) {
      return [String(a || ''), String(b || '')].sort().join('|');
    }

    function sameBracketPair(a1, b1, a2, b2) {
      return bracketPairKey(a1, b1) === bracketPairKey(a2, b2);
    }

    function feedOverlayR32(base, feed) {
      var out = Object.assign({}, base || {}, feed);
      out.projectedPairing = false;
      out.bracketPad = false;
      out.teamA = TEAMS[out.a] || (out.a === 'TBD' ? { code: 'TBD', flag: '🏳️', name: 'TBD' } : undefined);
      out.teamB = TEAMS[out.b] || (out.b === 'TBD' ? { code: 'TBD', flag: '🏳️', name: 'TBD' } : undefined);
      return out;
    }

    function feedFillsR32Slot(slot, feed) {
      if (sameBracketPair(slot.a, slot.b, feed.a, feed.b)) return true;
      var known = [slot.a, slot.b].filter(function (c) { return c && c !== 'TBD'; });
      if (known.length !== 1) return false;
      return feed.a === known[0] || feed.b === known[0];
    }

    function mergeR32Rounds(proj, feed) {
      var merged = (proj || []).map(function (t) { return Object.assign({}, t); });
      (feed || []).forEach(function (f) {
        var placed = false;
        for (var i = 0; i < merged.length; i++) {
          if (sameBracketPair(merged[i].a, merged[i].b, f.a, f.b) || feedFillsR32Slot(merged[i], f)) {
            merged[i] = feedOverlayR32(merged[i], f);
            placed = true;
            break;
          }
        }
        if (!placed) merged.push(feedOverlayR32(null, f));
      });
      return sortBracketRound(merged, 'r32');
    }

    function buildMergedKnockoutBracket() {
      var meta = WC.meta || {};
      var feed = buildKnockoutBracket();
      var merged;
      if (meta.r32Published) {
        merged = feed;
      } else {
        var projected = buildProjectedKnockoutBracket();
        merged = {};
        merged.r32 = mergeR32Rounds(projected.r32, feed.r32);
        BRACKET_TREE_STAGES.forEach(function (st) {
          if (st === 'r32') return;
          merged[st] = (feed[st] || []).length ? feed[st] : (projected[st] || []);
        });
        if ((feed.third || []).length) merged.third = feed.third;
        else if ((projected.third || []).length) merged.third = projected.third;
      }
      return padKnockoutBracket(merged);
    }

    function knockoutBracketVisible() {
      var merged = buildMergedKnockoutBracket();
      var stages = ['r32', 'r16', 'qf', 'sf', 'final', 'third'];
      for (var i = 0; i < stages.length; i++) {
        if ((merged[stages[i]] || []).length > 0) return true;
      }
      return false;
    }

    function projectedBracketVisible() {
      if ((WC.meta || {}).r32Published) return false;
      return knockoutBracketVisible();
    }

    function projectedR32Opponent(teamCode) {
      var meta = WC.meta || {};
      var feed = buildKnockoutBracket();
      var ties;
      if (meta.r32Published) {
        ties = feed.r32 || [];
      } else {
        ties = mergeR32Rounds(buildProjectedKnockoutBracket().r32, feed.r32);
      }
      for (var i = 0; i < ties.length; i++) {
        var t = ties[i];
        if (t.a === teamCode && t.b && t.b !== 'TBD') return t.b;
        if (t.b === teamCode && t.a && t.a !== 'TBD') return t.a;
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
      buildMergedKnockoutBracket: buildMergedKnockoutBracket,
      knockoutBracketVisible: knockoutBracketVisible,
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
