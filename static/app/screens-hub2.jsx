/* ===========================================================================
   HUB SCREENS pt.2 — Side Bets (the eliminated experience) · Weekly Summary
   =========================================================================== */
const WC2 = window.WC;
const { Card: Card2, Btn: Btn2, Flag: Flag2, Avatar: Avatar2, Chip: Chip2, Stamp: Stamp2, ProgressRing: PR2, WheeshtSays: Says2, SectionHead: SH2 } = window;
const W2 = window.Wheesht;
const RS = React;

function money2(n){ return '£' + n.toLocaleString('en-GB'); }
function ownerName2(code){ const o = WC2.ownersOf(code); return o.length ? o[0].name : 'nobody'; }

/* =================== SIDE BETS =================== */
function Market(props){
  const [pick,setPick]=RS.useState(null);
  return (
    <Card2 style={{marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:9}}>
        <div className="dh" style={{fontSize:18,whiteSpace:'nowrap'}}>{props.title}</div>
        {pick!=null
          ? <Chip2 tone="green">Locked in</Chip2>
          : <Chip2 tone="red">Open</Chip2>}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:7}}>
        {props.options.map((o,i)=>{
          const on=pick===i;
          return (
            <button key={i} onClick={()=>setPick(on?null:i)} style={{
              display:'flex',alignItems:'center',gap:10,padding:'10px 12px',cursor:'pointer',textAlign:'left',
              border:'2.5px solid '+(on?'var(--ink)':'var(--line)'),borderRadius:13,
              background:on?'var(--yellow)':'#fff',fontFamily:'var(--body)',transition:'all .12s'}}>
              <span style={{fontSize:24}}>{o.flag}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:14}}>{o.name}</div>
                <div style={{fontSize:11.5,fontWeight:600,color:'var(--ink2)'}}>{o.sub}</div>
              </div>
              <span className="dh" style={{fontSize:15}}>{o.odds}</span>
              <span style={{width:22,height:22,borderRadius:'50%',border:'2.5px solid var(--ink)',background:on?'var(--ink)':'#fff',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:900}}>{on?'✓':''}</span>
            </button>
          );
        })}
      </div>
    </Card2>
  );
}

function SidePot(){
  const [amt,setAmt]=RS.useState(5);
  const base = WC2.meta.out*2;
  return (
    <Card2 bordered>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--ink2)'}}>The side pot</div>
          <div className="dh" style={{fontSize:34}}>{money2(base+amt)}</div>
        </div>
        <W2 mood="smug" size={64}/>
      </div>
      <div style={{fontSize:12,fontWeight:600,color:'var(--ink2)',margin:'2px 0 12px'}}>Voluntary buy-in. No pressure. Wheesht is just saying the leaderboard is right there.</div>
      <div style={{display:'flex',gap:8}}>
        {[0,5,10].map(v=>(
          <button key={v} onClick={()=>setAmt(v)} className="wc-btn wc-btn--sm" style={{flex:1,background:amt===v?'var(--yellow)':'#fff',boxShadow:amt===v?'0 4px 0 var(--ink)':'0 4px 0 var(--shadow)'}}>{v?money2(v):'Skip'}</button>
        ))}
      </div>
    </Card2>
  );
}

