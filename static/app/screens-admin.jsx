/* ===========================================================================
   ADMIN — Wheesht's clipboard. Run the sweepstake through the tournament:
   set the phase, mark teams out (owners flip to eliminated automatically),
   enter match results (fixtures go live / done), and set prediction answers
   (everyone's score + the league re-grade instantly). All changes persist via
   Store and, in live mode, push to the backend so every device picks them up.
   =========================================================================== */
const WCa = window.WC;
const Wa = window.Wheesht;
const Sa = window.Store;
const { Card: Ca, Btn: Ba, Flag: Fa, Chip: Cha, SectionHead: SHa } = window;
const { useState: aState2 } = React;

/* ---- match banter ----------------------------------------------------------
   When the organiser saves a full-time score, Wheesht pipes up in the house
   voice: homeland bias for Scotland, dry "remaining professional" digs at
   England, plain dry wit for everyone else. Returns {text, mood} for wcToast. */
function matchBanter(f, a, b) {
  const ta = WCa.TEAMS[f.a], tb = WCa.TEAMS[f.b];
  const na = ta ? ta.name : f.a, nb = tb ? tb.name : f.b;
  const draw = a === b, aWin = a > b, margin = Math.abs(a - b);
  const wName = aWin ? na : nb, lName = aWin ? nb : na;
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  if (f.a === 'SCO' || f.b === 'SCO') {
    const scoWon = (f.a === 'SCO' && aWin) || (f.b === 'SCO' && !aWin);
    const other = f.a === 'SCO' ? nb : na;
    if (draw) return { text: pick([
      'Scotland hold ' + other + ' to a draw. A point is a point. Wheesht will take it.',
      'Honours even for Scotland. Wheesht is calling that a moral victory.'
    ]), mood: 'confident' };
    if (scoWon) return { text: pick([
      'SCOTLAND WIN, ' + a + '–' + b + '. Wheesht is not greetin\'. Wheesht has something in its eye.',
      'Scotland see off ' + other + '. Write it down. Frame it. Wheesht aye believed.',
      'The homeland delivers. ' + other + ' sent homeward tae think again.'
    ]), mood: 'scottish' };
    return { text: pick([
      'Scotland fall to ' + other + '. Wheesht expected nothing and is somehow still disappointed.',
      'A gallant Scotland defeat — the most Scottish result there is. Wheesht endures.',
      'Scotland lose. Wheesht is fine. Wheesht is always fine. (Wheesht is not fine.)'
    ]), mood: 'crying' };
  }

  if (f.a === 'ENG' || f.b === 'ENG') {
    const engWon = (f.a === 'ENG' && aWin) || (f.b === 'ENG' && !aWin);
    const other = f.a === 'ENG' ? nb : na;
    if (draw) return { text: 'England draw with ' + other + '. Wheesht is remaining professional. Barely.', mood: 'mischievous' };
    if (engWon) return { text: pick([
      'England beat ' + other + '. Wheesht is noting it down. Without comment. For now.',
      'England win. Wheesht is remaining professional. It is costing Wheesht dearly.'
    ]), mood: 'mischievous' };
    return { text: pick([
      'England lose to ' + other + '. Wheesht is staying neutral. Wheesht is struggling.',
      other + ' see off England. Wheesht has no comment — and a small, private smile.'
    ]), mood: 'smug' };
  }

  if (draw) return { text: pick([
    na + ' and ' + nb + ' share the points, ' + a + '–' + b + '. Wheesht has seen worse.',
    'All square: ' + na + ' ' + a + '–' + b + ' ' + nb + '. Result logged.'
  ]), mood: 'neutral' };
  if (margin >= 3) return { text: pick([
    wName + ' take ' + lName + ' apart, ' + a + '–' + b + '. Wheesht almost felt sorry for them. Almost.',
    'A rout. ' + wName + ' run riot against ' + lName + '. Wheesht is impressed and a wee bit frightened.'
  ]), mood: 'shocked' };
  return { text: pick([
    wName + ' edge ' + lName + ', ' + a + '–' + b + '. Result logged. Wheesht remembers everything.',
    wName + ' take it. ' + lName + ' will have words in the dressing room. Wheesht logged it.'
  ]), mood: 'confident' };
}

