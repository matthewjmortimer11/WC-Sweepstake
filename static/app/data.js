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
      if (!f) return false;
      if (f.done && f.score && f.score[0] != null && f.score[1] != null) return true;
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

    function teamInfo(code) {
      if (!code || code === 'TBD') return { code: 'TBD', name: 'TBD', flag: '🏳️' };
      return TEAMS[code] || { code: code, name: code, flag: '🏳️' };
    }

    function tournamentPhase() {
      var meta = WC.meta || {};
      if (meta.tournamentPhase) return meta.tournamentPhase;
      if (meta.phase === 'done') return 'finished';
      if (TEAM_LIST.some(function (t) { return t.stage === 'winner'; })) return 'finished';
      if (meta.knockoutRound || meta.knockoutsInFeed || meta.r32Published) return 'knockout';
      if (meta.groupsComplete) return 'group_complete';
      return 'group';
    }

    function knockoutFeedActive() {
      var meta = WC.meta || {};
      return !!(meta.groupsComplete || meta.knockoutsInFeed || meta.r32Published || meta.knockoutRound);
    }

    function teamHasFeedKnockoutFixture(teamCode) {
      return (WC.FIXTURES || []).some(function (f) {
        return f.stage && f.stage !== 'group' && (f.a === teamCode || f.b === teamCode);
      });
    }

    function teamSweepstakePhase(teamCode) {
      var t = TEAMS[teamCode];
      if (!t || !t.alive) return 'out';
      if ((t.rounds || 0) >= 1) return 'in_knockout';
      var meta = WC.meta || {};
      if (!meta.groupsComplete) return 'in_group';
      if (!meta.r32Published && !teamHasFeedKnockoutFixture(teamCode)) return 'waiting_draw';
      if (findCurrentBracketTie(teamCode, buildMergedKnockoutBracket())) return 'in_knockout';
      var mergedForPhase = buildMergedKnockoutBracket();
      var finishedForPhase = findLastFinishedBracketSlot(teamCode, mergedForPhase);
      if (finishedForPhase && tieWinner(finishedForPhase.tie) === teamCode) return 'in_knockout';
      return 'waiting_draw';
    }

    function nextFixtureFromFeed(teamCode) {
      if (!teamCode) return null;
      var koMode = knockoutFeedActive();
      var candidates = (WC.FIXTURES || []).filter(function (f) {
        if (f.a !== teamCode && f.b !== teamCode) return false;
        if (koMode && f.stage === 'group') return false;
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
        opponent: teamInfo(oppCode),
        stage: f.stage || 'group',
        stageLabel: stageLabelForFixture(f),
        isLive: st === 'live' || st === 'halfTime',
        status: st,
        projected: false,
        tieId: f.id,
      };
    }

    function findCurrentBracketTie(teamCode, merged) {
      var i, st, ties, ti, tie;
      for (i = 0; i < BRACKET_TREE_STAGES.length; i++) {
        st = BRACKET_TREE_STAGES[i];
        ties = merged[st] || [];
        for (ti = 0; ti < ties.length; ti++) {
          tie = ties[ti];
          if (tie.bracketPad) continue;
          if (tie.a !== teamCode && tie.b !== teamCode) continue;
          if (tieFinished(tie)) continue;
          return { stage: st, index: ti, tie: tie };
        }
      }
      return null;
    }

    function findLastFinishedBracketSlot(teamCode, merged) {
      var last = null;
      var i, st, ties, ti, tie;
      for (i = 0; i < BRACKET_TREE_STAGES.length; i++) {
        st = BRACKET_TREE_STAGES[i];
        ties = merged[st] || [];
        for (ti = 0; ti < ties.length; ti++) {
          tie = ties[ti];
          if (tie.bracketPad) continue;
          if (tie.a !== teamCode && tie.b !== teamCode) continue;
          if (!tieFinished(tie)) continue;
          last = { stage: st, index: ti, tie: tie };
        }
      }
      return last;
    }

    function nextKnockoutStageAfter(stage) {
      var si = BRACKET_TREE_STAGES.indexOf(stage);
      if (si < 0 || si >= BRACKET_TREE_STAGES.length - 1) return null;
      return BRACKET_TREE_STAGES[si + 1];
    }

    function nextBracketSlot(currentStage, currentIndex, merged) {
      var si = BRACKET_TREE_STAGES.indexOf(currentStage);
      if (si < 0 || si >= BRACKET_TREE_STAGES.length - 1) return null;
      var nextStage = BRACKET_TREE_STAGES[si + 1];
      var nextIndex = Math.floor(currentIndex / 2);
      var ties = merged[nextStage] || [];
      var tie = ties[nextIndex];
      if (!tie) return null;
      return { stage: nextStage, index: nextIndex, tie: tie };
    }

    function stageLabelForRound(st) {
      var labels = (WC.meta && WC.meta.stageLabels) || {};
      if (labels[st]) return labels[st];
      if (st === 'r32') return 'Round of 32';
      if (st === 'r16') return 'Round of 16';
      if (st === 'qf') return 'Quarter-finals';
      if (st === 'sf') return 'Semi-finals';
      if (st === 'final') return 'Final';
      return String(st || '').toUpperCase();
    }

    function describeBracketSlot(tie, stage) {
      var a = teamInfo(tie.a);
      var b = teamInfo(tie.b);
      var label = stageLabelForRound(stage || tie.stage);
      if (tie.a === 'TBD' && tie.b === 'TBD') {
        return {
          stage: stage || tie.stage,
          stageLabel: label,
          tieId: tie.id,
          slotA: 'TBD',
          slotB: 'TBD',
          description: label + ' berth',
          projected: !!(tie.projectedPairing || tie.bracketPad),
        };
      }
      return {
        stage: stage || tie.stage,
        stageLabel: label,
        tieId: tie.id,
        slotA: tie.a,
        slotB: tie.b,
        teamA: a,
        teamB: b,
        description: 'Winner of ' + a.name + ' vs ' + b.name,
        projected: !!(tie.projectedPairing || tie.bracketPad),
      };
    }

    function currentFromBracketTie(teamCode, slot) {
      var tie = slot.tie;
      var oppCode = tie.a === teamCode ? tie.b : tie.a;
      var st = fixtureStatus(tie);
      return {
        fixture: {
          id: tie.id,
          a: tie.a,
          b: tie.b,
          stage: slot.stage,
          score: tie.score,
          status: tie.done ? 'done' : (st === 'upcoming' ? 'upcoming' : st),
          dateLabel: tie.dateLabel,
          time: tie.time,
          dateISO: tie.dateISO,
        },
        opponent: teamInfo(oppCode),
        stage: slot.stage,
        stageLabel: stageLabelForRound(slot.stage),
        isLive: st === 'live' || st === 'halfTime',
        status: st,
        projected: !!tie.projectedPairing,
        tieId: tie.id,
      };
    }

    function knockoutPathForTeam(teamCode) {
      var t = TEAMS[teamCode];
      var tsp = teamSweepstakePhase(teamCode);
      var phase = tournamentPhase();
      if (!t || tsp === 'out') {
        var elim = null;
        if (t && !t.alive) {
          elim = String(t.stage || 'group');
          if (elim.indexOf('out-') === 0) elim = elim.slice(4);
          if (elim === 'group' || elim === 'out-group') elim = 'group';
        }
        return { current: null, next: null, eliminatedAt: elim, phase: tsp, tournamentPhase: phase };
      }
      if (tsp === 'waiting_draw') {
        return { current: null, next: null, eliminatedAt: null, phase: tsp, tournamentPhase: phase, waitingDraw: true };
      }
      if (phase === 'group' && tsp === 'in_group') {
        return { current: null, next: null, eliminatedAt: null, phase: tsp, tournamentPhase: phase };
      }

      var merged = buildMergedKnockoutBracket();
      var feedTie = nextFixtureFromFeed(teamCode);
      var curSlot = findCurrentBracketTie(teamCode, merged);
      var current = (feedTie && feedTie.stage !== 'group')
        ? feedTie
        : (curSlot ? currentFromBracketTie(teamCode, curSlot) : null);
      var next = null;
      if (curSlot) {
        var nxt = nextBracketSlot(curSlot.stage, curSlot.index, merged);
        if (nxt && nxt.tie) next = describeBracketSlot(nxt.tie, nxt.stage);
      } else if (current && current.stage) {
        var idx = -1;
        var ties = merged[current.stage] || [];
        for (var i = 0; i < ties.length; i++) {
          if (ties[i].a === teamCode || ties[i].b === teamCode) { idx = i; break; }
        }
        if (idx >= 0) {
          var nxt2 = nextBracketSlot(current.stage, idx, merged);
          if (nxt2 && nxt2.tie) next = describeBracketSlot(nxt2.tie, nxt2.stage);
        }
      }
      if (!next) {
        var finishedSlot = findLastFinishedBracketSlot(teamCode, merged);
        if (finishedSlot) {
          var nxt3 = nextBracketSlot(finishedSlot.stage, finishedSlot.index, merged);
          if (nxt3 && nxt3.tie) next = describeBracketSlot(nxt3.tie, nxt3.stage);
        }
      }
      if (!current && tsp === 'in_knockout') {
        var finishedSlot = findLastFinishedBracketSlot(teamCode, merged);
        if (finishedSlot && tieWinner(finishedSlot.tie) === teamCode) {
          var waitSt = nextKnockoutStageAfter(finishedSlot.stage);
          if (waitSt && !findCurrentBracketTie(teamCode, merged)) {
            return {
              current: null,
              next: next,
              eliminatedAt: null,
              phase: tsp,
              tournamentPhase: phase,
              waitingDraw: false,
              betweenRounds: true,
              waitingNextStage: waitSt,
              waitingNextRound: stageLabelForRound(waitSt),
            };
          }
        }
      }
      return { current: current, next: next, eliminatedAt: null, phase: tsp, tournamentPhase: phase, waitingDraw: false };
    }

    function nextFixtureForTeam(teamCode) {
      var path = knockoutPathForTeam(teamCode);
      if (path.waitingDraw || path.betweenRounds) return null;
      if (path.current) return path.current;
      return nextFixtureFromFeed(teamCode);
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
      var slotKnown = [slot.a, slot.b].filter(function (c) { return c && c !== 'TBD'; });
      if (slotKnown.length !== 1) return false;
      var feedTeams = [feed.a, feed.b].filter(function (c) { return c && c !== 'TBD'; });
      if (feedTeams.length !== 1) return false;
      return feedTeams[0] === slotKnown[0];
    }

    function stripTeamsFromOtherR32Slots(merged, teamA, teamB, keepIndex) {
      merged.forEach(function (m, i) {
        if (i === keepIndex) return;
        if (sameBracketPair(m.a, m.b, teamA, teamB)) return;
        var changed = false;
        var next = Object.assign({}, m);
        if (next.a === teamA || next.a === teamB) { next.a = 'TBD'; changed = true; }
        if (next.b === teamA || next.b === teamB) { next.b = 'TBD'; changed = true; }
        if (changed) {
          next.projectedPairing = (next.a && next.a !== 'TBD') || (next.b && next.b !== 'TBD');
          merged[i] = next;
        }
      });
    }

    function placeFullR32Feed(merged, f) {
      var fa = f.a;
      var fb = f.b;
      if (!fa || !fb || fa === 'TBD' || fb === 'TBD') return;
      var i, target = -1;
      for (i = 0; i < merged.length; i++) {
        if (sameBracketPair(merged[i].a, merged[i].b, fa, fb)) {
          merged[i] = feedOverlayR32(merged[i], f);
          return;
        }
      }
      for (i = 0; i < merged.length; i++) {
        var known = [merged[i].a, merged[i].b].filter(function (c) { return c && c !== 'TBD'; });
        if (known.some(function (c) { return c === fa || c === fb; })) { target = i; break; }
      }
      if (target < 0) {
        for (i = 0; i < merged.length; i++) {
          if (merged[i].a === 'TBD' && merged[i].b === 'TBD') { target = i; break; }
        }
      }
      if (target >= 0) {
        stripTeamsFromOtherR32Slots(merged, fa, fb, target);
        merged[target] = feedOverlayR32(merged[target], f);
      } else if (merged.length < 16) {
        merged.push(feedOverlayR32(null, f));
      }
    }

    function placePartialR32Feed(merged, f) {
      var feedTeams = [f.a, f.b].filter(function (c) { return c && c !== 'TBD'; });
      if (feedTeams.length !== 1) return;
      var team = feedTeams[0];
      var i;
      for (i = 0; i < merged.length; i++) {
        if (feedFillsR32Slot(merged[i], f)) {
          merged[i] = feedOverlayR32(merged[i], f);
          return;
        }
      }
      for (i = 0; i < merged.length; i++) {
        if (merged[i].a === team || merged[i].b === team) {
          merged[i] = feedOverlayR32(merged[i], f);
          return;
        }
      }
      for (i = 0; i < merged.length; i++) {
        if (merged[i].a === 'TBD' && merged[i].b === 'TBD') {
          merged[i] = feedOverlayR32(merged[i], f);
          return;
        }
      }
      if (merged.length < 16) merged.push(feedOverlayR32(null, f));
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
        if (!placed) {
          var feedTeams = [f.a, f.b].filter(function (c) { return c && c !== 'TBD'; });
          var hasPair = merged.some(function (m) { return sameBracketPair(m.a, m.b, f.a, f.b); });
          if (hasPair) return;
          if (feedTeams.length === 2) {
            placeFullR32Feed(merged, f);
          } else {
            var dup = feedTeams.some(function (c) {
              return merged.some(function (m) { return m.a === c || m.b === c; });
            });
            if (!dup) placePartialR32Feed(merged, f);
          }
        }
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

    var KO_LIST_STAGES = ['r32', 'r16', 'qf', 'sf', 'final', 'third'];
    var KO_STAGE_SORT = { r32: 1, r16: 2, qf: 3, sf: 4, final: 5, third: 6 };

    function knockoutFixtureKey(f) {
      return String(f.stage || '') + '|' + bracketPairKey(f.a, f.b);
    }

    function bracketTieToFixture(tie, stage) {
      if (!tie || tie.bracketPad) return null;
      if (tie.a === 'TBD' && tie.b === 'TBD') return null;
      var st = fixtureStatus(tie);
      return {
        id: tie.id || ('bracket-' + stage + '-' + tie.a + '-' + tie.b),
        a: tie.a,
        b: tie.b,
        stage: stage,
        group: null,
        matchday: null,
        status: tie.done ? 'done' : (st === 'upcoming' ? 'upcoming' : st),
        score: tie.score,
        winner: tie.winner,
        dateISO: tie.dateISO || null,
        dateLabel: tie.dateLabel || (tie.projectedPairing ? 'Pairing TBC' : 'Date TBC'),
        time: tie.time || null,
        venue: tie.venue || null,
        projectedPairing: !!tie.projectedPairing,
        fromBracket: true,
      };
    }

    function findFeedKnockoutMatch(fx, stage) {
      var feed = WC.FIXTURES || [];
      for (var i = 0; i < feed.length; i++) {
        var f = feed[i];
        if (f.stage !== stage) continue;
        if (fx.id && f.id === fx.id) return f;
        if (sameBracketPair(f.a, f.b, fx.a, fx.b)) return f;
      }
      return null;
    }

    function buildKnockoutFixtureList() {
      var merged = buildMergedKnockoutBracket();
      var out = [];
      var seen = {};
      KO_LIST_STAGES.forEach(function (st) {
        (merged[st] || []).forEach(function (tie) {
          var fx = bracketTieToFixture(tie, st);
          if (!fx) return;
          var feedMatch = findFeedKnockoutMatch(fx, st);
          if (feedMatch) {
            fx = Object.assign({}, fx, feedMatch, { projectedPairing: false, fromBracket: false });
          }
          var key = knockoutFixtureKey(fx);
          if (seen[key]) return;
          seen[key] = true;
          out.push(fx);
        });
      });
      (WC.FIXTURES || []).forEach(function (f) {
        if (!f.stage || f.stage === 'group') return;
        var key = knockoutFixtureKey(f);
        if (seen[key]) return;
        seen[key] = true;
        out.push(f);
      });
      out.sort(function (a, b) {
        var ra = statusRank(fixtureStatus(a));
        var rb = statusRank(fixtureStatus(b));
        if (ra !== rb) return ra - rb;
        var sa = KO_STAGE_SORT[a.stage] || 99;
        var sb = KO_STAGE_SORT[b.stage] || 99;
        if (sa !== sb) return sa - sb;
        var ka = kickoffMs(a);
        var kb = kickoffMs(b);
        if (ka && kb && ka !== kb) return ka - kb;
        if (ka && !kb) return -1;
        if (!ka && kb) return 1;
        return r32SlotNum({ id: a.id }) - r32SlotNum({ id: b.id });
      });
      return out;
    }

    function compareKnockoutFixtures(a, b) {
      var ra = statusRank(fixtureStatus(a));
      var rb = statusRank(fixtureStatus(b));
      if (ra !== rb) return ra - rb;
      var sa = KO_STAGE_SORT[a.stage] || 99;
      var sb = KO_STAGE_SORT[b.stage] || 99;
      if (sa !== sb) return sa - sb;
      var ka = kickoffMs(a);
      var kb = kickoffMs(b);
      if (ka && kb && ka !== kb) return ka - kb;
      if (ka && !kb) return -1;
      if (!ka && kb) return 1;
      return r32SlotNum({ id: a.id }) - r32SlotNum({ id: b.id });
    }

    function sortKnockoutFixtures(list) {
      return (list || []).slice().sort(compareKnockoutFixtures);
    }

    function knockoutFixtureOrderKey(f) {
      return String(f.id || (f.stage + '|' + f.a + '|' + f.b));
    }

    function teamWonKnockoutRound(teamCode, stage) {
      if (!teamCode || !stage) return false;
      var list = WC.FIXTURES || [];
      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        if (f.stage !== stage || !fixtureDone(f)) continue;
        if (fixtureWinnerSide(f) === teamCode) return true;
      }
      return false;
    }

    /** Sweepstake funnel counts for Hub “The cull, so far” — uses alive + furthest stage. */
    function cullFunnelCounts(people) {
      people = people || PEOPLE || [];
      var meta = WC.meta || {};
      function teamOf(p) { return TEAMS[p.team] || {}; }

      function throughGroups(p) {
        var t = teamOf(p);
        if (t.stage === 'out-group') return false;
        if ((t.rounds || 0) >= 1) return true;
        if (p.alive && meta.groupsComplete) return true;
        var st = String(t.stage || '');
        if (st.indexOf('out-') === 0 && st !== 'out-group') return true;
        return false;
      }

      function pastR32(p) {
        var t = teamOf(p);
        var st = String(t.stage || '');
        if ((t.rounds || 0) >= 2) return true;
        if (/^(r16|qf|sf|final|winner)$/.test(st)) return true;
        if (/^out-(r16|qf|sf|final)/.test(st)) return true;
        if (p.alive && teamWonKnockoutRound(p.team, 'r32')) return true;
        return false;
      }

      function intoQFs(p) {
        var t = teamOf(p);
        var st = String(t.stage || '');
        if ((t.rounds || 0) >= 3) return true;
        if (/^(qf|sf|final|winner)$/.test(st)) return true;
        if (/^out-(qf|sf|final)/.test(st)) return true;
        if (p.alive && teamWonKnockoutRound(p.team, 'r16')) return true;
        return false;
      }

      var entered = people.length;
      var stillIn = people.filter(function (p) { return p.alive; }).length;
      var out = entered - stillIn;
      var groupsN = people.filter(throughGroups).length;
      var r32N = people.filter(pastR32).length;
      var qfN = people.filter(intoQFs).length;
      var tp = meta.tournamentPhase || (meta.groupsComplete ? 'group_complete' : 'group');
      var inGroupStage = tp === 'group' && !meta.groupsComplete;

      var subtitle;
      if (inGroupStage) {
        subtitle = out + ' out · ' + stillIn + ' still in · updates after each result';
      } else if (tp === 'group_complete') {
        subtitle = out + ' out after groups · ' + stillIn + ' still standing';
      } else {
        subtitle = out + ' knocked out · ' + stillIn + ' still in the hunt';
      }

      var stage2Label = meta.groupsComplete ? 'In knockouts' : 'Still in groups';
      var stage2N = meta.groupsComplete ? groupsN : stillIn;
      var stage2Sub = meta.groupsComplete ? 'Top two + best thirds' : 'alive in the draw';

      return {
        entered: entered,
        throughGroups: groupsN,
        pastR32: r32N,
        intoQFs: qfN,
        stillIn: stillIn,
        out: out,
        subtitle: subtitle,
        stages: [
          { label: 'Entered', n: entered, sub: 'the draw' },
          { label: stage2Label, n: stage2N, sub: stage2Sub },
          { label: 'Past R32', n: inGroupStage ? 0 : r32N, sub: inGroupStage ? 'after knockouts begin' : 'Last 16' },
          { label: 'Into QFs', n: inGroupStage ? 0 : qfN, sub: inGroupStage ? 'after knockouts begin' : 'Last 8' },
          { label: 'Still in', n: stillIn, sub: 'right now' },
        ],
      };
    }

    WC.fixtures = {
      kickoffMs: kickoffMs,
      status: fixtureStatus,
      done: fixtureDone,
      stageLabel: stageLabelForFixture,
      stageNameForTeam: stageNameForTeam,
      nextForTeam: nextFixtureForTeam,
      tournamentPhase: tournamentPhase,
      teamSweepstakePhase: teamSweepstakePhase,
      knockoutPathForTeam: knockoutPathForTeam,
      buildKnockoutBracket: buildKnockoutBracket,
      buildProjectedKnockoutBracket: buildProjectedKnockoutBracket,
      buildMergedKnockoutBracket: buildMergedKnockoutBracket,
      buildKnockoutFixtureList: buildKnockoutFixtureList,
      sortKnockoutFixtures: sortKnockoutFixtures,
      compareKnockoutFixtures: compareKnockoutFixtures,
      knockoutFixtureOrderKey: knockoutFixtureOrderKey,
      cullFunnelCounts: cullFunnelCounts,
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
