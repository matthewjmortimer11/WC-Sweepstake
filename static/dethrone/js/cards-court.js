/* V3b court stubs + shared accent palette (cards + map + UI footers). */
window.CT = window.CT || {};

CT.FAMILY_ACCENT = {
  Royal: "#8c2f23",
  Cursed: "#6b2420",
  Succession: "#5a6e3a",
  Knight: "#4a5568",
  Guard: "#5b4c38",
  ThiefSpy: "#3a3530",
  Advisor: "#2a2014",
};

CT.LOCATION_ACCENT = {
  throne: "#8c2f23",
  market: "#5b4c38",
  tavern: "#5b4c38",
  college: "#2a2014",
  scrolls: "#2a2014",
  barracks: "#4a5568",
  graveyard: "#6b2420",
};

CT.locationAccent = function (locId) {
  return CT.LOCATION_ACCENT[locId] || CT.FAMILY_ACCENT.Guard;
};

CT.familyAccent = function (family) {
  return CT.FAMILY_ACCENT[family] || CT.FAMILY_ACCENT.Guard;
};

CT.courtStubHtml = function (p, opts) {
  opts = opts || {};
  var role = p.publicRoleId ? CT.roleById(p.publicRoleId) : null;
  var accent = role ? CT.familyAccent(role.family) : "#3a3530";
  var active = !!opts.active;
  var elim = p.status === "eliminated";
  var spec = !!opts.spectator;
  var loc = CT.locationById(p.location);
  var art = role
    ? CT.roleCardImg(p.publicRoleId, { size: "stub" })
    : '<div class="court-stub__ph"></div>';
  var throne = p.id === CT.state.throne.kingControllerId || p.id === CT.state.throne.queenControllerId;
  var meta = (loc ? loc.name : "") + " · " + p.rep + " rep · " + p.gold + "g";
  var privBtn = (!spec && (!CT.isOnline() || p.id === CT.myId()))
    ? '<button type="button" class="court-stub__hand btn btn-ghost btn-sm" data-act="view-private" data-id="' + p.id + '">Hand</button>'
    : "";

  return '<article class="court-stub' + (active ? " court-stub--active" : "") + (elim ? " court-stub--elim" : "") + '"'
    + ' style="--stub-accent:' + accent + '">'
    + '<div class="court-stub__frame">'
    + '<div class="court-stub__art">' + art
    + (throne ? '<span class="court-stub__crown" title="Throne">✦</span>' : "")
    + (p.isBot ? '<span class="court-stub__bot">BOT</span>' : "")
    + "</div>"
    + '<footer class="court-stub__foot">'
    + '<div class="court-stub__name">' + CT.esc(p.name) + "</div>"
    + '<div class="court-stub__meta">' + CT.esc(meta) + "</div>"
    + (role ? '<div class="court-stub__role">' + CT.esc(role.name) + "</div>" : "")
    + privBtn
    + "</footer></div></article>";
};
