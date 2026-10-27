'use strict';

(function(){
  const s=window.state;
  if(!s) return;

  const baseRenderModal=window.renderModal;
  const creditIcon={
    plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    copy:'<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
    package:'<svg viewBox="0 0 24 24"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></svg>'
  };


  s.removedClients=s.removedClients||[];
  s.packageTypes=[];
  s.userPackages=[];

  function removedMap(){return new Map((s.removedClients||[]).map(x=>[x.user_id,x]))}
  function activeClients(){
    const removed=removedMap();
    return s.profiles.filter(p=>p.role==='client'&&!removed.has(p.user_id));
  }
  function balance(uid=s.session?.user?.id){
    return Number(s.wallets.find(w=>w.user_id===uid)?.credits||0);
  }
  function txFor(uid){
    return s.creditTransactions.filter(x=>x.user_id===uid).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  }
  function cashText(cents){
    return cents==null?'':` · sularaha ${window.money(cents)}`;
  }

  window.totalCredits=balance;
  window.legacyCredits=balance;
  window.activeUserPackages=()=>[];
  window.cancellationRule=function(t){
    return `Tasuta tühistamine kuni ${t.cancellation_hours} h enne treeningut. Hilisema tühistamise korral kasutatud treeningkrediiti ei tagastata.`;
  };

  window.loadData=async function(){
    const since=new Date(Date.now()-365*86400000).toISOString();
    const trainer=window.isTrainer();
    const uid=s.session.user.id;
    const queries=[
      window.api(`wod_trainings?select=*&archived_at=is.null&starts_at=gte.${encodeURIComponent(since)}&order=starts_at.asc`),
      window.api('wod_registrations?select=*&order=created_at.asc'),
      window.api('wod_profiles?select=user_id,display_name,role,avatar_path&order=display_name.asc'),
      window.api(trainer?'wod_wallets?select=user_id,credits':`wod_wallets?select=user_id,credits&user_id=eq.${uid}`),
      window.api(trainer?'wod_credit_transactions?select=*&order=created_at.desc&limit=400':`wod_credit_transactions?select=*&user_id=eq.${uid}&order=created_at.desc&limit=100`),
      window.api(`wod_notifications?select=*&user_id=eq.${uid}&order=created_at.desc&limit=80`)
    ];
    if(trainer) queries.push(window.api('wod_removed_clients?select=user_id,removed_at,reason&order=removed_at.desc'));
    const out=await Promise.all(queries);
    s.trainings=out[0]||[];
    s.registrations=out[1]||[];
    s.profiles=out[2]||[];
    s.wallets=out[3]||[];
    s.creditTransactions=out[4]||[];
    s.notifications=(out[5]||[]).filter(x=>!x.due_at||new Date(x.due_at)<=window.now());
    s.removedClients=trainer?(out[6]||[]):[];
    s.packageTypes=[];
    s.userPackages=[];
  };

  window.trainerAttention=function(){
    const future=window.upcomingTrainings();
    const waiting=s.registrations.filter(r=>r.status==='waitlist'&&future.some(t=>t.id===r.training_id)).length;
    const clients=activeClients();
    const noCredit=clients.filter(p=>balance(p.user_id)<=0).length;
    return {noCredit,waiting,clients:clients.length};
  };

  window.trainingCard=function(t,trainer=window.isTrainer()){
    const c=window.confirmedFor(t.id).length,w=window.waitlistFor(t.id).length,m=window.mineFor(t.id);
    const pct=Math.min(100,Math.round((c/Math.max(1,t.capacity))*100));
    return `<div class="training-card" onclick="openTraining(${t.id})">
      <div class="training-top"><div><div class="training-title">${window.esc(t.title)}</div><div class="training-time">${window.esc(window.dateTime(t.starts_at))}</div></div><span class="pill ${c>=t.capacity?'amber':'green'}">${c}/${t.capacity}</span></div>
      <div class="training-meta"><span class="pill">${t.duration_minutes} min</span><span class="pill blue">1 krediit</span>${w?`<span class="pill amber">Ootel ${w}</span>`:''}${!trainer&&m?`<span class="pill ${m.status==='waitlist'?'amber':'green'}">${m.status==='waitlist'?'Ootenimekiri #'+window.waitPosition(t.id):'Registreeritud'}</span>`:''}</div>
      <div class="progress ${c<t.capacity?'green':''}"><span style="width:${pct}%"></span></div>
    </div>`;
  };

  window.renderHome=function(){
    if(window.isTrainer()){
      const next=window.upcomingTrainings()[0],att=window.trainerAttention();
      return `<div class="page-head"><div><h1 class="page-title">Avaleht</h1><div class="page-sub">Kiire ülevaade treeningutest ja klientide krediidist.</div></div></div>
        ${next?`<div class="hero"><div class="hero-kicker">Järgmine treening</div><h1>${window.esc(next.title)}</h1><p>${window.esc(window.fullDateTime(next.starts_at))}</p><div class="hero-actions"><button class="btn btn-primary" onclick="openTraining(${next.id})">Ava treening</button><span class="pill dark">${window.confirmedFor(next.id).length}/${next.capacity} kohta</span>${window.waitlistFor(next.id).length?`<span class="pill amber">${window.waitlistFor(next.id).length} ootel</span>`:''}</div></div>`:`<div class="hero"><div class="hero-kicker">Treeneri vaade</div><h1>Treeninguid pole veel lisatud</h1><p>Lisa esimene treening kiirtoimingust.</p><div class="hero-actions"><button class="btn btn-primary" onclick="openTrainingForm()">Lisa treening</button></div></div>`}
        <div class="metric-grid">${window.metric(att.noCredit,'0 krediidiga klienti')}${window.metric(att.waiting,'Ootenimekirjas')}${window.metric(att.clients,'Aktiivseid kliente')}</div>
        <div class="section"><h2>Kiirtoimingud</h2></div>
        <div class="quick-grid">
          <button class="quick" onclick="openTrainingForm()">${creditIcon.plus}<b>Lisa treening</b><span>Üksik või korduv treening</span></button>
          <button class="quick" onclick="copyLatestTraining()">${creditIcon.copy}<b>Kopeeri eelmine</b><span>Loo sarnane treening kiiresti</span></button>
          <button class="quick" onclick="go('people');toast('Vali klient ja lisa talle krediiti')">${creditIcon.package}<b>Lisa krediiti</b><span>Sularaha eest treeningkorrad</span></button>
        </div>
        ${next?`<div class="section"><h2>Täituvus</h2><small>${window.confirmedFor(next.id).length} registreerunud</small></div>${window.trainingCard(next,true)}`:''}`;
    }

    const next=window.nextClientTraining(),stats=window.clientStats(),credits=balance();
    const mine=next?window.mineFor(next.id):null;
    return `<div class="page-head"><div><h1 class="page-title">Tere, ${window.esc(s.profile.display_name.split(' ')[0])}</h1><div class="page-sub">Sinu treeningud ja treeningkrediidi jääk.</div></div></div>
      ${credits<=0?`<div class="card" style="margin-bottom:12px;border-color:#e5b7ad"><div class="card-title">Treeningkrediit on otsas</div><div class="card-sub">Uue krediidi saamiseks tasu treenerile sularahas. Treener lisab krediidi sinu kontole.</div></div>`:''}
      ${next?`<div class="hero"><div class="hero-kicker">${mine?'Sinu järgmine treening':'Järgmine treening'}</div><h1>${window.esc(next.title)}</h1><p>${window.esc(window.fullDateTime(next.starts_at))} · ${window.confirmedFor(next.id).length}/${next.capacity} kohta</p><div class="hero-actions"><button class="btn btn-primary" onclick="openTraining(${next.id})">${mine?'Vaata registreeringut':'Vaata treeningut'}</button>${mine?.status==='waitlist'?`<span class="pill amber">Ootenimekiri #${window.waitPosition(next.id)}</span>`:mine?'<span class="pill green">Registreeritud</span>':''}</div></div>`:`<div class="hero"><div class="hero-kicker">CrossFit</div><h1>Uusi treeninguid pole veel</h1><p>Kui treener lisab uue aja, näed seda siin.</p></div>`}
      <div class="metric-grid">${window.metric(stats.future,'Tulevast broneeringut')}${window.metric(stats.attended,'Osaletud treeningut')}${window.metric(credits,'Krediiti alles')}</div>
      <div class="section"><h2>Järgmised treeningud</h2><button class="btn-link" onclick="go('trainings')">Vaata kõiki</button></div>
      <div class="stack">${window.upcomingTrainings().slice(0,3).map(t=>window.trainingCard(t,false)).join('')||'<div class="empty">Treeninguid pole veel lisatud.</div>'}</div>`;
  };

  window.registrationRow=function(r,past=false){
    const t=s.trainings.find(x=>x.id===r.training_id);
    if(!t)return'';
    let status='';
    if(r.status==='waitlist') status=`<span class="pill amber">Ootenimekiri #${window.waitPosition(t.id,r.user_id)||'—'}</span>`;
    else if(r.status==='cancelled'&&r.cancelled_late) status='<span class="pill red">Hilinenud tühistus</span>';
    else if(r.status==='cancelled') status='<span class="pill red">Tühistatud</span>';
    else if(past) status='<span class="pill green">Osales</span>';
    else status='<span class="pill green">Registreeritud</span>';
    return `<div class="training-card" onclick="openTraining(${t.id})"><div class="training-top"><div><div class="training-title">${window.esc(t.title)}</div><div class="training-time">${window.esc(window.dateTime(t.starts_at))}</div></div>${status}</div><div class="training-meta">${r.credit_charged?'<span class="pill blue">1 krediit kasutatud</span>':r.status==='waitlist'?'<span class="pill">Krediit arvestatakse koha saamisel</span>':''}</div></div>`;
  };

  function transactionRow(x){
    const plus=Number(x.delta)>0;
    return `<div class="notification"><div class="notif-dot ${plus?'read':''}" style="${plus?'background:#167a45':''}"></div><div style="flex:1"><div class="notif-title">${plus?'+':''}${x.delta} krediiti</div><div class="notif-body">${window.esc(x.reason)}${cashText(x.amount_cents)}</div><div class="notif-time">${window.esc(window.dateTime(x.created_at))}</div></div></div>`;
  }

  window.renderMine=function(){
    const uid=s.session.user.id;
    const myRegs=s.registrations.filter(r=>r.user_id===uid);
    const future=myRegs.filter(r=>['confirmed','waitlist'].includes(r.status)&&s.trainings.some(t=>t.id===r.training_id&&new Date(t.starts_at)>window.now())).sort((a,b)=>new Date(s.trainings.find(t=>t.id===a.training_id)?.starts_at)-new Date(s.trainings.find(t=>t.id===b.training_id)?.starts_at));
    const past=myRegs.filter(r=>s.trainings.some(t=>t.id===r.training_id&&new Date(t.starts_at)<=window.now())).sort((a,b)=>new Date(s.trainings.find(t=>t.id===b.training_id)?.starts_at)-new Date(s.trainings.find(t=>t.id===a.training_id)?.starts_at));
    const tx=txFor(uid).slice(0,30);
    return `<div class="page-head"><div><h1 class="page-title">Minu</h1><div class="page-sub">Sinu krediit, tulevased broneeringud ja treeninguajalugu.</div></div></div>
      <div class="hero"><div class="hero-kicker">Treeningkrediit</div><h1>${balance(uid)} krediiti</h1><p>Üks kinnitatud treening kasutab ühe krediidi.</p></div>
      <div class="card"><div class="card-title-row"><div><div class="card-title">${window.esc(s.profile.display_name)}</div><div class="card-sub">${window.esc(s.session.user.email||'')}</div></div><button class="btn btn-soft btn-sm" onclick="openProfileEdit()">Muuda</button></div></div>
      <div class="section"><h2>Krediidi ajalugu</h2><small>${tx.length}</small></div><div class="stack">${tx.map(transactionRow).join('')||'<div class="empty">Krediiditehinguid veel ei ole.</div>'}</div>
      <div class="section"><h2>Tulevased registreeringud</h2></div><div class="stack">${future.map(r=>window.registrationRow(r)).join('')||'<div class="empty">Tulevasi registreeringuid ei ole.</div>'}</div>
      <div class="section"><h2>Treeningute ajalugu</h2></div><div class="stack">${past.slice(0,20).map(r=>window.registrationRow(r,true)).join('')||'<div class="empty">Ajalugu on veel tühi.</div>'}</div>`;
  };

  window.clientCard=function(p){
    const uid=p.user_id;
    const attended=s.registrations.filter(r=>r.user_id===uid&&r.status==='confirmed'&&s.trainings.some(t=>t.id===r.training_id&&new Date(t.starts_at)<window.now()&&t.status!=='cancelled')).length;
    const credits=balance(uid);
    return `<div class="client-card"><div class="client-top"><div><div class="client-name">${window.esc(p.display_name)}</div><div class="client-meta">${attended} osaletud treeningut</div></div><span class="pill ${credits>0?'green':'amber'}">${credits} krediiti</span></div><div class="client-actions"><button class="btn btn-soft" onclick="openClient('${uid}')">Kliendikaart</button><button class="btn btn-primary" onclick="openAddCredits('${uid}')">Lisa krediiti</button></div></div>`;
  };

  window.renderClients=function(){
    const removed=removedMap();
    const clients=activeClients();
    const archived=s.profiles.filter(p=>p.role==='client'&&removed.has(p.user_id));
    const archivedRows=archived.map(p=>{
      const r=removed.get(p.user_id)||{};
      return `<div class="client-card" style="opacity:.82"><div class="client-top"><div><div class="client-name">${window.esc(p.display_name)}</div><div class="client-meta">Eemaldatud ${r.removed_at?window.shortDate(r.removed_at):''}${r.reason?' · '+window.esc(r.reason):''}</div></div><span class="pill red">Eemaldatud</span></div><div class="client-actions"><button class="btn btn-soft" onclick="restoreClient('${p.user_id}')">Taasta klient</button></div></div>`;
    }).join('');
    return `<div class="page-head"><div><h1 class="page-title">Kliendid</h1><div class="page-sub">Treeningkrediit, ajalugu ja kliendihaldus.</div></div></div>
      <div class="section"><h2>Aktiivsed kliendid</h2><small>${clients.length}</small></div>
      <div class="stack">${clients.map(p=>window.clientCard(p)).join('')||'<div class="empty">Kliente pole veel.</div>'}</div>
      ${archived.length?`<div class="section"><h2>Eemaldatud kliendid</h2><small>${archived.length}</small></div><div class="stack">${archivedRows}</div>`:''}`;
  };

  window.clientDetail=function(p){
    const uid=p.user_id;
    const regs=s.registrations.filter(r=>r.user_id===uid);
    const future=regs.filter(r=>['confirmed','waitlist'].includes(r.status)&&s.trainings.some(t=>t.id===r.training_id&&new Date(t.starts_at)>window.now())).sort((a,b)=>new Date(s.trainings.find(t=>t.id===a.training_id)?.starts_at)-new Date(s.trainings.find(t=>t.id===b.training_id)?.starts_at));
    const past=regs.filter(r=>r.status==='confirmed'&&s.trainings.some(t=>t.id===r.training_id&&new Date(t.starts_at)<window.now()&&t.status!=='cancelled')).length;
    const tx=txFor(uid).slice(0,30);
    return `<div class="hero"><div class="hero-kicker">${window.esc(p.display_name)}</div><h1>${balance(uid)} krediiti</h1><p>${past} osaletud treeningut · ${future.length} tulevast registreeringut</p><div class="hero-actions"><button class="btn btn-primary" onclick="openAddCredits('${uid}')">Lisa krediiti</button></div></div>
      <div class="section"><h2>Krediidi ajalugu</h2><small>${tx.length}</small></div><div class="stack">${tx.map(transactionRow).join('')||'<div class="empty">Krediiditehinguid veel ei ole.</div>'}</div>
      <div class="section"><h2>Tulevased registreeringud</h2></div><div class="stack">${future.map(r=>window.registrationRow(r)).join('')||'<div class="empty">Tulevasi registreeringuid ei ole.</div>'}</div>
      <div class="section"><h2>Kliendi haldus</h2></div>
      <div class="card"><div class="card-title">Eemalda klient</div><div class="card-sub">Klient eemaldatakse aktiivsete klientide nimekirjast. Tema tulevased broneeringud tühistatakse ja kasutatud krediit tagastatakse. Treeninguajalugu säilib ning klienti saab hiljem taastada.</div><div class="training-actions"><button class="btn btn-danger btn-block" onclick="removeClient('${uid}')">Eemalda klient</button></div></div>`;
  };

  window.personRow=function(r,t,pos=null){
    const cr=balance(r.user_id);
    return `<div class="person"><div><div class="person-name">${pos?pos+'. ':''}${window.esc(window.pname(r.user_id))}</div><div class="person-meta">${r.status==='waitlist'?'Ootenimekirjas':'Registreeritud'} · saldo ${cr} krediiti</div><div class="training-meta">${r.status==='confirmed'&&r.credit_charged?'<span class="pill blue">1 krediit kasutatud</span>':r.status==='waitlist'?'<span class="pill">Krediit arvestatakse koha saamisel</span>':''}</div></div></div>`;
  };

  window.trainingDetail=function(t){
    const c=window.confirmedFor(t.id),w=window.waitlistFor(t.id),mine=window.mineFor(t.id),past=new Date(t.starts_at)<=window.now(),deadline=window.cancellationDeadline(t),late=deadline<window.now();
    let action='';
    if(window.isTrainer()){
      action=`<div class="training-actions"><button class="btn btn-soft" onclick="openTrainingForm(${t.id})">Muuda</button><button class="btn btn-soft" onclick="copyTraining(${t.id})">Kopeeri</button>${t.status!=='cancelled'&&!past?`<button class="btn btn-danger" onclick="cancelTraining(${t.id})">Tühista</button>`:''}<button class="btn btn-danger" onclick="deleteTraining(${t.id})">Kustuta</button></div>`;
    } else if(!past&&t.status==='published'){
      if(mine){
        action=`<div class="detail-block"><h3>Sinu registreering</h3><div class="training-meta">${mine.status==='waitlist'?`<span class="pill amber">Ootenimekiri #${window.waitPosition(t.id)}</span><span class="pill">Krediit arvestatakse koha saamisel</span>`:'<span class="pill green">Registreeritud</span><span class="pill blue">1 krediit kasutatud</span>'}</div><div class="training-actions"><button class="btn btn-soft" onclick="openCalendar(${t.id})">Lisa kalendrisse</button><button class="btn btn-danger" onclick="cancelRegistration(${t.id})">Tühista registreering</button></div>${mine.status==='confirmed'&&late?'<div class="card-sub" style="margin-top:8px;color:#9b3d43">Tasuta tühistamise aeg on möödas. Tühistada saab, kuid kasutatud krediiti ei tagastata.</div>':''}</div>`;
      } else {
        const credits=balance(),full=c.length>=t.capacity;
        action=credits>0
          ? `<div class="detail-block"><h3>${full?'Treening on täis':'Registreeru'}</h3><div class="card-sub">${full?'Liitu ootenimekirjaga. Krediit arvestatakse alles siis, kui saad treeningule koha.':'Registreerumisel kasutatakse sinu kontolt 1 krediit.'}</div><div class="training-actions"><button class="btn btn-primary" onclick="registerTraining(${t.id})">${full?'Liitu ootenimekirjaga':'Registreeru · 1 krediit'}</button></div></div>`
          : '<div class="detail-block"><h3>Treeningkrediit on otsas</h3><div class="card-sub">Uue krediidi saamiseks tasu treenerile sularahas. Pärast krediidi lisamist saad treeningule registreeruda.</div></div>';
      }
    }
    const workout=t.workout?`<div class="detail-block"><h3>Päeva treening / WOD</h3><div class="detail-text">${window.esc(t.workout)}</div></div>`:'';
    const note=t.note?`<div class="detail-block"><h3>Treeneri märkus</h3><div class="detail-text">${window.esc(t.note)}</div></div>`:'';
    const people=window.isTrainer()||!past?`<div class="detail-block"><h3>Registreerunud (${c.length}/${t.capacity})</h3><div class="person-list">${c.map(r=>window.personRow(r,t)).join('')||'<div class="card-sub">Keegi pole veel registreerunud.</div>'}</div>${w.length?`<h3 style="margin-top:14px">Ootenimekiri (${w.length})</h3><div class="person-list">${w.map((r,i)=>window.personRow(r,t,i+1)).join('')}</div>`:''}</div>`:'';
    return `<div class="detail-hero"><div class="detail-date">${window.esc(window.fullDateTime(t.starts_at))}</div><h2>${window.esc(t.title)}</h2><div class="detail-stats"><div class="detail-stat"><b>${c.length}/${t.capacity}</b><span>Kohti</span></div><div class="detail-stat"><b>${t.duration_minutes}</b><span>Minutit</span></div><div class="detail-stat"><b>1</b><span>Krediit</span></div></div></div><div class="detail-block"><h3>Tühistamise reegel</h3><div class="detail-text">${window.esc(window.cancellationRule(t))}</div><div class="card-sub">Tasuta tühistamise tähtaeg: ${window.esc(window.fullDateTime(deadline.toISOString()))}</div></div>${workout}${note}${people}${action}`;
  };

  window.registerTraining=async function(id){
    try{
      const result=await window.rpc('wod_register',{p_training_id:id,p_use_credit:true});
      const status=Array.isArray(result)?result[0]?.registration_status:result?.registration_status;
      await window.reloadData(status==='waitlist'
        ?'Oled ootenimekirjas. Krediiti veel ei arvestatud.'
        :'Registreerimine õnnestus. Kasutati 1 krediit.');
      s.modal='training';s.modalData=id;window.render();
    }catch(e){window.toast(e.message)}
  };

  window.cancelRegistration=async function(id){
    const t=s.trainings.find(x=>x.id===id);
    const mine=window.mineFor(id);
    const onWaitlist=mine?.status==='waitlist';
    const late=!onWaitlist&&t&&window.cancellationDeadline(t)<window.now();
    const text=onWaitlist
      ?'Kas soovid ootenimekirjast lahkuda? Krediiti ei ole veel maha arvestatud.'
      :late
        ?'Tasuta tühistamise aeg on möödas. Tühistamisel kasutatud krediiti ei tagastata. Kas jätkata?'
        :'Kas tühistada registreering? Kasutatud krediit tagastatakse sinu kontole.';
    if(!confirm(text))return;
    try{
      await window.rpc('wod_cancel_registration',{p_training_id:id});
      await window.reloadData(onWaitlist
        ?'Lahkusid ootenimekirjast. Krediidijääk ei muutunud.'
        :late?'Registreering tühistatud. Krediiti ei tagastatud.':'Registreering tühistatud ja krediit tagastatud.');
      s.modal='training';s.modalData=id;window.render();
    }catch(e){window.toast(e.message)}
  };

  window.trainingForm=function(d){
    const parts=d.starts_at?window.localParts(d.starts_at):{date:new Intl.DateTimeFormat('en-CA',{timeZone:window.TZ||'Europe/Tallinn'}).format(new Date(Date.now()+86400000)),time:'19:00'};
    return `<div class="form"><div class="form-grid"><div class="field"><label>Kuupäev</label><input id="tfDate" type="date" value="${parts.date}"></div><div class="field"><label>Kellaaeg (Eesti aeg)</label><select id="tfTime">${window.timeOptions(parts.time)}</select></div></div><div class="field"><label>Nimetus</label><input id="tfTitle" value="${window.esc(d.title||'CrossFit')}"></div><div class="form-grid"><div class="field"><label>Kestus (min)</label><input id="tfDuration" type="number" min="15" max="240" step="5" value="${d.duration_minutes||60}"></div><div class="field"><label>Kohti</label><input id="tfCapacity" type="number" min="1" max="100" value="${d.capacity||12}"></div></div><div class="field"><label>Tasuta tühistamine (h enne)</label><input id="tfCancel" type="number" min="0" max="72" value="${d.cancellation_hours??2}"></div><div class="field"><label>Päeva treening / WOD</label><textarea id="tfWorkout" placeholder="Näiteks: 5 rounds...">${window.esc(d.workout||'')}</textarea></div><div class="field"><label>Treeneri märkus</label><textarea id="tfNote" placeholder="Mida klient peaks enne trenni teadma?">${window.esc(d.note||'')}</textarea></div>${d.id?'':`<div class="card" style="box-shadow:none"><div class="card-title">Korduv treening</div><div class="card-sub">Soovi korral loo sama treening mitmeks nädalaks.</div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Nädalaid</label><input id="tfWeeks" type="number" min="1" max="12" value="1"></div><div class="field"><label>Nädalapäevad</label><div style="display:flex;gap:5px;flex-wrap:wrap">${[['E',1],['T',2],['K',3],['N',4],['R',5],['L',6],['P',7]].map(([n,v])=>`<label class="pill" style="padding:8px"><input class="tfDay" type="checkbox" value="${v}"> ${n}</label>`).join('')}</div></div></div></div>`}<div class="form-actions"><button class="btn btn-primary" onclick="saveTrainingForm(${d.id||'null'})">${d.id?'Salvesta muudatused':'Avalda treening'}</button><button class="btn btn-soft" onclick="closeModal()">Katkesta</button></div></div>`;
  };

  window.saveTrainingForm=async function(id){
    const date=document.getElementById('tfDate').value,time=document.getElementById('tfTime').value,title=document.getElementById('tfTitle').value.trim(),duration=+document.getElementById('tfDuration').value,capacity=+document.getElementById('tfCapacity').value,cancel=+document.getElementById('tfCancel').value,workout=document.getElementById('tfWorkout').value.trim(),note=document.getElementById('tfNote').value.trim();
    if(!date||!time||!title||capacity<1){window.toast('Kontrolli treeningu andmeid');return}
    try{
      if(id){
        await window.api(`wod_trainings?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({title,starts_at:window.tallinnLocalToIso(date,time),duration_minutes:duration,capacity,price_cents:0,cancellation_hours:cancel,workout:workout||null,note:note||null,updated_at:new Date().toISOString()})});
      }else{
        const weeks=Math.max(1,Math.min(12,+document.getElementById('tfWeeks')?.value||1)),days=[...document.querySelectorAll('.tfDay:checked')].map(x=>+x.value),baseWd=window.weekday(date),chosen=days.length?days:[baseWd],rows=[];
        for(let w=0;w<weeks;w++){
          for(const wd of chosen){
            const delta=w*7+(wd-baseWd);
            if(delta<0&&w===0)continue;
            const d=window.addDays(date,delta);
            rows.push({created_by:s.session.user.id,title,starts_at:window.tallinnLocalToIso(d,time),duration_minutes:duration,capacity,price_cents:0,cancellation_hours:cancel,workout:workout||null,note:note||null,status:'published'});
          }
        }
        await window.api('wod_trainings',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)});
      }
      s.modal=null;s.modalData=null;
      await window.reloadData(id?'Treening uuendatud':'Treening avaldatud');
    }catch(e){window.toast(e.message)}
  };

  window.openAddCredits=function(uid){s.modal='addCredits';s.modalData=uid;window.render()};
  window.setCreditAmount=function(n){const el=document.getElementById('creditQty');if(el)el.value=n};

  function addCreditForm(uid){
    const p=s.profiles.find(x=>x.user_id===uid);
    return `<div class="hero"><div class="hero-kicker">${window.esc(p?.display_name||'Klient')}</div><h1>${balance(uid)} krediiti</h1><p>Lisa sularahas tasutud treeningkrediit.</p></div>
      <div class="form">
        <div class="field"><label>Krediiti juurde</label><input id="creditQty" type="number" min="1" max="100" step="1" value="10"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px"><button class="btn btn-soft btn-sm" onclick="setCreditAmount(1)">+1</button><button class="btn btn-soft btn-sm" onclick="setCreditAmount(5)">+5</button><button class="btn btn-soft btn-sm" onclick="setCreditAmount(10)">+10</button><button class="btn btn-soft btn-sm" onclick="setCreditAmount(20)">+20</button></div></div>
        <div class="field"><label>Sularahas saadud summa (€) <span style="font-weight:500;color:#7a837e">– valikuline</span></label><input id="creditCash" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Näiteks 70"></div>
        <div class="field"><label>Märkus <span style="font-weight:500;color:#7a837e">– valikuline</span></label><input id="creditNote" maxlength="90" placeholder="Näiteks 10 korra krediit"></div>
        <div class="form-actions"><button class="btn btn-primary" onclick="addCredits('${uid}')">Lisa krediit</button><button class="btn btn-soft" onclick="closeModal()">Katkesta</button></div>
      </div>`;
  }

  window.addCredits=async function(uid){
    const qty=Number(document.getElementById('creditQty')?.value||0);
    const cashRaw=document.getElementById('creditCash')?.value;
    const note=document.getElementById('creditNote')?.value.trim()||null;
    if(!Number.isInteger(qty)||qty<1||qty>100){window.toast('Sisesta krediidi kogus 1–100');return}
    const cash=cashRaw===''||cashRaw==null?null:Math.round(Number(cashRaw)*100);
    if(cash!=null&&(!Number.isFinite(cash)||cash<0)){window.toast('Kontrolli sularaha summat');return}
    try{
      await window.rpc('wod_add_credits',{p_user_id:uid,p_credits:qty,p_cash_cents:cash,p_note:note});
      await window.reloadData(`Lisatud ${qty} krediiti`);
      s.modal='client';s.modalData=uid;window.render();
    }catch(e){window.toast(e.message||'Krediidi lisamine ebaõnnestus')}
  };

  window.removeClient=async function(uid){
    const p=s.profiles.find(x=>x.user_id===uid);
    if(!p)return;
    if(!confirm(`Eemaldada klient ${p.display_name}?\n\nTema tulevased registreeringud tühistatakse ja kinnitatud tulevaste treeningute krediit tagastatakse. Treeninguajalugu säilib ning klienti saab hiljem taastada.`))return;
    const reason=prompt('Soovi korral lisa eemaldamise põhjus. Võid jätta tühjaks:','')||null;
    try{
      await window.rpc('wod_remove_client',{p_user_id:uid,p_reason:reason});
      s.modal=null;s.modalData=null;s.view='people';
      await window.reloadData('Klient eemaldatud');
    }catch(e){window.toast(e.message||'Kliendi eemaldamine ebaõnnestus')}
  };

  window.renderModal=function(){
    if(s.modal==='addCredits'){
      const close='<button class="sheet-close" onclick="closeModal()" aria-label="Sulge">×</button>';
      return `<div class="sheet-backdrop" onclick="backdropClose(event)"><div class="sheet" onclick="event.stopPropagation()"><div class="sheet-head"><div class="sheet-title">Lisa treeningkrediiti</div>${close}</div><div class="sheet-body">${addCreditForm(s.modalData)}</div></div></div>`;
    }
    return baseRenderModal();
  };

  window.quickSheet=function(){
    return `<div class="quick-grid"><button class="quick" onclick="openTrainingForm()">${creditIcon.plus}<b>Lisa treening</b><span>Üksik või korduv</span></button><button class="quick" onclick="copyLatestTraining()">${creditIcon.copy}<b>Kopeeri eelmine</b><span>Loo kiiresti uus aeg</span></button><button class="quick" onclick="state.modal=null;go('people');toast('Vali klient ja lisa talle krediiti')">${creditIcon.package}<b>Lisa krediiti</b><span>Vali klient</span></button></div>`;
  };

  window.infoSheet=function(){
    return `<div class="card"><div class="card-title">CrossFit treeningurakendus</div><div class="card-sub">Registreerimine, ootenimekiri, treeningkrediit ja teavitused.</div><div style="margin-top:10px"><div class="info-row"><span>Versioon</span><b>5.3</b></div><div class="info-row"><span>Tasumine</span><b>Sularahas treenerile</b></div><div class="info-row"><span>Treeningkrediit</span><b>Treener lisab krediidi kontole</b></div><div class="info-row"><span>Treeningule registreerimine</span><b>1 krediit</b></div><div class="info-row"><span>Osalemine</span><b>Registreeritud ja tühistamata = osales</b></div><div class="info-row"><span>Hiline tühistus</span><b>Krediiti ei tagastata</b></div></div></div>`;
  };

  Object.assign(window,{
    openAddCredits,setCreditAmount,addCredits,removeClient
  });

  setTimeout(()=>{
    if(s.session&&s.profile) window.reloadData();
  },0);
})();
