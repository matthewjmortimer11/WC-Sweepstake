/* ===========================================================================
   WHAT IF — match impact simulator.

   Opens as a full-screen overlay from Match Centre. Pick a scenario
   (A wins / Draw / B wins) to instantly see the hypothetical group table,
   sweepstake position changes, biggest winner and loser, and which
   prediction markets are still alive for these teams.

   All client-side, read-only. wi-prefixed to stay collision-free.
   =========================================================================== */
const WCwi = window.WC;
const Swi = window.Store;
const Wwi = window.Wheesht;
const { Card: Cwi, Flag: Fwi, Chip: Chwi, SectionHead: SHwi } = window;
const { useState: wiState } = React;

function wiTeam(code) {
  return WCwi.TEAMS[code] || { code: code || 'TBD', name: code || 'TBD', flag: '🏳️', group: '?' };
}
function wiDone(f) {
  const st = String((f && f.status) || '').toLowerCase();
  return ['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(st) >= 0;
}

function wiTally(teams, fixtures) {
  const rec = {};
  teams.forEach(t => { rec[t.code] = { code: t.code, team: t, Pts: 0, GF: 0, GA: 0, P: 0 }; });
  fixtures.forEach(f => {
    if (!f.score || f.score[0] == null || f.score[1] == null) return;
    const A = rec[f.a], B = rec[f.b]; if (!A || !B) return;
    const ga = f.score[0], gb = f.score[1];
    A.P++; B.P++; A.GF += ga; A.GA += gb; B.GF += gb; B.GA += ga;
    if (ga > gb) A.Pts += 3; else if (gb > ga) B.Pts += 3; else { A.Pts++; B.Pts++; }
  });
  const ranked = Object.keys(rec).map(k => rec[k]).sort((a, b) => {
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;
    const gda = a.GF - a.GA, gdb = b.GF - b.GA;
    if (gdb !== gda) return gdb - gda;
    if (b.GF !== a.GF) return b.GF - a.GF;
    return a.team.name.localeCompare(b.team.name);
  });
  ranked.forEach((r, i) => r.pos = i + 1);
  return ranked;
}

function wiGroupImpact(f, hypoScore) {
  const teams = (WCwi.TEAM_LIST || []).filter(t => t.group === f.group);
  if (!teams.length) return null;
  const allFx = (WCwi.FIXTURES || []).filter(x => x.stage === 'group' && x.group === f.group);
  const otherDone = allFx.filter(x => x.id !== f.id && wiDone(x) && x.score && x.score[0] != null);
  const before = wiTally(teams, otherDone);
  const after = wiTally(teams, otherDone.concat([{ a: f.a, b: f.b, score: hypoScore }]));
  const beforeMap = {};
  before.forEach(r => { beforeMap[r.code] = r; });
  return after.map(r => ({
    code: r.code,
    team: r.team,
    afterPos: r.pos,
    afterPts: r.Pts,
    afterGD: r.GF - r.GA,
    qualAfter: r.pos <= 2,
    qualBefore: beforeMap[r.code] ? beforeMap[r.code].pos <= 2 : false,
    move: (beforeMap[r.code] ? beforeMap[r.code].pos : r.pos) - r.pos,
  }));
}

function wiSweepImpact(groupRows) {
  if (!groupRows) return [];
  const all = Swi ? Swi.allSync() : (WCwi.PEOPLE || []);
  const results = [];
  all.forEach(person => {
    const g = groupRows.find(r => r.code === person.team);
    if (!g) return;
    results.push({ person, team: g.team, move: g.move, afterPos: g.afterPos, qualBefore: g.qualBefore, qualAfter: g.qualAfter });
  });
  results.sort((a, b) => b.move - a.move);
  return results;
}

function wiResolved(m) {
  if (!m) return false;
  if (m.kind === 'team2') return Array.isArray(m.answer) && m.answer.length > 0 && m.answer.every(x => x != null);
  return m.answer != null;
}

function wiMarkets(f) {
  const hidden = (WCwi.meta && WCwi.meta.hiddenPredictions) || [];
  const all = (WCwi.predictions || (Swi && Swi.PREDICTIONS) || []);
  return all.filter(m => {
    if (hidden.indexOf(m.key) >= 0 || wiResolved(m)) return false;
    if (m.kind === 'team' || m.kind === 'team2') {
      return (m.options || []).some(o => o === f.a || o === f.b);
    }
    return false;
  });
}

/* ---- hypothetical group table ------------------------------------------- */
function WiGroupTable(props) {
  const { rows, fa, fb } = props;
  if (!rows) return null;
  return (
    <Cwi flat style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 7px', borderBottom: '2px solid var(--line)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', color: 'var(--ink2)', textTransform: 'uppercase' }}>
        <span style={{ width: 18, textAlign: 'center' }}>#</span>
        <span style={{ width: 26 }}></span>
        <span style={{ flex: 1 }}>Team</span>
        <span style={{ width: 26, textAlign: 'center' }}>GD</span>
        <span style={{ width: 28, textAlign: 'center' }}>Pts</span>
        <span style={{ width: 30, textAlign: 'center' }}>↕</span>
      </div>
      {rows.map((r, i) => {
        const gd = r.afterGD;
        const nowQualifies = r.qualAfter && !r.qualBefore;
        const nowOut = !r.qualAfter && r.qualBefore;
        const isMatch = r.code === fa || r.code === fb;
        return (
          <React.Fragment key={r.code}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 2px', borderRadius: 9, margin: '2px 0', background: isMatch ? 'rgba(245,200,0,.14)' : 'transparent' }}>
              <span className="dh" style={{ width: 18, textAlign: 'center', fontSize: 15, color: r.afterPos <= 2 ? 'var(--green)' : 'var(--ink2)' }}>{r.afterPos}</span>
              <Fwi team={r.team} size={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.team.name}
                  {nowQualifies && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 900, color: 'var(--green)', letterSpacing: '.04em' }}>QUALIFIES ✓</span>}
                  {nowOut && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 900, color: 'var(--red)', letterSpacing: '.04em' }}>DROPS OUT ✗</span>}
                </div>
              </div>
              <span style={{ width: 26, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{gd > 0 ? '+' + gd : gd}</span>
              <span className="dh" style={{ width: 28, textAlign: 'center', fontSize: 16 }}>{r.afterPts}</span>
              <span style={{ width: 30, textAlign: 'center', fontWeight: 900, fontSize: 12, color: r.move > 0 ? 'var(--green)' : r.move < 0 ? 'var(--red)' : 'var(--ink2)' }}>
                {r.move > 0 ? '▲' + r.move : r.move < 0 ? '▼' + Math.abs(r.move) : '–'}
              </span>
            </div>
            {i === 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '3px 0', padding: '0 2px' }}>
              <div style={{ flex: 1, borderTop: '2px dashed var(--green)' }} />
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'var(--green)' }}>QUALIFY ↑</span>
            </div>}
          </React.Fragment>
        );
      })}
    </Cwi>
  );
}

