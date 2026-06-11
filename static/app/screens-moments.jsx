/* ===========================================================================
   MOMENT SCREENS — full-screen takeovers
   Entry & Setup · The Draw · Result & Commentary · The Final
   =========================================================================== */
const WCm = window.WC; const Wm = window.Wheesht;
const { Card:Cm, Btn:Bm, Flag:Fm, Avatar:Am, Chip:Chm, Stamp:Stm } = window;
const Rm = React;

const inputStyle = {
  width:'100%', border:'2.5px solid var(--ink)', borderRadius:13, padding:'13px 14px',
  fontFamily:'var(--body)', fontWeight:600, fontSize:16, background:'#fff', color:'var(--ink)',
  outline:'none', marginTop:6,
};
function Label(p){ return <label style={{fontWeight:800,fontSize:13,fontFamily:'var(--disp)',letterSpacing:'.02em'}}>{p.children}</label>; }

/* =================== ENTRY & SETUP =================== */
function EntryMoment(props){
  const [name,setName]=Rm.useState('');
  const [city,setCity]=Rm.useState('London');
  const [wish,setWish]=Rm.useState('');
  function go(){
    if(name.trim()){ WCm.YOU.name = name.trim(); WCm.YOU.initials='YOU'; }
    if(wish.trim()) WCm.YOU.wish = wish.trim();
    props.onDone();
  }
  return (
    <div className="moment">
      <div className="mscroll" style={{padding:'30px 22px 30px'}}>
        <div style={{textAlign:'center'}}>
          <div style={{display:'inline-block'}} className="pop"><Wm mood="welcome" size={150} animate/></div>
          <div className="dh" style={{fontSize:34,marginTop:6,lineHeight:.98}}>Right.<br/>Let’s get this started.</div>
          <div style={{display:'inline-flex',marginTop:12,background:'var(--ink)',color:'#fff',borderRadius:'16px 16px 16px 5px',padding:'10px 14px',maxWidth:300}}>
            <div style={{fontSize:14,fontWeight:600,lineHeight:1.35}}><span style={{color:'var(--yellow)',fontWeight:800}}>Wheesht is watching.</span> Officially impartial. Constitutionally otherwise.</div>
          </div>
        </div>

        <div style={{marginTop:24,display:'flex',flexDirection:'column',gap:15}}>
          <div><Label>Your name</Label>
            <input style={inputStyle} value={name} onChange={e=>setName(e.target.value)} placeholder="What do we call ye?"/></div>
          <div><Label>Your city</Label>
            <div style={{display:'flex',gap:8,marginTop:6}}>
              {['London','Edinburgh','Remote'].map(c=>(
                <button key={c} onClick={()=>setCity(c)} className="wc-btn wc-btn--sm" style={{flex:1,background:city===c?'var(--yellow)':'#fff',boxShadow:city===c?'0 4px 0 var(--ink)':'0 4px 0 var(--shadow)'}}>{c}</button>
              ))}
            </div></div>
          <div><Label>The team ye wish you’d drawn <span style={{color:'var(--ink2)',fontWeight:600}}>(optional)</span></Label>
            <input style={inputStyle} value={wish} onChange={e=>setWish(e.target.value)} placeholder="We won’t tell. Wheesht might."/></div>
        </div>

        <Cm bordered style={{marginTop:18,background:'var(--yellow)'}}>
          <div style={{fontSize:12,fontWeight:800,letterSpacing:'.05em',textTransform:'uppercase'}}>Your buy-in</div>
          <div className="dh" style={{fontSize:30,margin:'2px 0 4px'}}>You’re putting in £20.</div>
          <div style={{fontSize:14,fontWeight:600}}>That’s <b>4 pints in Edinburgh</b>, <b>11 in Buenos Aires</b>, or one very optimistic claim on {WCm.POT.toLocaleString('en-GB')} quid.</div>
        </Cm>

        <div style={{marginTop:18,display:'flex',flexDirection:'column',gap:10}}>
          <Bm variant="ink" block onClick={go}>See the draw →</Bm>
          <div style={{textAlign:'center',fontSize:13,fontWeight:700,color:'var(--ink2)'}}>or <span style={{textDecoration:'underline'}}>enter a group code</span></div>
        </div>
      </div>
    </div>
  );
}

