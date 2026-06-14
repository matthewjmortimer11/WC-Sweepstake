/* ===========================================================================
   PERSONAL DASHBOARD — "Me" screen.
   Profile · assigned team & progress · predictions · results & winnings ·
   activity feed. Reads the active participant from Store.
   =========================================================================== */
const WCd = window.WC;
const Wd = window.Wheesht;
const Sd = window.Store;
const { Card: Cd, Btn: Bd, Flag: Fd, Avatar: Ad, Chip: Chd, Stamp: Std, ProgressRing: PRd, WheeshtSays: Saysd, SectionHead: SHd } = window;
const { useState: dState } = React;

function money_d(n) { return '£' + Math.round(n).toLocaleString('en-GB'); }
const PRE = () => (WCd.meta.phase === 'pre');
function stageName(t) {
  if (t.stage === 'group') return 'Group stage';
  if (t.stage === 'qf') return 'Quarter-final';
  if (t.stage === 'r16') return 'Round of 16';
  if (t.stage === 'out-r16') return 'Out · Round of 16';
  if (t.stage === 'out-r32') return 'Out · Round of 32';
  return 'Out · Group stage';
}

function dashTeam(code) { return WCd.TEAMS[code] || { code: code || '?', name: code || 'TBD', flag: '🏳️', rounds: 0, stage: 'group', odds: '0' }; }

function overallRank(me) {
  const rows = Sd.allSync().slice().sort((a, b) => {
    const ta = dashTeam(a.team), tb = dashTeam(b.team);
    if (tb.rounds !== ta.rounds) return tb.rounds - ta.rounds;
    return parseInt(String(ta.odds).slice(1) || '0') - parseInt(String(tb.odds).slice(1) || '0');
  });
  const i = rows.findIndex(p => p.id === me.id);
  return { rank: i < 0 ? rows.length : i + 1, total: rows.length };
}

function ProfileHeader(props) {
  const me = props.me; const t = dashTeam(me.team);
  const includeDept = Sd.includeDepartment ? Sd.includeDepartment() : true;
  const includeLocation = Sd.includeLocation ? Sd.includeLocation() : true;
  const includeLtMember = Sd.includeLtMember ? Sd.includeLtMember() : true;
  const chips = [
    includeLocation && me.location && me.location,
    includeDept && me.department,
    includeLtMember && me.ltMember && 'LT',
  ].filter(Boolean);
  return (
    <Cd bordered className="pop">
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <Ad person={Object.assign({}, me, { isYou: false })} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dh" style={{ fontSize: 24, lineHeight: 1 }}>{me.name}</div>
          {chips.length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            {chips.map((c, i) => <Chd key={i} tone={c === 'LT' ? 'yellow' : undefined}>{c}</Chd>)}
          </div>}
        </div>
        <button onClick={props.onEdit} className="wc-btn wc-btn--sm" style={{ padding: '8px 12px', boxShadow: '0 4px 0 var(--shadow)' }}>Edit</button>
      </div>
    </Cd>
  );
}

