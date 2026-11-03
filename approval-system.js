'use strict';

/* Rõuge CrossFit: uue kliendi heakskiit on serveripoolne.
 * Ootel konto näeb ainult enda taotluse olekut. Kinnitamine ainult treeneri RPC kaudu.
 */
(function(){
  const s=window.state;
  if(!s)return;
  const beforeMore=window.renderMore;
  const beforeModal=window.renderModal;
  const beforeLoad=window.loadData;
  const esc=value=>window.esc(value);
  const trainer=()=>window.isTrainer();
  const uid=()=>s.session?.user?.id||null;
  const valid=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id||''));
  let checking=false,fetching=false,working=false;
  s.joinRequests=s.joinRequests||[];
  const pending=()=>s.joinRequests.filter(p=>p.approval_status==='pending');
  const rejected=()=>s.joinRequests.filter(p=>p.approval_status==='rejected');

  function renderGate(){
    const denied=s.profile?.approval_status==='rejected';
    return '<div class="auth rcf-approval-gate"><div class="auth-box">'+
      '<div class="auth-logo" role="img" aria-label="Rõuge CrossFit logo"></div>'+
      '<h1>Rõuge CrossFit</h1>'+
      '<div class="rcf-approval-panel" role="status">'+
        '<span class="rcf-approval-symbol" aria-hidden="true">'+(denied?'×':'…')+'</span>'+
        '<h2>'+(denied?'Liitumistaotlust ei kinnitatud':'Sinu liitumistaotlus ootab kinnitamist')+'</h2>'+
        '<p>'+(denied?
          'Treener on sinu liitumistaotluse tagasi lükanud. Vajaduse korral võta treeneriga otse ühendust.':
          'Sinu konto on loodud, kuid treeningutele registreerumine ja kliendiandmed on treeneri heakskiiduni suletud.')+
        '</p>'+
        '<button type="button" class="btn btn-primary btn-block" onclick="crossfitApprovals.check()">'+
          'Kontrolli taotluse olekut</button>'+
        '<button type="button" class="btn btn-soft btn-block" onclick="logout()">Logi välja</button>'+
        '</div></div></div>';
  }
  async function check(){
    if(checking||!uid()||s.clientPreview)return false;
    checking=true;
    try{
      await window.ensureProfile();
      if(s.profile?.approval_status==='approved'){
        await window.loadData();
        s.view='home';
        window.render();
        window.toast('Sinu konto on kinnitatud. Tere tulemast!');
        return true;
      }
      window.render();
      window.toast(s.profile?.approval_status==='rejected'?
        'Liitumistaotlus on tagasi lükatud.':'Taotlus ootab veel kinnitamist.');
      return false;
    }catch(error){
      window.toast(error?.message||'Taotluse oleku kontroll ebaõnnestus.');
      return false;
    }finally{checking=false}
  }
  async function refresh(silent=false){
    if(!uid()||!trainer()||s.clientPreview||fetching)return false;
    fetching=true;
    try{
      const raw=await window.rpc('wod_list_join_requests',{});
      s.joinRequests=Array.isArray(raw)?raw:[];
      if(s.modal==='joinRequests')window.render();
      return true;
    }catch(error){
      if(!silent)window.toast(error?.message||'Liitumistaotlusi ei saanud laadida.');
      console.warn('Liitumistaotlused:',error?.message);
      return false;
    }finally{fetching=false}
  }
  async function open(){
    if(!uid()||!trainer()||s.clientPreview)return false;
    s.modal='joinRequests';s.modalData=null;
    window.render();
    await refresh();
    return true;
  }
  async function decide(id,approve){
    if(!uid()||!trainer()||s.clientPreview||working||!valid(id))return false;
    const person=s.joinRequests.find(p=>p.client_id===id);
    if(!person)return false;
    const verb=approve?'kinnitada':'tagasi lükata';
    if(!window.confirm('Kas soovid kasutaja '+person.display_name+' liitumise '+verb+'?'))return false;
    working=true;
    try{
      await window.rpc('wod_review_join_request',{p_client_id:id,p_approve:!!approve});
      await refresh(true);
      await window.crossfitNotifications?.refresh?.(true);
      window.render();
      window.toast(approve?'Kliendi konto kinnitatud.':'Liitumistaotlus tagasi lükatud.');
      return true;
    }catch(error){
      window.toast(error?.message||'Taotluse muutmine ebaõnnestus.');
      return false;
    }finally{working=false}
  }
  function requestRow(p){
    const pendingStatus=p.approval_status==='pending';
    const time=new Date(p.created_at);
    const date=Number.isFinite(time.getTime())?
      new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',day:'numeric',month:'long',year:'numeric'}).format(time):'';
    return '<div class="rcf-join-card">'+
      '<div class="rcf-join-person"><strong>'+esc(p.display_name||'Kasutaja')+'</strong>'+
      '<small>'+esc(p.email||'')+'</small><small>'+esc(date)+'</small>'+
      (p.email_verified===false?'<small class="rcf-join-unverified">E-post pole veel kinnitatud</small>':'')+'</div>'+ 
      (p.join_note?'<p class="rcf-join-note">'+esc(p.join_note)+'</p>':'')+
      '<div class="rcf-join-actions">'+
      (p.email_verified===false?'<button type="button" class="rcf-join-accept" disabled title="Kliendi e-post pole veel kinnitatud">Ootab e-posti kinnitamist</button>':
        '<button type="button" class="rcf-join-accept" onclick="crossfitApprovals.decide(\''+esc(p.client_id)+'\',true)">Kinnita</button>')+
      (pendingStatus?'<button type="button" class="rcf-join-reject" onclick="crossfitApprovals.decide(\''+
        esc(p.client_id)+'\',false)">Keeldu</button>':'')+
      '</div></div>';
  }
  function renderRequests(){
    const waiting=pending(),denied=rejected();
    return '<div class="sheet-backdrop" onclick="backdropClose(event)">'+
      '<div class="sheet rcf-join-sheet" role="dialog" aria-modal="true" aria-label="Liitumistaotlused" onclick="event.stopPropagation()">'+
      '<div class="sheet-head"><div class="sheet-title">Liitumistaotlused</div>'+
      '<button type="button" class="sheet-close" aria-label="Sulge" onclick="closeModal()">×</button></div>'+
      '<div class="sheet-body">'+
      '<p class="rcf-join-explanation">Uued kasutajad ei saa enne kinnitamist registreeruda ega kliendiandmeid vaadata.</p>'+
      '<h3>Ootel ('+waiting.length+')</h3>'+
      (waiting.length?waiting.map(requestRow).join(''):
        '<p class="rcf-join-empty">Uusi liitumistaotlusi ei ole.</p>')+
      (denied.length?'<h3>Tagasi lükatud ('+denied.length+')</h3>'+
        '<p class="rcf-join-explanation">Saad vajaduse korral tagasi lükatud taotluse hiljem kinnitada.</p>'+
        denied.map(requestRow).join(''):'')+
      '<button type="button" class="rcf-join-refresh" onclick="crossfitApprovals.refresh()">Värskenda nimekirja</button>'+
      '</div></div></div>';
  }
  function adminEntry(){
    const n=pending().length;
    return '<button type="button" class="rcf-join-entry" onclick="crossfitApprovals.open()">'+
      '<span class="rcf-join-icon">✓</span><span><strong>Liitumistaotlused</strong>'+
      '<small>Kinnita või lükka tagasi uute klientide kontod</small></span>'+
      '<b class="rcf-join-count">'+n+' ootel</b></button>';
  }
  window.renderMore=function(){
    const html=beforeMore();
    return trainer()&&!s.clientPreview?html.replace('</header>','</header>'+adminEntry()):html;
  };
  window.renderModal=function(){
    return s.modal==='joinRequests'?renderRequests():beforeModal();
  };
  window.loadData=async function(){
    await beforeLoad();
    if(trainer()&&!s.clientPreview)await refresh(true);
    else s.joinRequests=[];
  };
  const poll=window.setInterval?.(()=>{
    if(uid()&&!s.clientPreview&&(!document.visibilityState||document.visibilityState==='visible')){
      if(s.profile?.approval_status==='pending')check();
      else if(trainer()&&s.modal==='joinRequests')refresh(true);
    }
  },60000);
  if(poll&&typeof poll.unref==='function')poll.unref();

  window.crossfitApprovals={renderGate,check,refresh,open,decide,pending,rejected,renderRequests};
})();
