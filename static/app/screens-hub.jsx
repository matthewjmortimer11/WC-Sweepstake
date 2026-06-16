/* ===========================================================================
   HUB SCREENS — Dashboard · Tracker · Side Bets · Weekly Summary
   =========================================================================== */
const WC = window.WC;
const { Card, Btn, Flag, Avatar, Chip, Stamp, ProgressRing, SegmentBar, WheeshtSays, SectionHead } = window;
const W = window.Wheesht;
const { useState: uState, useMemo: uMemo } = React;

function money(n){
  if (window.Store && window.Store.money) return window.Store.money(n);
  const cur = (WC.meta && WC.meta.currency) || '£';
  return cur + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function ownerName(code){ const o = WC.ownersOf(code); return o.length ? o[0].name : 'nobody'; }
function stageLabel(t){
  if (t.stage === 'qf') return 'Quarter-final';
  if (t.stage === 'r16') return 'Round of 16';
  if (t.stage === 'out-r16') return 'Out · Round of 16';
  if (t.stage === 'out-r32') return 'Out · Round of 32';
  return 'Out · Group stage';
}

/* =================== DASHBOARD =================== */
function ConverterCard(props){
  const amt = props.amount;
  const opts = props.options;
  const [i, setI] = uState(0);
  return (
    <Card bordered>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--ink2)'}}>The prize pot</div>
          <div className="dh" style={{fontSize:40,marginTop:2,lineHeight:1}}>{money(WC.POT)}</div>
        </div>
        <div style={{textAlign:'right',background:'rgba(26,122,68,.1)',border:'2px solid var(--green)',borderRadius:13,padding:'7px 11px',flex:'0 0 auto'}}>
          <div style={{fontSize:10,fontWeight:800,letterSpacing:'.04em',color:'var(--green)',whiteSpace:'nowrap'}}>YOUR CUT IF YOU WIN IT</div>
          <div className="dh" style={{fontSize:24,color:'var(--green)',lineHeight:1.05}}>{money(amt)}</div>
        </div>
      </div>
      <div onClick={()=>setI((i+1)%opts.length)} style={{marginTop:13,background:'var(--bg)',border:'2.5px dashed var(--ink)',borderRadius:14,padding:'12px 14px',cursor:'pointer'}}>
        <div style={{fontSize:12,fontWeight:700,color:'var(--ink2)',marginBottom:4}}>{money(amt)} could get you…</div>
        <div className="dh" style={{fontSize:17,lineHeight:1.22,minHeight:72,display:'flex',alignItems:'center'}} key={i}>
          <span className="rise" style={{display:'inline-block'}}>{opts[i]}</span>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:'var(--ink2)',marginTop:10}}>Tap for another · your call →</div>
      </div>
    </Card>
  );
}

function DashTeam(){
  const me = WC.YOU; const t = WC.TEAMS[me.team];
  return (
    <Card bordered className="pop">
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div style={{fontSize:62,lineHeight:1}}><Flag team={t} size={62} /></div>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <span className="dh" style={{fontSize:30}}>{t.name}</span>
          </div>
          <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
            <Chip tone="yellow">Group {t.group}</Chip>
            <Chip tone="green">Still in</Chip>
            <Chip>Odds {t.odds}</Chip>
          </div>
        </div>
        <ProgressRing value={0.6} size={56} stroke={7} color="var(--green)"><span style={{fontSize:12}}>R16</span></ProgressRing>
      </div>
      <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10,background:'var(--ink)',borderRadius:14,padding:'11px 14px',color:'#fff'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:'.06em',color:'var(--yellow)'}}>YOUR NEXT TIE · TONIGHT 20:00</div>
          <div className="dh" style={{fontSize:19,marginTop:2}}>Croatia <span style={{opacity:.5}}>vs</span> Mexico 🇲🇽</div>
        </div>
        <span className="flame" style={{fontSize:26}}>🔥</span>
      </div>
    </Card>
  );
}

