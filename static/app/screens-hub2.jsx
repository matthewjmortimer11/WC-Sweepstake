/* ===========================================================================
   HUB SCREENS pt.2 — Side Bets (the eliminated experience) · Weekly Summary
   =========================================================================== */
const WC2 = window.WC;
const { Card: Card2, Btn: Btn2, Flag: Flag2, Avatar: Avatar2, Chip: Chip2, Stamp: Stamp2, ProgressRing: PR2, WheeshtSays: Says2, SectionHead: SH2 } = window;
const W2 = window.Wheesht;
const RS = React;

function money2(n){ return window.Store && window.Store.money ? window.Store.money(n) : '£' + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
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

function _vOdds(t){ return parseInt((t.odds||'+999999').replace('+',''), 10); }

function vIsUpset(f){
  if(!f.score || f.score[0]===f.score[1]) return false;
  var aWin=f.score[0]>f.score[1];
  var aO=_vOdds(vTeam(f.a)), bO=_vOdds(vTeam(f.b));
  return aWin ? aO > bO*2.5 : bO > aO*2.5;
}

/* In-voice commentary for a logged result — homeland bias, bespoke by team + situation. */
function vResultNote(f){
  var a=f.score[0], b=f.score[1];
  var ta=vTeam(f.a), tb=vTeam(f.b);
  var draw=a===b, aWin=a>b;
  var winner=aWin?ta:(draw?null:tb), loser=aWin?tb:(draw?null:ta);
  var wN=winner?winner.name:'', lN=loser?loser.name:'';
  var wCode=winner?winner.code:'', lCode=loser?loser.code:'';
  var margin=Math.abs(a-b), total=a+b;
  var pick=function(arr){ return arr[Math.abs(f.id.charCodeAt(0)+f.id.charCodeAt(1))%arr.length]; };
  var aO=_vOdds(ta), bO=_vOdds(tb);
  var isMassive=!draw&&(aWin?aO>bO*8:bO>aO*8);
  var isUpset=!draw&&(aWin?aO>bO*2.5:bO>aO*2.5);

  /* ---- Classic rivalries — checked before individual team lines ---- */
  var pair=function(x,y){ return (f.a===x&&f.b===y)||(f.a===y&&f.b===x); };
  if(pair('SCO','ENG')){
    var scoWon2=(f.a==='SCO'&&aWin)||(f.b==='SCO'&&!aWin&&!draw);
    if(draw) return 'Scotland vs England and they can\'t separate them. Wheesht is choosing to enjoy this.';
    if(scoWon2) return 'SCOTLAND BEAT ENGLAND. Wheesht is officially done for the night. That\'s it. That\'s the tournament.';
    return 'England beat Scotland. Wheesht is making notes. Very, very detailed notes. We move on. Apparently.';
  }
  if(pair('BRA','ARG')){
    var braWon=(f.a==='BRA'&&aWin)||(f.b==='BRA'&&!aWin&&!draw);
    if(draw) return 'Brazil and Argentina share the points. The most watchable 0–0 imaginable. Wheesht was gripping the desk.';
    return (braWon?'Brazil':'Argentina')+' win El Clásico de las Américas. Wheesht has been waiting for this fixture. Worth the wait.';
  }
  if(pair('ESP','POR')){
    var espWon=(f.a==='ESP'&&aWin)||(f.b==='ESP'&&!aWin&&!draw);
    if(draw) return 'Spain and Portugal split the points. The Iberian derby ends in stalemate. Nobody wins. Everyone watches.';
    return (espWon?'Spain':'Portugal')+' take the Iberian bragging rights. Wheesht watched every second of that one.';
  }
  if(pair('GER','FRA')){
    var gerWon=(f.a==='GER'&&aWin)||(f.b==='GER'&&!aWin&&!draw);
    if(draw) return 'Germany and France cancel each other out. Wheesht expected a final, got a draw. Still worth it.';
    return (gerWon?'Germany':'France')+' win the grudge match. Wheesht has been looking forward to this one for years.';
  }
  if(pair('ARG','KSA')){
    if(draw) return 'Argentina and Saudi Arabia draw. Wheesht is having 2022 flashbacks already.';
    var argWon2=(f.a==='ARG'&&aWin)||(f.b==='ARG'&&!aWin&&!draw);
    return argWon2?'Argentina get revenge on Saudi Arabia. Wheesht remembers everything.':'Saudi Arabia beat Argentina AGAIN. Wheesht is closing the laptop and going for a walk.';
  }

  /* ---- Scotland ---- */
  if(f.a==='SCO'||f.b==='SCO'){
    var scoWon=(f.a==='SCO'&&aWin)||(f.b==='SCO'&&!aWin&&!draw);
    if(draw) return pick(['Scotland share the spoils. Wheesht calls it a moral victory and is having a wee lie-down.','A draw. Scotland take a point. Wheesht is choosing to see this as progress.']);
    if(scoWon&&isMassive) return 'SCOTLAND WIN. Wheesht had to double-check the scoreboard. Then check it again. The homeland actually did it.';
    if(scoWon) return pick(['The homeland delivers. Wheesht needs a quiet minute and possibly a dram.','Scotland win. Wheesht is phoning relatives. Scotland actually won.','Three points for Scotland. Wheesht is genuinely emotional. Wheesht will deny this.']);
    return pick(['Scotland fall. Wheesht is fine. Wheesht is always fine. (Wheesht is not fine.)','Scotland are out. Wheesht has seen this before. This does not make it easier.','The homeland loses. Wheesht will be taking the rest of the evening off.']);
  }

  /* ---- England ---- */
  if(f.a==='ENG'||f.b==='ENG'){
    var engWon=(f.a==='ENG'&&aWin)||(f.b==='ENG'&&!aWin&&!draw);
    if(draw) return pick(['England draw. Wheesht is remaining professional. Barely.','England fail to win again. Wheesht notes this without expression.','A point each. England leave it late as usual and end up nowhere. Familiar.']);
    if(engWon) return pick(['England win. Wheesht is noting it down without comment.','England do it. Wheesht is saying nothing. Nothing at all.','Fine. England win. Result logged. Moving on swiftly.','England through. Wheesht is professionally neutral about this. Professionally.']);
    return pick(['England out. Wheesht has no comment — and a small, private smile.','England eliminated. Wheesht\'s expression remains neutral. Diplomatically neutral.','England go home. The less said the better. Wheesht is saying nothing.','England are done. Wheesht regrets nothing.']);
  }

  /* ---- Draw ---- */
  if(draw){
    if(a===0) return pick(['Nil–nil. Even the goalkeepers looked bored. Wheesht is filing this under "honourable stalemate".','Goalless draw. Not a shot of quality between them. Wheesht watched every minute and remains unimpressed.']);
    return pick([wN+' and '+lN+' share the points. Wheesht has seen worse.',wN+' and '+lN+' cancel each other out. '+total+' goals and nothing to show for it.',wN+' can\'t put '+lN+' away. The points split. Wheesht shrugs.',total+' goals and it ends even. Wheesht watched. Wheesht is reserving judgement.']);
  }

  /* ---- Massive upset ---- */
  if(isMassive) return pick([
    wN+' beat '+lN+'. Wheesht had to check the scoreboard twice. Then check it again. Then sit down.',
    'Nobody — absolutely nobody — saw that coming. Wheesht certainly didn\'t. '+wN+' are through and Wheesht is recalibrating.',
    lN+' have been sent home by '+wN+'. The bracket has been obliterated. Wheesht has no words.',
  ]);

  /* ---- Regular upset ---- */
  if(isUpset) return pick([
    wN+' turn over '+lN+'. Wheesht did not see that coming, and Wheesht sees everything.',
    wN+' pull off the shock result. '+lN+' are left wondering what happened. So is Wheesht.',
    lN+' have been sent home early by '+wN+'. The bracket is on fire.',
    wN+' cause the upset. Wheesht is updating the mental model. This changes things.',
  ]);

  /* ---- High-scoring ---- */
  if(total>=8) return pick([wN+' vs '+lN+': '+a+'–'+b+'. That wasn\'t a football match, that was a film. Wheesht needs to lie down.',a+'–'+b+'. Wheesht has refereed tournaments since 1966. That is one of the most extraordinary scorelines Wheesht has ever witnessed.']);
  if(total>=6) return pick([wN+' and '+lN+' put on an absolute show — '+a+'–'+b+'. Wheesht barely blinked. That was breathtaking.',wN+' vs '+lN+': '+a+'–'+b+'. The defences took the day off. Wheesht is not complaining.']);
  if(total>=5) return pick([wN+' vs '+lN+' delivers '+total+' goals. Wheesht approves of the spectacle. This is what the tournament is for.',a+'–'+b+'. Goals, chaos, and a result at the end of it. Wheesht enjoyed every minute.']);

  /* ---- 1–0 — a classic ---- */
  if(margin===1&&total===1) return pick([wN+' win 1–0. A single goal, a clean sheet, and three points. Wheesht respects the professionalism.',wN+' grind out a 1–0. Defensive. Deliberate. Deeply satisfying if you\'re '+wN+'. Wheesht notes the result without further comment.']);

  /* ---- Hammering ---- */
  if(margin>=4) return pick([
    wN+' absolutely demolish '+lN+'. Wheesht is mildly concerned about the state of '+lN+'\'s defence.',
    wN+' take '+lN+' apart, '+a+'–'+b+'. That was clinical. That was brutal. That was a rout.',
    lN+' have been taken apart. '+wN+' were ruthless. Wheesht is taking notes.',
  ]);

  /* ---- Big margin ---- */
  if(margin>=3) return pick([
    wN+' take '+lN+' apart. Wheesht is a wee bit frightened.',
    wN+' win at a canter. '+lN+' had no answer. Wheesht notes the form.',
    wN+' are in serious form. '+lN+' didn\'t get a look-in. Wheesht is impressed — reluctantly.',
  ]);

  /* ---- Team-specific bespoke win/loss lines ---- */
  var teamNotes={
    BRA:{w:['Brazil doing what Brazil do. Wheesht is grudgingly impressed.','Brazil through. The five-time champions keep the run going. As expected — and yet it\'s still a sight.'],
         l:['Brazil. OUT. Wheesht had to check the feed three times. Brazil are out of the tournament.','The five-time champions are going home. Wheesht is genuinely lost for words. Brazil. Out.']},
    ARG:{w:['Argentina grinding out results. The world champions are not done yet.','Argentina through. Wheesht respects the resilience.'],
         l:['Argentina are gone. Someone phone Buenos Aires. The champions have been sent home.','Argentina out. Wheesht is scribbling furiously. This changes everything.']},
    FRA:{w:['France win without appearing to break a sweat. Wheesht is suspicious of how easy that looked.','France through. Efficient. Composed. Annoyingly composed.'],
         l:['France are out. The tournament just got less complicated for everyone else.','France eliminated. The favourites have gone. Wheesht\'s predictions are under review.']},
    ESP:{w:['Spain control the ball, control the game, control Wheesht\'s blood pressure.','Spain through. They make it look easy. It is not easy. Wheesht knows this.'],
         l:['Spain are out. The tiki-taka era has no answers today.','Spain go home. The possession stats were spectacular. The scoreline was not.']},
    POR:{w:['Portugal do enough. Individual quality carries them through once more.','Portugal through. The squad has the quality and they knew it. So did Wheesht.'],
         l:['Portugal exit. Wheesht takes no pleasure in this. (Wheesht takes some pleasure in this.)','Portugal are done. The individual brilliance wasn\'t enough today.']},
    GER:{w:['Germany reliable as ever. Efficient, relentless, infuriating to play against. Wheesht tips the hat.','Germany through. They always find a way. Always.'],
         l:['Germany go out. Wheesht notes this has happened before. It is always a little surprising.','Germany are eliminated. The machine has stopped. Wheesht is recalibrating.']},
    NED:{w:['The Netherlands are through. Pedigree, pace, and usually at least one stunning goal.','Netherlands win. They came with a plan, executed it, and Wheesht is taking notes.'],
         l:['The Dutch are done. Surprising is perhaps too strong a word. It\'s still a surprise.','Netherlands out. They had the quality. They didn\'t have the day.']},
    BEL:{w:['Belgium doing what was expected of them. Composed, dangerous, clinical.','Belgium through. The golden generation is still golden, apparently.'],
         l:['Belgium are out. The golden generation ends here.','Belgium go home. Wheesht files this under "anticipated but still jarring".']},
    NOR:{w:['Norway through. The goals have been flying in and this was no different.','Norway win. Wheesht is noting the goalscoring form with one raised eyebrow.'],
         l:['Norway are out. The goals dried up at the wrong moment.','Norway eliminated. Wheesht watched every minute and was entertained throughout.']},
    URU:{w:['Uruguay. Punching above their weight for over 100 years. This continues.','Uruguay through. Small squad, enormous heart. Wheesht cannot help but admire it.'],
         l:['Uruguay are out. Punching above their weight eventually has a ceiling.','Uruguay go home. They gave it everything. Wheesht watched every tackle.']},
    COL:{w:['Colombia through. Athletic, quick, and unpredictable. Wheesht is watching this one closely.','Colombia win. They were the better side and they knew it.'],
         l:['Colombia are out. The talent was there. The day wasn\'t.','Colombia eliminated. Wheesht expected more. So did Colombia.']},
    MAR:{w:['Morocco. They made the semi-final in Qatar. Wheesht has not forgotten. This is no surprise.','Morocco through. Clinical and well-organised. Wheesht is impressed.'],
         l:['Morocco are out. After the heroics of last time, this hurts a little. Even for Wheesht.','Morocco go home. They made history once. They gave it everything here.']},
    USA:{w:['USA win on home soil. The crowd will be having that.','USA through. Home advantage is very much playing its part. The noise is extraordinary.'],
         l:['USA are out of their own tournament. Wheesht will not comment further.','USA go home. The home crowd fell silent. Wheesht watched respectfully.']},
    CAN:{w:['Canada win on home soil. Wheesht is moved. The co-hosts are staying in.','Canada through. The home crowd has found its voice. This is wonderful, actually.'],
         l:['Canada are out. The co-hosts are watching the rest from the stands.','Canada go home. The home tournament ends here. Wheesht wishes them well.']},
    MEX:{w:['Mexico deliver for the home fans. The noise levels in the stadium are extraordinary.','Mexico through. The crowd willed them over the line. Wheesht felt it from here.'],
         l:['Mexico go out. Wheesht sends condolences to the local contingent.','Mexico are out of their home tournament. The stadium fell quiet. Wheesht noted every moment.']},
    JPN:{w:['Japan. Disciplined, organised, and loves an upset. This wasn\'t an upset — this was earned.','Japan through. Don\'t count them out. Wheesht has stopped counting them out.'],
         l:['Japan are out. They made it hard for everyone. That\'s all Wheesht will say.','Japan eliminated. Tidy, disciplined, and just short. Wheesht respects the effort.']},
    KOR:{w:['South Korea through. Fast, fit, and finishing when it counts.','Korea win. Wheesht is impressed with the pressing game. The pressing game was extraordinary.'],
         l:['South Korea are out. They pressed, they ran, they didn\'t quite get there.','Korea go home. The energy was there. The result wasn\'t.']},
    MAR:{w:['Morocco do it again. Wheesht has stopped underestimating them.','Morocco through. Organised at the back, dangerous up front. Wheesht nods.'],
         l:['Morocco are out. They made it hard for everyone who faced them.','Morocco go home. Wheesht files this one in "gave Wheesht a fright".']},
    SEN:{w:['Senegal through. Physical, technical, and genuinely dangerous. Wheesht is watching closely.','Senegal win. That was quality football and Wheesht will acknowledge it.'],
         l:['Senegal are out. They had the talent. Not quite enough to go all the way.','Senegal go home. Wheesht watched every minute. It was a tournament to be proud of.']},
    AUS:{w:['Australia through. Gritty, organised, and well-coached. Wheesht had a hunch.','Australia win. Do not write off the Socceroos. Wheesht never does.'],
         l:['Australia go home. They made it difficult for every team they faced.','Australia out. The Socceroos gave it everything. Wheesht was watching.']},
    CRO:{w:['Croatia. Experienced, stubborn, never know when they\'re beat. Wheesht approves.','Croatia through. They find a way every time. Wheesht has stopped being surprised.'],
         l:['Croatia go out. The golden generation finally reaches its end. Wheesht marks the moment.','Croatia are done. They were never supposed to get this far again, and yet here they were.']},
    ECU:{w:['Ecuador through. Wheesht had a quiet feeling about this one.','Ecuador win. The South Americans are solid and Wheesht is impressed.'],
         l:['Ecuador are out. There was quality there. It wasn\'t quite enough today.','Ecuador go home. Wheesht notes their performances were better than the exit suggests.']},
    SWE:{w:['Sweden through. Structured, disciplined, and dangerous at set pieces. Classic.','Sweden win. Wheesht had pencilled this in.'],
         l:['Sweden are out. They played the way Sweden play, and today it wasn\'t enough.','Sweden go home. Wheesht respects the organisation. The exits always surprise.']},
  };

  if(wCode&&teamNotes[wCode]&&teamNotes[wCode].w) return pick(teamNotes[wCode].w);
  if(lCode&&teamNotes[lCode]&&teamNotes[lCode].l) return pick(teamNotes[lCode].l);

  /* ---- Generic fallbacks with variety ---- */
  return pick([
    wN+' edge '+lN+'. Result logged. Wheesht remembers everything.',
    wN+' get the job done against '+lN+'. Workmanlike. Wheesht approves.',
    wN+' see off '+lN+'. '+margin+' goal'+(margin===1?'':'s')+' in it. Enough.',
    lN+' give it a go, but '+wN+' have the quality today. Result stands.',
    wN+' claim the three points. '+lN+' will want that performance back.',
    wN+' win. '+lN+' tried. Wheesht watched. Wheesht judged. '+wN+' were better.',
  ]);
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
  const pot = vPot(), char = vCharity();
  const cells = [];
  if (pot > 0) cells.push({ v: money2(pot), l: char > 0 ? 'winner takes all' : 'whole pot to the winner', c: 'var(--green)' });
  if (char > 0) cells.push({ v: money2(char), l: pot > 0 ? 'raised for charity' : 'whole pot to charity', c: 'var(--red)' });
  cells.push({ v: P.length, l: P.length === 1 ? 'entrant' : 'entrants', c: 'var(--ink)' });
  cells.push({ v: money2(WC2.FEE || 0), l: 'to enter', c: 'var(--ink)' });
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
  const hasUpset = recent.some(vIsUpset);

  RS.useEffect(function(){
    if(hasUpset) setTimeout(function(){ window.wcConfetti&&window.wcConfetti({y:.4,count:130}); }, 400);
  }, []);

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
            const upset = vIsUpset(f);
            return (
              <Card2 key={f.id} style={{marginBottom:9,padding:'12px 14px',border:upset?'2px solid var(--red)':'none'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:22}}>{ta.flag}</span>
                  <span style={{flex:1,fontWeight:800,fontSize:14,textAlign:'right',opacity:bWin?.5:1,textDecoration:bWin?'line-through':'none'}}>{ta.name}</span>
                  <span className="dh" style={{fontSize:20,padding:'0 4px'}}>{f.score[0]}–{f.score[1]}</span>
                  <span style={{flex:1,fontWeight:800,fontSize:14,opacity:aWin?.5:1,textDecoration:aWin?'line-through':'none'}}>{tb.name}</span>
                  <span style={{fontSize:22}}>{tb.flag}</span>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'flex-start',marginTop:9,paddingTop:9,borderTop:'1.5px solid var(--line)'}}>
                  <span style={{fontSize:11,fontWeight:800,letterSpacing:'.05em',textTransform:'uppercase',color:'var(--red)',whiteSpace:'nowrap'}}>FT · Gp {f.group}</span>
                  {upset && <Stamp2 tone="red" rotate={-3} style={{fontSize:9.5,flexShrink:0}}>UPSET</Stamp2>}
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
    </div>
  );
}

function SummaryScreen(props){
  return (WC2.meta.phase === 'pre') ? <PreVerdict/> : <LiveVerdict/>;
}

window.SideBetsScreen = SideBetsScreen;
window.SummaryScreen = SummaryScreen;
