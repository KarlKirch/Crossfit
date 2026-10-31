'use strict';

/* Rõuge CrossFit: privaatvestlus treeneri ja kliendi vahel.
 * Andmed on kaitstud andmebaasis RLS-iga; sõnumite kirjutamine ainult RPC kaudu.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.renderModal!=='function')return;
  const baseModal=window.renderModal,baseMore=window.renderMore,baseMine=window.renderMine;
  s.privateMessages=s.privateMessages||[];
  let busy=false,loading=false,lastSync=0;
  const esc=v=>window.esc(v);
  const uid=()=>s.session?.user?.id||null;
  const trainer=()=>window.isTrainer();
  const preview=()=>!!s.clientPreview;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validId=id=>uuid.test(String(id||''))?String(id):null;
  const name=id=>String((s.profiles||[]).find(p=>p.user_id===id)?.display_name||'Klient');
  const ownMessages=()=>Array.isArray(s.privateMessages)?s.privateMessages:[];
  const visible=()=>s.modal==='privateMessages';
  const pending=(clientId=null)=>(s.notifications||[]).filter(n=>n.kind==='private_message'&&!n.read_at&&
    (!clientId||String(n.tag||'')==='crossfit-message-'+clientId));
  const count=()=>pending().length;
  const date=value=>{
    const d=new Date(value);
    return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('et-EE',{
      timeZone:'Europe/Tallinn',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
    }).format(d):'';
  };
  function currentClient(){
    if(!trainer())return uid();
    return validId(s.messageClientId);
  }
  function threads(){
    const byId=new Map();
    for(const m of ownMessages()){
      const p=s.profiles?.find(p=>p.user_id===m.client_id);
      if(!p||p.role!=='client')continue;
      const last=byId.get(m.client_id);
      if(!last||Date.parse(m.created_at)>Date.parse(last.created_at))byId.set(m.client_id,m);
    }
    return [...byId.values()].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  }
  async function refresh(force=false){
    if(preview()||!uid()||loading)return false;
    if(!force&&Date.now()-lastSync<15000)return false;
    loading=true;
    const expected=uid();
    try{
      const path=trainer()?
        'wod_private_messages?select=id,client_id,sender_id,body,created_at&order=created_at.desc&limit=500':
        'wod_private_messages?select=id,client_id,sender_id,body,created_at&client_id=eq.'+
        encodeURIComponent(uid())+'&order=created_at.desc&limit=200';
      const rows=await window.api(path);
      if(uid()!==expected||preview())return false;
      const fresh=(Array.isArray(rows)?rows:[]).reverse();
      const prev=ownMessages();
      const changed=fresh.length!==prev.length||fresh.some((m,i)=>
        m.id!==prev[i]?.id||m.body!==prev[i]?.body);
      s.privateMessages=fresh;
      lastSync=Date.now();
      if(changed&&visible())window.render();
      return true;
    }catch(error){
      if(force)window.toast(error?.message||'Sõnumeid ei saanud laadida.');
      return false;
    }finally{loading=false}
  }
  async function markConversationRead(clientId){
    if(preview())return;
    const ids=pending(clientId).map(n=>n.id);
    if(!ids.length)return;
    try{
      await window.rpc('wod_mark_notifications_read',{p_ids:ids});
      const set=new Set(ids.map(Number)),ts=new Date().toISOString();
      for(const n of (s.notifications||[]))if(set.has(Number(n.id)))n.read_at=n.read_at||ts;
    }catch(error){console.warn('Sõnumite loetuks märkimine:',error?.message)}
  }
  async function open(clientId=null){
    if(!uid())return false;
    if(!trainer())clientId=uid();
    if(trainer()&&clientId!==null&&!validId(clientId))return false;
    s.messageClientId=clientId;
    s.modal='privateMessages';s.modalData=null;
    window.render();
    if(preview())return true;
    await refresh(true);
    if(s.modal==='privateMessages'&&currentClient())await markConversationRead(currentClient());
    if(s.modal==='privateMessages')window.render();
    return true;
  }
  async function openFromNotification(item){
    const match=String(item?.tag||'').match(/^crossfit-message-([0-9a-f-]{36})$/i);
    const client=match?match[1]:null;
    return open(trainer()?client:null);
  }
  function messagesFor(id){return ownMessages().filter(m=>m.client_id===id);}
  function listMarkup(){
    const rows=threads();
    return '<div class="cm-inbox">'+
      '<p>Vestlused on nähtavad ainult vastavale kliendile ja treenerile.</p>'+
      (rows.length?rows.map(m=>'<button type="button" class="cm-thread" onclick="crossfitMessages.open(\''+
        esc(m.client_id)+'\')"><span><strong>'+esc(name(m.client_id))+'</strong>'+
        '<small>'+esc(String(m.body).slice(0,90))+'</small></span><span class="cm-thread-date">'+
        esc(date(m.created_at))+(pending(m.client_id).length?' · Uus':'')+'</span></button>').join(''):
        '<div class="cm-empty">Vestlusi pole veel. Kui klient kirjutab, ilmub tema sõnum siia.</div>')+
      '</div>';
  }
  function chatMarkup(id){
    const list=messagesFor(id);
    const readOnly=preview();
    return '<div class="cm-chat">'+
      (trainer()?'<button type="button" class="cm-back" onclick="crossfitMessages.open()">← Kõik vestlused</button>':'')+
      '<h3>'+esc(trainer()?name(id):'Vestlus treeneriga')+'</h3>'+
      '<div class="cm-messages" role="log" aria-label="Privaatsõnumid">'+
      (list.length?list.map(m=>'<div class="cm-bubble '+(m.sender_id===uid()?'cm-me':'cm-other')+'">'+
        '<span>'+esc(m.body)+'</span><small>'+esc(date(m.created_at))+'</small></div>').join(''):
        '<div class="cm-empty">Vestlus on tühi. Kirjuta esimene sõnum.</div>')+
      '</div>'+
      (readOnly?'<p class="cm-warning">Näidiskliendi vaates ei saa pärissõnumit saata.</p>':
        '<label for="cmBody">Sinu sõnum</label><textarea id="cmBody" maxlength="2000" rows="3" placeholder="Kirjuta sõnum treenerile..."></textarea>'+
        '<button type="button" id="cmSend" class="cm-send" onclick="crossfitMessages.send()">Saada sõnum</button>')+
      '<p class="cm-foot">Sõnum on privaatne. Telefoni teavitus saabub, kui adressaat on märguanded lubanud.</p>'+
      '</div>';
  }
  function renderModal(){
    if(s.modal!=='privateMessages')return baseModal();
    const id=currentClient();
    return '<div class="sheet-backdrop" onclick="backdropClose(event)">'+
      '<div class="sheet cm-sheet" role="dialog" aria-modal="true" aria-label="Privaatsõnumid" onclick="event.stopPropagation()">'+
      '<div class="sheet-head"><div class="sheet-title">Sõnumid '+(count()?'('+count()+' uut)':'')+'</div>'+
      '<button type="button" class="sheet-close" aria-label="Sulge" onclick="closeModal()">×</button></div>'+
      '<div class="sheet-body">'+(id?chatMarkup(id):listMarkup())+'</div></div></div>';
  }
  async function send(){
    if(busy||preview())return false;
    const id=currentClient(),input=document.getElementById('cmBody');
    const body=String(input?.value||'').trim();
    if(!id||!body||body.length>2000){window.toast('Kirjuta kuni 2000 märki.');return false}
    busy=true;
    const button=document.getElementById('cmSend');
    if(button){button.disabled=true;button.textContent='Saadan…'}
    try{
      await window.rpc('wod_send_private_message',{p_client_id:id,p_body:body});
      if(input)input.value='';
      lastSync=0;
      await refresh(true);
      window.render();
      window.toast('Sõnum saadetud');
      return true;
    }catch(error){window.toast(error?.message||'Sõnumi saatmine ebaõnnestus');return false}
    finally{busy=false;if(button?.isConnected){button.disabled=false;button.textContent='Saada sõnum'}}
  }
  const button=()=>{
    const n=count();
    return '<button type="button" class="cm-entry" onclick="crossfitMessages.open()">'+
      '<span class="cm-entry-icon">✉</span><span><strong>'+ (trainer()?'Privaatsõnumid':'Kirjuta treenerile')+
      '</strong><small>'+(trainer()?'Kliendikirjad ja vastamine':'Küsi abi, kirjuta maksmisest või treeningust')+
      '</small></span>'+(n?'<b class="cm-unread">'+n+' uut</b>':'')+'</button>';
  };
  window.renderMore=function(){
    const html=baseMore();
    return trainer()&&!preview()?button()+html:html;
  };
  window.renderMine=function(){
    const html=baseMine();
    return trainer()?html:html.replace('<div class="my-account-page">',
      '<div class="my-account-page">'+button());
  };
  window.renderModal=renderModal;
  const baseLoad=window.loadData;
  window.loadData=async function(){
    await baseLoad();
    if(!preview())await refresh(false);
  };
  document.addEventListener?.('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&visible())refresh(true);
  });
  window.addEventListener?.('focus',()=>{if(visible())refresh(true)});
  window.crossfitMessages={open,openFromNotification,refresh,send,renderModal,count,threads};
})();
