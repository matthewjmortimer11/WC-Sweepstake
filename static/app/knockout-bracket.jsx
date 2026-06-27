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
var KB_CELL_H = 46;
var KB_COL_W = 128;
var KB_GAP_W = 32;
var KB_LABEL_H = 26;

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

function BracketCell(props) {
  var tie = props.tie;
  var compact = props.compact;
  var projected = props.projected || tie.projectedWinner || tie.projectedPairing;
  var A = tie.teamA || { code: tie.a, flag: '🏳️', name: tie.a };
  var B = tie.teamB || { code: tie.b, flag: '🏳️', name: tie.b };
  var aw = tie.done ? tie.winner === tie.a : (projected && tie.winner === tie.a);
  var bw = tie.done ? tie.winner === tie.b : (projected && tie.winner === tie.b);
  var border = tie.you ? '2.5px solid var(--ink)' : (tie.entrant ? '2px solid var(--red)' : '2px solid var(--line)');
  if (projected && !tie.done) border = '2px dashed var(--ink2)';
  var bg = tie.you ? 'var(--yellow)' : '#fff';
  function Row(p) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 6, opacity: p.lose ? .45 : 1, minHeight: compact ? 18 : 22 }}>
        <Fkb team={p.team} size={compact ? 14 : 18} />
        <span style={{
          fontSize: compact ? 10 : 11.5, fontWeight: p.win ? 800 : 700, flex: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textDecoration: p.lose ? 'line-through' : 'none',
          fontStyle: p.win && projected && !tie.done ? 'italic' : 'normal',
        }}>{compact ? p.team.code : p.team.name}</span>
        {p.score != null && <span className="dh" style={{ fontSize: compact ? 12 : 14 }}>{p.score}</span>}
      </div>
    );
  }
  return (
    <div className={'ko-bracket-cell' + (projected && !tie.done ? ' ko-bracket-cell--projected' : '')} style={{ border: border, borderRadius: compact ? 10 : 12, padding: compact ? '5px 7px' : '7px 9px', background: bg, height: '100%', boxSizing: 'border-box' }}>
      <Row team={A} score={tie.done && tie.score ? tie.score[0] : null} lose={bw} win={aw} />
      <div style={{ height: compact ? 2 : 4 }} />
      <Row team={B} score={tie.done && tie.score ? tie.score[1] : null} lose={aw} win={bw} />
      {tie.pens && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--ink2)', marginTop: 2 }}>Pens</div>}
      {projected && !tie.done && tie.winner && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--ink2)', marginTop: 2 }}>Proj. {tie.winner}</div>}
      {tie.entrant && !tie.you && <div className="ko-bracket-entrant-dot" title="Sweepstake entrant in this tie" />}
    </div>
  );
}

