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

function adminTeam(code) {
  return WCa.TEAMS[code] || { code: code || 'TBD', name: code || 'To be decided', flag: '🏳️' };
}

function adminStatus(f) {
  const raw = String((f && f.status) || 'upcoming').trim();
  const st = raw.toLowerCase();
  if (['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(st) >= 0) return 'done';
  if (['halftime', 'half_time', 'half-time', 'ht', 'paused'].indexOf(st) >= 0) return 'halfTime';
  if (['live', 'inplay', 'in_play', 'in-progress', 'inprogress', '1h', '2h'].indexOf(st) >= 0) return 'live';
  return 'upcoming';
}

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
   const ta = adminTeam(props.f.a), tb = adminTeam(props.f.b);
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
   const ta = adminTeam(f.a), tb = adminTeam(f.b);
   const st = adminStatus(f);
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
           : st === 'halfTime'
             ? <Cha tone="yellow">HT</Cha>
           : st === 'live'
             ? <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--red)' }}>● LIVE</span>
             : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{f.time}</span>}
       </div>
       <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
         <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink2)', flex: 1 }}>Gp {f.group} · {f.dateLabel}</span>
         {st !== 'done' && <button onClick={() => Sa.setFixtureLive(f.id, st !== 'live' && st !== 'halfTime')} className="wc-btn wc-btn--sm" style={{ padding: '5px 10px', boxShadow: '0 3px 0 var(--shadow)' }}>{st === 'upcoming' ? 'Go live' : 'Go back'}</button>}
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
   const isNumber = m.kind === 'number';
   const ans = m.answer;
   const hiddenPreds = Sa.hiddenPredictions ? Sa.hiddenPredictions() : [];
   const isHidden = hiddenPreds.indexOf(m.key) >= 0;
   function choose(oid) {
     if (isTwo) {
       let arr = Array.isArray(ans) ? ans.slice() : [];
       if (arr.indexOf(oid) >= 0) arr = arr.filter(x => x !== oid); else { arr.push(oid); if (arr.length > 2) arr.shift(); }
       Sa.setPredictionAnswer(m.key, arr.length ? arr : null);
     } else Sa.setPredictionAnswer(m.key, ans === oid ? null : oid);
   }
   const picked = (oid) => isTwo ? (Array.isArray(ans) && ans.indexOf(oid) >= 0) : ans === oid;
   function setNumberAnswer(v) {
     if (v === '') Sa.setPredictionAnswer(m.key, null);
     else Sa.setPredictionAnswer(m.key, Number(v));
   }
   return (
     <Ca flat style={{ padding: '11px 13px', marginBottom: 8, opacity: isHidden ? 0.55 : 1 }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
         <div className="dh" style={{ fontSize: 15, flex: 1 }}>{m.q}</div>
         <button onClick={() => Sa.togglePredictionHidden(m.key)} className="wc-btn wc-btn--sm"
           style={{ background: isHidden ? 'var(--ink)' : '#fff', color: isHidden ? '#fff' : 'var(--ink)', border: '2px solid var(--ink)', fontSize: 11, padding: '4px 9px', flexShrink: 0 }}>
           {isHidden ? 'Hidden' : 'Visible'}
         </button>
         <Cha tone={ans != null && (!isTwo || ans.length) ? 'green' : 'ghost'}>{ans != null && (!isTwo || ans.length) ? 'set' : 'open'}</Cha>
       </div>
       {!isHidden && isNumber && (
         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
           <input
             type="number"
             min="0"
             step="1"
             value={ans == null ? '' : ans}
             onChange={e => setNumberAnswer(e.target.value)}
             placeholder={m.placeholder || 'Set result'}
             style={{ flex: 1, border: '2px solid var(--ink)', borderRadius: 10, padding: '8px 10px', fontFamily: 'var(--body)', fontWeight: 800, fontSize: 14, outline: 'none', background: '#fff' }}
           />
           {ans != null && <button onClick={() => Sa.setPredictionAnswer(m.key, null)} className="wc-btn wc-btn--sm">Clear</button>}
         </div>
       )}
       {!isHidden && !isNumber && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
         {(m.options || []).map((opt, i) => {
           const on = picked(id(opt));
           return <button key={i} onClick={() => choose(id(opt))}
             style={{ border: '2px solid ' + (on ? 'var(--ink)' : 'var(--line)'), background: on ? 'var(--yellow)' : '#fff', borderRadius: 10, padding: '6px 10px', fontFamily: 'var(--body)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{label(opt)}</button>;
         })}
       </div>}
       {isHidden && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)' }}>Hidden from players. Tap Visible to re-enable.</div>}
     </Ca>
   );
}

function moneyAdmin(n) {
   if (window.Store && window.Store.money) return window.Store.money(n);
   const cur = (WCa.meta && WCa.meta.currency) || '£';
   return cur + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function OptionsInputAdmin(props) {
   const options = props.options || [];
   const value = options.join(', ');
   const [draft, setDraft] = aState2(value);
   React.useEffect(() => setDraft(value), [value]);
   function commit() {
      props.onChange(draft.split(',').map(x => x.trim()).filter(Boolean));
   }
   return <input value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur(); } }}
     style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 11, padding: '9px 12px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 14, outline: 'none', background: '#fff', marginTop: 8 }}
     placeholder="Options, separated by commas" />;
}

