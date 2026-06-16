/* ===========================================================================
   DESKTOP STAGE — live side panels beside the device.

   Runs only on wide screens (the phone view ignores all of this). It:
     • mounts two live React panels beside the device (pot/standings + the
       prediction league leaderboard).
   =========================================================================== */
(function () {
  if (typeof window === 'undefined') return;
  var DESKTOP = window.matchMedia && window.matchMedia('(min-width:561px)').matches;
  if (!DESKTOP) return;                       // phones stay clean

  var WCs = window.WC || {};
  var Ss = window.Store;
  var R = window.React;
  var RD = window.ReactDOM;
  if (!R || !RD) return;

  var h = R.createElement;

  /* ---- live panels ------------------------------------------------------ */
  function money(n) {
    return window.Store && window.Store.money
      ? window.Store.money(n)
      : '£' + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function Stat(props) {
    return h('div', { className: 'sp-stat' },
      h('span', { className: 'sp-stat__n' }, props.value),
      h('span', { className: 'sp-stat__l' }, props.label));
  }

  function LeftPanel() {
    var meta = (window.WC && window.WC.meta) || {};
    var pot = (window.WC && window.WC.POT) || 0;
    return h('div', { className: 'sp' },
      h('div', { className: 'sp-kicker' }, 'The Office Sweepstake'),
      h('div', { className: 'sp-title' }, 'World Cup 2026'),
      h('div', { className: 'sp-pot' }, money(pot)),
      h('div', { className: 'sp-pot__l' }, 'in the pot'),
      h('div', { className: 'sp-stats' },
        h(Stat, { value: meta.stillIn != null ? meta.stillIn : '—', label: 'still in' }),
        h(Stat, { value: meta.out != null ? meta.out : '—', label: 'out' }),
        h(Stat, { value: meta.teamsLeft != null ? meta.teamsLeft : '—', label: 'teams left' })));
  }

  function RightPanel() {
    var rows = (Ss && Ss.rankedByPred) ? Ss.rankedByPred().slice(0, 5) : [];
    return h('div', { className: 'sp sp--r' },
      h('div', { className: 'sp-kicker' }, 'On the record'),
      h('div', { className: 'sp-title' }, 'Prediction league'),
      h('div', { className: 'sp-lb' },
        rows.length === 0
          ? h('div', { className: 'sp-empty' }, 'No predictions banked yet.')
          : rows.map(function (p, i) {
              return h('div', { className: 'sp-row', key: p.id || i },
                h('span', { className: 'sp-rank' }, i + 1),
                h('span', { className: 'sp-av', style: { background: p.color || '#333' } }, p.initials || '?'),
                h('span', { className: 'sp-name' }, p.name),
                h('span', { className: 'sp-pts' }, (p.predScore || 0) + ' pts'));
            })));
  }

  function mount(id, Comp) {
    var el = document.getElementById(id);
    if (!el) return null;
    var root = RD.createRoot(el);
    root.render(h(Comp));
    return root;
  }

  var leftRoot = mount('stage-left', LeftPanel);
  var rightRoot = mount('stage-right', RightPanel);

  // Re-render panels when the store changes (picks, sign-ups, sync).
  if (Ss && Ss.subscribe) {
    Ss.subscribe(function () {
      if (leftRoot) leftRoot.render(h(LeftPanel));
      if (rightRoot) rightRoot.render(h(RightPanel));
    });
  }
})();
