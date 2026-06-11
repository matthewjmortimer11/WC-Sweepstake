/* ===========================================================================
   ONBOARDING & IDENTITY SCREENS
   Account gate (pick / add / recover) · onboarding form · the draw ·
   Scotland takeover · England dry-humour beat.
   =========================================================================== */
const WCo = window.WC;
const Wo = window.Wheesht;
const So = window.Store;
const { Card: Co, Btn: Bo, Flag: Fo, Avatar: Ao, Chip: Cho, Stamp: Sto } = window;
const { useState: oState, useEffect: oEffect, useRef: oRef } = React;

const DEPTS = ['Engineering', 'Product', 'Design', 'Sales', 'Marketing', 'Finance', 'Legal', 'People', 'Operations', 'Data', 'Support', 'Delivery'];

const inp = {
  width: '100%', border: '2.5px solid var(--ink)', borderRadius: 13, padding: '13px 14px',
  fontFamily: 'var(--body)', fontWeight: 600, fontSize: 16, background: '#fff', color: 'var(--ink)',
  outline: 'none', marginTop: 6
};
function Lab(p) { return <label style={{ fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)', letterSpacing: '.02em' }}>{p.children}{p.opt && <span style={{ color: 'var(--ink2)', fontWeight: 600 }}> · optional</span>}</label>; }
function Seg(p) {
  return <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
    {p.options.map(o => (
      <button key={o.value} onClick={() => p.onChange(o.value)} className="wc-btn wc-btn--sm"
        style={{ flex: 1, background: p.value === o.value ? 'var(--yellow)' : '#fff', boxShadow: p.value === o.value ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>
        {o.label}
      </button>
    ))}
  </div>;
}

/* =================== ACCOUNT GATE =================== */
function AccountGate(props) {
  const accounts = So.deviceAccounts();
  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '34px 22px 28px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block' }} className="pop"><Wo mood="happy" size={148} animate track /></div>
          <div className="dh" style={{ fontSize: 30, marginTop: 8, lineHeight: 1 }}>{WCo.meta.name}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', marginTop: 6 }}>{WCo.meta.season} · {WCo.meta.stageLabel}</div>
          <div style={{ display: 'inline-flex', marginTop: 14, background: 'var(--ink)', color: '#fff', borderRadius: '16px 16px 16px 5px', padding: '11px 15px', maxWidth: 320, textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}><span style={{ color: 'var(--yellow)', fontWeight: 800 }}>Wheesht here.</span> Officially impartial. Constitutionally Scottish. Who am I talking to?</div>
          </div>
        </div>

        {accounts.length > 0 && <>
          <div className="wc-sec" style={{ margin: '26px 4px 11px' }}><h3>On this device</h3><span>{accounts.length} {accounts.length === 1 ? 'entry' : 'entries'}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {accounts.map(p => {
              const t = WCo.TEAMS[p.team];
              return <button key={p.id} onClick={() => props.onPick(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '2.5px solid var(--ink)', borderRadius: 16, padding: '11px 13px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 4px 0 var(--ink)' }}>
                <Ao person={p} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dh" style={{ fontSize: 17 }}>{p.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{p.location}{p.department ? ' · ' + p.department : ''}{p.ltMember ? ' · LT' : ''}</div>
                </div>
                {t && <Fo team={t} size={26} />}
                <span className="dh" style={{ fontSize: 20 }}>→</span>
              </button>;
            })}
          </div>
        </>}

        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Bo variant="ink" block onClick={props.onNew}>{accounts.length ? 'Add someone new' : 'Join the sweepstake'} →</Bo>
          <button onClick={props.onFind} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 800, color: 'var(--ink2)', textDecoration: 'underline', padding: '4px 0' }}>Already entered elsewhere? Find my entry</button>
        </div>
      </div>
    </div>
  );
}

