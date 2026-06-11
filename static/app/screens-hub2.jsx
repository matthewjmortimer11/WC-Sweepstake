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

/* =================== WEEKLY SUMMARY =================== */
function StatStrip(){
  const stats=[['8','ties played'],['1','massive upset'],['3–0','biggest hiding'],[WC2.meta.stillIn,'still standing']];
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
      {stats.map((s,i)=>(
        <Card2 key={i} flat style={{padding:'12px 14px'}}>
          <div className="dh" style={{fontSize:30}}>{s[0]}</div>
          <div style={{fontSize:12,fontWeight:700,color:'var(--ink2)'}}>{s[1]}</div>
        </Card2>
      ))}
    </div>
  );
}

function leagueRows(){
  const exp = o=>{ const v=parseInt(o.slice(1)); if(v<=1000)return 4; if(v<=5000)return 3; if(v<=20000)return 2; return 1; };
  const rows = WC2.PEOPLE.filter(p=>!p.isYou).map(p=>{ const t=WC2.TEAMS[p.team]; return {p,t,delta:t.rounds-exp(t.odds)}; });
  rows.sort((a,b)=>b.delta-a.delta);
  return { over: rows.slice(0,3), under: rows.slice(-3).reverse() };
}

function PreVerdict(){
  const P = window.Store ? window.Store.allSync() : WC2.PEOPLE;
  const claimed = new Set(P.map(p=>p.team)).size;
  return (
    <div className="pad">
      <div className="appbar" style={{padding:'2px 0 12px'}}>
        <div>
          <div className="dh" style={{fontSize:26}}>The Verdict</div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--ink2)'}}>Wheesht’s running commentary — once there’s something to comment on.</div>
        </div>
      </div>
      <Says2 mood="confident" label="pre-match" animate>Not a ball kicked yet. Wheesht is loosening the whistle, ironing the tartan, and watching every one of ye. Get yer predictions in.</Says2>
      <SH2>Countdown</SH2>
      <Card2 bordered style={{background:'var(--ink)',color:'#fff',textAlign:'center',padding:'22px 16px'}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:'.1em',color:'var(--yellow)',textTransform:'uppercase'}}>First whistle</div>
        <div className="dh" style={{fontSize:34,margin:'4px 0 2px',color:'#fff'}}>{WC2.meta.kickoff || 'Soon'}</div>
        <div style={{fontSize:13,fontWeight:600,opacity:.8}}>Group stage kicks off · {WC2.meta.season}</div>
      </Card2>
      <SH2>Where it stands</SH2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
        {[[money2(window.Store?window.Store.pot():WC2.POT*0.5),'winner takes all'],[money2(window.Store?window.Store.charity():WC2.POT*0.5),'raised for charity'],[P.length,P.length===1?'entrant':'entrants'],['£'+WC2.FEE,'to enter']].map((s,i)=>(
          <Card2 key={i} flat style={{padding:'12px 14px'}}>
            <div className="dh" style={{fontSize:28,color:i===0?'var(--green)':(i===1?'var(--red)':'var(--ink)')}}>{s[0]}</div>
            <div style={{fontSize:12,fontWeight:700,color:'var(--ink2)'}}>{s[1]}</div>
          </Card2>
        ))}
      </div>
      <SH2>Wheesht’s pre-match notes</SH2>
      {[
        {m:'mischievous',t:'Predictions close at kick-off',d:'Every market’s open. After the first whistle, no takebacks. Wheesht has a long memory.'},
        {m:'scottish',t:'The homeland watch',d:'Scotland are in the draw. Wheesht is, as ever, completely impartial about this.'},
        {m:'confident',t:'The pot grows with every sign-up',d:'Drag a colleague in. More entrants, bigger pot, more folk for Wheesht to judge.'},
      ].map((n,i)=>(
        <Card2 key={i} style={{marginBottom:9,display:'flex',gap:11,alignItems:'center'}}>
          <W2 mood={n.m} size={48}/>
          <div style={{flex:1}}>
            <div className="dh" style={{fontSize:16}}>{n.t}</div>
            <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink2)',lineHeight:1.3}}>{n.d}</div>
          </div>
        </Card2>
      ))}
    </div>
  );
}

