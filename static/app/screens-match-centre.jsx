/* ===========================================================================
   MATCH CENTRE — fixtures as a live, personal, 10-second read.

   Every fixture is shown with its status (upcoming / live / finished), a live
   indicator + ticking kick-off countdown, the current score, the user's stake
   (their drawn team + any prediction picks riding on a team in the match),
   the match importance, and the prediction points in play. Live group games
   also show the provisional standings impact ("if it ends now…").

   All derived client-side from WC.FIXTURES + WC.PREDICTIONS + Store.allSync().
   Read-only — no admin writes, so no admin-token path is needed here.
   Helpers are mc-prefixed to stay collision-free in the shared script scope.
   =========================================================================== */
const WCmc = window.WC;
const Wmc = window.Wheesht;
const Smc = window.Store;
const { Card: Cmc, Btn: Bmc, Flag: Fmc, Chip: Chmc, WheeshtSays: Saysmc, SectionHead: SHmc } = window;
const { useState: mcState, useEffect: mcEffect, useRef: mcRef } = React;

function mcTeam(code) { return WCmc.TEAMS[code] || { code: code || 'TBD', name: code || 'To be decided', flag: '🏳️', group: '?' }; }
function mcName(code) { return mcTeam(code).name; }
function mcStatus(f) { return f.status || 'upcoming'; }
function mcOrd(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function mcStageRank(st) { return ({ final: 6, sf: 5, qf: 4, r16: 3, r32: 2, group: 1 })[st] || 1; }
function mcStageLabel(f) {
  const st = f.stage || 'group';
  if (st === 'group') return 'Group ' + f.group;
  const labels = (WCmc.meta && WCmc.meta.stageLabels) || {};
  return labels[st] || st.toUpperCase();
}

function mcOwned() {
  const set = {};
  (Smc ? Smc.allSync() : (WCmc.PEOPLE || [])).forEach(p => { set[p.team] = (set[p.team] || 0) + 1; });
  return set;
}

/* ---- predictions: which of the user's picks ride on this match? ---------- */
function mcResolved(m) {
  if (!m) return false;
  if (m.kind === 'team2') return Array.isArray(m.answer) && m.answer.length > 0 && m.answer.every(x => x != null);
  return m.answer != null;
}
function mcMarkets() {
  const hidden = (WCmc.meta && WCmc.meta.hiddenPredictions) || [];
  return (WCmc.predictions || (Smc && Smc.PREDICTIONS) || []).filter(m => hidden.indexOf(m.key) < 0);
}
function mcStakeLabel(key, who) {
  switch (key) {
    case 'winner': return 'To win it: ' + who;
    case 'final': return 'Finalist: ' + who;
    case 'surprise': return 'Surprise: ' + who;
    case 'flop': return 'Flop: ' + who;
    case 'cleanSheets': return 'Clean sheets: ' + who;
    case 'goldenBoot': return 'Golden Boot: ' + who;
    case 'youngPlayer': return 'Young player: ' + who;
    case 'scotland': return 'Scotland: ' + who;
    case 'england': return 'England: ' + who;
    default: return who;
  }
}
function mcStake(me, f) {
  if (!me || !me.picks) return { items: [], pts: 0 };
  const picks = me.picks; const items = [];
  mcMarkets().forEach(m => {
    const pick = picks[m.key]; const resolved = mcResolved(m); let who = null;
    if (m.kind === 'team') { if (pick && (pick === f.a || pick === f.b)) who = mcName(pick); }
    else if (m.kind === 'team2') { if (Array.isArray(pick)) { const c = pick.find(x => x === f.a || x === f.b); if (c) who = mcName(c); } }
    else if (m.kind === 'player') {
      if (pick) { const o = (m.options || []).find(x => x && x.id === pick); if (o && (o.team === f.a || o.team === f.b)) who = o.name; }
    }
    else if (m.kind === 'stage') {
      const nation = m.key === 'scotland' ? 'SCO' : m.key === 'england' ? 'ENG' : null;
      if (nation && (f.a === nation || f.b === nation) && pick != null) who = String(pick);
    }
    if (who != null) items.push({ key: m.key, label: mcStakeLabel(m.key, who), pts: m.points, resolved: resolved });
  });
  const pts = items.filter(x => !x.resolved).reduce((a, x) => a + x.pts, 0);
  return { items, pts };
}

/* ---- match importance --------------------------------------------------- */
function mcImportance(f, me, stakePts, owned) {
  const st = f.stage || 'group';
  let score = ({ final: 100, sf: 82, qf: 66, r16: 52, r32: 42, group: 22 })[st] || 22;
  if (st === 'group') score += ((f.matchday || 1) - 1) * 5;
  const mine = !!(me && (f.a === me.team || f.b === me.team));
  if (mine) score += 35;
  if (stakePts > 0) score += Math.min(25, stakePts);
  score += Math.min(12, ((owned[f.a] || 0) + (owned[f.b] || 0)) * 4);
  let tier, label, flames;
  if (mine) { tier = 'you'; label = 'Your team'; flames = 3; }
  else if (score >= 80) { tier = 'must'; label = 'Must-watch'; flames = 3; }
  else if (score >= 55) { tier = 'big'; label = 'Big one'; flames = 2; }
  else if (score >= 35) { tier = 'worth'; label = 'Worth a watch'; flames = 1; }
  else { tier = 'routine'; label = 'Routine'; flames = 0; }
  return { score, tier, label, flames, mine };
}
function impTone(tier) { return tier === 'you' || tier === 'must' ? 'red' : tier === 'big' ? 'yellow' : 'ghost'; }

/* ---- standings impact (group games) ------------------------------------- */
function mcTally(teams, fixtures) {
  const rec = {}; teams.forEach(t => rec[t.code] = { code: t.code, team: t, Pts: 0, GF: 0, GA: 0 });
  fixtures.forEach(f => {
    if (!f.score || f.score[0] == null || f.score[1] == null) return;
    const A = rec[f.a], B = rec[f.b]; if (!A || !B) return;
    const ga = f.score[0], gb = f.score[1];
    A.GF += ga; A.GA += gb; B.GF += gb; B.GA += ga;
    if (ga > gb) A.Pts += 3; else if (gb > ga) B.Pts += 3; else { A.Pts++; B.Pts++; }
  });
  const ranked = Object.keys(rec).map(k => rec[k]).sort((a, b) => {
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;
    const gda = a.GF - a.GA, gdb = b.GF - b.GA;
    if (gdb !== gda) return gdb - gda;
    if (b.GF !== a.GF) return b.GF - a.GF;
    return a.team.name.localeCompare(b.team.name);
  });
  ranked.forEach((r, i) => r.pos = i + 1);
  return ranked;
}
function mcImpact(f) {
  const st = f.stage || 'group';
  if (st !== 'group') {
    if (f.status === 'done' && f.score) {
      const w = f.score[0] > f.score[1] ? f.a : f.score[1] > f.score[0] ? f.b : null;
      if (w) return { type: 'ko', text: mcName(w) + ' advance · ' + mcName(w === f.a ? f.b : f.a) + ' are out' };
    }
    return { type: 'ko', text: 'Winner advances · loser is out' };
  }
  if (!f.score || f.score[0] == null || f.score[1] == null) return null;
  const teams = WCmc.TEAM_LIST.filter(t => t.group === f.group);
  const groupFx = (WCmc.FIXTURES || []).filter(x => x.stage === 'group' && x.group === f.group);
  const doneOther = groupFx.filter(x => x.id !== f.id && x.status === 'done' && x.score && x.score[0] != null);
  const before = mcTally(teams, doneOther);
  const after = mcTally(teams, doneOther.concat([{ a: f.a, b: f.b, score: f.score }]));
  const pb = {}, pa = {}; before.forEach(r => pb[r.code] = r.pos); after.forEach(r => pa[r.code] = r.pos);
  function line(code) {
    const posA = pa[code], posB = pb[code], d = posB - posA;
    return { name: mcName(code), pos: posA, arrow: d > 0 ? '▲' + d : d < 0 ? '▼' + Math.abs(d) : '–', d: d, qualify: posA <= 2 };
  }
  return { type: 'group', a: line(f.a), b: line(f.b) };
}

/* ---- kick-off countdown ------------------------------------------------- */
function mcKickoffMs(f) {
  try {
    const tm = (f.time && /^\d{2}:\d{2}/.test(f.time)) ? f.time.slice(0, 5) : '00:00';
    const t = new Date((f.dateISO || '') + 'T' + tm + ':00').getTime();
    return isFinite(t) ? t : null;
  } catch (e) { return null; }
}
function mcFmt(ms) {
  if (ms == null) return '';
  if (ms <= 0) return 'Kicking off';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}
function useCountdown(target) {
  const [, tick] = mcState(0);
  mcEffect(() => {
    if (target == null) return;
    const iv = setInterval(() => tick(x => x + 1), 1000);
    return () => clearInterval(iv);
  }, [target]);
  return target == null ? null : target - Date.now();
}

/* ---- live score with goal flash ----------------------------------------- */
function LiveScore(props) {
  const f = props.f;
  const a = f.score ? f.score[0] : 0, b = f.score ? f.score[1] : 0;
  const prev = mcRef({ a: a, b: b });
  const [flash, setFlash] = mcState(null);
  mcEffect(() => {
    if (a > prev.current.a) { setFlash('a'); }
    else if (b > prev.current.b) { setFlash('b'); }
    prev.current = { a: a, b: b };
    if (a > 0 || b > 0) { /* no-op */ }
  }, [a, b]);
  mcEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 2400); return () => clearTimeout(t); }, [flash]);
  const cell = (v, side) => (
    <span className={flash === side ? 'pop' : ''} style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 30, lineHeight: 1, color: flash === side ? 'var(--red)' : 'var(--ink)' }}>{v}</span>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{cell(a, 'a')}<span className="dh" style={{ fontSize: 18, color: 'var(--ink2)' }}>:</span>{cell(b, 'b')}</div>
      {flash ? <span style={{ fontSize: 9.5, fontWeight: 900, color: 'var(--red)', letterSpacing: '.08em', marginTop: 2 }}>⚽ GOAL!</span>
        : <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--red)', letterSpacing: '.06em', marginTop: 2 }}>LIVE</span>}
    </div>
  );
}

