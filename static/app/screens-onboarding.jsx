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

function OptionsInputSetup(p) {
  const value = (p.options || []).join(', ');
  const [draft, setDraft] = oState(value);
  oEffect(() => setDraft(value), [value]);
  function commit() {
    p.onChange(draft.split(',').map(x => x.trim()).filter(Boolean));
  }
  return <input style={{ ...inp, padding: '10px 12px', fontSize: 14 }} value={draft}
    onChange={e => setDraft(e.target.value)}
    onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur(); } }}
    placeholder="Options, separated by commas" />;
}

function CustomFieldSetup(p) {
  const fields = p.fields || [];
  function patch(i, next) {
    p.onChange(fields.map((f, idx) => idx === i ? { ...f, ...next } : f));
  }
  function remove(i) {
    p.onChange(fields.filter((_, idx) => idx !== i));
  }
  function add() {
    if (fields.length >= 6) return;
    p.onChange(fields.concat([{ key: '', label: '', type: 'text', required: false, options: [] }]));
  }
  const typeOpts = [
    { value: 'text', label: 'Text' },
    { value: 'select', label: 'Dropdown' },
    { value: 'suggest', label: 'List + other' },
    { value: 'tags', label: 'Tags' },
  ];
  return (
    <div>
      <Lab opt>Custom signup questions</Lab>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>Add text fields, locked dropdowns, suggested lists, or multi-pick tags.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {fields.map((f, i) => (
          <div key={i} style={{ border: '2px solid var(--line)', borderRadius: 14, padding: 10, background: '#fff' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <input style={{ ...inp, marginTop: 0, padding: '10px 12px', fontSize: 14 }} value={f.label || ''} onChange={e => patch(i, { label: e.target.value })} placeholder="Question label" maxLength={40} />
              <button onClick={() => remove(i)} className="wc-btn wc-btn--sm" style={{ flex: '0 0 auto', background: '#fff' }}>Remove</button>
            </div>
            <Seg value={f.type || 'text'} onChange={v => patch(i, { type: v })} options={typeOpts} />
            {(f.type === 'select' || f.type === 'suggest' || f.type === 'tags') && <div>
              <OptionsInputSetup options={f.options || []} onChange={options => patch(i, { options })} />
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>{f.type === 'select' ? 'Only these answers can be saved.' : f.type === 'tags' ? 'People can pick any number of these tags.' : 'These show as suggestions, but other answers are allowed.'}</div>
            </div>}
            <button onClick={() => patch(i, { required: !f.required })} style={{ marginTop: 8, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 800, color: f.required ? 'var(--green)' : 'var(--ink2)' }}>
              {f.required ? 'Required' : 'Optional'}
            </button>
          </div>
        ))}
        {fields.length < 6 && <button onClick={add} className="wc-btn wc-btn--sm wc-btn--ghost" style={{ width: '100%' }}>Add custom field</button>}
      </div>
    </div>
  );
}

function CustomAnswerField(p) {
  const f = p.field;
  const val = p.value || '';
  const set = v => p.onChange(f.key, v);
  const options = f.options || [];
  if (f.type === 'select') {
    return <select style={inp} value={val} onChange={e => set(e.target.value)}>
      <option value="">{f.required ? 'Choose one' : 'Optional'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>;
  }
  if (f.type === 'suggest') {
    const id = 'wh-custom-' + f.key;
    return <>
      <input style={inp} value={val} onChange={e => set(e.target.value)} placeholder="Your answer" maxLength={80} list={id} />
      <datalist id={id}>{options.map(o => <option key={o} value={o} />)}</datalist>
    </>;
  }
  if (f.type === 'tags') {
    const selected = Array.isArray(p.value) ? p.value : [];
    const toggle = o => {
      const on = selected.indexOf(o) >= 0;
      set(on ? selected.filter(x => x !== o) : selected.concat([o]));
    };
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {options.map(o => {
        const on = selected.indexOf(o) >= 0;
        return <button key={o} onClick={() => toggle(o)} className="wc-btn wc-btn--sm"
          style={{ background: on ? 'var(--yellow)' : '#fff', boxShadow: on ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>
          {o}
        </button>;
      })}
    </div>;
  }
  return <input style={inp} value={val} onChange={e => set(e.target.value)} placeholder="Your answer" maxLength={80} />;
}

function customValuePresent(v) {
  return Array.isArray(v) ? v.length > 0 : !!String(v || '').trim();
}

/* =================== ACCOUNT / LEAGUE GATE =================== */
function AccountGate(props) {
  // All device accounts across every league, so people can hop back in.
  const accounts = So.allDeviceAccounts ? So.allDeviceAccounts() : [];
  const leagues = So.knownLeagues ? So.knownLeagues() : {};
  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '34px 22px 28px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block' }} className="pop"><Wo mood="happy" size={148} animate track /></div>
          <div className="dh" style={{ fontSize: 30, marginTop: 8, lineHeight: 1 }}>{WCo.meta.name}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', marginTop: 6 }}>{WCo.meta.season} · {WCo.meta.stageLabel}</div>
          <div style={{ display: 'inline-flex', marginTop: 14, background: 'var(--ink)', color: '#fff', borderRadius: '16px 16px 16px 5px', padding: '11px 15px', maxWidth: 320, textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}><span style={{ color: 'var(--yellow)', fontWeight: 800 }}>Wheesht here.</span> Officially impartial. Constitutionally Scottish. Join a league or start your own.</div>
          </div>
        </div>

        {accounts.length > 0 && <>
          <div className="wc-sec" style={{ margin: '26px 4px 11px' }}><h3>Jump back in</h3><span>{accounts.length} on this device</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {accounts.map(p => {
              const t = WCo.TEAMS[p.team];
              const lg = p.leagueCode && leagues[p.leagueCode];
              return <button key={p.id} onClick={() => props.onResume(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '2.5px solid var(--ink)', borderRadius: 16, padding: '11px 13px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 4px 0 var(--ink)' }}>
                <Ao person={p} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dh" style={{ fontSize: 17 }}>{p.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                    <span>{lg ? lg.name : (p.leagueCode || 'Sweepstake')}{t ? ' · ' + t.name : ''}</span>
                    {lg && lg.hasPro && <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.06em', background: 'var(--ink)', color: 'var(--yellow)', borderRadius: 999, padding: '2px 7px' }}>PRO</span>}
                  </div>
                </div>
                {t && <Fo team={t} size={26} />}
                <span className="dh" style={{ fontSize: 20 }}>→</span>
              </button>;
            })}
          </div>
        </>}

        <div className="wc-sec" style={{ margin: '26px 4px 11px' }}><h3>{accounts.length ? 'Another league' : 'Get started'}</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Bo variant="ink" block onClick={props.onJoin}>Join a league →</Bo>
          <Bo variant="primary" block onClick={props.onCreate}>Create a new league →</Bo>
          {props.onDemo && <Bo variant="ghost" block onClick={props.onDemo}>{(window.WheeshtCopy && window.WheeshtCopy.demoGate) || 'Try the demo league'}</Bo>}
          <a href="/welcome" style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--ink2)', textDecoration: 'underline', padding: '6px 0' }}>New here? See how it works</a>
        </div>
      </div>
    </div>
  );
}

/* =================== JOIN A LEAGUE =================== */
function JoinLeague(props) {
  const [code, setCode] = oState((props.initialCode || '').toUpperCase());
  oEffect(function () { if (props.initialCode) setCode(String(props.initialCode).toUpperCase()); }, [props.initialCode]);
  const [pw, setPw] = oState('');
  const [err, setErr] = oState('');
  const [busy, setBusy] = oState(false);
  const [preview, setPreview] = oState(null);
  const [previewBusy, setPreviewBusy] = oState(false);
  const [pwFails, setPwFails] = oState(0);
  const ok = code.trim().length >= 2 && pw.length > 0;
  const copy = window.WheeshtCopy || {};

  oEffect(function () {
    if (window.Store && window.Store.trackEvent) window.Store.trackEvent('join_start');
  }, []);

  oEffect(function () {
    var c = code.trim().toUpperCase();
    if (c.length < 2) { setPreview(null); return; }
    var live = true;
    setPreviewBusy(true);
    fetch('/api/leagues/' + encodeURIComponent(c) + '/preview')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (live) { setPreview(data); setPreviewBusy(false); } })
      .catch(function () { if (live) { setPreview(null); setPreviewBusy(false); } });
    return function () { live = false; };
  }, [code]);

  function submit() {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    So.joinLeague(code.trim(), pw).then(function (res) {
      setBusy(false);
      if (window.Store && window.Store.trackEvent) window.Store.trackEvent('join_success');
      props.onJoined(res.league);
    }).catch(function (e) {
      setBusy(false);
      var msg = (e && e.message) || 'Could not join that league.';
      if (/wrong password/i.test(msg)) {
        setPwFails(function (n) { return n + 1; });
        setErr(copy.joinWrongPassword || msg);
      } else if (/no league/i.test(msg)) setErr(copy.joinWrongCode || msg);
      else setErr(msg);
    });
  }

  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '30px 22px 28px' }}>
        <button onClick={props.onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--ink2)', padding: 0, marginBottom: 14 }}>← Back</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Wo mood="mischievous" size={72} animate />
          <div>
            <div className="dh" style={{ fontSize: 24, lineHeight: 1 }}>Join a league</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>Enter the league code and member password your organiser gave you.</div>
          </div>
        </div>
        {preview && preview.name && <div style={{ marginTop: 16, background: '#fff', border: '2.5px solid var(--ink)', borderRadius: 16, padding: '12px 14px', boxShadow: '0 4px 0 var(--ink)' }}>
          <div className="dh" style={{ fontSize: 18 }}>{preview.name}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', marginTop: 4 }}>
            {(copy.joinPreviewCount || '{count} already in').replace('{count}', String(preview.entrantCount || 0))}
          </div>
        </div>}
        {previewBusy && !preview && code.trim().length >= 2 && <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)' }}>{copy.joinPreviewLoading || 'Looking up league…'}</div>}
        <div style={{ marginTop: 20 }}>
          <Lab>League code</Lab>
          <input
            autoFocus
            style={{ ...inp, textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 22, textAlign: 'center' }}
            value={code}
            onChange={e => { setCode(e.target.value); setErr(''); }}
            placeholder="e.g. OFFICE26"
            maxLength={12}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <Lab>Member password</Lab>
          <input
            type="password"
            style={inp}
            value={pw}
            onChange={e => { setPw(e.target.value); setErr(''); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Member password"
          />
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{err}</div>}
        {pwFails >= 2 && preview && preview.name && <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', lineHeight: 1.4 }}>
          {(copy.joinPasswordHelp || 'Ask your organiser for the member password. You can copy the invite link below.')}
          {window.WheeshtShare && <button type="button" onClick={function () {
            window.WheeshtShare.copyText(window.WheeshtShare.inviteUrl(code)).then(function () {
              if (window.wcToast) window.wcToast('Invite link copied.', 'confident');
            });
          }} style={{ display: 'block', marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, color: 'var(--ink)', textDecoration: 'underline', padding: 0 }}>Copy invite link</button>}
        </div>}
        <div style={{ marginTop: 18 }}>
          <Bo variant="ink" block onClick={submit}>{busy ? 'Checking…' : 'Join league →'}</Bo>
        </div>
        <button onClick={props.onCreate} style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 800, color: 'var(--ink2)', textDecoration: 'underline', padding: '4px 0' }}>No league yet? Create one</button>
      </div>
    </div>
  );
}