function CustomFieldsAdmin(props) {
   const fields = props.fields || [];
   function patch(i, next) {
      props.onChange(fields.map((f, idx) => idx === i ? Object.assign({}, f, next) : f));
   }
   function remove(i) {
      props.onChange(fields.filter((_, idx) => idx !== i));
   }
   function add() {
      if (fields.length >= 6) return;
      props.onChange(fields.concat([{ key: '', label: '', type: 'text', required: false, options: [] }]));
   }
   function seg(val, set, opts) {
      return <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>{opts.map(o => (
         <button key={o.value} onClick={() => set(o.value)} className="wc-btn wc-btn--sm"
           style={{ flex: 1, background: val === o.value ? 'var(--yellow)' : '#fff', boxShadow: val === o.value ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>
           {o.label}
         </button>
      ))}</div>;
   }
   const typeOpts = [{ value: 'text', label: 'Text' }, { value: 'select', label: 'Dropdown' }, { value: 'suggest', label: 'List + other' }, { value: 'tags', label: 'Tags' }];
   return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', lineHeight: 1.4 }}>Optional extra signup fields. Use Tags when people can pick several labels, or when organisers want to tag entrants later.</div>
      {fields.map((f, i) => (
         <div key={i} style={{ border: '2px solid var(--line)', borderRadius: 14, padding: 10, background: '#fff' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
               <input value={f.label || ''} onChange={e => patch(i, { label: e.target.value })}
                 style={{ flex: 1, border: '2px solid var(--ink)', borderRadius: 11, padding: '9px 12px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 14, outline: 'none', background: '#fff' }}
                 placeholder="Question label" maxLength={40} />
               <button onClick={() => remove(i)} className="wc-btn wc-btn--sm" style={{ flex: '0 0 auto', background: '#fff' }}>Remove</button>
            </div>
            {seg(f.type || 'text', v => patch(i, { type: v }), typeOpts)}
            {(f.type === 'select' || f.type === 'suggest' || f.type === 'tags') && <div>
               <OptionsInputAdmin options={f.options || []} onChange={options => patch(i, { options })} />
               <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>{f.type === 'select' ? 'Only these answers can be saved.' : f.type === 'tags' ? 'People or organisers can pick multiple tags from this list.' : 'Suggestions only; other answers are allowed.'}</div>
            </div>}
            <button onClick={() => patch(i, { required: !f.required })} style={{ marginTop: 8, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 800, color: f.required ? 'var(--green)' : 'var(--ink2)' }}>
               {f.required ? 'Required' : 'Optional'}
            </button>
         </div>
      ))}
      {fields.length < 6 && <button onClick={add} className="wc-btn wc-btn--sm wc-btn--ghost" style={{ width: '100%' }}>Add custom field</button>}
      <button onClick={() => { Sa.setCustomFields(fields); if (window.wcToast) window.wcToast('Custom fields saved.', 'confident'); }} className="wc-btn wc-btn--sm wc-btn--ink" style={{ width: '100%' }}>Save custom fields</button>
   </div>;
}

function SaveStatusPill() {
  const [st, setSt] = aState2(Sa.saveStatus ? Sa.saveStatus() : { state: 'idle' });
  React.useEffect(function () {
    if (!Sa.subscribeSaveStatus) return;
    return Sa.subscribeSaveStatus(function (s) { setSt(s); });
  }, []);
  if (!st || st.state === 'idle') return null;
  const copy = window.WheeshtCopy || {};
  const label = st.state === 'saving' ? (copy.saveSaving || 'Saving…')
    : st.state === 'saved' ? (copy.saveSaved || 'Saved')
    : st.state === 'error' ? (copy.saveError || 'Couldn\'t save — tap to retry') : '';
  return <button type="button" className={'wc-save-pill wc-save-pill--' + st.state}
    onClick={function () { if (st.state === 'error' && st.retry) st.retry(); }}
    style={{ border: 'none', fontFamily: 'inherit' }}>{label}</button>;
}

function InvitePanel() {
  const league = Sa.activeLeague ? Sa.activeLeague() : null;
  const code = league && league.code;
  const link = window.WheeshtShare && code ? window.WheeshtShare.inviteUrl(code) : '';
  const [variant, setVariant] = aState2((league && league.purpose) || 'work');
  const msg = window.WheeshtShare && window.WheeshtShare.buildInviteMessage(league, variant);
  const qrSrc = link && window.WheeshtShare ? window.WheeshtShare.qrImageUrl(link, 200) : '';
  const copy = window.WheeshtCopy || {};
  const templates = copy.inviteTemplates || {};
  function copyLink() {
    if (!link || !window.WheeshtShare) return;
    window.WheeshtShare.copyText(link).then(function () {
      if (window.wcToast) window.wcToast('Invite link copied.', 'confident');
    });
  }
  function copyWa() {
    if (!msg || !window.WheeshtShare) return;
    window.WheeshtShare.copyText(msg).then(function () {
      if (window.wcToast) window.wcToast('WhatsApp message copied.', 'confident');
    });
  }
  function shareWa() {
    if (!msg || !window.WheeshtShare) return;
    window.open(window.WheeshtShare.whatsappUrl(msg), '_blank', 'noopener');
  }
  function preview() {
    if (!link) return;
    window.open(link, '_blank', 'noopener');
  }
  function downloadPoster() {
    if (!window.WheeshtShare || !league) return;
    window.WheeshtShare.shareInvitePoster(league);
  }
  if (!code) return null;
  return (
    <Ca flat style={{ marginBottom: 12 }}>
      <div className="dh" style={{ fontSize: 17, marginBottom: 6 }}>Share kit</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', lineHeight: 1.4, marginBottom: 8 }}>Share this link — previews show your league name in WhatsApp and iMessage.</div>
      <div style={{ wordBreak: 'break-all', fontSize: 12, fontWeight: 700, background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 11, padding: '10px 12px', marginBottom: 10 }}>{link}</div>
      {qrSrc && <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <img src={qrSrc} alt="QR code for invite link" width={160} height={160} style={{ border: '2.5px solid var(--ink)', borderRadius: 12, background: '#fff' }} />
      </div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.keys(templates).map(function (key) {
          return <button key={key} type="button" onClick={function () { setVariant(key); }}
            className={'wc-btn wc-btn--sm' + (variant === key ? ' wc-btn--ink' : ' wc-btn--ghost')}>{key}</button>;
        })}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', lineHeight: 1.45, background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 11, padding: '10px 12px', marginBottom: 10, whiteSpace: 'pre-wrap' }}>{msg}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={copyLink} className="wc-btn wc-btn--sm wc-btn--ink">Copy link</button>
        <button onClick={copyWa} className="wc-btn wc-btn--sm">Copy WhatsApp message</button>
        <button onClick={shareWa} className="wc-btn wc-btn--sm">WhatsApp</button>
        <button onClick={downloadPoster} className="wc-btn wc-btn--sm">Download poster</button>
        <button onClick={preview} className="wc-btn wc-btn--sm wc-btn--ghost">Preview link</button>
      </div>
    </Ca>
  );
}

function AnalyticsPanel() {
  const [data, setData] = aState2(null);
  React.useEffect(function () {
    if (!Sa.fetchAnalytics) return;
    var live = true;
    Sa.fetchAnalytics().then(function (d) { if (live) setData(d); });
    return function () { live = false; };
  }, []);
  if (!data) return <Ca flat style={{ padding: 16, fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>Loading analytics…</Ca>;
  const e = data.entrants || {};
  const ch = data.chat || {};
  return (
    <>
      <SHa>Analytics</SHa>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[['Entrants', String(e.total || 0)], ['With password', String(e.withPassword || 0)], ['Team drawn', String(e.withTeam || 0)], ['Chat (7d)', String(ch.last7d || 0)]].map(function (row) {
          return <div key={row[0]} style={{ background: '#fff', border: '2px solid var(--line)', borderRadius: 12, padding: '9px 10px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink2)' }}>{row[0]}</div>
            <div className="dh" style={{ fontSize: 18, marginTop: 2 }}>{row[1]}</div>
          </div>;
        })}
      </div>
      {(data.predictions || []).length > 0 && <>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink2)', marginBottom: 6 }}>Prediction completion</div>
        {(data.predictions || []).slice(0, 6).map(function (m) {
          return <div key={m.key} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              <span style={{ flex: 1, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
              <span>{m.completionPct}%</span>
            </div>
            <div style={{ height: 8, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: (m.completionPct || 0) + '%', background: 'var(--green)', borderRadius: 999 }} />
            </div>
          </div>;
        })}
      </>}
    </>
  );
}

function DuplicateLeaguePanel() {
  const src = Sa.activeLeague ? Sa.activeLeague() : null;
  const [name, setName] = aState2((src && src.name ? src.name : '') + ' copy');
  const [code, setCode] = aState2('');
  const [pw, setPw] = aState2('');
  const [org, setOrg] = aState2('');
  const [busy, setBusy] = aState2(false);
  const [err, setErr] = aState2('');
  if (!src || src.seeded) return null;
  function go() {
    if (busy || !Sa.duplicateLeague) return;
    setBusy(true); setErr('');
      Sa.duplicateLeague({ name: name.trim(), code: code.trim(), password: pw, organiserCode: org.trim() || undefined })
      .then(function (j) {
        setBusy(false);
        if (j && j.league && j.adminToken) {
          Sa.setAdminToken(j.league.code, j.adminToken);
          if (Sa.devEnterLeague) Sa.devEnterLeague(Object.assign({}, j.league, { adminToken: j.adminToken }));
          if (window.wcToast) window.wcToast('League created: ' + j.league.code, 'confident');
        }
      })
      .catch(function (e) { setBusy(false); setErr((e && e.message) || 'Could not duplicate'); });
  }
  const inp = { width: '100%', border: '2px solid var(--ink)', borderRadius: 11, padding: '9px 12px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 14, outline: 'none', marginTop: 6, background: '#fff' };
  return (
    <Ca flat style={{ marginTop: 12 }}>
      <div className="dh" style={{ fontSize: 17, marginBottom: 6 }}>Start another league like this</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>Copies fee, fields and prediction setup — fresh empty league, new code.</div>
      <Lab>New league name</Lab>
      <input style={inp} value={name} onChange={function (e) { setName(e.target.value); }} maxLength={60} />
      <div style={{ marginTop: 10 }}><Lab>New league code</Lab>
        <input style={Object.assign({}, inp, { textTransform: 'uppercase', letterSpacing: '.1em' })} value={code} onChange={function (e) { setCode(e.target.value); }} maxLength={12} placeholder="e.g. OFFICE27" /></div>
      <div style={{ marginTop: 10 }}><Lab>Member password</Lab>
        <input type="password" style={inp} value={pw} onChange={function (e) { setPw(e.target.value); }} /></div>
      <div style={{ marginTop: 10 }}><Lab>Organiser code <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>· optional</span></Lab>
        <input type="password" style={inp} value={org} onChange={function (e) { setOrg(e.target.value); }} placeholder="Defaults to member password" /></div>
      <button onClick={go} disabled={busy || code.trim().length < 2 || pw.length < 4} className="wc-btn wc-btn--ink wc-btn--block" style={{ marginTop: 14, opacity: busy ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Create duplicate league'}</button>
      {err && <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 800, marginTop: 8 }}>{err}</div>}
    </Ca>
  );
}

function Lab(p) { return <label style={{ fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)', letterSpacing: '.02em' }}>{p.children}{p.children && p.opt}</label>; }

function PrizeFundAdmin() {
   const [, bump] = aState2(0);
   React.useEffect(() => Sa.subscribe(() => bump(x => x + 1)), []);
   const feeNow = Sa.entryFee ? Sa.entryFee() : WCa.FEE;
   const currencyNow = Sa.currency ? Sa.currency() : '£';
   const [fee, setFee] = aState2(String(feeNow || 0));
   React.useEffect(() => setFee(String(feeNow || 0)), [feeNow]);
   const [currency, setCurrency] = aState2(currencyNow);
   React.useEffect(() => setCurrency(currencyNow), [currencyNow]);
   const locationsNow = Sa.locations ? Sa.locations() : ['Edinburgh', 'London'];
   const [locInput, setLocInput] = aState2(locationsNow.join(', '));
   React.useEffect(() => setLocInput(locationsNow.join(', ')), [locationsNow.join(',')]);
   const entrants = Sa.allSync().length;
   const split = Sa.charitySplit ? Sa.charitySplit() : 0.5;
   const purpose = Sa.purpose ? Sa.purpose() : 'work';
   const locationsFreeText = Sa.locationsFreeText ? Sa.locationsFreeText() : false;
   const predDeadlineNow = Sa.predDeadline ? Sa.predDeadline() : null;
   const [predDeadlineInput, setPredDeadlineInput] = aState2(predDeadlineNow ? predDeadlineNow.slice(0, 16) : '');
   React.useEffect(() => setPredDeadlineInput(predDeadlineNow ? predDeadlineNow.slice(0, 16) : ''), [predDeadlineNow]);
   function saveDeadline() {
     const val = predDeadlineInput.trim();
     if (val) {
       const dt = new Date(val);
       if (isNaN(dt.getTime())) return;
       Sa.setPredDeadline(dt.toISOString());
       if (window.wcToast) window.wcToast('Prediction deadline set.', 'confident');
     } else {
       Sa.setPredDeadline(null);
       if (window.wcToast) window.wcToast('Deadline cleared.', 'neutral');
     }
   }
   const n = Number(fee);
   const feeNum = isFinite(n) && n >= 0 ? n : feeNow;
   const gross = entrants * feeNum;
   const charity = gross * split;
   const winner = gross * (1 - split);
   const fld = { width: '100%', border: '2.5px solid var(--ink)', borderRadius: 12, padding: '11px 13px', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 22, outline: 'none', background: '#fff' };
   function saveFee() {
     const val = Number(fee);
     if (!isFinite(val) || val < 0) { setFee(String(feeNow || 0)); return; }
     if (Sa.setCurrency) Sa.setCurrency(currency || '£');
     Sa.setEntryFee(val);
     if (window.wcToast) window.wcToast('Entry fee set to ' + ((Sa.money && Sa.money(val)) || moneyAdmin(val)), 'confident');
   }
   function saveLocations() {
     const arr = locInput.split(',').map(s => s.trim()).filter(Boolean);
     if (!arr.length) return;
     Sa.setLocations(arr);
     if (window.wcToast) window.wcToast(arr.length + ' location' + (arr.length > 1 ? 's' : '') + ' saved.', 'confident');
   }
   function toggleRow(onClick, on, title, text) {
     return <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', border: '2px solid var(--line)', borderRadius: 13, background: '#fff', padding: '11px 12px', cursor: 'pointer', marginBottom: 8 }}>
       <span style={{ width: 42, height: 24, borderRadius: 999, background: on ? 'var(--green)' : 'var(--line)', border: '2px solid var(--ink)', position: 'relative', flex: '0 0 auto' }}>
         <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', border: '2px solid var(--ink)' }} />
       </span>
       <span style={{ flex: 1, minWidth: 0 }}>
         <span className="dh" style={{ display: 'block', fontSize: 15 }}>{title}</span>
         <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginTop: 2, lineHeight: 1.3 }}>{text}</span>
       </span>
     </button>;
   }
   const splitPct = Math.round(split * 100);
   return (
     <>
       <Ca bordered style={{ background: 'var(--yellow)', marginBottom: 12 }}>
         <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Entry fee</div>
         <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 7 }}>
           <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...fld, flex: '0 0 78px', fontSize: 20, paddingLeft: 9, paddingRight: 8 }}>
             {['£', '€', '$'].map(c => <option key={c} value={c}>{c}</option>)}
           </select>
           <input type="number" min="0" step="0.5" value={fee} onChange={e => setFee(e.target.value)} style={fld} />
           <button onClick={saveFee} className="wc-btn wc-btn--sm wc-btn--ink" style={{ flex: '0 0 auto' }}>Save</button>
         </div>
         <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', marginTop: 9 }}>{entrants} entrants at {moneyAdmin(feeNum)} each.</div>
       </Ca>

       <Ca flat style={{ padding: '12px 13px', marginBottom: 12 }}>
         {[
           ['Total collected', gross, 'var(--ink)'],
           ['Winner fund', winner, 'var(--green)'],
           ['Charity fund', charity, 'var(--red)'],
         ].map((r, i) => (
           <div key={r[0]} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: i ? '8px 0 0' : '0', borderTop: i ? '1.5px solid var(--line)' : 'none', marginTop: i ? 8 : 0 }}>
             <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: 'var(--ink2)' }}>{r[0]}</span>
             <span className="dh" style={{ fontSize: 19, color: r[2] }}>{moneyAdmin(r[1])}</span>
           </div>
         ))}
       </Ca>

       <SHa>Charity split</SHa>
       <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
         {[0, 25, 50, 75, 100].map(pct => (
           <button key={pct} onClick={() => Sa.setCharitySplit(pct / 100)} className="wc-btn wc-btn--sm"
             style={{ flex: 1, background: splitPct === pct ? 'var(--yellow)' : '#fff', boxShadow: splitPct === pct ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>
             {pct}%
           </button>
         ))}
       </div>
       <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 16, lineHeight: 1.4 }}>
         {split < 0.01 ? 'No charity split — everything goes to the winner.' : split > 0.99 ? 'All entry fees go to charity. No winner fund.' : splitPct + '% of each entry goes to charity, the rest to the winner.'}
       </div>

       <SHa>Sweepstake type</SHa>
       <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
         {[['work', 'Work'], ['friends', 'Friends & family']].map(([k, lab]) => (
           <button key={k} onClick={() => Sa.setPurpose(k)} className="wc-btn wc-btn--sm"
             style={{ flex: 1, background: purpose === k ? 'var(--yellow)' : '#fff', boxShadow: purpose === k ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>
             {lab}
           </button>
         ))}
       </div>
       <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 16, lineHeight: 1.4 }}>
         {purpose === 'work' ? 'Shows department, location and LT fields. You can toggle them individually below.' : 'Just names — no work details collected. Individual toggles below still apply.'}
       </div>

       <SHa>Locations</SHa>
       <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8, lineHeight: 1.4 }}>List your offices or locations, separated by commas. People pick from these when signing up.</div>
       <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8 }}>
         <input value={locInput} onChange={e => setLocInput(e.target.value)}
           onKeyDown={e => e.key === 'Enter' && saveLocations()}
           style={{ flex: 1, border: '2px solid var(--ink)', borderRadius: 11, padding: '9px 12px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 14, outline: 'none', background: '#fff' }}
           placeholder="e.g. Edinburgh, London, Remote" />
         <button onClick={saveLocations} className="wc-btn wc-btn--sm wc-btn--ink">Save</button>
       </div>
       {toggleRow(
         () => Sa.setLocationsFreeText(!locationsFreeText),
         locationsFreeText,
         'Allow custom location',
         locationsFreeText ? 'People can type their own location (your list shows as suggestions).' : 'People must pick from your list above.'
       )}

       <SHa>Predictions deadline</SHa>
       <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8, lineHeight: 1.4 }}>Set a cut-off date and time. Predictions lock automatically once it passes.</div>
       <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 6 }}>
         <input
           type="datetime-local"
           value={predDeadlineInput}
           onChange={e => setPredDeadlineInput(e.target.value)}
           style={{ flex: 1, border: '2px solid var(--ink)', borderRadius: 11, padding: '9px 12px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 14, outline: 'none', background: '#fff' }}
         />
         <button onClick={saveDeadline} className="wc-btn wc-btn--sm wc-btn--ink">Set</button>
         {predDeadlineNow && <button onClick={() => { setPredDeadlineInput(''); Sa.setPredDeadline(null); if (window.wcToast) window.wcToast('Deadline cleared.', 'neutral'); }} className="wc-btn wc-btn--sm">Clear</button>}
       </div>
       {predDeadlineNow && (() => {
         const past = new Date() > new Date(predDeadlineNow);
         return <div style={{ fontSize: 12, fontWeight: 700, color: past ? 'var(--red)' : 'var(--ink2)', marginBottom: 16 }}>
           {past ? 'Locked — deadline has passed.' : 'Locks at ' + new Date(predDeadlineNow).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '.'}
         </div>;
       })()}
       {!predDeadlineNow && <div style={{ height: 16 }} />}
     </>
   );
}

