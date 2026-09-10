const CACHE='setwise-shell-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/icon-192.png','/icon-512.png','/apple-touch-icon.png'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('setwise-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const r=event.request,url=new URL(r.url);
 // Workout and coach data always go to D1 through the server, never a stale cache.
 if(r.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(r.mode==='navigate')event.respondWith(fetch(r).catch(async()=>{
  const cached=await caches.match('/offline.html');
  // Asset hosts may redirect HTML paths. Rebuild the response so WebKit accepts it for navigation.
  return new Response(cached?await cached.text():'You are offline. Reconnect and reload Setwise.',{headers:{'Content-Type':'text/html; charset=utf-8'}});
 }));
});
