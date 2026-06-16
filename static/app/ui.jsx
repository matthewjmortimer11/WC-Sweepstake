/* ===========================================================================
   UI KIT — sticker-album / match-programme components.
   Exported to window. Relies on CSS vars + classes defined in index.html.
   =========================================================================== */
const { useState, useEffect, useRef, useMemo } = React;

/* ---- Card ---------------------------------------------------------------- */
function Card(props) {
  const cls = 'wc-card' + (props.bordered ? ' wc-card--bd' : '') + (props.flat ? ' wc-card--flat' : '') + (props.className ? ' ' + props.className : '');
  return <div className={cls} style={props.style} onClick={props.onClick}>{props.children}</div>;
}

/* ---- Button -------------------------------------------------------------- */
function Btn(props) {
  const variant = props.variant || 'primary';
  return (
    <button type="button" disabled={props.disabled}
      onClick={props.onClick}
      className={'wc-btn wc-btn--' + variant + (props.block ? ' wc-btn--block' : '') + (props.sm ? ' wc-btn--sm' : '')}
      style={props.style}>
      {props.children}
    </button>
  );
}

/* ---- Flag chip ----------------------------------------------------------- */
function Flag(props) {
  const t = typeof props.team === 'string' ? window.WC.TEAMS[props.team] : props.team;
  const sz = props.size || 30;
  if (!t) return null;
  return <span className="wc-flag" style={{ fontSize: sz, lineHeight: 1 }} title={t.name}>{t.flag}</span>;
}

