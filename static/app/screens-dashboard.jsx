/* ===========================================================================
   PERSONAL DASHBOARD — "Me" screen.
   Profile · assigned team & progress · predictions · results & winnings ·
   activity feed. Reads the active participant from Store.
   =========================================================================== */
const WCd = window.WC;
const Wd = window.Wheesht;
const Sd = window.Store;
const { Card: Cd, Btn: Bd, Flag: Fd, Avatar: Ad, Chip: Chd, Stamp: Std, ProgressRing: PRd, WheeshtSays: Saysd, SectionHead: SHd } = window;
const { useState: dState } = React;

function money_d(n) {
  if (Sd && Sd.money) return Sd.money(n);
  const cur = (WCd.meta && WCd.meta.currency) || '£';
  return cur + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
const PRE = () => (WCd.meta.phase === 'pre');
function stageName(t) {
  if (t.stage === 'group') return 'Group stage';
  if (t.stage === 'qf') return 'Quarter-final';
  if (t.stage === 'r16') return 'Round of 16';
  if (t.stage === 'out-r16') return 'Out · Round of 16';
  if (t.stage === 'out-r32') return 'Out · Round of 32';
  return 'Out · Group stage';
}

// Read a chosen image file, square-crop (cover) and shrink it to a small JPEG
// data URL on the device, so only ~tens of KB ever travel to Postgres.
function resizeToDataUrl(file, size, cb) {
  const s = size || 256;
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = s; canvas.height = s;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(s / img.width, s / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
      try { cb(canvas.toDataURL('image/jpeg', 0.82)); } catch (err) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = e.target.result;
  };
  reader.onerror = function () { cb(null); };
  reader.readAsDataURL(file);
}

function dashTeam(code) { return WCd.TEAMS[code] || { code: code || '?', name: code || 'TBD', flag: '🏳️', rounds: 0, stage: 'group', odds: '0' }; }
function dashFixtureStatus(m) {
  const raw = String((m && (m.fixture_status || m.fixtureStatus || m.status)) || '').trim();
  const st = raw.toLowerCase();
  if (['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(st) >= 0) return 'done';
  if (['halftime', 'half_time', 'half-time', 'ht', 'paused'].indexOf(st) >= 0) return 'halfTime';
  if (['live', 'inplay', 'in_play', 'in-progress', 'inprogress', '1h', '2h'].indexOf(st) >= 0) return 'live';
  return st || 'upcoming';
}
function dashFixtureActive(m) {
  return dashFixtureStatus(m) === 'live' || dashFixtureStatus(m) === 'halfTime';
}
function dashFixtureFinished(m) {
  return ['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(dashFixtureStatus(m)) >= 0;
}
function dashDynamicKickedOff(m) {
  return m && String(m.key || '').indexOf('dm_') === 0 && (dashFixtureActive(m) || dashFixtureFinished(m));
}
function dashCountableMarkets(me, markets) {
  return (markets || []).filter(m => !dashDynamicKickedOff(m) || dashPickComplete(m, (me && me.picks) || {}));
}
function dashPredictionResolved(m) {
  if (m && String(m.key || '').indexOf('dm_') === 0 && !dashFixtureFinished(m)) return false;
  if (m.kind === 'team2') return Array.isArray(m.answer) && m.answer.length > 0 && m.answer.every(function (x) { return x != null; });
  return m.answer != null;
}
function dashPickComplete(m, picks) {
  const v = picks ? picks[m.key] : null;
  if (v == null) return false;
  if (m.kind === 'team2') return Array.isArray(v) && v.length === 2;
  if (m.kind === 'number') return v !== '' && isFinite(Number(v));
  return true;
}

function overallRank(me) {
  const rows = Sd.allSync().slice().sort((a, b) => {
    const ta = dashTeam(a.team), tb = dashTeam(b.team);
    if (tb.rounds !== ta.rounds) return tb.rounds - ta.rounds;
    const oa = parseInt(String(ta.odds || '0').replace(/[^0-9]/g, ''), 10);
    const ob = parseInt(String(tb.odds || '0').replace(/[^0-9]/g, ''), 10);
    return (isFinite(oa) ? oa : 999999) - (isFinite(ob) ? ob : 999999);
  });
  const i = rows.findIndex(p => p.id === me.id);
  return { rank: i < 0 ? rows.length : i + 1, total: rows.length };
}

function ProfileHeader(props) {
  const me = (props.me && Sd.getSync && Sd.getSync(props.me.id)) || props.me;
  const includeDept = Sd.includeDepartment ? Sd.includeDepartment() : true;
  const includeLocation = Sd.includeLocation ? Sd.includeLocation() : true;
  const includeLtMember = Sd.includeLtMember ? Sd.includeLtMember() : true;
  const customDefs = Sd.customFields ? Sd.customFields() : [];
  const fav = Sd.favTeam ? Sd.favTeam(me) : null;
  const shown = Sd.shownName ? Sd.shownName(me) : me.name;
  const chips = [];
  if (includeLocation && me.location) chips.push({ text: me.location });
  if (includeDept && me.department) chips.push({ text: me.department });
  if (includeLtMember && me.ltMember) chips.push({ text: 'LT', tone: 'yellow' });
  const shownCustomKeys = {};
  customDefs.forEach(f => {
    shownCustomKeys[f.key] = true;
    const raw = me.customFields && me.customFields[f.key];
    if (f.type === 'tags') {
      (Array.isArray(raw) ? raw : []).forEach(tag => chips.push({ text: tag, tone: 'yellow' }));
    } else if (raw != null && String(raw).trim()) {
      chips.push({ text: f.label + ': ' + String(raw).trim() });
    }
  });
  Object.keys(me.customFields || {}).forEach(key => {
    if (shownCustomKeys[key]) return;
    const raw = me.customFields[key];
    if (Array.isArray(raw)) raw.forEach(tag => chips.push({ text: tag, tone: 'yellow' }));
  });
  const shownChips = chips.slice(0, 10);
  if (chips.length > shownChips.length) shownChips.push({ text: '+' + (chips.length - shownChips.length) });
  return (
    <Cd bordered className="pop">
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <button onClick={props.onEdit} style={{ position: 'relative', border: 'none', background: 'none', padding: 0, cursor: 'pointer', borderRadius: '50%', flex: '0 0 auto' }}>
          <Ad person={Object.assign({}, me, { isYou: false })} size={56} />
          <span style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: '50%', background: 'var(--ink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)', fontSize: 11 }}>✎</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div className="dh" style={{ fontSize: 24, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown}</div>
            {fav && <span title={'Supports ' + fav.name} style={{ fontSize: 20, flex: '0 0 auto' }}>{fav.flag}</span>}
          </div>
          {shownChips.length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            {shownChips.map((c, i) => <Chd key={i} tone={c.tone}>{c.text}</Chd>)}
          </div>}
        </div>
        <button onClick={props.onEdit} className="wc-btn wc-btn--sm" style={{ padding: '8px 12px', boxShadow: '0 4px 0 var(--shadow)', flex: '0 0 auto' }}>Edit</button>
      </div>
      <div style={{ marginTop: 12 }}>
        <window.Badges person={me} max={4} />
      </div>
    </Cd>
  );
}

function PasswordSection(props) {
  const me = props.me;
  const has = Sd.hasPassword ? Sd.hasPassword(me) : false;
  const [open, setOpen] = dState(false);
  const [cur, setCur] = dState('');
  const [pw1, setPw1] = dState('');
  const [busy, setBusy] = dState(false);
  const [msg, setMsg] = dState('');
  const lbl = { fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)' };
  const fld = { width: '100%', boxSizing: 'border-box', border: '2.5px solid var(--ink)', borderRadius: 12, padding: '11px 13px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 15, outline: 'none' };
  function done(toast, mood) {
    setBusy(false); setOpen(false); setCur(''); setPw1(''); setMsg('');
    if (window.wcToast) window.wcToast(toast, mood || 'confident');
  }
  function save() {
    if (busy) return;
    if (pw1.length < 4) { setMsg('Use at least 4 characters.'); return; }
    setBusy(true); setMsg('');
    Promise.resolve(Sd.setAccountPassword(me.id, { newPassword: pw1, currentPassword: cur }))
      .then(() => done(has ? 'Password updated.' : 'Password set — your entry is locked to you now.'))
      .catch(e => { setBusy(false); setMsg((e && e.message) || 'Could not save.'); });
  }
  function remove() {
    if (busy) return;
    setBusy(true); setMsg('');
    Promise.resolve(Sd.setAccountPassword(me.id, { newPassword: '', currentPassword: cur }))
      .then(() => done('Password removed.', 'neutral'))
      .catch(e => { setBusy(false); setMsg((e && e.message) || 'Could not remove.'); });
  }
  return (
    <div style={{ borderTop: '1.5px solid var(--line)', paddingTop: 14, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={lbl}>Password {has ? <span style={{ color: 'var(--green)' }}>· on 🔒</span> : <span style={{ color: 'var(--ink2)' }}>· off</span>}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 3, lineHeight: 1.35 }}>{has ? 'Only someone with the password can claim or edit your entry on a new device.' : 'Optional — lock your entry so only you can claim or edit it elsewhere.'}</div>
        </div>
        <button onClick={() => setOpen(o => !o)} className="wc-btn wc-btn--sm" style={{ boxShadow: '0 4px 0 var(--shadow)', flex: '0 0 auto' }}>{open ? 'Close' : has ? 'Change' : 'Set up'}</button>
      </div>
      {open && <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {has && <input type="password" style={fld} value={cur} onChange={e => setCur(e.target.value)} placeholder="Current password" />}
        <input type="password" style={fld} value={pw1} onChange={e => setPw1(e.target.value)} placeholder={has ? 'New password' : 'Choose a password'} />
        {msg && <div style={{ color: 'var(--red)', fontWeight: 800, fontSize: 12 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Bd variant="ink" sm onClick={save} style={{ flex: 1 }}>{busy ? 'Saving…' : 'Save password'}</Bd>
          {has && <button onClick={remove} disabled={busy} className="wc-btn wc-btn--sm" style={{ background: '#fff', color: 'var(--red)', boxShadow: '0 4px 0 var(--shadow)' }}>Remove</button>}
        </div>
      </div>}
    </div>
  );
}

function GoogleSection(props) {
  const me = props.me;
  const hasLink = !!(me && me.hasGoogleLink);
  const [busy, setBusy] = dState(false);
  const lbl = { fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)' };
  function onLinkToken(token) {
    setBusy(true);
    Promise.resolve(Sd.googleLink(me.id, token))
      .then(r => {
        setBusy(false);
        if (r && r.avatarVersion != null) {
          // Avatar may have been refreshed from Google photo — reload.
          Sd.refresh && Sd.refresh();
        }
        window.wcToast && window.wcToast('Google account linked. Sign in anywhere with Google now.', 'happy');
      })
      .catch(() => setBusy(false));
  }
  function unlink() {
    if (busy) return;
    setBusy(true);
    Promise.resolve(Sd.googleUnlink(me.id))
      .then(() => setBusy(false))
      .catch(() => setBusy(false));
  }
  if (!window.WC_GOOGLE_CLIENT_ID || !Sd.googleLink) return null;
  return (
    <div style={{ borderTop: '1.5px solid var(--line)', paddingTop: 14, marginTop: 4 }}>
      <div style={lbl}>Google account{' '}
        {hasLink ? <span style={{ color: 'var(--green)' }}>· linked ✓</span> : <span style={{ color: 'var(--ink2)' }}>· not linked</span>}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 3, lineHeight: 1.35 }}>
        {hasLink ? 'Sign in with Google on any device — no password needed.' : 'Link your Google account to sign in anywhere without a password.'}
      </div>
      {hasLink
        ? <button onClick={unlink} disabled={busy} className="wc-btn wc-btn--sm" style={{ marginTop: 10, boxShadow: '0 4px 0 var(--shadow)', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Working…' : 'Unlink Google'}
          </button>
        : <window.GoogleSignInButton onToken={onLinkToken} opts={{ text: 'continue_with', size: 'medium', theme: 'outline' }} />
      }
    </div>
  );
}

function EditProfile(props) {
  const me = props.me;
  const [dispName, setDispName] = dState(me.displayName || '');
  const [fav, setFav] = dState(me.favouriteTeam || '');
  const [dept, setDept] = dState(me.department || '');
  const [lt, setLt] = dState(!!me.ltMember);
  const [busy, setBusy] = dState(false);
  const fileRef = React.useRef(null);
  const includeDept = Sd.includeDepartment ? Sd.includeDepartment() : true;
  const includeLocation = Sd.includeLocation ? Sd.includeLocation() : true;
  const includeLtMember = Sd.includeLtMember ? Sd.includeLtMember() : true;
  const locationOpts = Sd.locations ? Sd.locations() : ['Edinburgh', 'London'];
  const locationsFreeText = Sd.locationsFreeText ? Sd.locationsFreeText() : false;
  const customDefs = Sd.customFields ? Sd.customFields() : [];
  const [customFields, setCustomFields] = dState(me.customFields || {});
  const [loc, setLoc] = dState(me.location || locationOpts[0] || 'Edinburgh');
  const hasPhoto = !!(Sd.avatarUrl && Sd.avatarUrl(me));
  const fld = { width: '100%', boxSizing: 'border-box', border: '2.5px solid var(--ink)', borderRadius: 12, padding: '11px 13px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 15, marginTop: 6, outline: 'none' };
  const lbl = { fontWeight: 800, fontSize: 13, fontFamily: 'var(--disp)' };
  function seg(val, set, opts) {
    return <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>{opts.map(o =>
      <button key={String(o.value)} onClick={() => set(o.value)} className="wc-btn wc-btn--sm" style={{ flex: 1, background: val === o.value ? 'var(--yellow)' : '#fff', boxShadow: val === o.value ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>{o.label}</button>)}</div>;
  }
  function customInput(f) {
    const val = customFields[f.key] || '';
    const set = v => setCustomFields(Object.assign({}, customFields, { [f.key]: v }));
    const options = f.options || [];
    if (f.type === 'select') {
      return <select style={fld} value={val} onChange={e => set(e.target.value)}>
        <option value="">{f.required ? 'Choose one' : 'Optional'}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>;
    }
    if (f.type === 'suggest') {
      const id = 'wh-edit-custom-' + f.key;
      return <>
        <input style={fld} value={val} onChange={e => set(e.target.value)} placeholder="optional" maxLength={80} list={id} />
        <datalist id={id}>{options.map(o => <option key={o} value={o} />)}</datalist>
      </>;
    }
    if (f.type === 'tags') {
      const selected = Array.isArray(customFields[f.key]) ? customFields[f.key] : [];
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
    return <input style={fld} value={val} onChange={e => set(e.target.value)} placeholder="optional" maxLength={80} />;
  }
  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    resizeToDataUrl(f, 256, function (durl) {
      if (durl) {
        Sd.uploadAvatar(me.id, durl);
        if (window.wcHaptic) window.wcHaptic('success');
      } else if (window.wcToast) {
        window.wcToast("That image wouldn't load. Try another.", 'crying');
      }
      setBusy(false);
    });
  }
  const teamOpts = (WCd.TEAM_LIST || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const chrome = window.wcSheetChrome(70);
  const wrapStyle = Object.assign({}, chrome.wrap, { height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' });
  const sheetStyle = Object.assign({}, chrome.sheet, { paddingBottom: 0 });
  const saveBarStyle = {
    position: 'sticky', bottom: 0, zIndex: 2, margin: '18px -18px 0',
    padding: '12px 18px calc(14px + env(safe-area-inset-bottom))',
    background: 'var(--bg)', borderTop: '2px solid var(--line)',
    boxShadow: '0 -12px 24px rgba(26,26,26,.08)'
  };
  if (chrome.deck) {
    saveBarStyle.margin = '18px -22px 0';
    saveBarStyle.padding = '12px 22px 16px';
    saveBarStyle.borderRadius = '0 0 22px 22px';
  }
  return (
    <div style={wrapStyle}>
      <div onClick={props.onClose} style={chrome.backdrop} />
      <div className={chrome.cls} style={sheetStyle}>
        {!chrome.deck && <div style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--line)', margin: '0 auto 14px' }} />}
        <div className="dh" style={{ fontSize: 22, marginBottom: 14 }}>Edit your profile</div>

        {/* ---- avatar ---- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <Ad person={Object.assign({}, me, { isYou: false })} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} className="wc-btn wc-btn--sm" style={{ boxShadow: '0 4px 0 var(--shadow)', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Working…' : hasPhoto ? 'Change photo' : 'Upload photo'}
            </button>
            {hasPhoto && <button onClick={() => Sd.removeAvatar(me.id)} style={{ marginLeft: 9, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 800, color: 'var(--ink2)' }}>Remove</button>}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.35 }}>Square works best. No photo? Your initials stay.</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <label style={lbl}>Display name</label>
            <input style={fld} value={dispName} onChange={e => setDispName(e.target.value)} placeholder={me.name} maxLength={40} />
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 5 }}>Shown to everyone. The organiser still sees your full name: <b>{me.name}</b>.</div>
          </div>
          <div>
            <label style={lbl}>Favourite team</label>
            <select style={fld} value={fav} onChange={e => setFav(e.target.value)}>
              <option value="">— none —</option>
              {teamOpts.map(t => <option key={t.code} value={t.code}>{t.flag + ' ' + t.name}</option>)}
            </select>
          </div>
          {includeDept && <div><label style={lbl}>Team / department</label><input style={fld} value={dept} onChange={e => setDept(e.target.value)} placeholder="optional" /></div>}
          {includeLocation && <div>
            <label style={lbl}>Location</label>
            {locationsFreeText
              ? <>
                  <input style={fld} value={loc} onChange={e => setLoc(e.target.value)} placeholder="Your office or location" list="wh-locs-edit" />
                  <datalist id="wh-locs-edit">{locationOpts.map(l => <option key={l} value={l} />)}</datalist>
                </>
              : locationOpts.length <= 3
                ? seg(loc, setLoc, locationOpts.map(l => ({ value: l, label: l })))
                : <select style={fld} value={loc} onChange={e => setLoc(e.target.value)}>
                    {locationOpts.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
            }
          </div>}
          {includeLtMember && <div><label style={lbl}>Leadership Team?</label>{seg(lt, setLt, [{ value: false, label: 'No' }, { value: true, label: 'Yes' }])}</div>}
          {customDefs.map(f => <div key={f.key}>
            <label style={lbl}>{f.label}{f.required && <span style={{ color: 'var(--ink2)', fontWeight: 600 }}> · required</span>}</label>
            {customInput(f)}
          </div>)}
        </div>
        <PasswordSection me={me} />
        <GoogleSection me={me} />
        <div style={saveBarStyle}>
          <Bd variant="ink" block onClick={() => {
            Sd.saveProfile(me.id, { displayName: dispName.trim(), favouriteTeam: fav });
            // Keep the base name untouched (organiser's record); only details change.
            Sd.update(me.id, {
              name: me.name,
              department: includeDept ? dept.trim() : me.department,
              location: includeLocation ? loc : me.location,
              city: includeLocation ? loc : me.city,
              ltMember: includeLtMember ? lt : me.ltMember,
              leadership: includeLtMember ? lt : me.leadership,
              customFields: customFields,
            });
            props.onClose();
          }}>Save</Bd>
        </div>
      </div>
    </div>
  );
}

function TeamCard(props) {
  const me = props.me; const t = dashTeam(me.team);
  const nextTie = (WCd.R16 || []).find(x => (x.a === me.team || x.b === me.team) && !x.done);
  const opp = nextTie ? WCd.TEAMS[nextTie.a === me.team ? nextTie.b : nextTie.a] : null;
  const pre = PRE();
  const nextFix = (WCd.FIXTURES || []).find(f => (f.a === me.team || f.b === me.team) && !dashFixtureFinished(f));
  const fixOpp = nextFix ? WCd.TEAMS[nextFix.a === me.team ? nextFix.b : nextFix.a] : null;
  return (
    <Cd bordered className="pop" style={t.alive ? null : { background: 'var(--ink)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 58, lineHeight: 1, opacity: t.alive ? 1 : .5, filter: t.alive ? 'none' : 'grayscale(1)' }}><Fd team={t} size={58} /></div>
        <div style={{ flex: 1 }}>
          <span className="dh" style={{ fontSize: 28, color: t.alive ? 'var(--ink)' : '#fff', textDecoration: t.alive ? 'none' : 'line-through', textDecorationColor: 'var(--red)' }}>{t.name}</span>
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            <Chd tone="yellow">Group {t.group}</Chd>
            {t.alive ? <Chd tone="green">{stageName(t)}</Chd> : <Std tone="red" rotate={-6}>ELIMINATED</Std>}
            <Chd style={t.alive ? null : { background: 'transparent', color: '#fff' }}>Odds {t.odds}</Chd>
          </div>
        </div>
        {t.alive && !pre && <PRd value={t.rounds / 6} size={54} stroke={7} color={t.stage === 'qf' ? 'var(--green)' : 'var(--yellow)'}><span style={{ fontSize: 11 }}>{t.code}</span></PRd>}
      </div>
      {pre && nextFix && fixOpp &&
        <button onClick={props.onGames} style={{ width: '100%', marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ink)', border: 'none', borderRadius: 14, padding: '11px 14px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--yellow)' }}>YOUR FIRST GAME · {nextFix.dateLabel} · {nextFix.time}</div>
            <div className="dh" style={{ fontSize: 18, marginTop: 2 }}>{t.name} <span style={{ opacity: .5 }}>v</span> {fixOpp.name} {fixOpp.flag}</div>
          </div>
          <span className="dh" style={{ fontSize: 20 }}>→</span>
        </button>}
      {pre && !nextFix &&
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 14, padding: '11px 14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--ink2)' }}>NOT A BALL KICKED YET</div>
            <div className="dh" style={{ fontSize: 16, marginTop: 2 }}>Group {t.group} gets underway {WCd.meta.kickoff || 'soon'}.</div>
          </div>
          <span style={{ fontSize: 22 }}>⚽</span>
        </div>}
      {t.alive && !pre && nextTie && opp &&
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ink)', borderRadius: 14, padding: '11px 14px', color: '#fff' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--yellow)' }}>YOUR NEXT TIE · {nextTie.note}</div>
            <div className="dh" style={{ fontSize: 18, marginTop: 2 }}>{t.name} <span style={{ opacity: .5 }}>vs</span> {opp.name} {opp.flag}</div>
          </div>
          <span className="flame" style={{ fontSize: 24 }}>🔥</span>
        </div>}
    </Cd>
  );
}

function GroupRivalCard(props) {
  const me = props.me;
  const comp = window.WheeshtCompetition;
  const t = dashTeam(me.team);
  if (!comp || !t || !t.group) return null;
  const G = comp.groupModel(t.group);
  const meRow = G.ranked.find(r => r.code === t.code);
  if (!meRow) return null;
  const above = G.ranked.find(r => r.pos === meRow.pos - 1);
  const below = G.ranked.find(r => r.pos === meRow.pos + 1);
  const next = G.fixtures.filter(f => (f.a === t.code || f.b === t.code) && comp.compFixturePlayable(f)).sort(comp.compFixtureSort)[0];
  const opp = next ? WCd.TEAMS[next.a === t.code ? next.b : next.a] : null;
  const gapAbove = above ? Math.max(0, above.Pts - meRow.Pts) : 0;
  const gapBelow = below ? Math.max(0, meRow.Pts - below.Pts) : 0;
  return (
    <Cd bordered style={{ background: 'var(--ink)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.07em', color: 'var(--yellow)', textTransform: 'uppercase' }}>Group {t.group} pressure</div>
          <div className="dh" style={{ fontSize: 24, color: '#fff', lineHeight: 1, marginTop: 3 }}>#{meRow.pos}<span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)' }}>/{G.ranked.length}</span> · {G.hasResults ? meRow.Pts + ' pts' : 'awaiting kick-off'}</div>
        </div>
        <button onClick={props.onOpen} className="wc-btn wc-btn--sm" style={{ flex: '0 0 auto', background: 'var(--yellow)', boxShadow: '0 3px 0 #000' }}>Open group</button>
      </div>
      {(above || below) && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '9px 10px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.05em', color: '#ffb3b4' }}>TO CATCH</div>
          <div style={{ fontSize: 13, fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{above ? above.team.name + ' +' + gapAbove : 'Nobody'}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '9px 10px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.05em', color: '#9be8b8' }}>CHASING YOU</div>
          <div style={{ fontSize: 13, fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{below ? below.team.name + (gapBelow ? ' -' + gapBelow : ' level') : 'Nobody'}</div>
        </div>
      </div>}
      {next && opp && <div style={{ marginTop: 10, fontSize: 12.2, fontWeight: 750, color: 'rgba(255,255,255,.72)', lineHeight: 1.35 }}>
        Next swing: {t.name} v {opp.name} · {next.dateLabel} {next.time}. This is where the table can move.
      </div>}
    </Cd>
  );
}

function PredCard(props) {
  const me = props.me;
  const score = Sd.predScoreOf(me); const max = Sd.maxPredPoints();
  const ranked = Sd.rankedByPred(); const meR = ranked.find(p => p.id === me.id);
  const rank = meR ? meR.predRank : ranked.length;
  const submitted = Sd.madeVisiblePredictions ? Sd.madeVisiblePredictions(me) : (me.picks ? Object.keys(me.picks).length : 0);
  const markets = Sd.visiblePredictions ? Sd.visiblePredictions() : (WCd.predictions || Sd.PREDICTIONS);
  const countableMarkets = dashCountableMarkets(me, markets);
  const totalMkts = countableMarkets.length;
  const openLeft = countableMarkets.filter(m => !dashPredictionResolved(m) && !dashPickComplete(m, me.picks || {})).length;
  const locked = Sd.predictionsLocked ? Sd.predictionsLocked() : !!WCd.meta.predictionsLocked;
  const note = locked
    ? 'Locked in. Time to pretend you were confident all along.'
    : openLeft
      ? openLeft + ' prediction' + (openLeft === 1 ? '' : 's') + ' left. Easy points only if you actually submit them.'
      : 'Full card in. You may now judge everyone else professionally.';
  return (
    <Cd>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="dh" style={{ fontSize: 18 }}>Your predictions</div>
        {locked ? <Chd tone="red">Locked</Chd> : <Chd tone="green">Open</Chd>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
        {[['Score', score + ' pts'], ['Rank', '#' + rank], ['Made', submitted + '/' + totalMkts]].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 13, padding: '10px 8px', textAlign: 'center' }}>
            <div className="dh" style={{ fontSize: 22, color: i === 0 ? 'var(--green)' : 'var(--ink)' }}>{s[1]}</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink2)' }}>{s[0]}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', lineHeight: 1.35 }}>
        {note}
      </div>
      <div style={{ marginTop: 11 }}>
        <Bd variant="primary" block sm onClick={props.onOpen}>{openLeft > 0 && !locked ? 'Finish your predictions →' : 'See my predictions →'}</Bd>
      </div>
    </Cd>
  );
}

function WinningsCard(props) {
  const me = props.me; const t = dashTeam(me.team);
  const pot = Sd.pot ? Sd.pot() : (WCd.POT * 0.5);
  const charity = Sd.charity ? Sd.charity() : (WCd.POT * 0.5);
  const split = Sd.charitySplit ? Sd.charitySplit() : 0.5;
  const splitPct = Math.round(split * 100);
  const allCharity = charity > 0 && pot <= 0;   // 100% of the pot to charity
  const allWinner = charity <= 0 && pot > 0;    // 100% of the pot to the winner
  const charityLabel = 'To charity (' + splitPct + '% of every entry)';
  const headTitle = allCharity ? 'Charity pot — every entry, donated' : ('Winner fund — if ' + t.name + ' lift the cup');
  const headVal = allCharity ? charity : pot;
  const headColor = allCharity ? 'var(--red)' : 'var(--green)';
  const ov = overallRank(me);
  const rankTaps = React.useRef({n:0,t:0});
  function rankTap(){
    const now = Date.now();
    rankTaps.current.n = (now - rankTaps.current.t < 1200) ? rankTaps.current.n + 1 : 1;
    rankTaps.current.t = now;
    if(rankTaps.current.n >= 3){ rankTaps.current.n = 0; window.__wheeshtEgg2 && window.__wheeshtEgg2(); }
  }
  return (
    <Cd bordered>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink2)' }}>{headTitle}</div>
          <div className="dh" style={{ fontSize: 38, color: headColor, lineHeight: 1, marginTop: 2 }}>{money_d(headVal)}</div>
        </div>
        <div onClick={rankTap} style={{ textAlign: 'right', background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 12, padding: '7px 11px', cursor: 'default' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: 'var(--ink2)' }}>OVERALL</div>
          <div className="dh" style={{ fontSize: 22 }}>#{ov.rank}<span style={{ fontSize: 13, color: 'var(--ink2)' }}>/{ov.total}</span></div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {!allCharity && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, opacity: t.alive ? 1 : .4 }}>
          <span style={{ flex: 1 }}>🏆 Champion (one winner){allWinner ? ' — the whole pot' : ''}</span>
          {t.alive ? <Chd tone="ghost" style={{ borderStyle: 'dashed' }}>still in</Chd> : <span style={{ fontSize: 11, color: 'var(--ink2)' }}>out</span>}
          <span className="dh" style={{ fontSize: 15, width: 64, textAlign: 'right' }}>{money_d(pot)}</span>
        </div>
        )}
        {!allWinner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, background: 'var(--bg)', borderRadius: 10, padding: '8px 10px', marginTop: 2 }}>
          <span style={{ fontSize: 16 }}>❤️</span>
          <span style={{ flex: 1 }}>{allCharity ? 'Every entry goes to charity' : charityLabel}</span>
          <span className="dh" style={{ fontSize: 15, width: 64, textAlign: 'right', color: 'var(--red)' }}>{money_d(charity)}</span>
        </div>
        )}
      </div>
    </Cd>
  );
}

function ActivityFeed(props) {
  const me = props.me; const t = dashTeam(me.team);
  const pre = PRE();
  const items = [];
  if (pre) {
    const submitted = Sd.madeVisiblePredictions ? Sd.madeVisiblePredictions(me) : (me.picks ? Object.keys(me.picks).length : 0);
    const markets = Sd.visiblePredictions ? Sd.visiblePredictions() : (WCd.predictions || Sd.PREDICTIONS);
    const totalMkts = dashCountableMarkets(me, markets).length;
    items.push({ m: 'confident', t: 'You drew ' + t.name + ' ' + t.flag, d: 'Group ' + t.group + '. Locked in. May the football gods be kind.', when: 'just now' });
    if (submitted < totalMkts) items.push({ m: 'mischievous', t: 'Predictions are open', d: (totalMkts - submitted) + ' still to call before kick-off. Get them in.', when: 'now' });
    else items.push({ m: 'happy', t: 'All predictions in', d: 'Every market called. Wheesht has them in writing.', when: 'now' });
    items.push({ m: 'broadcast', t: 'Tournament is underway', d: 'The first whistle has gone. Wheesht is taking notes.', when: 'live' });
    items.push({ m: 'neutral', t: 'You entered the sweepstake', d: 'Buy-in confirmed. ' + money_d(WCd.FEE) + ' in the pot. Welcome aboard.', when: 'on joining' });
  } else {
    if (!t.alive) items.push({ m: 'crying', t: t.name + ' knocked out', d: stageName(t) + ' — your run ends here. The side game awaits.', when: '2h ago' });
    else items.push({ m: 'confident', t: t.name + ' still standing', d: 'Through to the ' + stageName(t).toLowerCase() + '. Wheesht is quietly impressed.', when: '2h ago' });
    items.push({ m: 'broadcast', t: 'You entered the sweepstake', d: 'Buy-in confirmed. ' + money_d(WCd.FEE) + ' in the pot. Welcome aboard.', when: 'on joining' });
  }
  return (
    <Cd flat style={{ padding: '6px 14px' }}>
      {items.map((n, i) => (
        <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0', borderBottom: i < items.length - 1 ? '1.5px solid var(--line)' : 'none' }}>
          <Wd mood={n.m} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dh" style={{ fontSize: 15 }}>{n.t}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', lineHeight: 1.3 }}>{n.d}</div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{n.when}</span>
        </div>
      ))}
    </Cd>
  );
}

function MeScreen(props) {
  const me = Sd.active();
  const [edit, setEdit] = dState(false);
  if (!me) return null;
  const t = dashTeam(me.team);
  const pre = PRE();
  const greetMood = pre ? 'happy' : (t.alive ? 'happy' : 'crying');
  return (
    <div className="pad">
      <ProfileHeader me={me} onEdit={() => setEdit(true)} />
      <div style={{ height: 12 }} />
      <Saysd mood={greetMood} label={'hey ' + (Sd.shownName ? Sd.shownName(me) : me.name).split(' ')[0]} animate>
        {pre ? <>You've drawn {t.name}. No games yet — get your predictions in while the slate's clean.</> : (t.alive ? <>{t.name} are still standing. Keep your predictions sharp — the pot's in play.</> : <>Your team is out, but the predictions league is still live. Wheesht isn't done with you yet.</>)}
      </Saysd>
      <SHd>Your team</SHd>
      <TeamCard me={me} onGames={props.goGames} />
      <SHd aside="who to beat">Your group</SHd>
      <GroupRivalCard me={me} onOpen={props.goGroup} />
      <SHd aside={(Sd.predictionsLocked && Sd.predictionsLocked()) ? 'locked' : 'open'}>Predictions</SHd>
      <PredCard me={me} onOpen={props.goPredictions} />
      <SHd>{pre ? 'Potential winnings' : 'Results & winnings'}</SHd>
      <WinningsCard me={me} />
      <SHd aside="latest first">Activity</SHd>
      <ActivityFeed me={me} />
      {edit && <EditProfile me={me} onClose={() => setEdit(false)} />}
    </div>
  );
}

window.MeScreen = MeScreen;
