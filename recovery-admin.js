'use strict';
(function(){
  const endpoint='https://aanxpugvehwtcwwpefwx.supabase.co/functions/v1/rcf-password-recovery';
  let busy=false;
  function close(){
    const el=document.getElementById('rcf-recovery-overlay');
    if(el)el.remove();
  }
  function reveal(code,name){
    close();
    const overlay=document.createElement('div');
    overlay.id='rcf-recovery-overlay';
    overlay.setAttribute('role','presentation');
    const dialog=document.createElement('section');
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-label','Kliendi taastekood');
    dialog.className='rcf-recovery-dialog';
    const h=document.createElement('h2');
    h.textContent='Kliendi taastekood';
    const intro=document.createElement('p');
    intro.textContent='Edasta see kood kliendile '+name+' turvalise sõnumiga pärast tema isiku kontrollimist. Kood kehtib 24 tundi ja seda saab kasutada ainult üks kord.';
    const strong=document.createElement('div');
    strong.className='rcf-recovery-code';
    strong.textContent=code;
    const advice=document.createElement('p');
    advice.textContent='Kood kuvatakse ainult praegu. Kui sulged akna, ei saa sama koodi uuesti vaadata. Vajadusel väljasta hiljem uus kood.';
    const copy=document.createElement('button');
    copy.type='button';copy.className='btn btn-primary';
    copy.textContent='Kopeeri taastekood';
    copy.addEventListener('click',async()=>{
      try{
        await navigator.clipboard.writeText(code);
        window.toast('Taastekood kopeeritud');
      }catch(_){window.prompt('Kopeeri taastekood:',code);}
    });
    const done=document.createElement('button');
    done.type='button';done.className='btn btn-soft';
    done.textContent='Sulge';
    done.addEventListener('click',close);
    const buttons=document.createElement('div');
    buttons.className='rcf-recovery-actions';
    buttons.append(copy,done);
    dialog.append(h,intro,strong,advice,buttons);
    overlay.append(dialog);
    document.body.append(overlay);
    done.focus();
  }
  async function issue(uid){
    if(busy||!window.isTrainer?.()||window.state?.clientPreview)return;
    const client=(window.state?.profiles||[]).find(p=>p.role==='client'&&p.user_id===uid);
    if(!client)return;
    if(!window.confirm('Kas oled kontrollinud, et taastekoodi küsib '+client.display_name+' ise? Taastekoodiga saab selle kliendi parooli muuta.'))return;
    const token=window.state?.session?.access_token;
    if(!token){window.toast('Treeneri sessioon puudub. Logi uuesti sisse.');return;}
    busy=true;
    try{
      const response=await fetch(endpoint,{
        method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'issue',client_id:uid})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok){window.toast(data.message||'Taastekoodi väljastamine ebaõnnestus.');return;}
      if(!/^[A-F0-9]{4}(-[A-F0-9]{4}){3}$/.test(data.code||'')){
        window.toast('Taastekoodi vastus oli vigane.');return;
      }
      reveal(data.code,String(client.display_name||'Kasutaja'));
    }catch(_){window.toast('Taasteteenusega ei saadud ühendust.');}
    finally{busy=false;}
  }
  window.crossfitRecovery={issue,close};
})();
