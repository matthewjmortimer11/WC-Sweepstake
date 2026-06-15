/* ===========================================================================
   APP SHELL — identity gate · onboarding flow · tab nav · account switcher ·
   admin tweaks.
   =========================================================================== */
const A_WC = window.WC;
const A_W = window.Wheesht;
const A_S = window.Store;
const { useState: aState, useEffect: aEffect } = React;

/* ---- Easter eggs (tap the league title 5× for egg 1; tap rank badge 3× for egg 2) --- */
const EGG_LINES = [
  'Persistent. Wheesht respects that. Grudgingly.',
  'A hidden feature, not a bug. Wheesht planned this all along.',
  'Five taps. Impressive commitment. There is no prize. Wheesht is working on it.',
  'You found it. Well done. Wheesht is neither confirming nor denying there are others.',
];
window.__wheeshtEgg = function(){
  try{ window.wcConfetti && window.wcConfetti({ y:.32, count:90 }); }catch(e){}
  try{ window.wcToast && window.wcToast(EGG_LINES[(Math.random()*EGG_LINES.length)|0], 'mischievous'); }catch(e){}
};

const EGG2_LINES = [
  'Ranking noted. The pot does not care. Wheesht does, slightly.',
  'You tapped the rank. Wheesht was watching. Wheesht is always watching.',
  'Three taps on the rank badge and Wheesht appears. Almost as if planned.',
  'Position logged. Wheesht neither confirms nor denies this changes anything.',
];
window.__wheeshtEgg2 = function(){
  try{ window.wcConfetti && window.wcConfetti({ y:.5, count:55, colors:['#F5C800','#E8272A','#fff','#1A1A1A'] }); }catch(e){}
  try{ window.wcToast && window.wcToast(EGG2_LINES[(Math.random()*EGG2_LINES.length)|0], 'confident'); }catch(e){}
};

/* ---- tab icons ---- */
function Icon(props){
  const sw=2.4;
  const common={fill:'none',stroke:'currentColor',strokeWidth:sw,strokeLinecap:'round',strokeLinejoin:'round'};
  if(props.name==='games') return <svg width="26" height="26" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2.5" {...common}/><line x1="4" y1="9" x2="20" y2="9" {...common}/><line x1="8" y1="3" x2="8" y2="6" {...common}/><line x1="16" y1="3" x2="16" y2="6" {...common}/></svg>;
  if(props.name==='me') return <svg width="26" height="26" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6" {...common}/><path d="M5 19.5c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" {...common}/></svg>;
  if(props.name==='players') return <svg width="26" height="26" viewBox="0 0 24 24"><circle cx="8.5" cy="9" r="2.8" {...common}/><circle cx="16" cy="9.5" r="2.3" {...common}/><path d="M3.5 18c0-2.8 2.2-4.3 5-4.3s5 1.5 5 4.3M14 17.6c0-2 .9-3.4 3.4-3.4 2 0 3.1 1.2 3.1 3" {...common}/></svg>;
  if(props.name==='predictions') return <svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.2l5.4-.8z" {...common}/></svg>;
  if(props.name==='chat') return <svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" {...common}/></svg>;
  if(props.name==='summary') return <svg width="26" height="26" viewBox="0 0 24 24"><path d="M5.5 3h13l-1.5 8a5 5 0 0 1-10 0zM5.5 5.5H3a1.5 1.5 0 0 0 0 3h2.5M18.5 5.5H21a1.5 1.5 0 0 0 0 3h-2.5M12 11v6M9 21h6" {...common}/></svg>;
  return <svg width="26" height="26" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2.5" {...common}/><line x1="8.5" y1="8" x2="15.5" y2="8" {...common}/><line x1="8.5" y1="12" x2="15.5" y2="12" {...common}/><line x1="8.5" y1="16" x2="13" y2="16" {...common}/></svg>;
}