function FieldsAdmin() {
   const [, bump] = aState2(0);
   React.useEffect(() => Sa.subscribe(() => bump(x => x + 1)), []);
   const includeDept = Sa.includeDepartment ? Sa.includeDepartment() : true;
   const includeLocation = Sa.includeLocation ? Sa.includeLocation() : true;
   const includeLtMember = Sa.includeLtMember ? Sa.includeLtMember() : true;
   const customFieldsNow = Sa.customFields ? Sa.customFields() : [];
   const [customFields, setCustomFields] = aState2(customFieldsNow);
   React.useEffect(() => setCustomFields(customFieldsNow), [JSON.stringify(customFieldsNow)]);
   function toggleRow(onClick, on, title, text) {
     return <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', border: '2px solid var(--line)', borderRadius: 13, background: '#fff', padding: '11px 12px', cursor: 'pointer', marginBottom: 8 }}>
       <span style={{ width: 42, height: 24, borderRadius: 999, background: on ? 'var(--green)' : 'var(--line)', border: '2px solid var(--ink)', position: 'relative', flex: '0 0 auto' }}>
         <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', border: '2px solid var(--ink)' }} />
       </span>
       <span style={{ flex: 1, minWidth: 0 }}>
         <span className="dh" style={{ display: 'block', fontSize: 15 }}>{title}</span>
         <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginTop: 2, lineHeight: 1.3 }}>{text}</span>
       </span>
     </button>;
   }
   return (
     <>
       <SHa>Signup fields</SHa>
       {toggleRow(
         () => Sa.setIncludeDepartment(!includeDept),
         includeDept,
         'Team / department',
         includeDept ? 'Shown on signup, editing and directory.' : 'Hidden from signup, editing and directory.'
       )}
       {toggleRow(
         () => Sa.setIncludeLocation(!includeLocation),
         includeLocation,
         'Location',
         includeLocation ? 'Shown on signup and profile editing.' : 'Hidden — not collected.'
       )}
       {toggleRow(
         () => Sa.setIncludeLtMember(!includeLtMember),
         includeLtMember,
         'Leadership Team member',
         includeLtMember ? 'Shown on signup and profile editing.' : 'Hidden — not collected.'
       )}

       <SHa>Custom fields</SHa>
       <CustomFieldsAdmin fields={customFields} onChange={setCustomFields} />
     </>
   );
}

