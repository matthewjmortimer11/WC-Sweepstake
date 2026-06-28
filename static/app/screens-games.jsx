/* ===========================================================================
   GAMES — upcoming fixtures tracker.
   Group stage and knockout schedules with date grouping, status, and filters.
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
  (Sg ? Sg.allSync() : WCg.PEOPLE).forEach(function (p) {
    if (p.alive === false) return;
    var t = WCg.TEAMS[p.team];
    if (t && t.alive === false) return;
    set[p.team] = (set[p.team] || 0) + 1;
  });
  return set;
}
function statusOf(f) {
  const raw = String((f && f.status) || 'upcoming').toLowerCase();
  if (['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(raw) >= 0) return 'done';
  if (['halftime', 'half_time', 'half-time', 'ht', 'paused'].indexOf(raw) >= 0) return 'halfTime';
  if (['live', 'inplay', 'in_play', 'in-progress', 'inprogress', '1h', '2h'].indexOf(raw) >= 0) return 'live';
  return raw || 'upcoming';
}
function isKnockoutFixture(f) {
  return f && f.stage && f.stage !== 'group';
}
function tournamentPhase() {
  if (Sg && Sg.tournamentPhase) return Sg.tournamentPhase();
  return (WCg.meta && WCg.meta.tournamentPhase) || (WCg.meta && WCg.meta.groupsComplete ? 'group_complete' : 'group');
}
function koStageLabel(f) {
  var labels = (WCg.meta && WCg.meta.stageLabels) || {};
  var st = (f && f.stage) || 'group';
  if (st === 'group') return 'Group ' + (f.group || '?');
  return labels[st] || st.toUpperCase();
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
  const ko = isKnockoutFixture(f);
  return (
    <Cg flat style={{ padding: '12px 14px', marginBottom: 9, border: mine ? '2.5px solid var(--ink)' : '2px solid var(--line)', boxShadow: mine ? '0 4px 0 var(--shadow)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Chg tone="ghost">{ko ? koStageLabel(f) : ('Group ' + f.group)}</Chg>
          {!ko && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>MD{f.matchday}</span>}
          {mine && <Chg tone="yellow">Your team</Chg>}
          {f.projectedPairing && <Chg tone="ghost">From standings</Chg>}
        </div>
        {st === 'done' && f.score
          ? <Chg tone="ink">FT {f.score[0]}–{f.score[1]}</Chg>
          : st === 'halfTime'
            ? <Chg tone="yellow">HT {f.score ? f.score[0] + '–' + f.score[1] : ''}</Chg>
          : st === 'live'
            ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)' }}>● LIVE</span>
            : <span style={{ fontSize: 12, fontWeight: 800 }}>{f.time || 'TBC'}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '2px 0' }}>
        <TeamLine code={f.a} owners={oa} />
        <span className="dh" style={{ fontSize: 14, color: 'var(--ink2)', padding: '8px 2px 0' }}>v</span>
        <TeamLine code={f.b} owners={ob} />
      </div>
      {f.venue && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, fontSize: 11, fontWeight: 600, color: 'var(--ink2)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.venue}</span>
      </div>}
    </Cg>
  );
}

function NextUp(props) {
  const f = props.f; if (!f) return null;
  const ta = gameTeam(f.a), tb = gameTeam(f.b);
  const ko = props.knockout;
  return (
    <Cg bordered style={{ background: 'var(--ink)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--yellow)', textTransform: 'uppercase' }}>{props.label || 'First whistle'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, opacity: .8 }}>{f.dateLabel || 'TBC'}{f.time ? ' · ' + f.time : ''}</span>
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
      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, opacity: .75 }}>
        {ko ? (props.stageLabel || koStageLabel(f)) : ('Group ' + f.group + (f.venue ? ' · ' + f.venue : ''))}
        {props.projected ? ' · pairing from standings' : ''}
      </div>
      {props.nextLine && <div style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, opacity: .65, marginTop: 8 }}>{props.nextLine}</div>}
    </Cg>
  );
}

function GamesScreen() {
  const me = Sg ? Sg.active() : null;
  const mineTeam = me ? me.team : null;
  const myTeamObj = mineTeam ? WCg.TEAMS[mineTeam] : null;
  const stillIn = me && me.alive !== false && myTeamObj && myTeamObj.alive !== false;
  const phase = tournamentPhase();
  const koPhase = phase === 'knockout' || phase === 'group_complete';
  const defaultFilter = koPhase && mineTeam && stillIn ? 'mine' : 'all';
  const [filter, setFilter] = gState(defaultFilter);
  const [showGroup, setShowGroup] = gState(false);
  const owned = ownedSet();
  const all = (WCg.FIXTURES || []).slice();
  const koFixtures = (Sg && Sg.buildKnockoutFixtureList)
    ? Sg.buildKnockoutFixtureList()
    : all.filter(isKnockoutFixture);
  const groupFixtures = all.filter(function (f) { return !isKnockoutFixture(f); });
  const fxApi = window.WheeshtFixtures || {};
  const koOrderKey = fxApi.knockoutFixtureOrderKey || function (f) { return String(f.id || (f.stage + '|' + f.a + '|' + f.b)); };
  const koOrder = {};
  koFixtures.forEach(function (f, i) { koOrder[koOrderKey(f)] = i; });

  let list = koPhase && !showGroup ? koFixtures.slice() : groupFixtures.slice();
  if (filter === 'mine' && mineTeam) list = list.filter(function (f) { return f.a === mineTeam || f.b === mineTeam; });
  else if (filter === 'owned') list = list.filter(function (f) { return owned[f.a] || owned[f.b]; });

  if (koPhase && !showGroup) {
    list.sort(function (a, b) {
      var ia = koOrder[koOrderKey(a)];
      var ib = koOrder[koOrderKey(b)];
      if (ia == null && ib == null) return 0;
      if (ia == null) return 1;
      if (ib == null) return -1;
      return ia - ib;
    });
  } else if (fxApi.sortKnockoutFixtures && list.some(isKnockoutFixture)) {
    list = fxApi.sortKnockoutFixtures(list);
  }

  const upcoming = (koPhase && !showGroup ? koFixtures : all).filter(function (f) { return statusOf(f) !== 'done'; });
  const path = (mineTeam && Sg && Sg.knockoutPathForTeam) ? Sg.knockoutPathForTeam(mineTeam) : null;
  const pathCur = path && path.current;
  const nextMineFromPath = pathCur && pathCur.fixture ? pathCur.fixture : null;
  const nextOverall = upcoming[0];
  const nextMine = nextMineFromPath || (mineTeam ? upcoming.find(function (f) { return f.a === mineTeam || f.b === mineTeam; }) : null);

  const byDate = [];
  const seen = {};
  list.forEach(function (f) {
    var key = koPhase && !showGroup
      ? (f.dateISO || ('tbc|' + (f.stage || 'ko')))
      : (f.dateISO || ('tbc-' + (f.stage || 'ko')));
    if (!seen[key]) {
      seen[key] = {
        label: f.dateLabel || (f.dateISO ? f.dateLabel : (koStageLabel(f) + ' · date TBC')),
        items: [],
        sortKey: f.dateISO || ('z-' + String({ r32: 1, r16: 2, qf: 3, sf: 4, final: 5, third: 6 }[f.stage] || 9).padStart(2, '0')),
      };
      byDate.push(seen[key]);
    }
    seen[key].items.push(f);
  });
  function minKoOrder(items) {
    var min = 99999;
    items.forEach(function (f) {
      var o = koOrder[koOrderKey(f)];
      if (o != null && o < min) min = o;
    });
    return min;
  }
  byDate.sort(function (a, b) {
    if (koPhase && !showGroup) return minKoOrder(a.items) - minKoOrder(b.items);
    return String(a.sortKey).localeCompare(String(b.sortKey));
  });
  byDate.forEach(function (day) {
    day.items.sort(function (a, b) {
      var ia = koOrder[koOrderKey(a)];
      var ib = koOrder[koOrderKey(b)];
      if (ia == null || ib == null) return 0;
      return ia - ib;
    });
  });

  const filters = koPhase && !showGroup
    ? [['all', 'All knockouts'], ['owned', 'In the draw'], ['mine', 'My team']]
    : [['all', 'All games'], ['owned', 'In the draw'], ['mine', 'My team']];

  const stageLbl = (WCg.meta && WCg.meta.stageLabel) || 'Knockout stage';
  const title = koPhase && !showGroup ? 'Knockout fixtures' : 'Upcoming games';
  const subtitle = koPhase && !showGroup
    ? (koFixtures.length
      ? stageLbl + ' · ' + koFixtures.length + ' ties' + (koFixtures.some(function (f) { return f.projectedPairing; }) ? ' (includes standings pairings)' : '')
      : 'R32 pairings coming — check the bracket on Me')
    : (groupFixtures.length + ' group-stage fixtures · kick-off ' + (WCg.meta.kickoff || 'soon'));

  return (
    <div className="pad">
      <div className="appbar" style={{ padding: '2px 0 12px' }}>
        <div>
          <div className="dh" style={{ fontSize: 26 }}>{title}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>{subtitle}</div>
        </div>
      </div>

      {koPhase && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
          <button onClick={function () { setShowGroup(false); }} className={'wc-chip' + (!showGroup ? ' wc-chip--yellow' : '')} style={{ cursor: 'pointer' }}>Knockouts</button>
          <button onClick={function () { setShowGroup(true); }} className={'wc-chip' + (showGroup ? ' wc-chip--yellow' : '')} style={{ cursor: 'pointer' }}>Group stage</button>
        </div>
      )}

      {nextMine
        ? <NextUp
            f={nextMine}
            label={mineTeam ? ('Your ' + gameTeam(mineTeam).name + ' play next') : 'First whistle'}
            knockout={koPhase && !showGroup}
            stageLabel={pathCur && pathCur.stageLabel}
            projected={pathCur && pathCur.projected}
            nextLine={path && path.next ? ('If you win → ' + path.next.stageLabel + ': ' + path.next.description) : null}
          />
        : (phase === 'group_complete' && !showGroup && mineTeam && path && path.current)
          ? <NextUp
              f={{ a: mineTeam, b: path.current.opponent.code, dateLabel: path.current.fixture && path.current.fixture.dateLabel, time: path.current.fixture && path.current.fixture.time }}
              label={'Your ' + gameTeam(mineTeam).name + ' — R32 pairing'}
              knockout={true}
              stageLabel={path.current.stageLabel}
              projected={true}
              nextLine={path.next ? ('If you win → ' + path.next.stageLabel + ': ' + path.next.description) : null}
            />
          : <NextUp f={nextOverall} label="First whistle" knockout={isKnockoutFixture(nextOverall)} />}

      <div style={{ height: 12 }} />
      <Saysg mood="confident" label="fixtures" animate>
        {koPhase && !showGroup
          ? 'Knockout stage is live. Your path shows who you face now — and who could be next if you win.'
          : 'The whole group stage is in. Wheesht has the schedule memorised — and a strong opinion on every game.'}
      </Saysg>

      <div style={{ display: 'flex', gap: 7, padding: '16px 0 12px' }}>
        {filters.map(function (pair) {
          var k = pair[0], lab = pair[1];
          return (
            <button key={k} onClick={function () { setFilter(k); }} disabled={k === 'mine' && !mineTeam}
              className={'wc-chip' + (filter === k ? ' wc-chip--yellow' : '')}
              style={{ whiteSpace: 'nowrap', cursor: 'pointer', flex: '0 0 auto', opacity: (k === 'mine' && !mineTeam) ? .4 : 1 }}>{lab}</button>
          );
        })}
      </div>

      {list.length === 0 &&
        <Cg flat style={{ textAlign: 'center', padding: '26px 16px' }}>
          <Wg mood="neutral" size={64} animate />
          <div className="dh" style={{ fontSize: 17, marginTop: 6 }}>{koPhase && !showGroup ? 'Knockout ties not in the feed yet.' : 'Nothing to show here.'}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 3 }}>
            {koPhase && !showGroup ? 'Check the bracket on Me for projected R32 pairings.' : 'No fixtures match that filter yet.'}
          </div>
        </Cg>}

      {byDate.map(function (day, i) {
        return (
          <div key={i}>
            <SHg aside={day.items.length + ' ' + (day.items.length === 1 ? 'game' : 'games')}>{day.label}</SHg>
            {day.items.map(function (f) { return <FixtureRow key={f.id} f={f} owned={owned} mineTeam={mineTeam} />; })}
          </div>
        );
      })}
    </div>
  );
}

window.GamesScreen = GamesScreen;