/* ---- team column -------------------------------------------------------- */
function MCTeamCol(props) {
  const t = mcTeam(props.code); const owners = props.owners;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 0, opacity: props.dim ? .45 : 1 }}>
      <span style={{ fontSize: 32, lineHeight: 1, filter: props.dim ? 'grayscale(1)' : 'none' }}>{t.flag}</span>
      <div style={{ fontWeight: 800, fontSize: 13, textAlign: 'center', lineHeight: 1.1, textDecoration: props.lose ? 'line-through' : 'none' }}>{t.name}</div>
      {owners > 0 && <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--red)' }}>{owners} in draw</div>}
    </div>
  );
}

/* ---- the match card ----------------------------------------------------- */
function MatchCard(props) {
  const f = props.f, me = props.me, owned = props.owned, onWhatIf = props.onWhatIf;
  const st = mcStatus(f), live = st === 'live', done = st === 'done';
  const stake = mcStake(me, f);
  const imp = mcImportance(f, me, stake.pts, owned);
  const ms = mcKickoffMs(f);
  const soon = !done && !live && ms != null && (ms - Date.now() < 24 * 3600 * 1000) && (ms - Date.now() > -3600 * 1000);
  const remaining = useCountdown(soon ? ms : null);
  const impact = (live || done) ? mcImpact(f) : null;
  const oa = owned[f.a] || 0, ob = owned[f.b] || 0;
  const aw = done && f.score && f.score[0] > f.score[1];
  const bw = done && f.score && f.score[1] > f.score[0];

  const border = live ? '2.5px solid var(--red)' : imp.mine ? '2.5px solid var(--ink)' : '2px solid var(--line)';
  const shadow = live ? '0 0 0 4px rgba(232,39,42,.12)' : imp.mine ? '0 4px 0 var(--shadow)' : 'none';

  return (
    <Cmc flat style={{ padding: '12px 13px', marginBottom: 9, border: border, boxShadow: shadow }}>
      {/* header: context + importance · status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
          <Chmc tone="ghost">{mcStageLabel(f)}</Chmc>
          {f.stage === 'group' && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>MD{f.matchday}</span>}
          <Chmc tone={impTone(imp.tier)} style={{ whiteSpace: 'nowrap' }}>{'🔥'.repeat(imp.flames) || '·'} {imp.label}</Chmc>
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
          {live ? <span className="mc-livedot" style={{ fontSize: 11, fontWeight: 900, color: 'var(--red)', whiteSpace: 'nowrap' }}>● LIVE</span>
            : done ? <Chmc tone="ink">FT</Chmc>
              : soon ? <Chmc tone="yellow" style={{ whiteSpace: 'nowrap' }}>⏱ {mcFmt(remaining)}</Chmc>
                : <span style={{ fontSize: 12, fontWeight: 800 }}>{f.time}</span>}
        </div>
      </div>

      {/* teams + score / countdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MCTeamCol code={f.a} owners={oa} lose={bw} dim={bw} />
        <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 56 }}>
          {live ? <LiveScore f={f} />
            : done && f.score ? <span className="dh" style={{ fontSize: 30 }}>{f.score[0]}<span style={{ color: 'var(--ink2)', fontSize: 18 }}>:</span>{f.score[1]}</span>
              : <div><div className="dh" style={{ fontSize: 18, color: 'var(--ink2)' }}>v</div>{soon && <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink2)', marginTop: 2 }}>{mcFmt(remaining)}</div>}</div>}
        </div>
        <MCTeamCol code={f.b} owners={ob} lose={aw} dim={aw} />
      </div>

      {/* points in play + your stake */}
      {(stake.pts > 0 || imp.mine || stake.items.length > 0) &&
        <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1.5px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {imp.mine && <Chmc tone="yellow">⭐ Your team</Chmc>}
            {stake.pts > 0 && <Chmc tone="green">🎯 {stake.pts} pts in play</Chmc>}
            {stake.items.map((s, i) => (
              <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: s.resolved ? 'var(--ink2)' : 'var(--ink)', background: 'var(--bg)', border: '1.5px solid var(--line)', borderRadius: 999, padding: '3px 8px', textDecoration: s.resolved ? 'line-through' : 'none' }}>{s.label}</span>
            ))}
          </div>
        </div>}

      {/* standings impact */}
      {impact && impact.type === 'group' &&
        <div style={{ marginTop: 10, background: 'var(--bg)', borderRadius: 11, padding: '9px 11px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: 5 }}>
            {live ? 'If it ends now · Group ' + f.group : 'Group ' + f.group + ' impact'}
          </div>
          {[impact.a, impact.b].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, padding: '1px 0' }}>
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
              {l.qualify && <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--green)' }}>QUALIFYING</span>}
              <span className="dh" style={{ fontSize: 13, width: 34, textAlign: 'right' }}>{mcOrd(l.pos)}</span>
              <span style={{ width: 26, textAlign: 'right', fontWeight: 900, color: l.d > 0 ? 'var(--green)' : l.d < 0 ? 'var(--red)' : 'var(--ink2)' }}>{l.arrow}</span>
            </div>
          ))}
        </div>}
      {impact && impact.type === 'ko' &&
        <div style={{ marginTop: 10, background: 'var(--bg)', borderRadius: 11, padding: '8px 11px', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>
          🏆 {impact.text}
        </div>}

      {/* What If? entry point */}
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => onWhatIf && onWhatIf(f)}
          style={{ border: '1.5px solid var(--line)', background: 'none', cursor: 'pointer', borderRadius: 999, fontSize: 11, fontWeight: 800, color: 'var(--ink2)', padding: '4px 12px', letterSpacing: '.02em' }}>
          What If? →
        </button>
      </div>
    </Cmc>
  );
}

