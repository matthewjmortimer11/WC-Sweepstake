/* The Cursed Throne — V3b illustrated kingdom board.
 * Hero art: AI-painted kingdom poster (frame + title baked in). On top: curved
 * gold/cursed roads, labelled site plaques, player tokens, and legal-move glow.
 * Legal nodes keep data-act="board-move" so movement still works. */
window.CT = window.CT || {};

CT.TOKEN_COLORS = ["#8c2f23", "#a8842c", "#3f6b4a", "#3a5a78", "#6e4a86", "#9c5a2a"];

/* Site anchors on the illustrated poster (viewBox 1200 x 800). */
CT.MAP_XY = {
  tavern:    [262, 214],
  college:   [662, 132],
  throne:    [486, 330],
  market:    [206, 502],
  barracks:  [902, 344],
  scrolls:   [690, 486],
  graveyard: [486, 668],
};

/* Roads, derived from the real game graph (CT.CONNECTIONS) so they always match
 * where players can actually move. Falls back to a static list off-line. */
CT.mapRoutes = function () {
  var conn = CT.CONNECTIONS || {
    market: ["tavern", "college", "throne"], tavern: ["market", "graveyard"],
    college: ["market"], scrolls: ["college"], throne: ["market", "barracks"],
    barracks: ["throne", "graveyard"], graveyard: ["tavern", "barracks"],
  };
  var seen = {}, out = [];
  Object.keys(conn).forEach(function (a) {
    (conn[a] || []).forEach(function (b) {
      var key = a < b ? a + "|" + b : b + "|" + a;
      if (seen[key]) return;
      seen[key] = 1;
      out.push([a, b]);
    });
  });
  return out;
};
CT.MAP_ROUTES = CT.mapRoutes();

