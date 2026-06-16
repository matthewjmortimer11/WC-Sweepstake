/* ===========================================================================
   COMPETITION LAYER — "My Group" & "My Rivals".

   Reframes the World Cup group your drawn team sits in as your personal
   rivalry pod: the other teams in your group are owned by other players in
   your sweepstake, so the group table IS the competition. Built entirely from
   the fixtures the client already holds (no new server data) — group points,
   qualification status, must-win games, rival gaps and recent movement are all
   derived from finished group results.
   =========================================================================== */
const WCc = window.WC;
const Sc = window.Store;
const Wc = window.Wheesht;
const { Card: Cc, Btn: Bc, Flag: Fc, Avatar: Ac, Chip: Chc, Stamp: Stc, ProgressRing: PRc, WheeshtSays: Saysc, SectionHead: SHc } = window;
const { useState: cgState } = React;

function keepCompetitionScroll(fn) {
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  fn();
  window.requestAnimationFrame(function() {
    window.scrollTo(0, y);
    window.requestAnimationFrame(function() { window.scrollTo(0, y); });
  });
}

/* ---- standings maths (client-side, results-driven) ---------------------- */
function cmpRec(a, b) {
  if (b.Pts !== a.Pts) return b.Pts - a.Pts;
  const gda = a.GF - a.GA, gdb = b.GF - b.GA;
  if (gdb !== gda) return gdb - gda;
  if (b.GF !== a.GF) return b.GF - a.GF;
  return a.team.name.localeCompare(b.team.name);
}
function oddsVal(t) { const n = parseInt(String(t.odds || '0').replace(/[^0-9]/g, ''), 10); return isFinite(n) ? n : 999999; }
function emptyRec(t) { return { code: t.code, team: t, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }; }
function compKickoffMs(f) {
  try {
    const tm = (f && f.time && /^\d{2}:\d{2}/.test(f.time)) ? f.time.slice(0, 5) : '00:00';
    const t = new Date(((f && f.dateISO) || '') + 'T' + tm + ':00').getTime();
    return isFinite(t) ? t : null;
  } catch (e) { return null; }
}
function compStatus(f) {
  const raw = String((f && f.status) || 'upcoming');
  const st = raw.toLowerCase();
  if (['done', 'ft', 'fulltime', 'full_time', 'full-time', 'finished'].indexOf(st) >= 0) return 'done';
  if (['halftime', 'half_time', 'half-time'].indexOf(st) >= 0) return 'halfTime';
  if (['live', 'inplay', 'in_play', 'in-progress', 'inprogress', 'paused'].indexOf(st) >= 0) return 'live';
  const ko = compKickoffMs(f);
  if (ko == null) return raw;
  const age = Date.now() - ko;
  if (age < 0) return 'upcoming';
  if (age <= 135 * 60 * 1000) return 'live';
  return 'needsResult';
}
function compFixtureDone(f) { return compStatus(f) === 'done' && f.score && f.score[0] != null && f.score[1] != null; }
function compFixturePlayable(f) { const st = compStatus(f); return st === 'upcoming' || st === 'live' || st === 'halfTime'; }
function compFixtureSort(a, b) { return (compKickoffMs(a) || 0) - (compKickoffMs(b) || 0); }

function tallyTable(teams, fixtures, byOddsIfEmpty) {
  const rec = {}; teams.forEach(t => rec[t.code] = emptyRec(t));
  fixtures.forEach(f => {
    if (!compFixtureDone(f)) return;
    const A = rec[f.a], B = rec[f.b]; if (!A || !B) return;
    const ga = f.score[0], gb = f.score[1];
    A.P++; B.P++; A.GF += ga; A.GA += gb; B.GF += gb; B.GA += ga;
    if (ga > gb) { A.W++; B.L++; A.Pts += 3; }
    else if (gb > ga) { B.W++; A.L++; B.Pts += 3; }
    else { A.D++; B.D++; A.Pts++; B.Pts++; }
  });
  const ranked = Object.keys(rec).map(k => rec[k]);
  const anyPlayed = ranked.some(r => r.P > 0);
  ranked.sort((a, b) => (!anyPlayed && byOddsIfEmpty) ? (oddsVal(a.team) - oddsVal(b.team)) : cmpRec(a, b));
  ranked.forEach((r, i) => r.pos = i + 1);
  return ranked;
}