/* =================== FIND MY ENTRY =================== */
function FindMyEntry(props) {
  const [q, setQ] = oState('');
  const results = q.trim() ? So.search(q) : [];
  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '30px 22px 28px' }}>
        <button onClick={props.onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--ink2)', padding: 0, marginBottom: 14 }}>← Back</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Wo mood="mischievous" size={72} animate />
          <div>
            <div className="dh" style={{ fontSize: 24, lineHeight: 1 }}>Find my entry</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>No password needed. Just yer name — Wheesht never forgets a face.</div>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <Lab>Search by name</Lab>
          <input autoFocus style={inp} value={q} onChange={e => setQ(e.target.value)} placeholder="Start typing your name…" />
        </div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {q.trim() && results.length === 0 &&
            <Co flat style={{ textAlign: 'center', padding: '22px 14px' }}>
              <Wo mood="nervous" size={64} animate />
              <div className="dh" style={{ fontSize: 17, marginTop: 6 }}>Nae sign of ye.</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>Different spelling? Or maybe you've not entered yet.</div>
              <div style={{ marginTop: 12 }}><Bo variant="primary" sm onClick={props.onNew}>Enter as someone new →</Bo></div>
            </Co>}
          {results.map(p => {
            const t = WCo.TEAMS[p.team];
            return <button key={p.id} onClick={() => props.onPicked(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '2px solid var(--line)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
              <Ao person={p} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>{p.location}{p.department ? ' · ' + p.department : ''}</div>
              </div>
              {t && <Fo team={t} size={22} />}
              <span className="dh" style={{ fontSize: 16, color: 'var(--red)' }}>This is me →</span>
            </button>;
          })}
        </div>
      </div>
    </div>
  );
}

/* =================== ONBOARDING FORM =================== */
function OnboardingForm(props) {
  const [name, setName] = oState('');
  const [dept, setDept] = oState('');
  const [loc, setLoc] = oState('Edinburgh');
  const [lt, setLt] = oState(false);
  const ok = name.trim().length > 0;
  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '28px 22px 30px' }}>
        <button onClick={props.onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--ink2)', padding: 0, marginBottom: 10 }}>← Back</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block' }} className="pop"><Wo mood="confident" size={120} animate track /></div>
          <div className="dh" style={{ fontSize: 28, marginTop: 4, lineHeight: 1 }}>Let's get ye signed up.</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 6 }}>Takes ten seconds. The only bit Wheesht actually needs is yer name.</div>
        </div>

        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Lab>Full name</Lab>
            <input autoFocus style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Davie McAllister" />
          </div>
          <div>
            <Lab opt>Team / department</Lab>
            <input style={inp} value={dept} onChange={e => setDept(e.target.value)} placeholder="e.g. Engineering" list="wh-depts" />
            <datalist id="wh-depts">{DEPTS.map(d => <option key={d} value={d} />)}</datalist>
          </div>
          <div>
            <Lab>Work location</Lab>
            <Seg value={loc} onChange={setLoc} options={[{ value: 'Edinburgh', label: 'Edinburgh' }, { value: 'London', label: 'London' }]} />
          </div>
          <div>
            <Lab>Leadership Team member?</Lab>
            <Seg value={lt} onChange={setLt} options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]} />
          </div>
        </div>

        <Co bordered style={{ marginTop: 20, background: 'var(--yellow)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>Your buy-in</div>
          <div className="dh" style={{ fontSize: 28, margin: '2px 0 4px' }}>You're putting in £{WCo.FEE}.</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}><b>£{(WCo.FEE / 2).toFixed(2).replace(/\.00$/, '')} goes to charity</b>, the other half into a winner-takes-all pot — <b>{('£' + (((window.Store ? window.Store.pot() : WCo.POT * 0.5) + WCo.FEE * 0.5)).toLocaleString('en-GB'))}</b> once you're in, and growing with every sign-up.</div>
        </Co>

        <div style={{ marginTop: 18 }}>
          <Bo variant="ink" block onClick={() => ok && props.onSubmit({ name: name.trim(), department: dept.trim(), location: loc, ltMember: lt })}>
            {ok ? 'To the draw →' : 'Pop yer name in first'}
          </Bo>
        </div>
      </div>
    </div>
  );
}