(function () {
  var CREAM = "#f4ecd6", CREAM_HI = "#fbf6e9", INK = "#2a2014",
      GOLD = "#a8842c", GOLDB = "#c79a3a", GOLDS = "#e8d49a",
      CURSED = "#7a2a24";

  var SERIF = "Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif";

  function locAccent(id) {
    if (CT.LOCATION_ACCENT && CT.LOCATION_ACCENT[id]) return CT.LOCATION_ACCENT[id];
    return "#5b4c38";
  }

  function ini(name) {
    return (name || "?").trim().slice(0, 1).toUpperCase() || "?";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function mapUrl(path) {
    if (!path) return "";
    return path.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  /* Curved road between two sites, with a dark underlay so gold reads on busy art. */
  function route(a, b, activeEdge) {
    var p = CT.MAP_XY[a], q = CT.MAP_XY[b];
    if (!p || !q) return "";
    var grave = a === "graveyard" || b === "graveyard";
    var col = grave ? CURSED : GOLD;
    var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    var dx = q[0] - p[0], dy = q[1] - p[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var bow = (grave ? 26 : 16);
    var cx = mx + (-dy / len) * bow, cy = my + (dx / len) * bow;
    var d = "M" + p[0] + " " + p[1] + " Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + q[0] + " " + q[1];
    var dash = grave ? ' stroke-dasharray="2 9"' : "";
    var lift = activeEdge ? 1 : 0;
    return '<path d="' + d + '" fill="none" stroke="#1c140c" stroke-width="' + (grave ? 8 : 7) + '" '
      + 'stroke-linecap="round" opacity="0.32"/>'
      + '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (3 + lift) + '" '
      + 'stroke-linecap="round"' + dash + ' opacity="' + (activeEdge ? 0.95 : (grave ? 0.7 : 0.62)) + '"'
      + (activeEdge ? ' class="route-live"' : "") + "/>"
      + '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3" fill="' + GOLDS + '" stroke="' + INK + '" stroke-width="0.8" opacity="0.8"/>';
  }

  function tokens(id) {
    var here = CT.state.players.filter(function (p) { return p.location === id; });
    if (!here.length) return "";
    var n = here.length, gap = 22, x0 = -((n - 1) * gap) / 2, y = 24;
    var ap = CT.activePlayer();
    return here.map(function (p, k) {
      var idx = CT.state.players.indexOf(p);
      var active = ap && p.id === ap.id;
      var elim = p.status === "eliminated";
      var x = x0 + k * gap;
      return '<g transform="translate(' + x + "," + y + ')" opacity="' + (elim ? 0.45 : 1) + '">'
        + (active ? '<circle r="13" fill="none" stroke="' + GOLDB + '" stroke-width="2.4" class="token-active"/>' : "")
        + '<circle r="10" fill="' + CT.TOKEN_COLORS[idx % CT.TOKEN_COLORS.length] + '" stroke="' + INK + '" stroke-width="1.6"/>'
        + '<circle r="10" fill="none" stroke="' + GOLDS + '" stroke-width="0.8" opacity="0.5"/>'
        + '<text y="3.6" text-anchor="middle" font-family="' + SERIF + '" font-size="11" font-weight="700" fill="' + CREAM_HI + '"'
        + (elim ? ' text-decoration="line-through"' : "") + ">" + esc(ini(p.name)) + "</text></g>";
    }).join("");
  }

  /* A labelled site marker: gold-rimmed pin + parchment name plaque above it. */
  function node(id, legal, activeHere) {
    var loc = CT.locationById(id);
    var xy = CT.MAP_XY[id];
    var accent = locAccent(id);
    var hero = id === "throne";
    var label = (loc ? loc.name : id).toUpperCase();
    var plaqueW = Math.max(64, label.length * 8.6 + 22);
    var plaqueH = hero ? 26 : 23;
    var plaqueY = hero ? -52 : -46;
    var discR = hero ? 12 : 10;

    var attrs = legal
      ? ' class="map-node legal" data-act="board-move" data-id="' + id + '" role="button" tabindex="0"'
        + ' aria-label="Move to ' + esc(loc ? loc.name : id) + '"'
      : ' class="map-node' + (activeHere ? " here" : "") + '"';

    var glow = legal
      ? '<circle r="' + (discR + 12) + '" fill="' + GOLDB + '" opacity="0.18" class="legal-halo"/>'
        + '<circle r="' + (discR + 8) + '" fill="none" stroke="' + GOLDB + '" stroke-width="2.2" '
        + 'stroke-dasharray="5 5" class="legal-ring"/>'
      : "";

    var disc = '<circle r="' + (discR + 2) + '" fill="#1c140c" opacity="0.45"/>'
      + '<circle r="' + discR + '" fill="' + (activeHere ? accent : CREAM_HI) + '" stroke="' + (activeHere ? GOLDB : GOLD) + '" stroke-width="' + (activeHere ? 3 : 2.2) + '"/>'
      + '<circle r="' + (discR - 4) + '" fill="' + (activeHere ? GOLDS : accent) + '" opacity="' + (activeHere ? 0.9 : 0.85) + '"/>';

    var plaque = '<g transform="translate(0,' + plaqueY + ')">'
      + '<path d="M0 ' + (plaqueH / 2 + 7) + ' L-6 ' + (plaqueH / 2 - 1) + ' L6 ' + (plaqueH / 2 - 1) + ' Z" fill="' + (activeHere ? accent : CREAM_HI) + '" stroke="' + GOLD + '" stroke-width="1.4"/>'
      + '<rect x="' + (-plaqueW / 2) + '" y="' + (-plaqueH / 2) + '" width="' + plaqueW + '" height="' + plaqueH + '" rx="6" '
      + 'fill="' + (activeHere ? accent : CREAM_HI) + '" stroke="' + (activeHere ? GOLDB : GOLD) + '" stroke-width="' + (activeHere ? 2 : 1.5) + '" filter="url(#plaqueShadow)"/>'
      + '<text y="4" text-anchor="middle" font-family="' + SERIF + '" font-size="' + (hero ? 13 : 11.5) + '" '
      + 'letter-spacing="1.2" font-weight="700" fill="' + (activeHere ? CREAM_HI : INK) + '">' + esc(label) + "</text>"
      + "</g>";

    return '<g transform="translate(' + xy[0] + "," + xy[1] + ')"' + attrs + ">"
      + glow + disc + plaque + tokens(id) + "</g>";
  }

  CT.boardMapSVG = function () {
    var ap = CT.activePlayer();
    var legal = (ap && ap.status === "active" && !CT.state.winner) ? CT.legalMoves(ap) : [];
    var here = ap ? ap.location : null;
    var bgUrl = CT.mapBackgroundUrl ? CT.mapBackgroundUrl() : "";

    var defs = '<defs>'
      + '<filter id="plaqueShadow" x="-30%" y="-30%" width="160%" height="160%">'
      + '<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#1c140c" flood-opacity="0.45"/></filter>'
      + '<linearGradient id="mapVignette" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="#000" stop-opacity="0"/>'
      + '<stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient>'
      + "</defs>";

    var bg = bgUrl
      ? '<image class="map-bg" href="' + mapUrl(bgUrl) + '" x="0" y="0" width="1200" height="800" preserveAspectRatio="xMidYMid slice"/>'
      : '<rect width="1200" height="800" fill="#efe3c6"/>';

    var legalSet = {};
    legal.forEach(function (id) { legalSet[id] = 1; });

    var routes = '<g class="map-routes">' + CT.MAP_ROUTES.map(function (r) {
      var liveEdge = here && ((r[0] === here && legalSet[r[1]]) || (r[1] === here && legalSet[r[0]]));
      return route(r[0], r[1], liveEdge);
    }).join("") + "</g>";

    var nodes = Object.keys(CT.MAP_XY).map(function (id) {
      return node(id, legalSet[id] === 1, id === here);
    }).join("");

    return '<svg class="map map-v3b map-v3b--layered" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg" '
      + 'xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="Map of the kingdom">'
      + defs + bg
      + '<rect class="map-bg" x="0" y="0" width="1200" height="800" fill="url(#mapVignette)"/>'
      + routes + nodes + "</svg>";
  };
})();