function SideBetsScreen(props){
  const elim = props.eliminated;
  const board = WC2.PEOPLE.filter(p=>!p.alive).map((p,i)=>({p,pts:((p.id.charCodeAt(1)*7+i*13)%40)+5})).sort((a,b)=>b.pts-a.pts).slice(0,7);
  return (
    <div className="pad">
      <div className="appbar" style={{padding:'2px 0 12px'}}>
        <div>
          <div className="dh" style={{fontSize:26}}>The Side Game</div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--ink2)'}}>For the fallen. And the about-to-fall.</div>
        </div>
      </div>
      {elim
        ? <Says2 mood="wounded" label="solemn" animate>{WC2.LINES.sideBets} <b>{WC2.LINES.sideBets2}</b></Says2>
        : <Says2 mood="suspicious" label="conspiratorial" animate>Ye’re still in. Smug, aren’t ye. The side game’s open already though — get yer picks in before the rest cotton on.</Says2>}
      <SH2>Your markets</SH2>
      <Market title="Golden Boot" options={[
        {flag:'🇫🇷',name:'K. Mbappé',sub:'France · 4 goals so far',odds:'2/1'},
        {flag:'🇪🇸',name:'L. Yamal',sub:'Spain · 3 goals',odds:'3/1'},
        {flag:'🇳🇴',name:'E. Haaland',sub:'Norway · 3 goals',odds:'7/2'},
        {flag:'🇧🇷',name:'Vinícius Jr',sub:'Brazil · 2 goals',odds:'5/1'},
      ]}/>
      <Market title="Golden Glove" options={[
        {flag:'🇪🇸',name:'Spain’s keeper',sub:'3 clean sheets',odds:'2/1'},
        {flag:'🇧🇷',name:'Brazil’s keeper',sub:'2 clean sheets',odds:'3/1'},
        {flag:'🇦🇷',name:'Argentina’s keeper',sub:'2 clean sheets',odds:'4/1'},
        {flag:'🇫🇷',name:'France’s keeper',sub:'2 clean sheets',odds:'9/2'},
      ]}/>
      <Market title="Dark horse to win it" options={[
        {flag:'🇭🇷',name:'Croatia',sub:'the people’s pick',odds:'12/1'},
        {flag:'🇺🇾',name:'Uruguay',sub:'quietly fancied',odds:'14/1'},
        {flag:'🇨🇴',name:'Colombia',sub:'flair merchants',odds:'16/1'},
        {flag:'🇯🇵',name:'Japan',sub:'the dark dark horse',odds:'22/1'},
      ]}/>
      <SH2>The kitty</SH2>
      <SidePot/>
      <SH2 aside="eliminated only">Side-bet leaderboard</SH2>
      <Card2 flat style={{padding:'4px 14px'}}>
        {board.map((b,i)=>(
          <div key={b.p.id} style={{display:'flex',alignItems:'center',gap:11,padding:'9px 2px',borderBottom:i<board.length-1?'1.5px solid var(--line)':'none'}}>
            <span className="dh" style={{fontSize:16,width:20,color:i===0?'var(--red)':'var(--ink2)'}}>{i+1}</span>
            <Avatar2 person={b.p} size={32}/>
            <div style={{flex:1,fontWeight:800,fontSize:14}}>{b.p.name}</div>
            <Chip2 tone={i===0?'yellow':'ghost'}>{b.pts} pts</Chip2>
          </div>
        ))}
      </Card2>
      <div style={{height:14}}/>
      <Says2 mood="smug" compact>We’re the ones watching objectively now. Arguably the better position.</Says2>
    </div>
  );
}

/* =================== THE VERDICT ===================
   Wheesht's running commentary — built ENTIRELY from what the organiser has
   actually entered (real fixtures/scores, real eliminations, a declared
   champion). Nothing is fabricated: if a result hasn't been logged, it isn't
   shown. Empty states keep the page honest before the football catches up. */

function vPeople(){ return window.Store ? window.Store.allSync() : (WC2.PEOPLE || []); }
function vTeam(code){ return WC2.TEAMS[code] || { code: code || '?', name: code || 'TBD', flag: '🏳️', group: '?', odds: '0', alive: true, rounds: 0 }; }
function vOwners(code){ return vPeople().filter(function(p){ return p.team === code; }); }
function vDoneFixtures(){ return (WC2.FIXTURES || []).filter(function(f){ return f.status === 'done' && f.score; }); }
function vAnswer(key){ const m = (WC2.PREDICTIONS || []).find(function(x){ return x.key === key; }); return m ? m.answer : null; }
function vEliminated(){ return WC2.TEAM_LIST.filter(function(t){ return !t.alive; }); }
function vPot(){ return window.Store ? window.Store.pot() : WC2.POT * 0.5; }
function vCharity(){ return window.Store ? window.Store.charity() : WC2.POT * 0.5; }

