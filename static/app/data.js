/* ===========================================================================
   DATA LAYER — builds window.WC from server-injected window.WC_DATA.
   The Python backend (main.py) generates WC_DATA and injects it as a
   <script> tag before this file loads.
   =========================================================================== */
(function () {
  var d = window.WC_DATA;
  if (!d) { console.error('WC_DATA not injected by server'); return; }

  // Build lookup maps
  var TEAMS = {};
  var TEAM_LIST = d.teams.map(function (t) {
    TEAMS[t.code] = t;
    return t;
  });

  var PEOPLE = d.people;
  var YOU = PEOPLE[0]; // YOU is always index 0

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

  window.WC = {
    TEAMS: TEAMS,
    TEAM_LIST: TEAM_LIST,
    GROUPS: GROUPS,
    R16: d.r16,
    FIXTURES: d.fixtures || [],
    PEOPLE: PEOPLE,
    YOU: YOU,
    ownersOf: ownersOf,
    SEGMENTS: SEGMENTS,
    rate: rate,
    FEE: d.fee,
    POT: d.pot,
    PAYOUTS: d.payouts,
    LINES: d.lines,
    predictions: d.predictions || [],
    PREDICTIONS: d.predictions || [],
    meta: d.meta,
  };
})();