function groupModel(groupId) {
  const teams = WCc.TEAM_LIST.filter(t => t.group === groupId);
  const fixtures = (WCc.FIXTURES || []).filter(f => f.stage === 'group' && f.group === groupId).slice().sort(compFixtureSort);
  const doneFx = fixtures.filter(compFixtureDone);
  const ranked = tallyTable(teams, fixtures, true);
  // Previous standings (exclude the latest finished matchday) → recent movement.
  let latestMd = 0; doneFx.forEach(f => { if ((f.matchday || 0) > latestMd) latestMd = f.matchday || 0; });
  const prevFx = doneFx.filter(f => (f.matchday || 0) < latestMd);
  const prevRanked = tallyTable(teams, prevFx, false);
  const prevPos = {}; prevRanked.forEach(r => prevPos[r.code] = r.pos);
  ranked.forEach(r => { r.prevPos = prevFx.length ? (prevPos[r.code] || r.pos) : r.pos; r.move = r.prevPos - r.pos; });
  return { groupId, teams, fixtures, ranked, played: doneFx.length, total: fixtures.length, latestMd, hasResults: doneFx.length > 0 };
}

function ownersByCode() {
  const all = (Sc && Sc.allSync) ? Sc.allSync() : (WCc.PEOPLE || []);
  const map = {}; all.forEach(p => { (map[p.team] = map[p.team] || []).push(p); });
  return map;
}
function ownerLabel(owners, code, meId) {
  const list = owners[code] || [];
  if (!list.length) return { name: 'Unclaimed', mine: false, extra: 0, person: null };
  const mine = list.some(p => p.id === meId);
  const primary = mine ? list.find(p => p.id === meId) : list[0];
  const nm = (Sc && Sc.shownName) ? Sc.shownName(primary) : primary.name;
  return { name: nm, mine: mine, extra: list.length - 1, person: primary };
}

/* ---- qualification read (honest, non-speculative) ----------------------- */
function qualStatus(t, G, mePos, gamesLeft) {
  if (!t.alive) return { label: 'Eliminated', tone: 'red', mood: 'crying', mustWin: false, detail: 'Out of the group. The predictions league is still live, mind.' };
  if (t.rounds >= 1) return { label: 'Through to the knockouts', tone: 'green', mood: 'celebrating', mustWin: false, detail: 'Group survived. Now it gets serious.' };
  if (!G.hasResults) return { label: 'Not started', tone: 'ghost', mood: 'confident', mustWin: false, detail: 'No ball kicked yet. Everything to play for.' };
  if (mePos <= 2) return { label: 'In a qualifying spot', tone: 'green', mood: 'confident', mustWin: false, detail: 'Top two go through. Hold your nerve.' };
  if (mePos === 3) return { label: 'On the bubble', tone: 'yellow', mood: 'nervous', mustWin: gamesLeft > 0, detail: gamesLeft > 0 ? 'Outside the top two — a win pulls you back in.' : '3rd place. Sweating on a best-third spot.' };
  return { label: gamesLeft > 0 ? 'Must win' : 'All but out', tone: 'red', mood: 'shocked', mustWin: gamesLeft > 0, detail: gamesLeft > 0 ? 'Bottom of the group. Win or you are gone.' : 'Bottom with no games left.' };
}