/* A short, in-voice line for a logged result — homeland bias, dry on England. */
function vResultNote(f){
  const a = f.score[0], b = f.score[1];
  const ta = vTeam(f.a), tb = vTeam(f.b);
  const draw = a === b, aWin = a > b;
  const wN = aWin ? ta.name : tb.name, lN = aWin ? tb.name : ta.name;
  if (f.a === 'SCO' || f.b === 'SCO'){
    const scoWon = (f.a === 'SCO' && aWin) || (f.b === 'SCO' && !aWin);
    if (draw) return 'Scotland share the spoils. Wheesht calls it a moral victory.';
    return scoWon ? 'The homeland delivers. Wheesht needs a quiet minute.' : 'Scotland fall. Wheesht is fine. Wheesht is always fine.';
  }
  if (f.a === 'ENG' || f.b === 'ENG'){
    const engWon = (f.a === 'ENG' && aWin) || (f.b === 'ENG' && !aWin);
    if (draw) return 'England draw. Wheesht is remaining professional. Barely.';
    return engWon ? 'England win. Wheesht is noting it down without comment.' : 'England lose. Wheesht has no comment — and a small, private smile.';
  }
  if (draw) return wN + ' and ' + lN + ' share the points. Wheesht has seen worse.';
  if (Math.abs(a - b) >= 3) return wN + ' take ' + lN + ' apart. Wheesht is a wee bit frightened.';
  return wN + ' edge ' + lN + '. Result logged. Wheesht remembers everything.';
}

function StatCard(props){
  return (
    <Card2 flat style={{padding:'12px 14px'}}>
      <div className="dh" style={{fontSize:28,color:props.color||'var(--ink)',lineHeight:1.05}}>{props.value}</div>
      <div style={{fontSize:12,fontWeight:700,color:'var(--ink2)'}}>{props.label}</div>
    </Card2>
  );
}

function VerdictHeader(props){
  return (
    <div className="appbar" style={{padding:'2px 0 12px'}}>
      <div>
        <div className="dh" style={{fontSize:26}}>The Verdict</div>
        <div style={{fontSize:13,fontWeight:600,color:'var(--ink2)'}}>{props.sub}</div>
      </div>
    </div>
  );
}

function StandingsBlock(){
  // Pot / charity / entrants / fee — always true, drawn from live numbers.
  const P = vPeople();
  const cells = [
    { v: money2(vPot()), l: 'winner takes all', c: 'var(--green)' },
    { v: money2(vCharity()), l: 'raised for charity', c: 'var(--red)' },
    { v: P.length, l: P.length === 1 ? 'entrant' : 'entrants', c: 'var(--ink)' },
    { v: '£' + (WC2.FEE || 0), l: 'to enter', c: 'var(--ink)' },
  ];
  return (
    <>
      <SH2>Where it stands</SH2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
        {cells.map(function(s,i){ return <StatCard key={i} value={s.v} label={s.l} color={s.c}/>; })}
      </div>
    </>
  );
}