/* =================== CREATE A LEAGUE =================== */
function CreateLeague(props) {
  const [name, setName] = oState('');
  const [code, setCode] = oState('');
  const [pw, setPw] = oState('');
  const [organiserCode, setOrganiserCode] = oState('');
  const [purpose, setPurpose] = oState('work');
  const [includeDept, setIncludeDept] = oState(true);
  const [includeLocation, setIncludeLocation] = oState(true);
  const [includeLtMember, setIncludeLtMember] = oState(true);
  const [locInput, setLocInput] = oState('Edinburgh, London');
  const [locationsFreeText, setLocationsFreeText] = oState(false);
  const [entryFee, setEntryFee] = oState('5');
  const [currency, setCurrency] = oState('£');
  const [charitySplit, setCharitySplit] = oState(0.5);
  const [customFields, setCustomFields] = oState([]);
  const [err, setErr] = oState('');
  const [busy, setBusy] = oState(false);
  const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ok = name.trim().length > 0 && cleanCode.length >= 2 && pw.length >= 4 && organiserCode.length >= 4 && organiserCode !== pw;
  const toggleRow = (onClick, on, title, text) => <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', border: '2px solid var(--line)', borderRadius: 13, background: '#fff', padding: '11px 12px', cursor: 'pointer' }}>
    <span style={{ width: 42, height: 24, borderRadius: 999, background: on ? 'var(--green)' : 'var(--line)', border: '2px solid var(--ink)', position: 'relative', flex: '0 0 auto' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', border: '2px solid var(--ink)' }} />
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="dh" style={{ display: 'block', fontSize: 15 }}>{title}</span>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginTop: 2, lineHeight: 1.3 }}>{text}</span>
    </span>
  </button>;

  function submit() {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    const locations = locInput.split(',').map(s => s.trim()).filter(Boolean);
    const opts = {
      purpose: purpose,
      includeDepartment: purpose === 'work' && includeDept,
      includeLocation: purpose === 'work' && includeLocation,
      includeLtMember: purpose === 'work' && includeLtMember,
      locations: locations.length ? locations : ['Edinburgh', 'London'],
      locationsFreeText: locationsFreeText,
      entryFee: Math.max(0, Number(entryFee) || 0),
      currency: currency || '£',
      charitySplit: charitySplit,
      organiserCode: organiserCode,
      customFields: customFields.filter(f => (f.label || '').trim()),
    };
    So.createLeague(name.trim(), cleanCode, pw, opts).then(function (res) {
      setBusy(false);
      props.onCreated(res.league);
    }).catch(function (e) {
      setBusy(false);
      setErr((e && e.message) || 'Could not create that league.');
    });
  }

  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '30px 22px 28px' }}>
        <button onClick={props.onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--ink2)', padding: 0, marginBottom: 14 }}>← Back</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Wo mood="confident" size={72} animate />
          <div>
            <div className="dh" style={{ fontSize: 24, lineHeight: 1 }}>Create a league</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>You'll be the organiser. Share the league code and member password. Keep the organiser code private.</div>
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Lab>League name</Lab>
            <input autoFocus style={inp} value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="e.g. The Pub Quiz Crew" maxLength={60} />
          </div>
          <div>
            <Lab>League code</Lab>
            <input style={{ ...inp, textTransform: 'uppercase', letterSpacing: '.12em' }} value={code} onChange={e => { setCode(e.target.value); setErr(''); }} placeholder="e.g. PUBCREW" maxLength={12} />
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>2–12 letters or numbers. People type this to join.</div>
          </div>
          <div>
            <Lab>Member password</Lab>
            <input type="password" style={inp} value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="At least 4 characters" />
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>People use this with the league code to join. It does not unlock organiser tools.</div>
          </div>
          <div>
            <Lab>Private organiser code</Lab>
            <input type="password" style={inp} value={organiserCode} onChange={e => { setOrganiserCode(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Different from member password" />
            <div style={{ fontSize: 11.5, fontWeight: 600, color: organiserCode && organiserCode === pw ? 'var(--red)' : 'var(--ink2)', marginTop: 4 }}>
              Only the organiser uses this to open settings, results, chat moderation and league controls.
            </div>
          </div>
          <div>
            <Lab>Who is this for?</Lab>
            <Seg value={purpose} onChange={setPurpose} options={[{ value: 'work', label: 'Work' }, { value: 'friends', label: 'Friends & family' }]} />
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 6 }}>
              {purpose === 'work' ? 'Collect work details during signup. You can fine-tune them now.' : 'Keeps signup simple: names only, plus any custom questions you add.'}
            </div>
          </div>
          <div>
            <Lab>Entry fee</Lab>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inp, flex: '0 0 86px', fontSize: 20, paddingLeft: 10, paddingRight: 10 }}>
                {['£', '€', '$'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" min="0" step="0.5" style={inp} value={entryFee} onChange={e => setEntryFee(e.target.value)} placeholder="5" />
            </div>
          </div>
          <div>
            <Lab>Charity split</Lab>
            <Seg value={charitySplit} onChange={setCharitySplit} options={[0, 0.25, 0.5, 0.75, 1].map(v => ({ value: v, label: Math.round(v * 100) + '%' }))} />
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 6 }}>
              {charitySplit === 0 ? 'Everything goes to the winner fund.' : charitySplit === 1 ? 'Everything goes to charity.' : Math.round(charitySplit * 100) + '% to charity, the rest to the winner fund.'}
            </div>
          </div>
          {purpose === 'work' && <>
            {toggleRow(() => setIncludeDept(!includeDept), includeDept, 'Team / department', includeDept ? 'Ask people for their team or department.' : 'Hide the department field.')}
            {toggleRow(() => setIncludeLocation(!includeLocation), includeLocation, 'Location', includeLocation ? 'Ask people to pick a location.' : 'Hide the location field.')}
            {toggleRow(() => setIncludeLtMember(!includeLtMember), includeLtMember, 'Leadership Team member', includeLtMember ? 'Ask whether someone is in LT.' : 'Hide the LT question.')}
            {includeLocation && <div>
              <Lab>Locations</Lab>
              <input style={inp} value={locInput} onChange={e => setLocInput(e.target.value)} placeholder="e.g. Edinburgh, London, Remote" />
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>Separate locations with commas.</div>
            </div>}
            {includeLocation && toggleRow(() => setLocationsFreeText(!locationsFreeText), locationsFreeText, 'Allow custom location', locationsFreeText ? 'People can type their own location.' : 'People must pick from your list.')}
          </>}
          <CustomFieldSetup fields={customFields} onChange={setCustomFields} />
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{err}</div>}
        <div style={{ marginTop: 18 }}>
          <Bo variant="ink" block onClick={() => ok && submit()}>{busy ? 'Creating…' : 'Create & continue →'}</Bo>
        </div>
      </div>
    </div>
  );
}

