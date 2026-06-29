/* ===========================================================================
   PREDICTIONS — tournament prediction markets, scoring & leaderboard.
   Replaces the old "side bets". Open markets are pickable; resolved markets
   are graded against your pick. Points roll up into the prediction league.
   =========================================================================== */
const WCp = window.WC;
const Wp = window.Wheesht;
const Sp = window.Store;
const { Card: Cp, Btn: Bp, Flag: Fp, Avatar: Ap, Chip: Chp, WheeshtSays: Saysp, SectionHead: SHp } = window;
const { useState: pState } = React;

function isPerFixtureMarket(m) {
  var k = String((m && m.key) || '');
  return k.indexOf('dm_') === 0 || k.indexOf('ko_') === 0;
}
function isKnockoutBracketMarket(m) {
  return String((m && m.key) || '').indexOf('ko_') === 0;
}

function koMarketReady(m) {
  if (!isKnockoutBracketMarket(m)) return true;
  var opts = m.options || [];
  if (opts.length < 2) return false;
  for (var i = 0; i < opts.length; i++) {
    var c = opts[i];
    if (!c || c === 'UNK' || c === 'TBD' || !WCp.TEAMS[c]) return false;
  }
  return true;
}

function isResolved(m) {
  if (isPerFixtureMarket(m)) {
    if (m.answer != null && (m.kind !== 'team2' || (Array.isArray(m.answer) && m.answer.length > 0))) return true;
    if (!fixtureFinished(m)) return false;
  }
  if (m.kind === 'team2') return Array.isArray(m.answer) && m.answer.length > 0 && m.answer.every(function (x) { return x != null; });
  return m.answer != null;
}

function pickComplete(m, picks) {
  const v = picks ? picks[m.key] : null;
  if (v == null) return false;
  if (m.kind === 'team2') return Array.isArray(v) && v.length === 2;
  if (m.kind === 'number') return v !== '' && isFinite(Number(v));
  if (m.kind === 'scoreline') return typeof v === 'string' && /^\d+-\d+$/.test(v);
  return true;
}