/* ---- small UI bits ------------------------------------------------------ */
function MoveTag(props) {
  const m = props.move;
  if (!props.show || !m) return <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink2)', width: 26, textAlign: 'center' }}>–</span>;
  const up = m > 0;
  return <span style={{ fontSize: 11, fontWeight: 900, width: 26, textAlign: 'center', color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '▲' : '▼'}{Math.abs(m)}</span>;
}

function RivalCard(props) {
  const { row, owner, kind, gap, show } = props;
  if (!row) return null;
  const catchUp = kind === 'above';
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '2.5px solid var(--ink)', borderRadius: 16, padding: '11px 12px', boxShadow: '0 4px 0 var(--shadow)' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: catchUp ? 'var(--red)' : 'var(--green)' }}>
        {catchUp ? '↑ Catch them' : '↓ Holding off'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
        <Fc team={row.team} size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dh" style={{ fontSize: 15, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.team.name}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {owner.mine ? 'you' : owner.name}{owner.extra > 0 ? ' +' + owner.extra : ''}
          </div>
        </div>
        <MoveTag move={row.move} show={show} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, borderTop: '1.5px solid var(--line)', paddingTop: 8 }}>
        <div style={{ flex: 1 }}>
          <div className="dh" style={{ fontSize: 19, color: catchUp ? 'var(--red)' : 'var(--green)' }}>{gap === 0 ? 'Level' : (catchUp ? '+' : '') + gap + (catchUp ? '' : ' pt' + (gap === 1 ? '' : 's'))}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink2)' }}>{catchUp ? (gap === 0 ? 'on points — edge it' : 'points behind') : (gap === 0 ? 'dead level' : 'ahead — for now')}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink2)' }}>P{row.pos}</span>
      </div>
    </div>
  );
}

