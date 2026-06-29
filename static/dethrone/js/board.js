/* The Cursed Throne — the board as a hand-drawn, weathered campaign map.
 * A spymaster's vellum, inked by candlelight. Pure inline SVG (offline,
 * scalable, no raster assets). Stays interactive: legal nodes carry
 * data-act="board-move" data-id and the existing delegated click handler
 * moves the active player. */
window.CT = window.CT || {};

CT.TOKEN_COLORS = ["#8c2f23", "#a8842c", "#3f6b4a", "#3a5a78", "#6e4a86", "#9c5a2a"];

/* node anchor points (viewBox 0 0 1000 720), laid out to match §7's map:
 *           Scrolls
 *              |
 *           College
 *              |
 * Tavern — Market — Throne — Barracks
 *    |                          |
 * Graveyard ---------------------                                     */
CT.MAP_XY = {
  scrolls:   [610,  92],
  college:   [610, 232],
  tavern:    [150, 392],
  market:    [402, 392],
  throne:    [640, 392],
  barracks:  [882, 392],
  graveyard: [486, 600],
};
CT.MAP_ROUTES = [
  ["market", "tavern"], ["market", "college"], ["market", "throne"],
  ["college", "scrolls"], ["throne", "barracks"],
  ["tavern", "graveyard"], ["barracks", "graveyard"],
];

