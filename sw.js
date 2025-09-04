// Ledgerly Service Worker — offline-first static caching
// bump the version when you change any cached asset filenames
const CACHE = 'ledgerly-v2';

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-48.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/mask.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Network-first for HTML, cache-first for everything else
  if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return resp;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(resp => {
          // Only cache same-origin requests
          const url = new URL(request.url);
          if (url.origin === location.origin) {
            const copy = resp.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return resp;
        })
        .catch(() => {
          // fallback to app shell if offline and asset missing
          if (request.destination === 'image') return caches.match('icons/icon-192.png');
          return caches.match('./');
        });
    })
  );
});
