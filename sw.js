const CACHE='crossfit-app-v4';
const CORE=['./','./index.html','./styles.css?v=4','./app.js?v=4','./manifest.webmanifest?v=4','./icon-192.png','./icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('crossfit-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith('/Crossfit/')) return;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        const c=await caches.open(CACHE);
        c.put('./',fresh.clone());
        return fresh;
      }catch(_){
        return (await caches.match('./'))||(await caches.match('./index.html'))||Response.error();
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    try{
      const fresh=await fetch(req,{cache:'no-store'});
      if(fresh.ok){const c=await caches.open(CACHE);c.put(req,fresh.clone())}
      return fresh;
    }catch(_){
      return (await caches.match(req))||Response.error();
    }
  })());
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(_){data={}}
  const target=data.url&&String(data.url).includes('/Crossfit/')?data.url:'/Crossfit/';
  event.waitUntil(self.registration.showNotification(data.title||'CrossFit',{
    body:data.body||'Sul on uus CrossFit teavitus.',
    icon:'./icon-192.png',
    badge:'./icon-192.png',
    tag:data.tag||'crossfit-notification',
    data:{url:target}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=event.notification.data?.url||'/Crossfit/';
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of list){
      if('focus'in client){
        await client.focus();
        if('navigate'in client) await client.navigate(target);
        return;
      }
    }
    if(clients.openWindow) return clients.openWindow(target);
  })());
});
