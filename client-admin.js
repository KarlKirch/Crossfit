'use strict';

(function(){
  const s=window.state;
  if(!s) return;

  s.removedClients=[];

  const baseLoadData=window.loadData;
  const baseClientDetail=window.clientDetail;
  const baseInfoSheet=window.infoSheet;

  function removedMap(){return new Map((s.removedClients||[]).map(x=>[x.user_id,x]))}
  function isRemoved(uid){return removedMap().has(uid)}

  async function loadRemovedClients(){
    if(s.profile?.role!=='trainer'){s.removedClients=[];return}
    try{s.removedClients=(await window.api('wod_removed_clients?select=user_id,removed_at,reason&order=removed_at.desc'))||[]}
    catch(e){console.warn('Eemaldatud klientide laadimine ebaõnnestus',e);s.removedClients=[]}
  }

  if(typeof baseLoadData==='function'){
    window.loadData=async function(){
      await baseLoadData();
      await loadRemovedClients();
    };
  }

  window.trainerAttention=function(){
    const future=window.upcomingTrainings();
    const unpaid=s.registrations.filter(r=>r.status==='confirmed'&&r.payment_status==='unpaid'&&future.some(t=>t.id===r.training_id)).length;
    const waiting=s.registrations.filter(r=>r.status==='waitlist'&&future.some(t=>t.id===r.training_id)).length;
    const removed=removedMap();
    const clients=s.profiles.filter(p=>p.role==='client'&&!removed.has(p.user_id)).length;
    return {unpaid,waiting,clients};
  };

  window.renderClients=function(){
    const removed=removedMap();
    const clients=s.profiles.filter(p=>p.role==='client'&&!removed.has(p.user_id));
    const archived=s.profiles.filter(p=>p.role==='client'&&removed.has(p.user_id));
    const packageRows=s.packageTypes.map(p=>window.packageTypeRow(p)).join('')||'<div class="empty">Pakette pole veel loodud.</div>';
    const clientRows=clients.map(p=>window.clientCard(p)).join('')||'<div class="empty">Kliente pole veel.</div>';
    const archivedRows=archived.map(p=>{
      const r=removed.get(p.user_id)||{};
      return `<div class="client-card" style="opacity:.82"><div class="client-top"><div><div class="client-name">${window.esc(p.display_name)}</div><div class="client-meta">Eemaldatud ${r.removed_at?window.shortDate(r.removed_at):''}${r.reason?' · '+window.esc(r.reason):''}</div></div><span class="pill red">Eemaldatud</span></div><div class="client-actions"><button class="btn btn-soft" onclick="restoreClient('${p.user_id}')">Taasta klient</button></div></div>`;
    }).join('');
    return `<div class="page-head"><div><h1 class="page-title">Kliendid</h1><div class="page-sub">Kliendikaardid, paketid, krediidid ja makseinfo.</div></div></div><div class="section"><h2>Paketid</h2><button class="btn-link" onclick="openPackageTypeForm()">+ Lisa pakett</button></div><div class="stack">${packageRows}</div><div class="section"><h2>Kliendid</h2><small>${clients.length}</small></div><div class="stack">${clientRows}</div>${archived.length?`<div class="section"><h2>Eemaldatud kliendid</h2><small>${archived.length}</small></div><div class="stack">${archivedRows}</div>`:''}`;
  };

  if(typeof baseClientDetail==='function'){
    window.clientDetail=function(p){
      const body=baseClientDetail(p);
      if(isRemoved(p.user_id)) return body;
      return `${body}<div class="section"><h2>Kliendi haldus</h2></div><div class="card"><div class="card-title">Eemalda klient</div><div class="card-sub">Klient eemaldatakse aktiivsete klientide nimekirjast ja tema tulevased broneeringud tühistatakse. Treeninguajalugu säilib ning klienti saab hiljem taastada.</div><div class="training-actions"><button class="btn btn-danger btn-block" onclick="removeClient('${p.user_id}')">Eemalda klient</button></div></div>`;
    };
  }

  window.removeClient=async function(uid){
    const p=s.profiles.find(x=>x.user_id===uid);
    if(!p) return;
    const ok=confirm(`Eemaldada klient ${p.display_name}?\n\nTema tulevased registreeringud tühistatakse, paketiga broneeritud kasutamata korrad tagastatakse ja push-teavitused peatatakse. Treeninguajalugu säilib ning klienti saab hiljem taastada.`);
    if(!ok) return;
    const reason=prompt('Soovi korral lisa eemaldamise põhjus. Võid jätta tühjaks:','')||null;
    try{
      await window.rpc('wod_remove_client',{p_user_id:uid,p_reason:reason});
      s.modal=null;s.modalData=null;s.view='people';
      await window.reloadData('Klient eemaldatud');
    }catch(e){window.toast(e.message||'Kliendi eemaldamine ebaõnnestus')}
  };

  window.restoreClient=async function(uid){
    const p=s.profiles.find(x=>x.user_id===uid);
    if(!p) return;
    if(!confirm(`Taastada klient ${p.display_name}?`)) return;
    try{
      await window.rpc('wod_restore_client',{p_user_id:uid});
      s.view='people';
      await window.reloadData('Klient taastatud');
    }catch(e){window.toast(e.message||'Kliendi taastamine ebaõnnestus')}
  };

  if(typeof baseInfoSheet==='function'){
    window.infoSheet=function(){return baseInfoSheet().replace('<b>4.0</b>','<b>4.1</b>')};
  }
})();
