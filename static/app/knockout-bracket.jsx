/* ===========================================================================
   KNOCKOUT BRACKET — tree view with round connectors + list fallback.
   Data from WC.FIXTURES via Store.buildKnockoutBracket().
   =========================================================================== */
const WCkb = window.WC;
const Skb = window.Store;
const { Card: Ckb, Flag: Fkb } = window;
const { useState: kbState, useEffect: kbEffect, useRef: kbRef } = React;

var KB_ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'];
var KB_LIST_ORDER = ['r32', 'r16', 'qf', 'sf', 'final', 'third'];
var KB_PREFS_KEY = 'wc-ko-bracket-prefs';
var KB_CELL_H = 46;
var KB_COL_W = 128;
var KB_GAP_W = 32;
var KB_LABEL_H = 26;

function kbFirstRound(rounds) {
  var kr = WCkb.meta && WCkb.meta.knockoutRound;
  if (kr && (rounds[kr] || []).length) return kr;
  var found = KB_LIST_ORDER.find(function (k) { return (rounds[k] || []).length; });
  return found || 'r32';
}

function kbTreeValid(rounds) {
  var counts = KB_ROUND_ORDER.map(function (k) { return (rounds[k] || []).length; }).filter(function (n) { return n > 0; });
  if (counts.length <= 1) return true;
  for (var i = 1; i < counts.length; i++) {
    if (counts[i] !== counts[i - 1] / 2) return false;
  }
  return true;
}

function kbHasFullTree(rounds) {
  return (rounds.r32 || []).length >= 16 && kbTreeValid(rounds);
}

function kbLayoutTree(rounds) {
  var active = KB_ROUND_ORDER.filter(function (k) { return (rounds[k] || []).length; });
  if (!active.length) return null;
  var rootCount = (rounds[active[0]] || []).length;
  var totalH = KB_LABEL_H + Math.max(rootCount * KB_CELL_H, KB_CELL_H);
  var cols = [];
  active.forEach(function (stage, colIdx) {
    var ties = rounds[stage] || [];
    var mult = Math.pow(2, colIdx);
    var slotSpan = KB_CELL_H * mult;
    var slots = ties.map(function (tie, i) {
      return {
        tie: tie,
        top: KB_LABEL_H + i * slotSpan * 2 + (slotSpan - KB_CELL_H) / 2,
      };
    });
    cols.push({
      stage: stage,
      slots: slots,
      left: colIdx * (KB_COL_W + KB_GAP_W),
    });
  });
  var links = [];
  for (var c = 0; c < cols.length - 1; c++) {
    var leftCol = cols[c];
    var rightCol = cols[c + 1];
    var x0 = leftCol.left + KB_COL_W;
    var x2 = rightCol.left;
    var xm = x0 + KB_GAP_W / 2;
    rightCol.slots.forEach(function (rSlot, ri) {
      var s1 = leftCol.slots[ri * 2];
      var s2 = leftCol.slots[ri * 2 + 1];
      if (!s1 && !s2) return;
      var y1 = s1 ? s1.top + KB_CELL_H / 2 : (s2.top + KB_CELL_H / 2);
      var y2 = s2 ? s2.top + KB_CELL_H / 2 : y1;
      var yMid = rSlot.top + KB_CELL_H / 2;
      var d = '';
      if (s1) d += 'M' + x0 + ' ' + y1 + ' H' + xm + ' ';
      if (s2) d += 'M' + x0 + ' ' + y2 + ' H' + xm + ' ';
      if (s1 && s2) d += 'M' + xm + ' ' + y1 + ' V' + y2 + ' ';
      d += 'M' + xm + ' ' + yMid + ' H' + x2;
      links.push({ d: d.trim() });
    });
  }
  var totalW = cols.length * KB_COL_W + Math.max(0, cols.length - 1) * KB_GAP_W;
  return { cols: cols, links: links, totalH: totalH, totalW: totalW, active: active };
}

function kbPathHighlight(rounds) {
  var me = (Skb && Skb.active) ? Skb.active() : WCkb.YOU;
  if (!me || !me.team || me.alive === false) return {};
  if (!(Skb && Skb.knockoutPathForTeam)) return {};
  var path = Skb.knockoutPathForTeam(me.team);
  if (!path || path.waitingDraw) return {};
  var currentId = path.current && (path.current.tieId || (path.current.fixture && path.current.fixture.id));
  var nextId = path.next && path.next.tieId;
  return {
    currentId: currentId || null,
    nextId: nextId || null,
    currentStage: path.current && path.current.stage,
  };
}

