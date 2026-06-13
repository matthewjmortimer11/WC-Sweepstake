/* ===========================================================================
   DESKTOP STAGE — live side panels + the McTominay overhead-kick flourish.

   Runs only on wide screens (the phone view ignores all of this). It:
     • mounts two live React panels beside the device (pot/standings + the
       prediction league leaderboard),
     • injects an SVG bicycle-kick animation that replays as a periodic
       flourish (a nod to McTominay v Denmark),
     • wires a persisted on/off toggle for the motion.
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

  /* ---- the overhead-kick scene (SVG injected once) ---------------------- */
  var KICK_SVG =
    '<svg viewBox="0 0 500 260" width="100%" height="100%" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="kpitch" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#1a7a44" stop-opacity="0"/>' +
          '<stop offset="1" stop-color="#1a7a44" stop-opacity=".30"/>' +
        '</linearGradient>' +
      '</defs>' +
      // pitch glow
      '<ellipse cx="250" cy="248" rx="240" ry="26" fill="url(#kpitch)"/>' +
      // goal frame + net (right side)
      '<g class="kick-net" stroke="#fff" stroke-opacity=".85" fill="none" stroke-width="3" stroke-linecap="round">' +
        '<path d="M388 70 H474 V196 H388" stroke-width="5"/>' +
        '<g stroke-width="1.4" stroke-opacity=".45">' +
          '<path d="M404 72 V194 M422 72 V194 M440 72 V194 M458 72 V194"/>' +
          '<path d="M390 92 H474 M390 116 H474 M390 140 H474 M390 164 H474"/>' +
        '</g>' +
      '</g>' +
      // motion arc of the ball
      '<path class="kick-arc" d="M196 138 Q330 60 430 120" stroke="#F5C800" stroke-opacity=".5" stroke-width="3" fill="none" stroke-dasharray="3 9" stroke-linecap="round"/>' +
      // player — bold navy scissor-kick silhouette
      '<g class="kick-player" stroke="#0a2a5e" stroke-width="11" stroke-linecap="round" fill="none">' +
        '<circle cx="108" cy="150" r="12" fill="#0a2a5e" stroke="none"/>' +    // head
        '<path d="M120 150 H150"/>' +                                          // torso
        '<path d="M126 150 L118 172"/>' +                                      // balancing arm
        '<path class="kick-support" d="M150 150 L160 172 L150 188"/>' +        // support leg
        '<g class="kick-leg"><path d="M150 150 L182 150 L200 136"/></g>' +     // striking leg
      '</g>' +
      // the ball
      '<g class="kick-ball"><circle cx="200" cy="134" r="9" fill="#fff" stroke="#1A1A1A" stroke-width="2.5"/>' +
        '<path d="M200 127 l5 4 -2 6 -6 0 -2 -6 z" fill="#1A1A1A"/></g>' +
      // GOAL flash
      '<text class="kick-goal" x="250" y="44" text-anchor="middle" font-family="Bricolage Grotesque,sans-serif" font-weight="800" font-size="34" fill="#F5C800" letter-spacing="1">GOAAL!</text>' +
    '</svg>';

  var fx = document.getElementById('stage-fx');
  if (fx) fx.innerHTML = KICK_SVG;

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
