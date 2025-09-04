// Optional: very small cache for faster reloads
self.addEventListener('install', (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open('bb-v1').then(c=>c.addAll(['./','./index.html','./app.css','./app.js']).catch(()=>null)));
});
self.addEventListener('activate', (e)=> e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e)=> e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request))));
