const CACHE='crossfit-shell-v1';
const CORE=['./','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE&&k.startsWith('crossfit-shell-'))await caches.delete(k);await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin||!url.pathname.startsWith('/Crossfit/'))return;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{try{const r=await fetch(req);const c=await caches.open(CACHE);c.put('./',r.clone());return r}catch(_){return (await caches.match('./'))||Response.error()}})());
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));return r})))
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{}}catch(_){data={}}
  event.waitUntil(self.registration.showNotification(data.title||'CrossFit',{
    body:data.body||'Sul on uus CrossFit teavitus.',
    icon:'./icon-192.png',badge:'./icon-192.png',
    tag:data.tag||'crossfit-notification',
    data:{url:'/Crossfit/'}
  }))
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target='/Crossfit/';
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of list){if('focus'in client){await client.focus();if('navigate'in client)await client.navigate(target);return}}
    if(clients.openWindow)return clients.openWindow(target)
  })())
});