function fixtureStatus(m) {
  return String((m && (m.fixture_status || m.fixtureStatus || m.status)) || '').toLowerCase();
}
function fixtureKickoffMs(m) {
  if (!m || !m.dateISO) return null;
  var tm = String(m.time || '00:00').slice(0, 5);
  try { var t = new Date(String(m.dateISO) + 'T' + tm + ':00').getTime(); return isFinite(t) ? t : null; } catch (e) { return null; }
}
function fixtureKickedOff(m) {
  if (fixtureActive(m) || fixtureFinished(m)) return true;
  var ko = fixtureKickoffMs(m);
  return ko != null && ko <= Date.now();
}
function fixtureActive(m) {
  const st = fixtureStatus(m);
  return ['live', 'halftime', 'half_time', 'half-time', 'ht', 'inplay', 'in_play', 'in-progress', 'inprogress', 'paused', '1h', '2h'].indexOf(st) >= 0;
}
function fixtureFinished(m) {
  if (m && m.done) return true;
  const st = fixtureStatus(m);
  return ['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(st) >= 0;
}
function timeLeftLabel(dt, now) {
  if (!dt) return '';
  const ms = new Date(dt).getTime() - now;
  if (!isFinite(ms)) return '';
  if (ms <= 0) return 'locked';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return mins + 'm left';
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return hrs + 'h' + (rem ? ' ' + rem + 'm' : '') + ' left';
  const days = Math.floor(hrs / 24);
  return days + 'd ' + (hrs % 24) + 'h left';
}

var KO_STAGE_SORT = { r32: 1, r16: 2, qf: 3, sf: 4, final: 5, third: 6 };

function marketKickoffMs(m) {
  if (!m) return Infinity;
  var ms = fixtureKickoffMs(m);
  if (ms != null) return ms;
  var fid = m.fixture_id;
  if (fid && WCp.FIXTURES) {
    for (var i = 0; i < WCp.FIXTURES.length; i++) {
      var f = WCp.FIXTURES[i];
      if (f && String(f.id) === String(fid)) {
        ms = fixtureKickoffMs(f);
        if (ms != null) return ms;
        break;
      }
    }
  }
  return ((KO_STAGE_SORT[m.stage] || 99) * 1e12);
}

function sortKoMarkets(list) {
  return list.slice().sort(function (a, b) { return marketKickoffMs(a) - marketKickoffMs(b); });
}

function optLabel(m, opt) {
  if (opt === 'draw') return { main: 'Draw', sub: 'Honours even', flag: '🤝', id: 'draw' };
  if (m.kind === 'player') return { main: opt.name, sub: WCp.TEAMS[opt.team] ? WCp.TEAMS[opt.team].name : '', flag: WCp.TEAMS[opt.team] ? WCp.TEAMS[opt.team].flag : '', id: opt.id };
  if (m.kind === 'stage') return { main: opt, sub: '', flag: '', id: opt };
  const t = WCp.TEAMS[opt];
  return { main: t ? t.name : opt, sub: t ? 'Group ' + t.group + ' · ' + t.odds : '', flag: t ? t.flag : '', id: opt };
}

function ScorelinePicker({ pick, answer, resolved, locked, onPick }) {
  const valid = !!(pick && /^\d+-\d+$/.test(pick));
  const [home, setHome] = pState(valid ? pick.split('-')[0] : '');
  const [away, setAway] = pState(valid ? pick.split('-')[1] : '');
  // Adopt an incoming complete scoreline (initial load / server refresh) but
  // never let a null/partial prop clobber a half-typed entry on this device.
  React.useEffect(function() {
    if (!valid) return;
    const p = pick.split('-');
    if (p[0] !== home || p[1] !== away) { setHome(p[0]); setAway(p[1]); }
  }, [pick]);
  function set(side, v) {
    if (resolved || locked) return;
    const h = side === 0 ? v : home;
    const a = side === 1 ? v : away;
    if (side === 0) setHome(v); else setAway(v);
    // Only persist a complete scoreline; a partial like "3-" can never be graded
    // and would just sit on the server as junk, so we keep it local until both
    // boxes are filled.
    onPick(h !== '' && a !== '' ? h + '-' + a : null);
  }
  const complete = home !== '' && away !== '';
  const gotIt = answer != null && pick === answer;
  const inp = function(val, side) {
    return (
      <input
        type="number" min="0" step="1" value={val} disabled={resolved || locked}
        onChange={function(e) { set(side, e.target.value); }}
        style={{ width: 56, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 28, textAlign: 'center', color: 'var(--ink)' }}
      />
    );
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '2.5px solid ' + (complete ? (resolved ? (gotIt ? 'var(--green)' : 'var(--red)') : 'var(--ink)') : 'var(--line)'), borderRadius: 13, background: resolved ? (gotIt ? 'rgba(26,122,68,.08)' : 'rgba(232,39,42,.06)') : (complete ? 'var(--yellow)' : '#fff'), padding: '4px 8px', justifyContent: 'center' }}>
      {inp(home, 0)}
      <span className="dh" style={{ fontSize: 24, color: 'var(--ink2)', userSelect: 'none' }}>–</span>
      {inp(away, 1)}
      {resolved && <div style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 800, color: gotIt ? 'var(--green)' : 'var(--red)' }}>{gotIt ? '✓ Correct' : 'Answer: ' + answer}</div>}
    </div>
  );
}