function downloadCsv(kind) {
  if (!Sa.exportCsv) return;
  Sa.exportCsv(kind).then(function (text) {
    var blob = new Blob([text], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var code = (Sa.leagueCode && Sa.leagueCode()) || 'league';
    a.href = url;
    a.download = 'wheesht-' + code.toLowerCase() + '-' + kind + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (window.wcToast) window.wcToast('CSV downloaded.', 'confident');
  }).catch(function (e) {
    if (window.wcToast) window.wcToast((e && e.message) || 'Export failed', 'crying');
  });
}

function MatchPredAdmin() {
  const upcoming = (WCa.FIXTURES || []).filter(function(f) { return ['live', 'halfTime', 'done'].indexOf(adminStatus(f)) < 0; });
  const [fixId, setFixId] = React.useState(upcoming.length ? upcoming[0].id : '');
  const [mtype, setMtype] = React.useState('winner');
  const [pts, setPts] = React.useState(5);
  const [busy, setBusy] = React.useState(false);
  const [dmList, setDmList] = React.useState(null); // null = not loaded yet
  const leagueCode = Sa.leagueCode ? Sa.leagueCode() : '';

  function load() {
    // Read current dynamic markets from the predictions array (they start with "dm_")
    const all = WCa.PREDICTIONS || [];
    setDmList(all.filter(function(m) { return m.key && m.key.startsWith('dm_'); }));
  }

  React.useEffect(load, []);

  function create() {
    if (!fixId || busy) return;
    setBusy(true);
    fetch(Sa.api('/predictions/match'), {
      method: 'POST',
      headers: Sa.adminHeaders(),
      body: JSON.stringify({ fixture_id: fixId, type: mtype, points: pts, notify_chat: true }),
    }).then(function(r) { return r.json().then(function(j) { if (!r.ok) throw new Error(j.detail || 'Failed'); return j; }); })
      .then(function() {
        setBusy(false);
        Sa.refresh && Sa.refresh().then(load);
        window.wcToast && window.wcToast('Match prediction created! Chat has been notified.', 'mischievous');
      }).catch(function(e) { setBusy(false); window.wcToast && window.wcToast((e && e.message) || 'Failed', 'crying'); });
  }

  function remove(id) {
    fetch(Sa.api('/predictions/match/' + encodeURIComponent(id)), {
      method: 'DELETE', headers: Sa.adminHeaders(),
    }).then(function() {
      Sa.refresh && Sa.refresh().then(load);
      window.wcToast && window.wcToast('Market removed.', 'neutral');
    }).catch(function() { window.wcToast && window.wcToast('Failed to remove.', 'crying'); });
  }

  function fixLabel(f) {
    const ta = WCa.TEAMS[f.a] || {}, tb = WCa.TEAMS[f.b] || {};
    return (ta.flag || '') + ' ' + (ta.name || f.a) + ' vs ' + (tb.flag || '') + ' ' + (tb.name || f.b) + ' · ' + (f.dateLabel || '') + ' ' + (f.time || '');
  }

  const segs = { background: '#fff', border: '2px solid var(--ink)', borderRadius: 12, display: 'flex', overflow: 'hidden', marginBottom: 10 };
  const seg = function(active) { return { flex: 1, border: 'none', padding: '8px 0', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 13, cursor: 'pointer', background: active ? 'var(--ink)' : '#fff', color: active ? '#fff' : 'var(--ink)' }; };

  return (
    <div style={{ marginTop: 22, paddingTop: 16, borderTop: '2px dashed var(--line)' }}>
      <div className="dh" style={{ fontSize: 15, marginBottom: 6 }}>Match predictions</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>Create a one-off prediction tied to an upcoming game. Auto-grades when you log the result.</div>
      {upcoming.length === 0
        ? <div style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 600, padding: '10px 0' }}>No upcoming fixtures to predict on.</div>
        : <>
          <select
            value={fixId}
            onChange={function(e) { setFixId(e.target.value); }}
            style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 11, padding: '9px 11px', fontFamily: 'var(--body)', fontWeight: 700, fontSize: 13, outline: 'none', marginBottom: 10, background: '#fff' }}
          >
            {upcoming.map(function(f) { return <option key={f.id} value={f.id}>{fixLabel(f)}</option>; })}
          </select>
          <div style={segs}>
            <button style={seg(mtype==='winner')} onClick={function(){ setMtype('winner'); }}>Who wins?</button>
            <button style={seg(mtype==='scoreline')} onClick={function(){ setMtype('scoreline'); }}>Exact score</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', flexShrink: 0 }}>Points:</span>
            {[2, 3, 5, 10, 15].map(function(n) {
              return <button key={n} onClick={function(){ setPts(n); }} style={{ border: '2px solid var(--ink)', borderRadius: 8, padding: '5px 10px', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 13, cursor: 'pointer', background: pts===n?'var(--yellow)':'#fff' }}>{n}</button>;
            })}
          </div>
          <button onClick={create} disabled={busy || !fixId} className="wc-btn wc-btn--ink wc-btn--block wc-btn--sm" style={{ marginBottom: 6 }}>
            {busy ? 'Creating…' : 'Create & notify chat'}
          </button>
        </>}
      {dmList && dmList.length > 0 && <>
        <div className="dh" style={{ fontSize: 13, margin: '14px 0 7px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Active match predictions</div>
        {dmList.map(function(m) {
          return (
            <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1.5px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.q}</div>
                <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 600 }}>{m.points} pts · {m.answer != null ? '✓ Graded: ' + m.answer : 'Open'}</div>
              </div>
              <button onClick={function(){ remove(m.key); }} style={{ border: '2px solid var(--red)', borderRadius: 8, padding: '4px 9px', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 12, cursor: 'pointer', background: '#fff', color: 'var(--red)', flexShrink: 0 }}>Remove</button>
            </div>
          );
        })}
      </>}
    </div>
  );
}