function EditProfile(props) {
  const me = props.me;
  const [name, setName] = dState(me.name);
  const [dept, setDept] = dState(me.department || '');
  const [loc, setLoc] = dState(me.location || 'Edinburgh');
  const [lt, setLt] = dState(!!me.ltMember);
  const includeDept = Sd.includeDepartment ? Sd.includeDepartment() : true;
  const includeLocation = Sd.includeLocation ? Sd.includeLocation() : true;
  const includeLtMember = Sd.includeLtMember ? Sd.includeLtMember() : true;
  const fld = { width: '100%', border: '2.5px solid var(--ink)', borderRadius: 12, padding: '11px 13px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 15, marginTop: 6, outline: 'none' };
  function seg(val, set, opts) {
    return <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>{opts.map(o =>
      <button key={String(o.value)} onClick={() => set(o.value)} className="wc-btn wc-btn--sm" style={{ flex: 1, background: val === o.value ? 'var(--yellow)' : '#fff', boxShadow: val === o.value ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>{o.label}</button>)}</div>;
  }
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={props.onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,26,.45)' }} />
      <div className="rise" style={{ position: 'relative', background: 'var(--bg)', borderRadius: '26px 26px 0 0', padding: '18px 18px 26px', boxShadow: '0 -20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--line)', margin: '0 auto 14px' }} />
        <div className="dh" style={{ fontSize: 22, marginBottom: 14 }}>Edit your details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div><label style={{ fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)' }}>Full name</label><input style={fld} value={name} onChange={e => setName(e.target.value)} /></div>
          {includeDept && <div><label style={{ fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)' }}>Team / department</label><input style={fld} value={dept} onChange={e => setDept(e.target.value)} placeholder="optional" /></div>}
          {includeLocation && <div><label style={{ fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)' }}>Location</label>{seg(loc, setLoc, [{ value: 'Edinburgh', label: 'Edinburgh' }, { value: 'London', label: 'London' }])}</div>}
          {includeLtMember && <div><label style={{ fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)' }}>Leadership Team?</label>{seg(lt, setLt, [{ value: false, label: 'No' }, { value: true, label: 'Yes' }])}</div>}
        </div>
        <div style={{ marginTop: 18 }}>
          <Bd variant="ink" block onClick={() => {
            Sd.update(me.id, {
              name: name.trim() || me.name,
              department: includeDept ? dept.trim() : me.department,
              location: includeLocation ? loc : me.location,
              city: includeLocation ? loc : me.city,
              ltMember: includeLtMember ? lt : me.ltMember,
              leadership: includeLtMember ? lt : me.leadership,
            });
            props.onClose();
          }}>Save</Bd>
        </div>
      </div>
    </div>
  );
}

function TeamCard(props) {
  const me = props.me; const t = dashTeam(me.team);
  const nextTie = (WCd.R16 || []).find(x => (x.a === me.team || x.b === me.team) && !x.done);
  const opp = nextTie ? WCd.TEAMS[nextTie.a === me.team ? nextTie.b : nextTie.a] : null;
  const pre = PRE();
  const nextFix = (WCd.FIXTURES || []).find(f => (f.a === me.team || f.b === me.team) && (f.status || 'upcoming') !== 'done');
  const fixOpp = nextFix ? WCd.TEAMS[nextFix.a === me.team ? nextFix.b : nextFix.a] : null;
  return (
    <Cd bordered className="pop" style={t.alive ? null : { background: 'var(--ink)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 58, lineHeight: 1, opacity: t.alive ? 1 : .5, filter: t.alive ? 'none' : 'grayscale(1)' }}><Fd team={t} size={58} /></div>
        <div style={{ flex: 1 }}>
          <span className="dh" style={{ fontSize: 28, color: t.alive ? 'var(--ink)' : '#fff', textDecoration: t.alive ? 'none' : 'line-through', textDecorationColor: 'var(--red)' }}>{t.name}</span>
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            <Chd tone="yellow">Group {t.group}</Chd>
            {t.alive ? <Chd tone="green">{stageName(t)}</Chd> : <Std tone="red" rotate={-6}>ELIMINATED</Std>}
            <Chd style={t.alive ? null : { background: 'transparent', color: '#fff' }}>Odds {t.odds}</Chd>
          </div>
        </div>
        {t.alive && !pre && <PRd value={t.rounds / 6} size={54} stroke={7} color={t.stage === 'qf' ? 'var(--green)' : 'var(--yellow)'}><span style={{ fontSize: 11 }}>{t.code}</span></PRd>}
      </div>
      {pre && nextFix && fixOpp &&
        <button onClick={props.onGames} style={{ width: '100%', marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ink)', border: 'none', borderRadius: 14, padding: '11px 14px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--yellow)' }}>YOUR FIRST GAME · {nextFix.dateLabel} · {nextFix.time}</div>
            <div className="dh" style={{ fontSize: 18, marginTop: 2 }}>{t.name} <span style={{ opacity: .5 }}>v</span> {fixOpp.name} {fixOpp.flag}</div>
          </div>
          <span className="dh" style={{ fontSize: 20 }}>→</span>
        </button>}
      {pre && !nextFix &&
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 14, padding: '11px 14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--ink2)' }}>NOT A BALL KICKED YET</div>
            <div className="dh" style={{ fontSize: 16, marginTop: 2 }}>Group {t.group} gets underway {WCd.meta.kickoff || 'soon'}.</div>
          </div>
          <span style={{ fontSize: 22 }}>⚽</span>
        </div>}
      {t.alive && !pre && nextTie && opp &&
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ink)', borderRadius: 14, padding: '11px 14px', color: '#fff' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--yellow)' }}>YOUR NEXT TIE · {nextTie.note}</div>
            <div className="dh" style={{ fontSize: 18, marginTop: 2 }}>{t.name} <span style={{ opacity: .5 }}>vs</span> {opp.name} {opp.flag}</div>
          </div>
          <span className="flame" style={{ fontSize: 24 }}>🔥</span>
        </div>}
    </Cd>
  );
}

function PredCard(props) {
  const me = props.me;
  const score = Sd.predScoreOf(me); const max = Sd.maxPredPoints();
  const ranked = Sd.rankedByPred(); const meR = ranked.find(p => p.id === me.id);
  const rank = meR ? meR.predRank : ranked.length;
  const submitted = me.picks ? Object.keys(me.picks).length : 0;
  const totalMkts = (WCd.predictions || Sd.PREDICTIONS).length;
  return (
    <Cd>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="dh" style={{ fontSize: 18 }}>Your predictions</div>
        {WCd.meta.predictionsLocked ? <Chd tone="red">Locked</Chd> : <Chd tone="green">Open</Chd>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
        {[['Score', score + ' pts'], ['Rank', '#' + rank], ['Made', submitted + '/' + totalMkts]].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 13, padding: '10px 8px', textAlign: 'center' }}>
            <div className="dh" style={{ fontSize: 22, color: i === 0 ? 'var(--green)' : 'var(--ink)' }}>{s[1]}</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink2)' }}>{s[0]}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 11 }}>
        <Bd variant="primary" block sm onClick={props.onOpen}>{submitted < totalMkts && !WCd.meta.predictionsLocked ? 'Finish your predictions →' : 'See my predictions →'}</Bd>
      </div>
    </Cd>
  );
}

function WinningsCard(props) {
  const me = props.me; const t = dashTeam(me.team);
  const pot = Sd.pot ? Sd.pot() : (WCd.POT * 0.5);
  const charity = Sd.charity ? Sd.charity() : (WCd.POT * 0.5);
  const ov = overallRank(me);
  const rankTaps = React.useRef({n:0,t:0});
  function rankTap(){
    const now = Date.now();
    rankTaps.current.n = (now - rankTaps.current.t < 1200) ? rankTaps.current.n + 1 : 1;
    rankTaps.current.t = now;
    if(rankTaps.current.n >= 3){ rankTaps.current.n = 0; window.__wheeshtEgg2 && window.__wheeshtEgg2(); }
  }
  return (
    <Cd bordered>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink2)' }}>Winner takes all — if {t.name} lift the cup</div>
          <div className="dh" style={{ fontSize: 38, color: 'var(--green)', lineHeight: 1, marginTop: 2 }}>{money_d(pot)}</div>
        </div>
        <div onClick={rankTap} style={{ textAlign: 'right', background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 12, padding: '7px 11px', cursor: 'default' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: 'var(--ink2)' }}>OVERALL</div>
          <div className="dh" style={{ fontSize: 22 }}>#{ov.rank}<span style={{ fontSize: 13, color: 'var(--ink2)' }}>/{ov.total}</span></div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, opacity: t.alive ? 1 : .4 }}>
          <span style={{ flex: 1 }}>🏆 Champion (one winner)</span>
          {t.alive ? <Chd tone="ghost" style={{ borderStyle: 'dashed' }}>still in</Chd> : <span style={{ fontSize: 11, color: 'var(--ink2)' }}>out</span>}
          <span className="dh" style={{ fontSize: 15, width: 64, textAlign: 'right' }}>{money_d(pot)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, background: 'var(--bg)', borderRadius: 10, padding: '8px 10px', marginTop: 2 }}>
          <span style={{ fontSize: 16 }}>❤️</span>
          <span style={{ flex: 1 }}>To charity (half of every entry)</span>
          <span className="dh" style={{ fontSize: 15, width: 64, textAlign: 'right', color: 'var(--red)' }}>{money_d(charity)}</span>
        </div>
      </div>
    </Cd>
  );
}

function ActivityFeed(props) {
  const me = props.me; const t = dashTeam(me.team);
  const pre = PRE();
  const items = [];
  if (pre) {
    const submitted = me.picks ? Object.keys(me.picks).length : 0;
    const totalMkts = (WCd.predictions || Sd.PREDICTIONS).length;
    items.push({ m: 'confident', t: 'You drew ' + t.name + ' ' + t.flag, d: 'Group ' + t.group + '. Locked in. May the football gods be kind.', when: 'just now' });
    if (submitted < totalMkts) items.push({ m: 'mischievous', t: 'Predictions are open', d: (totalMkts - submitted) + ' still to call before kick-off. Get them in.', when: 'now' });
    else items.push({ m: 'happy', t: 'All predictions in', d: 'Every market called. Wheesht has them in writing.', when: 'now' });
    items.push({ m: 'broadcast', t: 'Tournament is underway', d: 'The first whistle has gone. Wheesht is taking notes.', when: 'live' });
    items.push({ m: 'neutral', t: 'You entered the sweepstake', d: 'Buy-in confirmed. £' + WCd.FEE + ' in the pot. Welcome aboard.', when: 'on joining' });
  } else {
    if (!t.alive) items.push({ m: 'crying', t: t.name + ' knocked out', d: stageName(t) + ' — your run ends here. The side game awaits.', when: '2h ago' });
    else items.push({ m: 'confident', t: t.name + ' still standing', d: 'Through to the ' + stageName(t).toLowerCase() + '. Wheesht is quietly impressed.', when: '2h ago' });
    items.push({ m: 'broadcast', t: 'You entered the sweepstake', d: 'Buy-in confirmed. £' + WCd.FEE + ' in the pot. Welcome aboard.', when: 'on joining' });
  }
  return (
    <Cd flat style={{ padding: '6px 14px' }}>
      {items.map((n, i) => (
        <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0', borderBottom: i < items.length - 1 ? '1.5px solid var(--line)' : 'none' }}>
          <Wd mood={n.m} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dh" style={{ fontSize: 15 }}>{n.t}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', lineHeight: 1.3 }}>{n.d}</div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{n.when}</span>
        </div>
      ))}
    </Cd>
  );
}

function MeScreen(props) {
  const me = Sd.active();
  const [edit, setEdit] = dState(false);
  if (!me) return null;
  const t = dashTeam(me.team);
  const pre = PRE();
  const greetMood = pre ? 'happy' : (t.alive ? 'happy' : 'crying');
  return (
    <div className="pad">
      <ProfileHeader me={me} onEdit={() => setEdit(true)} />
      <div style={{ height: 12 }} />
      <Saysd mood={greetMood} label={'hey ' + me.name.split(' ')[0]} animate>
        {pre ? <>You've drawn {t.name}. No games yet — get your predictions in while the slate's clean.</> : (t.alive ? <>{t.name} are still standing. Keep your predictions sharp — the pot's in play.</> : <>Your team is out, but the predictions league is still live. Wheesht isn't done with you yet.</>)}
      </Saysd>
      <SHd>Your team</SHd>
      <TeamCard me={me} onGames={props.goGames} />
      <SHd aside={WCd.meta.predictionsLocked ? 'locked' : 'open'}>Predictions</SHd>
      <PredCard me={me} onOpen={props.goPredictions} />
      <SHd>{pre ? 'Potential winnings' : 'Results & winnings'}</SHd>
      <WinningsCard me={me} />
      <SHd aside="latest first">Activity</SHd>
      <ActivityFeed me={me} />
      {edit && <EditProfile me={me} onClose={() => setEdit(false)} />}
    </div>
  );
}

window.MeScreen = MeScreen;