function kbPathRole(tie, highlight) {
  if (!tie || !highlight) return null;
  if (highlight.currentId && tie.id === highlight.currentId) return 'current';
  if (highlight.nextId && tie.id === highlight.nextId) return 'next';
  return null;
}

function BracketCell(props) {
  var tie = props.tie;
  var compact = props.compact;
  var fromStandings = props.fromStandings;
  var pathRole = props.pathRole;
  var pairingOnly = fromStandings && !!tie.projectedPairing && !tie.done && !tie.bracketPad && tie.a !== 'TBD' && tie.b !== 'TBD';
  var A = tie.teamA || { code: tie.a, flag: '🏳️', name: tie.a === 'TBD' ? 'TBD' : tie.a };
  var B = tie.teamB || { code: tie.b, flag: '🏳️', name: tie.b === 'TBD' ? 'TBD' : tie.b };
  var aw = tie.done && tie.winner === tie.a;
  var bw = tie.done && tie.winner === tie.b;
  var border = tie.you ? '2.5px solid var(--ink)' : (tie.entrant ? '2px solid var(--red)' : '2px solid var(--line)');
  if (pairingOnly) border = '2px dashed var(--ink2)';
  if (pathRole === 'current') border = '3px solid var(--ink)';
  else if (pathRole === 'next') border = '2.5px dashed var(--green)';
  var bg = tie.you ? 'var(--yellow)' : (tie.bracketPad ? 'rgba(0,0,0,.04)' : '#fff');
  if (pathRole === 'next') bg = 'rgba(26,122,68,.08)';
  var cellClass = 'ko-bracket-cell'
    + (pairingOnly ? ' ko-bracket-cell--projected' : '')
    + (pathRole === 'current' ? ' ko-bracket-cell--path-current' : '')
    + (pathRole === 'next' ? ' ko-bracket-cell--path-next' : '');
  function Row(p) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 6, opacity: p.lose ? .45 : 1, minHeight: compact ? 18 : 22 }}>
        <Fkb team={p.team} size={compact ? 14 : 18} />
        <span style={{
          fontSize: compact ? 10 : 11.5, fontWeight: p.win ? 800 : 700, flex: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textDecoration: p.lose ? 'line-through' : 'none',
          fontStyle: p.win && tie.done ? 'normal' : 'normal',
        }}>{compact ? p.team.code : p.team.name}</span>
        {p.score != null && <span className="dh" style={{ fontSize: compact ? 12 : 14 }}>{p.score}</span>}
      </div>
    );
  }
  return (
    <div className={cellClass} style={{ border: border, borderRadius: compact ? 10 : 12, padding: compact ? '5px 7px' : '7px 9px', background: bg, height: '100%', boxSizing: 'border-box' }}>
      {pathRole === 'current' && <span className="ko-bracket-path-tag ko-bracket-path-tag--current">Your tie</span>}
      {pathRole === 'next' && <span className="ko-bracket-path-tag ko-bracket-path-tag--next">If you win</span>}
      <Row team={A} score={tie.done && tie.score ? tie.score[0] : null} lose={bw} win={aw} />
      <div style={{ height: compact ? 2 : 4 }} />
      <Row team={B} score={tie.done && tie.score ? tie.score[1] : null} lose={aw} win={bw} />
      {tie.pens && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--ink2)', marginTop: 2 }}>Pens</div>}
      {pairingOnly && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--ink2)', marginTop: 2 }}>Pairing from standings</div>}
      {tie.entrant && !tie.you && !tie.bracketPad && <div className="ko-bracket-entrant-dot" title="Sweepstake entrant in this tie" />}
    </div>
  );
}