function PhaseSeg() {
  const cur = Sa.phase();
  const opts = [['pre', 'Pre-kickoff'], ['live', 'In play'], ['done', 'Finished']];
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {opts.map(([k, lab]) => (
        <button key={k} onClick={() => Sa.setPhase(k)} className="wc-btn wc-btn--sm"
          style={{ flex: 1, background: cur === k ? 'var(--yellow)' : '#fff', boxShadow: cur === k ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>{lab}</button>
      ))}
    </div>
  );
}

function TeamToggle(props) {
  const t = props.t; const owners = props.owners;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 4px', borderBottom: '1.5px solid var(--line)', opacity: t.alive ? 1 : .6 }}>
      <Fa team={t} size={22} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, textDecoration: t.alive ? 'none' : 'line-through' }}>{t.name}</div>
        {owners > 0 && <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--red)' }}>{owners} in the draw</div>}
      </div>
      <button onClick={() => Sa.setTeamOut(t.code, t.alive)} className="wc-btn wc-btn--sm"
        style={{ padding: '6px 12px', background: t.alive ? '#fff' : 'var(--ink)', color: t.alive ? 'var(--ink)' : '#fff', boxShadow: t.alive ? '0 3px 0 var(--shadow)' : '0 3px 0 #000' }}>
        {t.alive ? 'Knock out' : 'Bring back'}
      </button>
    </div>
  );
}

