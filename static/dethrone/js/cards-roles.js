/* The Cursed Throne — printable role card art (V3b poker, 750×1050). */
window.CT = window.CT || {};

CT.ROLE_CARD_VERSION = window.__DETHRONE_CARD_V || "20260630-p19";
CT.ROLE_CARD_BACK = "role-card-back-v3b-poker.png";
CT.ROLE_CARD_FILES = {
  king: "king-card-v3b-poker.png",
  queen: "queen-card-v3b-poker.png",
  cursedone: "cursed-one-card-v3b-poker.png",
  firstborn: "firstborn-noble-card-v3b-poker.png",
  secondborn: "secondborn-noble-card-v3b-poker.png",
  tinytyrant: "tiny-tyrant-card-v3b-poker.png",
  distantcousin: "distant-cousin-card-v3b-poker.png",
  royalknight: "royal-knight-card-v3b-poker.png",
  blackknight: "black-knight-card-v3b-poker.png",
  wanderingknight: "wandering-knight-card-v3b-poker.png",
  youngknight: "young-knight-card-v3b-poker.png",
  royalguard: "royal-guard-card-v3b-poker.png",
  gateguard: "gate-guard-card-v3b-poker.png",
  graveyardguard: "graveyard-guard-card-v3b-poker.png",
  courtfavourite: "court-favourite-card-v3b-poker.png",
  thief: "thief-card-v3b-poker.png",
  spy: "spy-card-v3b-poker.png",
  royaladvisor: "royal-advisor-card-v3b-poker.png",
  collegeadvisor: "college-advisor-card-v3b-poker.png",
  tavernwhisperer: "tavern-whisperer-card-v3b-poker.png",
};

CT.roleCardUrl = function (roleId, opts) {
  opts = opts || {};
  var file = opts.face === "back" ? CT.ROLE_CARD_BACK : CT.ROLE_CARD_FILES[roleId];
  if (!file) return "";
  var v = opts.v != null ? opts.v : CT.ROLE_CARD_VERSION;
  return "cards/roles/" + file + (v ? "?v=" + encodeURIComponent(v) : "");
};

CT.roleCardImg = function (roleId, opts) {
  opts = opts || {};
  var url = CT.roleCardUrl(roleId, opts);
  if (!url) {
    var role = roleId ? CT.roleById(roleId) : null;
    return role
      ? '<span class="role-card-fallback">' + CT.esc(role.name) + "</span>"
      : "";
  }
  var size = opts.size ? " role-card--" + opts.size : "";
  var roleMeta = roleId ? CT.roleById(roleId) : null;
  var alt = opts.alt || (roleMeta ? roleMeta.name + " role card" : "Role card back");
  return '<img class="role-card' + size + '" src="' + url + '" alt="' + CT.esc(alt)
    + '" loading="lazy" decoding="async">';
};

CT.roleCardBacksHtml = function (count) {
  count = count || 3;
  var url = CT.roleCardUrl(null, { face: "back" });
  if (!url) return "";
  var imgs = [];
  for (var i = 0; i < count; i++) {
    imgs.push('<img class="role-card role-card--back" src="' + url + '" alt="" loading="lazy" decoding="async">');
  }
  return '<div class="role-card-backs" aria-hidden="true">' + imgs.join("") + "</div>";
};

CT.roleCardPickHtml = function (roleId, bodyHtml, opts) {
  opts = opts || {};
  var cls = "role-card-pick"
    + (opts.active ? " active" : "")
    + (opts.disabled ? " role-card-pick--disabled" : "");
  return '<div class="' + cls + '">'
    + CT.roleCardImg(roleId, { size: opts.size || "pick" })
    + (bodyHtml ? '<div class="role-card-actions">' + bodyHtml + "</div>" : "")
    + "</div>";
};
