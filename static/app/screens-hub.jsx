/* ===========================================================================
   HUB SCREENS — Dashboard · Tracker · Side Bets · Weekly Summary
   =========================================================================== */
const WC = window.WC;
const { Card, Btn, Flag, Avatar, Chip, Stamp, ProgressRing, SegmentBar, WheeshtSays, SectionHead } = window;
const W = window.Wheesht;
const { useState: uState, useMemo: uMemo } = React;

function money(n){ return '£' + n.toLocaleString('en-GB'); }
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
  const potShare = Math.round(WC.POT*0.6);
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

function PersonRow(props){
  const p=props.person; const t=WC.TEAMS[p.team]||{code:p.team||'?',flag:'🏳️',rounds:0,stage:'group'}; const you=props.you;
  const pts = window.Store ? window.Store.predScoreOf(p) : (p.predScore||0);
  const includeDept = window.Store && window.Store.includeDepartment ? window.Store.includeDepartment() : true;
  return (
    <div style={{display:'flex',alignItems:'center',gap:9,padding:'9px 4px',borderBottom:'1.5px solid var(--line)',opacity:p.alive?1:.62}}>
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
    </div>
  );
}

function TrackerScreen(){
  const [filter,setFilter]=uState('all');
  const [dept,setDept]=uState('');
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
        ? <WheeshtSays mood="confident" label="broadcast mode" animate>Not a ball kicked yet — all {WC.meta.teamsLeft} still in. Wheesht is watching every single one of ye.</WheeshtSays>
        : <WheeshtSays mood="confident" label="broadcast mode" animate>The field’s thinning. <b>England</b> just went. Wheesht is, of course, saying nothing.</WheeshtSays>}
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
        {list.map(p=><PersonRow key={p.id} person={p} you={p.id===youId} pre={pre}/>)}
      </Card>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
window.TrackerScreen = TrackerScreen;
