/* The Cursed Throne — V3b layered kingdom board (poster + mini location cards).
 * Background PNG has frame, title, faint roads; SVG adds route overlay + nodes.
 * Legal nodes keep data-act="board-move". */
window.CT = window.CT || {};

CT.TOKEN_COLORS = ["#8c2f23", "#a8842c", "#3f6b4a", "#3a5a78", "#6e4a86", "#9c5a2a"];

CT.MAP_XY = {
  scrolls:   [360,  88],
  college:   [360, 208],
  tavern:    [108, 400],
  market:    [252, 400],
  throne:    [360, 400],
  barracks:  [612, 400],
  graveyard: [360, 640],
};
CT.MAP_ROUTES = [
  ["market", "tavern"], ["market", "college"], ["market", "throne"],
  ["college", "scrolls"], ["throne", "barracks"],
  ["tavern", "graveyard"], ["barracks", "graveyard"],
];

(function () {
  var CREAM_HI = "#fbf6e9", INK = "#2a2014",
      GOLD = "#a8842c", GOLDB = "#c79a3a", GOLDS = "#e8d49a",
      CURSED = "#6b2420";

  var SERIF = "Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif";

  function locAccent(id) {
    if (CT.LOCATION_ACCENT && CT.LOCATION_ACCENT[id]) return CT.LOCATION_ACCENT[id];
    return "#5b4c38";
  }

  function ini(name) {
    return (name || "?").trim().slice(0, 1).toUpperCase() || "?";
  }

  function mapUrl(path) {
    if (!path) return "";
    return path.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function route(a, b) {
    var p = CT.MAP_XY[a], q = CT.MAP_XY[b];
    var grave = a === "graveyard" || b === "graveyard";
    var col = grave ? CURSED : GOLD;
    var d = "M" + p[0] + " " + p[1] + " L" + q[0] + " " + q[1];
    return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.8" '
      + 'stroke-linecap="round" opacity="' + (grave ? 0.72 : 0.58) + '"/>'
      + '<circle cx="' + ((p[0] + q[0]) / 2) + '" cy="' + ((p[1] + q[1]) / 2) + '" r="3.5" fill="' + GOLDS + '" stroke="' + GOLDB + '" stroke-width="1" opacity="0.85"/>';
  }

  function tokens(id, cardW, cardH) {
    var here = CT.state.players.filter(function (p) { return p.location === id; });
    if (!here.length) return "";
    var n = here.length, gap = 20, x0 = -((n - 1) * gap) / 2;
    var y = cardH / 2 + 16;
    var ap = CT.activePlayer();
    return here.map(function (p, k) {
      var idx = CT.state.players.indexOf(p);
      var active = ap && p.id === ap.id;
      var elim = p.status === "eliminated";
      var x = x0 + k * gap;
      return '<g transform="translate(' + x + "," + y + ')" opacity="' + (elim ? 0.42 : 1) + '">'
        + (active ? '<circle r="11" fill="none" stroke="' + GOLDB + '" stroke-width="2.2"/>' : "")
        + '<circle r="8.5" fill="' + CT.TOKEN_COLORS[idx % CT.TOKEN_COLORS.length] + '" stroke="' + INK + '" stroke-width="1.4"/>'
        + '<text y="3.2" text-anchor="middle" font-family="' + SERIF + '" font-size="10" font-weight="700" fill="' + CREAM_HI + '"'
        + (elim ? ' text-decoration="line-through"' : "") + ">" + ini(p.name) + "</text></g>";
    }).join("");
  }

  function node(id, legal, activeHere) {
    var loc = CT.locationById(id);
    var xy = CT.MAP_XY[id];
    var accent = locAccent(id);
    var hero = id === "throne";
    var cardW = hero ? 96 : 84;
    var cardH = hero ? 128 : 112;
    var footH = 26;
    var artH = cardH - footH;
    var label = loc.name.toUpperCase();
    var attrs = legal
      ? ' class="map-node legal" data-act="board-move" data-id="' + id + '" role="button" tabindex="0"'
      : ' class="map-node"';
    var clipId = "map-clip-" + id;

    var legalRing = legal
      ? '<rect x="' + (-cardW / 2 - 6) + '" y="' + (-cardH / 2 - 6) + '" width="' + (cardW + 12) + '" height="' + (cardH + 12) + '" rx="12" '
        + 'fill="none" stroke="' + GOLDB + '" stroke-width="2.2" class="legal-ring" stroke-dasharray="6 5"/>' : "";
    var hereRing = activeHere
      ? '<rect x="' + (-cardW / 2 - 2) + '" y="' + (-cardH / 2 - 2) + '" width="' + (cardW + 4) + '" height="' + (cardH + 4) + '" rx="9" '
        + 'fill="none" stroke="' + GOLD + '" stroke-width="1.8" opacity="0.9"/>' : "";

    var locUrl = CT.mapLocationUrl ? CT.mapLocationUrl(id) : "";
    var art = locUrl
      ? '<image href="' + mapUrl(locUrl) + '" x="' + (-cardW / 2) + '" y="' + (-cardH / 2) + '" width="' + cardW + '" height="' + artH + '" '
        + 'preserveAspectRatio="xMidYMid slice" clip-path="url(#' + clipId + ')"/>'
      : "";

    var body = '<rect x="' + (-cardW / 2) + '" y="' + (-cardH / 2) + '" width="' + cardW + '" height="' + cardH + '" rx="8" '
      + 'fill="' + CREAM_HI + '" stroke="' + GOLD + '" stroke-width="' + (hero ? 2.4 : 1.8) + '" filter="url(#cardShadow)"/>'
      + art
      + '<rect x="' + (-cardW / 2) + '" y="' + (cardH / 2 - footH) + '" width="' + cardW + '" height="' + footH + '" fill="' + accent + '"/>'
      + '<rect x="' + (-cardW / 2) + '" y="' + (cardH / 2 - footH) + '" width="' + cardW + '" height="' + footH + '" '
      + 'fill="' + accent + '" clip-path="inset(0 0 0 0 round 0 0 8 8)"/>'
      + '<text y="' + (cardH / 2 - footH / 2 + 4) + '" text-anchor="middle" font-family="' + SERIF + '" font-size="' + (hero ? 11 : 10) + '" '
      + 'letter-spacing="1.2" font-weight="600" fill="' + CREAM_HI + '">' + label + "</text>";

    return '<g transform="translate(' + xy[0] + "," + xy[1] + ')"' + attrs + ">"
      + '<clipPath id="' + clipId + '"><rect x="' + (-cardW / 2) + '" y="' + (-cardH / 2) + '" width="' + cardW + '" height="' + artH + '" rx="8"/></clipPath>'
      + legalRing + hereRing + body + tokens(id, cardW, cardH) + "</g>";
  }

  CT.boardMapSVG = function () {
    var ap = CT.activePlayer();
    var legal = (ap && ap.status === "active" && !CT.state.winner) ? CT.legalMoves(ap) : [];
    var here = ap ? ap.location : null;
    var bgUrl = CT.mapBackgroundUrl ? CT.mapBackgroundUrl() : "";

    var defs = '<defs>'
      + '<filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">'
      + '<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#2a2014" flood-opacity="0.22"/></filter>'
      + "</defs>";

    var bg = bgUrl
      ? '<image class="map-bg" href="' + mapUrl(bgUrl) + '" x="0" y="0" width="720" height="920" preserveAspectRatio="xMidYMid meet"/>'
      : '<rect width="720" height="920" fill="#f4ecd6"/>';

    var routes = '<g class="map-routes">' + CT.MAP_ROUTES.map(function (r) {
      return route(r[0], r[1]);
    }).join("") + "</g>";

    var nodes = Object.keys(CT.MAP_XY).map(function (id) {
      return node(id, legal.indexOf(id) > -1, id === here);
    }).join("");

    return '<svg class="map map-v3b map-v3b--layered" viewBox="0 0 720 920" xmlns="http://www.w3.org/2000/svg" '
      + 'xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="Map of the kingdom">'
      + defs + bg + routes + nodes + "</svg>";
  };
})();