/* ---- Avatar (photo with initials fallback) ------------------------------- */
function Avatar(props) {
  const p = props.person || {};
  const sz = props.size || 36;
  const url = (!p.isYou && window.Store && window.Store.avatarUrl) ? window.Store.avatarUrl(p) : null;
  const [broken, setBroken] = useState(false);
  useEffect(function () { setBroken(false); }, [url]);
  if (url && !broken) {
    return (
      <span className="wc-avatar" style={{ width: sz, height: sz, padding: 0, overflow: 'hidden', background: p.color, opacity: (props.dim ? 0.4 : 1) }}>
        <img src={url} alt="" onError={function () { setBroken(true); }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </span>
    );
  }
  return (
    <span className="wc-avatar" style={{
      width: sz, height: sz, background: p.isYou ? 'var(--ink)' : p.color,
      fontSize: sz * 0.36, opacity: (props.dim ? 0.4 : 1),
    }}>{p.isYou ? 'YOU' : p.initials}</span>
  );
}

/* ---- Chip ---------------------------------------------------------------- */
function Chip(props) {
  return <span className={'wc-chip' + (props.tone ? ' wc-chip--' + props.tone : '')} style={props.style}>{props.children}</span>;
}

/* ---- Achievement badges (computed client-side, no new DB) ---------------- */
function badgesFor(p) {
  const S = window.Store, WC = window.WC;
  const out = [];
  if (!p || !S) return out;
  if (p.isOrganiser) out.push({ icon: '🛡️', label: 'Organiser' });
  const complete = function(m) {
    const v = p.picks && p.picks[m.key];
    if (v == null) return false;
    if (m.kind === 'team2') return Array.isArray(v) && v.length === 2;
    if (m.kind === 'number') return v !== '' && isFinite(Number(v));
    if (m.kind === 'scoreline') return typeof v === 'string' && /^\d+-\d+$/.test(v);
    return true;
  };
  const unavailable = function(m) {
    if (!m || String(m.key || '').indexOf('dm_') !== 0) return false;
    const st = String(m.fixture_status || m.fixtureStatus || m.status || '').toLowerCase();
    return ['live', 'halftime', 'half_time', 'half-time', 'inplay', 'in_play', 'in-progress', 'inprogress', 'paused', 'done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(st) >= 0 && !complete(m);
  };
  const markets = S.visiblePredictions ? S.visiblePredictions().filter(function(m) { return !unavailable(m); }) : [];
  const total = markets.length;
  const made = markets.filter(complete).length;
  if (total && made >= total) out.push({ icon: '🎯', label: 'Full card', tone: 'green' });
  const score = S.predScoreOf ? S.predScoreOf(p) : 0;
  if (score > 0) out.push({ icon: '✅', label: score + ' pts', tone: 'green' });
  let rank = 0, uniqueRank = false;
  if (S.rankedByPred) {
    const rows = S.rankedByPred();
    const r = rows.find(function (x) { return x.id === p.id; });
    rank = r ? r.predRank : 0;
    uniqueRank = !!(r && score > 0 && rows.filter(function (x) { return x.predScore === r.predScore; }).length === 1);
  }
  if (uniqueRank && rank === 1) out.push({ icon: '🥇', label: 'Top of the league', tone: 'yellow' });
  else if (uniqueRank && rank === 2) out.push({ icon: '🥈', label: '2nd overall', tone: 'yellow' });
  else if (uniqueRank && rank === 3) out.push({ icon: '🥉', label: '3rd overall', tone: 'yellow' });
  const t = WC.TEAMS[p.team];
  if (t) out.push(t.alive ? { icon: '🟢', label: 'Team still in', tone: 'green' } : { icon: '💀', label: 'Knocked out', tone: 'red' });
  const fav = S.favTeam ? S.favTeam(p) : null;
  if (fav) out.push({ icon: fav.flag, label: fav.name + ' fan', tone: 'ghost' });
  return out;
}
function Badges(props) {
  const list = badgesFor(props.person);
  if (!list.length) return null;
  const shown = props.max ? list.slice(0, props.max) : list;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {shown.map(function (b, i) {
        return <span key={i} className={'wc-chip' + (b.tone ? ' wc-chip--' + b.tone : '')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>{b.icon}</span>{b.label}
        </span>;
      })}
    </div>
  );
}

/* ---- Stamp (ELIMINATED / QUALIFIED) -------------------------------------- */
function Stamp(props) {
  const tone = props.tone || 'red';
  return <span className={'wc-stamp wc-stamp--' + tone} style={Object.assign({ transform: 'rotate(' + (props.rotate == null ? -8 : props.rotate) + 'deg)' }, props.style)}>{props.children}</span>;
}

/* ---- Progress ring ------------------------------------------------------- */
function ProgressRing(props) {
  const size = props.size || 46, sw = props.stroke || 6;
  const r = (size - sw) / 2, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, props.value));
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(26,26,26,.12)" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={props.color || 'var(--red)'} strokeWidth={sw}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
        transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      {props.children && <foreignObject x="0" y="0" width={size} height={size}>
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.28 }}>{props.children}</div>
      </foreignObject>}
    </svg>
  );
}

/* ---- Segment comparison bar (animated) ----------------------------------- */
function SegmentBar(props) {
  const a = props.a, b = props.b; // {name, value 0-100}
  const total = a.value + b.value || 1;
  const aw = Math.round(100 * a.value / total);
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(function () {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) setShown(true); }, { threshold: 0.4 });
    io.observe(el); return function () { io.disconnect(); };
  }, []);
  const aWin = a.value >= b.value;
  return (
    <div ref={ref} className="wc-seg">
      <div className="wc-seg__head">
        <span><b style={{ color: aWin ? 'var(--ink)' : 'inherit' }}>{a.name}</b> {a.value}%</span>
        <span>{b.value}% <b style={{ color: !aWin ? 'var(--ink)' : 'inherit' }}>{b.name}</b></span>
      </div>
      <div className="wc-seg__track">
        <div className="wc-seg__fill" style={{ width: (shown ? aw : 50) + '%' }} />
        <div className="wc-seg__mid" style={{ left: (shown ? aw : 50) + '%' }} />
      </div>
    </div>
  );
}

