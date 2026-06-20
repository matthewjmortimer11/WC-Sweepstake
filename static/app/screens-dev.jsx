/* ===========================================================================
   DEV CONSOLE — hidden cross-league admin.

   Reached by a secret gesture (tap the top-bar mascot seven times). Verifies a
   master developer key SERVER-side (never shipped to the browser), then lists
   every league so the developer can drop into any one and open its organiser
   clipboard. Choosing a league switches the active league and opens AdminGate;
   the caller restores the previous league when the clipboard closes.
   =========================================================================== */
const Wdev = window.Wheesht;
const Sdev = window.Store;
const { useState: devState } = React;

function DevConsole(props) {
  const [step, setStep] = devState('auth');     // auth | list
  const [key, setKey] = devState('');
  const [leagues, setLeagues] = devState([]);
  const [q, setQ] = devState('');
  const [busy, setBusy] = devState(false);
  const [err, setErr] = devState(false);
  const [deleteTarget, setDeleteTarget] = devState(null);
  const [deleteCode, setDeleteCode] = devState('');
  const [deleteName, setDeleteName] = devState('');
  const [deleteBusy, setDeleteBusy] = devState(false);
  const [deleteErr, setDeleteErr] = devState('');
  const [proBusy, setProBusy] = devState({});

  function authenticate() {
    if (!key.trim() || busy) return;
    setBusy(true); setErr(false);
    Sdev.devListLeagues(key.trim()).then(function (j) {
      setLeagues((j && j.leagues) || []);
      setStep('list');
      setBusy(false);
    }).catch(function () { setErr(true); setBusy(false); setKey(''); });
  }

  function refreshLeagues() {
    return Sdev.devListLeagues(key.trim()).then(function (j) {
      setLeagues((j && j.leagues) || []);
      return j;
    });
  }

  function togglePro(L) {
    if (proBusy[L.code]) return;
    var revoke = L.proStatus === 'pro';
    setProBusy(function (p) { return Object.assign({}, p, { [L.code]: true }); });
    Sdev.devGrantPro(key.trim(), L.code, revoke).then(function (j) {
      setLeagues(function (prev) {
        return prev.map(function (x) { return x.code === L.code ? Object.assign({}, x, { proStatus: j.proStatus, hasPro: j.proStatus === 'pro' }) : x; });
      });
      setProBusy(function (p) { return Object.assign({}, p, { [L.code]: false }); });
    }).catch(function () {
      setProBusy(function (p) { return Object.assign({}, p, { [L.code]: false }); });
    });
  }

  function openDelete(L) {
    setDeleteTarget(L);
    setDeleteCode('');
    setDeleteName('');
    setDeleteErr('');
  }

  function deleteLeague() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true); setDeleteErr('');
    Sdev.devDeleteLeague(key.trim(), deleteTarget, deleteCode, deleteName).then(function () {
      setDeleteBusy(false);
      setDeleteTarget(null);
      setDeleteCode('');
      setDeleteName('');
      return refreshLeagues();
    }).catch(function (e) {
      setDeleteBusy(false);
      setDeleteErr((e && e.message) || 'Could not delete league.');
    });
  }

  const fld = {
    width: '100%', border: '2.5px solid var(--ink)', borderRadius: 14, padding: '13px 16px',
    fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 20, textAlign: 'center',
    letterSpacing: '.06em', marginTop: 14, outline: 'none', background: '#fff',
  };

  const close = (
    <button onClick={props.onClose} style={{ position: 'absolute', top: 16, right: 16, border: 'none', background: 'var(--ink)', color: '#fff', width: 34, height: 34, borderRadius: 10, fontSize: 18, fontWeight: 900, cursor: 'pointer', zIndex: 2 }}>✕</button>
  );

  if (step === 'auth') {
    return (
      <div className="moment ink" style={{ alignItems: 'center', justifyContent: 'center', padding: '0 26px' }}>
        {close}
        <div className={'rise' + (err ? ' shake' : '')} style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
          <Wdev mood={err ? 'shocked' : 'mischievous'} size={92} animate />
          <div className="dh" style={{ fontSize: 24, marginTop: 10, color: '#fff' }}>Developer console</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#b8af9e', marginTop: 6, lineHeight: 1.45 }}>
            {err ? 'Wrong key. Wheesht guards the master clipboard closely.' : 'The master key. This opens every league on the server.'}
          </div>
          <input
            autoFocus type="password" value={key}
            onChange={function (e) { setKey(e.target.value); setErr(false); }}
            onKeyDown={function (e) { if (e.key === 'Enter') authenticate(); }}
            placeholder="Master key" style={fld}
          />
          <button onClick={authenticate} disabled={!key.trim() || busy} className="wc-btn wc-btn--primary wc-btn--block" style={{ marginTop: 14, opacity: key.trim() && !busy ? 1 : 0.4 }}>
            {busy ? 'Checking…' : 'Unlock every league'}
          </button>
        </div>
      </div>
    );
  }

  const term = q.trim().toLowerCase();
  const shown = term
    ? leagues.filter(function (L) { return (L.name || '').toLowerCase().indexOf(term) >= 0 || (L.code || '').toLowerCase().indexOf(term) >= 0; })
    : leagues;
  const deleteReady = deleteTarget && deleteCode.trim().toUpperCase() === deleteTarget.code && deleteName.trim() === deleteTarget.name;

  return (
    <div className="moment" style={{ background: 'var(--bg)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--ink)', color: '#fff', padding: '16px 18px 12px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <Wdev mood="confident" size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dh" style={{ fontSize: 20, color: '#fff', lineHeight: 1 }}>Developer console</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--yellow)' }}>{leagues.length} league{leagues.length === 1 ? '' : 's'} on the server</div>
        </div>
        <button onClick={props.onClose} style={{ border: 'none', background: 'rgba(255,255,255,.16)', color: '#fff', width: 34, height: 34, borderRadius: 10, fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>✕</button>
      </div>

      <div className="mscroll" style={{ padding: '14px 18px 30px' }}>
        <input
          value={q} onChange={function (e) { setQ(e.target.value); }}
          placeholder="Search by name or code…"
          style={{ width: '100%', border: '2px solid var(--line)', borderRadius: 12, padding: '11px 14px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 14, background: '#fff', outline: 'none', marginBottom: 14 }}
        />

        {shown.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink2)', fontWeight: 600, fontSize: 13.5 }}>
            <Wdev mood="neutral" size={56} animate />
            <div style={{ marginTop: 8 }}>No leagues match.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map(function (L) {
            return (
              <div key={L.code} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '2.5px solid var(--ink)', borderRadius: 16, padding: '12px 13px', boxShadow: '0 4px 0 var(--shadow)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dh" style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{L.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="wc-chip" style={{ fontSize: 11 }}>{L.code}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>{L.entrants} entrant{L.entrants === 1 ? '' : 's'}</span>
                    {L.seeded && <span className="wc-chip wc-chip--yellow" style={{ fontSize: 10.5 }}>seeded</span>}
                    {L.proStatus === 'pro' && <span className="wc-chip wc-chip--yellow" style={{ fontSize: 10.5 }}>⚡ Pro</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto' }}>
                  <button onClick={function () { props.onAdmin(L); }} className="wc-btn wc-btn--sm wc-btn--ink">Administer →</button>
                  <button
                    onClick={function () { togglePro(L); }}
                    disabled={!!proBusy[L.code]}
                    className="wc-btn wc-btn--sm"
                    style={{ background: L.proStatus === 'pro' ? '#fff' : 'var(--yellow)', color: 'var(--ink)', boxShadow: '0 4px 0 var(--shadow)', opacity: proBusy[L.code] ? 0.5 : 1 }}
                  >
                    {proBusy[L.code] ? '…' : L.proStatus === 'pro' ? 'Revoke Pro' : '⚡ Grant Pro'}
                  </button>
                  <button onClick={function () { openDelete(L); }} className="wc-btn wc-btn--sm" style={{ background: '#fff', boxShadow: '0 4px 0 var(--shadow)', color: 'var(--red)' }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {deleteTarget && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(26,26,26,.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <div className="wc-card wc-card--bd" style={{ width: '100%', maxWidth: 360, background: '#fff' }}>
            <div className="dh" style={{ fontSize: 22, color: 'var(--red)' }}>Delete league?</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', lineHeight: 1.4, marginTop: 6 }}>
              This permanently removes <b>{deleteTarget.name}</b>, its entrants, chat, profiles and organiser settings. Type both values exactly.
            </div>
            <label style={{ display: 'block', marginTop: 14, fontSize: 12, fontWeight: 900, fontFamily: 'var(--disp)' }}>League code</label>
            <input value={deleteCode} onChange={function (e) { setDeleteCode(e.target.value); setDeleteErr(''); }}
              placeholder={deleteTarget.code}
              style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 11, padding: '10px 12px', fontFamily: 'var(--body)', fontWeight: 700, fontSize: 14, outline: 'none', textTransform: 'uppercase', marginTop: 5 }} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 900, fontFamily: 'var(--disp)' }}>League name</label>
            <input value={deleteName} onChange={function (e) { setDeleteName(e.target.value); setDeleteErr(''); }}
              placeholder={deleteTarget.name}
              style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 11, padding: '10px 12px', fontFamily: 'var(--body)', fontWeight: 700, fontSize: 14, outline: 'none', marginTop: 5 }} />
            {deleteErr && <div style={{ marginTop: 9, color: 'var(--red)', fontSize: 12.5, fontWeight: 800 }}>{deleteErr}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 15 }}>
              <button onClick={function () { setDeleteTarget(null); }} className="wc-btn wc-btn--sm" style={{ flex: 1, background: '#fff' }}>Cancel</button>
              <button onClick={deleteLeague} disabled={!deleteReady || deleteBusy} className="wc-btn wc-btn--sm wc-btn--red" style={{ flex: 1, opacity: deleteReady && !deleteBusy ? 1 : .4 }}>
                {deleteBusy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.DevConsole = DevConsole;