function Market(props) {
  const m = props.market, me = props.me, onPick = props.onPick;
  const isTwo = m.kind === 'team2';
  const isNumber = m.kind === 'number';
  const isScoreline = m.kind === 'scoreline';
  const isTeam = m.kind === 'team' || isTwo;
  const isDm = !!(m.key && m.key.startsWith('dm_'));
  const isKo = !!(m.key && m.key.startsWith('ko_'));
  const isPerFix = isDm || isKo;
  const isFixtureWinner = isPerFix && m.kind === 'team' && !isTwo;
  // Per-fixture markets lock at kick-off, independent of the global predictions lock
  const fixLive = isPerFix && fixtureKickedOff(m);
  const locked = isPerFix ? fixLive : !!props.locked;
  const resolved = isResolved(m);
  const pick = me.picks ? me.picks[m.key] : null;
  const picked = (id, idx) => {
    if (isTwo) return Array.isArray(pick) && pick.indexOf(id) >= 0;
    if (isFixtureWinner && idx != null) return pick === id && (m.options || [])[idx] === id;
    return pick === id;
  };
  const gotIt = resolved && (isTwo
    ? (Array.isArray(pick) && Array.isArray(m.answer) && pick.length === m.answer.length && pick.every(id => m.answer.indexOf(id) >= 0))
    : isNumber ? Number(pick) === Number(m.answer)
    : pick === m.answer);
  const [teamQ, setTeamQ] = pState('');
  const presetCodes = isTeam ? new Set(m.options || []) : new Set();

  function choose(id, idx) {
    if (resolved || locked) return;
    if (isFixtureWinner && idx != null && (m.options || [])[idx] !== id) return;
    let made = false;
    if (isTwo) {
      let arr = Array.isArray(pick) ? pick.slice() : [];
      if (arr.indexOf(id) >= 0) arr = arr.filter(x => x !== id);
      else { arr.push(id); if (arr.length > 2) arr.shift(); made = true; }
      onPick(m.key, arr);
    } else {
      const toggling = picked(id, idx);
      onPick(m.key, toggling ? null : id);
      made = !toggling;
    }
    setTeamQ('');
    if (made) {
      window.wcHaptic && window.wcHaptic('light');
      window.wcConfetti && window.wcConfetti({ count: 28, y: 0.5, x: 0.5 });
    }
  }

  const teamResults = isTeam && !isFixtureWinner && !resolved && teamQ.trim()
    ? WCp.TEAM_LIST.filter(t => !presetCodes.has(t.code) && (t.name.toLowerCase().indexOf(teamQ.toLowerCase()) >= 0 || t.code.toLowerCase().indexOf(teamQ.toLowerCase()) >= 0)).slice(0, 6)
    : [];

  function chooseNumber(v) {
    if (resolved || locked) return;
    if (v === '') onPick(m.key, null);
    else onPick(m.key, Number(v));
  }

  const hasPick = isNumber ? (pick != null && pick !== '' && isFinite(Number(pick))) : isScoreline ? (pick != null && /^\d+-\d+$/.test(pick)) : (pick != null && (!isTwo || (Array.isArray(pick) && pick.length > 0)));
  const hasFullPick = isScoreline ? hasPick : isNumber ? hasPick : (pick != null && (!isTwo || (Array.isArray(pick) && pick.length === 2)));

  return (
    <Cp style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
        <div className="dh" style={{ fontSize: 17, lineHeight: 1.05 }}>{m.q}</div>
        <Chp tone={resolved ? (gotIt ? 'green' : 'red') : (hasFullPick ? 'yellow' : 'ghost')} style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {resolved ? (gotIt ? '+' + m.points + ' pts' : 'Missed') : '+' + m.points + ' pts'}
        </Chp>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 9 }}>
        {resolved ? 'Result is in'
          : locked ? (isPerFix && fixtureActive(m) ? 'Game in progress · locked' : 'Locked · kick-off passed')
          : isPerFix ? 'Open · locks at kick-off'
          : isTwo ? 'Pick the two finalists'
          : isNumber ? 'Open · type your answer'
          : 'Open · tap to pick'}
      </div>
      {isNumber && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', border: '2.5px solid ' + (hasPick ? 'var(--ink)' : 'var(--line)'), borderRadius: 13, background: hasPick && !resolved ? 'var(--yellow)' : '#fff' }}>
          <input
            type="number"
            min="0"
            step="1"
            value={pick == null ? '' : pick}
            onChange={e => chooseNumber(e.target.value)}
            disabled={resolved || locked}
            placeholder={m.placeholder || 'Type a number'}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 22, color: 'var(--ink)' }}
          />
          {resolved && <Chp tone={gotIt ? 'green' : 'red'} style={{ flex: '0 0 auto' }}>Answer: {m.answer}</Chp>}
          {!resolved && locked && hasPick && <Chp tone="yellow" style={{ flex: '0 0 auto' }}>Your pick</Chp>}
        </div>
      )}
      {isScoreline && (
        <ScorelinePicker pick={pick} answer={m.answer} resolved={resolved} locked={locked} onPick={function(v){ onPick(m.key, v); }}/>
      )}
      {!isNumber && !isScoreline && <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {(m.options || []).map((opt, i) => {
          const o = optLabel(m, opt);
          const on = picked(o.id, i);
          const isAnswer = resolved && (isTwo ? (Array.isArray(m.answer) && m.answer.indexOf(o.id) >= 0) : o.id === m.answer);
          const wrong = resolved && on && !isAnswer;
          let bg = '#fff', bd = 'var(--line)';
          if (isAnswer) { bg = 'rgba(26,122,68,.12)'; bd = 'var(--green)'; }
          else if (wrong) { bg = 'rgba(232,39,42,.08)'; bd = 'var(--red)'; }
          else if (on && !resolved) { bg = 'var(--yellow)'; bd = 'var(--ink)'; }
          return (
            <button key={m.key + '-' + i + '-' + o.id} onClick={() => choose(o.id, i)} disabled={resolved || locked} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: (resolved || locked) ? 'default' : 'pointer',
              textAlign: 'left', border: '2.5px solid ' + bd, borderRadius: 13, background: bg, fontFamily: 'var(--body)', transition: 'all .12s'
            }}>
              {o.flag && <span style={{ fontSize: 24 }}>{o.flag}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{o.main}</div>
                {o.sub && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)' }}>{o.sub}</div>}
              </div>
              {isAnswer && <Chp tone="green" style={{ flex: '0 0 auto' }}>Correct</Chp>}
              {!resolved && !locked && <span style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid var(--ink)', background: on ? 'var(--ink)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 900, flex: '0 0 auto' }}>{on ? '✓' : ''}</span>}
              {!resolved && locked && on && <Chp tone="yellow" style={{ flex: '0 0 auto' }}>Your pick</Chp>}
            </button>
          );
        })}
      </div>
      </>}
      {isTeam && !resolved && !locked && !isFixtureWinner && (
        <div style={{ marginTop: 10, borderTop: '1.5px solid var(--line)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Search all 48 teams</div>
          <input
            value={teamQ}
            onChange={e => setTeamQ(e.target.value)}
            placeholder="Type a team name…"
            style={{ width: '100%', boxSizing: 'border-box', border: '2px solid var(--line)', borderRadius: 10, padding: '8px 11px', fontFamily: 'var(--body)', fontWeight: 600, fontSize: 14, outline: 'none' }}
          />
          {teamResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
              {teamResults.map(t => {
                const on = picked(t.code);
                return (
                  <button key={t.code} onClick={() => choose(t.code)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px',
                    border: '2px solid ' + (on ? 'var(--ink)' : 'var(--line)'),
                    borderRadius: 11, background: on ? 'var(--yellow)' : '#fff',
                    cursor: 'pointer', fontFamily: 'var(--body)', textAlign: 'left'
                  }}>
                    <span style={{ fontSize: 22 }}>{t.flag}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{t.name}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)' }}>Group {t.group} · {t.odds}</div>
                    </div>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--ink)', background: on ? 'var(--ink)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 900, flex: '0 0 auto' }}>{on ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* % breakdown — show for dynamic markets always, static markets once resolved */}
      {(m.key.startsWith('dm_') || resolved) && m.kind !== 'number' && m.kind !== 'scoreline' && !isTwo && (function(){
        const all = Sp.allSync ? Sp.allSync() : [];
        const withPick = all.filter(function(p){ return p.picks && p.picks[m.key] != null; });
        if (withPick.length === 0) return null;
        const opts = (m.options && m.options.length ? m.options : (m.answer ? [m.answer] : []));
        if (opts.length === 0) return null;
        return (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1.5px solid var(--line)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: 7 }}>How the group picked</div>
            {opts.map(function(opt) {
              const count = withPick.filter(function(p){ return p.picks[m.key] === opt; }).length;
              const pct = Math.round(100 * count / withPick.length);
              const t = WCp.TEAMS[opt];
              const oFlag = opt === 'draw' ? '🤝' : (t ? t.flag : '');
              const oName = opt === 'draw' ? 'Draw' : (t ? t.name : opt);
              return (
                <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{oFlag}</span>
                  <span style={{ fontWeight: 700, fontSize: 12.5, minWidth: 70, flexShrink: 0 }}>{oName}</span>
                  <div style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: pct + '%', background: m.answer === opt ? 'var(--green)' : 'var(--ink)', borderRadius: 999, transition: 'width .4s' }}/>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 11.5, color: 'var(--ink2)', minWidth: 36, textAlign: 'right' }}>{pct}% · {count}</span>
                </div>
              );
            })}
            <div style={{ fontSize: 10.5, color: 'var(--ink2)', fontWeight: 600, marginTop: 4 }}>{withPick.length} of {all.length} picked</div>
          </div>
        );
      })()}
    </Cp>
  );
}