function AdminBackupCard() {
   const league = WCa.league || {};
   const [busy, setBusy] = aState2(false);
   function download() {
     if (busy || !Sa.exportLeague) return;
     setBusy(true);
     Promise.resolve(Sa.exportLeague()).then(function(data) {
       const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       const stamp = new Date().toISOString().slice(0, 10);
       a.href = url;
       a.download = 'wheesht-' + String(league.code || 'league').toLowerCase() + '-' + stamp + '.json';
       document.body.appendChild(a); a.click(); document.body.removeChild(a);
       URL.revokeObjectURL(url);
       setBusy(false);
       if (window.wcToast) window.wcToast('Backup downloaded.', 'confident');
     }).catch(function(e) {
       setBusy(false);
       if (window.wcToast) window.wcToast((e && e.message) || 'Export failed', 'crying');
     });
   }
   return (
     <Ca flat style={{ marginBottom: 12 }}>
       <div className="dh" style={{ fontSize: 17, marginBottom: 6 }}>Backups</div>
       <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ink2)', lineHeight: 1.4, marginBottom: 8 }}>
         Download a full snapshot — entries, picks, predictions, chat and results — before any risky change. No passwords are included.
       </div>
       <button onClick={download} disabled={busy} className="wc-btn wc-btn--sm wc-btn--ink" style={{ width: '100%' }}>{busy ? 'Preparing…' : 'Download backup (JSON)'}</button>
     </Ca>
   );
}

function AdminDangerZone() {
   const league = WCa.league || {};
   const [open, setOpen] = aState2(false);
   const [code, setCode] = aState2('');
   const [name, setName] = aState2('');
   const [busy, setBusy] = aState2(false);
   const [err, setErr] = aState2('');
   // The seeded flagship league is never deletable from the organiser tools.
   if (!league.code || league.seeded) return null;
   const ready = code.trim().toUpperCase() === String(league.code).toUpperCase()
     && name.trim() === String(league.name || '');
   const inputStyle = { width: '100%', border: '2px solid var(--ink)', borderRadius: 10, padding: '9px 11px', fontFamily: 'var(--body)', fontWeight: 800, fontSize: 14, outline: 'none', background: '#fff', marginTop: 7 };
   function go() {
     if (!ready || busy) return;
     setBusy(true); setErr('');
     Promise.resolve(Sa.deleteLeague(code.trim(), name.trim())).then(function() {
       if (window.wcToast) window.wcToast('League deleted.', 'neutral');
       // The active league is cleared in the store; reload boots back to the gate.
       setTimeout(function() { window.location.reload(); }, 400);
     }).catch(function(e) {
       setBusy(false);
       setErr((e && e.message) || 'Could not delete league');
     });
   }
   return (
     <Ca bordered style={{ borderColor: 'var(--red)', marginTop: 12 }}>
       <div className="dh" style={{ fontSize: 17, marginBottom: 6, color: 'var(--red)' }}>Danger zone</div>
       <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ink2)', lineHeight: 1.4 }}>
         Permanently delete <strong>{league.name}</strong> — every entry, pick, prediction, chat message and result. This cannot be undone.
       </div>
       {!open
         ? <button onClick={function() { setOpen(true); }} style={{ marginTop: 10, width: '100%', border: '2px solid var(--red)', borderRadius: 11, background: '#fff', color: 'var(--red)', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 13.5, padding: '10px', cursor: 'pointer' }}>Delete this league…</button>
         : <div style={{ marginTop: 8 }}>
             <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink2)' }}>Type the league code (<strong>{league.code}</strong>) to confirm</div>
             <input value={code} onChange={function(e) { setCode(e.target.value); }} placeholder={league.code} style={inputStyle} />
             <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink2)', marginTop: 9 }}>Type the league name exactly to confirm</div>
             <input value={name} onChange={function(e) { setName(e.target.value); }} placeholder={league.name} style={inputStyle} />
             <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
               <button onClick={function() { setOpen(false); setCode(''); setName(''); setErr(''); }} style={{ flex: 1, border: '2px solid var(--ink)', borderRadius: 11, background: '#fff', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 13, padding: '10px', cursor: 'pointer' }}>Cancel</button>
               <button onClick={go} disabled={!ready || busy} style={{ flex: 1, border: 'none', borderRadius: 11, background: ready && !busy ? 'var(--red)' : 'var(--line)', color: '#fff', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 13, padding: '10px', cursor: ready && !busy ? 'pointer' : 'not-allowed' }}>{busy ? 'Deleting…' : 'Delete forever'}</button>
             </div>
           </div>}
       {err && <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 800, marginTop: 8 }}>{err}</div>}
     </Ca>
   );
}

