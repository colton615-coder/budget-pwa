// sw.js — Budget Buddy Service Worker (v2)
const CACHE = 'bb-cache-v2'; // <-- bumped!
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((res) => {
            return caches.open(CACHE).then((cache) => {
              cache.put(event.request, res.clone());
              return res;
            });
          })
          .catch(() => {
            if (event.request.mode === 'navigate') return caches.match('./index.html');
          })
      })
    );
  }
});