function PredLeaderboard(props) {
  const me = props.me;
  const rows = Sp.rankedByPred();
  const top = rows.slice(0, 8);
  const meRow = rows.find(p => p.id === me.id);
  const inTop = top.some(p => p.id === me.id);
  return (
    <Cp flat style={{ padding: '4px 14px' }}>
      {top.map((p, i) => <LbRow key={p.id} p={p} i={i} me={me} />)}
      {!inTop && meRow && <>
        <div style={{ textAlign: 'center', color: 'var(--ink2)', fontWeight: 800, padding: '2px 0' }}>···</div>
        <LbRow p={meRow} i={meRow.predRank - 1} me={me} />
      </>}
    </Cp>
  );
}
function LbRow(props) {
  const { p, i, me } = props; const isMe = p.id === me.id;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 4px', borderRadius: 10, background: isMe ? 'rgba(245,200,0,.18)' : 'transparent', margin: '0 -4px' }}>
      <span className="dh" style={{ fontSize: 16, width: 22, textAlign: 'center', color: i === 0 ? 'var(--red)' : 'var(--ink2)' }}>{i + 1}</span>
      <Ap person={Object.assign({}, p, { isYou: false })} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{Sp.shownName ? Sp.shownName(p) : p.name}{isMe && ' (you)'}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{p.location}{p.ltMember ? ' · LT' : ''}</div>
      </div>
      <Chp tone={i === 0 ? 'yellow' : 'ghost'}>{p.predScore} pts</Chp>
    </div>
  );
}

