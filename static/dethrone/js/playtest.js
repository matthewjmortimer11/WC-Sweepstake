/* Host playtest guide (Phase 7) — shown in-app from lobby & game screens */
window.CT = window.CT || {};

CT.PLAYTEST_STEPS = [
  { title: "Gather the court", items: [
    "Create a room and share the invite link (add ?name= for each player).",
    "Set player count to match the table. Everyone joins and checks their name.",
    "Host deals when all seats are full — non-hosts see a waiting message.",
  ]},
  { title: "Deal & hidden Cursed One", items: [
    "Each player reveals 3 roles privately and picks one public role.",
    "Cursed One must stay hidden — confirm at the table before beginning.",
    "Host begins when all players show ready.",
  ]},
  { title: "Smoke test the loop", items: [
    "Move (tap glowing site) → location action → end turn.",
    "Private view: only that player sees hidden roles and cards.",
    "Over hand limit: discard down before end turn (app will block you).",
  ]},
  { title: "Social mechanics", items: [
    "One Call Out — corruption +2, correct guess reveals a role.",
    "One formal vote — loser discards privately on their device.",
    "One disconnect/reconnect — same device keeps the same seat.",
  ]},
  { title: "Wrap up", items: [
    "Export Report — check the chronicle matches public events only.",
    "Log playtest notes in Test mode for anything confusing.",
  ]},
];

CT.playtestGuideHtml = function () {
  return CT.PLAYTEST_STEPS.map(function (sec) {
    return '<section style="margin-bottom:16px"><h3 style="margin:0 0 8px;font-size:16px">' + CT.esc(sec.title) + '</h3><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5">'
      + sec.items.map(function (it) { return "<li>" + CT.esc(it) + "</li>"; }).join("")
      + "</ul></section>";
  }).join("");
};