/* =================== FIND MY ENTRY =================== */
function FindMyEntry(props) {
  const [q, setQ] = oState('');
  const results = q.trim() ? So.search(q) : [];
  const includeDept = So.includeDepartment ? So.includeDepartment() : true;
  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '30px 22px 28px' }}>
        <button onClick={props.onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--ink2)', padding: 0, marginBottom: 14 }}>← Back</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Wo mood="mischievous" size={72} animate />
          <div>
            <div className="dh" style={{ fontSize: 24, lineHeight: 1 }}>Find my entry</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>No password needed. Just your name — Wheesht never forgets a face.</div>
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
              <div className="dh" style={{ fontSize: 17, marginTop: 6 }}>No sign of you.</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>Different spelling? Or maybe you've not entered yet.</div>
              <div style={{ marginTop: 12 }}><Bo variant="primary" sm onClick={props.onNew}>Enter as someone new →</Bo></div>
            </Co>}
          {results.map(p => {
            const t = WCo.TEAMS[p.team];
            const locked = So.needsSignIn && So.needsSignIn(p);
            return <button key={p.id} onClick={() => props.onPicked(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '2px solid var(--line)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
              <Ao person={p} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>{p.location}{includeDept && p.department ? ' · ' + p.department : ''}</div>
              </div>
              {t && <Fo team={t} size={22} />}
              {locked
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 800, color: 'var(--ink2)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                    Sign in
                  </span>
                : <span className="dh" style={{ fontSize: 16, color: 'var(--red)' }}>This is me →</span>}
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
  const includeDept = So.includeDepartment ? So.includeDepartment() : true;
  const includeLocation = So.includeLocation ? So.includeLocation() : true;
  const includeLtMember = So.includeLtMember ? So.includeLtMember() : true;
  const customDefs = So.customFields ? So.customFields() : [];
  const [customFields, setCustomFields] = oState({});
  const locationOpts = So.locations ? So.locations() : ['Edinburgh', 'London'];
  const locationsFreeText = So.locationsFreeText ? So.locationsFreeText() : false;
  const [loc, setLoc] = oState(locationOpts[0] || 'Edinburgh');
  const [lt, setLt] = oState(false);
  const setCustom = (key, value) => setCustomFields({ ...customFields, [key]: value });
  const requiredMissing = customDefs.some(f => f.required && !customValuePresent(customFields[f.key]));
  const ok = name.trim().length > 0 && !requiredMissing;
  const split = So.charitySplit ? So.charitySplit() : 0.5;
  const fee = WCo.FEE || 0;
  const money = So.money || function(n){
    const cur = (WCo.meta && WCo.meta.currency) || '£';
    return cur + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  const charityPerEntry = fee * split;
  const winnerAfterEntry = (window.Store ? window.Store.pot() : WCo.POT * (1 - split)) + fee * (1 - split);
  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '28px 22px 30px' }}>
        <button onClick={props.onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--ink2)', padding: 0, marginBottom: 10 }}>← Back</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block' }} className="pop"><Wo mood="confident" size={120} animate track /></div>
          <div className="dh" style={{ fontSize: 28, marginTop: 4, lineHeight: 1 }}>Let's get you signed up.</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 6 }}>Takes ten seconds. The only thing Wheesht actually needs is your name.</div>
        </div>

        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Lab>Full name</Lab>
            <input autoFocus style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex Johnson" />
          </div>
          {includeDept && <div>
            <Lab opt>Team / department</Lab>
            <input style={inp} value={dept} onChange={e => setDept(e.target.value)} placeholder="e.g. Engineering" list="wh-depts" />
            <datalist id="wh-depts">{DEPTS.map(d => <option key={d} value={d} />)}</datalist>
          </div>}
          {includeLocation && <div>
            <Lab opt>Location</Lab>
            {locationsFreeText
              ? <>
                  <input style={inp} value={loc} onChange={e => setLoc(e.target.value)} placeholder="Your office or location" list="wh-locs" />
                  <datalist id="wh-locs">{locationOpts.map(l => <option key={l} value={l} />)}</datalist>
                </>
              : locationOpts.length <= 3
                ? <Seg value={loc} onChange={setLoc} options={locationOpts.map(l => ({ value: l, label: l }))} />
                : <select style={inp} value={loc} onChange={e => setLoc(e.target.value)}>
                    {locationOpts.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
            }
          </div>}
          {includeLtMember && <div>
            <Lab opt>Leadership Team member?</Lab>
            <Seg value={lt} onChange={setLt} options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]} />
          </div>}
          {customDefs.map(f => <div key={f.key}>
            <Lab opt={!f.required}>{f.label}</Lab>
            <CustomAnswerField field={f} value={customFields[f.key]} onChange={setCustom} />
          </div>)}
        </div>

        {fee > 0 && <Co bordered style={{ marginTop: 20, background: 'var(--yellow)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>Your buy-in</div>
          <div className="dh" style={{ fontSize: 28, margin: '2px 0 4px' }}>You're putting in {money(fee)}.</div>
          {split < 0.01
            ? <div style={{ fontSize: 14, fontWeight: 600 }}>The full amount goes into a winner-takes-all fund — <b>{money(winnerAfterEntry)}</b> once you're in, and growing with every sign-up.</div>
            : split > 0.99
              ? <div style={{ fontSize: 14, fontWeight: 600 }}>The full entry goes to charity. This is a fun-only sweepstake — no winner fund.</div>
              : <div style={{ fontSize: 14, fontWeight: 600 }}><b>{money(charityPerEntry)} goes to charity</b>, the rest into a winner-takes-all fund — <b>{money(winnerAfterEntry)}</b> once you're in, and growing with every sign-up.</div>
          }
        </Co>}

        <div style={{ marginTop: 18 }}>
          <Bo variant="ink" block onClick={() => ok && props.onSubmit({ name: name.trim(), department: includeDept ? dept.trim() : '', location: includeLocation ? loc : '', ltMember: includeLtMember ? lt : false, customFields: customFields })}>
            {ok ? 'To the draw →' : name.trim() ? 'Finish required fields' : 'Add your name first'}
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
    const code = t.code;
    const bespoke = {
      BRA: 'Brazil. The five-time champions. Dangerous, flamboyant, and absolutely in this. Wheesht considers this a very good pull.',
      ARG: 'The defending world champions. Dangerous, experienced, and absolutely up for this. Wheesht rates this draw highly.',
      FRA: 'France. Squad depth, flair, and a ruthless edge. One of the outright favourites. Wheesht is, quietly, very impressed.',
      ESP: 'Spain. They\'ll control the ball, control the tempo, and probably control your nerves too. A top draw. Wheesht approves.',
      POR: 'Portugal. Individual quality all over the pitch. Could go all the way — or could implode spectacularly. Wheesht watches with great interest.',
      GER: 'Germany. They always find a way. Efficient, relentless, and deeply irritating to play against. Wheesht tips the hat.',
      NED: 'The Netherlands. Pedigree, pace, and usually at least one genuinely stunning goal. Not a bad hand at all.',
      BEL: 'Belgium. Experienced, well-organised, and capable of beating anyone. Wheesht considers this a solid draw.',
      NOR: 'Norway. The goals have been flying in all qualifying campaign. If the form carries, this is a very exciting pick.',
      URU: 'Uruguay. Punching above their weight for over a century. Small squad, enormous heart. Wheesht deeply respects this team.',
      COL: 'Colombia. Athletic, quick, and completely unpredictable. The best draws are the ones that could go either way. This is one of those.',
      MAR: 'Morocco. First African nation to reach a World Cup semi-final. Beat Spain and Portugal on the way. Wheesht has not forgotten and neither have they.',
      USA: 'USA. Playing at home, in front of massive crowds, with everything to prove. Do not sleep on this. Wheesht isn\'t.',
      CAN: 'Canada. Co-hosts, rising squad, playing in front of their own fans. There\'s something in this. Wheesht has a feeling.',
      MEX: 'Mexico. Co-hosts with a passionate fanbase and tournament experience. The crowd could carry them far. Wheesht is watching.',
      JPN: 'Japan. Beat Germany AND Spain at the last World Cup. In the same group. Wheesht has stopped writing Japan off and started actively backing them.',
      KOR: 'South Korea. Fast, fit, and capable of brilliant football on the big stage. A pick with real potential.',
      SEN: 'Senegal. Physical, technical, and genuinely dangerous. The African champions know how to tournament. Wheesht is intrigued.',
      AUS: 'Australia. Gritty, well-coached, and capable of the unexpected. Wheesht has a quiet feeling about this one.',
      CRO: 'Croatia. Experienced, stubborn, and never know when they\'re beaten. They always seem to find a way. Wheesht approves.',
      ECU: 'Ecuador. Solid South American outfit. Capable of results when you least expect them. Wheesht is cautiously optimistic.',
      SWE: 'Sweden. Structured, disciplined, dangerous at set pieces, and fiendishly hard to beat. Not a glamour pick — but Wheesht respects it.',
      SUI: 'Switzerland. The draw specialists. Organised, solid, and somehow always there at the knockouts. Wheesht knows this type.',
      CZE: 'Czech Republic. A proper footballing nation. They\'ve pulled off upsets before. Wheesht isn\'t writing them off.',
      AUT: 'Austria. Better than people give them credit for. Wheesht notes they\'ve been decent of late.',
      TUR: 'Turkey. Capable of brilliance and equally capable of chaos. Could be spectacular. Wheesht is braced.',
      GHA: 'Ghana. Energetic, unpredictable, and always entertaining. Every tournament needs a team like this.',
      EGY: 'Egypt. The African giants. A team with history and quality. They could make this interesting.',
      RSA: 'South Africa. Hosting the continent of Africa in spirit. The passion will carry them somewhere.',
      ALG: 'Algeria. A dark horse in every sense. Wheesht wouldn\'t rule them out.',
      IRN: 'Iran. Defensively solid and hard to break down. Don\'t expect entertainment — expect difficulty.',
      PAR: 'Paraguay. South American football pedigree. Capable of causing problems for anyone.',
      QAT: 'Qatar. The last World Cup hosts — and the first ever to be eliminated in the group stage at their own tournament. Wheesht notes the history. You may fare better.',
      KSA: 'Saudi Arabia. They beat Argentina in 2022. Just the reigning world champions. Wheesht watched. Wheesht hasn\'t forgotten. Neither have they.',
      JOR: 'Jordan. The tournament debutants deserve their moment. Wheesht will be watching.',
      IRQ: 'Iraq. Tournament football at this level is extraordinary. Wheesht acknowledges the journey.',
      CPV: 'Cape Verde. The plucky underdogs. Every sweepstake needs one and you\'ve got them. Wheesht wishes you luck — genuinely.',
      HAI: 'Haiti. A nation that plays football through everything. Wheesht respects this enormously. You got a team with a story — and stories sometimes end well.',
      CUW: 'Curaçao. A 150,000-person island at the World Cup. Wheesht finds this genuinely remarkable. The banter if they cause an upset will be extraordinary.',
      COD: 'DR Congo. Talented, unpredictable, and occasionally extraordinary. The African game has depth.',
      UZB: 'Uzbekistan. Central Asian football on the world stage. Wheesht notes the moment with respect.',
      CIV: 'Ivory Coast. The Elephants. AFCON champions, serious talent pool. This could be a very interesting pick.',
      NZL: 'New Zealand. Pacific footballers on the grandest stage. Wheesht says: why not?',
      TUN: 'Tunisia. A stalwart of African football at World Cups. Organised, experienced, capable.',
      BIH: 'Bosnia & Herzegovina. The Balkans know how to produce footballers. Capable of surprising people.',
      PAN: 'Panama. The joy of being here matters as much as the result. Wheesht acknowledges that fully.',
    };
    if (bespoke[code]) return bespoke[code];
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
          <div className="dh" style={{ fontSize: 14, letterSpacing: '.16em', color: 'var(--yellow)' }}>YOU DREW</div>
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
            <Bo variant="primary" block onClick={() => window.wcToast && window.wcToast('Draw shared. The banter starts now.', 'mischievous')}>Share your draw</Bo>
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

/* =================== ROSTER PICKER (seeded leagues) =================== */
function OIRosterPicker(props) {
  const all = So.allSync().filter(function(p) { return p.isOI; });
  const myIds = new Set(So.deviceIds());
  const league = So.activeLeague ? So.activeLeague() : null;

  return (
    <div className="moment">
      <div className="mscroll" style={{ padding: '24px 22px 28px' }}>
        <button onClick={props.onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--ink2)', padding: 0, marginBottom: 12 }}>← Back</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <Wo mood="confident" size={64} animate />
          <div>
            <div className="dh" style={{ fontSize: 24, lineHeight: 1 }}>Who are you?</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>{league ? league.name + ' — y' : 'Y'}our team has already been drawn. Find your name and tap it.</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {all.map(function(p) {
            const t = WCo.TEAMS[p.team];
            const mine = myIds.has(p.id);
            const locked = !mine && So.needsSignIn && So.needsSignIn(p);
            return (
              <button
                key={p.id}
                onClick={function() { if (!mine) props.onClaim(p.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: mine ? 'var(--yellow)' : '#fff',
                  border: '2.5px solid var(--ink)', borderRadius: 16,
                  padding: '11px 13px', cursor: mine ? 'default' : 'pointer',
                  textAlign: 'left', boxShadow: '0 4px 0 var(--ink)',
                }}
              >
                <span style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }}>{t ? t.flag : '🏳️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dh" style={{ fontSize: 17 }}>{p.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>
                    {t ? t.name : p.team} · Group {t ? t.group : '?'}
                  </div>
                </div>
                {mine
                  ? <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink2)' }}>on device</span>
                  : locked
                    ? <span title="Protected — sign in to claim" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: 'var(--ink2)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                        Sign in
                      </span>
                    : <span className="dh" style={{ fontSize: 18 }}>→</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AccountGate, JoinLeague, CreateLeague, FindMyEntry, OnboardingForm, DrawMoment, ScotlandTakeover, OIRosterPicker });
