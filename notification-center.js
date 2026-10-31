'use strict';

/* 17. samm: teavituskeskus.
   Kõik teated pärinevad olemasolevast isiklikust wod_notifications tabelist.
   Lugemise muudatused käivad serveripoolse, kasutajaga piiratud RPC kaudu.
*/
(function(){
  const s=window.state;
  if(!s||typeof window.renderNotifications!=='function')return;
  const previous=window.renderNotifications;
  const esc=value=>window.esc(value);
  const IMPORTANT=new Set(['waitlist_promoted','training_cancelled','training_changed','training_details_changed','training_full']);
  const CATEGORIES={
    registration_confirmed:{name:'Registreering',icon:'check'},
    waitlist_joined:{name:'Ootenimekiri',icon:'clock'},
    waitlist_promoted:{name:'Koht vabanes',icon:'star'},
    training_cancelled:{name:'Tühistamine',icon:'alert'},
    training_changed:{name:'Aeg muutus',icon:'calendar'},
    training_details_changed:{name:'Treening muutus',icon:'calendar'},
    training_reminder:{name:'Meeldetuletus',icon:'clock'},
    training_full:{name:'Treening täis',icon:'users'},
    announcement:{name:'Teadaanne',icon:'megaphone'}
  };
  const svg={
    check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5 11-11"/></svg>',
    clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.2 6.5 7.2 1-5.2 5 .9 7-6.1-3.2-6.1 3.2.9-7-5.2-5 7.2-1Z"/></svg>',
    alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    users:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.5-4 2.6-6 6-6s5.5 2 6 6M14 14.4c3-.1 5.3 1.7 5.7 5.6"/></svg>',
    megaphone:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-2l13-5v12L4 13ZM7 14v5h4l1-4"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8M10 20h4"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.8 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.2-2"/></svg>'
  };
  const dateFmt=new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const validId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null};
  const notificationItems=()=>Array.isArray(s.notifications)?s.notifications:[];
  const now=()=>Date.now();
  let updating=false,reading=false,lastRefresh=0;
  if(!['all','unread','important'].includes(s.notificationsFilter))s.notificationsFilter='all';

  function counters(){
    const list=notificationItems();
    return {total:list.length,unread:list.filter(n=>!n.read_at).length,
      important:list.filter(n=>IMPORTANT.has(n.kind)).length};
  }
  function visible(){
    const filter=s.notificationsFilter||'all';
    const list=notificationItems().filter(n=>!n.due_at||Date.parse(n.due_at)<=now());
    if(filter==='unread')return list.filter(n=>!n.read_at);
    if(filter==='important')return list.filter(n=>IMPORTANT.has(n.kind));
    return list;
  }
  function date(value){
    const d=new Date(value);
    return Number.isFinite(d.getTime())?dateFmt.format(d):'';
  }
  function category(item){
    return CATEGORIES[item.kind]||{name:'Teavitus',icon:'bell'};
  }
  function row(item){
    const id=validId(item.id);
    if(!id)return '';
    const cat=category(item),urgent=IMPORTANT.has(item.kind),unread=!item.read_at;
    const hasTraining=!!validId(item.training_id);
    return '<button type="button" class="nc-notice'+(unread?' nc-unread':'')+(urgent?' nc-important':'')+
      '" onclick="crossfitNotifications.open('+id+')">'+
      '<span class="nc-item-icon'+(urgent?' nc-icon-important':'')+'">'+svg[cat.icon]+'</span>'+
      '<span class="nc-item-text">'+
        '<span class="nc-item-top"><span class="nc-category">'+esc(cat.name)+'</span>'+
          (unread?'<span class="nc-new-mark">Uus</span>':'')+'</span>'+
        '<strong>'+esc(item.title||'Teavitus')+'</strong>'+
        '<span class="nc-description">'+esc(item.body||'')+'</span>'+
        '<span class="nc-time">'+esc(date(item.created_at))+'</span>'+
      '</span>'+
      (hasTraining?'<span class="nc-item-arrow">'+svg.arrow+'</span>':'')+
      '</button>';
  }
  function filterButton(key,label,n){
    return '<button type="button" class="nc-filter'+(s.notificationsFilter===key?' selected':'')+
      '" aria-pressed="'+(s.notificationsFilter===key)+'" onclick="crossfitNotifications.setFilter('+"'"+key+"'"+')">'+
      label+' <span>'+n+'</span></button>';
  }
  function pushSettings(){
    return '<details class="nc-push-settings"><summary>Telefoni märguannete seaded</summary>'+ 
      '<section class="nc-push-card" aria-label="Telefoni teavitused">'+
        '<div class="nc-push-head"><span class="nc-push-icon">'+svg.bell+'</span>'+
          '<div><h2>Telefoni märguanded</h2><p id="pushText">Kontrollin teavituste olekut…</p></div>'+
          '<span id="pushPill" class="pill">Kontrollin</span></div>'+
        '<button class="btn btn-primary" id="pushToggle" type="button" onclick="togglePush()">Luba teavitused</button>'+
        '<p class="nc-push-hint">Rakendusesisesed teated jäävad nähtavaks ka siis, kui telefoni märguanded on välja lülitatud.</p>'+
      '</section>'+
      '</details>'+;
  }
  function render(){
    if(!s.session?.user)return previous();
    const counts=counters(),filtered=visible();
    return '<div class="nc-page">'+
      '<header class="nc-heading"><div><span class="nc-eyebrow">SINU SÕNUMID</span><h1>Teavitused</h1>'+
        '<p>Treeningukoht, ootenimekiri ja olulised muudatused.</p></div>'+
        '<button class="nc-refresh" type="button" onclick="crossfitNotifications.refresh(true)" aria-label="Värskenda teateid">'+svg.refresh+'</button></header>'+
      '<div class="nc-toolbar"><div class="nc-filters" role="group" aria-label="Teadete filtrid">'+
        filterButton('all','Kõik',counts.total)+
        filterButton('unread','Lugemata',counts.unread)+
        filterButton('important','Olulised',counts.important)+'</div>'+
        (counts.unread?'<button type="button" class="nc-read-all" onclick="crossfitNotifications.markAll()">Märgi kõik loetuks</button>':'')+
      '</div>'+
      '<div class="nc-list" aria-live="polite">'+
        (filtered.length?filtered.map(row).join(''):'<div class="nc-empty"><strong>'+
        (s.notificationsFilter==='unread'?'Kõik teated on loetud.':
          s.notificationsFilter==='important'?'Olulisi teateid veel pole.':'Teavitusi veel ei ole.')+
        '</strong><span>Uued registreeringud ja treeningute muudatused ilmuvad siia.</span></div>')+
      '</div>'+ 
      (window.isTrainer()?pushSettings():'')+
      '<p class="nc-footnote">Näidatakse viimast 80 teadet. Telefoni märguanded eeldavad seadme ja brauseri luba.</p></div>';
  }
  function setFilter(value){
    if(!['all','unread','important'].includes(value))return;
    s.notificationsFilter=value;window.render();
  }
  async function markRead(ids){
    if(reading||!s.session?.user)return false;
    reading=true;
    try{
      await window.rpc('wod_mark_notifications_read',{p_ids:ids});
      const selected=ids?new Set(ids.map(Number)):null;
      const stamp=new Date().toISOString();
      for(const n of notificationItems()){
        if(!selected||selected.has(Number(n.id)))n.read_at=n.read_at||stamp;
      }
      return true;
    }catch(e){
      window.toast(e?.message||'Teate märkimine ebaõnnestus.');
      return false;
    }finally{reading=false}
  }
  async function open(idValue){
    const id=validId(idValue),item=notificationItems().find(n=>Number(n.id)===id);
    if(!item||!s.session?.user)return false;
    if(!item.read_at)await markRead([id]);
    const tid=validId(item.training_id);
    if(tid){
      const training=(s.trainings||[]).find(t=>Number(t.id)===tid);
      if(training){
        window.openTraining(tid);
        return true;
      }
      window.go('trainings');
      window.toast('Seda treeningut ei ole enam laaditud treeningute loendis.');
      return true;
    }
    window.render();
    return true;
  }
  async function markAll(){
    if(!notificationItems().some(n=>!n.read_at))return;
    if(await markRead(null)){
      window.render();
      window.toast('Teavitused on märgitud loetuks.');
    }
  }
  async function refresh(force=false){
    if(updating||!s.session?.user?.id)return false;
    if(!force&&Date.now()-lastRefresh<20000)return false;
    updating=true;
    const userId=s.session.user.id;
    try{
      const query='wod_notifications?select=*&user_id=eq.'+encodeURIComponent(userId)+'&order=created_at.desc&limit=80';
      const fetched=await window.api(query);
      if(s.session?.user?.id!==userId)return false;
      const fresh=(Array.isArray(fetched)?fetched:[]).filter(n=>!n.due_at||Date.parse(n.due_at)<=now());
      const current=notificationItems();
      const diff=fresh.length!==current.length||fresh.some((n,i)=>
        Number(n.id)!==Number(current[i]?.id)||Boolean(n.read_at)!==Boolean(current[i]?.read_at));
      s.notifications=fresh;
      lastRefresh=Date.now();
      if(diff&&s.profile)window.render();
      return true;
    }catch(e){
      if(force)window.toast(e?.message||'Teavituste värskendamine ebaõnnestus.');
      return false;
    }finally{updating=false}
  }

  // Sisselogitud ja nähtav rakendus kontrollib uusi teateid korrapäraselt;
  // fookuse/taasavamise kontrolli piiritletakse ühe päringuga.
  if(typeof document!=='undefined'&&document.addEventListener){
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')refresh();
    });
  }
  window.addEventListener('focus',()=>refresh());
  const timer=window.setInterval?.(()=>{
    if(s.session?.user&&(!document.visibilityState||document.visibilityState==='visible'))refresh();
  },60000);
  if(timer&&typeof timer.unref==='function')timer.unref();

  window.renderNotifications=render;
  window.crossfitNotifications={render,visible,counters,setFilter,open,markAll,markRead,refresh,pushSettings};
})();