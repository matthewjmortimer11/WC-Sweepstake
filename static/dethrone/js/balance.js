/* Balance toggles for playtesting — overrides CT.CONST when set on game state. */
window.CT = window.CT || {};

CT.DEFAULT_BALANCE = {
  handLimit: 5,
  corruptionMax: 10,
  finalRiteAt: 8,
  innocentElimsToLose: 2,
  startGold: 2,
  startRep: 3,
};

CT.getRules = function () {
  var b = (CT.state && CT.state.balance) || {};
  var d = CT.DEFAULT_BALANCE;
  return {
    HAND_LIMIT: b.handLimit != null ? b.handLimit : d.handLimit,
    CORRUPTION_MAX: b.corruptionMax != null ? b.corruptionMax : d.corruptionMax,
    FINAL_RITE_CORRUPTION: b.finalRiteAt != null ? b.finalRiteAt : d.finalRiteAt,
    INNOCENT_ELIMS_TO_LOSE: b.innocentElimsToLose != null ? b.innocentElimsToLose : d.innocentElimsToLose,
    START_GOLD: b.startGold != null ? b.startGold : d.startGold,
    START_REP: b.startRep != null ? b.startRep : d.startRep,
    REP_MIN: CT.CONST.REP_MIN,
    REP_MAX: CT.CONST.REP_MAX,
  };
};

CT.balancePanel = function (balance, editable) {
  balance = balance || CT.DEFAULT_BALANCE;
  function row(key, label, val, min, max) {
    if (!editable) {
      return '<div class="vote-row"><span>' + label + '</span><strong>' + val + '</strong></div>';
    }
    return '<label class="field" style="margin:0"><span class="lbl">' + label + '</span>'
      + '<input type="number" min="' + min + '" max="' + max + '" data-act="bal-' + key + '" data-fkey="bal-' + key + '" value="' + val + '"></label>';
  }
  return '<div class="stack" style="gap:10px">'
    + row("handLimit", "Hand limit", balance.handLimit, 3, 10)
    + row("corruptionMax", "Corruption to lose", balance.corruptionMax, 6, 15)
    + row("finalRiteAt", "Final Rite at", balance.finalRiteAt, 5, 12)
    + row("innocentElimsToLose", "Innocents to lose", balance.innocentElimsToLose, 1, 4)
    + row("startGold", "Starting gold", balance.startGold, 0, 6)
    + row("startRep", "Starting Rep", balance.startRep, 1, 5)
    + '</div>';
};

CT.readBalanceFromUI = function () {
  function num(key, fallback) {
    var el = document.querySelector('[data-act="bal-' + key + '"]');
    return el ? +el.value : fallback;
  }
  var d = CT.DEFAULT_BALANCE;
  return {
    handLimit: num("handLimit", d.handLimit),
    corruptionMax: num("corruptionMax", d.corruptionMax),
    finalRiteAt: num("finalRiteAt", d.finalRiteAt),
    innocentElimsToLose: num("innocentElimsToLose", d.innocentElimsToLose),
    startGold: num("startGold", d.startGold),
    startRep: num("startRep", d.startRep),
  };
};
