// Quản Lý Bãi Xe - Service Worker
// Bump CACHE_NAME on every deploy to force update
const CACHE_NAME = 'parking-lot-v2';
const CORE_ASSETS = [
  '/index.html',
  '/app.js',
  '/manifest.json'
];
const OPTIONAL_ASSETS = [
  '/icon-192.png',
  '/icon-512.png'
];

// Install: cache core assets (required) + icons (best-effort)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(CORE_ASSETS).then(() =>
        Promise.allSettled(OPTIONAL_ASSETS.map(a => cache.add(a)))
      )
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   - Navigation (HTML): network-first so updates propagate; fall back to cache when offline
//   - Other same-origin assets: cache-first for fast loads, fall back to network
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
