/* The Cursed Throne — V3b editorial kingdom board (inline SVG).
 * Matches the role card deck: cream field, gold frame, location mini-cards
 * with family-coloured footers. Legal nodes keep data-act="board-move". */
window.CT = window.CT || {};

CT.TOKEN_COLORS = ["#8c2f23", "#a8842c", "#3f6b4a", "#3a5a78", "#6e4a86", "#9c5a2a"];

/* Portrait kingdom card layout (viewBox 0 0 720 920) — same graph as §7:
 *           Scrolls
 *              |
 *           College
 *              |
 * Tavern — Market — Throne — Barracks
 *    |                          |
 * Graveyard --------------------- */
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
  var CREAM = "#f4ecd6", CREAM_HI = "#fbf6e9", INK = "#2a2014", INK2 = "#5b4c38",
      GOLD = "#a8842c", GOLDB = "#c79a3a", GOLDS = "#e8d49a",
      ROYAL = "#8c2f23", CURSED = "#6b2420", MOSS = "#5a6e3a",
      KNIGHT = "#4a5568", GUARD = "#5b4c38", ADVISOR = "#2a2014";

  var LOC_ACCENT = {
    throne: ROYAL,
    market: GUARD,
    tavern: GUARD,
    college: ADVISOR,
    scrolls: ADVISOR,
    barracks: KNIGHT,
    graveyard: CURSED,
  };

  var SERIF = "Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif";
  var SANS = "Avenir Next, system-ui, sans-serif";

  function ini(name) {
    return (name || "?").trim().slice(0, 1).toUpperCase() || "?";
  }

  function glyph(id) {
    switch (id) {
      case "throne":
        return '<path d="M-18 10 L-18 -6 L-9 2 L0 -14 L9 2 L18 -6 L18 10 Z" fill="' + GOLDS + '" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/>'
          + '<line x1="-18" y1="10" x2="18" y2="10" stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round"/>';
      case "market":
        return '<path d="M-18 -2 H18 L14 -12 H-14 Z" fill="' + CREAM_HI + '" stroke="' + INK + '" stroke-width="1.6"/>'
          + '<circle cx="-6" cy="8" r="5" fill="' + GOLDS + '" stroke="' + INK + '" stroke-width="1.4"/>'
          + '<circle cx="7" cy="9" r="5" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.4"/>';
      case "tavern":
        return '<rect x="-10" y="-10" width="14" height="18" rx="1" fill="' + CREAM_HI + '" stroke="' + INK + '" stroke-width="1.6"/>'
          + '<path d="M4 -6 q8 0 8 8 q0 6 -7 6" fill="none" stroke="' + INK + '" stroke-width="1.6"/>'
          + '<path d="M-10 -10 q5 -5 9 0" fill="none" stroke="' + INK2 + '" stroke-width="1.6"/>';
      case "college":
        return '<path d="M0 -6 C-9 -12 -18 -10 -18 -10 V10 C-18 10 -9 8 0 12 C9 8 18 10 18 10 V-10 C18 -10 9 -12 0 -6 Z" fill="' + CREAM_HI + '" stroke="' + INK + '" stroke-width="1.6"/>'
          + '<line x1="0" y1="-6" x2="0" y2="12" stroke="' + INK + '" stroke-width="1.4"/>';
      case "scrolls":
        return '<rect x="-12" y="-10" width="24" height="20" rx="2" fill="' + CREAM_HI + '" stroke="' + INK + '" stroke-width="1.6"/>'
          + '<path d="M-12 -10 a4 4 0 0 0 0 20 M12 -10 a4 4 0 0 1 0 20" fill="none" stroke="' + INK + '" stroke-width="1.6"/>'
          + '<line x1="-5" y1="-2" x2="6" y2="-2" stroke="' + INK2 + '" stroke-width="1.2"/>'
          + '<line x1="-5" y1="3" x2="6" y2="3" stroke="' + INK2 + '" stroke-width="1.2"/>';
      case "barracks":
        return '<line x1="-14" y1="12" x2="14" y2="-12" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>'
          + '<line x1="14" y1="12" x2="-14" y2="-12" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>';
      case "graveyard":
        return '<path d="M-10 14 V-2 a10 10 0 0 1 20 0 V14 Z" fill="' + CREAM_HI + '" stroke="' + INK + '" stroke-width="1.6"/>'
          + '<path d="M0 -5 V7 M-5 1 H5" stroke="' + CURSED + '" stroke-width="2" stroke-linecap="round"/>';
      default:
        return "";
    }
  }

  function route(a, b) {
    var p = CT.MAP_XY[a], q = CT.MAP_XY[b];
    var grave = a === "graveyard" || b === "graveyard";
    var d = "M" + p[0] + " " + p[1] + " L" + q[0] + " " + q[1];
    return '<path d="' + d + '" fill="none" stroke="' + (grave ? CURSED : GOLD) + '" stroke-width="2.2" '
      + 'stroke-linecap="round" opacity="' + (grave ? 0.55 : 0.7) + '"/>'
      + '<circle cx="' + ((p[0] + q[0]) / 2) + '" cy="' + ((p[1] + q[1]) / 2) + '" r="3.2" fill="' + GOLDS + '" stroke="' + GOLD + '" stroke-width="1"/>';
  }

  function cornerFlourish(x, y, rot) {
    return '<path transform="translate(' + x + "," + y + ") rotate(" + rot + ')" '
      + 'd="M0 0 C14 0 22 8 22 22 M0 0 C0 14 8 22 22 22" fill="none" stroke="' + GOLD + '" stroke-width="1.4" opacity="0.85"/>';
  }

  function frame() {
    var w = 720, h = 920;
    return '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + CREAM + '"/>'
      + '<rect x="16" y="16" width="' + (w - 32) + '" height="' + (h - 32) + '" rx="12" fill="none" stroke="' + GOLD + '" stroke-width="2"/>'
      + '<rect x="24" y="24" width="' + (w - 48) + '" height="' + (h - 48) + '" rx="8" fill="none" stroke="' + INK + '" stroke-width="0.8" opacity="0.35"/>'
      + cornerFlourish(40, 40, 0) + cornerFlourish(w - 40, 40, 90)
      + cornerFlourish(40, h - 40, -90) + cornerFlourish(w - 40, h - 40, 180)
      + '<text x="48" y="58" font-family="' + SERIF + '" font-size="22" font-weight="600" fill="' + INK + '">The Kingdom</text>'
      + '<text x="48" y="76" font-family="' + SANS + '" font-size="9" letter-spacing="3" fill="' + GOLD + '">CURSED THRONE · V3B</text>'
      + '<line x1="48" y1="86" x2="200" y2="86" stroke="' + GOLD + '" stroke-width="1"/>'
      + '<circle cx="' + (w - 52) + '" cy="52" r="18" fill="none" stroke="' + GOLD + '" stroke-width="1.4"/>'
      + '<text x="' + (w - 52) + '" y="57" text-anchor="middle" font-family="' + SERIF + '" font-size="16" fill="' + ROYAL + '">✦</text>'
      + '<text x="' + (w / 2) + '" y="' + (h - 28) + '" text-anchor="middle" font-family="' + SERIF + '" font-size="11" font-style="italic" fill="' + INK2 + '">Graveyard links Tavern and Barracks</text>';
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
    var accent = LOC_ACCENT[id] || GUARD;
    var hero = id === "throne";
    var cardW = hero ? 96 : 84;
    var cardH = hero ? 128 : 112;
    var footH = 26;
    var label = loc.name.toUpperCase();
    var attrs = legal
      ? ' class="map-node legal" data-act="board-move" data-id="' + id + '" role="button" tabindex="0"'
      : ' class="map-node"';

    var legalRing = legal
      ? '<rect x="' + (-cardW / 2 - 6) + '" y="' + (-cardH / 2 - 6) + '" width="' + (cardW + 12) + '" height="' + (cardH + 12) + '" rx="12" '
        + 'fill="none" stroke="' + GOLDB + '" stroke-width="2.2" class="legal-ring" stroke-dasharray="6 5"/>' : "";
    var hereRing = activeHere
      ? '<rect x="' + (-cardW / 2 - 2) + '" y="' + (-cardH / 2 - 2) + '" width="' + (cardW + 4) + '" height="' + (cardH + 4) + '" rx="9" '
        + 'fill="none" stroke="' + GOLD + '" stroke-width="1.8" opacity="0.9"/>' : "";

    var body = '<rect x="' + (-cardW / 2) + '" y="' + (-cardH / 2) + '" width="' + cardW + '" height="' + cardH + '" rx="8" '
      + 'fill="' + CREAM_HI + '" stroke="' + GOLD + '" stroke-width="' + (hero ? 2.4 : 1.8) + '" filter="url(#cardShadow)"/>'
      + '<rect x="' + (-cardW / 2) + '" y="' + (cardH / 2 - footH) + '" width="' + cardW + '" height="' + footH + '" '
      + 'fill="' + accent + '" rx="0"/>'
      + '<rect x="' + (-cardW / 2) + '" y="' + (cardH / 2 - footH) + '" width="' + cardW + '" height="' + footH + '" '
      + 'fill="' + accent + '" clip-path="inset(0 0 0 0 round 0 0 8 8)"/>'
      + '<text y="' + (cardH / 2 - footH / 2 + 4) + '" text-anchor="middle" font-family="' + SERIF + '" font-size="' + (hero ? 11 : 10) + '" '
      + 'letter-spacing="1.2" font-weight="600" fill="' + CREAM_HI + '">' + label + "</text>"
      + '<g transform="translate(0,-6)">' + glyph(id) + "</g>";

    return '<g transform="translate(' + xy[0] + "," + xy[1] + ')"' + attrs + ">"
      + legalRing + hereRing + body + tokens(id, cardW, cardH) + "</g>";
  }

  CT.boardMapSVG = function () {
    var ap = CT.activePlayer();
    var legal = (ap && ap.status === "active" && !CT.state.winner) ? CT.legalMoves(ap) : [];
    var here = ap ? ap.location : null;

    var defs = '<defs>'
      + '<filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">'
      + '<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#2a2014" flood-opacity="0.18"/></filter>'
      + "</defs>";

    var routes = '<g class="map-routes">' + CT.MAP_ROUTES.map(function (r) {
      return route(r[0], r[1]);
    }).join("") + "</g>";

    var nodes = Object.keys(CT.MAP_XY).map(function (id) {
      return node(id, legal.indexOf(id) > -1, id === here);
    }).join("");

    return '<svg class="map map-v3b" viewBox="0 0 720 920" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of the kingdom">'
      + defs + frame() + routes + nodes + "</svg>";
  };
})();
