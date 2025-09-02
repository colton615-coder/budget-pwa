const CACHE='bb-cache-tabs-v1';
const APP_SHELL=[
  './','./index.html','./styles.css','./app.js','./manifest.webmanifest',
  './assets/logo.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/maskable-icon-512.png'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL))); self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim();});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin===location.origin){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{caches.open(CACHE).then(c=>c.put(e.request,res.clone())); return res;}).catch(()=>caches.match('./index.html'))));
  }else{
    e.respondWith(fetch(e.request).then(res=>{caches.open(CACHE).then(c=>c.put(e.request,res.clone())); return res;}).catch(()=>caches.match(e.request)));
  }
});
