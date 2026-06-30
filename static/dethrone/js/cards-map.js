/* The Cursed Throne — kingdom map art (V3b illustrated poster + location vignettes). */
window.CT = window.CT || {};

CT.MAP_ART_VERSION = window.__DETHRONE_CARD_V || "20260630-p25";
CT.MAP_BACKGROUND = "kingdom-background-v3b.jpg";
CT.MAP_LOCATION_FILES = {
  scrolls: "location-scrolls-v3b.jpg",
  college: "location-college-v3b.jpg",
  tavern: "location-tavern-v3b.jpg",
  market: "location-market-v3b.jpg",
  throne: "location-throne-v3b.jpg",
  barracks: "location-barracks-v3b.jpg",
  graveyard: "location-graveyard-v3b.jpg",
};

CT.mapBackgroundUrl = function (opts) {
  opts = opts || {};
  var v = opts.v != null ? opts.v : CT.MAP_ART_VERSION;
  return "cards/map/" + CT.MAP_BACKGROUND + (v ? "?v=" + encodeURIComponent(v) : "");
};

CT.mapLocationUrl = function (locId, opts) {
  opts = opts || {};
  var file = CT.MAP_LOCATION_FILES[locId];
  if (!file) return "";
  var v = opts.v != null ? opts.v : CT.MAP_ART_VERSION;
  return "cards/map/" + file + (v ? "?v=" + encodeURIComponent(v) : "");
};