function MatchdayCard(){
  const ties = WC.R16.filter(t=>!t.done).slice(0,3);
  return (
    <Card>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
        <W mood="broadcast" size={40}/>
        <div>
          <div className="dh" style={{fontSize:17}}>Today’s matchday</div>
          <div style={{fontSize:12,fontWeight:600,color:'var(--ink2)'}}>Wheesht has thoughts. Wheesht is keeping them professional.</div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:9,marginTop:8}}>
        {ties.map(tie=>{
          const A=WC.TEAMS[tie.a],B=WC.TEAMS[tie.b];
          return (
            <div key={tie.id} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 11px',border:'2px solid var(--line)',borderRadius:13,background:tie.you?'rgba(245,200,0,.16)':'#fff'}}>
              <Flag team={A} size={26}/>
              <div style={{flex:1,fontSize:13,fontWeight:700,lineHeight:1.15}}>
                {ownerName(tie.a)}’s {A.name} <span style={{color:'var(--ink2)',fontWeight:600}}>vs</span> {ownerName(tie.b)}’s {B.name}
              </div>
              <Flag team={B} size={26}/>
              {tie.you && <Chip tone="yellow" style={{marginLeft:2}}>You</Chip>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BracketSnapshot(props){
  return (
    <Card>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div className="dh" style={{fontSize:17}}>The bracket · Round of 16</div>
        <button onClick={props.onOpen} style={{background:'none',border:'none',color:'var(--red)',fontWeight:800,fontSize:13,cursor:'pointer'}}>Full tracker →</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {WC.R16.map(tie=>{
          const A=WC.TEAMS[tie.a],B=WC.TEAMS[tie.b];
          const aw = tie.done && tie.score[0]>tie.score[1];
          const bw = tie.done && tie.score[1]>tie.score[0];
          return (
            <div key={tie.id} style={{border:tie.you?'2.5px solid var(--ink)':'2px solid var(--line)',borderRadius:12,padding:'7px 9px',background:tie.you?'var(--yellow)':'#fff'}}>
              <Row team={A} score={tie.done?tie.score[0]:null} lose={bw}/>
              <div style={{height:4}}/>
              <Row team={B} score={tie.done?tie.score[1]:null} lose={aw}/>
            </div>
          );
        })}
      </div>
    </Card>
  );
  function Row(p){
    return <div style={{display:'flex',alignItems:'center',gap:6,opacity:p.lose?.45:1}}>
      <Flag team={p.team} size={18}/>
      <span style={{fontSize:11.5,fontWeight:700,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',textDecoration:p.lose?'line-through':'none'}}>{p.team.code}</span>
      {p.score!=null && <span className="dh" style={{fontSize:14}}>{p.score}</span>}
    </div>;
  }
}

function SegmentPanel(){
  const segs = WC.SEGMENTS;
  const loser = (()=>{ // find biggest gap for Wheesht to mock
    let worst=null,gap=-1;
    segs.forEach(s=>{ const ra=WC.rate(s.a.list),rb=WC.rate(s.b.list); const g=Math.abs(ra-rb); if(g>gap){gap=g;worst= ra<rb? s.a.name : s.b.name;} });
    return worst;
  })();
  return (
    <Card>
      <div className="dh" style={{fontSize:17,marginBottom:2}}>Who’s surviving?</div>
      <div style={{fontSize:12,fontWeight:600,color:'var(--ink2)',marginBottom:6}}>Survival rate, head to head.</div>
      {segs.map(s=>(
        <SegmentBar key={s.key}
          a={{name:s.a.name,value:WC.rate(s.a.list)}}
          b={{name:s.b.name,value:WC.rate(s.b.list)}}/>
      ))}
      <div style={{marginTop:10}}>
        <WheeshtSays mood="smug" avSize={52} compact>{loser}. Explain yourselves.</WheeshtSays>
      </div>
    </Card>
  );
}

function DashTeamOut(props){
  const me = WC.YOU; const t = WC.TEAMS[me.team];
  return (
    <Card bordered className="pop" style={{background:'var(--ink)',color:'#fff'}}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div style={{fontSize:62,lineHeight:1,opacity:.5,filter:'grayscale(1)'}}><Flag team={t} size={62}/></div>
        <div style={{flex:1}}>
          <span className="dh" style={{fontSize:30,color:'#fff',textDecoration:'line-through',textDecorationColor:'var(--red)'}}>{t.name}</span>
          <div style={{marginTop:7}}><Stamp tone="red" rotate={-7}>ELIMINATED</Stamp></div>
        </div>
      </div>
      <div style={{marginTop:14,display:'flex',gap:11,alignItems:'flex-end'}}>
        <W mood="solemn" size={62}/>
        <div style={{fontSize:14,fontWeight:600,lineHeight:1.34}}>{WC.LINES.eliminated}</div>
      </div>
      <div style={{marginTop:14}}>
        <button onClick={props.goBets} className="wc-btn wc-btn--red wc-btn--block">Join the side game →</button>
      </div>
    </Card>
  );
}

function DashboardScreen(props){
  const potShare = (Number(WC.POT) || 0) * 0.6;
  return (
    <div className="pad">
      {props.eliminated ? <DashTeamOut goBets={props.goBets}/> : <DashTeam/>}
      <div style={{height:12}}/>
      {props.eliminated
        ? <WheeshtSays mood="smug" label="conspiratorial" animate>{WC.LINES.sideBets2}</WheeshtSays>
        : <WheeshtSays mood="suspicious" label="on your draw" animate>{WC.LINES.drawYou}</WheeshtSays>}
      <SectionHead aside="updated 2 min ago">The Pot</SectionHead>
      <ConverterCard amount={potShare} options={[
        'A long weekend in Lisbon — flights, a hotel, and far too many pastéis.',
        'Roughly 420 Tunnock’s Teacakes. Wheesht did the maths.',
        '1.3 Michelin stars in Tokyo. Or the whole pub a cracking night.',
        'A frankly ridiculous telly to watch the final on.',
      ]}/>
      <SectionHead>The Bracket</SectionHead>
      <BracketSnapshot onOpen={props.goTracker}/>
      <SectionHead>Matchday</SectionHead>
      <MatchdayCard/>
      <SectionHead>The Standings</SectionHead>
      <SegmentPanel/>
    </div>
  );
}

/* =================== TRACKER (who's still in) =================== */
function FieldCard(){
  const P = window.Store ? window.Store.allSync() : WC.PEOPLE;
  const maxTeams = (WC.meta && WC.meta.maxTeams) || WC.TEAM_LIST.length;
  const claimed = new Set(P.map(p=>p.team)); const distinct = claimed.size;
  const remaining = Math.max(0, maxTeams - distinct);
  const sharing = distinct >= maxTeams;
  const rows = [
    {label:'Entrants', n:P.length, sub:'and counting', c:'var(--ink)'},
    {label:'Countries claimed', n:distinct, sub:'of '+maxTeams, c:'var(--yellow)'},
    {label:sharing?'Doubled up':'Up for grabs', n:sharing?(P.length-distinct):remaining, sub:sharing?'countries shared':'still free', c:'var(--green)'},
  ];
  return (
    <Card bordered>
      <div className="dh" style={{fontSize:17,marginBottom:2}}>The field so far</div>
      <div style={{fontSize:12,fontWeight:600,color:'var(--ink2)',marginBottom:12}}>Not a ball kicked — everyone’s still in. The pot grows with every sign-up.</div>
      <div style={{display:'flex',gap:9}}>
        {rows.map((s,i)=>(
          <div key={i} style={{flex:1,background:'var(--bg)',border:'2px solid var(--line)',borderRadius:13,padding:'11px 8px',textAlign:'center'}}>
            <div className="dh" style={{fontSize:30,lineHeight:1,color:s.c}}>{s.n}</div>
            <div style={{fontSize:10.5,fontWeight:800,letterSpacing:'.03em',textTransform:'uppercase',color:'var(--ink2)',marginTop:4}}>{s.label}</div>
            <div style={{fontSize:10,fontWeight:700,color:'var(--ink2)'}}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop:11,fontSize:11.5,fontWeight:700,color:'var(--ink2)',background:'var(--bg)',borderRadius:10,padding:'8px 11px'}}>
        {sharing
          ? 'All '+maxTeams+' countries are taken — new entrants now double up on the most-available teams.'
          : 'Everyone gets their own country until all '+maxTeams+' are taken. After that, they’re shared.'}
      </div>
    </Card>
  );
}
function StageFunnel(){
  const P = window.Store ? window.Store.allSync() : WC.PEOPLE;
  const stages = [
    {label:'Entered', n:P.length, sub:'the draw'},
    {label:'Past groups', n:P.filter(p=>(WC.TEAMS[p.team]||{rounds:0}).rounds>=2).length, sub:'Top 2 + best 3rds'},
    {label:'Past R32', n:P.filter(p=>(WC.TEAMS[p.team]||{rounds:0}).rounds>=3).length, sub:'Last 16'},
    {label:'Into QFs', n:P.filter(p=>(WC.TEAMS[p.team]||{rounds:0}).rounds>=4).length, sub:'Last 8'},
  ];
  const max=P.length;
  return (
    <Card bordered>
      <div className="dh" style={{fontSize:17,marginBottom:10}}>The cull, so far</div>
      <div style={{display:'flex',flexDirection:'column',gap:9}}>
        {stages.map((s,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:78,fontSize:12,fontWeight:800,textAlign:'right'}}>{s.label}</div>
            <div style={{flex:1,height:26,background:'var(--bg)',borderRadius:8,border:'2px solid var(--ink)',overflow:'hidden',position:'relative'}}>
              <div style={{position:'absolute',inset:0,width:(100*s.n/max)+'%',background:i===0?'var(--ink)':(i>=3?'var(--green)':'var(--yellow)'),transition:'width .8s cubic-bezier(.2,.8,.2,1)'}}/>
              <div style={{position:'absolute',left:8,top:0,bottom:0,display:'flex',alignItems:'center',fontWeight:800,fontFamily:'var(--disp)',fontSize:14,color:i===0?'#fff':'var(--ink)'}}>{s.n}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function liveMarketPickLabel(m, p) {
  const pick = p && p.picks ? p.picks[m.key] : null;
  if (pick == null || pick === '') return 'No pick yet';
  if (m.kind === 'scoreline') return String(pick);
  if (m.kind === 'number') return String(pick);
  if (Array.isArray(pick)) return pick.map(function(x){ const t = WC.TEAMS[x]; return t ? t.name : x; }).join(', ');
  if (pick === 'draw') return 'Draw';
  const t = WC.TEAMS[pick];
  return t ? t.name : String(pick);
}
function hasPredictionPick(m, p) {
  if (!m || !p || !p.picks) return false;
  const pick = p.picks[m.key];
  if (pick == null || pick === '') return false;
  if (Array.isArray(pick)) return pick.length > 0;
  return true;
}
function dynamicFixtureStatus(m) {
  const raw = String((m && (m.fixture_status || m.fixtureStatus || m.status)) || '').trim();
  const st = raw.toLowerCase();
  if (['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(st) >= 0) return 'done';
  if (['halftime', 'half_time', 'half-time', 'ht', 'paused'].indexOf(st) >= 0) return 'halfTime';
  if (['live', 'inplay', 'in_play', 'in-progress', 'inprogress', '1h', '2h'].indexOf(st) >= 0) return 'live';
  return st || 'upcoming';
}
function isActiveFixtureStatus(status) {
  const st = String(status || '').toLowerCase();
  return ['live', 'halftime', 'half_time', 'half-time', 'inplay', 'in_play', 'in-progress', 'inprogress', 'paused'].indexOf(st) >= 0;
}
function isFinishedFixtureStatus(status) {
  const st = String(status || '').toLowerCase();
  return ['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(st) >= 0;
}
function liveMarketsForPerson(p) {
  const markets = window.Store && window.Store.visiblePredictions ? window.Store.visiblePredictions() : (WC.PREDICTIONS || []);
  return markets.filter(function(m) {
    if (!m || String(m.key || '').indexOf('dm_') !== 0 || !hasPredictionPick(m, p)) return false;
    const status = dynamicFixtureStatus(m);
    if (isFinishedFixtureStatus(status)) return false;
    if (isActiveFixtureStatus(status)) return true;
    return m.answer == null;
  }).sort(function(a, b) {
    const al = isActiveFixtureStatus(dynamicFixtureStatus(a)) ? 0 : 1;
    const bl = isActiveFixtureStatus(dynamicFixtureStatus(b)) ? 0 : 1;
    return al - bl;
  }).map(function(m) {
    return { market: m, pick: liveMarketPickLabel(m, p) };
  });
}
function customTagChips(p) {
  const out = [], fields = window.Store && window.Store.customFields ? window.Store.customFields() : [];
  const seen = {};
  fields.forEach(function(f) {
    const raw = p.customFields && p.customFields[f.key];
    if (f.type === 'tags' && Array.isArray(raw)) raw.forEach(function(tag) { if (!seen[tag]) { seen[tag] = 1; out.push(tag); } });
  });
  Object.keys(p.customFields || {}).forEach(function(key) {
    const raw = p.customFields[key];
    if (Array.isArray(raw)) raw.forEach(function(tag) { if (!seen[tag]) { seen[tag] = 1; out.push(tag); } });
  });
  return out;
}
function PersonSnapshot(props) {
  const p = props.person;
  if (!p) return null;
  const t = WC.TEAMS[p.team] || { code: p.team || '?', name: p.team || 'TBD', flag: '🏳️', group: '—', alive: true };
  const fixtures = (WC.FIXTURES || []).filter(function(f){ return f.a === t.code || f.b === t.code; });
  const upcoming = fixtures.filter(function(f){ const st = dynamicFixtureStatus(f); return !isFinishedFixtureStatus(st) && !isActiveFixtureStatus(st); });
  const previous = fixtures.filter(function(f){ return isFinishedFixtureStatus(dynamicFixtureStatus(f)); });
  const livePicks = liveMarketsForPerson(p);
  const tags = customTagChips(p);
  const shown = window.Store && window.Store.shownName ? window.Store.shownName(p) : p.name;
  function fixtureRow(f, i, arr) {
    const a = WC.TEAMS[f.a] || { code: f.a, name: f.a, flag: '' };
    const b = WC.TEAMS[f.b] || { code: f.b, name: f.b, flag: '' };
    const score = f.score && f.score[0] != null && f.score[1] != null ? f.score[0] + '–' + f.score[1] : f.time;
    return <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: i < arr.length - 1 ? '1.5px solid var(--line)' : 'none' }}>
      <span style={{ fontSize: 18 }}>{a.flag}</span>
      <span style={{ fontSize: 11, fontWeight: 900, width: 34 }}>{a.code}</span>
      <span className="dh" style={{ fontSize: 16, width: 42, textAlign: 'center' }}>{score}</span>
      <span style={{ fontSize: 11, fontWeight: 900, width: 34, textAlign: 'right' }}>{b.code}</span>
      <span style={{ fontSize: 18 }}>{b.flag}</span>
      <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, color: 'var(--ink2)' }}>{isFinishedFixtureStatus(dynamicFixtureStatus(f)) ? 'FT' : dynamicFixtureStatus(f) === 'halfTime' ? 'HT' : isActiveFixtureStatus(dynamicFixtureStatus(f)) ? 'LIVE' : f.dateLabel}</span>
    </div>;
  }
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar person={Object.assign({}, p, { isYou: false })} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dh" style={{ fontSize: 24, lineHeight: 1 }}>{shown}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginTop: 4 }}>{p.location || p.city || '—'}{p.department ? ' · ' + p.department : ''}</div>
        </div>
        <button onClick={props.onClose} className="wc-btn wc-btn--sm" style={{ background: '#fff', flex: '0 0 auto' }}>Close</button>
      </div>
      {tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {tags.map(function(tag) { return <Chip key={tag} tone="yellow">{tag}</Chip>; })}
      </div>}

      <Card bordered style={{ marginTop: 14, background: 'var(--yellow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Flag team={t} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase' }}>Group {t.group}</div>
            <div className="dh" style={{ fontSize: 21, lineHeight: 1 }}>{t.name}</div>
          </div>
          <Chip tone={t.alive ? 'green' : 'red'}>{t.alive ? 'Still in' : 'Out'}</Chip>
        </div>
      </Card>

      <SectionHead aside={upcoming.length + ' left'}>Upcoming games</SectionHead>
      <Card flat style={{ padding: '3px 13px' }}>
        {upcoming.length ? upcoming.map(fixtureRow) : <div style={{ padding: '15px 0', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)' }}>No upcoming games.</div>}
      </Card>

      <SectionHead aside="picked live only">Live prediction</SectionHead>
      <Card flat style={{ padding: '4px 13px' }}>
        {livePicks.length
          ? livePicks.map(function(row, i) {
              return <div key={row.market.key} style={{ padding: '10px 0', borderBottom: i < livePicks.length - 1 ? '1.5px solid var(--line)' : 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25 }}>{row.market.q}</div>
                <div className="dh" style={{ fontSize: 17, marginTop: 3 }}>{row.pick}</div>
              </div>;
            })
          : <div style={{ padding: '15px 0', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)' }}>No live prediction showing.</div>}
      </Card>

      <SectionHead aside={previous.length + ' played'}>Previous games</SectionHead>
      <Card flat style={{ padding: '3px 13px' }}>
        {previous.length ? previous.map(fixtureRow) : <div style={{ padding: '15px 0', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)' }}>No previous games yet.</div>}
      </Card>
    </>
  );
  if (props.inline) {
    return <Card bordered style={{ margin: '8px 0 12px', background: '#fff' }}>{body}</Card>;
  }
  const chrome = window.wcSheetChrome ? window.wcSheetChrome(72) : null;
  const wrap = chrome ? chrome.wrap : { position: 'fixed', inset: 0, zIndex: 9999 };
  const backdrop = chrome ? chrome.backdrop : { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' };
  const sheet = chrome ? chrome.sheet : { position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)', borderRadius: '22px 22px 0 0', padding: 18, maxHeight: '82dvh', overflowY: 'auto' };
  const cls = chrome ? chrome.cls : '';
  return (
    <div style={wrap}>
      <div onClick={props.onClose} style={backdrop} />
      <div className={cls} style={sheet}>
        {!chrome || !chrome.deck ? <div style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--line)', margin: '0 auto 14px' }} /> : null}
        {body}
      </div>
    </div>
  );
}

function preservePageScroll(fn) {
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  fn();
  window.requestAnimationFrame(function() {
    window.scrollTo(0, y);
    window.requestAnimationFrame(function() { window.scrollTo(0, y); });
  });
}

function PersonRow(props){
  const p=props.person; const t=WC.TEAMS[p.team]||{code:p.team||'?',flag:'🏳️',rounds:0,stage:'group'}; const you=props.you;
  const pts = window.Store ? window.Store.predScoreOf(p) : (p.predScore||0);
  const includeDept = window.Store && window.Store.includeDepartment ? window.Store.includeDepartment() : true;
  return (
    <button onClick={props.onOpen} style={{width:'100%',display:'flex',alignItems:'center',gap:9,padding:'9px 4px',border:'none',borderBottom:'1.5px solid var(--line)',background:'none',textAlign:'left',fontFamily:'var(--body)',cursor:'pointer',opacity:p.alive?1:.62}}>
      <Avatar person={Object.assign({},p,{isYou:false})} size={34} dim={!p.alive}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:800,fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}{you&&' (you)'}</div>
        <div style={{fontSize:11,fontWeight:600,color:'var(--ink2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(p.location||p.city)}{includeDept && p.department?' · '+p.department:''}{p.ltMember?' · LT':''}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:5}}>
        <Flag team={t} size={20}/>
        <span style={{fontSize:11.5,fontWeight:700,width:30,textDecoration:p.alive?'none':'line-through'}}>{t.code}</span>
      </div>
      {props.pre
        ? <span className="wc-chip wc-chip--green" style={{fontSize:10.5,padding:'2px 6px'}}>in</span>
        : <span className="wc-chip wc-chip--ghost" style={{fontSize:10.5,padding:'2px 6px'}}>{pts}p</span>}
      {p.alive
        ? (props.pre
            ? <span style={{width:32,textAlign:'center',fontSize:18}}>⚽</span>
            : <ProgressRing value={t.rounds/6} size={32} stroke={5} color={t.stage==='qf'?'var(--green)':'var(--yellow)'}/>)
        : <Stamp tone="red" rotate={-6} style={{fontSize:10}}>OUT</Stamp>}
    </button>
  );
}

function TrackerScreen(){
  const [filter,setFilter]=uState('all');
  const [dept,setDept]=uState('');
  const [selected,setSelected]=uState(null);
  const pre = WC.meta.phase === 'pre';
  const P = window.Store ? window.Store.allSync() : WC.PEOPLE;
  const youId = window.Store ? window.Store.activeId() : null;
  const includeDept = window.Store && window.Store.includeDepartment ? window.Store.includeDepartment() : true;
  React.useEffect(function(){ if(!includeDept) setDept(''); }, [includeDept]);
  const depts = Array.from(new Set(P.map(p=>p.department).filter(Boolean))).sort();
  const filters=[['all','Everyone'],['in','Still in'],['out','Out'],['London','London'],['Edinburgh','Edinburgh'],['lt','LT members']];
  let list=P.slice();
  if(filter==='in') list=list.filter(p=>p.alive);
  else if(filter==='out') list=list.filter(p=>!p.alive);
  else if(filter==='London'||filter==='Edinburgh') list=list.filter(p=>(p.location||p.city)===filter);
  else if(filter==='lt') list=list.filter(p=>p.ltMember||p.leadership);
  if(includeDept && dept) list=list.filter(p=>p.department===dept);
  list.sort((a,b)=>{ if(a.id===youId)return -1; if(b.id===youId)return 1; return (WC.TEAMS[b.team]||{rounds:0}).rounds-(WC.TEAMS[a.team]||{rounds:0}).rounds; });
  const stillIn = P.filter(p=>p.alive).length;
  const filtersShown = pre ? filters.filter(f=>f[0]!=='out') : filters;
  function selectPerson(p, open) {
    preservePageScroll(function() { setSelected(open ? null : p); });
  }
  return (
    <div className="pad">
      <div className="appbar" style={{padding:'2px 0 10px'}}>
        <div>
          <div className="dh" style={{fontSize:26}}>The directory</div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--ink2)'}}>
            {pre
              ? <><b style={{color:'var(--ink)'}}>{P.length}</b> {P.length===1?'entrant':'entrants'} so far · all {WC.meta.teamsLeft} countries in play</>
              : <><b style={{color:'var(--ink)'}}>{stillIn}</b> of {P.length} still standing · {WC.meta.teamsLeft} teams left</>}
          </div>
        </div>
      </div>
      {pre ? <FieldCard/> : <StageFunnel/>}
      <div style={{height:12}}/>
      {pre
        ? (function(){
            const preLines = [
              [`Not a ball kicked yet and Wheesht is already stressed. ${WC.meta.teamsLeft} nations. Anything could happen. Anything.`, 'nervous'],
              ['Pre-tournament. Everyone is optimistic. Wheesht finds optimism suspicious but is trying to be supportive.', 'mischievous'],
              [`${WC.meta.teamsLeft} teams and every single fan thinks their lot has a real shot this time. Wheesht is not here to crush dreams. Not yet.`, 'mischievous'],
              [`Before a ball is kicked, Wheesht would like to say: good luck to all ${WC.meta.teamsLeft} nations. Some will need it considerably more than others.`, 'confident'],
              [`It hasn't started and Wheesht is already emotionally prepared for chaos. ${WC.meta.teamsLeft} teams. It's going to be something.`, 'nervous'],
            ];
            const pl = preLines[P.length % preLines.length];
            return <WheeshtSays mood={pl[1]} label="broadcast mode" animate>{pl[0]}</WheeshtSays>;
          })()
        : (function(){
            const n = WC.meta.teamsLeft || 0;
            const p = function(arr){ return arr[n % arr.length]; };
            const pool =
              n >= 40 ? p([
                [`Still ${n} teams in it. We're barely getting started. Wheesht has clocked every single one of them, though.`, 'confident'],
                [`${n} nations left and everyone's convinced they're going all the way. Football is genuinely beautiful and delusional in equal measure.`, 'mischievous'],
                [`Early days. ${n} teams still standing. A few of them genuinely deserve to be there. The rest are on borrowed time. Wheesht knows which is which.`, 'mischievous'],
                [`Still a full field - ${n} going. The group stage is doing its job of separating the hopeful from the merely present.`, 'neutral'],
                [`${n} in it. Nobody's panicking. Nobody should be. Except perhaps two or three of them, who know who they are.`, 'confident'],
              ])
            : n >= 28 ? p([
                [`Down to ${n} and it's getting spicy. The group stage dished out justice. Mostly. Wheesht has a few questions about some of those results.`, 'mischievous'],
                [`${n} left standing. Some real surprises already. Some crushing inevitabilities. Wheesht is saying nothing about which is which.`, 'neutral'],
                [`Still ${n} in it and every one of them thinks the draw was kind. Half of them are wrong. This is what makes it brilliant.`, 'mischievous'],
                [`${n} nations remain. The quality is rising. The excuses are getting more creative. Wheesht is enjoying both.`, 'confident'],
                [`Groups done. ${n} survivors. A few upsets, a few collapses, and at least one result that has Wheesht still confused.`, 'shocked'],
              ])
            : n >= 16 ? p([
                [`Knockouts. ${n} teams left and none of them want to be next. The tension is real and Wheesht is absolutely feeling it.`, 'nervous'],
                [`${n} nations still in it and now there's no second chances. One bad day and you're on a plane home. Brutal. Wheesht respects this greatly.`, 'confident'],
                [`Last ${n}. The tournament is properly revealing itself now. Some of these stories are going to be extraordinary.`, 'celebrating'],
                [`${n} teams, and honestly? It's wide open. Anyone can win this. Some more than others. But still. Anyone. Basically.`, 'nervous'],
                [`Getting real now. ${n} teams, single elimination, no hiding. Wheesht is on the edge of the seat and not ashamed to admit it.`, 'nervous'],
              ])
            : n >= 8 ? p([
                [`Last ${n}. This is it now. The business end. Wheesht has been waiting for this since the draw.`, 'confident'],
                [`${n} teams left and every single match from here is a classic waiting to happen. Or a disaster. Usually both.`, 'mischievous'],
                [`Quarter-final territory. ${n} nations. The gap between winning this thing and going home early has never felt smaller.`, 'nervous'],
                [`${n} left and the quality is remarkable. Wheesht has watched every game and the scorelines do not tell the full story. None of them do.`, 'neutral'],
                [`Down to ${n}. At this point, the sweepstake is very much alive. Maybe. Check above. Could be brutal.`, 'mischievous'],
              ])
            : n >= 3 ? p([
                [`Final ${n}. Semi-final football. The best kind of football. Everything on the line. Wheesht is barely holding it together.`, 'nervous'],
                [`${n} teams left and they all deserve to be here. Mostly. One of them got lucky in the quarters and Wheesht saw it.`, 'mischievous'],
                [`Last ${n} standing in a 48-team tournament. Think about that. These teams earned it. Some of them. Wheesht is proud of most of them.`, 'celebrating'],
                [`${n} nations and a final to be decided. Wheesht has been watching since day one and is absolutely not going to predict the winner. Not after last time.`, 'nervous'],
              ])
            : n === 2 ? p([
                [`Two teams. One trophy. Someone in this sweepstake is about to be very happy or very quiet. Wheesht is excited. Don't tell anyone.`, 'celebrating'],
                ['Final two standing. Wheesht watched 47 other nations go home to get here. This better be worth it. It probably will be.', 'confident'],
                ['The finalists are set. Two nations, one cup, and a whole sweepstake hanging on ninety minutes. Wheesht is prepared. Mostly.', 'nervous'],
                ['Just two left. Wheesht has opinions on both of them. Has had since the group stage, frankly. Will be sharing some after the final whistle.', 'mischievous'],
              ])
            : p([
                [`We have our champion. What a tournament. The winner was the right winner. Wheesht is genuinely moved. Don't.`, 'celebrating'],
                [`It's done. One nation lifts the cup. Everyone else goes home. That's football. That's the whole of it. Wheesht loves this sport.`, 'celebrating'],
                ['Tournament over. Champion crowned. Wheesht has watched every minute and already wants to do it all again.', 'celebrating'],
                [`That's that. The best team won. Or the luckiest. Or a bit of both. Wheesht will debate this internally for years.`, 'mischievous'],
              ]);
            return <WheeshtSays mood={pool[1]} label="broadcast mode" animate>{pool[0]}</WheeshtSays>;
          })()}
      <div style={{display:'flex',gap:7,overflowX:'auto',padding:'16px 0 10px',margin:'0 -2px'}}>
        {filtersShown.map(([k,lab])=>(
          <button key={k} onClick={()=>setFilter(k)} className={'wc-chip'+(filter===k?' wc-chip--yellow':'')} style={{whiteSpace:'nowrap',cursor:'pointer',flex:'0 0 auto'}}>{lab}</button>
        ))}
      </div>
      {includeDept && <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:800,color:'var(--ink2)'}}>Dept</span>
        <select value={dept} onChange={e=>setDept(e.target.value)} style={{flex:1,border:'2px solid var(--line)',borderRadius:10,padding:'7px 10px',fontFamily:'var(--body)',fontWeight:700,fontSize:13,background:'#fff',color:'var(--ink)'}}>
          <option value="">All departments</option>
          {depts.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
      </div>}
      <Card flat style={{padding:'4px 14px'}}>
        {list.map(p=>{
          const open = selected && selected.id === p.id;
          return <React.Fragment key={p.id}>
            <PersonRow person={p} you={p.id===youId} pre={pre} onOpen={()=>selectPerson(p, open)}/>
            {open && <PersonSnapshot inline person={(window.Store && window.Store.getSync && window.Store.getSync(p.id)) || p} onClose={()=>preservePageScroll(function(){ setSelected(null); })} />}
          </React.Fragment>;
        })}
      </Card>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
window.TrackerScreen = TrackerScreen;
window.PersonSnapshot = PersonSnapshot;