/* =================== THE DRAW (with special events) =================== */
function DrawMoment(props) {
  const forceTeam = props.forceTeam || (props.participant && props.participant.team);
  const teams = WCo.TEAM_LIST;
  const target = teams.findIndex(t => t.code === forceTeam);
  const [phase, setPhase] = oState('ready'); // ready | rolling | revealed
  const [idx, setIdx] = oState(0);
  const timer = oRef(null);
  const t = WCo.TEAMS[forceTeam];
  const isSCO = forceTeam === 'SCO';
  const isENG = forceTeam === 'ENG';

  function verdict() {
    if (isSCO) return WCo.LINES.scotland;
    if (isENG) return WCo.LINES.england;
    const odds = parseInt(t.odds.slice(1), 10);
    return odds <= 2500 ? WCo.LINES.drawGood : odds <= 20000 ? WCo.LINES.drawMid : WCo.LINES.drawBad;
  }

  function spin() {
    setPhase('rolling');
    const fast = 22, slow = 12, total = fast + slow; let k = 0;
    function step() {
      k++;
      if (k >= total) {
        setIdx(target < 0 ? 0 : target); setPhase('revealed');
        if (isSCO) { /* takeover handles fx */ }
        else if (isENG) { window.wcToast && window.wcToast(WCo.LINES.england, 'mischievous'); }
        else { window.wcConfetti && window.wcConfetti({ y: .4, count: 150 }); }
        return;
      }
      setIdx(k % teams.length);
      const into = k - fast;
      timer.current = setTimeout(step, into <= 0 ? 46 : 46 + into * into * 3.4);
    }
    timer.current = setTimeout(step, 46);
  }
  oEffect(() => () => clearTimeout(timer.current), []);

  if (phase === 'revealed' && isSCO) return <ScotlandTakeover team={t} onDone={props.onDone} />;

  const cur = teams[idx] || teams[0];
  return (
    <div className="moment ink">
      <div className="mscroll" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '30px 22px', textAlign: 'center' }}>
        {phase !== 'revealed' && <>
          <div className="dh" style={{ fontSize: 14, letterSpacing: '.16em', color: 'var(--yellow)' }}>THE DRAW</div>
          <div style={{ margin: '14px 0' }}><Wo mood={phase === 'rolling' ? 'nervous' : 'confident'} size={128} animate /></div>
          <div className="dh" style={{ fontSize: 22, lineHeight: 1.04, maxWidth: 300 }}>
            {phase === 'ready' ? 'Wheesht is administering the draw. Personally.' : 'Here we go…'}
          </div>
          <div style={{ margin: '22px auto', width: 200, height: 200, borderRadius: 28, border: '4px solid var(--yellow)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 6px rgba(245,200,0,.18)', overflow: 'hidden' }}>
            <span style={{ fontSize: 108, lineHeight: 1, filter: phase === 'rolling' ? 'blur(1px)' : 'none' }}>{cur.flag}</span>
          </div>
          {phase === 'ready'
            ? <Bo variant="primary" onClick={spin}>Do the draw</Bo>
            : <div className="dh" style={{ fontSize: 16, color: 'var(--yellow)' }}>Drawing…</div>}
        </>}

        {phase === 'revealed' && <div className="pop" style={{ width: '100%' }}>
          <div className="dh" style={{ fontSize: 14, letterSpacing: '.16em', color: 'var(--yellow)' }}>YE'VE DRAWN</div>
          <div style={{ fontSize: 116, lineHeight: 1, margin: '8px 0' }}>{t.flag}</div>
          <div className="dh" style={{ fontSize: 44 }}>{t.name}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '12px 0 4px' }}>
            <Cho tone="yellow">Group {t.group}</Cho>
            <Cho style={{ background: '#fff' }}>Odds {t.odds}</Cho>
            {t.alive ? <Cho tone="green">Still in</Cho> : <Cho tone="red">Out</Cho>}
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 11, alignItems: 'flex-end', textAlign: 'left', background: '#fff', color: 'var(--ink)', borderRadius: 18, padding: 14 }}>
            <Wo mood={isENG ? 'mischievous' : (t.alive ? 'confident' : 'crying')} size={70} animate />
            <div>
              <div className="dh" style={{ fontSize: 11, letterSpacing: '.06em', color: 'var(--red)' }}>WHEESHT'S VERDICT</div>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.32, marginTop: 3 }}>{verdict()}</div>
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Bo variant="primary" block onClick={() => window.wcToast && window.wcToast('Draw shared to the group. The slagging begins.', 'mischievous')}>Share your draw</Bo>
            <Bo variant="ghost" block onClick={props.onDone} style={{ background: 'transparent', color: '#fff', boxShadow: '0 4px 0 rgba(255,255,255,.25)' }}>Into my dashboard →</Bo>
          </div>
        </div>}
      </div>
    </div>
  );
}