/* ---- Wheesht speech block ------------------------------------------------ */
function WheeshtSays(props) {
  return (
    <div className={'wc-says' + (props.compact ? ' wc-says--compact' : '')}>
      <div className="wc-says__av"><window.Wheesht mood={props.mood || 'neutral'} size={props.avSize || 64} animate={props.animate} /></div>
      <div className="wc-says__bubble">
        {props.label && <div className="wc-says__name">Wheesht{props.label === true ? '' : ' · ' + props.label}</div>}
        <div className="wc-says__text">{props.children}</div>
      </div>
    </div>
  );
}

/* ---- Section heading ----------------------------------------------------- */
function SectionHead(props) {
  return <div className="wc-sec"><h3>{props.children}</h3>{props.aside && <span>{props.aside}</span>}</div>;
}

/* ---- Toast layer (imperative: window.wcToast(msg, mood)) ----------------- */
function ToastLayer() {
  const [items, setItems] = useState([]);
  function dismiss(id) { setItems(function (xs) { return xs.filter(function (x) { return x.id !== id; }); }); }
  useEffect(function () {
    window.wcToast = function (text, mood) {
      const id = Date.now() + Math.random();
      setItems(function (xs) { return xs.concat([{ id: id, text: text, mood: mood || 'neutral' }]); });
      setTimeout(function () { setItems(function (xs) { return xs.filter(function (x) { return x.id !== id; }); }); }, 4800);
    };
  }, []);
  return (
    <div className="wc-toasts">
      {items.map(function (t) {
        return <div key={t.id} className="wc-toast">
          <window.Wheesht mood={t.mood} size={40} />
          <div className="wc-toast__txt" style={{flex:1}}>{t.text}</div>
          <button onClick={function(){ dismiss(t.id); }} style={{background:'none',border:'none',color:'rgba(255,255,255,.55)',cursor:'pointer',fontSize:22,fontWeight:300,lineHeight:1,padding:'0 0 0 8px',flexShrink:0,fontFamily:'sans-serif'}}>×</button>
        </div>;
      })}
    </div>
  );
}