function PredictionPulse(props) {
  const { markets, missing, me, locked, deadlineLabel } = props;
  const live = markets.filter(isPerFixtureMarket);
  const lead = live[0] || missing[0];
  if (!lead && !deadlineLabel) return null;
  const hasPick = lead ? pickComplete(lead, me.picks || {}) : false;
  const active = lead && fixtureActive(lead);
  const kicked = lead && fixtureKickedOff(lead);
  const isLiveFix = lead && isPerFixtureMarket(lead);
  return (
    <Cp bordered style={{ marginBottom: 12, background: active ? 'var(--ink)' : 'var(--yellow)', color: active ? '#fff' : 'var(--ink)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ fontSize: 28 }}>{active ? '●' : '⏱'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.07em', textTransform: 'uppercase', color: active ? 'var(--yellow)' : 'rgba(26,26,26,.65)' }}>
            {active ? 'Game live · picks locked' : isLiveFix ? (isKnockoutBracketMarket(lead) ? 'Knockout bracket pick' : 'Live match prediction') : 'Prediction deadline'}
          </div>
          <div className="dh" style={{ fontSize: 18, lineHeight: 1.08, marginTop: 2, color: active ? '#fff' : 'var(--ink)' }}>
            {lead ? lead.q : 'Tournament picks'}
          </div>
          <div style={{ fontSize: 12, fontWeight: 750, marginTop: 4, opacity: active ? .78 : .72 }}>
            {lead
              ? hasPick ? (kicked ? 'Your pick is locked in.' : 'You have picked. You can change it until lock.') : (kicked ? 'You missed this one.' : 'No pick yet. This is where points disappear quietly.')
              : 'Get the card finished before it locks.'}
          </div>
        </div>
        <Chp tone={hasPick ? 'green' : kicked || locked ? 'red' : 'ghost'} style={{ flex: '0 0 auto', background: active ? '#fff' : undefined }}>
          {hasPick ? 'Picked' : kicked || locked ? 'Locked' : (deadlineLabel || 'Open')}
        </Chp>
      </div>
    </Cp>
  );
}

