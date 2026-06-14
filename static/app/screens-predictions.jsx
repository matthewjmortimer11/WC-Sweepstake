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

function isResolved(m) {
  if (m.kind === 'team2') return Array.isArray(m.answer) && m.answer.length > 0 && m.answer.every(function (x) { return x != null; });
  return m.answer != null;
}

function pickComplete(m, picks) {
  const v = picks ? picks[m.key] : null;
  if (v == null) return false;
  if (m.kind === 'team2') return Array.isArray(v) && v.length === 2;
  if (m.kind === 'number') return v !== '' && isFinite(Number(v));
  return true;
}

function optLabel(m, opt) {
  if (m.kind === 'player') return { main: opt.name, sub: WCp.TEAMS[opt.team] ? WCp.TEAMS[opt.team].name : '', flag: WCp.TEAMS[opt.team] ? WCp.TEAMS[opt.team].flag : '', id: opt.id };
  if (m.kind === 'stage') return { main: opt, sub: '', flag: '', id: opt };
  const t = WCp.TEAMS[opt];
  return { main: t ? t.name : opt, sub: t ? 'Group ' + t.group + ' · ' + t.odds : '', flag: t ? t.flag : '', id: opt };
}

function Market(props) {
  const m = props.market, me = props.me, onPick = props.onPick;
  const isTwo = m.kind === 'team2';
  const isNumber = m.kind === 'number';
  const isTeam = m.kind === 'team' || isTwo;
  const locked = !!props.locked;
  const resolved = isResolved(m);
  const pick = me.picks ? me.picks[m.key] : null;
  const picked = (id) => isTwo ? (Array.isArray(pick) && pick.indexOf(id) >= 0) : pick === id;
  const gotIt = resolved && (isTwo
    ? (Array.isArray(pick) && Array.isArray(m.answer) && pick.length === m.answer.length && pick.every(id => m.answer.indexOf(id) >= 0))
    : isNumber ? Number(pick) === Number(m.answer)
    : pick === m.answer);
  const [teamQ, setTeamQ] = pState('');
  const presetCodes = isTeam ? new Set(m.options || []) : new Set();

  function choose(id) {
    if (resolved || locked) return;
    let made = false;
    if (isTwo) {
      let arr = Array.isArray(pick) ? pick.slice() : [];
      if (arr.indexOf(id) >= 0) arr = arr.filter(x => x !== id);
      else { arr.push(id); if (arr.length > 2) arr.shift(); made = true; }
      onPick(m.key, arr);
    } else {
      const toggling = picked(id);
      onPick(m.key, toggling ? null : id);
      made = !toggling;
    }
    setTeamQ('');
    if (made) {
      window.wcHaptic && window.wcHaptic('light');
      window.wcConfetti && window.wcConfetti({ count: 28, y: 0.5, x: 0.5 });
    }
  }

  const teamResults = isTeam && !resolved && teamQ.trim()
    ? WCp.TEAM_LIST.filter(t => !presetCodes.has(t.code) && (t.name.toLowerCase().indexOf(teamQ.toLowerCase()) >= 0 || t.code.toLowerCase().indexOf(teamQ.toLowerCase()) >= 0)).slice(0, 6)
    : [];

  function chooseNumber(v) {
    if (resolved || locked) return;
    if (v === '') onPick(m.key, null);
    else onPick(m.key, Number(v));
  }

  const hasPick = isNumber ? (pick != null && pick !== '' && isFinite(Number(pick))) : (pick != null && (!isTwo || (Array.isArray(pick) && pick.length > 0)));
  const hasFullPick = isNumber ? hasPick : (pick != null && (!isTwo || (Array.isArray(pick) && pick.length === 2)));

  return (
    <Cp style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
        <div className="dh" style={{ fontSize: 17, lineHeight: 1.05 }}>{m.q}</div>
        <Chp tone={resolved ? (gotIt ? 'green' : 'red') : (hasFullPick ? 'yellow' : 'ghost')} style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {resolved ? (gotIt ? '+' + m.points + ' pts' : 'Missed') : '+' + m.points + ' pts'}
        </Chp>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 9 }}>
        {resolved ? 'Result is in' : locked ? 'Predictions locked' : isTwo ? 'Pick the two finalists' : isNumber ? 'Open · type your answer' : 'Open · tap to pick'}
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
      {!isNumber && <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {(m.options || []).map((opt, i) => {
          const o = optLabel(m, opt);
          const on = picked(o.id);
          const isAnswer = resolved && (isTwo ? (Array.isArray(m.answer) && m.answer.indexOf(o.id) >= 0) : o.id === m.answer);
          const wrong = resolved && on && !isAnswer;
          let bg = '#fff', bd = 'var(--line)';
          if (isAnswer) { bg = 'rgba(26,122,68,.12)'; bd = 'var(--green)'; }
          else if (wrong) { bg = 'rgba(232,39,42,.08)'; bd = 'var(--red)'; }
          else if (on && !resolved) { bg = 'var(--yellow)'; bd = 'var(--ink)'; }
          return (
            <button key={i} onClick={() => choose(o.id)} disabled={resolved || locked} style={{
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
      {isTeam && !resolved && !locked && (
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

function PredictionsScreen(props) {
  const me = Sp.active();
  const [, bump] = pState(0);
  if (!me) return null;
  const markets = Sp.visiblePredictions ? Sp.visiblePredictions() : (WCp.predictions || Sp.PREDICTIONS).filter(m => ((WCp.meta && WCp.meta.hiddenPredictions) || []).indexOf(m.key) < 0);
  const open = markets.filter(m => !isResolved(m));
  const graded = markets.filter(m => isResolved(m));
  const made = Sp.madeVisiblePredictions ? Sp.madeVisiblePredictions(me) : (me.picks ? Object.keys(me.picks).filter(k => me.picks[k] != null && (!Array.isArray(me.picks[k]) || me.picks[k].length)).length : 0);
  const missing = open.filter(m => !pickComplete(m, me.picks || {}));
  const allOpenMade = open.length > 0 && missing.length === 0;
  const nextMissing = missing[0];
  const predDeadline = WCp.meta && WCp.meta.predDeadline;
  const deadlinePassed = predDeadline && new Date() > new Date(predDeadline);
  const locked = Sp.predictionsLocked ? Sp.predictionsLocked() : (!!(WCp.meta && WCp.meta.predictionsLocked) || !!deadlinePassed);
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
            {made} of {markets.length} made · {missing.length ? missing.length + ' still to call' : 'all open calls in'} · {Sp.predScoreOf(me)} pts banked
          </div>
        </div>
      </div>
      {locked && <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--ink)', color: '#fff', borderRadius: 13, padding: '10px 13px', marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <span style={{ fontSize: 18 }}>🔒</span>
        <span>{deadlinePassed ? 'Predictions are locked — deadline has passed.' : 'Predictions are locked by the organiser.'}</span>
      </div>}
      {!locked && predDeadline && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 10, padding: '7px 12px', background: 'rgba(245,200,0,.2)', borderRadius: 10 }}>
        Picks lock at {fmtDeadline(predDeadline)} — get yours in.
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
      <Saysp mood="mischievous" label="on the record" animate>{WCp.LINES.predOpen}</Saysp>
      <SHp aside={open.length ? (missing.length ? missing.length + ' left' : 'all in') : 'closed'}>{allOpenMade ? 'Review your calls' : 'Make your call'}</SHp>
      {open.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} locked={locked} />)}
      {graded.length > 0 && <>
        <SHp aside="graded">Already settled</SHp>
        {graded.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} locked={locked} />)}
      </>}
      <SHp aside="org-wide">Prediction league</SHp>
      <PredLeaderboard me={me} />
      <div style={{ height: 14 }} />
      <Saysp mood="confident" compact>Every point's logged. Wheesht remembers. Especially the bad calls.</Saysp>
    </div>
  );
}

window.PredictionsScreen = PredictionsScreen;