function ScoreStepper(props) {
  const [a, setA] = aState2(props.a); const [b, setB] = aState2(props.b);
  const ta = WCa.TEAMS[props.f.a], tb = WCa.TEAMS[props.f.b];
  function step(box, setter, val, d) { var n = Math.max(0, val + d); setter(n); }
  const num = { width: 34, textAlign: 'center', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 22 };
  const sbtn = { width: 28, height: 28, borderRadius: 8, border: '2px solid var(--ink)', background: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer', lineHeight: 1 };
  return (
    <div style={{ marginTop: 10, background: 'var(--bg)', borderRadius: 12, padding: '12px' }}>
      {[[ta, a, setA], [tb, b, setB]].map(([t, v, set], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i === 0 ? 8 : 0 }}>
          <span style={{ fontSize: 20 }}>{t.flag}</span>
          <span style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>{t.name}</span>
          <button style={sbtn} onClick={() => step(i, set, v, -1)}>–</button>
          <span style={num}>{v}</span>
          <button style={sbtn} onClick={() => step(i, set, v, 1)}>+</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
        <Ba variant="ink" sm block onClick={() => props.onSave(a, b)}>Save full-time</Ba>
        <button onClick={props.onCancel} className="wc-btn wc-btn--sm" style={{ boxShadow: '0 4px 0 var(--shadow)', padding: '0 14px' }}>Cancel</button>
      </div>
    </div>
  );
}

function FixtureAdminRow(props) {
  const f = props.f; const [open, setOpen] = aState2(false);
  const ta = WCa.TEAMS[f.a], tb = WCa.TEAMS[f.b];
  const st = f.status || 'upcoming';
  return (
    <Ca flat style={{ padding: '11px 13px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 18 }}>{ta.flag}</span>
          <span style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ta.code}</span>
          <span style={{ color: 'var(--ink2)', fontWeight: 800, fontSize: 12, padding: '0 2px' }}>
            {st === 'done' && f.score ? f.score[0] + '–' + f.score[1] : 'v'}
          </span>
          <span style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tb.code}</span>
          <span style={{ fontSize: 18 }}>{tb.flag}</span>
        </div>
        {st === 'done'
          ? <Cha tone="ink">FT</Cha>
          : st === 'live'
            ? <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--red)' }}>● LIVE</span>
            : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{f.time}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink2)', flex: 1 }}>Gp {f.group} · {f.dateLabel}</span>
        {st !== 'done' && <button onClick={() => Sa.setFixtureLive(f.id, st !== 'live')} className="wc-btn wc-btn--sm" style={{ padding: '5px 10px', boxShadow: '0 3px 0 var(--shadow)' }}>{st === 'live' ? 'Stop live' : 'Go live'}</button>}
        <button onClick={() => setOpen(!open)} className="wc-btn wc-btn--sm" style={{ padding: '5px 10px', boxShadow: '0 3px 0 var(--shadow)' }}>{st === 'done' ? 'Edit score' : 'Enter score'}</button>
        {st === 'done' && <button onClick={() => Sa.clearFixture(f.id)} className="wc-btn wc-btn--sm" style={{ padding: '5px 10px', boxShadow: '0 3px 0 var(--shadow)' }}>Undo</button>}
      </div>
      {open && <ScoreStepper f={f} a={f.score ? f.score[0] : 0} b={f.score ? f.score[1] : 0}
        onSave={(a, b) => {
          Sa.setFixtureResult(f.id, a, b);
          setOpen(false);
          const bn = matchBanter(f, a, b);
          if (window.wcToast) window.wcToast(bn.text, bn.mood);
        }} onCancel={() => setOpen(false)} />}
    </Ca>
  );
}

function PredAdmin(props) {
  const m = props.m;
  function label(opt) {
    if (m.kind === 'player') return opt.name;
    if (m.kind === 'stage') return opt;
    return WCa.TEAMS[opt] ? WCa.TEAMS[opt].name : opt;
  }
  function id(opt) { return m.kind === 'player' ? opt.id : opt; }
  const isTwo = m.kind === 'team2';
  const ans = m.answer;
  function choose(oid) {
    if (isTwo) {
      let arr = Array.isArray(ans) ? ans.slice() : [];
      if (arr.indexOf(oid) >= 0) arr = arr.filter(x => x !== oid); else { arr.push(oid); if (arr.length > 2) arr.shift(); }
      Sa.setPredictionAnswer(m.key, arr.length ? arr : null);
    } else Sa.setPredictionAnswer(m.key, ans === oid ? null : oid);
  }
  const picked = (oid) => isTwo ? (Array.isArray(ans) && ans.indexOf(oid) >= 0) : ans === oid;
  return (
    <Ca flat style={{ padding: '11px 13px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="dh" style={{ fontSize: 15 }}>{m.q}</div>
        <Cha tone={ans != null && (!isTwo || ans.length) ? 'green' : 'ghost'}>{ans != null && (!isTwo || ans.length) ? 'set' : 'open'}</Cha>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {m.options.map((opt, i) => {
          const on = picked(id(opt));
          return <button key={i} onClick={() => choose(id(opt))}
            style={{ border: '2px solid ' + (on ? 'var(--ink)' : 'var(--line)'), background: on ? 'var(--yellow)' : '#fff', borderRadius: 10, padding: '6px 10px', fontFamily: 'var(--body)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>{label(opt)}</button>;
        })}
      </div>
    </Ca>
  );
}

function AdminPanel(props) {
  const [, bump] = aState2(0);
  React.useEffect(() => Sa.subscribe(() => bump(x => x + 1)), []);
  const [sec, setSec] = aState2('results');
  const [mdFilter, setMdFilter] = aState2(0);
  const owned = {};
  Sa.allSync().forEach(p => { owned[p.team] = (owned[p.team] || 0) + 1; });

  const groups = 'ABCDEFGHIJKL'.split('');
  const fixtures = (WCa.FIXTURES || []).filter(f => mdFilter === 0 || f.matchday === mdFilter);
  // group fixtures by date
  const byDate = []; const seen = {};
  fixtures.forEach(f => { if (!seen[f.dateISO]) { seen[f.dateISO] = { label: f.dateLabel, items: [] }; byDate.push(seen[f.dateISO]); } seen[f.dateISO].items.push(f); });

  const secs = [['results', 'Results'], ['teams', 'Teams'], ['predict', 'Predictions'], ['people', 'People'], ['chat', 'Chat']];

  return (
    <div className="moment" style={{ background: 'var(--bg)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--ink)', color: '#fff', padding: '16px 18px 12px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <Wa mood="confident" size={44} />
        <div style={{ flex: 1 }}>
          <div className="dh" style={{ fontSize: 20, color: '#fff', lineHeight: 1 }}>Wheesht's clipboard</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--yellow)' }}>Admin · {Sa.teamsAlive()} teams in · {Sa.allSync().length} entrants</div>
        </div>
        <button onClick={props.onClose} style={{ border: 'none', background: 'rgba(255,255,255,.16)', color: '#fff', width: 34, height: 34, borderRadius: 10, fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>×</button>
      </div>

      <div className="mscroll" style={{ padding: '16px 18px 30px' }}>
        <SHa>Tournament phase</SHa>
        <PhaseSeg />

        <div style={{ display: 'flex', gap: 7, margin: '20px 0 14px' }}>
          {secs.map(([k, lab]) => (
            <button key={k} onClick={() => setSec(k)} className={'wc-chip' + (sec === k ? ' wc-chip--yellow' : '')} style={{ flex: 1, cursor: 'pointer', textAlign: 'center' }}>{lab}</button>
          ))}
        </div>

        {sec === 'results' && <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
            {[[0, 'All'], [1, 'MD1'], [2, 'MD2'], [3, 'MD3']].map(([k, lab]) => (
              <button key={k} onClick={() => setMdFilter(k)} className={'wc-chip' + (mdFilter === k ? ' wc-chip--yellow' : '')} style={{ cursor: 'pointer', flex: '0 0 auto' }}>{lab}</button>
            ))}
          </div>
          {byDate.map((d, i) => (
            <div key={i}>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 12, color: 'var(--ink2)', margin: '10px 2px 8px', letterSpacing: '.04em' }}>{d.label.toUpperCase()}</div>
              {d.items.map(f => <FixtureAdminRow key={f.id} f={f} owned={owned} />)}
            </div>
          ))}
        </>}

        {sec === 'teams' && <>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8 }}>Knock a team out and everyone holding it flips to eliminated automatically.</div>
          {groups.map(g => {
            const ts = WCa.TEAM_LIST.filter(t => t.group === g);
            if (!ts.length) return null;
            return <Ca key={g} flat style={{ padding: '8px 14px', marginBottom: 9 }}>
              <div className="dh" style={{ fontSize: 14, marginBottom: 2 }}>Group {g}</div>
              {ts.map(t => <TeamToggle key={t.code} t={t} owners={owned[t.code] || 0} />)}
            </Ca>;
          })}
        </>}

        {sec === 'predict' && <>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>Set the answer once it's known — every entrant's score and the league re-grade instantly.</div>
          {(WCa.predictions || Sa.PREDICTIONS).map(m => <PredAdmin key={m.key} m={m} />)}
        </>}

        {sec === 'people' && <PeopleAdmin />}

        {sec === 'chat' && <ChatAdmin />}

        <div style={{ marginTop: 22, borderTop: '2px solid var(--line)', paddingTop: 16 }}>
          <button onClick={() => { if (window.confirm('Reset ALL results, eliminations and answers back to pre-kickoff?')) Sa.adminReset(); }}
            style={{ width: '100%', border: '2px solid var(--red)', borderRadius: 11, background: '#fff', color: 'var(--red)', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 13, padding: '11px', cursor: 'pointer' }}>Reset tournament to pre-kickoff</button>
        </div>
      </div>
    </div>
  );
}

function PeopleAdmin() {
  const [q, setQ] = aState2('');
  const all = Sa.allSync().slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const list = q.trim() ? all.filter(p => (p.name || '').toLowerCase().indexOf(q.toLowerCase()) >= 0) : all;
  const fld = { width: '100%', border: '2.5px solid var(--ink)', borderRadius: 12, padding: '10px 13px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 15, outline: 'none', marginBottom: 12 };
  function remove(p) {
    if (window.confirm('Remove ' + (p.name || 'this entrant') + ' from the sweepstake? This frees their entry and adjusts the pot.')) Sa.removeParticipant(p.id);
  }
  return (
    <>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>Remove an entrant — say they dropped out or paid late. Frees their slot and trims the pot &amp; charity totals.</div>
      <input style={fld} placeholder="Search entrants…" value={q} onChange={e => setQ(e.target.value)} />
      {list.length === 0
        ? <Ca flat style={{ textAlign: 'center', padding: '24px 14px' }}>
            <Wa mood="neutral" size={56} animate />
            <div className="dh" style={{ fontSize: 16, marginTop: 6 }}>{all.length ? 'No match.' : 'No entrants yet.'}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>{all.length ? 'Try a different name.' : 'They’ll appear here as people sign up.'}</div>
          </Ca>
        : <Ca flat style={{ padding: '2px 13px' }}>
            {list.map((p, i) => {
              const t = WCa.TEAMS[p.team];
              return <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < list.length - 1 ? '1.5px solid var(--line)' : 'none' }}>
                {t && <Fa team={t} size={22} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{(p.location || p.city || '')}{p.department ? ' · ' + p.department : ''}{t ? ' · ' + t.name : ''}</div>
                </div>
                <button onClick={() => remove(p)} className="wc-btn wc-btn--sm" style={{ padding: '6px 12px', background: '#fff', color: 'var(--red)', boxShadow: '0 3px 0 var(--shadow)' }}>Remove</button>
              </div>;
            })}
          </Ca>}
    </>
  );
}

/* ---- chat moderation -------------------------------------------------------
   Live only. Lists recent messages newest-first; the organiser can delete any
   one (server removes it from data/chat.json). */
function ChatAdmin() {
  const [msgs, setMsgs] = aState2([]);
  const [loading, setLoading] = aState2(true);
  const isLive = !!window.WC_LIVE;

  function load() {
    fetch('/api/chat').then(r => r.json()).then(d => {
      setMsgs((d || []).slice().reverse());
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  React.useEffect(() => { if (isLive) load(); else setLoading(false); }, []);

  function del(id) {
    if (!window.confirm('Delete this message for everyone? This cannot be undone.')) return;
    fetch('/api/chat/' + id, { method: 'DELETE' })
      .then(() => setMsgs(prev => prev.filter(m => m.id !== id)))
      .catch(() => {});
  }

  if (!isLive) {
    return <Ca flat style={{ textAlign: 'center', padding: '24px 14px' }}>
      <Wa mood="neutral" size={56} animate />
      <div className="dh" style={{ fontSize: 16, marginTop: 6 }}>Chat is server-only.</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>Moderation works once the app is connected to the sweepstake server.</div>
    </Ca>;
  }

  return (
    <>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>Keep the wall civil — delete anything out of order. Removals are instant for everyone.</div>
      {loading
        ? <Ca flat style={{ textAlign: 'center', padding: '24px 14px', fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>Loading messages…</Ca>
        : msgs.length === 0
          ? <Ca flat style={{ textAlign: 'center', padding: '24px 14px' }}>
              <Wa mood="waiting" size={56} animate />
              <div className="dh" style={{ fontSize: 16, marginTop: 6 }}>Nothing to moderate.</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>Messages will appear here as people chat.</div>
            </Ca>
          : <Ca flat style={{ padding: '2px 13px' }}>
              {msgs.map((m, i) => {
                const d = new Date(m.ts);
                const timeStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                return <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < msgs.length - 1 ? '1.5px solid var(--line)' : 'none' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: m.color || '#333', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>{m.initials || '?'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink2)' }}>{m.author} · {timeStr}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, wordBreak: 'break-word', marginTop: 2 }}>{m.text}</div>
                  </div>
                  <button onClick={() => del(m.id)} className="wc-btn wc-btn--sm" style={{ padding: '5px 11px', background: '#fff', color: 'var(--red)', boxShadow: '0 3px 0 var(--shadow)', flexShrink: 0 }}>Delete</button>
                </div>;
              })}
            </Ca>}
    </>
  );
}

/* ---- PIN gate --------------------------------------------------------------
   Soft gate in front of the clipboard. Not real auth — just stops a casual tap
   on a shared link from wiping the sweepstake. PIN comes from the tournament
   config (meta.adminPin); empty config means no gate. Unlock lasts the session. */
function AdminGate(props) {
  const PIN = (WCa.meta && WCa.meta.adminPin) || '';
  const [ok, setOk] = aState2(() => {
    if (!PIN) return true;
    try { return sessionStorage.getItem('wheesht_admin_ok') === '1'; } catch (e) { return false; }
  });
  const [entry, setEntry] = aState2('');
  const [bad, setBad] = aState2(false);

  if (ok) return <AdminPanel onClose={props.onClose} />;

  function submit() {
    if (entry === PIN) {
      try { sessionStorage.setItem('wheesht_admin_ok', '1'); } catch (e) {}
      setOk(true);
    } else { setBad(true); setEntry(''); }
  }

  return (
    <div className="moment" style={{ background: 'var(--bg)', alignItems: 'center', justifyContent: 'center', padding: '0 26px' }}>
      <button onClick={props.onClose} style={{ position: 'absolute', top: 16, right: 16, border: 'none', background: 'var(--ink)', color: '#fff', width: 34, height: 34, borderRadius: 10, fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>×</button>
      <div className={'rise' + (bad ? ' shake' : '')} style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
        <Wa mood={bad ? 'shocked' : 'mischievous'} size={92} animate />
        <div className="dh" style={{ fontSize: 24, marginTop: 10 }}>Organiser only.</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.45 }}>
          {bad ? 'Wrong code. Wheesht is watching. Try again.' : 'Enter the organiser code. Wheesht doesn’t hand the clipboard to just anyone.'}
        </div>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={entry}
          onChange={e => { setEntry(e.target.value); setBad(false); }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="Code"
          style={{ width: '100%', border: '2.5px solid var(--ink)', borderRadius: 14, padding: '13px 16px', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 22, textAlign: 'center', letterSpacing: '.3em', outline: 'none', marginTop: 18, background: '#fff', color: 'var(--ink)' }}
        />
        <button onClick={submit} disabled={!entry} className="wc-btn wc-btn--ink wc-btn--block" style={{ marginTop: 14, opacity: entry ? 1 : 0.4 }}>Unlock the clipboard</button>
      </div>
    </div>
  );
}

window.AdminPanel = AdminPanel;
window.AdminGate = AdminGate;