/* ---- PRE: nothing has kicked off; keep it honest and inviting. ---- */
function PreVerdict(){
  const P = vPeople();
  const claimed = new Set(P.map(function(p){ return p.team; })).size;
  return (
    <div className="pad">
      <VerdictHeader sub="Wheesht’s desk — open for business, awaiting the first whistle."/>
      <Says2 mood="confident" label="not started" animate>Nae ball kicked yet. The slate’s clean, the predictions are open, and Wheesht is sharpening the pencil. This page fills up the moment the football starts.</Says2>
      <SH2>Tournament status</SH2>
      <Card2 bordered style={{background:'var(--ink)',color:'#fff',textAlign:'center',padding:'22px 16px'}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:'.1em',color:'var(--yellow)',textTransform:'uppercase'}}>Countdown</div>
        <div className="dh" style={{fontSize:32,margin:'4px 0 2px',color:'#fff'}}>Not yet under way</div>
        <div style={{fontSize:13,fontWeight:600,opacity:.8}}>Kick-off {WC2.meta.kickoff || 'soon'} · {WC2.meta.season}</div>
      </Card2>
      <StandingsBlock/>
      <SH2>Before the whistle</SH2>
      {[
        {m:'mischievous',t:'Predictions are open',d:'Get yer calls in before kick-off. Wheesht will remember every single one.'},
        {m:'scottish',t:'The homeland watch',d:'Scotland are in the draw. Wheesht is, as ever, completely impartial about this.'},
        {m:'confident',t:'The pot grows with every sign-up',d:claimed + ' teams claimed so far. More entrants, bigger pot, more folk for Wheesht to judge.'},
      ].map(function(n,i){ return (
        <Card2 key={i} style={{marginBottom:9,display:'flex',gap:11,alignItems:'center'}}>
          <W2 mood={n.m} size={48}/>
          <div style={{flex:1}}>
            <div className="dh" style={{fontSize:16}}>{n.t}</div>
            <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink2)',lineHeight:1.3}}>{n.d}</div>
          </div>
        </Card2>
      ); })}
    </div>
  );
}

/* ---- The champion card — only painted when the organiser declares a winner. ---- */
function ChampionCard(){
  const code = vAnswer('winner');           // set in the organiser's clipboard
  if (!code) return null;
  const t = vTeam(code);
  const owners = vOwners(code);
  const win = vPot();
  return (
    <>
      <SH2>Champions of the world</SH2>
      <Card2 bordered className="pop" style={{background:'var(--yellow)',textAlign:'center',padding:'22px 18px'}}>
        <div style={{fontSize:56,lineHeight:1}}>{t.flag}</div>
        <div className="dh" style={{fontSize:34,marginTop:6}}>{t.name}</div>
        <div style={{fontSize:12.5,fontWeight:800,letterSpacing:'.05em',textTransform:'uppercase',color:'var(--ink2)',marginTop:4}}>Lift the trophy</div>
        {owners.length > 0 && (
          <div style={{marginTop:14,background:'var(--ink)',color:'#fff',borderRadius:16,padding:'13px 14px'}}>
            <div style={{fontSize:11,fontWeight:800,letterSpacing:'.05em',textTransform:'uppercase',color:'var(--yellow)'}}>Your sweepstake winner{owners.length>1?'s':''}</div>
            <div className="dh" style={{fontSize:24,margin:'4px 0',color:'#fff'}}>{owners.map(function(o){ return o.name; }).join(', ')}</div>
            <div className="dh" style={{fontSize:34,color:'var(--yellow)'}}>{money2(owners.length>1 ? win/owners.length : win)}</div>
            <div style={{fontSize:12,fontWeight:700,opacity:.8}}>held {t.name} from the very first draw. Insufferable. Deserved.</div>
          </div>
        )}
      </Card2>
    </>
  );
}