function AdminHealth() {
   const health = Sa.fixtureHealth ? Sa.fixtureHealth() : {};
   const lastRefresh = Sa.lastRefreshAt ? Sa.lastRefreshAt() : 0;
   const [audit, setAudit] = aState2(Sa.adminAudit ? Sa.adminAudit() : []);
   React.useEffect(function() {
     if (!Sa.fetchAudit) return;
     var live = true;
     Promise.resolve(Sa.fetchAudit()).then(function(events) {
       if (live && Array.isArray(events)) setAudit(events);
     });
     return function() { live = false; };
   }, []);
   const fixtures = WCa.FIXTURES || [];
   const total = fixtures.length;
   const live = Number(health.liveFixtures || 0);
   const finished = Number(health.finishedFixtures || 0);
   const needs = Number(health.needsResult || 0);
   function age(ts) {
     if (!ts) return 'Not yet';
     const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
     if (!isFinite(t)) return 'Unknown';
     const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
     if (mins < 1) return 'Just now';
     if (mins < 60) return mins + 'm ago';
     const hrs = Math.floor(mins / 60);
     return hrs + 'h ' + (mins % 60) + 'm ago';
   }
   function auditLabel(a) {
     const map = {
       league_created: 'League created',
       admin_save: 'Settings/results saved',
       prediction_opened: 'Prediction opened',
       prediction_removed: 'Prediction removed',
       wheesht_message: 'Wheesht message sent',
       chat_deleted: 'Chat message deleted',
       participant_removed: 'Entrant removed',
       password_reset: 'Password reset by organiser',
       password_cleared: 'Password cleared by organiser',
       admin_auth: 'Organiser signed in',
       admin_auth_failed: 'Failed organiser sign-in',
       participant_edited: 'Entrant edited',
       league_duplicated: 'League duplicated',
       league_deleted: 'League deleted',
     };
     return map[a.action] || a.action || 'Change';
   }
   return (
     <>
       <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>
         Check the data feed, result gaps and organiser security before matchdays get busy.
       </div>
       <Ca bordered style={{ background: needs ? 'rgba(245,200,0,.18)' : 'rgba(26,122,68,.08)', marginBottom: 12 }}>
         <div className="dh" style={{ fontSize: 18, marginBottom: 8 }}>Data health</div>
         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
           {[
             ['Last app sync', age(lastRefresh)],
             ['Fixture feed', health.updatedAt ? age(health.updatedAt) : 'Static fallback'],
             ['Live / HT', String(live)],
             ['Need result', String(needs)],
             ['Finished', finished + '/' + total],
             ['Upcoming', String(Math.max(0, total - finished - live))],
           ].map(function(row) {
             return <div key={row[0]} style={{ background: '#fff', border: '2px solid var(--line)', borderRadius: 12, padding: '9px 10px' }}>
               <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink2)' }}>{row[0]}</div>
               <div className="dh" style={{ fontSize: 16, lineHeight: 1.1, marginTop: 2 }}>{row[1]}</div>
             </div>;
           })}
         </div>
         {needs > 0 && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: 'var(--red)', lineHeight: 1.35 }}>
           {needs} fixture{needs === 1 ? '' : 's'} look past the match window without a final score. Check Results and enter/verify them.
         </div>}
       </Ca>
       <Ca flat style={{ marginBottom: 12 }}>
         <div className="dh" style={{ fontSize: 17, marginBottom: 7 }}>Security checklist</div>
         {[
           'Member password and private organiser code are separate.',
           'Organiser codes are verified on the server and never shown back in the app.',
           'Admin writes require a short-lived organiser token.',
           'Send as Wheesht only appears after organiser sign-in.',
           'Sensitive code/password attempts are rate-limited server-side.',
         ].map(function(txt) {
           return <div key={txt} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', lineHeight: 1.32 }}>
            <span style={{ color: 'var(--green)', fontWeight: 900 }}>✓</span><span>{txt}</span>
          </div>;
        })}
      </Ca>
      <AdminBackupCard />
      <SHa>Recent organiser activity</SHa>
       {audit.length
         ? <Ca flat style={{ padding: '2px 13px' }}>
             {audit.slice(0, 12).map(function(a, i) {
               return <div key={i} style={{ padding: '10px 0', borderBottom: i < Math.min(audit.length, 12) - 1 ? '1.5px solid var(--line)' : 'none' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                   <div className="dh" style={{ fontSize: 14 }}>{auditLabel(a)}</div>
                   <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{age(a.ts)}</div>
                 </div>
                 {a.detail && <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--ink2)', marginTop: 2, lineHeight: 1.35 }}>{a.detail}</div>}
               </div>;
             })}
           </Ca>
         : <Ca flat style={{ textAlign: 'center', padding: '22px 14px' }}>
             <Wa mood="neutral" size={52} animate />
             <div className="dh" style={{ fontSize: 15, marginTop: 5 }}>No organiser activity logged yet.</div>
             <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>New saves, match predictions and moderation actions will appear here.</div>
           </Ca>}
       <AdminDangerZone />
     </>
   );
}

