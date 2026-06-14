/* ===========================================================================
   DESKTOP STAGE — live side panels beside the device.

   Runs only on wide screens (the phone view ignores all of this). It:
     • mounts two live React panels beside the device (pot/standings + the
       prediction league leaderboard),
     • wires a persisted on/off toggle for the ambient backdrop motion.
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

  /* ---- motion toggle (persisted) ---------------------------------------- */
  var MK = 'wheesht_motion_v1';
  function motionOn() { try { return localStorage.getItem(MK) !== 'off'; } catch (e) { return true; } }
  function applyMotion() { document.body.classList.toggle('motion-off', !motionOn()); }
  applyMotion();

  /* ---- toggle button ---------------------------------------------------- */
  var btn = document.getElementById('stage-toggle');
  if (btn) {
    function label() { return (motionOn() ? '⚽  Animation on' : '⚽  Animation off'); }
    btn.textContent = label();
    btn.addEventListener('click', function () {
      try { localStorage.setItem(MK, motionOn() ? 'off' : 'on'); } catch (e) {}
      applyMotion();
      btn.textContent = label();
    });
  }

  /* ---- ambient overhead-kick scene -------------------------------------- */
  var fx = document.getElementById('stage-fx');
  if (fx && !fx.innerHTML) {
    fx.innerHTML = [
      '<svg viewBox="0 0 520 260" role="img" aria-label="Animated overhead kick" style="display:block;width:100%;height:auto;overflow:visible">',
      '<defs>',
      '<linearGradient id="kickPitch" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a7a44" stop-opacity=".12"/><stop offset="1" stop-color="#f5c800" stop-opacity=".18"/></linearGradient>',
      '</defs>',
      '<path d="M20 210C132 244 308 246 496 198" fill="none" stroke="#f5c800" stroke-opacity=".18" stroke-width="3"/>',
      '<path class="kick-arc" d="M178 149C254 64 345 70 438 136" fill="none" stroke="#f5c800" stroke-width="3" stroke-dasharray="7 9" stroke-linecap="round"/>',
      '<g class="kick-net" fill="none" stroke="#e9e2d2" stroke-opacity=".38" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M392 78h78v96h-78z"/>',
      '<path d="M392 78l-26 26v96l26-26M470 78l-26 26v96l26-26"/>',
      '<path d="M392 104h78M392 130h78M392 156h78M418 78v96M444 78v96"/>',
      '</g>',
      '<text class="kick-goal" x="346" y="66" fill="#f5c800" font-family="Bricolage Grotesque, sans-serif" font-size="38" font-weight="800" letter-spacing="2">GOAL</text>',
      '<circle class="kick-ball" cx="178" cy="149" r="13" fill="#fff" stroke="#1a1a1a" stroke-width="4"/>',
      '<g class="kick-player" fill="none" stroke-linecap="round" stroke-linejoin="round">',
      '<circle cx="138" cy="112" r="17" fill="#f5c800" stroke="#1a1a1a" stroke-width="5"/>',
      '<path d="M148 132l30 31" stroke="#f5c800" stroke-width="12"/>',
      '<path d="M148 132l30 31" stroke="#1a1a1a" stroke-width="5"/>',
      '<path d="M158 144l-42 3M168 154l-18 45" stroke="#e9e2d2" stroke-width="9"/>',
      '<path class="kick-leg" d="M176 160l-50-58" stroke="#e8272a" stroke-width="12"/>',
      '<path class="kick-leg" d="M176 160l-50-58" stroke="#1a1a1a" stroke-width="5"/>',
      '</g>',
      '<ellipse cx="158" cy="220" rx="78" ry="15" fill="url(#kickPitch)"/>',
      '</svg>'
    ].join('');
  }

  /* ---- live panels ------------------------------------------------------ */
  function money(n) { return '£' + (n || 0).toLocaleString('en-GB'); }

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
