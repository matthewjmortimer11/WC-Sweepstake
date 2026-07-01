/* The Cursed Throne — offline shell for installed PWA */
var CACHE = "dethrone-20260701-p36";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./icons/icon.svg",
  "./cards/map/kingdom-background-v3b.jpg",
  "./js/data.js",
  "./js/cards-roles.js",
  "./js/cards-court.js",
  "./js/cards-map.js",
  "./js/cards-action.js",
  "./js/cards-extra.js",
  "./js/balance.js",
  "./js/report.js",
  "./js/state.js",
  "./js/bot.js",
  "./js/board.js",
  "./js/helpers.js",
  "./js/setup.js",
  "./js/net.js",
  "./js/playtest.js",
  "./js/app.js",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (url.pathname.indexOf("/dethrone/ws") !== -1 || url.pathname.indexOf("/dethrone/api") !== -1) {
    return;
  }
  if (url.pathname.indexOf("/dethrone") !== 0) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request).then(function (res) {
        if (res && res.status === 200 && event.request.method === "GET") {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      });
    })
  );
});
