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

function optLabel(m, opt) {
  if (m.kind === 'player') return { main: opt.name, sub: WCp.TEAMS[opt.team] ? WCp.TEAMS[opt.team].name : '', flag: WCp.TEAMS[opt.team] ? WCp.TEAMS[opt.team].flag : '', id: opt.id };
  if (m.kind === 'stage') return { main: opt, sub: '', flag: '', id: opt };
  const t = WCp.TEAMS[opt];
  return { main: t ? t.name : opt, sub: t ? 'Group ' + t.group + ' · ' + t.odds : '', flag: t ? t.flag : '', id: opt };
}

function Market(props) {
  const m = props.market, me = props.me, onPick = props.onPick;
  const resolved = m.answer != null;
  const pick = me.picks ? me.picks[m.key] : null;
  const isTwo = m.kind === 'team2';
  const picked = (id) => isTwo ? (Array.isArray(pick) && pick.indexOf(id) >= 0) : pick === id;
  const correctVal = resolved ? (isTwo ? null : m.answer) : null;
  const gotIt = resolved && (isTwo ? false : pick === m.answer);

  function choose(id) {
    if (resolved) return;
    if (isTwo) {
      let arr = Array.isArray(pick) ? pick.slice() : [];
      if (arr.indexOf(id) >= 0) arr = arr.filter(x => x !== id);
      else { arr.push(id); if (arr.length > 2) arr.shift(); }
      onPick(m.key, arr);
    } else onPick(m.key, picked(id) ? null : id);
  }

  return (
    <Cp style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
        <div className="dh" style={{ fontSize: 17, lineHeight: 1.05 }}>{m.q}</div>
        <Chp tone={resolved ? (gotIt ? 'green' : 'red') : (pick != null && (!isTwo || pick.length === 2) ? 'yellow' : 'ghost')} style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {resolved ? (gotIt ? '+' + m.points + ' pts' : 'Missed') : '+' + m.points + ' pts'}
        </Chp>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 9 }}>
        {resolved ? 'Result is in' : isTwo ? 'Pick the two finalists' : 'Open · tap to pick'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {m.options.map((opt, i) => {
          const o = optLabel(m, opt);
          const on = picked(o.id);
          const isAnswer = resolved && (isTwo ? false : o.id === m.answer);
          const wrong = resolved && on && !isAnswer;
          let bg = '#fff', bd = 'var(--line)';
          if (isAnswer) { bg = 'rgba(26,122,68,.12)'; bd = 'var(--green)'; }
          else if (wrong) { bg = 'rgba(232,39,42,.08)'; bd = 'var(--red)'; }
          else if (on && !resolved) { bg = 'var(--yellow)'; bd = 'var(--ink)'; }
          return (
            <button key={i} onClick={() => choose(o.id)} disabled={resolved} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: resolved ? 'default' : 'pointer',
              textAlign: 'left', border: '2.5px solid ' + bd, borderRadius: 13, background: bg, fontFamily: 'var(--body)', transition: 'all .12s'
            }}>
              {o.flag && <span style={{ fontSize: 24 }}>{o.flag}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{o.main}</div>
                {o.sub && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)' }}>{o.sub}</div>}
              </div>
              {isAnswer && <Chp tone="green" style={{ flex: '0 0 auto' }}>Correct</Chp>}
              {!resolved && <span style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid var(--ink)', background: on ? 'var(--ink)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 900, flex: '0 0 auto' }}>{on ? '✓' : ''}</span>}
            </button>
          );
        })}
      </div>
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
        <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}{isMe && ' (you)'}</div>
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
  const markets = WCp.predictions || Sp.PREDICTIONS;
  const open = markets.filter(m => m.answer == null);
  const graded = markets.filter(m => m.answer != null);
  const made = me.picks ? Object.keys(me.picks).filter(k => me.picks[k] != null && (!Array.isArray(me.picks[k]) || me.picks[k].length)).length : 0;
  function onPick(key, val) { Sp.setPick(me.id, key, val); bump(x => x + 1); }
  return (
    <div className="pad">
      <div className="appbar" style={{ padding: '2px 0 12px' }}>
        <div>
          <div className="dh" style={{ fontSize: 26 }}>Predictions</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>{made} of {markets.length} made · {Sp.predScoreOf(me)} pts banked</div>
        </div>
      </div>
      <Saysp mood="mischievous" label="on the record" animate>{WCp.LINES.predOpen}</Saysp>
      <SHp aside="still open">Make your call</SHp>
      {open.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} />)}
      {graded.length > 0 && <>
        <SHp aside="graded">Already settled</SHp>
        {graded.map(m => <Market key={m.key} market={m} me={me} onPick={onPick} />)}
      </>}
      <SHp aside="org-wide">Prediction league</SHp>
      <PredLeaderboard me={me} />
      <div style={{ height: 14 }} />
      <Saysp mood="confident" compact>Every point's logged. Wheesht remembers. Especially the bad calls.</Saysp>
    </div>
  );
}

window.PredictionsScreen = PredictionsScreen;