/* ---- LIVE / DONE: built from real, organiser-entered results. ---- */
function LiveVerdict(){
  const done = vDoneFixtures().slice().sort(function(a,b){ return (b.dateISO||'').localeCompare(a.dateISO||'') || (b.time||'').localeCompare(a.time||''); });
  const recent = done.slice(0, 6);
  const goals = done.reduce(function(s,f){ return s + (f.score[0]||0) + (f.score[1]||0); }, 0);
  const teamsLeft = WC2.TEAM_LIST.filter(function(t){ return t.alive; }).length;
  const elim = vEliminated().map(function(t){ return { t: t, owners: vOwners(t.code) }; }).filter(function(x){ return x.owners.length > 0; });
  const phaseDone = WC2.meta.phase === 'done';
  const hasResults = done.length > 0;

  return (
    <div className="pad">
      <VerdictHeader sub={phaseDone ? 'Full time on the whole thing — Wheesht’s last word.' : 'Wheesht’s running commentary, now the football has started.'}/>
      <Says2 mood="broadcast" label={phaseDone?'full time':'live'} animate>
        {phaseDone
          ? 'That’s yer lot. Wheesht has watched every minute, taken every note, and is ready to deliver the final word.'
          : 'The whistle’s gone. Wheesht is watching every one of ye, logging every result, and judging — gently, professionally, constantly.'}
      </Says2>

      <ChampionCard/>

      <SH2 aside={hasResults ? done.length + ' logged' : null}>What’s happened</SH2>
      {!hasResults
        ? <Card2 flat style={{textAlign:'center',padding:'26px 16px'}}>
            <W2 mood="neutral" size={56} animate/>
            <div className="dh" style={{fontSize:17,marginTop:6}}>No full-time results yet.</div>
            <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink2)',marginTop:3}}>As the organiser logs scores in the clipboard, Wheesht’s verdict fills in here.</div>
          </Card2>
        : recent.map(function(f){
            const ta = vTeam(f.a), tb = vTeam(f.b);
            const aWin = f.score[0] > f.score[1], bWin = f.score[1] > f.score[0];
            return (
              <Card2 key={f.id} style={{marginBottom:9,padding:'12px 14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:22}}>{ta.flag}</span>
                  <span style={{flex:1,fontWeight:800,fontSize:14,textAlign:'right',opacity:bWin?.5:1,textDecoration:bWin?'line-through':'none'}}>{ta.name}</span>
                  <span className="dh" style={{fontSize:20,padding:'0 4px'}}>{f.score[0]}–{f.score[1]}</span>
                  <span style={{flex:1,fontWeight:800,fontSize:14,opacity:aWin?.5:1,textDecoration:aWin?'line-through':'none'}}>{tb.name}</span>
                  <span style={{fontSize:22}}>{tb.flag}</span>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'flex-start',marginTop:9,paddingTop:9,borderTop:'1.5px solid var(--line)'}}>
                  <span style={{fontSize:11,fontWeight:800,letterSpacing:'.05em',textTransform:'uppercase',color:'var(--red)',whiteSpace:'nowrap'}}>FT · Gp {f.group}</span>
                  <span style={{flex:1,fontSize:12.5,fontWeight:600,color:'var(--ink2)',lineHeight:1.32}}>{vResultNote(f)}</span>
                </div>
              </Card2>
            );
          })}

      <SH2>The damage</SH2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
        <StatCard value={done.length} label={done.length===1?'game played':'games played'}/>
        <StatCard value={goals} label={goals===1?'goal scored':'goals scored'} color="var(--green)"/>
        <StatCard value={teamsLeft} label="teams still in"/>
        <StatCard value={elim.length} label="entrants knocked out" color={elim.length?'var(--red)':'var(--ink)'}/>
      </div>

      {elim.length > 0 && <>
        <SH2 aside="owners flip to the side game">Knocked out</SH2>
        <Card2 flat style={{padding:'4px 14px'}}>
          {elim.map(function(x,i){ return (
            <div key={x.t.code} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:i<elim.length-1?'1.5px solid var(--line)':'none'}}>
              <Flag2 team={x.t} size={24}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,fontSize:14,textDecoration:'line-through',textDecorationColor:'var(--red)'}}>{x.t.name}</div>
                <div style={{fontSize:11.5,fontWeight:700,color:'var(--ink2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.owners.map(function(o){ return o.name; }).join(', ')}</div>
              </div>
              <Stamp2 tone="red" rotate={-5} style={{fontSize:10.5}}>OUT</Stamp2>
            </div>
          ); })}
        </Card2>
      </>}

      <StandingsBlock/>

      <div style={{height:16}}/>
      <Btn2 variant="ink" block onClick={function(){ window.wcConfetti&&window.wcConfetti({y:.5}); window.wcToast&&window.wcToast('Share card saved. Show the group chat who’s boss.','celebrating'); }}>Make my share card 📸</Btn2>
    </div>
  );
}

function SummaryScreen(props){
  return (WC2.meta.phase === 'pre') ? <PreVerdict/> : <LiveVerdict/>;
}

window.SideBetsScreen = SideBetsScreen;
window.SummaryScreen = SummaryScreen;