function AdminPanel(props) {
   const [, bump] = aState2(0);
   React.useEffect(() => Sa.subscribe(() => bump(x => x + 1)), []);
   const [sec, setSec] = aState2('league');
   const [mdFilter, setMdFilter] = aState2(0);
   const owned = {};
   const allPeople = Sa.allSync() || [];
   allPeople.forEach(p => { owned[p.team] = (owned[p.team] || 0) + 1; });

   const groups = 'ABCDEFGHIJKL'.split('');
   const fixtures = (WCa.FIXTURES || []).filter(f => mdFilter === 0 || f.matchday === mdFilter);
   const byDate = []; const seen = {};
   fixtures.forEach(f => { if (!seen[f.dateISO]) { seen[f.dateISO] = { label: f.dateLabel, items: [] }; byDate.push(seen[f.dateISO]); } seen[f.dateISO].items.push(f); });

   const secs = [['league', 'League'], ['players', 'Players'], ['predict', 'Predictions'], ['prize', 'Prize Fund'], ['fields', 'Fields'], ['security', 'Security']];

   return (
     <div className="moment" style={{ background: 'var(--bg)' }}>
       <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--ink)', color: '#fff', padding: '16px 18px 12px', display: 'flex', alignItems: 'center', gap: 11 }}>
         <Wa mood="confident" size={44} />
         <div style={{ flex: 1 }}>
           <div className="dh" style={{ fontSize: 20, color: '#fff', lineHeight: 1 }}>Wheesht's clipboard</div>
           <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--yellow)' }}>{(Sa.activeLeague && Sa.activeLeague()) ? Sa.activeLeague().name : 'Admin'} · {allPeople.length} entrants</div>
         </div>
         <SaveStatusPill />
         <button onClick={props.onClose} style={{ border: 'none', background: 'rgba(255,255,255,.16)', color: '#fff', width: 34, height: 34, borderRadius: 10, fontSize: 18, fontWeight: 900, cursor: 'pointer', padding: 0 }}>✕</button>
       </div>

       <div className="mscroll" style={{ padding: '16px 18px 30px' }}>
         <div style={{ display: 'flex', gap: 7, margin: '0 0 14px', flexWrap: 'wrap' }}>
           {secs.map(([k, lab]) => (
             <button key={k} onClick={() => setSec(k)} className={'wc-chip' + (sec === k ? ' wc-chip--yellow' : '')} style={{ flex: '1 0 30%', cursor: 'pointer', textAlign: 'center', justifyContent: 'center' }}>{lab}</button>
           ))}
         </div>

         {sec === 'league' && <>
           <SHa>Tournament phase</SHa>
           <PhaseSeg />
           <div style={{ height: 14 }} />
           <InvitePanel />
           <AnalyticsPanel />
           <DuplicateLeaguePanel />
           <SHa>Match results</SHa>
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
           <div style={{ marginTop: 18 }}><SHa>Teams in the draw</SHa></div>
           <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8 }}>Knock a team out and everyone holding it flips to eliminated automatically.</div>
           {groups.map(g => {
             const ts = WCa.TEAM_LIST.filter(t => t.group === g);
             if (!ts.length) return null;
             return <Ca key={g} flat style={{ padding: '8px 14px', marginBottom: 9 }}>
               <div className="dh" style={{ fontSize: 14, marginBottom: 2 }}>Group {g}</div>
               {ts.map(t => <TeamToggle key={t.code} t={t} owners={owned[t.code] || 0} />)}
             </Ca>;
           })}
           <div style={{ marginTop: 18 }}><SHa>Chat moderation</SHa></div>
           <ChatAdmin />
         </>}

         {sec === 'players' && <>
           <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
             <button onClick={() => downloadCsv('entrants')} className="wc-btn wc-btn--sm wc-btn--ink" style={{ flex: 1 }}>Download entrants CSV</button>
           </div>
           <PeopleAdmin />
         </>}

         {sec === 'predict' && <>
           <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
             <button onClick={() => downloadCsv('predictions')} className="wc-btn wc-btn--sm wc-btn--ink" style={{ flex: 1 }}>Download predictions CSV</button>
           </div>
           <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>Set the answer once it's known — every entrant's score and the league re-grade instantly.</div>
           {(WCa.predictions || Sa.PREDICTIONS).map(m => <PredAdmin key={m.key} m={m} />)}
           <MatchPredAdmin />
         </>}

         {sec === 'prize' && <PrizeFundAdmin />}

         {sec === 'fields' && <FieldsAdmin />}

         {sec === 'security' && <AdminHealth />}

         <div style={{ marginTop: 22, borderTop: '2px solid var(--line)', paddingTop: 16 }}>
           <button onClick={() => { if (window.confirm('Reset ALL results, eliminations and answers back to pre-kickoff?')) Sa.adminReset(); }}
             style={{ width: '100%', border: '2px solid var(--red)', borderRadius: 11, background: '#fff', color: 'var(--red)', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 13, padding: '10px', cursor: 'pointer' }}>Reset everything</button>
         </div>
       </div>
     </div>
   );
}