function SummaryScreen(props){
  if (WC2.meta.phase === 'pre') return <PreVerdict/>;
  const lg = leagueRows();
  const news=[
    {m:'outraged',t:'Norway 2–1 England',d:'Last minute. England out. Wheesht has no comment and a lot of comments.'},
    {m:'neutral',t:'Spain 3–0 Morocco',d:'Exactly as Wheesht predicted. Wheesht always predicts it.'},
    {m:'delighted',t:'Scotland’s group-stage heroics',d:'Out of the group with Brazil. Wheesht still hasn’t stopped talking about it.'},
  ];
  return (
    <div className="pad">
      <div className="appbar" style={{padding:'2px 0 12px'}}>
        <div>
          <div className="dh" style={{fontSize:26}}>Monday Verdict</div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--ink2)'}}>Week 3 · the {WC2.meta.stageLabel}</div>
        </div>
      </div>
      <Says2 mood="broadcast" label="broadcast mode" animate>Right. Settle down. Wheesht has watched every minute, as always, with total impartiality.</Says2>
      <SH2>The damage</SH2>
      <StatStrip/>
      <SH2>What happened</SH2>
      {news.map((n,i)=>(
        <Card2 key={i} style={{marginBottom:9,display:'flex',gap:11,alignItems:'center'}}>
          <W2 mood={n.m} size={48}/>
          <div style={{flex:1}}>
            <div className="dh" style={{fontSize:16}}>{n.t}</div>
            <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink2)',lineHeight:1.3}}>{n.d}</div>
          </div>
        </Card2>
      ))}
      <SH2>Week in two faces</SH2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
        <Card2 bordered style={{background:'rgba(26,122,68,.08)'}}>
          <Chip2 tone="green">Good week</Chip2>
          <div className="dh" style={{fontSize:18,margin:'8px 0 2px'}}>{ownerName2('NOR')}</div>
          <div style={{fontSize:12,fontWeight:600,color:'var(--ink2)'}}>Norway’s into the last 8. Insufferable about it. Earned it.</div>
        </Card2>
        <Card2 bordered style={{background:'rgba(232,39,42,.07)'}}>
          <Chip2 tone="red">Nightmare</Chip2>
          <div className="dh" style={{fontSize:18,margin:'8px 0 2px'}}>{ownerName2('ENG')}</div>
          <div style={{fontSize:12,fontWeight:600,color:'var(--ink2)'}}>Held England. Held them right up to the 89th minute.</div>
        </Card2>
      </div>
      <SH2>Pull quote of the week</SH2>
      <Card2 bordered style={{background:'var(--ink)',color:'#fff'}}>
        <div style={{display:'flex',gap:10}}>
          <W2 mood="smug" size={70}/>
          <div className="dh" style={{fontSize:21,lineHeight:1.05,color:'#fff'}}>
            “England out in the Round of 16. Wheesht is <span style={{color:'var(--yellow)'}}>remaining professional.</span> Next question.”
          </div>
        </div>
      </Card2>
      <SH2 aside="draw quality vs result">The league within the league</SH2>
      <Card2 flat style={{padding:'12px 14px'}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:'.05em',color:'var(--green)',textTransform:'uppercase',marginBottom:6}}>Punching above their draw</div>
        {lg.over.map(r=><LeagueRow key={r.p.id} r={r}/>)}
        <div style={{fontSize:11,fontWeight:800,letterSpacing:'.05em',color:'var(--red)',textTransform:'uppercase',margin:'12px 0 6px'}}>Wasted a cracking draw</div>
        {lg.under.map(r=><LeagueRow key={r.p.id} r={r}/>)}
      </Card2>
      <div style={{height:16}}/>
      <Btn2 variant="ink" block onClick={()=>{ window.wcConfetti&&window.wcConfetti({y:.5}); window.wcToast&&window.wcToast('Share card saved. Show the group chat who’s boss.','delighted'); }}>Make my share card 📸</Btn2>
    </div>
  );
  function LeagueRow(p){
    const {r}=p; const up=r.delta>=0;
    return <div style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0'}}>
      <Avatar2 person={r.p} size={30}/>
      <div style={{flex:1,fontWeight:700,fontSize:13.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.p.name}</div>
      <Flag2 team={r.t} size={20}/>
      <span style={{fontSize:12,fontWeight:700,color:'var(--ink2)',width:30}}>{r.t.code}</span>
      <span className="dh" style={{fontSize:15,color:up?'var(--green)':'var(--red)',width:30,textAlign:'right'}}>{up?'+':''}{r.delta}</span>
    </div>;
  }
}

window.SideBetsScreen = SideBetsScreen;
window.SummaryScreen = SummaryScreen;
