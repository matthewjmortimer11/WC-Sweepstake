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

  function authenticate() {
    if (!key.trim() || busy) return;
    setBusy(true); setErr(false);
    Sdev.devListLeagues(key.trim()).then(function (j) {
      setLeagues((j && j.leagues) || []);
      setStep('list');
      setBusy(false);
    }).catch(function () { setErr(true); setBusy(false); setKey(''); });
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
                  </div>
                </div>
                <button onClick={function () { props.onAdmin(L); }} className="wc-btn wc-btn--sm wc-btn--ink" style={{ flex: '0 0 auto' }}>Administer →</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.DevConsole = DevConsole;
