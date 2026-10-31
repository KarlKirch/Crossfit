const CACHE='crossfit-app-v72';
const CORE=['./','./index.html','./styles.css?v=22','./forest-theme.css?v=12','./graphite-theme.css?v=1','./client-ux.css?v=2','./install-guide.js?v=1','./auth-flow.js?v=2','./app.js?v=43','./credit-system.js?v=9','./pro-features.js?v=4','./wod-bank.js?v=10','./wod-bank-import.js?v=7','./simple-navigation.js?v=1','./home-redesign.js?v=2','./training-list-redesign.js?v=5','./avatar-ui.js?v=1','./training-detail-redesign.js?v=6','./my-account-redesign.js?v=3','./credit-experience.js?v=2','./trainer-dashboard.js?v=1','./admin-redesign.js?v=2','./client-directory.js?v=1','./wod-review-ui.js?v=6','./training-form-redesign.js?v=4','./notification-center.js?v=2','./brand-home.js?v=3','./client-preview.js?v=1','./manifest.webmanifest?v=11','./brand-rcf.webp','./icon-512-rcf.webp','./brand-emblem.svg','./brand-landscape.svg','./icon-192.png','./icon-512.png'];

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
  // Tõuketeate avamisel suuna otse teavituskeskusesse.
  // Luba sihtkohaks ainult selle sama rakenduse aadress.
  let target='/Crossfit/?view=notifications';
  try{
    const u=new URL(data.url||'/Crossfit/',self.location.origin);
    if(u.origin===self.location.origin&&u.pathname.startsWith('/Crossfit/')){
      u.searchParams.set('view','notifications');
      target=u.href;
    }
  }catch(_){};
  event.waitUntil(self.registration.showNotification(data.title||'CrossFit',{
    body:data.body||'Sul on uus CrossFit teavitus.',
    icon:'./icon-512-rcf.webp',
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
