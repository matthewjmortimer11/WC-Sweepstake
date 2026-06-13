/* ===========================================================================
   APP SHELL — identity gate · onboarding flow · tab nav · account switcher ·
   admin tweaks.
   =========================================================================== */
const A_WC = window.WC;
const A_W = window.Wheesht;
const A_S = window.Store;
const { useState: aState, useEffect: aEffect } = React;

/* ---- tab icons ---- */
function Icon(props){
  const sw=2.4;
  const common={fill:'none',stroke:'currentColor',strokeWidth:sw,strokeLinecap:'round',strokeLinejoin:'round'};
  if(props.name==='games') return <svg width="26" height="26" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2.5" {...common}/><line x1="4" y1="9" x2="20" y2="9" {...common}/><line x1="8" y1="3" x2="8" y2="6" {...common}/><line x1="16" y1="3" x2="16" y2="6" {...common}/></svg>;
  if(props.name==='me') return <svg width="26" height="26" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6" {...common}/><path d="M5 19.5c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" {...common}/></svg>;
  if(props.name==='players') return <svg width="26" height="26" viewBox="0 0 24 24"><circle cx="8.5" cy="9" r="2.8" {...common}/><circle cx="16" cy="9.5" r="2.3" {...common}/><path d="M3.5 18c0-2.8 2.2-4.3 5-4.3s5 1.5 5 4.3M14 17.6c0-2 .9-3.4 3.4-3.4 2 0 3.1 1.2 3.1 3" {...common}/></svg>;
  if(props.name==='predictions') return <svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.2l5.4-.8z" {...common}/></svg>;
  if(props.name==='chat') return <svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" {...common}/></svg>;
  return <svg width="26" height="26" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2.5" {...common}/><line x1="8.5" y1="8" x2="15.5" y2="8" {...common}/><line x1="8.5" y1="12" x2="15.5" y2="12" {...common}/><line x1="8.5" y1="16" x2="13" y2="16" {...common}/></svg>;
}

function StatusBar(){
  return <div className="statusbar">
    <span>20:06</span>
    <span className="dots">
      <svg width="18" height="12" viewBox="0 0 18 12"><g fill="var(--ink)"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></g></svg>
      <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="var(--ink)" strokeWidth="1.6"><path d="M1 4.2C3.2 2 6 1 8.5 1S13.8 2 16 4.2M3.4 6.6C4.9 5.2 6.7 4.6 8.5 4.6s3.6.6 5.1 2M5.8 9c.8-.7 1.7-1 2.7-1s1.9.3 2.7 1"/></svg>
      <span className="bat"><i></i></span>
    </span>
  </div>;
}

function AppBar(props){
  const me = props.me;
  return <div className="appbar">
    <div className="mk"><A_W mood="confident" size={42}/></div>
    <div style={{flex:1,minWidth:0}}>
      <h1>{(A_WC.league&&A_WC.league.name)||A_WC.meta.name}</h1>
      <p>{A_WC.meta.season} · {A_WC.meta.stageLabel}</p>
    </div>
    {me && <button onClick={props.onAccount} style={{border:'none',background:'none',cursor:'pointer',padding:0,marginLeft:2}}>
      <window.Avatar person={Object.assign({},me,{isYou:false})} size={40}/>
    </button>}
  </div>;
}

function TabBar(props){
  const tabs=[['me','You'],['games','Games'],['players','Players'],['predictions','Predict'],['chat','Chat'],['summary','Verdict']];
  return <div className="tabbar tabbar--6">
    {tabs.map(([k,lab])=>(
      <button key={k} className={props.tab===k?'on':''} onClick={()=>props.setTab(k)}>
        <span className="ic"><Icon name={k}/></span>
        {lab}
        {k==='predictions' && props.tab!=='predictions' && <span className="tabdot"/>}
      </button>
    ))}
  </div>;
}