function StatPill(props) {
  return (
    <div style={{ flex: '1 0 46%', background: 'var(--bg)', border: '2px solid var(--line)', borderRadius: 13, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ fontSize: 19 }}>{props.icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink2)' }}>{props.label}</div>
        <div className="dh" style={{ fontSize: 15, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{props.value}</div>
      </div>
    </div>
  );
}

/* ---- the dashboard ------------------------------------------------------ */
function MyGroupDashboard(props) {
  const me = props.me;
  const [selectedPerson, setSelectedPerson] = cgState(null);
  const t = WCc.TEAMS[me.team];
  if (!t) return <div className="pad"><Saysc mood="neutral" compact>No team drawn yet — once you are in the draw your group appears here.</Saysc></div>;

  const G = groupModel(t.group);
  const owners = ownersByCode();
  const meRow = G.ranked.find(r => r.code === t.code) || G.ranked[G.ranked.length - 1];
  const mePos = meRow ? meRow.pos : G.ranked.length;
  const rivalAbove = G.ranked.find(r => r.pos === mePos - 1);
  const rivalBelow = G.ranked.find(r => r.pos === mePos + 1);
  const leader = G.ranked[0];
  const showMove = G.hasResults && G.latestMd > 1;

  const myFix = G.fixtures.filter(f => f.a === t.code || f.b === t.code).slice().sort(compFixtureSort);
  const futureFix = myFix.filter(compFixturePlayable);
  const gamesLeft = futureFix.length;
  const status = qualStatus(t, G, mePos, gamesLeft);
  const nextFix = futureFix[0];
  const nextStatus = nextFix ? compStatus(nextFix) : '';
  const nextLabel = nextStatus === 'live' ? 'LIVE NOW' : nextStatus === 'halfTime' ? 'HALF-TIME' : (status.mustWin ? 'MUST-WIN GAME' : 'YOUR NEXT GROUP GAME');
  const nextOpp = nextFix ? WCc.TEAMS[nextFix.a === t.code ? nextFix.b : nextFix.a] : null;
  const staleFix = myFix.find(f => compStatus(f) === 'needsResult');
  const staleOpp = staleFix ? WCc.TEAMS[staleFix.a === t.code ? staleFix.b : staleFix.a] : null;

  // movers within the group (only meaningful once a 2nd matchday exists)
  let biggestMover = null, biggestFaller = null;
  if (showMove) {
    G.ranked.forEach(r => {
      if (r.move > 0 && (!biggestMover || r.move > biggestMover.move)) biggestMover = r;
      if (r.move < 0 && (!biggestFaller || r.move < biggestFaller.move)) biggestFaller = r;
    });
  }
  const totalGoals = G.ranked.reduce((a, r) => a + r.GF, 0);

  const aboveGap = rivalAbove ? (rivalAbove.Pts - meRow.Pts) : 0;
  const belowGap = rivalBelow ? (meRow.Pts - rivalBelow.Pts) : 0;

  return (
    <div className="pad">
      {/* ===== HERO — the 5-second read ===== */}
      <Cc bordered className="pop" style={{ background: 'var(--ink)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--yellow)' }}>
              GROUP {t.group} · {G.hasResults ? 'MATCHDAY ' + G.latestMd + ' OF 3' : 'NOT STARTED'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Fc team={t} size={42} />
              <div style={{ minWidth: 0 }}>
                <div className="dh" style={{ fontSize: 26, color: '#fff', lineHeight: 1 }}>{t.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>your team</div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.1)', borderRadius: 14, padding: '8px 12px', flex: '0 0 auto' }}>
            <div className="dh" style={{ fontSize: 30, color: '#fff', lineHeight: 1 }}>{mePos}<span style={{ fontSize: 14, color: 'rgba(255,255,255,.55)' }}>/{G.ranked.length}</span></div>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', color: 'var(--yellow)' }}>POSITION</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <Chc tone={status.tone} style={{ flex: '0 0 auto' }}>{status.label}</Chc>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <span className="dh" style={{ fontSize: 22, color: 'var(--yellow)' }}>{G.hasResults ? meRow.Pts : '–'}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.6)', marginLeft: 4 }}>PTS</span>
          </div>
        </div>

        {/* who to beat / who's chasing — packed mini line */}
        {G.hasResults && (rivalAbove || rivalBelow) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {rivalAbove
              ? <div style={{ flex: 1, background: 'rgba(232,39,42,.18)', borderRadius: 11, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: '#ffb3b4', letterSpacing: '.04em' }}>↑ TO BEAT</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rivalAbove.team.name} <span style={{ color: 'var(--yellow)' }}>+{aboveGap}</span></div>
                </div>
              : <div style={{ flex: 1, background: 'rgba(26,122,68,.22)', borderRadius: 11, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: '#9be8b8', letterSpacing: '.04em' }}>★ TOP OF THE GROUP</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Nobody above you</div>
                </div>}
            {rivalBelow &&
              <div style={{ flex: 1, background: 'rgba(255,255,255,.1)', borderRadius: 11, padding: '8px 10px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,.6)', letterSpacing: '.04em' }}>↓ CHASING YOU</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rivalBelow.team.name} <span style={{ color: 'var(--yellow)' }}>{belowGap === 0 ? 'level' : '−' + belowGap}</span></div>
              </div>}
          </div>
        )}
      </Cc>

      {/* ===== MUST-WIN / NEXT GAME ===== */}
      {nextFix && nextOpp && t.alive && (
        <Cc bordered style={{ marginTop: 12, background: status.mustWin ? 'var(--red)' : 'var(--yellow)', color: status.mustWin ? '#fff' : 'var(--ink)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className={status.mustWin ? 'flame' : ''} style={{ fontSize: 30 }}>{status.mustWin ? '🔥' : '⚽'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em' }}>
                {nextLabel} · {nextFix.dateLabel} · {nextFix.time}
              </div>
              <div className="dh" style={{ fontSize: 19, marginTop: 2, lineHeight: 1 }}>{t.name} <span style={{ opacity: .55 }}>v</span> {nextOpp.name} {nextOpp.flag}</div>
            </div>
          </div>
        </Cc>
      )}

      {!nextFix && staleFix && staleOpp && t.alive && (
        <Cc bordered style={{ marginTop: 12, background: 'var(--yellow)', color: 'var(--ink)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ fontSize: 30 }}>⏱</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em' }}>
                RESULT NEEDED · {staleFix.dateLabel} · {staleFix.time}
              </div>
              <div className="dh" style={{ fontSize: 19, marginTop: 2, lineHeight: 1 }}>{t.name} <span style={{ opacity: .55 }}>v</span> {staleOpp.name} {staleOpp.flag}</div>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Once the score is entered, the table and rivals will update.</div>
            </div>
          </div>
        </Cc>
      )}

      {/* ===== THE GROUP TABLE ===== */}
      <SHc aside={G.hasResults ? G.played + ' of ' + G.total + ' played' : 'predicted order'}>The group table</SHc>
      <Cc flat style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 7px', borderBottom: '2px solid var(--line)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', color: 'var(--ink2)', textTransform: 'uppercase' }}>
          <span style={{ width: 18, textAlign: 'center' }}>#</span>
          <span style={{ width: 26 }}> </span>
          <span style={{ flex: 1 }}>Team · owner</span>
          <span style={{ width: 22, textAlign: 'center' }}>P</span>
          <span style={{ width: 28, textAlign: 'center' }}>GD</span>
          <span style={{ width: 28, textAlign: 'center' }}>Pts</span>
        </div>
        {G.ranked.map((r, i) => {
          const o = ownerLabel(owners, r.code, me.id);
          const isMe = r.code === t.code;
          const qualifies = r.pos <= 2;
          const gd = r.GF - r.GA;
          return (
            <React.Fragment key={r.code + '-' + r.pos}>
              <div className={showMove && r.move > 0 ? 'lb-up' : showMove && r.move < 0 ? 'lb-dn' : ''} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 2px', borderRadius: 9, margin: '2px 0', background: isMe ? 'rgba(245,200,0,.22)' : 'transparent', opacity: r.team.alive ? 1 : .5 }}>
                <span className="dh" style={{ width: 18, textAlign: 'center', fontSize: 15, color: qualifies && G.hasResults ? 'var(--green)' : 'var(--ink2)' }}>{r.pos}</span>
                <MoveTag move={r.move} show={showMove} />
                <Fc team={r.team} size={22} />
                <div style={{ flex: 1, minWidth: 0, marginLeft: 2 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.team.name}{r.pos === 1 && G.hasResults ? ' 👑' : ''}{isMe ? <span style={{ color: 'var(--red)' }}> · YOU</span> : ''}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.person
                      ? <button onClick={() => keepCompetitionScroll(function(){ setSelectedPerson(selectedPerson && selectedPerson.id === o.person.id ? null : o.person); })} style={{ border: 'none', background: 'none', padding: 0, margin: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textDecoration: 'underline', textDecorationThickness: 1, textUnderlineOffset: 2 }}>
                          {o.mine ? 'you' : o.name}{o.extra > 0 ? ' +' + o.extra : ''}
                        </button>
                      : o.name}
                  </div>
                </div>
                <span style={{ width: 22, textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)' }}>{G.hasResults ? r.P : '–'}</span>
	                <span style={{ width: 28, textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)' }}>{G.hasResults ? (gd > 0 ? '+' + gd : gd) : '–'}</span>
	                <span className="dh" style={{ width: 28, textAlign: 'center', fontSize: 16, color: isMe ? 'var(--red)' : 'var(--ink)' }}>{G.hasResults ? r.Pts : '–'}</span>
	              </div>
              {selectedPerson && o.person && selectedPerson.id === o.person.id && window.PersonSnapshot && <window.PersonSnapshot inline person={(Sc.getSync && Sc.getSync(o.person.id)) || o.person} onClose={() => keepCompetitionScroll(function(){ setSelectedPerson(null); })} />}
	              {i === 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '3px 0', padding: '0 2px' }}>
	                <div style={{ flex: 1, borderTop: '2px dashed var(--green)' }} />
	                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'var(--green)' }}>QUALIFY ↑</span>
	              </div>}
            </React.Fragment>
          );
        })}
      </Cc>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginTop: 7, lineHeight: 1.35 }}>
        Top two qualify automatically. Third can still sneak through as one of the best third-placed teams.
      </div>

      {/* ===== MY RIVALS ===== */}
      {G.hasResults && (rivalAbove || rivalBelow) && <>
        <SHc aside="above & below you">My rivals</SHc>
        <div style={{ display: 'flex', gap: 9 }}>
          {rivalAbove
            ? <RivalCard row={rivalAbove} owner={ownerLabel(owners, rivalAbove.code, me.id)} kind="above" gap={aboveGap} show={showMove} />
            : <div style={{ flex: 1, background: 'rgba(26,122,68,.1)', border: '2.5px solid var(--green)', borderRadius: 16, padding: '11px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: 22 }}>👑</div>
                <div className="dh" style={{ fontSize: 15, marginTop: 2 }}>Group leader</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>Nobody to catch. Stay there.</div>
              </div>}
          {rivalBelow
            ? <RivalCard row={rivalBelow} owner={ownerLabel(owners, rivalBelow.code, me.id)} kind="below" gap={belowGap} show={showMove} />
            : <div style={{ flex: 1, background: 'var(--bg)', border: '2.5px solid var(--line)', borderRadius: 16, padding: '11px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: 22 }}>🪤</div>
                <div className="dh" style={{ fontSize: 15, marginTop: 2 }}>Rock bottom</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>Nobody chasing — only up from here.</div>
              </div>}
        </div>
      </>}

      {/* ===== GROUP STATS ===== */}
      <SHc aside="the group at a glance">Group statistics</SHc>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <StatPill icon="👑" label="Group leader" value={leader ? leader.team.name : '—'} />
        <StatPill icon="⚽" label="Goals so far" value={G.hasResults ? totalGoals + ' in ' + G.played : 'None yet'} />
        <StatPill icon="📈" label="Biggest mover" value={biggestMover ? biggestMover.team.name + ' ▲' + biggestMover.move : '—'} />
        <StatPill icon="📉" label="Biggest faller" value={biggestFaller ? biggestFaller.team.name + ' ▼' + Math.abs(biggestFaller.move) : '—'} />
      </div>

      <div style={{ height: 14 }} />
      <Saysc mood={status.mood} label="your group" animate>
        {status.detail}{rivalAbove && status.mustWin ? ' Beat ' + rivalAbove.team.name + ' and the maths changes fast.' : ''}
      </Saysc>
    </div>
  );
}

/* ---- screen shell: My Group ⇄ Everyone ---------------------------------- */
function CompetitionScreen() {
  const me = Sc.active();
  const [view, setView] = cgState('group');
  if (!me) return null;
  const tabs = [['group', 'My Group'], ['directory', 'Everyone']];
  return (
    <>
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {tabs.map(([k, lab]) => (
            <button key={k} onClick={() => setView(k)} className="wc-btn wc-btn--sm"
              style={{ flex: 1, background: view === k ? 'var(--yellow)' : '#fff', boxShadow: view === k ? '0 4px 0 var(--ink)' : '0 4px 0 var(--shadow)' }}>
              {lab}
            </button>
          ))}
        </div>
      </div>
      {view === 'group' ? <MyGroupDashboard me={me} /> : <window.TrackerScreen />}
    </>
  );
}

window.MyGroupDashboard = MyGroupDashboard;
window.CompetitionScreen = CompetitionScreen;
window.WheeshtCompetition = {
  groupModel: groupModel,
  ownersByCode: ownersByCode,
  ownerLabel: ownerLabel,
  compStatus: compStatus,
  compFixturePlayable: compFixturePlayable,
  compFixtureSort: compFixtureSort,
};