/* ---- Confetti layer (imperative: window.wcConfetti(opts)) ---------------- */
function ConfettiLayer() {
  const cv = useRef(null);
  useEffect(function () {
    const canvas = cv.current; const ctx = canvas.getContext('2d');
    let parts = []; let raf = null;
    function resize() { const r = canvas.parentNode.getBoundingClientRect(); canvas.width = r.width; canvas.height = r.height; }
    resize(); window.addEventListener('resize', resize);
    const colors = ['#F5C800', '#E8272A', '#1A1A1A', '#1a7a44', '#0a3b8c', '#fff'];
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(function (p) {
        p.vy += 0.18; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.5);
        ctx.restore();
      });
      parts = parts.filter(function (p) { return p.y < canvas.height + 40; });
      if (parts.length) raf = requestAnimationFrame(tick); else { raf = null; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
    window.wcConfetti = function (opts) {
      opts = opts || {}; resize();
      const mul = (window.__celMul == null ? 1 : window.__celMul);
      if (mul <= 0) return;
      const cols = opts.colors || colors;
      const n = Math.round((opts.count || 140) * mul);
      const ox = canvas.width * (opts.x == null ? 0.5 : opts.x);
      const oy = canvas.height * (opts.y == null ? 0.42 : opts.y);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 4 + Math.random() * 9;
        parts.push({ x: ox, y: oy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 4, s: 7 + Math.random() * 9, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0] });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    return function () { window.removeEventListener('resize', resize); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={cv} className="wc-confetti" />;
}

/* ---- Haptic feedback (Android vibrate + iOS 18+ PWA navigator.vibrate) -- */
window.wcHaptic = function(type) {
  try {
    if (!navigator.vibrate) return;
    var p = { light: [8], medium: [18], success: [10, 55, 14] };
    navigator.vibrate(p[type] || p.light);
  } catch(e) {}
};

/* ---- Leaderboard row-movement CSS (injected once) ----------------------- */
(function() {
  if (document.getElementById('wc-lb-anim')) return;
  var s = document.createElement('style');
  s.id = 'wc-lb-anim';
  s.textContent = [
    '@keyframes lb-pop-up{0%{box-shadow:0 0 0 2.5px var(--green),0 0 0 5px rgba(26,122,68,.15)}to{box-shadow:0 0 0 0 transparent}}',
    '@keyframes lb-pop-dn{0%{box-shadow:0 0 0 2.5px var(--red),0 0 0 5px rgba(232,39,42,.12)}to{box-shadow:0 0 0 0 transparent}}',
    '.lb-up{animation:lb-pop-up 1s cubic-bezier(.2,.8,.2,1) forwards}',
    '.lb-dn{animation:lb-pop-dn 1s cubic-bezier(.2,.8,.2,1) forwards}',
  ].join('');
  document.head.appendChild(s);
})();

/* ---- Google Sign-In button (rendered by GIS library) -------------------- */
// Renders the official Google "Sign in with Google" button into a div.
// Polls until the GIS library is ready (loaded async). Pass `onToken(idToken)`
// as a prop; it fires once with the credential when the user authenticates.
function GoogleSignInButton({onToken, opts}) {
  const S = window.Store;
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!window.WC_GOOGLE_CLIENT_ID || !S) return;
    S.setGoogleCallback(function(token) {
      S.clearGoogleCallback();
      onToken(token);
    });
    var tries = 0;
    function tryRender() {
      if (ref.current && S.renderGoogleButton && S.renderGoogleButton(ref.current, opts || {})) return;
      if (tries++ < 20) setTimeout(tryRender, 200);
    }
    tryRender();
    return function() { S.clearGoogleCallback(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!window.WC_GOOGLE_CLIENT_ID) return null;
  return <div ref={ref} style={{minHeight: 44, marginTop: 10}} />;
}

/* ---- bottom-sheet / modal chrome ---------------------------------------- *
   On phones (and the phone-mockup view) overlays slide up as a bottom sheet.
   On the desktop "deck" layout a bottom sheet anchored to the scrolling
   centre column feels stuck and the backdrop can't be clicked off — so there
   we render a centred, viewport-fixed modal instead. Returns the styles +
   animation class for the outer wrap, the backdrop and the sheet itself. */
function wcSheetChrome(zIndex) {
  var deck = typeof document !== 'undefined' && document.body.classList.contains('deck');
  return {
    deck: deck,
    cls: deck ? 'pop' : 'rise',
    wrap: {
      position: 'fixed', inset: 0, zIndex: zIndex || 70, display: 'flex',
      flexDirection: 'column', boxSizing: 'border-box',
      justifyContent: deck ? 'center' : 'flex-end',
      alignItems: deck ? 'center' : 'stretch',
      padding: deck ? '24px' : 0,
    },
    backdrop: { position: 'fixed', inset: 0, background: 'rgba(26,26,26,.45)' },
    sheet: deck
      ? { position: 'relative', background: 'var(--bg)', borderRadius: 24, padding: '22px 22px 24px',
          boxShadow: '0 30px 80px -22px rgba(0,0,0,.5), 0 0 0 2px var(--ink)',
          width: 'min(460px, 100%)', maxHeight: '86dvh', overflowY: 'auto',
          WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }
      : { position: 'relative', background: 'var(--bg)', borderRadius: '26px 26px 0 0', padding: '18px 18px 26px',
          boxShadow: '0 -20px 50px rgba(0,0,0,.3)', maxHeight: '88dvh', overflowY: 'auto',
          WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' },
  };
}

Object.assign(window, {
  Card: Card, Btn: Btn, Flag: Flag, Avatar: Avatar, Chip: Chip, Stamp: Stamp,
  ProgressRing: ProgressRing, SegmentBar: SegmentBar, WheeshtSays: WheeshtSays,
  SectionHead: SectionHead, ToastLayer: ToastLayer, ConfettiLayer: ConfettiLayer,
  Badges: Badges, GoogleSignInButton: GoogleSignInButton, wcSheetChrome: wcSheetChrome,
});
