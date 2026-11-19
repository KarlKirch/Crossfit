'use strict';
/* Toimunud treeningu tegelikud kohalolijad. Ainult nimed, mitte maksed ega registreerimisandmed.
 * Server väljastab ainult kinnitatud kohaloleku, kaasa arvatud külalised. */
(function(){
  const s=window.state;
  if(!s||typeof window.renderModal!=='function'||typeof window.openTraining!=='function')return;
  const ROOT='https://aanxpugvehwtcwwpefwx.supabase.co';
  const KEY='sb_publishable_ICMR8EF0LK69VjfVRWe0ew_120LIV7A';
  const previousModal=window.renderModal;
  const previousOpenTraining=window.openTraining;
  const previousLoad=window.loadData;
  const rowsByTraining=new Map(),requests=new Map();
  const safeId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0?Number(id):null;
  const esc=x=>window.esc(x);
  function eligible(training){
    return !!training&&training.status==='published'&&!training.archived_at&&
      Number.isFinite(Date.parse(training.starts_at))&&
      Date.parse(training.starts_at)+Math.max(0,Number(training.duration_minutes)||0)*60000<=Date.now();
  }
  function section(trainingId){
    const id=safeId(trainingId);
    if(id===null)return '';
    const data=rowsByTraining.get(id);
    let body='';
    if(!data)body='<p class="td-roster-state" role="status">Laadin kohalolijate nimekirja…</p>';
    else if(data.error)body='<p class="td-roster-state" role="alert">Kohalolijate nimekirja laadimine ebaõnnestus.</p>'+
      '<button type="button" class="td-roster-retry" onclick="crossfitCompletedRoster.refresh('+id+')">Proovi uuesti</button>';
    else if(!data.names.length)body='<p class="td-roster-state">Treener pole sellel treeningul veel ühtegi kohalolekut kinnitanud.</p>';
    else body='<ul class="td-roster-names">'+data.names.map(name=>
      '<li>'+esc(name)+'</li>').join('')+'</ul>';
    const title=data&&!data.error&&data.names.length
      ?'Osalesid ('+data.names.length+')':'Osalesid';
    return '<section class="td-section td-completed-roster" data-roster-training="'+id+
      '" aria-label="Toimunud treeningu osalejad"><h3>'+title+'</h3>'+body+'</section>';
  }
  async function query(id){
    if(!s.session?.access_token)throw Error('Sessioon puudub.');
    if(!s.clientPreview)return window.rpc('wod_completed_attendees_secure',{p_training_id:id});
    // Kliendieelvaade on kirjutuskaitstud. Loe sama turvalist RPC-d otse:
    // app.js-i api() ei luba eelvaates päringut, kuid see on vaid SELECT.
    const response=await fetch(ROOT+'/rest/v1/rpc/wod_completed_attendees_secure',{
      method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.session.access_token,
        'Content-Type':'application/json'},
      body:JSON.stringify({p_training_id:id})
    });
    if(!response.ok)throw Error('Osalejate andmete laadimine ebaõnnestus.');
    return response.json();
  }
  async function refresh(id,force=false){
    id=safeId(id);
    const t=s.trainings.find(x=>Number(x.id)===id);
    if(id===null||!eligible(t)||!s.session?.access_token)return false;
    if(requests.has(id))return requests.get(id);
    if(rowsByTraining.has(id)&&!force)return true;
    const task=(async()=>{
      try{
        const result=await query(id);
        if(!Array.isArray(result))throw Error('Vigane osalejate nimekirja vastus.');
        const names=result.map(row=>String(row?.attendee_name||'').trim())
          .filter(Boolean).sort((a,b)=>a.localeCompare(b,'et'));
        rowsByTraining.set(id,{names});
      }catch(error){
        console.warn('Kohalolijate nimekirja laadimine:',error);
        rowsByTraining.set(id,{names:[],error:true});
      }
      if(s.modal==='training'&&Number(s.modalData)===id){
        const element=document.querySelector('.td-completed-roster[data-roster-training="'+id+'"]');
        if(element)element.outerHTML=section(id);
      }
      return !rowsByTraining.get(id).error;
    })().finally(()=>requests.delete(id));
    requests.set(id,task);return task;
  }
  window.renderModal=function(){
    const html=previousModal();
    if(s.modal!=='training'||!html)return html;
    const t=s.trainings.find(x=>Number(x.id)===Number(s.modalData));
    if(!eligible(t))return html;
    const id=safeId(t.id),target='<div class="td-content">';
    if(!html.includes(target))return html;
    if(!rowsByTraining.has(id)&&!requests.has(id))
      Promise.resolve().then(()=>refresh(id)).catch(()=>{});
    return html.replace(target,target+section(id));
  };
  window.openTraining=function(id){
    const n=safeId(id);
    if(n!==null)rowsByTraining.delete(n);
    return previousOpenTraining(id);
  };
  if(typeof previousLoad==='function'){
    window.loadData=async function(...args){
      await previousLoad(...args);
      rowsByTraining.clear();
    };
  }
  // Treener võib kohalolekut kinnitada nii, et modaal ei taaslae.
  // Värskenda vaid nimeloendit ja säilita mobiilis kerimisasukoht.
  if(typeof window.crossfitAttendance?.mark==='function'){
    const mark=window.crossfitAttendance.mark;
    window.crossfitAttendance.mark=async function(...args){
      const ok=await mark(...args);
      if(ok&&s.modal==='training'){
        const id=safeId(s.modalData);
        if(id!==null)void refresh(id,true);
      }
      return ok;
    };
  }
  window.crossfitCompletedRoster={section,eligible,refresh};
})();