/* =================== SCOTLAND TAKEOVER (maximum chaos) =================== */
function ScotlandTakeover(props) {
  oEffect(() => {
    const saltire = ['#0a4aa0', '#0a4aa0', '#ffffff', '#ffffff', '#cfe0f5'];
    const burst = () => window.wcConfetti && window.wcConfetti({ count: 220, y: .38, colors: saltire });
    burst();
    const t1 = setTimeout(() => window.wcConfetti && window.wcConfetti({ count: 160, x: .2, y: .3, colors: saltire }), 350);
    const t2 = setTimeout(() => window.wcConfetti && window.wcConfetti({ count: 160, x: .8, y: .3, colors: saltire }), 700);
    const iv = setInterval(burst, 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(iv); };
  }, []);
  const fw = [{ l: '18%', t: '20%', d: '0s', c: '#fff' }, { l: '78%', t: '16%', d: '.5s', c: '#F5C800' }, { l: '50%', t: '8%', d: '1s', c: '#cfe0f5' }, { l: '30%', t: '34%', d: '1.4s', c: '#fff' }, { l: '70%', t: '40%', d: '.9s', c: '#F5C800' }];
  return (
    <div className="moment" style={{ background: 'radial-gradient(120% 100% at 50% 0%, #0c57bd 0%, #06316c 70%, #041f44 100%)', overflow: 'hidden' }}>
      {/* saltire rays */}
      <div style={{ position: 'absolute', inset: 0, opacity: .14, backgroundImage: 'repeating-conic-gradient(from 0deg at 50% 42%, #fff 0deg 8deg, transparent 8deg 18deg)', animation: 'spin 26s linear infinite' }} />
      {fw.map((f, i) => <div key={i} style={{ position: 'absolute', left: f.l, top: f.t, width: 8, height: 8, borderRadius: '50%', background: f.c, boxShadow: '0 0 0 0 ' + f.c, animation: 'fwBurst 1.8s ease-out ' + f.d + ' infinite' }} />)}
      <div className="mscroll" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '30px 22px', textAlign: 'center', color: '#fff' }}>
        <div className="dh" style={{ fontSize: 13, letterSpacing: '.22em', color: '#F5C800' }}>★ OFFICIAL WHEESHT EMERGENCY ★</div>
        <div style={{ margin: '6px 0' }}><Wo mood="scottish" size={172} animate /></div>
        <div className="dh" style={{ fontSize: 46, lineHeight: .94, textShadow: '0 4px 0 rgba(0,0,0,.25)' }}>YOU'VE<br />DRAWN<br /><span style={{ color: '#F5C800' }}>SCOTLAND!</span></div>
        <div style={{ fontSize: 60, margin: '8px 0' }}>🏴󠁧󠁢󠁳󠁣󠁴󠁿</div>
        <div style={{ background: 'rgba(255,255,255,.12)', border: '2.5px solid rgba(255,255,255,.4)', borderRadius: 18, padding: '12px 16px', maxWidth: 320, backdropFilter: 'blur(2px)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.38 }}>{WCo.LINES.scotland}</div>
        </div>
        {/* achievement badge */}
        <div className="pop" style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 13, background: 'var(--yellow)', color: 'var(--ink)', borderRadius: 18, padding: '12px 16px', boxShadow: '0 8px 0 rgba(0,0,0,.35)' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--ink)', color: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flex: '0 0 auto', boxShadow: 'inset 0 0 0 3px var(--yellow)' }}>🎖️</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink2)' }}>Achievement unlocked</div>
            <div className="dh" style={{ fontSize: 19 }}>First-Foot Fellow</div>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>Drew the homeland. Wheesht salutes ye.</div>
          </div>
        </div>
        <div style={{ marginTop: 20, width: '100%', maxWidth: 340 }}>
          <Bo variant="primary" block onClick={props.onDone}>Tha sin sgoinneil — into my dashboard →</Bo>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AccountGate, FindMyEntry, OnboardingForm, DrawMoment, ScotlandTakeover });