/* =================== THE DRAW =================== */
function DrawMoment(props){
  const [phase,setPhase]=Rm.useState('ready'); // ready | rolling | revealed
  const [idx,setIdx]=Rm.useState(0);
  const teams=WCm.TEAM_LIST;
  const target=teams.findIndex(t=>t.code==='CRO');
  const timer=Rm.useRef(null);

  function spin(){
    setPhase('rolling');
    const fast=24, slow=11, total=fast+slow;
    let k=0;
    function step(){
      k++;
      if(k>=total){ setIdx(target); setPhase('revealed'); window.wcConfetti&&window.wcConfetti({y:.4,count:170}); return; }
      setIdx(k % teams.length);
      const into = k-fast;
      const delay = into<=0 ? 48 : 48 + into*into*3.2;
      timer.current=setTimeout(step,delay);
    }
    timer.current=setTimeout(step,48);
  }
  Rm.useEffect(()=>()=>clearTimeout(timer.current),[]);

  const cur=teams[idx];
  const t=WCm.TEAMS['CRO'];
  return (
    <div className="moment ink">
      <div className="mscroll" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100%',padding:'30px 22px',textAlign:'center'}}>
        {phase!=='revealed' && <>
          <div className="dh" style={{fontSize:14,letterSpacing:'.16em',color:'var(--yellow)'}}>THE DRAW</div>
          <div style={{margin:'14px 0'}}><Wm mood="drumroll" size={130} animate={phase==='rolling'}/></div>
          <div className="dh" style={{fontSize:24,lineHeight:1.02,maxWidth:300}}>
            {phase==='ready'?'Wheesht is administering the draw. Personally.':'…'}
          </div>
          <div style={{margin:'22px auto',width:200,height:200,borderRadius:28,border:'4px solid var(--yellow)',background:'#000',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 0 6px rgba(245,200,0,.18)',overflow:'hidden'}}>
            <span style={{fontSize:108,lineHeight:1,filter: phase==='rolling'?'blur(1px)':'none'}}>{cur.flag}</span>
          </div>
          {phase==='ready'
            ? <Bm variant="primary" onClick={spin} style={{marginTop:6}}>Do the draw</Bm>
            : <div className="dh" style={{fontSize:16,color:'var(--yellow)',marginTop:6}}>Drawing…</div>}
        </>}

        {phase==='revealed' && <div className="pop" style={{width:'100%'}}>
          <div className="dh" style={{fontSize:14,letterSpacing:'.16em',color:'var(--yellow)'}}>YE’VE DRAWN</div>
          <div style={{fontSize:120,lineHeight:1,margin:'10px 0'}}>{t.flag}</div>
          <div className="dh" style={{fontSize:44}}>{t.name}</div>
          <div style={{display:'flex',gap:8,justifyContent:'center',margin:'12px 0 4px'}}>
            <Chm tone="yellow">Group {t.group}</Chm>
            <Chm style={{background:'#fff'}}>Odds {t.odds}</Chm>
          </div>
          <div style={{marginTop:18,display:'flex',gap:11,alignItems:'flex-end',textAlign:'left',background:'#fff',color:'var(--ink)',borderRadius:18,padding:14}}>
            <Wm mood="suspicious" size={70}/>
            <div>
              <div className="dh" style={{fontSize:11,letterSpacing:'.06em',color:'var(--red)'}}>WHEESHT’S VERDICT</div>
              <div style={{fontSize:15,fontWeight:600,lineHeight:1.32,marginTop:3}}>{WCm.LINES.drawYou}</div>
            </div>
          </div>
          <div style={{marginTop:18,display:'flex',flexDirection:'column',gap:10}}>
            <Bm variant="primary" block onClick={()=>{window.wcToast&&window.wcToast('Draw shared to the group. The slagging begins.','smug');}}>Share your draw to the group</Bm>
            <Bm variant="ghost" block onClick={props.onDone} style={{background:'transparent',color:'#fff',boxShadow:'0 4px 0 rgba(255,255,255,.25)'}}>Into the dashboard →</Bm>
          </div>
        </div>}
      </div>
    </div>
  );
}

/* =================== RESULT & COMMENTARY =================== */
const SEED_REACTIONS=[
  {who:'Davie M.',e:'😱'},{who:'Sarah from Sales',e:'💀'},{who:'Big Steve',e:'😭'},{who:'Priya K.',e:'🍿'},{who:'Rab',e:'🏴󠁧󠁢󠁳󠁣󠁴󠁿'},
];
function ResultMoment(props){
  const A=WCm.TEAMS['NOR'],B=WCm.TEAMS['ENG'];
  const [reacts,setReacts]=Rm.useState(SEED_REACTIONS);
  function react(e){ setReacts(r=>[{who:'You',e}].concat(r)); }
  return (
    <div className="moment ink">
      <div className="mscroll" style={{padding:'26px 22px 30px'}}>
        <div className="dh" style={{textAlign:'center',fontSize:13,letterSpacing:'.16em',color:'var(--yellow)'}}>FULL TIME · ROUND OF 16</div>
        <Stm tone="red" rotate={4} style={{display:'block',width:'fit-content',margin:'12px auto 0',fontSize:13,background:'rgba(232,39,42,.12)'}}>UPSET</Stm>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14,margin:'16px 0'}}>
          <div style={{textAlign:'center'}}><div style={{fontSize:64}}>{A.flag}</div><div className="dh" style={{fontSize:16,marginTop:4}}>Norway</div></div>
          <div className="dh" style={{fontSize:54,whiteSpace:'nowrap'}}>2–1</div>
          <div style={{textAlign:'center',opacity:.55}}><div style={{fontSize:64}}>{B.flag}</div><div className="dh" style={{fontSize:16,marginTop:4,textDecoration:'line-through'}}>England</div></div>
        </div>

        <div style={{display:'flex',gap:11,alignItems:'flex-end',background:'#fff',color:'var(--ink)',borderRadius:18,padding:14}}>
          <Wm mood="england" size={78} animate/>
          <div><div className="dh" style={{fontSize:11,letterSpacing:'.06em',color:'var(--red)'}}>WHEESHT’S POST-MATCH</div>
            <div style={{fontSize:15,fontWeight:600,lineHeight:1.32,marginTop:3}}>{WCm.LINES.england}</div></div>
        </div>

        {/* official elimination statement */}
        <div style={{marginTop:16,background:'#000',border:'2px solid #333',borderRadius:18,padding:16}}>
          <div className="dh" style={{fontSize:11,letterSpacing:'.16em',color:'#888'}}>★ OFFICIAL STATEMENT ★</div>
          <div style={{display:'flex',alignItems:'center',gap:10,margin:'10px 0'}}>
            <Am person={WCm.ownersOf('ENG')[0]} size={40}/>
            <div><div className="dh" style={{fontSize:18,color:'#fff'}}>{ownerName_m('ENG')}</div>
              <Stm tone="red" rotate={-5} style={{fontSize:11,marginTop:3}}>ELIMINATED</Stm></div>
          </div>
          <div style={{fontSize:13,fontWeight:500,color:'#ccc',lineHeight:1.4,fontStyle:'italic'}}>“Your England are out. Wheesht is sorry for your loss. Wheesht is, however, fine.”</div>
        </div>

        {/* reactions */}
        <div className="dh" style={{fontSize:13,letterSpacing:'.08em',color:'var(--yellow)',margin:'20px 0 8px'}}>THE GROUP CHAT</div>
        <div style={{display:'flex',gap:7,marginBottom:12}}>
          {['😱','💀','😭','🍿','🤣','🔥'].map(e=>(
            <button key={e} onClick={()=>react(e)} style={{flex:1,fontSize:22,padding:'8px 0',background:'#fff',border:'2.5px solid var(--ink)',borderRadius:13,cursor:'pointer'}}>{e}</button>
          ))}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {reacts.map((r,i)=>(
            <div key={i} className={i===0?'rise':''} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,.07)',borderRadius:12,padding:'8px 12px'}}>
              <span style={{fontSize:13,fontWeight:800,flex:1,color:r.who==='You'?'var(--yellow)':'#fff'}}>{r.who}</span>
              <span style={{fontSize:22}}>{r.e}</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:18}}><Bm variant="primary" block onClick={props.onDone}>Done. Survived. Barely. →</Bm></div>
      </div>
    </div>
  );
  function ownerName_m(c){ const o=WCm.ownersOf(c); return o.length?o[0].name:'nobody'; }
}

