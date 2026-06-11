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

/* ---- Avatar (initials) --------------------------------------------------- */
function Avatar(props) {
  const p = props.person;
  const sz = props.size || 36;
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
  useEffect(function () {
    window.wcToast = function (text, mood) {
      const id = Date.now() + Math.random();
      setItems(function (xs) { return xs.concat([{ id: id, text: text, mood: mood || 'neutral' }]); });
      setTimeout(function () { setItems(function (xs) { return xs.filter(function (x) { return x.id !== id; }); }); }, 4200);
    };
  }, []);
  return (
    <div className="wc-toasts">
      {items.map(function (t) {
        return <div key={t.id} className="wc-toast">
          <window.Wheesht mood={t.mood} size={40} />
          <div className="wc-toast__txt">{t.text}</div>
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

Object.assign(window, {
  Card: Card, Btn: Btn, Flag: Flag, Avatar: Avatar, Chip: Chip, Stamp: Stamp,
  ProgressRing: ProgressRing, SegmentBar: SegmentBar, WheeshtSays: WheeshtSays,
  SectionHead: SectionHead, ToastLayer: ToastLayer, ConfettiLayer: ConfettiLayer,
});