/* ---- account switcher sheet ---- */
function AccountSheet(props){
  const accounts = A_S.deviceAccounts();
  const activeId = A_S.activeId();
  const includeDept = A_S.includeDepartment ? A_S.includeDepartment() : true;
  return <div style={{position:'absolute',inset:0,zIndex:70,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
    <div onClick={props.onClose} style={{position:'absolute',inset:0,background:'rgba(26,26,26,.45)'}}/>
    <div className="rise" style={{position:'relative',background:'var(--bg)',borderRadius:'26px 26px 0 0',padding:'18px 18px 26px',boxShadow:'0 -20px 50px rgba(0,0,0,.3)'}}>
      <div style={{width:44,height:5,borderRadius:3,background:'var(--line)',margin:'0 auto 14px'}}/>
      <div className="dh" style={{fontSize:22,marginBottom:3}}>Switch account</div>
      <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink2)',marginBottom:13}}>Everyone on this device. No passwords — just tap who you are.</div>
      <div style={{display:'flex',flexDirection:'column',gap:9,maxHeight:280,overflowY:'auto'}}>
        {accounts.map(p=>{
          const t=A_WC.TEAMS[p.team]; const on=p.id===activeId;
          return <div key={p.id} style={{display:'flex',alignItems:'center',gap:11,background:on?'var(--yellow)':'#fff',border:'2.5px solid var(--ink)',borderRadius:16,padding:'10px 12px',boxShadow:on?'0 4px 0 var(--ink)':'0 4px 0 var(--shadow)'}}>
            <button onClick={()=>{A_S.setActive(p.id);props.onClose();}} style={{display:'flex',alignItems:'center',gap:11,flex:1,minWidth:0,background:'none',border:'none',cursor:'pointer',textAlign:'left',padding:0}}>
              <window.Avatar person={Object.assign({},p,{isYou:false})} size={40}/>
              <div style={{flex:1,minWidth:0}}>
                <div className="dh" style={{fontSize:16}}>{p.name}{on&&' ·'} {on&&<span style={{fontSize:11,color:'var(--ink2)'}}>active</span>}</div>
                <div style={{fontSize:11.5,fontWeight:700,color:'var(--ink2)'}}>{p.location}{includeDept && p.department?' · '+p.department:''}</div>
              </div>
              {t&&<window.Flag team={t} size={24}/>}
            </button>
            <button onClick={()=>A_S.signOutDevice(p.id)} title="Remove from device" style={{border:'none',background:'none',cursor:'pointer',color:'var(--ink2)',fontSize:18,fontWeight:900,padding:'0 2px'}}>×</button>
          </div>;
        })}
      </div>
      <div style={{marginTop:14,display:'flex',gap:9}}>
        <button onClick={props.onAdd} className="wc-btn wc-btn--sm" style={{flex:1,boxShadow:'0 4px 0 var(--shadow)'}}>+ Add someone</button>
        <button onClick={props.onFind} className="wc-btn wc-btn--sm" style={{flex:1,boxShadow:'0 4px 0 var(--shadow)'}}>Find my entry</button>
      </div>
      <button onClick={props.onSwitch} className="wc-btn wc-btn--sm wc-btn--block" style={{marginTop:9,boxShadow:'0 4px 0 var(--shadow)'}}>Join / switch league →</button>
      <button onClick={props.onAdmin} style={{width:'100%',marginTop:11,border:'none',background:'none',cursor:'pointer',fontSize:12.5,fontWeight:800,color:'var(--ink2)',padding:'6px 0',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>
        Organiser tools
      </button>
    </div>
  </div>;
}

const TW_DEFAULTS = /*EDITMODE-BEGIN*/{
  "celebration": 8,
  "accent": "#E8272A",
  "bias": true,
  "texture": true,
  "locked": false
}/*EDITMODE-END*/;

function App(){
  const me = A_S.active();
  const [tab,setTab]=aState('me');
  const [flow,setFlow]=aState(me?'app':'gate'); // gate | find | form | app
  const [draw,setDraw]=aState(null);            // {forceTeam, replay}
  const [account,setAccount]=aState(false);
  const [admin,setAdmin]=aState(false);
  const [organiser,setOrganiser]=aState(false); // true while creating a league
  const [,tick]=aState(0);
  const [t,setTweak]=window.useTweaks(TW_DEFAULTS);

  // re-render on any store change
  aEffect(()=>A_S.subscribe(()=>tick(x=>x+1)),[]);
  aEffect(()=>{ A_S.refresh && A_S.refresh(); },[]);

  // tweaks → DOM
  aEffect(()=>{ document.documentElement.style.setProperty('--red', t.accent); },[t.accent]);
  aEffect(()=>{ window.__celMul=(t.celebration||0)/8; },[t.celebration]);
  aEffect(()=>{ const s=document.getElementById('root'); if(s) s.classList.toggle('tex',!!t.texture); },[t.texture]);
  aEffect(()=>{ A_WC.meta.predictionsLocked=!!t.locked; },[t.locked]);

  // landing flourish
  aEffect(()=>{
    if(flow!=='app'||!me) return;
    const pre = A_WC.meta.phase === 'pre';
    const id=setTimeout(()=>{
      if(pre) window.wcToast&&window.wcToast('Predictions are open till kick-off. Get them in — Wheesht is taking names.','mischievous');
      else if(!A_WC.TEAMS[me.team].alive) window.wcToast&&window.wcToast(A_WC.LINES.eliminated,'crying');
      else window.wcToast&&window.wcToast('Yer team’s in the hat. Wheesht will be watching. Closely.','mischievous');
      if(t.bias) setTimeout(()=>window.wcToast&&window.wcToast('Reminder: Scotland are in this tournament. Just so we’re all clear.','scottish'),1500);
    },650);
    return ()=>clearTimeout(id);
  },[flow,me&&me.id]); // eslint-disable-line

  function onboardSubmit(profile){
    const p=A_S.create(profile,{organiser:organiser});
    setOrganiser(false);
    A_S.refresh&&A_S.refresh();
    setDraw({participant:p}); setFlow('app');
  }
  function resumeAccount(id){
    Promise.resolve(A_S.resumeAccount?A_S.resumeAccount(id):A_S.setActive(id)).then(()=>{ setFlow('app'); setTab('me'); });
  }

  function claimOI(id){
    A_S.claimOI(id);
    A_S.refresh&&A_S.refresh();
    const p=A_S.getSync(id);
    const t=p&&A_WC.TEAMS[p.team];
    setFlow('app');
    setTimeout(()=>window.wcToast&&window.wcToast('Welcome, '+(p?p.name:'')+'! Yer team is '+((t&&t.flag)||'')+' '+(t?t.name:'')+'.',  'confident'),400);
  }

  // -------- onboarding / identity flow --------
  if(flow==='gate') return <React.Fragment>
    <window.AccountGate onResume={resumeAccount} onJoin={()=>{setOrganiser(false);setFlow('join');}} onCreate={()=>{setOrganiser(true);setFlow('create');}}/>
    <window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='join') return <React.Fragment>
    <window.JoinLeague onBack={()=>setFlow('gate')} onCreate={()=>{setOrganiser(true);setFlow('create');}}
      onJoined={(league)=>{ setOrganiser(false); setFlow(league&&league.seeded?'oi-roster':'find'); }}/>
    <window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='create') return <React.Fragment>
    <window.CreateLeague onBack={()=>setFlow('gate')} onCreated={()=>{ setOrganiser(true); setFlow('form'); }}/>
    <window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='find') return <React.Fragment>
    <window.FindMyEntry onBack={()=>setFlow('gate')} onPicked={claimOI} onNew={()=>setFlow('form')}/>
    <window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='form') return <React.Fragment>
    <window.OnboardingForm onBack={()=>setFlow(me?'app':'gate')} onSubmit={onboardSubmit}/>
    <window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='oi-roster') return <React.Fragment>
    <window.OIRosterPicker onBack={()=>setFlow('join')} onClaim={claimOI}/>
    <window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;

  // -------- main app --------
  const screens={
    me:<window.MeScreen goPredictions={()=>setTab('predictions')} goGames={()=>setTab('games')}/>,
    games:<window.GamesScreen/>,
    players:<window.TrackerScreen/>,
    predictions:<window.PredictionsScreen/>,
    chat:<window.ChatScreen/>,
    summary:<window.SummaryScreen/>,
  };

  return <React.Fragment>
    <StatusBar/>
    <div className="scroll" key={tab+(me?me.id:'')}>
      <AppBar me={me} onAccount={()=>setAccount(true)}/>
      {screens[tab]}
    </div>
    <TabBar tab={tab} setTab={setTab}/>

    {account && <AccountSheet onClose={()=>setAccount(false)}
      onAdd={()=>{setAccount(false);setFlow('form');}}
      onFind={()=>{setAccount(false);setFlow('find');}}
      onSwitch={()=>{setAccount(false);setFlow('gate');}}
      onAdmin={()=>{setAccount(false);setAdmin(true);}}/>}

    {draw && <window.DrawMoment participant={draw.participant} forceTeam={draw.forceTeam}
      onDone={()=>{ const wasReplay=draw.replay; setDraw(null); if(!wasReplay){ setTab('me'); setTimeout(()=>window.wcConfetti&&window.wcConfetti({y:.4}),200);} }}/>}
    {admin && <window.AdminGate onClose={()=>setAdmin(false)}/>}

    <window.ToastLayer/>
    <window.ConfettiLayer/>

    <window.TweaksPanel title="Tweaks">
      <window.TweakSection label="Atmosphere"/>
      <window.TweakSlider label="Celebration" value={t.celebration} min={0} max={10} step={1} onChange={v=>setTweak('celebration',v)}/>
      <window.TweakToggle label="Wheesht’s Scottish bias" value={t.bias} onChange={v=>setTweak('bias',v)}/>
      <window.TweakToggle label="Match-programme texture" value={t.texture} onChange={v=>setTweak('texture',v)}/>
      <window.TweakSection label="Admin"/>
      <div style={{padding:'4px 14px 8px'}}>
        <button onClick={()=>setAdmin(true)} style={{width:'100%',border:'none',borderRadius:11,background:'var(--ink)',color:'#fff',fontFamily:'var(--disp)',fontWeight:800,fontSize:13.5,padding:'12px',cursor:'pointer',boxShadow:'0 4px 0 #000'}}>Open Wheesht’s clipboard →</button>
        <div style={{fontSize:11,fontWeight:600,color:'var(--ink2)',marginTop:6,lineHeight:1.35}}>Set results, knock teams out, grade predictions.</div>
      </div>
      <window.TweakToggle label="Lock predictions" value={t.locked} onChange={v=>setTweak('locked',v)}/>
      <window.TweakColor label="Alert accent" value={t.accent} options={['#E8272A','#9E1B32','#E07A1A']} onChange={v=>setTweak('accent',v)}/>
      <div style={{padding:'10px 14px'}}>
        <button onClick={()=>{ if(me){A_S.signOutDevice(me.id);} setFlow(A_S.active()?'app':'gate'); }} style={{width:'100%',border:'2px solid var(--ink)',borderRadius:11,background:'#fff',fontFamily:'var(--disp)',fontWeight:700,fontSize:13,padding:'9px',cursor:'pointer'}}>Sign out of this device</button>
      </div>
    </window.TweaksPanel>
  </React.Fragment>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