/* =================== THE FINAL =================== */
function Countdown(){
  const [s,setS]=Rm.useState(2*3600+14*60+9);
  Rm.useEffect(()=>{ const id=setInterval(()=>setS(x=>x>0?x-1:0),1000); return ()=>clearInterval(id); },[]);
  const hh=String(Math.floor(s/3600)).padStart(2,'0');
  const mm=String(Math.floor((s%3600)/60)).padStart(2,'0');
  const ss=String(s%60).padStart(2,'0');
  return (
    <div style={{display:'flex',gap:8,justifyContent:'center'}}>
      {[[hh,'HRS'],[mm,'MIN'],[ss,'SEC']].map((u,i)=>(
        <div key={i} style={{background:'#000',border:'2.5px solid var(--yellow)',borderRadius:13,padding:'8px 12px',minWidth:60,textAlign:'center'}}>
          <div className="dh" style={{fontSize:30,color:'#fff'}}>{u[0]}</div>
          <div style={{fontSize:10,fontWeight:800,letterSpacing:'.1em',color:'var(--yellow)'}}>{u[1]}</div>
        </div>
      ))}
    </div>
  );
}
function FinalMoment(props){
  const [done,setDone]=Rm.useState(false);
  const A=WCm.TEAMS['ESP'],B=WCm.TEAMS['FRA'];
  const champOwner=WCm.ownersOf('ESP')[0];
  const win=Math.round(WCm.POT*0.6);
  function play(){
    setDone(true);
    window.wcConfetti&&window.wcConfetti({count:240,y:.35});
    setTimeout(()=>window.wcConfetti&&window.wcConfetti({count:160,x:.25,y:.4}),500);
    setTimeout(()=>window.wcConfetti&&window.wcConfetti({count:160,x:.75,y:.4}),900);
  }
  return (
    <div className="moment ink">
      <div className="mscroll" style={{padding:'26px 22px 30px',textAlign:'center'}}>
        {!done && <>
          <div className="dh" style={{fontSize:14,letterSpacing:'.16em',color:'var(--yellow)'}}>THE FINAL</div>
          <div style={{fontSize:13,fontWeight:700,color:'#bbb',marginTop:4}}>{WCm.meta.finalVenue} · {WCm.meta.finalDate}</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,margin:'20px 0'}}>
            <Final1 t={A}/>
            <Wm mood="broadcast" size={92} animate/>
            <Final1 t={B}/>
          </div>
          <div style={{margin:'8px 0 18px'}}><Countdown/></div>
          <div style={{background:'#fff',color:'var(--ink)',borderRadius:18,padding:14,display:'flex',gap:11,alignItems:'flex-end',textAlign:'left'}}>
            <Wm mood="drumroll" size={70}/>
            <div style={{fontSize:15,fontWeight:600,lineHeight:1.34}}>{WCm.LINES.finalBuild}</div>
          </div>
          <div style={{marginTop:18}}><Bm variant="primary" block onClick={play}>Blow the whistle. Kick it off. →</Bm></div>
        </>}

        {done && <div className="pop">
          <div style={{fontSize:64,marginTop:6}}>🏆</div>
          <div className="dh" style={{fontSize:14,letterSpacing:'.16em',color:'var(--yellow)',marginTop:4}}>CHAMPIONS OF THE WORLD</div>
          <div style={{fontSize:96,lineHeight:1,margin:'8px 0'}}>{A.flag}</div>
          <div className="dh" style={{fontSize:46}}>Spain</div>
          <div style={{fontSize:15,fontWeight:700,color:'#bbb',marginTop:2}}>beat France 2–1 after extra time</div>

          <div style={{marginTop:20,background:'var(--yellow)',color:'var(--ink)',borderRadius:20,padding:18}}>
            <div style={{fontSize:12,fontWeight:800,letterSpacing:'.05em',textTransform:'uppercase'}}>Your sweepstake winner</div>
            <div className="dh" style={{fontSize:34,margin:'4px 0'}}>{champOwner?champOwner.name:'—'}</div>
            <div style={{fontSize:14,fontWeight:700}}>held Spain from the very first draw. Insufferable. Deserved.</div>
            <div className="dh" style={{fontSize:52,marginTop:10}}>{('£'+win.toLocaleString('en-GB'))}</div>
            <div style={{fontSize:12,fontWeight:700}}>60% of the {('£'+WCm.POT.toLocaleString('en-GB'))} pot</div>
          </div>

          <div style={{marginTop:16,textAlign:'left',background:'#fff',color:'var(--ink)',borderRadius:18,padding:14,display:'flex',gap:11,alignItems:'flex-end'}}>
            <Wm mood="delighted" size={76} animate/>
            <div><div className="dh" style={{fontSize:11,letterSpacing:'.06em',color:'var(--red)'}}>WHEESHT’S LAST WORD</div>
            <div style={{fontSize:15,fontWeight:600,lineHeight:1.32,marginTop:3}}>That’s yer lot. Thirty-one days, sixty-four kicks of Wheesht’s heart, one whistle. Scotland would’ve won it. Away ye go.</div></div>
          </div>
          <div style={{marginTop:18}}><Bm variant="primary" block onClick={props.onDone}>Claim your winnings</Bm></div>
        </div>}
      </div>
    </div>
  );
  function Final1(p){
    const owner=WCm.ownersOf(p.t.code)[0];
    return <div style={{textAlign:'center'}}>
      <div style={{fontSize:58}}>{p.t.flag}</div>
      <div className="dh" style={{fontSize:18,marginTop:4,color:'#fff'}}>{p.t.name}</div>
      <div style={{fontSize:11,fontWeight:700,color:'var(--yellow)'}}>{owner?owner.name:'nobody'}</div>
      <div style={{fontSize:11,fontWeight:600,color:'#999'}}>{p.t.odds}</div>
    </div>;
  }
}

/* NOTE: EntryMoment & DrawMoment are superseded by screens-onboarding.jsx.
   Only the result & final takeovers are exported from here now. */
Object.assign(window,{ ResultMoment, FinalMoment });
