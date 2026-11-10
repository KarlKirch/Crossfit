const CACHE='crossfit-app-v97';
const CORE=['./','./index.html','./styles.css?v=23','./forest-theme.css?v=12','./graphite-theme.css?v=4','./client-ux.css?v=6','./install-guide.js?v=3','./auth-flow.js?v=8','./app.js?v=64','./credit-system.js?v=10','./pro-features.js?v=7','./wod-bank.js?v=10','./wod-bank-import.js?v=7','./simple-navigation.js?v=1','./home-redesign.js?v=2','./training-list-redesign.js?v=6','./avatar-ui.js?v=2','./training-detail-redesign.js?v=9','./my-account-redesign.js?v=6','./credit-experience.js?v=2','./trainer-dashboard.js?v=1','./admin-redesign.js?v=3','./client-admin.js?v=1','./client-directory.js?v=3','./wod-review-ui.js?v=7','./training-form-redesign.js?v=4','./notification-center.js?v=4','./brand-home.js?v=3','./cash-booking.js?v=1','./message-center.js?v=3','./client-preview.js?v=2','./approval-system.js?v=3','./manifest.webmanifest?v=14','./brand-rcf.webp','./icon-512-rcf.webp','./brand-emblem.svg','./brand-landscape.svg','./icon-192.png','./icon-512.png','./icon-192-maskable.png','./icon-512-maskable.png','./social-preview-rcf.png','./liitu.html','./liitu.css?v=1','./liitu.js?v=1','./taasta.html','./taasta.js?v=1','./recovery-admin.js?v=1','./recovery.css?v=1','./attendance.css?v=2','./avatar-preview.css?v=1','./attendance-stats.js?v=2','./push-health.js?v=2','./push-health.css?v=1','./mobile-account.css?v=1','./uuenda.html'];

// Varem nurjus kogu uuendus, kui kas või üks paljudest failidest ei laadinud.
// Väike baas käivitab uue SW kiirelt; ülejäänud failide tõrge ei blokeeri uuendust.
const REQUIRED=['./','./index.html','./styles.css?v=23','./app.js?v=64'];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(REQUIRED);
    // Säilitame võrguühenduseta kasutuse: proovime ülejäänud failid
    // ükshaaval, kuid ebaõnnestumine ei takista uut versiooni.
    await Promise.allSettled(CORE.filter(file=>!REQUIRED.includes(file)).map(async file=>{
      const abort=new AbortController();
      const timer=setTimeout(()=>abort.abort(),10000);
      try{
        const response=await fetch(file,{cache:'no-store',signal:abort.signal});
        if(response.ok)await cache.put(file,response);
      }finally{clearTimeout(timer)}
    }));
  })());
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