function StatusBar(){
  const [time, setTime] = React.useState(()=>{const d=new Date();return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');});
  React.useEffect(()=>{const iv=setInterval(()=>{const d=new Date();setTime(d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'));},10000);return()=>clearInterval(iv);},[]);
  return <div className="statusbar">
    <span>{time}</span>
    <span className="dots">
      <svg width="18" height="12" viewBox="0 0 18 12"><g fill="var(--ink)"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></g></svg>
      <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="var(--ink)" strokeWidth="1.6"><path d="M1 4.2C3.2 2 6 1 8.5 1S13.8 2 16 4.2M3.4 6.6C4.9 5.2 6.7 4.6 8.5 4.6s3.6.6 5.1 2M5.8 9c.8-.7 1.7-1 2.7-1s1.9.3 2.7 1"/></svg>
      <span className="bat"><i></i></span>
    </span>
  </div>;
}

function AppBar(props){
  const me = props.me;
  const ref = React.useRef(null);
  const taps = React.useRef({n:0,t:0});
  const eggTaps = React.useRef({n:0,t:0});
  React.useEffect(()=>{
    const bar = ref.current; if(!bar) return;
    const sc = bar.closest('.scroll'); if(!sc) return;
    const onScroll = ()=>{ bar.classList.toggle('is-stuck', sc.scrollTop>4); };
    onScroll();
    sc.addEventListener('scroll', onScroll, {passive:true});
    return ()=> sc.removeEventListener('scroll', onScroll);
  },[]);
  // Secret gesture: tap the mascot 7 times within ~2.5s to open the dev console.
  function secretTap(){
    const now = Date.now();
    taps.current.n = (now - taps.current.t < 2500) ? taps.current.n + 1 : 1;
    taps.current.t = now;
    if(taps.current.n >= 7){ taps.current.n = 0; props.onDev && props.onDev(); }
  }
  // Easter egg: tap the league title 5 times within ~1.8s.
  function eggTap(){
    const now = Date.now();
    eggTaps.current.n = (now - eggTaps.current.t < 1800) ? eggTaps.current.n + 1 : 1;
    eggTaps.current.t = now;
    if(eggTaps.current.n >= 5){ eggTaps.current.n = 0; window.__wheeshtEgg && window.__wheeshtEgg(); }
  }
  return <div className="appbar" ref={ref}>
    <div className="mk" onClick={secretTap} style={{cursor:'default'}}><A_W mood="confident" size={42}/></div>
    <div style={{flex:1,minWidth:0}}>
      <h1 onClick={eggTap} style={{cursor:'default'}}>{(A_WC.league&&A_WC.league.name)||A_WC.meta.name}</h1>
      <p>{A_WC.meta.season} · {A_WC.meta.stageLabel}</p>
    </div>
    {me && <button onClick={props.onAccount} style={{border:'none',background:'none',cursor:'pointer',padding:0,marginLeft:2}}>
      <window.Avatar person={Object.assign({},me,{isYou:false})} size={40}/>
    </button>}
  </div>;
}

function TabBar(props){
  const tabs=[['me','You'],['games','Games'],['players','Group'],['predictions','Predict'],['chat','Chat'],['summary','Verdict']];
  return <div className="tabbar tabbar--6">
    {tabs.map(([k,lab])=>(
      <button key={k} className={props.tab===k?'on':''} onClick={()=>props.setTab(k)}>
        <span className="ic"><Icon name={k}/></span>
        {lab}
      </button>
    ))}
  </div>;
}

/* ---- account switcher sheet ---- */
function AccountSheet(props){
  const accounts = A_S.deviceAccounts();
  const activeId = A_S.activeId();
  const includeDept = A_S.includeDepartment ? A_S.includeDepartment() : true;
  const showGoogle = !!window.WC_GOOGLE_CLIENT_ID && !!A_S.loginWithGoogle;
  function onGoogleLoginToken(token){
    Promise.resolve(A_S.loginWithGoogle(token)).then(function(r){
      props.onClose();
      setTimeout(function(){ window.wcToast && window.wcToast('Welcome back, '+(r.name||'')+'. Wheesht spotted you.','confident'); },300);
    }).catch(function(e){
      window.wcToast && window.wcToast((e&&e.message)||'No entry found for that Google account','crying');
    });
  }
  const chrome = window.wcSheetChrome(70);
  return <div style={chrome.wrap}>
    <div onClick={props.onClose} style={chrome.backdrop}/>
    <div className={chrome.cls} style={chrome.sheet}>
      {!chrome.deck && <div style={{width:44,height:5,borderRadius:3,background:'var(--line)',margin:'0 auto 14px'}}/>}
      <div className="dh" style={{fontSize:22,marginBottom:3}}>Switch account</div>
      <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink2)',marginBottom:13}}>Everyone on this device. No passwords — just tap who you are.</div>
      <div style={{display:'flex',flexDirection:'column',gap:9,maxHeight:280,overflowY:'auto'}}>
        {accounts.map(p=>{
          const t=A_WC.TEAMS[p.team]; const on=p.id===activeId;
          return <div key={p.id} style={{display:'flex',alignItems:'center',gap:11,background:on?'var(--yellow)':'#fff',border:'2.5px solid var(--ink)',borderRadius:16,padding:'10px 12px',boxShadow:on?'0 4px 0 var(--ink)':'0 4px 0 var(--shadow)'}}>
            <button onClick={()=>{A_S.setActive(p.id);props.onClose();}} style={{display:'flex',alignItems:'center',gap:11,flex:1,minWidth:0,background:'none',border:'none',cursor:'pointer',textAlign:'left',padding:0}}>
              <window.Avatar person={Object.assign({},p,{isYou:false})} size={40}/>
              <div style={{flex:1,minWidth:0}}>
                <div className="dh" style={{fontSize:16}}>{A_S.shownName?A_S.shownName(p):p.name}{on&&' ·'} {on&&<span style={{fontSize:11,color:'var(--ink2)'}}>active</span>}</div>
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

/* ---- account sign-in prompt (for password-protected entries) ---- */
function AccountSignIn(props){
  const [pw,setPw]=aState('');
  const [busy,setBusy]=aState(false);
  const [err,setErr]=aState('');
  const person = A_S.getSync ? A_S.getSync(props.id) : null;
  const hasGoogle = !!(person && person.hasGoogleLink) && !!window.WC_GOOGLE_CLIENT_ID;
  // If the entry has no password (it was claimed via Google only), don't offer
  // a password field — Google is the only way in. When the person is unknown
  // (data not loaded) fall back to showing the password field.
  const hasPw = person ? !!person.hasPassword : true;
  function go(){
    if(!pw||busy) return;
    setBusy(true); setErr('');
    Promise.resolve(A_S.authAccount(props.id,pw)).then(function(){
      setBusy(false); props.onDone();
    }).catch(function(e){ setBusy(false); setErr((e&&e.message)||'Wrong password'); });
  }
  function onGoogleToken(token){
    setBusy(true); setErr('');
    // Re-auth via Google: the endpoint recognises the matching google_id and returns a token.
    Promise.resolve(A_S.googleLink(props.id, token)).then(function(){
      setBusy(false); props.onDone();
    }).catch(function(e){ setBusy(false); setErr((e&&e.message)||'Google sign-in failed'); });
  }
  const inp={width:'100%',boxSizing:'border-box',border:'2.5px solid var(--ink)',borderRadius:12,padding:'11px 13px',fontFamily:'var(--body)',fontWeight:600,fontSize:15,marginTop:12,outline:'none'};
  const div={display:'flex',alignItems:'center',gap:8,margin:'12px 0 2px'};
  const line={flex:1,height:1,background:'var(--line)'};
  const chrome = window.wcSheetChrome(80);
  return <div style={chrome.wrap}>
    <div onClick={props.onClose} style={chrome.backdrop}/>
    <div className={chrome.cls} style={chrome.sheet}>
      {!chrome.deck && <div style={{width:44,height:5,borderRadius:3,background:'var(--line)',margin:'0 auto 14px'}}/>}
      <div className="dh" style={{fontSize:22}}>Sign in</div>
      <div style={{fontSize:13,fontWeight:600,color:'var(--ink2)',marginTop:4}}>
        <b>{props.name}</b> {hasPw
          ? (hasGoogle ? 'is protected. Sign in to continue.' : 'is password-protected. Enter the password to continue.')
          : 'is protected. Sign in with Google to continue.'}
      </div>
      {hasGoogle && <>
        <window.GoogleSignInButton onToken={onGoogleToken} opts={{text:'signin_with',size:'large',theme:'outline'}}/>
        {hasPw && <div style={div}><div style={line}/><span style={{fontSize:11.5,fontWeight:700,color:'var(--ink2)'}}>or use password</span><div style={line}/></div>}
      </>}
      {hasPw && <input autoFocus type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')go();}} placeholder="Password" style={inp}/>}
      {err && <div style={{color:'var(--red)',fontWeight:800,fontSize:12.5,marginTop:8}}>{err}</div>}
      {hasPw && <button onClick={go} disabled={!pw||busy} className="wc-btn wc-btn--block" style={{marginTop:14,boxShadow:'0 4px 0 var(--ink)',opacity:(!pw||busy)?0.5:1}}>{busy?'Checking…':'Sign in'}</button>}
      <button onClick={props.onClose} style={{width:'100%',marginTop:10,border:'none',background:'none',cursor:'pointer',fontSize:12.5,fontWeight:800,color:'var(--ink2)'}}>Cancel</button>
    </div>
  </div>;
}

/* ===========================================================================
   DESKTOP DECK — full-screen "matchday desk" layout. A toggle (top-right)
   flips between this and the classic floating-phone mockup. The same React
   screens render in the centre canvas; the rail drives the same tab state.
   =========================================================================== */
const DECK_NAV = [['me','You'],['games','Games'],['players','Group'],['predictions','Predict'],['chat','Chat'],['summary','Verdict']];
const DECK_HEAD = {
  me:          ['Your desk', 'Your team, your predictions and where you stand — everything you’re playing for, in one place.'],
  games:       ['Match centre', 'Every fixture, live scores, and what each result does to the league.'],
  players:     ['The group', 'Who drew whom, who’s still alive, and how the table is shaping up.'],
  predictions: ['Predictions', 'Call the tournament. Points land as the real results come in.'],
  summary:     ['The verdict', 'Where the pot is heading — and who’s in line to collect it.'],
};
function deckMoney(n){ return '£' + Math.round(n||0).toLocaleString('en-GB'); }

function DeckWire(){
  const meta = A_WC.meta || {};
  const pot = A_S.pot ? A_S.pot() : (A_WC.POT || 0);
  const rows = (A_S.rankedByPred ? A_S.rankedByPred() : []).slice(0,6);
  return <aside className="deck-wire">
    <div className="wire-kk">{(A_WC.league&&A_WC.league.name)||A_WC.meta.name||'The Sweepstake'}</div>
    <div className="wire-card">
      <div className="wire-pot">{deckMoney(pot)}</div>
      <div className="wire-pot__l">in the pot</div>
      <div className="wire-stats">
        <div><div className="wire-stat__n">{meta.stillIn!=null?meta.stillIn:'—'}</div><div className="wire-stat__l">still in</div></div>
        <div><div className="wire-stat__n">{meta.out!=null?meta.out:'—'}</div><div className="wire-stat__l">out</div></div>
        <div><div className="wire-stat__n">{meta.teamsLeft!=null?meta.teamsLeft:'—'}</div><div className="wire-stat__l">teams left</div></div>
      </div>
    </div>
    <div className="wire-kk" style={{marginTop:26}}>Prediction league</div>
    <div className="wire-card">
      {rows.length===0
        ? <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink2)'}}>No predictions banked yet. Wheesht is waiting.</div>
        : rows.map((p,i)=>(
            <div className="wire-row" key={p.id||i}>
              <span className="wire-rank">{i+1}</span>
              <span className="wire-av" style={{background:p.color||'#333'}}>{p.initials||'?'}</span>
              <span className="wire-nm">{A_S.shownName?A_S.shownName(p):p.name}</span>
              <span className="wire-pts">{(p.predScore||0)} pts</span>
            </div>))}
    </div>
  </aside>;
}

function DeckRail(props){
  const me = props.me;
  const taps = React.useRef({n:0,t:0});
  function secret(){
    const now=Date.now();
    taps.current.n=(now-taps.current.t<2500)?taps.current.n+1:1; taps.current.t=now;
    if(taps.current.n>=7){ taps.current.n=0; props.onDev&&props.onDev(); }
  }
  return <nav className="deck-rail">
    <div className="deck-brand">
      <span className="rd" onClick={secret}><A_W mood="confident" size={42}/></span>
      <span className="lk">
        <span className="wm">Wheesht</span>
        <span className="kk">{A_WC.meta.season||'World Cup 2026'}</span>
      </span>
    </div>
    <div className="deck-nav">
      {DECK_NAV.map(([k,lab])=>(
        <button key={k} className={props.tab===k?'on':''} onClick={()=>props.setTab(k)}>
          <span className="ic"><Icon name={k}/></span><span className="lb">{lab}</span>
        </button>
      ))}
    </div>
    <div className="spacer"/>
    <div className="deck-foot">
      {me && <button className="deck-acct" onClick={props.onAccount}>
        <window.Avatar person={Object.assign({},me,{isYou:false})} size={38}/>
        <span className="meta">
          <span className="nm">{A_S.shownName?A_S.shownName(me):me.name}</span>
          <span className="sub">Switch account</span>
        </span>
      </button>}
      <button className="deck-cog" onClick={props.onAdmin}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>
        <span>Organiser tools</span>
      </button>
    </div>
  </nav>;
}

function DeckShell(props){
  const tab = props.tab;
  const head = DECK_HEAD[tab];
  const isChat = tab==='chat';
  return <div className="deck-shell">
    <DeckRail me={props.me} tab={tab} setTab={props.setTab}
      onAccount={props.onAccount} onAdmin={props.onAdmin} onDev={props.onDev}/>
    <main className="deck-main">
      <div className={isChat?'deck-canvas deck-canvas--chat':'deck-canvas'} key={tab+(props.me?props.me.id:'')}>
        {head && <header className="deck-head">
          <div className="kk">{(A_WC.league&&A_WC.league.name)||A_WC.meta.name||'Wheesht'}</div>
          <h1>{head[0]}</h1>
          <div className="dek">{head[1]}</div>
          <div className="rule"/>
        </header>}
        {props.children}
      </div>
    </main>
    <DeckWire/>
  </div>;
}

/* layout view ('desk' = full-screen desktop, 'phone' = floating mockup) */
const WIDE_Q = '(min-width:561px)';
function wideNow(){ return !!(window.matchMedia && window.matchMedia(WIDE_Q).matches); }
function initialView(){
  try{ var v=localStorage.getItem('wheesht_view'); if(v==='phone'||v==='desk') return v; }catch(e){}
  return 'desk';
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
  const [dev,setDev]=aState(false);             // hidden dev console overlay
  const devReturn=React.useRef(undefined);      // league to restore after dev admin
  const [organiser,setOrganiser]=aState(false); // true while creating a league
  const [signIn,setSignIn]=aState(null);        // {id,name,proceed} account sign-in prompt
  const [view,setView]=aState(initialView);     // 'desk' (full-screen) | 'phone' (mockup)
  const [wide,setWide]=aState(wideNow);
  const [,tick]=aState(0);
  const [t,setTweak]=window.useTweaks(TW_DEFAULTS);

  // re-render on any store change
  aEffect(()=>A_S.subscribe(()=>tick(x=>x+1)),[]);
  aEffect(()=>{ A_S.refresh && A_S.refresh(); },[]);

  // track viewport width so the toggle/deck only apply on wider screens
  aEffect(()=>{
    if(!window.matchMedia) return;
    const mq=window.matchMedia(WIDE_Q);
    const on=()=>setWide(mq.matches);
    mq.addEventListener?mq.addEventListener('change',on):mq.addListener(on);
    return ()=>{ mq.removeEventListener?mq.removeEventListener('change',on):mq.removeListener(on); };
  },[]);
  const deck = wide && view==='desk';
  aEffect(()=>{ document.body.classList.toggle('deck', deck); },[deck]);
  function toggleView(){
    const nv = view==='desk'?'phone':'desk';
    setView(nv);
    try{ localStorage.setItem('wheesht_view', nv); }catch(e){}
  }
  const viewToggle = (wide && !admin && !dev) ? <button className="view-toggle" onClick={toggleView} title="Switch layout">
    {deck
      ? <><svg width="13" height="17" viewBox="0 0 14 20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="1" width="12" height="18" rx="3"/><line x1="5.2" y1="16" x2="8.8" y2="16"/></svg>Phone view</>
      : <><svg width="18" height="14" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="1" width="20" height="12" rx="2"/><line x1="8" y1="15" x2="14" y2="15"/></svg>Desktop view</>}
  </button> : null;
  // Wrap onboarding/identity flows in a centred column when in deck mode.
  function frame(node){ return deck ? <div className="deck-solo">{node}</div> : node; }

  // tweaks → DOM
  aEffect(()=>{ document.documentElement.style.setProperty('--red', t.accent); },[t.accent]);
  aEffect(()=>{ window.__celMul=(t.celebration||0)/8; },[t.celebration]);
  aEffect(()=>{ const s=document.getElementById('root'); if(s) s.classList.toggle('tex',!!t.texture); },[t.texture]);
  aEffect(()=>{ A_WC.meta.predictionsLocked=!!t.locked; },[t.locked]);

  // landing flourish
  aEffect(()=>{
    if(flow!=='app'||!me) return;
    const pre = A_WC.meta.phase === 'pre';
    const myTeam = A_WC.TEAMS[me.team];
    const id=setTimeout(()=>{
      const picksLocked = A_S.predictionsLocked && A_S.predictionsLocked();
      if(pre && picksLocked){
        window.wcToast&&window.wcToast('Predictions are locked. Wheesht has the receipts.','confident');
      } else if(pre){
        const pool=[
          ['Predictions are open till kick-off. Get them in — Wheesht is taking names.','mischievous'],
          ['Your picks won\'t make themselves. Wheesht is waiting.','nervous'],
          ['Markets are open. Back your instincts. Wheesht backs nothing — but watches everything.','confident'],
          ['Get your predictions in before the first whistle. No extensions.','angry'],
          ['Wheesht has opinions on every market. Wheesht is keeping them to itself.','mischievous'],
        ];
        const pick=pool[(Math.random()*pool.length)|0];
        window.wcToast&&window.wcToast(pick[0],pick[1]);
      } else if(!myTeam||!myTeam.alive){
        window.wcToast&&window.wcToast(A_WC.LINES.eliminated,'crying');
      } else {
        const pool=[
          ['Your team is still in it. Wheesht is watching — with moderate approval.','confident'],
          ['Still standing. Wheesht has noted this. Nothing more to add.','neutral'],
          ['Your team is in the mix. Wheesht is cautiously optimistic. Very cautiously.','nervous'],
          ['In the running. The pot is watching too. Wheesht is taking no questions.','mischievous'],
          [myTeam.name+' are alive. Wheesht acknowledges this. Barely.','happy'],
        ];
        const pick=pool[(Math.random()*pool.length)|0];
        window.wcToast&&window.wcToast(pick[0],pick[1]);
      }
      if(t.bias){
        const scotMsgs=[
          ['Scotland are in this tournament. Just so everyone is clear.','scottish'],
          ['Scotland. Still here. Wheesht is cautiously optimistic — emphasis on cautious.','nervous'],
          ['A gentle reminder that Scotland are participating. Wheesht thought you should know.','scottish'],
          ['Scotland update: still in it. Wheesht is fine. Everything is fine.','confident'],
          ['No one asked. Wheesht is mentioning Scotland anyway.','mischievous'],
        ];
        const sp=scotMsgs[(Math.random()*scotMsgs.length)|0];
        setTimeout(()=>window.wcToast&&window.wcToast(sp[0],sp[1]),1600);
      }
    },650);
    return ()=>clearTimeout(id);
  },[flow,me&&me.id]); // eslint-disable-line

  function onboardSubmit(profile){
    const nm=(profile.name||'').trim().toLowerCase();
    const lg=A_S.activeLeague&&A_S.activeLeague();
    // In a seeded league everyone is already on the fixed roster. If this name
    // matches an existing entry, claim that one (which enforces sign-in when the
    // entry is protected) instead of minting a duplicate account.
    if(nm && lg && lg.seeded && A_S.allSync){
      const dups=A_S.allSync().filter(p=>(p.name||'').trim().toLowerCase()===nm);
      const existing=dups.find(p=>(A_S.deviceIds?A_S.deviceIds():[]).indexOf(p.id)<0)||dups[0];
      if(existing){ setOrganiser(false); claimOI(existing.id); return; }
    }
    const p=A_S.create(profile,{organiser:organiser});
    setOrganiser(false);
    A_S.refresh&&A_S.refresh();
    setDraw({participant:p}); setFlow('app');
  }
  function resumeAccount(id){
    Promise.resolve(A_S.resumeAccount?A_S.resumeAccount(id):A_S.setActive(id)).then(()=>{ setFlow('app'); setTab('me'); });
  }

  // Dev console picked a league to administer: remember where we were, switch
  // into it (no password), unlock the clipboard, open admin.
  function devAdmin(league){
    devReturn.current = A_S.activeLeague() || null;
    Promise.resolve(A_S.devEnterLeague(league)).then(()=>{ setDev(false); setAdmin(true); });
  }
  // Closing the clipboard: if we got here via the dev console, hop back to the
  // league we came from so the normal app view is unaffected.
  function closeAdmin(){
    setAdmin(false);
    if(devReturn.current!==undefined){
      const back=devReturn.current; devReturn.current=undefined;
      A_S.devEnterLeague(back);
    }
  }

  function claimOI(id){
    // A password-protected entry must be signed into before it can be claimed
    // on this device (cross-device takeover is the case this guards).
    const person=A_S.getSync(id);
    if(person && A_S.needsSignIn && A_S.needsSignIn(person)){
      setSignIn({ id:id, name:(A_S.shownName?A_S.shownName(person):person.name), proceed:()=>doClaimOI(id) });
      return;
    }
    doClaimOI(id);
  }
  function doClaimOI(id){
    A_S.claimOI(id);
    A_S.refresh&&A_S.refresh();
    const p=A_S.getSync(id);
    const t=p&&A_WC.TEAMS[p.team];
    setFlow('app');
    setTimeout(()=>window.wcToast&&window.wcToast('Welcome, '+(p?(A_S.shownName?A_S.shownName(p):p.name):'')+'! Your team is '+((t&&t.flag)||'')+' '+(t?t.name:'')+'.',  'confident'),400);
  }

  // The account sign-in prompt can be triggered from the onboarding flows
  // (claiming a protected entry from the roster or search), so it must render
  // alongside those screens too — not only in the main app below.
  const signInModal = signIn && <AccountSignIn id={signIn.id} name={signIn.name}
    onClose={()=>setSignIn(null)}
    onDone={()=>{ const go=signIn.proceed; setSignIn(null); go&&go(); }}/>;

  // -------- onboarding / identity flow --------
  if(flow==='gate') return <React.Fragment>
    {frame(<window.AccountGate onResume={resumeAccount} onJoin={()=>{setOrganiser(false);setFlow('join');}} onCreate={()=>{setOrganiser(true);setFlow('create');}}/>)}
    {viewToggle}<window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='join') return <React.Fragment>
    {frame(<window.JoinLeague onBack={()=>setFlow('gate')} onCreate={()=>{setOrganiser(true);setFlow('create');}}
      onJoined={(league)=>{ setOrganiser(false); setFlow(league&&league.seeded?'oi-roster':'find'); }}/>)}
    {viewToggle}<window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='create') return <React.Fragment>
    {frame(<window.CreateLeague onBack={()=>setFlow('gate')} onCreated={()=>{ setOrganiser(true); setFlow('form'); }}/>)}
    {viewToggle}<window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='find') return <React.Fragment>
    {frame(<window.FindMyEntry onBack={()=>setFlow('gate')} onPicked={claimOI} onNew={()=>setFlow('form')}/>)}
    {signInModal}
    {viewToggle}<window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='form') return <React.Fragment>
    {frame(<window.OnboardingForm onBack={()=>setFlow(me?'app':'gate')} onSubmit={onboardSubmit}/>)}
    {viewToggle}<window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;
  if(flow==='oi-roster') return <React.Fragment>
    {frame(<window.OIRosterPicker onBack={()=>setFlow('join')} onClaim={claimOI}/>)}
    {signInModal}
    {viewToggle}<window.ToastLayer/><window.ConfettiLayer/>
  </React.Fragment>;

  // -------- main app --------
  const screens={
    me:<window.MeScreen goPredictions={()=>setTab('predictions')} goGames={()=>setTab('games')}/>,
    games:<window.MatchCentreScreen/>,
    players:<window.CompetitionScreen/>,
    predictions:<window.PredictionsScreen/>,
    chat:<window.ChatScreen/>,
    summary:<window.SummaryScreen/>,
  };

  return <React.Fragment>
    {deck
      ? <DeckShell me={me} tab={tab} setTab={setTab}
          onAccount={()=>setAccount(true)} onAdmin={()=>setAdmin(true)} onDev={()=>setDev(true)}>
          {me ? screens[tab] : null}
        </DeckShell>
      : <React.Fragment>
          <StatusBar/>
          <div className="scroll" key={tab+(me?me.id:'')}>
            <AppBar me={me} onAccount={()=>setAccount(true)} onDev={()=>setDev(true)}/>
            {/* When the dev console hops into another league, the active participant
                isn't a member there, so `me` is null — render nothing behind the
                full-screen admin overlay rather than letting a screen read me.team. */}
            {me ? screens[tab] : null}
          </div>
          <TabBar tab={tab} setTab={setTab}/>
        </React.Fragment>}
    {viewToggle}

    {account && <AccountSheet onClose={()=>setAccount(false)}
      onAdd={()=>{setAccount(false);setFlow('form');}}
      onFind={()=>{setAccount(false);setFlow('find');}}
      onSwitch={()=>{setAccount(false);setFlow('gate');}}
      onAdmin={()=>{setAccount(false);setAdmin(true);}}/>}

    {draw && <window.DrawMoment participant={draw.participant} forceTeam={draw.forceTeam}
      onDone={()=>{ const wasReplay=draw.replay; setDraw(null); if(!wasReplay){ setTab('me'); setTimeout(()=>window.wcConfetti&&window.wcConfetti({y:.4}),200);} }}/>}
    {admin && <window.AdminGate onClose={closeAdmin}/>}
    {dev && <window.DevConsole onClose={()=>setDev(false)} onAdmin={devAdmin}/>}
    {signInModal}

    <window.ToastLayer/>
    <window.ConfettiLayer/>

    <window.TweaksPanel title="Tweaks">
      <window.TweakSection label="Atmosphere"/>
      <window.TweakSlider label="Celebration" value={t.celebration} min={0} max={10} step={1} onChange={v=>setTweak('celebration',v)}/>
      <window.TweakToggle label="Wheesht's Scottish bias" value={t.bias} onChange={v=>setTweak('bias',v)}/>
      <window.TweakToggle label="Match-programme texture" value={t.texture} onChange={v=>setTweak('texture',v)}/>
      <window.TweakSection label="Admin"/>
      <div style={{padding:'4px 14px 8px'}}>
        <button onClick={()=>setAdmin(true)} style={{width:'100%',border:'none',borderRadius:11,background:'var(--ink)',color:'#fff',fontFamily:'var(--disp)',fontWeight:800,fontSize:13.5,padding:'12px',cursor:'pointer',boxShadow:'0 4px 0 #000'}}>Open Wheesht's clipboard →</button>
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

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error: error };
  }
  componentDidCatch(error, info) {
    try { console.error('Wheesht crashed', error, info); } catch (e) {}
  }
  render() {
    if (!this.state.error) return this.props.children;
    const Wheesht = window.Wheesht;
    return (
      <div className="moment" style={{ background: 'var(--bg)', alignItems: 'center', justifyContent: 'center', padding: '28px 24px', textAlign: 'center' }}>
        {Wheesht && <Wheesht mood="shocked" size={96} animate />}
        <div className="dh" style={{ fontSize: 25, marginTop: 12 }}>Wheesht hit a snag.</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.45, maxWidth: 330 }}>
          Your entry is still on this device. Refreshing usually gets you straight back in.
        </div>
        <div style={{ display: 'flex', gap: 9, width: '100%', maxWidth: 330, marginTop: 18 }}>
          <button className="wc-btn wc-btn--ink wc-btn--block" onClick={() => window.location.reload()}>Refresh</button>
          <button className="wc-btn wc-btn--ghost wc-btn--block" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
