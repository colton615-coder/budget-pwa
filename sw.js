// Minimal service worker for cache (optional)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open('bb-cache-v1').then(cache => cache.addAll(['./','./index.html','./app.css','./app.js']).catch(()=>null))
  );
});
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => { event.respondWith(caches.match(event.request).then(resp => resp || fetch(event.request))); });
