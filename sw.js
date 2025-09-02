// sw.js — Budget Buddy Service Worker
const CACHE = 'bb-cache-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest'
];

// Install: pre-cache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for local assets, network fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Same-origin requests only
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then(res =>
        res ||
        fetch(event.request)
          .then(networkRes => {
            // Save new file in cache
            return caches.open(CACHE).then(cache => {
              cache.put(event.request, networkRes.clone());
              return networkRes;
            });
          })
          .catch(() => {
            // Offline fallback → index.html
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          })
      )
    );
  }
});