/* ---- "next up" hero with big countdown ---------------------------------- */
function NextHero(props) {
  const f = props.f, me = props.me, owned = props.owned;
  const ta = mcTeam(f.a), tb = mcTeam(f.b);
  const ms = mcKickoffMs(f);
  const remaining = useCountdown(ms);
  const stake = mcStake(me, f);
  const imp = mcImportance(f, me, stake.pts, owned);
  return (
    <Cmc bordered style={{ background: 'var(--ink)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--yellow)', textTransform: 'uppercase' }}>{props.label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, opacity: .8 }}>{f.dateLabel} · {f.time}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '14px 0 8px' }}>
        <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 42 }}>{ta.flag}</div>
          <div className="dh" style={{ fontSize: 16, color: '#fff' }}>{ta.name}</div>
        </div>
        <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
          <div className="dh" style={{ fontSize: 26, color: 'var(--yellow)', lineHeight: 1 }}>{mcFmt(remaining)}</div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{remaining != null && remaining <= 0 ? 'NOW' : 'TO KICK-OFF'}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 42 }}>{tb.flag}</div>
          <div className="dh" style={{ fontSize: 16, color: '#fff' }}>{tb.name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
        <Chmc tone={impTone(imp.tier)}>{'🔥'.repeat(imp.flames) || '·'} {imp.label}</Chmc>
        {stake.pts > 0 && <Chmc tone="green">🎯 {stake.pts} pts in play</Chmc>}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>{mcStageLabel(f)} · {f.venue}</span>
      </div>
    </Cmc>
  );
}