function PredictionsScreen(props) {
  const me = Sp.active();
  const [, bump] = pState(0);
  const [now, setNow] = pState(Date.now());
  React.useEffect(function() {
    const iv = setInterval(function() { setNow(Date.now()); }, 30000);
    return function() { clearInterval(iv); };
  }, []);
  if (!me) return null;
  const copy = window.WheeshtCopy || {};
  if (Sp.hasPro && !Sp.hasPro()) {
    return <div className="pad">
      <div className="appbar" style={{ padding: '2px 0 12px' }}>
        <div className="dh" style={{ fontSize: 28 }}>Predictions</div>
      </div>
      <Cp bordered style={{ background: 'var(--yellow)' }}>
        <div className="dh" style={{ fontSize: 20, marginBottom: 6 }}>{copy.proLockedTitle || 'Pro feature'}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', lineHeight: 1.45 }}>
          {copy.proLockedHint || 'Your organiser can unlock predictions for this league — tournament picks, live match markets, and a proper prediction leaderboard.'}
        </div>
      </Cp>
    </div>;
  }
  const markets = (Sp.visiblePredictions ? Sp.visiblePredictions() : (WCp.predictions || Sp.PREDICTIONS).filter(m => ((WCp.meta && WCp.meta.hiddenPredictions) || []).indexOf(m.key) < 0)).filter(koMarketReady);
  const koCfg = (WCp.meta && WCp.meta.knockoutPredictions) || {};
  const koEnabled = !!koCfg.enabled;
  const dmTs = k => { const p = String(k).split('_'); const n = parseInt(p[p.length - 1], 10); return isFinite(n) ? n : 0; };
  const open = markets.filter(m => !isResolved(m)).sort((a, b) => {
    const aKo = isKnockoutBracketMarket(a), bKo = isKnockoutBracketMarket(b);
    if (koEnabled) {
      if (aKo && !bKo) return -1;
      if (!aKo && bKo) return 1;
    }
    if (aKo && bKo) return marketKickoffMs(a) - marketKickoffMs(b);
    const ad = String(a.key || '').indexOf('dm_') === 0, bd = String(b.key || '').indexOf('dm_') === 0;
    if (ad && bd) return dmTs(b.key) - dmTs(a.key);
    if (ad !== bd) return ad ? -1 : 1;
    if (aKo !== bKo) return aKo ? -1 : 1;
    return 0;
  });
  const graded = markets.filter(m => isResolved(m));
  const perFixKickedOff = function (m) { return isPerFixtureMarket(m) && fixtureKickedOff(m); };
  const openStatic = open.filter(function (m) { return !isPerFixtureMarket(m); });
  const openKo = sortKoMarkets(open.filter(isKnockoutBracketMarket).filter(koMarketReady));
  const openDm = open.filter(function (m) { return String(m.key || '').indexOf('dm_') === 0; });
  // Per-fixture markets that kicked off without a pick don't count as "missing"
  const countableMarkets = markets.filter(m => !perFixKickedOff(m) || pickComplete(m, me.picks || {}));
  const made = countableMarkets.filter(m => pickComplete(m, me.picks || {})).length;
  const missing = open.filter(m => !perFixKickedOff(m) && !pickComplete(m, me.picks || {}));
  const allOpenMade = open.length > 0 && missing.length === 0;
  const nextMissing = missing[0];
  const predDeadline = WCp.meta && WCp.meta.predDeadline;
  const deadlinePassed = predDeadline && new Date() > new Date(predDeadline);
  const locked = Sp.predictionsLocked ? Sp.predictionsLocked() : (!!(WCp.meta && WCp.meta.predictionsLocked) || !!deadlinePassed);
  const deadlineLabel = predDeadline ? timeLeftLabel(predDeadline, now) : '';
  const completionPct = countableMarkets.length ? Math.round(100 * made / countableMarkets.length) : 100;
  function onPick(key, val) { Sp.setPick(me.id, key, val); bump(x => x + 1); }
  function fmtDeadline(dt) {
    try { return new Date(dt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return dt; }
  }
  return (
    <div className="pad">
      <div className="appbar" style={{ padding: '2px 0 12px' }}>
        <div>
          <div className="dh" style={{ fontSize: 26 }}>Predictions</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>
            {completionPct}% complete · {missing.length ? missing.length + ' still to call' : 'all open calls in'} · {Sp.predScoreOf(me)} pts banked
          </div>
        </div>
      </div>
      <PredictionPulse markets={open} missing={missing} me={me} locked={locked} deadlineLabel={deadlineLabel} />
      {locked && <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--ink)', color: '#fff', borderRadius: 13, padding: '10px 13px', marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <span style={{ fontSize: 18 }}>🔒</span>
        <div>
          <div>{deadlinePassed ? 'Tournament predictions locked — deadline has passed.' : 'Tournament predictions locked by the organiser.'}</div>
              {open.some(function(m){ return isPerFixtureMarket(m) && !fixtureKickedOff(m); }) && <div style={{ fontWeight: 600, fontSize: 11.5, marginTop: 3, opacity: 0.8 }}>Knockout and match predictions above stay open until kick-off.</div>}
        </div>
      </div>}
      {!locked && predDeadline && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 10, padding: '7px 12px', background: 'rgba(245,200,0,.2)', borderRadius: 10 }}>
        Picks lock at {fmtDeadline(predDeadline)}{deadlineLabel ? ' · ' + deadlineLabel : ''} — get yours in.
      </div>}
      {!locked && nextMissing && <Cp flat style={{ marginBottom: 12, padding: '11px 13px', background: 'rgba(245,200,0,.22)', border: '2px solid rgba(26,26,26,.16)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink2)' }}>Next call to make</div>
        <div className="dh" style={{ fontSize: 18, marginTop: 3 }}>{nextMissing.q}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginTop: 3 }}>{missing.length === 1 ? 'Last one. No pressure, obviously.' : missing.length + ' picks left on the card.'}</div>
      </Cp>}
      {!locked && allOpenMade && <Cp flat style={{ marginBottom: 12, padding: '11px 13px', background: 'rgba(26,122,68,.10)', border: '2px solid rgba(26,122,68,.28)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--green)' }}>All calls made</div>
        <div className="dh" style={{ fontSize: 18, marginTop: 3 }}>Full card submitted.</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginTop: 3 }}>You can still change picks until they lock. Wheesht has the draft in pencil.</div>
      </Cp>}
      {koEnabled && openKo.length === 0 && <Cp flat style={{ marginBottom: 12, padding: '11px 13px', background: 'rgba(26,26,26,.04)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', lineHeight: 1.4 }}>
          Knockout picks appear here once the feed confirms both teams for each tie. R32 ties are ready now if your range includes Round of 32.
        </div>
      </Cp>}
      {openKo.length > 0 && <>
        <SHp aside={openKo.filter(function (m) { return !pickComplete(m, me.picks || {}); }).length ? openKo.filter(function (m) { return !pickComplete(m, me.picks || {}); }).length + ' left' : 'all in'}>
          Knockout bracket{koCfg.enabled ? ' · ' + (koCfg.points || 5) + ' pts each' : ''}
        </SHp>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 10, lineHeight: 1.35 }}>
          Pick the winner for each tie, earliest kick-off first. New ties appear as the draw publishes. Locks at kick-off.
        </div>
        {openKo.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} locked={locked} />)}
      </>}
      <Saysp mood="mischievous" label="on the record" animate>{WCp.LINES.predOpen}</Saysp>
      {openStatic.length > 0 && <>
        <SHp aside={missing.filter(function (m) { return !isPerFixtureMarket(m); }).length ? missing.filter(function (m) { return !isPerFixtureMarket(m); }).length + ' left' : 'all in'}>{allOpenMade && !openKo.length && !openDm.length ? 'Review your calls' : 'Make your call'}</SHp>
        {openStatic.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} locked={locked} />)}
      </>}
      {openDm.length > 0 && <>
        <SHp aside="match picks">One-off match predictions</SHp>
        {openDm.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} locked={locked} />)}
      </>}
      {!openStatic.length && !openKo.length && !openDm.length && open.length > 0 && <>
        <SHp aside="open">Open picks</SHp>
        {open.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} locked={locked} />)}
      </>}
      {graded.length > 0 && <>
        <SHp aside="graded">Already settled</SHp>
        {graded.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} locked={locked} />)}
      </>}
      <SHp aside="org-wide">Prediction league</SHp>
      <PredLeaderboard me={me} />
      {window.WheeshtShare && !(Sp.isReadOnly && Sp.isReadOnly()) && <button
        onClick={function(){
          var rows = Sp.rankedByPred ? Sp.rankedByPred() : [];
          var lg = Sp.activeLeague ? Sp.activeLeague() : null;
          window.WheeshtShare.shareLeaderboard({ rows: rows, meId: me.id, leagueName: lg && lg.name });
        }}
        className="wc-btn wc-btn--sm wc-btn--ink"
        style={{ width: '100%', marginTop: 10 }}
      >{(window.WheeshtCopy && window.WheeshtCopy.shareStandings) || 'Share standings'}</button>}
      <Cp flat style={{ marginTop: 12, padding: '11px 13px', background: 'rgba(26,26,26,.04)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink2)' }}>Scoring</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)', lineHeight: 1.38, marginTop: 4 }}>
          Open markets can be changed until they lock. Match predictions lock at kick-off. Settled markets show the answer and your points immediately.
        </div>
      </Cp>
      <div style={{ height: 14 }} />
      <Saysp mood="confident" compact>Every point's logged. Wheesht remembers. Especially the bad calls.</Saysp>
    </div>
  );
}

window.PredictionsScreen = PredictionsScreen;
