'use strict';
/* Püsiv tõuketeavituste oleku kontroll: Rõuge CrossFit Android / PWA. */
(function(){
  const state=window.state;
  if(!state||typeof window.renderHome!=='function')return;
  const prior=window.renderHome;
  let status='checking',checking=null,lastCheck=0,activeUser=null;
  const TICK=10*60*1000;
  const supported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
  function banner(){
    if(!state.session?.user||status==='active')return '';
    let title='Lülita telefoni teavitused sisse';
    let message='Uutest treeningutest ja liitumistaotlustest teada saamiseks luba teavitused. Hoiatus jääb nähtavale kuni teavitused toimivad.';
    if(status==='checking')message='Kontrollime, kas sinu telefon saab CrossFiti teavitusi.';
    if(status==='denied'){
      title='Telefoni teavitused on blokeeritud';
      message='Ava Androidi Seaded → Rakendused → CrossFit või Chrome → Teavitused ja luba märguanded. Seejärel naase äppi.';
    }
    if(status==='unsupported')message='Selles brauseris ei ole tõuketeavitused toetatud. Ava äpp Androidi Chrome’i kaudu.';
    if(status==='error')message='Teavituste seadistuse kontrollimine ebaõnnestus. Kontrolli internetiühendust ja proovi uuesti.';
    return '<section id="rcf-push-alert" class="rcf-push-alert" role="status" aria-live="polite">'+
      '<div class="rcf-push-alert-copy"><strong>'+title+'</strong><p>'+message+'</p></div>'+
      '<button type="button" class="rcf-push-alert-button" onclick="crossfitPushHealth.activate()">'+
        (status==='denied'?'Kontrolli uuesti':status==='checking'?'Kontrollin…':status==='error'?'Proovi uuesti':'Luba teavitused')+
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
    if(checking)return checking;
    checking=(async()=>{
      try{
        activeUser=uid;
        if(!supported()){status='unsupported';return;}
        if(Notification.permission==='denied'){status='denied';return;}
        if(Notification.permission!=='granted'){status='off';return;}
        const reg=await navigator.serviceWorker.ready;
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
    if(status==='denied'){
      window.toast?.('Luba Androidi rakenduse või Chrome’i teavitused seadetes, siis kontrolli uuesti.');
      return inspect(true);
    }
    if(status==='unsupported')return;
    if(status==='checking')return inspect(true);
    if(Notification.permission==='granted'){
      // Puuduva või aegunud tellimuse korral loob olemasolev funktsioon uue.
      try{
        const reg=await navigator.serviceWorker.ready;
        if(await reg.pushManager.getSubscription())return inspect(true);
      }catch(_){}
    }
    if(typeof window.togglePush==='function')await window.togglePush();
    else if(typeof togglePush==='function')await togglePush();
    await inspect(true);
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