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
    WC.PAYOUTS = d.payouts;
    WC.LINES = d.lines;
    WC.predictions = d.predictions || [];
    WC.PREDICTIONS = d.predictions || [];
    WC.meta = d.meta;
    WC.league = d.league || null;
    window.WC = WC;
  }

  build();
  window.__rebuildWC = build;
})();