/* ---- goal stepper ------------------------------------------------------- */
function WiGoalStepper(props) {
  const btn = (label, delta, disabled) => (
    <button onClick={() => !disabled && props.onBump(delta)} disabled={disabled}
      style={{ width: 28, height: 28, borderRadius: 9, border: '2px solid var(--ink)', background: '#fff', cursor: disabled ? 'default' : 'pointer', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 16, lineHeight: 1, color: 'var(--ink)', opacity: disabled ? .35 : 1, padding: 0 }}>{label}</button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {btn('−', -1, props.value <= 0)}
      <span className="dh" style={{ fontSize: 22, width: 18, textAlign: 'center' }}>{props.value}</span>
      {btn('+', 1, false)}
    </div>
  );
}

/* ---- the overlay (portalled to #root so it covers the full phone screen) */
function WhatIfSheet(props) {
  const f = props.f;
  const me = props.me;
  // score is [goalsA, goalsB] (or null before a pick). The outcome is derived,
  // so a quick "1–0" preset and a hand-entered scoreline share one code path.
  const [score, setScore] = wiState(null);

  if (!f) return null;

  const ta = wiTeam(f.a), tb = wiTeam(f.b);
  const isGroup = (f.stage || 'group') === 'group';

  const outcome = score ? (score[0] > score[1] ? 'a' : score[1] > score[0] ? 'b' : 'draw') : null;
  const hypo = score;
  const koLevel = !isGroup && outcome === 'draw'; // knockouts can't end level
  const groupRows = (hypo && isGroup) ? wiGroupImpact(f, hypo) : null;
  const sweepRows = groupRows ? wiSweepImpact(groupRows) : [];
  const bigWinner = sweepRows.find(r => r.move > 0);
  const bigLoser = sweepRows.slice().reverse().find(r => r.move < 0);
  const openMarkets = wiMarkets(f);

  const allPeople = Swi ? Swi.allSync() : (WCwi.PEOPLE || []);
  const ownersOf = (code) => allPeople.filter(p => p.team === code);

  const stageLabel = { final: 'Final', sf: 'Semi-final', qf: 'Quarter-final', r16: 'Round of 16', r32: 'Round of 32' }[f.stage] || null;

  const koAdvance = (outcome === 'a' || outcome === 'b') ? (outcome === 'a' ? ta : tb) : null;
  const koOut = (outcome === 'a' || outcome === 'b') ? (outcome === 'a' ? tb : ta) : null;

  const presetScore = { a: [1, 0], draw: [0, 0], b: [0, 1] };
  const bumpGoal = (side, delta) => {
    const base = score || [0, 0];
    const next = side === 0 ? [Math.max(0, base[0] + delta), base[1]] : [base[0], Math.max(0, base[1] + delta)];
    setScore(next);
  };

  // Which scenario is the user's drawn team winning? Star it so they instantly
  // see the result that helps them.
  const myWin = me ? (f.a === me.team ? 'a' : f.b === me.team ? 'b' : null) : null;
  const star = (k) => (k === myWin ? '⭐ ' : '');

  const scenarios = isGroup
    ? [['a', star('a') + ta.flag + ' ' + ta.name + ' win'], ['draw', 'Draw'], ['b', star('b') + tb.flag + ' ' + tb.name + ' win']]
    : [['a', star('a') + ta.flag + ' ' + ta.name + ' win'], ['b', star('b') + tb.flag + ' ' + tb.name + ' win']];

  const content = (
    <div className="moment rise" style={{ zIndex: 65, background: 'var(--bg)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 10px', borderBottom: '1.5px solid var(--line)', flexShrink: 0, background: 'rgba(244,238,227,.96)' }}>
        <button onClick={props.onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, fontWeight: 900, color: 'var(--ink)', padding: '2px 6px 2px 0', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dh" style={{ fontSize: 22 }}>What If?</div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)' }}>
            {stageLabel || ('Group ' + f.group)} · {f.dateLabel} {f.time}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 26 }}>{ta.flag}</span>
          {hypo
            ? <span className="dh pop" key={outcome} style={{ fontSize: 17, color: 'var(--red)' }}>{hypo[0]}–{hypo[1]}</span>
            : <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>v</span>}
          <span style={{ fontSize: 26 }}>{tb.flag}</span>
        </div>
      </div>

      <div className="mscroll">
        <div className="pad">

          {/* scenario picker */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink2)' }}>Pick a scenario</span>
              {myWin && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--red)' }}>⭐ your team</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {scenarios.map(([k, lab]) => (
                <button key={k} onClick={() => setScore(outcome === k ? null : presetScore[k])}
                  className={'wc-btn wc-btn--sm' + (outcome === k ? ' wc-btn--primary' : '')}
                  style={{ flex: 1, fontSize: 12, padding: '11px 6px', boxShadow: outcome === k ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lab}
                </button>
              ))}
            </div>

            {/* exact scoreline stepper — appears once a scenario is picked */}
            {score && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'var(--bg2)', border: '2px solid var(--line)', borderRadius: 13, padding: '9px 12px' }}>
                <span style={{ fontSize: 22 }}>{ta.flag}</span>
                <WiGoalStepper value={score[0]} onBump={(d) => bumpGoal(0, d)} />
                <span className="dh" style={{ fontSize: 16, color: 'var(--ink2)' }}>–</span>
                <WiGoalStepper value={score[1]} onBump={(d) => bumpGoal(1, d)} />
                <span style={{ fontSize: 22 }}>{tb.flag}</span>
              </div>
            )}
          </div>

          {/* idle state */}
          {!score && (
            <div style={{ textAlign: 'center', padding: '36px 0 24px' }}>
              <Wwi mood="confident" size={68} animate />
              <div className="dh" style={{ fontSize: 20, marginTop: 12 }}>Run the numbers</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 5, lineHeight: 1.4 }}>
                {isGroup
                  ? 'Pick a winner — or set the exact score — to see how the group table shifts and who wins or loses in the sweepstake.'
                  : 'Pick a winner — or set the exact score — to see who advances and what it means for the draw.'}
              </div>
            </div>
          )}

          {/* knockout can't end level */}
          {koLevel && (
            <div style={{ textAlign: 'center', padding: '22px 12px', background: 'rgba(232,39,42,.06)', border: '2px solid var(--red)', borderRadius: 16 }}>
              <div style={{ fontSize: 28 }}>⚖️</div>
              <div className="dh" style={{ fontSize: 17, marginTop: 4 }}>A knockout can't end level</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 4 }}>Nudge the score so one side comes out on top.</div>
            </div>
          )}

          {/* ---- GROUP GAME RESULTS ---- */}
          {outcome && isGroup && groupRows && <>

            <SHwi aside={'Group ' + f.group + ' · if this result stands'}>Hypothetical table</SHwi>
            <WiGroupTable rows={groupRows} fa={f.a} fb={f.b} />
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 6, marginBottom: 16, lineHeight: 1.35 }}>
              Based on results so far, with a {hypo[0]}–{hypo[1]} {ta.name} v {tb.name} added in. Adjust the score above to test the goal difference.
            </div>

            {/* biggest winner / loser cards */}
            {(bigWinner || bigLoser) && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {bigWinner ? (
                  <div style={{ flex: 1, background: 'rgba(26,122,68,.1)', border: '2.5px solid var(--green)', borderRadius: 16, padding: '11px 12px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--green)', letterSpacing: '.04em' }}>📈 BIGGEST WINNER</div>
                    <div className="dh" style={{ fontSize: 17, marginTop: 5, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bigWinner.person.name}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginTop: 2 }}>
                      {bigWinner.team.flag} {bigWinner.team.name}
                      <span style={{ color: 'var(--green)', marginLeft: 4 }}>▲{bigWinner.move}</span>
                    </div>
                    {bigWinner.qualAfter && !bigWinner.qualBefore && (
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>Moves into a qualifying spot</div>
                    )}
                  </div>
                ) : (
                  <div style={{ flex: 1, background: 'var(--bg2)', border: '2px solid var(--line)', borderRadius: 16, padding: '11px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textAlign: 'center' }}>No one moves up</div>
                  </div>
                )}
                {bigLoser ? (
                  <div style={{ flex: 1, background: 'rgba(232,39,42,.07)', border: '2.5px solid var(--red)', borderRadius: 16, padding: '11px 12px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--red)', letterSpacing: '.04em' }}>📉 BIGGEST LOSER</div>
                    <div className="dh" style={{ fontSize: 17, marginTop: 5, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bigLoser.person.name}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginTop: 2 }}>
                      {bigLoser.team.flag} {bigLoser.team.name}
                      <span style={{ color: 'var(--red)', marginLeft: 4 }}>▼{Math.abs(bigLoser.move)}</span>
                    </div>
                    {!bigLoser.qualAfter && bigLoser.qualBefore && (
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--red)', marginTop: 4 }}>Falls out of a qualifying spot</div>
                    )}
                  </div>
                ) : (
                  <div style={{ flex: 1, background: 'var(--bg2)', border: '2px solid var(--line)', borderRadius: 16, padding: '11px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textAlign: 'center' }}>No one drops</div>
                  </div>
                )}
              </div>
            )}

            {/* sweepstake participants in this group */}
            {sweepRows.length > 0 && <>
              <SHwi aside={sweepRows.length + ' players'}>Sweepstake impact</SHwi>
              <Cwi flat style={{ padding: '8px 12px' }}>
                {sweepRows.map((r, i) => {
                  const isMe = me && r.person.id === me.id;
                  return (
                    <div key={r.person.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 2px', borderBottom: i < sweepRows.length - 1 ? '1.5px solid var(--line)' : 'none', background: isMe ? 'rgba(245,200,0,.12)' : 'transparent', borderRadius: isMe ? 9 : 0, paddingLeft: isMe ? 6 : 2 }}>
                      <Fwi team={r.team} size={22} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.person.name}
                          {isMe && <span style={{ color: 'var(--red)', marginLeft: 4 }}>you</span>}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: r.qualAfter ? 'var(--green)' : 'var(--ink2)' }}>
                          {r.team.name} · {r.qualAfter ? 'qualifying' : 'not qualifying'}
                        </div>
                      </div>
                      <span style={{ fontWeight: 900, fontSize: 13, color: r.move > 0 ? 'var(--green)' : r.move < 0 ? 'var(--red)' : 'var(--ink2)', width: 32, textAlign: 'right' }}>
                        {r.move > 0 ? '▲' + r.move : r.move < 0 ? '▼' + Math.abs(r.move) : '–'}
                      </span>
                      <span className="dh" style={{ fontSize: 17, color: r.afterPos <= 2 ? 'var(--green)' : 'var(--ink2)', width: 22, textAlign: 'center' }}>{r.afterPos}</span>
                    </div>
                  );
                })}
              </Cwi>
            </>}

            {sweepRows.length === 0 && (
              <Cwi flat style={{ textAlign: 'center', padding: '18px 12px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)' }}>No players have drawn teams in this group.</div>
              </Cwi>
            )}

            {/* open prediction markets */}
            {openMarkets.length > 0 && <>
              <SHwi aside={openMarkets.length + ' unresolved'}>Predictions still alive</SHwi>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {openMarkets.map(m => (
                  <Chwi key={m.key} tone="ghost">{m.label}</Chwi>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.35 }}>
                These open markets feature {ta.name} or {tb.name} — the result here keeps them live or may shape their outcome.
              </div>
            </>}
          </>}

          {/* ---- KO GAME RESULTS ---- */}
          {outcome && !isGroup && koAdvance && (
            <>
              <SHwi aside={stageLabel || f.stage}>{koAdvance.name} advance</SHwi>
              <Cwi bordered style={{ background: 'var(--ink)', color: '#fff', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 42, lineHeight: 1 }}>{koAdvance.flag}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dh" style={{ fontSize: 22, color: '#fff', lineHeight: 1 }}>{koAdvance.name}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>advance to the next round</div>
                  </div>
                  <Chwi tone="green" style={{ flexShrink: 0 }}>through</Chwi>
                </div>
                {ownersOf(koAdvance.code).length > 0 && (
                  <div style={{ marginTop: 12, background: 'rgba(245,200,0,.15)', borderRadius: 11, padding: '9px 12px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--yellow)', letterSpacing: '.05em' }}>DRAWN BY</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 3 }}>
                      {ownersOf(koAdvance.code).map(p => p.name).join(', ')}
                    </div>
                  </div>
                )}
              </Cwi>

              <Cwi flat style={{ marginBottom: 10, opacity: .7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 42, lineHeight: 1, filter: 'grayscale(1)' }}>{koOut.flag}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dh" style={{ fontSize: 22, color: 'var(--ink2)', textDecoration: 'line-through', lineHeight: 1 }}>{koOut.name}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginTop: 3 }}>eliminated</div>
                  </div>
                </div>
                {ownersOf(koOut.code).length > 0 && (
                  <div style={{ marginTop: 12, background: 'rgba(232,39,42,.08)', borderRadius: 11, padding: '9px 12px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--red)', letterSpacing: '.05em' }}>DRAWN BY</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>
                      {ownersOf(koOut.code).map(p => p.name).join(', ')}
                    </div>
                  </div>
                )}
              </Cwi>

              {openMarkets.length > 0 && <>
                <SHwi aside={openMarkets.length + ' unresolved'}>Predictions still alive</SHwi>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {openMarkets.map(m => (
                    <Chwi key={m.key} tone="ghost">{m.label}</Chwi>
                  ))}
                </div>
              </>}
            </>
          )}

          <div style={{ height: 28 }} />
        </div>
      </div>
    </div>
  );

  const root = document.getElementById('root');
  return root ? ReactDOM.createPortal(content, root) : content;
}

window.WhatIfSheet = WhatIfSheet;
