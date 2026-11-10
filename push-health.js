'use strict';
/* Püsiv tõuketeavituste oleku kontroll: Rõuge CrossFit Android / PWA. */
(function(){
  const state=window.state;
  if(!state||typeof window.renderHome!=='function')return;
  const prior=window.renderHome;
  let status='checking',checking=null,lastCheck=0,activeUser=null,busy=false;
  const TICK=10*60*1000;
  const supported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
  const ios=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent||'')||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=()=>!!window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
  function banner(){
    if(!state.session?.user||status==='active')return '';
    let title='Lülita telefoni teavitused sisse';
    let message='Uutest treeningutest ja liitumistaotlustest teada saamiseks luba teavitused. Hoiatus jääb nähtavale kuni teavitused toimivad.';
    if(status==='checking')message='Kontrollime teavituste olekut. Võid juba vajutada „Luba teavitused“.';
    if(status==='denied'){
      title='Telefoni teavitused on blokeeritud';
      message=ios()?'Ava iPhone’i Seaded → Teavitused → CrossFit ja luba märguanded.':
        'Ava Androidi Seaded → Rakendused → CrossFit või Chrome → Teavitused ja luba märguanded.';
    }
    if(status==='install'){
      title='iPhone’is ava rakendus avakuvalt';
      message='Teavitused töötavad iPhone’is ainult avakuvale lisatud veebirakenduses. Ava paigaldusjuhend.';
    }
    if(status==='unsupported')message=ios()?'See iPhone või iOS-i versioon ei toeta veebiteavitusi. Vajalik on iOS 16.4 või uuem.':
      'See brauser ei toeta veebiteavitusi. Ava CrossFit Chrome’is ja värskenda brauserit.';
    if(status==='error')message='Teavituste seadistuse kontrollimine ebaõnnestus. Kontrolli internetiühendust ja proovi uuesti.';
    return '<section id="rcf-push-alert" class="rcf-push-alert" role="status" aria-live="polite">'+
      '<div class="rcf-push-alert-copy"><strong>'+title+'</strong><p>'+message+'</p></div>'+
      '<button type="button" class="rcf-push-alert-button" onclick="crossfitPushHealth.activate()"'+
        (busy?' disabled aria-busy="true"':'')+'>'+
        (busy?'Seadistan…':status==='install'?'Paigaldusjuhend':status==='denied'?'Kontrolli uuesti':
          status==='unsupported'?'Mida teha?':status==='error'?'Proovi uuesti':'Luba teavitused')+
      '</button></section>';
  }
  function updateBanner(){
    const el=document.getElementById('rcf-push-alert');
    if(state.view!=='home'||!state.session?.user)return;
    if(el){const next=banner();if(next)el.outerHTML=next;else el.remove();}
    else if(status!=='active' && typeof window.render==='function')window.render();
  }
  async function inspect(force=false){
    const uid=state.session?.user?.id;
    if(!uid){status='checking';activeUser=null;return;}
    if(!force&&activeUser===uid&&Date.now()-lastCheck<TICK)return;
    if(checking){
      if(!force)return checking;
      await checking;
    }
    checking=(async()=>{
      try{
        activeUser=uid;
        if(ios()&&!standalone()){status='install';return;}
        if(!supported()){status='unsupported';return;}
        if(Notification.permission==='denied'){status='denied';return;}
        if(Notification.permission!=='granted'){status='off';return;}
        const reg=await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker ei käivitunud')),8000))
        ]);
        const sub=await reg.pushManager.getSubscription();
        if(!sub){status='off';return;}
        const keys=sub.toJSON().keys||{};
        if(!keys.p256dh||!keys.auth){status='off';return;}
        // Kui teavituste luba ja tellimus on olemas, taasta puuduv serverikirje.
        // Päring tehakse ainult sisselogitud kasutaja enda tellimuse kohta.
        const path='wod_push_subscriptions?select=id,user_id&endpoint=eq.'+
          encodeURIComponent(sub.endpoint)+'&limit=1';
        const rows=await window.api(path);
        if(state.session?.user?.id!==uid)return;
        if(!Array.isArray(rows)||rows[0]?.user_id!==uid){
          await window.api('wod_push_subscriptions?on_conflict=endpoint',{
            method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
            body:JSON.stringify({user_id:uid,endpoint:sub.endpoint,
              p256dh:keys.p256dh,auth:keys.auth,updated_at:new Date().toISOString()})
          });
        }
        status='active';
      }catch(e){
        status='error';
        console.warn('CrossFit tõuketeavituse kontroll:',e);
      }finally{
        lastCheck=Date.now();checking=null;
        updateBanner();
      }
    })();
    return checking;
  }
  async function activate(){
    if(busy||!state.session?.user)return;
    if(ios()&&!standalone()){
      status='install';updateBanner();
      window.crossfitInstall?.openGuide?.();
      window.toast?.('iPhone’is ava CrossFit avakuva ikoonist.');
      return;
    }
    if(!supported()){
      status='unsupported';updateBanner();
      window.toast?.(ios()?'Vajalik on iOS 16.4 või uuem ja avakuvale lisatud rakendus.':
        'See brauser ei toeta veebiteavitusi. Proovi Chrome’i.');
      return;
    }
    if(Notification.permission==='denied'){
      status='denied';updateBanner();
      window.toast?.('Luba CrossFiti teavitused telefoni või brauseri seadetes.');
      return;
    }
    const enable=window.enablePush;
    if(typeof enable!=='function'){
      status='error';updateBanner();window.toast?.('Teavituste moodul ei laaditud. Uuenda rakendust.');
      return;
    }
    busy=true;
    let pending;
    // Teavituse loa küsimine käivitatakse otse nupuvajutusel, ilma eelneva await'ita.
    try{pending=enable();}
    catch(error){busy=false;status='error';updateBanner();window.toast?.(error.message||'Teavituste viga');return;}
    updateBanner();
    try{
      const ok=await pending;
      if(ok===false){status='error';lastCheck=Date.now();return;}
      await inspect(true);
      if(status!=='active')window.toast?.('Teavitused pole veel aktiivsed. Kontrolli telefoni seadeid ja proovi uuesti.');
    }catch(error){
      status='error';
      window.toast?.(error.message||'Teavituste seadistamine ebaõnnestus.');
    }finally{busy=false;updateBanner();}
  }
  window.renderHome=function(){
    const uid=state.session?.user?.id;
    if(uid&&activeUser!==uid){status='checking';lastCheck=0;}
    const html=prior();
    if(uid&&(!checking)&&(activeUser!==uid||Date.now()-lastCheck>TICK)){
      Promise.resolve().then(()=>inspect()).catch(()=>{});
    }
    return banner()+html;
  };
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')inspect(true);
  });
  window.addEventListener('focus',()=>inspect(true));
  window.setInterval(()=>{if(document.visibilityState==='visible')inspect();},TICK);
  window.crossfitPushHealth={inspect,activate};
})();