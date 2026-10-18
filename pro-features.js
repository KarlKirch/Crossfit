'use strict';

(function(){
  const s=window.state;
  if(!s) return;

  const APP_URL='https://karlkirch.github.io/Crossfit/';
  const QR_ROWS=[
    '000000000000000000000000000000000','000000000000000000000000000000000','001111111001111111100100111111100',
    '001000001000110111111000100000100','001011101000001010010000101110100','001011101000110101101000101110100',
    '001011101000111011101000101110100','001000001011001001110110100000100','001111111010101010101010111111100',
    '000000000001101101110010000000000','001001011010100011101011010000000','000110100011010100100011100100100',
    '000001001110001110010100101111000','000111010100111100100110111011000','000101101011010010110111100101100',
    '000000010010001110000111000000000','001110101010001110011010010111100','001000110000100000011010010101000',
    '000101001001000100110111010001000','000111110101110110110000110100100','001011001011000010010010111001100',
    '000000000000100010111111010001100','001011111101001000001111111010000','000000000010110010100110001011100',
    '001111111001010000110010101001000','001000001010010010101110001110000','001011101000111001100011111001100',
    '001011101010111100010000111111000','001011101001000100101010001110100','001000001000000100011111001001000',
    '001111111010011010110011100101000','000000000000000000000000000000000','000000000000000000000000000000000'
  ];

  const featureIcon={
    megaphone:'<svg viewBox="0 0 24 24"><path d="M4 13v-2l13-5v12L4 13Z"/><path d="M7 14v5h4l1-4M19 9c1 1 1 5 0 6"/></svg>',
    template:'<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    stats:'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    export:'<svg viewBox="0 0 24 24"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 20h14"/></svg>'
  };

  const baseLoadData=window.loadData;
  const baseRenderHome=window.renderHome;
  const baseRenderClients=window.renderClients;
  const baseRenderTrainings=window.renderTrainings;
  const baseRenderMore=window.renderMore;
  const baseRenderModal=window.renderModal;
  const baseQuickSheet=window.quickSheet;
  const baseTrainingDetail=window.trainingDetail;
  const baseShareSheet=window.shareSheet;

  s.trainingTemplates=s.trainingTemplates||[];
  s.announcements=s.announcements||[];
  s.clientFilter=s.clientFilter||'all';
  s.clientSearch=s.clientSearch||'';

  function removedMap(){return new Map((s.removedClients||[]).map(x=>[x.user_id,x]))}
  function balance(uid){return Number(s.wallets.find(w=>w.user_id===uid)?.credits||0)}
  function activeClients(){
    const removed=removedMap();
    return s.profiles.filter(p=>p.role==='client'&&!removed.has(p.user_id));
  }
  function isClientActive(uid){
    const cutoff=Date.now()-90*86400000;
    return s.registrations.some(r=>{
      if(r.user_id!==uid||r.status!=='confirmed') return false;
      const t=s.trainings.find(x=>x.id===r.training_id);
      return t&&t.status!=='cancelled'&&new Date(t.starts_at).getTime()>=cutoff;
    });
  }
  function localDay(iso){
    return new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',weekday:'long'}).format(new Date(iso));
  }

  window.loadData=async function(){
    await baseLoadData();
    if(!window.isTrainer()){
      s.trainingTemplates=[];
      s.announcements=[];
      return;
    }
    const [templates,announcements]=await Promise.all([
      window.api('wod_training_templates?select=*&order=name.asc,id.asc'),
      window.api('wod_announcements?select=*&order=created_at.desc&limit=50')
    ]);
    s.trainingTemplates=templates||[];
    s.announcements=announcements||[];
  };

  window.renderHome=function(){
    const html=baseRenderHome();
    if(!window.isTrainer()) return html;
    const clients=activeClients();
    const zero=clients.filter(p=>balance(p.user_id)===0);
    const low=clients.filter(p=>balance(p.user_id)>=1&&balance(p.user_id)<=2);
    const good=clients.filter(p=>balance(p.user_id)>=3);
    const needs=[...zero,...low].sort((a,b)=>balance(a.user_id)-balance(b.user_id)||a.display_name.localeCompare(b.display_name,'et'));
    return html+`
      <div class="section"><h2>Krediidi seis</h2><button class="btn-link" onclick="go('people')">Halda kliente</button></div>
      <div class="metric-grid">
        ${window.metric(zero.length,'0 krediiti')}
        ${window.metric(low.length,'1–2 krediiti')}
        ${window.metric(good.length,'3+ krediiti')}
      </div>
      <div class="stack">
        ${needs.slice(0,5).map(p=>`<div class="client-card"><div class="client-top"><div><div class="client-name">${window.esc(p.display_name)}</div><div class="client-meta">Krediit vajab tähelepanu</div></div><span class="pill ${balance(p.user_id)===0?'red':'amber'}">${balance(p.user_id)} krediiti</span></div><div class="client-actions"><button class="btn btn-soft" onclick="openClient('${p.user_id}')">Ava klient</button><button class="btn btn-primary" onclick="openAddCredits('${p.user_id}')">Lisa krediiti</button></div></div>`).join('')||'<div class="empty">Kõigil klientidel on vähemalt 3 krediiti.</div>'}
      </div>`;
  };

  function clientFilterButtons(){
    const opts=[
      ['all','Kõik'],
      ['zero','0 krediiti'],
      ['low','1–2 krediiti'],
      ['active','Aktiivsed'],
      ['removed','Eemaldatud']
    ];
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px">${opts.map(([v,l])=>`<button class="btn btn-sm ${s.clientFilter===v?'btn-dark':'btn-soft'}" onclick="setClientFilter('${v}')">${l}</button>`).join('')}</div>`;
  }

  function filteredClients(){
    const removed=removedMap();
    let list=s.profiles.filter(p=>p.role==='client');
    if(s.clientFilter==='removed') list=list.filter(p=>removed.has(p.user_id));
    else list=list.filter(p=>!removed.has(p.user_id));
    if(s.clientFilter==='zero') list=list.filter(p=>balance(p.user_id)===0);
    if(s.clientFilter==='low') list=list.filter(p=>balance(p.user_id)>=1&&balance(p.user_id)<=2);
    if(s.clientFilter==='active') list=list.filter(p=>isClientActive(p.user_id));
    const q=(s.clientSearch||'').trim().toLocaleLowerCase('et');
    if(q) list=list.filter(p=>p.display_name.toLocaleLowerCase('et').includes(q));
    return list;
  }

  window.renderClients=function(){
    const removed=removedMap();
    const list=filteredClients();
    const removedMode=s.clientFilter==='removed';
    const rows=list.map(p=>{
      if(!removedMode) return window.clientCard(p);
      const r=removed.get(p.user_id)||{};
      return `<div class="client-card"><div class="client-top"><div><div class="client-name">${window.esc(p.display_name)}</div><div class="client-meta">Eemaldatud ${r.removed_at?window.shortDate(r.removed_at):''}${r.reason?' · '+window.esc(r.reason):''}</div></div><span class="pill red">Eemaldatud</span></div><div class="client-actions"><button class="btn btn-soft" onclick="restoreClient('${p.user_id}')">Taasta klient</button></div></div>`;
    }).join('');
    return `<div class="page-head"><div><h1 class="page-title">Kliendid</h1><div class="page-sub">Otsi, filtreeri ja halda klientide treeningkrediiti.</div></div></div>
      <div class="field"><input id="clientSearch" type="search" placeholder="Otsi klienti..." value="${window.esc(s.clientSearch)}" oninput="applyClientSearch(this.value)"></div>
      ${clientFilterButtons()}
      <div class="section"><h2>${removedMode?'Eemaldatud kliendid':'Kliendid'}</h2><small>${list.length}</small></div>
      <div id="clientResultList" class="stack">${rows||'<div class="empty">Selle filtriga kliente ei leitud.</div>'}</div>`;
  };

  window.applyClientSearch=function(value){
    s.clientSearch=value;
    const q=(value||'').trim().toLocaleLowerCase('et');
    const list=document.getElementById('clientResultList');
    if(!list) return;
    const removed=removedMap();
    let clients=s.profiles.filter(p=>p.role==='client');
    if(s.clientFilter==='removed') clients=clients.filter(p=>removed.has(p.user_id));
    else clients=clients.filter(p=>!removed.has(p.user_id));
    if(s.clientFilter==='zero') clients=clients.filter(p=>balance(p.user_id)===0);
    if(s.clientFilter==='low') clients=clients.filter(p=>balance(p.user_id)>=1&&balance(p.user_id)<=2);
    if(s.clientFilter==='active') clients=clients.filter(p=>isClientActive(p.user_id));
    if(q) clients=clients.filter(p=>p.display_name.toLocaleLowerCase('et').includes(q));
    list.innerHTML=clients.map(p=>{
      if(s.clientFilter!=='removed') return window.clientCard(p);
      const r=removed.get(p.user_id)||{};
      return `<div class="client-card"><div class="client-top"><div><div class="client-name">${window.esc(p.display_name)}</div><div class="client-meta">Eemaldatud ${r.removed_at?window.shortDate(r.removed_at):''}</div></div><span class="pill red">Eemaldatud</span></div><div class="client-actions"><button class="btn btn-soft" onclick="restoreClient('${p.user_id}')">Taasta klient</button></div></div>`;
    }).join('')||'<div class="empty">Selle otsinguga kliente ei leitud.</div>';
  };

  window.setClientFilter=function(filter){
    s.clientFilter=filter;
    window.render();
  };

  window.renderTrainings=function(){
    const html=baseRenderTrainings();
    if(!window.isTrainer()) return html;
    return html.replace(
      '<button class="page-action" onclick="openTrainingForm()">+ Lisa</button>',
      '<div style="display:flex;gap:6px"><button class="btn btn-soft btn-sm" onclick="openTemplates()">Mallid</button><button class="page-action" onclick="openTrainingForm()">+ Lisa</button></div>'
    );
  };

  window.trainingDetail=function(t){
    const html=baseTrainingDetail(t);
    if(!window.isTrainer()) return html;
    return html+`<div class="detail-block"><h3>Treeningumall</h3><div class="card-sub">Salvesta selle treeningu ülesehitus malliks, et järgmised treeningud kiiremini luua.</div><div class="training-actions"><button class="btn btn-soft" onclick="saveTrainingAsTemplate(${t.id})">Salvesta mallina</button><button class="btn btn-soft" onclick="openTemplates()">Ava mallid</button></div></div>`;
  };

  function menuItem(iconSvg,label,desc,action){
    return `<button class="menu-item" onclick="${action}"><div class="menu-main"><div class="menu-icon">${iconSvg}</div><div><div class="menu-label">${label}</div><div class="menu-desc">${desc}</div></div></div><span class="chev">›</span></button>`;
  }

  window.renderMore=function(){
    let html=baseRenderMore();
    if(!window.isTrainer()) return html;
    const extra=
      menuItem(featureIcon.megaphone,'Saada teadaanne','Kõigile või valitud treeningu osalejatele','openAnnouncement()')+
      menuItem(featureIcon.template,'Treeningumallid','Loo ja kasuta korduvaid treeningupõhju','openTemplates()')+
      menuItem(featureIcon.stats,'Statistika','Täituvus, aktiivsus ja osalemised','openStats()')+
      menuItem(featureIcon.export,'Ekspordi andmed','Laadi kliendid, krediit ja treeningud CSV-faili','exportAllData()');
    const marker='<button class="menu-item" onclick="openInfo()">';
    return html.includes(marker)?html.replace(marker,extra+marker):html+extra;
  };

  window.quickSheet=function(){
    let html=baseQuickSheet();
    if(!window.isTrainer()) return html;
    const btn=`<button class="quick" onclick="openAnnouncement()">${featureIcon.megaphone}<b>Teadaanne</b><span>Saada klientidele teade</span></button>`;
    const pos=html.lastIndexOf('</div>');
    return pos>=0?html.slice(0,pos)+btn+html.slice(pos):html+btn;
  };

  function sheet(title,body){
    return `<div class="sheet-backdrop" onclick="backdropClose(event)"><div class="sheet" onclick="event.stopPropagation()"><div class="sheet-head"><div class="sheet-title">${window.esc(title)}</div><button class="sheet-close" onclick="closeModal()" aria-label="Sulge">×</button></div><div class="sheet-body">${body}</div></div></div>`;
  }

  function announcementForm(){
    const trainings=window.upcomingTrainings();
    const history=(s.announcements||[]).slice(0,8);
    return `<div class="form">
      <div class="field"><label>Pealkiri</label><input id="annTitle" maxlength="80" placeholder="Näiteks: Neljapäevase trenni muudatus"></div>
      <div class="field"><label>Teade</label><textarea id="annBody" maxlength="500" placeholder="Kirjuta kliendile saadetav teade..."></textarea></div>
      <div class="field"><label>Sihtrühm</label><select id="annScope" onchange="toggleAnnouncementTraining()"><option value="all">Kõik aktiivsed kliendid</option><option value="training">Valitud treeningu registreerunud</option><option value="waitlist">Valitud treeningu ootenimekiri</option></select></div>
      <div id="annTrainingWrap" class="field hidden"><label>Treening</label><select id="annTraining">${trainings.map(t=>`<option value="${t.id}">${window.esc(window.dateTime(t.starts_at)+' · '+t.title)}</option>`).join('')}</select></div>
      <div class="form-actions"><button class="btn btn-primary" onclick="sendAnnouncement()">Saada teadaanne</button><button class="btn btn-soft" onclick="closeModal()">Katkesta</button></div>
    </div>
    <div class="section"><h2>Viimased teadaanded</h2><small>${history.length}</small></div>
    <div class="stack">${history.map(a=>`<div class="notification"><div class="notif-dot read"></div><div><div class="notif-title">${window.esc(a.title)}</div><div class="notif-body">${window.esc(a.body)}</div><div class="notif-time">${window.esc(window.dateTime(a.created_at))} · ${a.recipient_count} saajat · ${scopeLabel(a.scope)}</div></div></div>`).join('')||'<div class="empty">Teadaandeid pole veel saadetud.</div>'}</div>`;
  }

  function scopeLabel(scope){
    return scope==='all'?'Kõik kliendid':scope==='waitlist'?'Ootenimekiri':'Treeningu osalejad';
  }

  window.openAnnouncement=function(){s.modal='announcement';s.modalData=null;window.render()};
  window.toggleAnnouncementTraining=function(){
    const scope=document.getElementById('annScope')?.value;
    document.getElementById('annTrainingWrap')?.classList.toggle('hidden',scope==='all');
  };
  window.sendAnnouncement=async function(){
    const title=document.getElementById('annTitle')?.value.trim();
    const body=document.getElementById('annBody')?.value.trim();
    const scope=document.getElementById('annScope')?.value||'all';
    const tid=scope==='all'?null:Number(document.getElementById('annTraining')?.value||0)||null;
    if(!title||!body){window.toast('Lisa pealkiri ja teate tekst');return}
    if(scope!=='all'&&!tid){window.toast('Vali treening');return}
    try{
      const result=await window.rpc('wod_send_announcement',{p_title:title,p_body:body,p_scope:scope,p_training_id:tid});
      const count=Array.isArray(result)?Number(result[0]??0):Number(result??0);
      await window.reloadData(count===1?'Teadaanne saadeti 1 kliendile':`Teadaanne saadeti ${count} kliendile`);
      s.modal='announcement';
      window.render();
    }catch(e){window.toast(e.message||'Teadaande saatmine ebaõnnestus')}
  };

  function templateCard(t){
    return `<div class="client-card"><div class="client-top"><div><div class="client-name">${window.esc(t.name)}</div><div class="client-meta">${window.esc(t.title)} · ${t.duration_minutes} min · ${t.capacity} kohta · tühistus ${t.cancellation_hours} h</div></div><span class="pill ${t.active?'green':''}">${t.active?'Aktiivne':'Peidetud'}</span></div><div class="client-actions"><button class="btn btn-primary" onclick="useTemplate(${t.id})">Kasuta</button><button class="btn btn-soft" onclick="openTemplateForm(${t.id})">Muuda</button><button class="btn btn-danger" onclick="deleteTemplate(${t.id})">Kustuta</button></div></div>`;
  }

  function templatesSheet(){
    return `<div class="card"><div class="card-title-row"><div><div class="card-title">Treeningumallid</div><div class="card-sub">Malli kasutamisel avaneb uus treening eeltäidetud andmetega. Kuupäeva ja kellaaega saad enne avaldamist muuta.</div></div><button class="btn btn-primary btn-sm" onclick="openTemplateForm()">+ Uus</button></div></div><div class="section"><h2>Mallid</h2><small>${s.trainingTemplates.length}</small></div><div class="stack">${s.trainingTemplates.map(templateCard).join('')||'<div class="empty">Treeningumalle pole veel loodud.</div>'}</div>`;
  }

  function templateForm(t={}){
    return `<div class="form">
      <div class="field"><label>Malli nimi</label><input id="tplName" maxlength="60" value="${window.esc(t.name||'')}" placeholder="Näiteks CrossFit E"></div>
      <div class="field"><label>Treeningu nimetus</label><input id="tplTitle" maxlength="80" value="${window.esc(t.title||'CrossFit')}"></div>
      <div class="form-grid"><div class="field"><label>Kestus (min)</label><input id="tplDuration" type="number" min="15" max="240" step="5" value="${t.duration_minutes||60}"></div><div class="field"><label>Kohti</label><input id="tplCapacity" type="number" min="1" max="100" value="${t.capacity||12}"></div></div>
      <div class="field"><label>Tasuta tühistamine (h enne)</label><input id="tplCancel" type="number" min="0" max="72" value="${t.cancellation_hours??4}"></div>
      <div class="field"><label>Päeva treening / WOD</label><textarea id="tplWorkout">${window.esc(t.workout||'')}</textarea></div>
      <div class="field"><label>Treeneri märkus</label><textarea id="tplNote">${window.esc(t.note||'')}</textarea></div>
      <div class="field"><label><input id="tplActive" type="checkbox" ${t.active!==false?'checked':''}> Mall on aktiivne</label></div>
      <div class="form-actions"><button class="btn btn-primary" onclick="saveTemplate(${t.id||'null'})">Salvesta</button><button class="btn btn-soft" onclick="openTemplates()">Tagasi</button></div>
    </div>`;
  }

  window.openTemplates=function(){s.modal='templates';s.modalData=null;window.render()};
  window.openTemplateForm=function(id=null){
    s.modal='templateForm';
    s.modalData=id?s.trainingTemplates.find(t=>t.id===id)||{}:{};
    window.render();
  };
  window.saveTemplate=async function(id){
    const name=document.getElementById('tplName')?.value.trim();
    const title=document.getElementById('tplTitle')?.value.trim();
    const duration=Number(document.getElementById('tplDuration')?.value||0);
    const capacity=Number(document.getElementById('tplCapacity')?.value||0);
    const cancellation=Number(document.getElementById('tplCancel')?.value||0);
    const workout=document.getElementById('tplWorkout')?.value.trim()||null;
    const note=document.getElementById('tplNote')?.value.trim()||null;
    const active=!!document.getElementById('tplActive')?.checked;
    if(!name||!title||duration<15||capacity<1){window.toast('Kontrolli malli andmeid');return}
    const body={name,title,duration_minutes:duration,capacity,cancellation_hours:cancellation,workout,note,active,updated_at:new Date().toISOString()};
    try{
      if(id) await window.api(`wod_training_templates?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
      else await window.api('wod_training_templates',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({...body,created_by:s.session.user.id})});
      await window.reloadData('Treeningumall salvestatud');
      s.modal='templates';window.render();
    }catch(e){window.toast(e.message||'Malli salvestamine ebaõnnestus')}
  };
  window.deleteTemplate=async function(id){
    const t=s.trainingTemplates.find(x=>x.id===id);
    if(!t||!confirm(`Kustutada mall „${t.name}“?`)) return;
    try{
      await window.api(`wod_training_templates?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
      await window.reloadData('Mall kustutatud');
      s.modal='templates';window.render();
    }catch(e){window.toast(e.message)}
  };
  window.useTemplate=function(id){
    const t=s.trainingTemplates.find(x=>x.id===id);
    if(!t) return;
    window.openTrainingForm({
      title:t.title,
      duration_minutes:t.duration_minutes,
      capacity:t.capacity,
      cancellation_hours:t.cancellation_hours,
      workout:t.workout,
      note:t.note,
      price_cents:0
    });
  };
  window.saveTrainingAsTemplate=async function(id){
    const t=s.trainings.find(x=>x.id===id);
    if(!t) return;
    const name=prompt('Malli nimi:',t.title)||'';
    if(!name.trim()) return;
    try{
      await window.api('wod_training_templates',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
        name:name.trim(),title:t.title,duration_minutes:t.duration_minutes,capacity:t.capacity,
        cancellation_hours:t.cancellation_hours,workout:t.workout||null,note:t.note||null,
        active:true,created_by:s.session.user.id
      })});
      await window.reloadData('Treening salvestati mallina');
      s.modal='training';s.modalData=id;window.render();
    }catch(e){window.toast(e.message)}
  };

  function statsData(){
    const nowMs=Date.now(),d90=nowMs-90*86400000,d30=nowMs-30*86400000;
    const trainings90=s.trainings.filter(t=>t.status!=='cancelled'&&new Date(t.starts_at).getTime()>=d90&&new Date(t.starts_at).getTime()<nowMs);
    const ids90=new Set(trainings90.map(t=>t.id));
    const confirmed90=s.registrations.filter(r=>r.status==='confirmed'&&ids90.has(r.training_id));
    const ratios=trainings90.map(t=>window.confirmedFor(t.id).length/Math.max(1,Number(t.capacity)));
    const avg=ratios.length?Math.round(ratios.reduce((a,b)=>a+b,0)/ratios.length*100):0;
    const full=trainings90.filter(t=>window.confirmedFor(t.id).length>=Number(t.capacity)).length;
    const waitLeft=s.registrations.filter(r=>r.status==='waitlist'&&ids90.has(r.training_id)).length;
    const active30=new Set(s.registrations.filter(r=>{
      if(r.status!=='confirmed') return false;
      const t=s.trainings.find(x=>x.id===r.training_id);
      const ts=t?new Date(t.starts_at).getTime():0;
      return t&&t.status!=='cancelled'&&ts>=d30&&ts<nowMs;
    }).map(r=>r.user_id)).size;
    const dayCounts={};
    trainings90.forEach(t=>{const n=window.confirmedFor(t.id).length;const d=localDay(t.starts_at);dayCounts[d]=(dayCounts[d]||0)+n});
    const topDay=Object.entries(dayCounts).sort((a,b)=>b[1]-a[1])[0]||['—',0];
    const clientCounts={};
    confirmed90.forEach(r=>clientCounts[r.user_id]=(clientCounts[r.user_id]||0)+1);
    const topClients=Object.entries(clientCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return {trainings90,confirmed90,avg,full,waitLeft,active30,topDay,topClients};
  }

  function statsSheet(){
    const x=statsData();
    return `<div class="page-sub" style="margin-bottom:12px">Ülevaade viimase 90 päeva treeningutest. Aktiivsete klientide näit põhineb viimase 30 päeva osalemisel.</div>
      <div class="metric-grid">${window.metric(x.trainings90.length,'Treeninguid 90 p')}${window.metric(x.confirmed90.length,'Osalemisi 90 p')}${window.metric(x.avg+'%','Keskmine täituvus')}</div>
      <div class="metric-grid">${window.metric(x.full,'Täis treeninguid')}${window.metric(x.waitLeft,'Ootenimekirja jäänud')}${window.metric(x.active30,'Aktiivseid 30 p')}</div>
      <div class="card"><div class="card-title">Populaarseim nädalapäev</div><div class="card-sub" style="margin-top:7px"><b style="font-size:18px;color:#18201c">${window.esc(x.topDay[0])}</b> · ${x.topDay[1]} osalemist</div></div>
      <div class="section"><h2>Aktiivseimad kliendid</h2><small>90 päeva</small></div>
      <div class="stack">${x.topClients.map(([uid,count],i)=>`<div class="person"><div><div class="person-name">${i+1}. ${window.esc(window.pname(uid))}</div><div class="person-meta">${count} treeningut</div></div><span class="pill green">${balance(uid)} krediiti</span></div>`).join('')||'<div class="empty">Statistika jaoks pole veel piisavalt andmeid.</div>'}</div>`;
  }

  window.openStats=function(){s.modal='stats';s.modalData=null;window.render()};

  function csvCell(v){
    const s=String(v??'').replace(/"/g,'""');
    return '"'+s+'"';
  }
  function csvRow(values){return values.map(csvCell).join(';')}
  function section(title,headers,rows){
    return [csvRow([title]),csvRow(headers),...rows.map(csvRow),''].join('\r\n');
  }

  window.exportAllData=async function(){
    if(!window.isTrainer()) return;
    window.toast('Koostan eksporti…');
    try{
      const [profiles,wallets,tx,trainings,regs,removed,ann]=await Promise.all([
        window.api('wod_profiles?select=user_id,display_name,role&order=display_name.asc'),
        window.api('wod_wallets?select=user_id,credits'),
        window.api('wod_credit_transactions?select=*&order=created_at.asc'),
        window.api('wod_trainings?select=*&order=starts_at.asc'),
        window.api('wod_registrations?select=*&order=created_at.asc'),
        window.api('wod_removed_clients?select=user_id,removed_at,reason'),
        window.api('wod_announcements?select=*&order=created_at.asc')
      ]);
      const names=new Map((profiles||[]).map(p=>[p.user_id,p.display_name]));
      const wallet=new Map((wallets||[]).map(w=>[w.user_id,Number(w.credits||0)]));
      const removedSet=new Set((removed||[]).map(r=>r.user_id));
      const trainingMap=new Map((trainings||[]).map(t=>[t.id,t]));
      const clientRows=(profiles||[]).filter(p=>p.role==='client').map(p=>{
        const attended=(regs||[]).filter(r=>r.user_id===p.user_id&&r.status==='confirmed'&&trainingMap.get(r.training_id)&&new Date(trainingMap.get(r.training_id).starts_at)<new Date()&&trainingMap.get(r.training_id).status!=='cancelled').length;
        const future=(regs||[]).filter(r=>r.user_id===p.user_id&&['confirmed','waitlist'].includes(r.status)&&trainingMap.get(r.training_id)&&new Date(trainingMap.get(r.training_id).starts_at)>new Date()).length;
        return [p.display_name,wallet.get(p.user_id)||0,attended,future,removedSet.has(p.user_id)?'Eemaldatud':'Aktiivne'];
      });
      const txRows=(tx||[]).map(x=>[window.dateTime(x.created_at),names.get(x.user_id)||x.user_id,x.delta,x.reason,x.amount_cents==null?'':(Number(x.amount_cents)/100).toFixed(2).replace('.',',')]);
      const trainingRows=(trainings||[]).map(t=>{
        const tr=(regs||[]).filter(r=>r.training_id===t.id);
        return [window.dateTime(t.starts_at),t.title,t.duration_minutes,t.capacity,tr.filter(r=>r.status==='confirmed').length,tr.filter(r=>r.status==='waitlist').length,t.status];
      });
      const regRows=(regs||[]).map(r=>{
        const t=trainingMap.get(r.training_id);
        return [t?.title||'',t?window.dateTime(t.starts_at):'',names.get(r.user_id)||r.user_id,r.status,r.credit_charged?'Jah':'Ei',r.cancelled_late?'Jah':'Ei'];
      });
      const annRows=(ann||[]).map(a=>[window.dateTime(a.created_at),a.title,a.body,scopeLabel(a.scope),a.recipient_count]);
      const csv='\ufeff'+[
        section('KLIENDID',['Nimi','Krediit','Osalemisi kokku','Tulevasi registreeringuid','Staatus'],clientRows),
        section('KREDIIDITEHINGUD',['Kuupäev','Klient','Muutus','Põhjus','Sularaha EUR'],txRows),
        section('TREENINGUD',['Kuupäev','Nimetus','Kestus min','Kohti','Registreerunud','Ootenimekiri','Staatus'],trainingRows),
        section('OSALEMISED',['Treening','Kuupäev','Klient','Staatus','Krediit kasutatud','Hiline tühistus'],regRows),
        section('TEADAANDED',['Kuupäev','Pealkiri','Teade','Sihtrühm','Saajaid'],annRows)
      ].join('\r\n');
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn'}).format(new Date());
      a.download=`CrossFit-eksport-${day}.csv`;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      window.toast('Andmed eksporditud');
    }catch(e){window.toast(e.message||'Eksport ebaõnnestus')}
  };

  function qrHtml(){
    const cells=QR_ROWS.join('').split('').map(v=>`<span style="width:5px;height:5px;background:${v==='1'?'#111':'#fff'}"></span>`).join('');
    return `<div style="display:flex;justify-content:center;margin-top:12px"><div style="display:grid;grid-template-columns:repeat(33,5px);grid-template-rows:repeat(33,5px);background:#fff;padding:8px;border-radius:14px;border:1px solid #dde3df">${cells}</div></div>`;
  }

  window.shareSheet=function(){
    return baseShareSheet()+`<div class="card" style="margin-top:12px"><div class="card-title">QR-kood</div><div class="card-sub">Näita seda ekraanilt või prindi välja. Skännides avaneb CrossFiti konto loomise ja treeningute link.</div>${qrHtml()}<div class="card-sub" style="text-align:center;margin-top:9px">${window.esc(APP_URL)}</div></div>`;
  };

  window.renderModal=function(){
    if(s.modal==='announcement') return sheet('Saada teadaanne',announcementForm());
    if(s.modal==='templates') return sheet('Treeningumallid',templatesSheet());
    if(s.modal==='templateForm') return sheet(s.modalData?.id?'Muuda malli':'Uus treeningumall',templateForm(s.modalData||{}));
    if(s.modal==='stats') return sheet('Statistika',statsSheet());
    return baseRenderModal();
  };

  Object.assign(window,{
    applyClientSearch,setClientFilter,
    openAnnouncement,toggleAnnouncementTraining,sendAnnouncement,
    openTemplates,openTemplateForm,saveTemplate,deleteTemplate,useTemplate,saveTrainingAsTemplate,
    openStats,exportAllData
  });

  setTimeout(()=>{
    if(s.session&&s.profile&&window.isTrainer()) window.reloadData();
  },80);
})();