(function () {
  var INK = "#2a2014", INK2 = "#5b4c38", GOLD = "#a8842c", GOLDB = "#c79a3a", GOLDS = "#e8d49a",
      WAX = "#8c2f23", MOSS = "#5a6e3a", MOSSD = "#3c4a26", PARCH = "#efe3c4", PARCHL = "#fbf6e9";

  function ini(name) { return (name || "?").trim().slice(0, 1).toUpperCase() || "?"; }

  /* ---- ink glyphs, centred on (0,0), ~±22 box ---- */
  function glyph(id) {
    switch (id) {
      case "throne": // crown
        return '<path d="M-22 12 L-22 -8 L-11 3 L0 -16 L11 3 L22 -8 L22 12 Z" fill="' + GOLDS + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>'
          + '<circle cx="0" cy="-16" r="2.6" fill="' + WAX + '"/><circle cx="-22" cy="-8" r="2.2" fill="' + WAX + '"/><circle cx="22" cy="-8" r="2.2" fill="' + WAX + '"/>'
          + '<line x1="-22" y1="12" x2="22" y2="12" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>';
      case "market": // stall awning + coins
        return '<path d="M-22 -4 H22 L17 -14 H-17 Z" fill="' + PARCHL + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>'
          + '<path d="M-9 -14 V-4 M2 -14 V-4" stroke="' + WAX + '" stroke-width="2.4"/>'
          + '<circle cx="-7" cy="10" r="6" fill="' + GOLDS + '" stroke="' + INK + '" stroke-width="1.8"/><circle cx="6" cy="12" r="6" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.8"/>';
      case "tavern": // tankard
        return '<path d="M-13 -12 H8 V14 H-13 Z" fill="' + PARCHL + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>'
          + '<path d="M8 -7 q12 0 12 10 q0 8 -10 8" fill="none" stroke="' + INK + '" stroke-width="2.2"/>'
          + '<path d="M-13 -12 q6 -7 11 -1 q5 -6 10 0" fill="none" stroke="' + INK2 + '" stroke-width="2.4"/>';
      case "college": // open book
        return '<path d="M0 -8 C -11 -15 -23 -13 -23 -13 V13 C -23 13 -11 11 0 15 C 11 11 23 13 23 13 V-13 C 23 -13 11 -15 0 -8 Z" fill="' + PARCHL + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>'
          + '<path d="M0 -8 V15" stroke="' + INK + '" stroke-width="2"/>'
          + '<path d="M-17 -7 q7 -2 13 1 M-17 0 q7 -2 13 1 M4 -6 q7 -3 13 0 M4 1 q7 -3 13 0" fill="none" stroke="' + INK2 + '" stroke-width="1.2"/>';
      case "scrolls": // scroll
        return '<rect x="-15" y="-12" width="30" height="24" rx="3" fill="' + PARCHL + '" stroke="' + INK + '" stroke-width="2.2"/>'
          + '<path d="M-15 -12 a5 5 0 0 0 0 24 M15 -12 a5 5 0 0 1 0 24" fill="none" stroke="' + INK + '" stroke-width="2.2"/>'
          + '<path d="M-7 -4 H8 M-7 2 H8" stroke="' + INK2 + '" stroke-width="1.4"/>';
      case "barracks": // crossed swords
        return '<line x1="-17" y1="15" x2="17" y2="-15" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>'
          + '<line x1="17" y1="15" x2="-17" y2="-15" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>'
          + '<line x1="-21" y1="6" x2="-11" y2="12" stroke="' + WAX + '" stroke-width="3" stroke-linecap="round"/>'
          + '<line x1="21" y1="6" x2="11" y2="12" stroke="' + WAX + '" stroke-width="3" stroke-linecap="round"/>';
      case "graveyard": // gravestone + cross
        return '<path d="M-13 17 V-3 a13 13 0 0 1 26 0 V17 Z" fill="' + PARCH + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>'
          + '<path d="M0 -7 V9 M-6 -1 H6" stroke="' + MOSSD + '" stroke-width="2.6" stroke-linecap="round"/>'
          + '<path d="M-18 18 q4 -6 8 0 M10 18 q4 -6 8 0" fill="none" stroke="' + MOSS + '" stroke-width="2"/>';
    }
    return "";
  }

  /* curved road between two anchors, with a hand-drawn wobble */
  function route(a, b) {
    var p = CT.MAP_XY[a], q = CT.MAP_XY[b];
    var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    // nudge the control point perpendicular for a gentle arc
    var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
    var off = 16, cx = mx + (-dy / len) * off, cy = my + (dx / len) * off;
    var dark = (a === "graveyard" || b === "graveyard");
    var d = "M" + p[0] + " " + p[1] + " Q" + cx + " " + cy + " " + q[0] + " " + q[1];
    return '<path d="' + d + '" fill="none" stroke="' + (dark ? MOSSD : INK) + '" stroke-width="' + (dark ? 3.2 : 2.6) + '" stroke-linecap="round" '
      + 'stroke-dasharray="1 9" opacity="' + (dark ? 0.5 : 0.42) + '" filter="url(#rough)"/>';
  }

  /* ---- decorative terrain (non-interactive), drawn under the nodes ---- */
  function pine(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ')">'
      + '<rect x="-2" y="' + (s * 0.18) + '" width="4" height="' + (s * 0.34) + '" fill="#6b4a2a"/>'
      + '<path d="M0 ' + (-s) + ' L' + (-s * 0.52) + ' ' + (-s * 0.28) + ' L' + (s * 0.52) + ' ' + (-s * 0.28) + ' Z" fill="#c4cfa6" stroke="#4d5a33" stroke-width="1.3"/>'
      + '<path d="M0 ' + (-s * 0.6) + ' L' + (-s * 0.68) + ' ' + (s * 0.2) + ' L' + (s * 0.68) + ' ' + (s * 0.2) + ' Z" fill="#c4cfa6" stroke="#4d5a33" stroke-width="1.3"/></g>';
  }
  function mount(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ')">'
      + '<path d="M0 ' + (-s) + ' L' + (s * 0.92) + ' 6 L' + (-s * 0.92) + ' 6 Z" fill="#e6dcc0" stroke="#6b5d49" stroke-width="1.6" stroke-linejoin="round"/>'
      + '<path d="M0 ' + (-s) + ' L' + (s * 0.26) + ' ' + (-s * 0.62) + ' L' + (-s * 0.26) + ' ' + (-s * 0.62) + ' Z" fill="#fbf6e9"/>'
      + '<path d="M0 ' + (-s) + ' L' + (-s * 0.28) + ' 6 M0 ' + (-s) + ' L' + (s * 0.2) + ' 6" stroke="#bda878" stroke-width="0.9"/></g>';
  }
  function hill(x, y, s) {
    return '<path d="M' + (x - s) + ' ' + y + ' q' + s + ' ' + (-s * 0.85) + ' ' + (2 * s) + ' 0" fill="none" stroke="#b09767" stroke-width="1.4" opacity="0.7"/>';
  }
  function regionLabel(x, y, txt, rot, size) {
    return '<text transform="translate(' + x + ',' + y + ') rotate(' + (rot || 0) + ')" text-anchor="middle" '
      + 'font-family="Iowan Old Style, Palatino, serif" font-style="italic" font-size="' + (size || 15) + '" letter-spacing="2.5" fill="#8a7a5e" opacity="0.72">' + txt + '</text>';
  }
  function terrain() {
    var t = '<g class="terrain">';
    // Frostspine peaks (upper-left)
    t += mount(170, 175, 78) + mount(265, 150, 96) + mount(355, 188, 60) + mount(110, 205, 52);
    t += regionLabel(245, 268, "THE FROSTSPINE", -7, 15);
    // The Tangled Wood (left flank) + scattered groves
    t += pine(70, 332, 30) + pine(108, 360, 26) + pine(64, 398, 30) + pine(104, 436, 24) + pine(80, 470, 28) + pine(140, 470, 22);
    t += pine(300, 300, 24) + pine(338, 326, 20) + pine(268, 322, 18);
    t += regionLabel(96, 300, "TANGLED WOOD", -90, 13);
    // River: from the peaks down to the fens (a bridge where it crosses the road)
    t += '<path d="M250 200 C 200 300 320 360 300 440 S 410 560 470 566" fill="none" stroke="#8aa0ab" stroke-width="6.5" opacity="0.5" stroke-linecap="round"/>'
      + '<path d="M250 200 C 200 300 320 360 300 440 S 410 560 470 566" fill="none" stroke="#cfdbe0" stroke-width="2" opacity="0.5"/>'
      + '<path d="M291 384 l18 16" stroke="#6b5d49" stroke-width="3" opacity="0.7"/>'; // little bridge
    // The Barrow Fens (around the graveyard)
    t += '<g stroke="#6f7d4e" stroke-width="1.6" opacity="0.55" fill="none">'
      + '<path d="M388 558 q10 -7 20 0 t20 0"/><path d="M548 548 q10 -7 20 0 t20 0"/><path d="M560 612 q10 -7 20 0 t20 0"/><path d="M398 626 q10 -7 20 0 t20 0"/></g>';
    t += regionLabel(610, 556, "THE BARROW FENS", -4, 13);
    // hills filling the mid-right
    t += hill(742, 250, 26) + hill(792, 262, 22) + hill(700, 268, 20);
    // Drake's Deep — a sea serpent, "here be monsters"
    t += '<g stroke="#5e6f78" stroke-width="2" fill="none" opacity="0.6">'
      + '<path d="M770 612 q18 -10 30 0 M812 606 q18 -10 30 0 M854 612 q18 -10 30 0"/>'
      + '<path d="M772 590 q22 -34 48 -12 q26 22 52 -2 q18 -16 34 2" stroke-width="3"/>'
      + '<circle cx="908" cy="582" r="8" fill="#e6dcc0" stroke="#5e6f78" stroke-width="2"/><circle cx="911" cy="580" r="1.6" fill="#2a2014" stroke="none"/>'
      + '<path d="M916 582 l10 -3 m-10 3 l10 3" stroke-width="1.4"/></g>';
    t += regionLabel(828, 648, "DRAKE’S DEEP", 0, 13);
    return t + '</g>';
  }

  function tokens(id) {
    var here = CT.state.players.filter(function (p) { return p.location === id; });
    if (!here.length) return "";
    var n = here.length, gap = 23, x0 = -((n - 1) * gap) / 2, R = id === "throne" ? 56 : id === "graveyard" ? 48 : 44;
    return here.map(function (p, k) {
      var idx = CT.state.players.indexOf(p), active = p.id === CT.activePlayer().id, elim = p.status === "eliminated";
      var x = x0 + k * gap, y = R + 50;
      return '<g transform="translate(' + x + ',' + y + ')" opacity="' + (elim ? 0.4 : 1) + '">'
        + (active ? '<circle r="12.5" fill="none" stroke="' + GOLDB + '" stroke-width="2.5"/>' : "")
        + '<circle r="9.5" fill="' + CT.TOKEN_COLORS[idx % CT.TOKEN_COLORS.length] + '" stroke="#231a10" stroke-width="1.6"/>'
        + '<text y="3.5" text-anchor="middle" font-family="Iowan Old Style, Palatino, Georgia, serif" font-size="11" font-weight="700" fill="#fbf6e9"'
        + (elim ? ' text-decoration="line-through"' : "") + '>' + ini(p.name) + "</text></g>";
    }).join("");
  }

  function node(id, legal, activeHere) {
    var l = CT.locationById(id), xy = CT.MAP_XY[id];
    var throne = id === "throne", grave = id === "graveyard", market = id === "market";
    var R = throne ? 56 : grave ? 48 : market ? 50 : 44;
    var ringCol = throne ? GOLD : grave ? MOSS : INK;
    var nameCol = throne ? "#7a5c12" : grave ? MOSSD : INK;

    var aura = throne ? '<circle r="92" fill="url(#throneRad)"/>'
      : grave ? '<circle r="86" fill="url(#graveRad)"/>' : "";

    var medallion =
      '<circle r="' + R + '" fill="' + (grave ? "#dfe3cb" : throne ? "#f6eccb" : "#f3e8c8") + '" stroke="' + ringCol + '" stroke-width="' + (throne ? 3.4 : 2.6) + '" filter="url(#shadow)"/>'
      + '<circle r="' + (R - 6) + '" fill="none" stroke="' + ringCol + '" stroke-width="1.1" opacity="0.55"/>'
      + (throne ? '<circle r="' + (R + 7) + '" fill="none" stroke="' + GOLDB + '" stroke-width="1" opacity="0.5"/>' : "");

    var legalRing = legal
      ? '<circle class="legal-ring" r="' + (R + 12) + '" fill="none" stroke="' + GOLDB + '" stroke-width="2.4" stroke-dasharray="5 7" stroke-linecap="round"/>' : "";
    var youAreHere = activeHere
      ? '<circle r="' + (R + 5) + '" fill="none" stroke="' + GOLD + '" stroke-width="1.6" opacity="0.85"/>' : "";

    // name ribbon under the medallion
    var label = l.name.toUpperCase();
    var rw = label.length * 8.6 + 26, ry = R + 8;
    var ribbon = '<g transform="translate(0,' + ry + ')">'
      + '<rect x="' + (-rw / 2) + '" y="0" width="' + rw + '" height="24" rx="3" fill="' + (grave ? MOSSD : INK) + '"/>'
      + '<text y="16.5" text-anchor="middle" font-family="Iowan Old Style, Palatino, Georgia, serif" font-size="13.5" letter-spacing="1.5" fill="' + PARCHL + '">' + label + "</text></g>";

    var attrs = legal ? ' class="map-node legal" data-act="board-move" data-id="' + id + '" role="button" tabindex="0"' : ' class="map-node"';
    return '<g transform="translate(' + xy[0] + ',' + xy[1] + ')"' + attrs + '>'
      + aura + legalRing + youAreHere + medallion
      + '<g class="medallion-glyph">' + glyph(id) + "</g>"
      + ribbon + tokens(id)
      + "</g>";
  }

  CT.boardMapSVG = function () {
    var ap = CT.activePlayer();
    var legal = (ap && ap.status === "active" && !CT.state.winner) ? CT.legalMoves(ap) : [];
    var here = ap ? ap.location : null;

    var defs = '<defs>'
      + '<radialGradient id="vignette" cx="50%" cy="46%" r="72%">'
      + '<stop offset="58%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#2a2014" stop-opacity="0.22"/></radialGradient>'
      + '<radialGradient id="throneRad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="' + GOLDS + '" stop-opacity="0.55"/><stop offset="100%" stop-color="' + GOLDS + '" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="graveRad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="' + MOSS + '" stop-opacity="0.42"/><stop offset="100%" stop-color="' + MOSS + '" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="stain" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#6b4a23" stop-opacity="0.16"/><stop offset="70%" stop-color="#6b4a23" stop-opacity="0.05"/><stop offset="100%" stop-color="#6b4a23" stop-opacity="0"/></radialGradient>'
      + '<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/>'
      + '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0 0.06  0 0 0 0.5 0"/></filter>'
      + '<filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="t"/>'
      + '<feDisplacementMap in="SourceGraphic" in2="t" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>'
      + '<filter id="roughHard"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="3" result="t"/>'
      + '<feDisplacementMap in="SourceGraphic" in2="t" scale="5"/></filter>'
      + '<filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#2a2014" flood-opacity="0.28"/></filter>'
      + '</defs>';

    // aged paper, vignette, tea-stains, fold creases, deckled border
    var paper = '<rect x="0" y="0" width="1000" height="720" fill="#f4ecd6"/>'
      + '<rect x="0" y="0" width="1000" height="720" fill="#caa86a" opacity="0.10" filter="url(#grain)"/>'
      + '<circle cx="180" cy="150" r="150" fill="url(#stain)"/><circle cx="880" cy="560" r="180" fill="url(#stain)"/><circle cx="540" cy="330" r="120" fill="url(#stain)"/>'
      + '<g stroke="#b59b66" stroke-width="1" opacity="0.35"><line x1="333" y1="0" x2="333" y2="720"/><line x1="667" y1="0" x2="667" y2="720"/><line x1="0" y1="360" x2="1000" y2="360"/></g>'
      + '<rect x="0" y="0" width="1000" height="720" fill="url(#vignette)"/>'
      + '<rect x="14" y="14" width="972" height="692" rx="6" fill="none" stroke="#2a2014" stroke-width="2.4" opacity="0.7" filter="url(#roughHard)"/>'
      + '<rect x="22" y="22" width="956" height="676" rx="4" fill="none" stroke="#2a2014" stroke-width="1" opacity="0.4" filter="url(#roughHard)"/>';

    // compass rose (top-right)
    var compass = '<g transform="translate(905,108)" opacity="0.82">'
      + '<circle r="40" fill="none" stroke="' + INK + '" stroke-width="1.4" filter="url(#roughHard)"/><circle r="31" fill="none" stroke="' + INK2 + '" stroke-width="0.8"/>'
      + '<path d="M0 -38 L7 0 L0 38 L-7 0 Z" fill="' + PARCHL + '" stroke="' + INK + '" stroke-width="1.4"/>'
      + '<path d="M-38 0 L0 7 L38 0 L0 -7 Z" fill="' + INK2 + '" stroke="' + INK + '" stroke-width="1.2" opacity="0.85"/>'
      + '<path d="M0 -38 L4 -4 L0 0 L-4 -4 Z" fill="' + WAX + '"/>'
      + '<text y="-44" text-anchor="middle" font-family="Iowan Old Style, Palatino, serif" font-size="15" font-weight="700" fill="' + INK + '">N</text></g>';

    // story cartouche (bottom-left)
    var cartouche = '<g transform="translate(150,652)">'
      + '<rect x="-118" y="-22" width="236" height="44" rx="5" fill="#f7eecb" stroke="' + INK + '" stroke-width="1.6" opacity="0.92" filter="url(#roughHard)"/>'
      + '<text y="-2" text-anchor="middle" font-family="Iowan Old Style, Palatino, serif" font-size="15" font-style="italic" fill="' + INK + '">The Cursed Realm</text>'
      + '<text y="14" text-anchor="middle" font-family="Avenir Next, system-ui, sans-serif" font-size="9" letter-spacing="2.5" fill="' + INK2 + '">HERE THE CROWN ROTS</text></g>';

    var svg = '<svg class="map" viewBox="0 0 1000 720" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of the kingdom">'
      + defs + paper + terrain()
      + '<g stroke-linejoin="round">' + CT.MAP_ROUTES.map(function (r) { return route(r[0], r[1]); }).join("") + "</g>"
      + Object.keys(CT.MAP_XY).map(function (id) { return node(id, legal.indexOf(id) > -1, id === here); }).join("")
      + compass + cartouche
      + "</svg>";
    return svg;
  };
})();