/* ---- screen ------------------------------------------------------------- */
function MatchCentreScreen() {
  const me = Smc ? Smc.active() : null;
  const [filter, setFilter] = mcState('all');
  const [wiFixture, setWiFixture] = mcState(null);
  const owned = mcOwned();
  const all = (WCmc.FIXTURES || []).slice();
  const mineTeam = me ? me.team : null;

  const liveList = all.filter(f => mcStatus(f) === 'live');
  const upcoming = all.filter(f => mcStatus(f) === 'upcoming');
  // hero: your team's next, else the most important upcoming, else the first
  const nextMine = mineTeam ? upcoming.find(f => f.a === mineTeam || f.b === mineTeam) : null;
  let heroPick = null;
  if (!nextMine && upcoming.length) {
    heroPick = upcoming.slice().sort((a, b) => {
      const ia = mcImportance(a, me, mcStake(me, a).pts, owned).score;
      const ib = mcImportance(b, me, mcStake(me, b).pts, owned).score;
      if (ib !== ia) return ib - ia;
      return (mcKickoffMs(a) || 0) - (mcKickoffMs(b) || 0);
    })[0];
  }
  const hero = nextMine || heroPick;

  // filtered, dated list (live shown separately at top)
  let list = all.filter(f => mcStatus(f) !== 'live');
  if (filter === 'mine' && mineTeam) list = list.filter(f => f.a === mineTeam || f.b === mineTeam);
  else if (filter === 'owned') list = list.filter(f => owned[f.a] || owned[f.b]);
  else if (filter === 'done') list = list.filter(f => mcStatus(f) === 'done');
  else if (filter === 'upcoming') list = list.filter(f => mcStatus(f) === 'upcoming');

  const byDate = []; const seen = {};
  list.forEach(f => {
    if (!seen[f.dateISO]) { seen[f.dateISO] = { label: f.dateLabel, items: [] }; byDate.push(seen[f.dateISO]); }
    seen[f.dateISO].items.push(f);
  });

  const doneCount = all.filter(f => mcStatus(f) === 'done').length;
  const filters = [['all', 'All'], ['mine', 'My team'], ['owned', 'In the draw'], ['upcoming', 'Upcoming'], ['done', 'Finished']];

  return (
    <React.Fragment>
    <div className="pad">
      <div className="appbar" style={{ padding: '2px 0 12px' }}>
        <div>
          <div className="dh" style={{ fontSize: 26 }}>Match Centre</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>
            {liveList.length > 0
              ? <><b style={{ color: 'var(--red)' }}>{liveList.length} live now</b> · {upcoming.length} to come</>
              : <>{all.length} fixtures · {doneCount} played · kick-off {WCmc.meta.kickoff || 'soon'}</>}
          </div>
        </div>
      </div>

      {/* LIVE NOW — top priority */}
      {liveList.length > 0 && <>
        <SHmc aside="updating live">● Live now</SHmc>
        {liveList.map(f => <MatchCard key={f.id} f={f} me={me} owned={owned} onWhatIf={setWiFixture} />)}
      </>}

      {/* NEXT UP hero with countdown */}
      {filter === 'all' && hero &&
        <div style={{ marginTop: liveList.length ? 6 : 0 }}>
          <NextHero f={hero} me={me} owned={owned} label={nextMine ? 'Your ' + mcTeam(mineTeam).name + ' play next' : 'Next up'} />
        </div>}

      {!liveList.length && filter === 'all' &&
        <><div style={{ height: 12 }} />
        <Saysmc mood="confident" label="match centre" animate>Every fixture, live as it happens — scores, what is riding on it, and how the table shifts. Wheesht misses nothing.</Saysmc></>}

      {/* filters */}
      <div style={{ display: 'flex', gap: 7, padding: '16px 0 12px', overflowX: 'auto' }}>
        {filters.map(([k, lab]) => (
          <button key={k} onClick={() => setFilter(k)} disabled={k === 'mine' && !mineTeam}
            className={'wc-chip' + (filter === k ? ' wc-chip--yellow' : '')}
            style={{ whiteSpace: 'nowrap', cursor: 'pointer', flex: '0 0 auto', opacity: (k === 'mine' && !mineTeam) ? .4 : 1 }}>{lab}</button>
        ))}
      </div>

      {list.length === 0 &&
        <Cmc flat style={{ textAlign: 'center', padding: '26px 16px' }}>
          <Wmc mood="neutral" size={64} animate />
          <div className="dh" style={{ fontSize: 17, marginTop: 6 }}>Nothing here yet.</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>No fixtures match that filter.</div>
        </Cmc>}

      {byDate.map((day, i) => (
        <div key={i}>
          <SHmc aside={day.items.length + ' ' + (day.items.length === 1 ? 'game' : 'games')}>{day.label}</SHmc>
          {day.items.map(f => <MatchCard key={f.id} f={f} me={me} owned={owned} onWhatIf={setWiFixture} />)}
        </div>
      ))}
    </div>
    {wiFixture && <window.WhatIfSheet f={wiFixture} me={me} onClose={() => setWiFixture(null)} />}
    </React.Fragment>
  );
}

window.MatchCentreScreen = MatchCentreScreen;
