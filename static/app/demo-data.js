/* ===========================================================================
   DEMO LEAGUE — a self-contained, fictional matchday for product tours.

   This data never goes to the API. Store.enterDemoMode() swaps it into the
   existing WC data layer, and restores the visitor's real league on exit.
   =========================================================================== */
(function () {
  var COLORS = ['#E8272A', '#1a7a44', '#0a3b8c', '#7A3FB0', '#E07A1A', '#0d8a8a', '#C0246B', '#3a6ea5'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function initials(name) {
    return String(name || '').split(/\s+/).map(function (part) { return part[0] || ''; }).slice(0, 2).join('').toUpperCase();
  }

  function isoDay(offset) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function dayLabel(offset) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function buildPerson(spec, index) {
    var name = spec[0];
    var picks = {
      winner: spec[4] || ['ESP', 'FRA', 'BRA', 'ARG'][index % 4],
      final: index % 3 === 0 ? ['ESP', 'FRA'] : (index % 3 === 1 ? ['BRA', 'ARG'] : ['ESP', 'BRA']),
      goldenBoot: ['mbappe', 'yamal', 'vini', 'haaland'][index % 4],
      scotland: ['Round of 32', 'Round of 16', 'Quarter Final'][index % 3],
      england: ['Quarter Final', 'Semi Final', 'Final'][index % 3],
      surprise: ['JPN', 'MAR', 'SEN', 'COL'][index % 4],
      flop: ['BEL', 'GER', 'ENG', 'USA'][index % 4],
      cleanSheets: ['ESP', 'BRA', 'ARG', 'FRA'][index % 4],
      totalGoals: 164 + (index % 7),
      totalCards: 214 + (index * 3 % 22),
      youngPlayer: ['yamal', 'wirtz', 'endrick', 'yildiz'][index % 4],
      dm_sco_hai_score: ['2-0', '1-0', '2-1'][index % 3],
      dm_bra_sco_winner: ['SCO', 'BRA', 'draw', 'SCO'][index % 4],
    };
    return {
      id: index === 0 ? 'demo-you' : 'demo-' + (index + 1),
      name: name,
      initials: initials(name),
      team: spec[1],
      color: COLORS[index % COLORS.length],
      department: spec[2],
      location: spec[3],
      city: spec[3],
      ltMember: index === 6 || index === 14,
      leadership: index === 6 || index === 14,
      gender: '—',
      stage: 'group',
      alive: true,
      isYou: index === 0,
      isDemo: true,
      isOI: false,
      leagueCode: 'DEMO',
      picks: picks,
      predScore: [42, 55, 50, 47, 44, 40, 38, 35, 32, 30, 28, 27, 25, 23, 21, 20, 18, 16, 15, 12][index],
      joinedAt: Date.now() - (20 - index) * 27 * 60 * 60 * 1000,
    };
  }

  window.WC_BUILD_DEMO_DATA = function () {
    var base = clone(window.WC_DATA || {});
    var people = [
      ['Rory Bell', 'SCO', 'Product', 'Edinburgh', 'FRA'],
      ['Priya Shah', 'ESP', 'Design', 'London', 'ESP'],
      ['Callum Reid', 'BRA', 'Engineering', 'Edinburgh', 'BRA'],
      ['Nina Okafor', 'FRA', 'People', 'London', 'FRA'],
      ['Tomás Silva', 'ARG', 'Sales', 'Manchester', 'ARG'],
      ['Maeve Doyle', 'MAR', 'Marketing', 'Edinburgh', 'ESP'],
      ['Benji Cole', 'ENG', 'Leadership', 'London', 'ENG'],
      ['Aisha Khan', 'JPN', 'Operations', 'Manchester', 'FRA'],
      ['Lewis Grant', 'GER', 'Finance', 'Edinburgh', 'GER'],
      ['Sofia Rossi', 'POR', 'Design', 'London', 'POR'],
      ['Dan Wu', 'NED', 'Engineering', 'London', 'ESP'],
      ['Ellie Brooks', 'USA', 'Marketing', 'Manchester', 'ARG'],
      ['Kofi Mensah', 'SEN', 'Product', 'London', 'BRA'],
      ['Imogen Price', 'URU', 'People', 'Edinburgh', 'FRA'],
      ['Marcus Young', 'BEL', 'Leadership', 'Manchester', 'BEL'],
      ['Zara Hussain', 'COL', 'Sales', 'London', 'ARG'],
      ['Owen Park', 'KOR', 'Engineering', 'Edinburgh', 'ESP'],
      ['Lena Fischer', 'CRO', 'Finance', 'London', 'GER'],
      ['Jamie Quinn', 'AUS', 'Operations', 'Manchester', 'BRA'],
      ['Anika Patel', 'HAI', 'Support', 'Edinburgh', 'FRA'],
    ].map(buildPerson);

    var md1Scores = [[2, 0], [1, 1], [3, 1], [0, 0], [2, 1], [1, 0], [2, 2], [1, 2]];
    var scoreIndex = 0;
    base.fixtures = (base.fixtures || []).map(function (fixture) {
      var f = clone(fixture);
      if (f.stage !== 'group') return f;
      if (f.matchday === 1) {
        var isScotlandOpener = f.a === 'SCO' && f.b === 'HAI';
        var score = isScotlandOpener ? [2, 0] : md1Scores[scoreIndex++ % md1Scores.length];
        f.dateISO = isoDay(-4);
        f.dateLabel = dayLabel(-4);
        f.status = 'done';
        f.score = score;
        f.winner = score[0] === score[1] ? 'draw' : (score[0] > score[1] ? f.a : f.b);
      } else if (f.matchday === 2) {
        var isScotlandLive = f.a === 'BRA' && f.b === 'SCO';
        f.dateISO = isoDay(isScotlandLive ? 0 : 1);
        f.dateLabel = dayLabel(isScotlandLive ? 0 : 1);
        f.status = isScotlandLive ? 'live' : 'upcoming';
        f.score = isScotlandLive ? [1, 1] : null;
        f.winner = null;
        if (isScotlandLive) f.time = new Date().toTimeString().slice(0, 5);
      } else {
        f.dateISO = isoDay(4);
        f.dateLabel = dayLabel(4);
        f.status = 'upcoming';
        f.score = null;
        f.winner = null;
      }
      return f;
    });
    var scotlandLiveFixture = base.fixtures.find(function (f) { return f.a === 'BRA' && f.b === 'SCO'; });
    var scotlandOpener = base.fixtures.find(function (f) { return f.a === 'SCO' && f.b === 'HAI'; });

    base.people = people;
    base.fee = 5;
    base.pot = people.length * base.fee;
    base.charitySplit = 0.5;
    base.lines = Object.assign({}, base.lines || {}, {
      predOpen: 'The calls are in. Wheesht has the receipts, the timestamps, and several follow-up questions.',
      predLocked: 'The calls are in. Wheesht has the receipts, the timestamps, and several follow-up questions.',
    });
    base.league = { code: 'DEMO', name: 'Northstar Studio Sweepstake', seeded: true, demo: true };
    base.meta = Object.assign({}, base.meta || {}, {
      name: 'Northstar Studio Sweepstake',
      stageLabel: 'Group stage · Matchday 2',
      phase: 'live',
      matchday: 2,
      stillIn: people.length,
      out: 0,
      teamsLeft: 48,
      liveFixtures: 1,
      predictionsLocked: true,
      predDeadline: isoDay(-1) + 'T18:00:00',
      includeDepartment: true,
      includeLocation: true,
      includeLtMember: true,
      hasPro: true,
      proGrandfathered: false,
      proUpgradeAvailable: false,
      purpose: 'work',
      charitySplit: 0.5,
      locations: ['Edinburgh', 'London', 'Manchester'],
    });

    var demoMarkets = [
      {
        key: 'dm_bra_sco_winner',
        q: 'Brazil v Scotland — who wins?',
        kind: 'team',
        points: 5,
        answer: null,
        options: ['BRA', 'draw', 'SCO'],
        fixture_id: scotlandLiveFixture ? scotlandLiveFixture.id : null,
        fixture_status: 'live',
        dateISO: isoDay(0),
        time: new Date().toTimeString().slice(0, 5),
      },
      {
        key: 'dm_sco_hai_score',
        q: 'Scotland v Haiti — exact score',
        kind: 'scoreline',
        points: 8,
        answer: '2-0',
        options: [],
        fixture_id: scotlandOpener ? scotlandOpener.id : null,
        fixture_status: 'done',
        status: 'done',
        dateISO: isoDay(-4),
        time: '16:00',
      },
    ];
    base.predictions = demoMarkets.concat(base.predictions || []);

    var now = Date.now();
    base.demoChat = [
      { id: 'demo-chat-1', author_id: 'wheesht', author: 'Wheesht', team: 'confident', text: 'Matchday two is under way. Twenty entrants, one trophy, and several predictions already ageing badly.', ts: now - 58 * 60 * 1000 },
      { id: 'demo-chat-2', author_id: 'demo-3', author: 'Callum', team: 'BRA', text: 'Brazil at 1–1 with Scotland. I would like to formally request that we stop the count.', ts: now - 31 * 60 * 1000 },
      { id: 'demo-chat-3', author_id: 'demo-6', author: 'Maeve', team: 'MAR', text: 'Rory’s been quiet since the equaliser. Suspiciously quiet.', ts: now - 24 * 60 * 1000 },
      { id: 'demo-chat-4', author_id: 'demo-you', author: 'Rory', team: 'SCO', text: 'Just calmly preparing the victory GIF. Nothing to see here.', ts: now - 18 * 60 * 1000 },
      { id: 'demo-chat-5', author_id: 'demo-2', author: 'Priya', team: 'ESP', text: 'Meanwhile I’m top of predictions. Please update the company org chart accordingly.', ts: now - 11 * 60 * 1000 },
      { id: 'demo-chat-6', author_id: 'wheesht', author: 'Wheesht', team: 'mischievous', text: 'Priya leads on 55 points. Wheesht has checked twice. The rest of you may begin making excuses.', ts: now - 7 * 60 * 1000 },
    ];
    return base;
  };
})();
