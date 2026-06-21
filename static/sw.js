const CACHE_VERSION = 'wheesht-pwa-20260621-polish-1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/app/wc-snapshot.js',
  '/app/data.js',
  '/app/store.js',
  '/app/wheesht-mascot.jsx',
  '/app/ui.jsx',
  '/tweaks-panel.jsx',
  '/app/screens-hub.jsx',
  '/app/screens-hub2.jsx',
  '/app/screens-onboarding.jsx',
  '/app/screens-dashboard.jsx',
  '/app/screens-competition.jsx',
  '/app/screens-predictions.jsx',
  '/app/screens-games.jsx',
  '/app/screens-match-centre.jsx',
  '/app/screens-what-if.jsx',
  '/app/screens-admin.jsx',
  '/app/screens-chat.jsx',
  '/app/screens-dev.jsx',
  '/app/app.jsx',
  '/app/stage.jsx'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('wheesht-pwa-') && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/api/');
}

function isStaticRequest(url) {
  return url.origin === self.location.origin && (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/app/') ||
    url.pathname === '/tweaks-panel.jsx'
  );
}

function isCodeRequest(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith('/app/') ||
    url.pathname === '/tweaks-panel.jsx'
  );
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    return (await cache.match(request)) || (await cache.match('/')) || new Response('Offline', { status: 503 });
  }
}

async function networkFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const fresh = await fetch(request, { cache: 'no-cache' });
    if (fresh && fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    return (await cache.match(request)) || (await cache.match(new URL(request.url).pathname)) || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    });
  if (cached) {
    fresh.catch(() => {});
    return cached;
  }
  try {
    return await fresh;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isCodeRequest(url)) {
    event.respondWith(networkFirstStatic(request));
    return;
  }

  if (isStaticRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