function PeopleAdmin() {
   const [q, setQ] = aState2('');
   const [editing, setEditing] = aState2(null);
   const [draft, setDraft] = aState2({ name: '', department: '', location: '' });
   const includeDept = Sa.includeDepartment ? Sa.includeDepartment() : true;
   const tagFields = (Sa.customFields ? Sa.customFields() : []).filter(f => f.type === 'tags' && Array.isArray(f.options) && f.options.length);
   const all = Sa.allSync().slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
   const list = q.trim() ? all.filter(p => (p.name || '').toLowerCase().indexOf(q.toLowerCase()) >= 0) : all;
   const fld = { width: '100%', border: '2.5px solid var(--ink)', borderRadius: 12, padding: '10px 13px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 15, outline: 'none', marginBottom: 12 };
   const inpSm = { width: '100%', border: '2px solid var(--ink)', borderRadius: 10, padding: '7px 10px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 13, outline: 'none', background: '#fff', marginTop: 4 };
   function startEdit(p) {
     setEditing(p.id);
     setDraft({ name: p.name || '', department: p.department || '', location: p.location || p.city || '' });
   }
   function saveEdit(p) {
     var patch = { name: draft.name.trim() || p.name, department: draft.department.trim(), location: draft.location.trim(), city: draft.location.trim() };
     Promise.resolve(Sa.adminUpdateParticipant(p.id, patch)).then(function () {
       setEditing(null);
       if (window.wcToast) window.wcToast('Entrant updated.', 'neutral');
     });
   }
   function remove(p) {
     if (window.confirm('Remove ' + (p.name || 'this entrant') + ' from the sweepstake? This frees their entry and adjusts the pot.')) Sa.removeParticipant(p.id);
   }
   function resetPw(p) {
     if (window.confirm("Clear " + (p.name || 'this entrant') + "'s password? They'll be able to set a new one and sign in again.")) {
       Promise.resolve(Sa.setAccountPassword(p.id, { newPassword: '' })).then(function () {
         if (window.wcToast) window.wcToast('Password cleared for ' + (p.name || 'entrant') + '.', 'neutral');
       });
     }
   }
   function clearPhoto(p) {
     if (window.confirm("Remove " + (p.name || 'this entrant') + "'s photo?")) {
       Promise.resolve(Sa.removeAvatar(p.id)).then(function () {
         if (window.wcToast) window.wcToast('Photo removed.', 'neutral');
       });
     }
   }
   function toggleTag(p, f, opt) {
     const current = Object.assign({}, p.customFields || {});
     const selected = Array.isArray(current[f.key]) ? current[f.key] : [];
     const on = selected.indexOf(opt) >= 0;
     const nextTags = on ? selected.filter(x => x !== opt) : selected.concat([opt]);
     if (nextTags.length) current[f.key] = nextTags;
     else delete current[f.key];
     Promise.resolve(Sa.adminUpdateParticipant ? Sa.adminUpdateParticipant(p.id, { customFields: current }) : Sa.update(p.id, { customFields: current }))
       .then(function () { if (window.wcToast) window.wcToast('Tags updated.', 'neutral'); });
   }
   return (
     <>
       <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>Edit names and details, reset passwords, or add organiser tags.</div>
       <input style={fld} placeholder="Search entrants…" value={q} onChange={e => setQ(e.target.value)} />
       {list.length === 0
         ? <Ca flat style={{ textAlign: 'center', padding: '24px 14px' }}>
             <Wa mood="neutral" size={56} animate />
             <div className="dh" style={{ fontSize: 16, marginTop: 6 }}>{all.length ? 'No match.' : 'No entrants yet.'}</div>
             <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>{all.length ? 'Try a different name.' : "They'll appear here as people sign up."}</div>
           </Ca>
         : <Ca flat style={{ padding: '2px 13px' }}>
             {list.map((p, i) => {
               const t = WCa.TEAMS[p.team];
               return <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < list.length - 1 ? '1.5px solid var(--line)' : 'none' }}>
                 {t && <Fa team={t} size={22} />}
                 <div style={{ flex: 1, minWidth: 0 }}>
                   {editing === p.id ? <>
                     <div style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--ink2)', textTransform: 'uppercase' }}>Name</div>
                     <input style={inpSm} value={draft.name} onChange={e => setDraft(Object.assign({}, draft, { name: e.target.value }))} />
                     {includeDept && <>
                       <div style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--ink2)', textTransform: 'uppercase', marginTop: 8 }}>Department</div>
                       <input style={inpSm} value={draft.department} onChange={e => setDraft(Object.assign({}, draft, { department: e.target.value }))} />
                     </>}
                     <div style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--ink2)', textTransform: 'uppercase', marginTop: 8 }}>Location</div>
                     <input style={inpSm} value={draft.location} onChange={e => setDraft(Object.assign({}, draft, { location: e.target.value }))} />
                     <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                       <button onClick={() => saveEdit(p)} className="wc-btn wc-btn--sm wc-btn--ink">Save</button>
                       <button onClick={() => setEditing(null)} className="wc-btn wc-btn--sm">Cancel</button>
                     </div>
                   </> : <>
                   <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}{p.hasPassword ? ' 🔒' : ''}</div>
                   <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{(p.location || p.city || '')}{includeDept && p.department ? ' · ' + p.department : ''}{t ? ' · ' + t.name : ''}</div>
                   <button onClick={() => startEdit(p)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, color: 'var(--ink2)', padding: '4px 0 0' }}>Edit details</button>
                   </>}
                   {tagFields.map(f => {
                     const selected = Array.isArray(p.customFields && p.customFields[f.key]) ? p.customFields[f.key] : [];
                     return <div key={f.key} style={{ marginTop: 7 }}>
                       <div style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{f.label}</div>
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                         {f.options.map(opt => {
                           const on = selected.indexOf(opt) >= 0;
                           return <button key={opt} onClick={() => toggleTag(p, f, opt)} className="wc-btn wc-btn--sm"
                             style={{ padding: '4px 8px', fontSize: 11, background: on ? 'var(--yellow)' : '#fff', boxShadow: on ? '0 3px 0 var(--ink)' : '0 3px 0 var(--shadow)' }}>
                             {opt}
                           </button>;
                         })}
                       </div>
                     </div>;
                   })}
                   {(p.hasPassword || (Sa.avatarUrl && Sa.avatarUrl(p))) && <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                     {p.hasPassword && <button onClick={() => resetPw(p)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, color: 'var(--ink2)', padding: 0 }}>Reset password</button>}
                     {Sa.avatarUrl && Sa.avatarUrl(p) && <button onClick={() => clearPhoto(p)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, color: 'var(--ink2)', padding: 0 }}>Remove photo</button>}
                   </div>}
                 </div>
                 <button onClick={() => remove(p)} className="wc-btn wc-btn--sm" style={{ padding: '6px 12px', background: '#fff', color: 'var(--red)', boxShadow: '0 3px 0 var(--shadow)', flex: '0 0 auto' }}>Remove</button>
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
     fetch(Sa.api('/chat')).then(r => r.json().then(d => {
       if (!r.ok) throw new Error((d && d.detail) || 'Could not load chat');
       return d;
     })).then(d => {
       setMsgs((d || []).slice().reverse());
       setLoading(false);
     }).catch(() => setLoading(false));
   }
   React.useEffect(() => { if (isLive) load(); else setLoading(false); }, []);

   function del(id) {
     if (!window.confirm('Delete this message for everyone? This cannot be undone.')) return;
     fetch(Sa.api('/chat/' + id), { method: 'DELETE', headers: Sa.adminHeaders ? Sa.adminHeaders({}) : {} })
       .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok) throw new Error(j.detail || 'Could not delete message'); return j; }))
       .then(() => setMsgs(prev => prev.filter(m => m.id !== id)))
       .catch(e => { if (window.wcToast) window.wcToast(e.message || 'Could not delete message', 'crying'); });
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
               <Wa mood="neutral" size={56} animate />
               <div className="dh" style={{ fontSize: 16, marginTop: 6 }}>Nothing to moderate.</div>
               <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>Messages will appear here as people chat.</div>
             </Ca>
           : <Ca flat style={{ padding: '2px 13px' }}>
               {msgs.map((m, i) => {
                 const d = new Date(m.ts);
                 const timeStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                 return <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < msgs.length - 1 ? '1.5px solid var(--line)' : 'none' }}>
                   <div style={{ width: 30, height: 30, borderRadius: '50%', background: m.color || '#333', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 12, flex: '0 0 auto' }}>{m.initials}</div>
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

/* ---- Organiser gate ---------------------------------------------------------
    Live mode verifies the organiser code on the server and receives a short
    session token used for admin-only writes. Static preview stays open. */
function AdminGate(props) {
   const serverAuth = !!(Sa.live && Sa.verifyAdminCode);
   const [ok, setOk] = aState2(() => {
     return serverAuth ? !!(Sa.hasAdminTokenForActive ? Sa.hasAdminTokenForActive() : (Sa.hasAdminToken && Sa.hasAdminToken())) : true;
   });
   const [entry, setEntry] = aState2('');
   const [bad, setBad] = aState2(false);
   const [busy, setBusy] = aState2(false);

   if (ok) return <AdminPanel onClose={props.onClose} />;

   if (Sa.isDemoMode && Sa.isDemoMode()) {
     return (
       <div className="moment" style={{ background: 'var(--bg)', alignItems: 'center', justifyContent: 'center', padding: '0 26px' }}>
         <button onClick={props.onClose} style={{ position: 'absolute', top: 16, right: 16, border: 'none', background: 'var(--ink)', color: '#fff', width: 34, height: 34, borderRadius: 10, fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>✕</button>
         <Wa mood="neutral" size={92} animate />
         <div className="dh" style={{ fontSize: 22, marginTop: 12, textAlign: 'center' }}>Demo mode is read-only.</div>
         <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 8, textAlign: 'center', lineHeight: 1.45 }}>Start your own league to unlock the organiser clipboard.</div>
       </div>
     );
   }

   // Which code does this league expect?
   // organiser PIN; self-created leagues use their private organiser code.
   const league = Sa.activeLeague && Sa.activeLeague();
   const seeded = !!(league && league.seeded);
   const hint = !serverAuth
     ? 'Preview mode — the clipboard is open.'
     : seeded
       ? 'Use the organiser PIN for this league.'
       : 'Use the private organiser code set when “' + ((league && league.name) || 'this league') + '” was created.';

   function submit() {
     if (!entry || busy) return;
     if (!serverAuth) { setOk(true); return; }
     setBusy(true); setBad(false);
     Sa.verifyAdminCode(entry).then(() => {
       setBusy(false);
       setOk(true);
     }).catch(() => {
       setBusy(false);
       setBad(true);
       setEntry('');
     });
   }

   return (
     <div className="moment" style={{ background: 'var(--bg)', alignItems: 'center', justifyContent: 'center', padding: '0 26px' }}>
       <button onClick={props.onClose} style={{ position: 'absolute', top: 16, right: 16, border: 'none', background: 'var(--ink)', color: '#fff', width: 34, height: 34, borderRadius: 10, fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>✕</button>
       <div className={'rise' + (bad ? ' shake' : '')} style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
         <Wa mood={bad ? 'shocked' : 'mischievous'} size={92} animate />
         <div className="dh" style={{ fontSize: 24, marginTop: 10 }}>Organiser only.</div>
         <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.45 }}>
           {bad ? 'Wrong code. Wheesht is watching. Try again.' : "Wheesht doesn't hand the clipboard to just anyone."}
         </div>
         <div style={{ fontSize: 12, fontWeight: 700, color: bad ? 'var(--red)' : 'var(--ink2)', marginTop: 8, background: 'var(--bg2)', border: '2px solid var(--line)', borderRadius: 11, padding: '8px 11px', lineHeight: 1.4 }}>
           {hint}
         </div>
         <input
           autoFocus
           type="password"
           value={entry}
           onChange={e => { setEntry(e.target.value); setBad(false); }}
           onKeyDown={e => { if (e.key === 'Enter') submit(); }}
           placeholder={seeded ? 'Organiser PIN' : 'Organiser code'}
           style={{ width: '100%', border: '2.5px solid var(--ink)', borderRadius: 14, padding: '13px 16px', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 22, textAlign: 'center', letterSpacing: '.1em', marginTop: 14, outline: 'none' }}
         />
         <button onClick={submit} disabled={!entry || busy} className="wc-btn wc-btn--ink wc-btn--block" style={{ marginTop: 14, opacity: entry && !busy ? 1 : 0.4 }}>{busy ? 'Checking…' : 'Unlock the clipboard'}</button>
       </div>
     </div>
   );
}

window.AdminPanel = AdminPanel;
window.AdminGate = AdminGate;
