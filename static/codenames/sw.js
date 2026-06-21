const CACHE_VERSION = 'cipher-pwa-20260621-1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

const STATIC_ASSETS = [
  '/play',
  '/play/manifest.webmanifest',
  '/play/assets/app.js',
  '/play/assets/styles.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
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
          .filter((key) => key.startsWith('cipher-pwa-') && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isPlayApi(url) {
  return sameOrigin(url) && url.pathname.startsWith('/play/api/');
}

function isPlayAsset(url) {
  return sameOrigin(url) && url.pathname.startsWith('/play/assets/');
}

function isPlayShell(url) {
  return sameOrigin(url) && (url.pathname === '/play' || url.pathname === '/play/');
}

function isPlayManifest(url) {
  return sameOrigin(url) && url.pathname === '/play/manifest.webmanifest';
}

function isPlayIcon(url) {
  return sameOrigin(url) && url.pathname.startsWith('/icons/');
}

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await cache.match(fallbackPath);
      if (fallback) return fallback;
    }
    return new Response('Offline — reconnect to play live.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function networkFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const fresh = await fetch(request, { cache: 'no-cache' });
    if (fresh && fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    return (await cache.match(request))
      || (await cache.match(new URL(request.url).pathname))
      || new Response('Offline', { status: 503 });
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
  } catch (_) {
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  if (isPlayApi(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate' && isPlayShell(url)) {
    event.respondWith(networkFirst(request, '/play'));
    return;
  }

  if (isPlayAsset(url)) {
    event.respondWith(networkFirstStatic(request));
    return;
  }

  if (isPlayManifest(url) || isPlayIcon(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