function BracketTreeView(props) {
  var layout = props.layout;
  var labels = props.labels;
  var projected = props.projected;
  var scrollRef = kbRef(null);
  kbEffect(function () {
    if (!scrollRef.current || !props.focusStage) return;
    var col = layout.cols.find(function (c) { return c.stage === props.focusStage; });
    if (!col) return;
    var target = Math.max(0, col.left - 24);
    scrollRef.current.scrollLeft = target;
  }, [props.focusStage, layout.cols.length]);
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
                    <BracketCell tie={slot.tie} compact projected={props.projected} />
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

function BracketPanel(props) {
  var rounds = props.rounds || {};
  var labels = props.labels || (WCkb.meta && WCkb.meta.stageLabels) || {};
  var hasTree = KB_ROUND_ORDER.some(function (k) { return (rounds[k] || []).length; });
  var hasThird = (rounds.third || []).length > 0;
  var layout = hasTree ? kbLayoutTree(rounds) : null;
  var [view, setView] = kbState(layout ? 'tree' : 'list');
  var [round, setRound] = kbState(function () {
    var kr = WCkb.meta.knockoutRound;
    return kr && rounds[kr] && rounds[kr].length ? kr : (KB_ROUND_ORDER.find(function (k) { return (rounds[k] || []).length; }) || 'r32');
  });
  var roundAuto = kbRef(WCkb.meta.knockoutRound || null);
  kbEffect(function () {
    var kr = WCkb.meta.knockoutRound;
    if (kr && kr !== roundAuto.current && rounds[kr] && rounds[kr].length) {
      setRound(kr);
      roundAuto.current = kr;
    }
  }, [WCkb.meta.knockoutRound]);
  if (!hasTree && !hasThird) return null;
  var focusStage = WCkb.meta.knockoutRound || round;
  return (
    <Ckb>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="dh" style={{ fontSize: 17 }}>{props.title || 'The bracket'}</div>
          {props.subtitle && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginTop: 4, maxWidth: 420 }}>{props.subtitle}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {layout && <div className="ko-bracket-view-toggle" role="tablist" aria-label="Bracket view">
            <button type="button" role="tab" aria-selected={view === 'tree'} className={'ko-bracket-view-btn' + (view === 'tree' ? ' is-active' : '')} onClick={function () { setView('tree'); }}>Tree</button>
            <button type="button" role="tab" aria-selected={view === 'list'} className={'ko-bracket-view-btn' + (view === 'list' ? ' is-active' : '')} onClick={function () { setView('list'); }}>By round</button>
          </div>}
          {props.onOpen && <button onClick={props.onOpen} style={{ background: 'none', border: 'none', color: 'var(--red)', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>All fixtures →</button>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 10.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 8, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--yellow)', border: '2px solid var(--ink)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Your team</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--red)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Entrant in tie</span>
        {props.projected && <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px dashed var(--ink2)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Projected path</span>}
      </div>
      {view === 'tree' && layout
        ? <React.Fragment>
            <BracketTreeView layout={layout} labels={labels} focusStage={focusStage} projected={props.projected} />
            {hasThird && <div style={{ marginTop: 12, maxWidth: 280 }}>
              <div className="ko-bracket-col-label dh" style={{ marginBottom: 6 }}>{labels.third || 'Third place'}</div>
              {(rounds.third || []).map(function (tie) { return <BracketCell key={tie.id} tie={tie} projected={props.projected} />; })}
            </div>}
          </React.Fragment>
        : <BracketListView rounds={rounds} order={KB_LIST_ORDER} labels={labels} round={round} setRound={setRound} projected={props.projected} />}
    </Ckb>
  );
}

function BracketListView(props) {
  var rounds = props.rounds;
  var order = props.order;
  var labels = props.labels;
  var round = props.round;
  var setRound = props.setRound;
  var ties = rounds[round] || [];
  return (
    <React.Fragment>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
        {order.map(function (k) {
          if (!(rounds[k] || []).length) return null;
          return (
            <button key={k} onClick={function () { setRound(k); }} className="wc-btn wc-btn--sm"
              style={{ flex: '0 0 auto', background: round === k ? 'var(--yellow)' : '#fff', boxShadow: round === k ? '0 3px 0 var(--ink)' : '0 3px 0 var(--shadow)' }}>
              {labels[k] || k.toUpperCase()}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {ties.map(function (tie) { return <BracketCell key={tie.id} tie={tie} projected={props.projected} />; })}
      </div>
    </React.Fragment>
  );
}

function KnockoutBracket(props) {
  var rounds = (Skb && Skb.buildKnockoutBracket) ? Skb.buildKnockoutBracket() : {};
  var hasTree = KB_ROUND_ORDER.some(function (k) { return (rounds[k] || []).length; });
  var hasThird = (rounds.third || []).length > 0;
  var layout = hasTree ? kbLayoutTree(rounds) : null;
  if (!(window.WheeshtFixtures && window.WheeshtFixtures.knockoutsVisible && window.WheeshtFixtures.knockoutsVisible(WCkb.meta)) || (!hasTree && !hasThird) || (!layout && !hasThird)) return null;
  return <BracketPanel rounds={rounds} title="The bracket" onOpen={props.onOpen} />;
}

function ProjectedKnockoutBracket(props) {
  if (!(Skb && Skb.projectedBracketVisible && Skb.projectedBracketVisible())) return null;
  var rounds = Skb.buildProjectedKnockoutBracket ? Skb.buildProjectedKnockoutBracket() : {};
  var qc = (WCkb.projectedBracket && WCkb.projectedBracket.qualifierCount) || 0;
  return (
    <BracketPanel
      rounds={rounds}
      title="Projected bracket"
      subtitle={'From live group standings — top two plus eight best thirds, then favourites advance. Updates after every result.' + (qc ? ' (' + qc + ' projected through).' : '')}
      projected={true}
      onOpen={props.onOpen}
    />
  );
}

window.KnockoutBracket = KnockoutBracket;
window.ProjectedKnockoutBracket = ProjectedKnockoutBracket;