function BracketTreeView(props) {
  var layout = props.layout;
  var labels = props.labels;
  var fromStandings = props.fromStandings;
  var highlight = props.highlight || {};
  var scrollRef = kbRef(null);
  kbEffect(function () {
    if (!scrollRef.current || !props.focusStage) return;
    var col = layout.cols.find(function (c) { return c.stage === props.focusStage; });
    if (!col) return;
    scrollRef.current.scrollLeft = Math.max(0, col.left - 24);
  }, [props.focusStage, layout.cols.length, highlight.currentId]);
  return (
    <div className="ko-bracket-scroll" ref={scrollRef}>
      <div className="ko-bracket-canvas" style={{ width: layout.totalW, height: layout.totalH, position: 'relative' }}>
        <svg className="ko-bracket-svg" width={layout.totalW} height={layout.totalH} aria-hidden="true">
          {layout.links.map(function (lnk, i) {
            return <path key={i} d={lnk.d} fill="none" stroke="var(--line)" strokeWidth="2" />;
          })}
        </svg>
        {layout.cols.map(function (col) {
          return (
            <div key={col.stage} className="ko-bracket-col" style={{ left: col.left, width: KB_COL_W }}>
              <div className="ko-bracket-col-label dh">{labels[col.stage] || col.stage.toUpperCase()}</div>
              {col.slots.map(function (slot) {
                return (
                  <div key={slot.tie.id} className="ko-bracket-slot" style={{ top: slot.top, height: KB_CELL_H }}>
                    <BracketCell tie={slot.tie} compact fromStandings={fromStandings} pathRole={kbPathRole(slot.tie, highlight)} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function kbLoadPrefs(scope) {
  try {
    var raw = localStorage.getItem(KB_PREFS_KEY);
    var all = raw ? JSON.parse(raw) : {};
    return all[scope] || {};
  } catch (e) { return {}; }
}

function kbSavePrefs(scope, partial) {
  try {
    var raw = localStorage.getItem(KB_PREFS_KEY);
    var all = raw ? JSON.parse(raw) : {};
    all[scope] = Object.assign({}, all[scope] || {}, partial);
    localStorage.setItem(KB_PREFS_KEY, JSON.stringify(all));
  } catch (e) { /* ignore */ }
}

function BracketPanel(props) {
  var fromStandings = props.fromStandings;
  var rounds = props.rounds || {};
  var labels = props.labels || (WCkb.meta && WCkb.meta.stageLabels) || {};
  var highlight = kbPathHighlight(rounds);
  var prefScope = fromStandings ? 'standings-bracket' : 'feed';
  var prefs = kbLoadPrefs(prefScope);
  var hasTree = KB_ROUND_ORDER.some(function (k) { return (rounds[k] || []).length; });
  var hasThird = (rounds.third || []).length > 0;
  var layout = hasTree && kbTreeValid(rounds) ? kbLayoutTree(rounds) : null;
  var [view, setView] = kbState(prefs.view || (kbHasFullTree(rounds) ? 'tree' : (layout ? 'tree' : 'list')));
  var effectiveView = (view === 'tree' && layout) ? 'tree' : 'list';
  var [round, setRound] = kbState(function () {
    if (prefs.round && rounds[prefs.round] && rounds[prefs.round].length) return prefs.round;
    return kbFirstRound(rounds);
  });
  var roundAuto = kbRef(WCkb.meta.knockoutRound || null);
  var listRound = (rounds[round] || []).length ? round : kbFirstRound(rounds);
  kbEffect(function () {
    if ((rounds[round] || []).length) return;
    var first = kbFirstRound(rounds);
    if (first !== round) setRound(first);
  }, [round, hasTree, hasThird]);
  kbEffect(function () {
    var kr = WCkb.meta.knockoutRound;
    if (kr && kr !== roundAuto.current && rounds[kr] && rounds[kr].length) {
      setRound(kr);
      roundAuto.current = kr;
      kbSavePrefs(prefScope, { round: kr });
    }
  }, [WCkb.meta.knockoutRound]);
  kbEffect(function () {
    if (!highlight.currentStage || !(rounds[highlight.currentStage] || []).length) return;
    if (round === highlight.currentStage) return;
    setRound(highlight.currentStage);
    kbSavePrefs(prefScope, { round: highlight.currentStage });
  }, [highlight.currentStage, highlight.currentId]);
  function setViewPref(v) {
    setView(v);
    kbSavePrefs(prefScope, { view: v });
  }
  function setRoundPref(r) {
    setRound(r);
    kbSavePrefs(prefScope, { round: r });
  }
  if (!hasTree && !hasThird) return null;
  var focusStage = highlight.currentStage || WCkb.meta.knockoutRound || round;
  var showPathLegend = !!(highlight.currentId || highlight.nextId);
  return (
    <Ckb>
      {!props.embedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div className="dh" style={{ fontSize: 17 }}>{props.title || 'The bracket'}</div>
            {props.subtitle && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginTop: 4, maxWidth: 420 }}>{props.subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {layout && <div className="ko-bracket-view-toggle" role="tablist" aria-label="Bracket view">
              <button type="button" role="tab" aria-selected={effectiveView === 'tree'} className={'ko-bracket-view-btn' + (effectiveView === 'tree' ? ' is-active' : '')} onClick={function () { setViewPref('tree'); }}>Tree</button>
              <button type="button" role="tab" aria-selected={effectiveView === 'list'} className={'ko-bracket-view-btn' + (effectiveView === 'list' ? ' is-active' : '')} onClick={function () { setViewPref('list'); }}>By round</button>
            </div>}
            {props.onOpen && <button onClick={props.onOpen} style={{ background: 'none', border: 'none', color: 'var(--red)', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>All fixtures →</button>}
          </div>
        </div>
      )}
      {props.embedded && (layout || props.onOpen) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {layout && <div className="ko-bracket-view-toggle" role="tablist" aria-label="Bracket view">
            <button type="button" role="tab" aria-selected={effectiveView === 'tree'} className={'ko-bracket-view-btn' + (effectiveView === 'tree' ? ' is-active' : '')} onClick={function () { setViewPref('tree'); }}>Tree</button>
            <button type="button" role="tab" aria-selected={effectiveView === 'list'} className={'ko-bracket-view-btn' + (effectiveView === 'list' ? ' is-active' : '')} onClick={function () { setViewPref('list'); }}>By round</button>
          </div>}
          {props.onOpen && <button onClick={props.onOpen} style={{ background: 'none', border: 'none', color: 'var(--red)', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>All fixtures →</button>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, fontSize: 10.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 8, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--yellow)', border: '2px solid var(--ink)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Your team</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--red)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Entrant in tie</span>
        {fromStandings && <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px dashed var(--ink2)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Pairing from standings</span>}
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(0,0,0,.04)', border: '2px solid var(--line)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> TBD</span>
        {showPathLegend && <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--yellow)', border: '3px solid var(--ink)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Your tie</span>}
        {showPathLegend && highlight.nextId && <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(26,122,68,.12)', border: '2px dashed var(--green)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> If you win</span>}
      </div>
      {effectiveView === 'tree'
        ? <React.Fragment>
            <BracketTreeView layout={layout} labels={labels} focusStage={focusStage} fromStandings={fromStandings} highlight={highlight} />
            {hasThird && <div style={{ marginTop: 12, maxWidth: 280 }}>
              <div className="ko-bracket-col-label dh" style={{ marginBottom: 6 }}>{labels.third || 'Third place'}</div>
              {(rounds.third || []).map(function (tie) { return <BracketCell key={tie.id} tie={tie} fromStandings={fromStandings} pathRole={kbPathRole(tie, highlight)} />; })}
            </div>}
          </React.Fragment>
        : <BracketListView rounds={rounds} order={KB_LIST_ORDER} labels={labels} round={listRound} setRound={setRoundPref} fromStandings={fromStandings} highlight={highlight} />}
    </Ckb>
  );
}

function BracketListView(props) {
  var rounds = props.rounds;
  var order = props.order;
  var labels = props.labels;
  var round = props.round;
  var setRound = props.setRound;
  var hideRoundTabs = props.hideRoundTabs;
  var fromStandings = props.fromStandings;
  var highlight = props.highlight || {};
  var ties = rounds[round] || [];
  return (
    <React.Fragment>
      {!hideRoundTabs && <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
        {order.map(function (k) {
          if (!(rounds[k] || []).length) return null;
          return (
            <button key={k} onClick={function () { setRound(k); }} className="wc-btn wc-btn--sm"
              style={{ flex: '0 0 auto', background: round === k ? 'var(--yellow)' : '#fff', boxShadow: round === k ? '0 3px 0 var(--ink)' : '0 3px 0 var(--shadow)' }}>
              {labels[k] || k.toUpperCase()}
            </button>
          );
        })}
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {ties.map(function (tie) { return <BracketCell key={tie.id} tie={tie} fromStandings={fromStandings} pathRole={kbPathRole(tie, highlight)} />; })}
      </div>
    </React.Fragment>
  );
}

function KnockoutBracket(props) {
  if (!(Skb && Skb.knockoutBracketVisible && Skb.knockoutBracketVisible())) return null;
  var rounds = (Skb && Skb.buildMergedKnockoutBracket) ? Skb.buildMergedKnockoutBracket() : {};
  var hasKo = KB_ROUND_ORDER.concat(['third']).some(function (k) { return (rounds[k] || []).length; });
  if (!hasKo) return null;
  var fromStandings = !(WCkb.meta && WCkb.meta.r32Published);
  return (
    <BracketPanel
      rounds={rounds}
      title="Knockout bracket"
      subtitle={fromStandings
        ? 'Full bracket — R32 from standings (dashed), R16 onward from the feed as ties publish. TBD slots fill in as results land.'
        : 'Full knockout bracket from the feed.'}
      fromStandings={fromStandings}
      embedded={props.embedded}
      onOpen={props.onOpen}
    />
  );
}

function ProjectedKnockoutBracket(props) {
  return <KnockoutBracket embedded={props.embedded} onOpen={props.onOpen} />;
}

function KnockoutPathCard(props) {
  var teamCode = props.teamCode;
  var compact = props.compact;
  var showCurrent = props.showCurrent !== false;
  var path = props.path || (Skb && Skb.knockoutPathForTeam ? Skb.knockoutPathForTeam(teamCode) : null);
  var team = WCkb.TEAMS[teamCode];
  if (!path || !team) return null;
  var cur = path.current;
  var nxt = path.next;
  if (path.waitingDraw) {
    return (
      <div style={{ marginTop: compact ? 10 : 12, fontSize: compact ? 12.2 : 13, fontWeight: 750, color: compact ? 'rgba(255,255,255,.72)' : 'var(--ink2)', lineHeight: 1.4 }}>
        Groups complete — waiting on the R32 draw. Best-third spots still to be confirmed.
      </div>
    );
  }
  if (path.betweenRounds) {
    return (
      <div style={{ marginTop: compact ? 10 : 12, fontSize: compact ? 12.2 : 13, fontWeight: 750, color: compact ? 'rgba(255,255,255,.72)' : 'var(--ink2)', lineHeight: 1.4 }}>
        Through — waiting on the {path.waitingNextRound || 'next round'} tie to publish in the feed.
      </div>
    );
  }
  if (!cur && !nxt) return null;
  var dateLine = cur && cur.fixture && cur.fixture.dateLabel
    ? cur.fixture.dateLabel + (cur.fixture.time ? ' · ' + cur.fixture.time : '')
    : (cur && cur.projected ? 'Pairing from standings — kick-off TBC' : '');
  return (
    <div style={{ marginTop: compact ? 10 : 12 }}>
      {showCurrent && cur && cur.opponent && (
        <div style={{ fontSize: compact ? 12.2 : 13, fontWeight: 750, color: compact ? 'rgba(255,255,255,.85)' : 'var(--ink)', lineHeight: 1.4 }}>
          {cur.isLive ? '● LIVE · ' : (cur.projected ? 'R32 pairing · ' : 'Next tie · ')}
          {cur.stageLabel} — {team.name} v {cur.opponent.name}
          {dateLine ? ' · ' + dateLine : ''}
          {cur.projected ? ' (if the table holds)' : ''}
        </div>
      )}
      {nxt && (
        <div style={{ fontSize: compact ? 11.5 : 12, fontWeight: 700, color: compact ? 'rgba(255,255,255,.58)' : 'var(--ink2)', lineHeight: 1.35, marginTop: cur ? 6 : 0 }}>
          If you win → {nxt.stageLabel}: {nxt.description}
          {nxt.projected ? ' (bracket slot)' : ''}
        </div>
      )}
    </div>
  );
}

window.KnockoutBracket = KnockoutBracket;
window.ProjectedKnockoutBracket = ProjectedKnockoutBracket;
window.KnockoutPathCard = KnockoutPathCard;
