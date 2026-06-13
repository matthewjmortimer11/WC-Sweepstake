/* ===========================================================================
   GAMES — upcoming fixtures tracker.
   The full group-stage schedule with date grouping, status, and filters
   (all / my team / teams in the sweepstake). Highlights games that matter to
   the people who've signed up. Reads WC.FIXTURES + live Store ownership.
   =========================================================================== */
const WCg = window.WC;
const Wg = window.Wheesht;
const Sg = window.Store;
const { Card: Cg, Btn: Bg, Flag: Fg, Chip: Chg, WheeshtSays: Saysg, SectionHead: SHg } = window;
const { useState: gState } = React;

function gameTeam(code) {
  return WCg.TEAMS[code] || { code: code || 'TBD', name: code || 'To be decided', flag: '🏳️' };
}

function ownedSet() {
  var set = {};
  (Sg ? Sg.allSync() : WCg.PEOPLE).forEach(function (p) { set[p.team] = (set[p.team] || 0) + 1; });
  return set;
}
function statusOf(f) {
  return f.status || 'upcoming';
}

function TeamLine(props) {
  const t = gameTeam(props.code); const owners = props.owners;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 30, lineHeight: 1 }}>{t.flag}</span>
      <div style={{ fontWeight: 800, fontSize: 13.5, textAlign: 'center', lineHeight: 1.1, textWrap: 'balance' }}>{t.name}</div>
      {owners > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--red)', letterSpacing: '.02em' }}>{owners} in the draw</div>}
    </div>
  );
}

function FixtureRow(props) {
  const f = props.f; const owned = props.owned;
  const oa = owned[f.a] || 0, ob = owned[f.b] || 0;
  const mine = props.mineTeam && (f.a === props.mineTeam || f.b === props.mineTeam);
  const hot = oa + ob > 0;
  const st = statusOf(f);
  return (
    <Cg flat style={{ padding: '12px 14px', marginBottom: 9, border: mine ? '2.5px solid var(--ink)' : '2px solid var(--line)', boxShadow: mine ? '0 4px 0 var(--shadow)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Chg tone="ghost">Group {f.group}</Chg>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>MD{f.matchday}</span>
          {mine && <Chg tone="yellow">Your team</Chg>}
        </div>
        {st === 'done' && f.score
          ? <Chg tone="ink">FT {f.score[0]}–{f.score[1]}</Chg>
          : st === 'live'
            ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)' }}>● LIVE</span>
            : <span style={{ fontSize: 12, fontWeight: 800 }}>{f.time}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '2px 0' }}>
        <TeamLine code={f.a} owners={oa} />
        <span className="dh" style={{ fontSize: 14, color: 'var(--ink2)', padding: '8px 2px 0' }}>v</span>
        <TeamLine code={f.b} owners={ob} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, fontSize: 11, fontWeight: 600, color: 'var(--ink2)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.venue}</span>
      </div>
    </Cg>
  );
}

function NextUp(props) {
  const f = props.f; if (!f) return null;
  const ta = gameTeam(f.a), tb = gameTeam(f.b);
  return (
    <Cg bordered style={{ background: 'var(--ink)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--yellow)', textTransform: 'uppercase' }}>{props.label || 'First whistle'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, opacity: .8 }}>{f.dateLabel} · {f.time}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, margin: '14px 0 6px' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 40 }}>{ta.flag}</div>
          <div className="dh" style={{ fontSize: 17, color: '#fff' }}>{ta.name}</div>
        </div>
        <span className="dh" style={{ fontSize: 20, color: 'var(--yellow)' }}>v</span>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 40 }}>{tb.flag}</div>
          <div className="dh" style={{ fontSize: 17, color: '#fff' }}>{tb.name}</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, opacity: .75 }}>Group {f.group} · {f.venue}</div>
    </Cg>
  );
}

function GamesScreen() {
  const me = Sg ? Sg.active() : null;
  const mineTeam = me ? me.team : null;
  const [filter, setFilter] = gState('all');
  const owned = ownedSet();
  const all = (WCg.FIXTURES || []).slice();

  let list = all;
  if (filter === 'mine' && mineTeam) list = all.filter(f => f.a === mineTeam || f.b === mineTeam);
  else if (filter === 'owned') list = all.filter(f => owned[f.a] || owned[f.b]);

  // next upcoming overall, and your team's next
  const upcoming = all.filter(f => statusOf(f) !== 'done');
  const nextOverall = upcoming[0];
  const nextMine = mineTeam ? upcoming.find(f => f.a === mineTeam || f.b === mineTeam) : null;

  // group by date
  const byDate = [];
  const seen = {};
  list.forEach(f => {
    if (!seen[f.dateISO]) { seen[f.dateISO] = { label: f.dateLabel, items: [] }; byDate.push(seen[f.dateISO]); }
    seen[f.dateISO].items.push(f);
  });

  const filters = [['all', 'All games'], ['owned', 'In the draw'], ['mine', 'My team']];

  return (
    <div className="pad">
      <div className="appbar" style={{ padding: '2px 0 12px' }}>
        <div>
          <div className="dh" style={{ fontSize: 26 }}>Upcoming games</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>{all.length} group-stage fixtures · kick-off {WCg.meta.kickoff || 'soon'}</div>
        </div>
      </div>

      {nextMine
        ? <NextUp f={nextMine} label={'Your ' + gameTeam(mineTeam).name + ' play next'} />
        : <NextUp f={nextOverall} label="First whistle" />}

      <div style={{ height: 12 }} />
      <Saysg mood="confident" label="fixtures" animate>The whole group stage is in. Wheesht has the schedule memorised — and a strong opinion on every game.</Saysg>

      <div style={{ display: 'flex', gap: 7, padding: '16px 0 12px' }}>
        {filters.map(([k, lab]) => (
          <button key={k} onClick={() => setFilter(k)} disabled={k === 'mine' && !mineTeam}
            className={'wc-chip' + (filter === k ? ' wc-chip--yellow' : '')}
            style={{ whiteSpace: 'nowrap', cursor: 'pointer', flex: '0 0 auto', opacity: (k === 'mine' && !mineTeam) ? .4 : 1 }}>{lab}</button>
        ))}
      </div>

      {list.length === 0 &&
        <Cg flat style={{ textAlign: 'center', padding: '26px 16px' }}>
          <Wg mood="neutral" size={64} animate />
          <div className="dh" style={{ fontSize: 17, marginTop: 6 }}>Nothing to show here.</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>No fixtures match that filter yet.</div>
        </Cg>}

      {byDate.map((day, i) => (
        <div key={i}>
          <SHg aside={day.items.length + ' ' + (day.items.length === 1 ? 'game' : 'games')}>{day.label}</SHg>
          {day.items.map(f => <FixtureRow key={f.id} f={f} owned={owned} mineTeam={mineTeam} />)}
        </div>
      ))}
    </div>
  );
}

window.GamesScreen = GamesScreen;
