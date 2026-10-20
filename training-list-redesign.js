'use strict';

/* Treeningute kuupäevade järgi rühmitatud nimekiri.
 * Olemasolev registreerimine, ootenimekiri ja krediidiarvestus jäävad muutmata.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.renderTrainings!=='function')return;

  const TZ='Europe/Tallinn',busy=new Set();
  const heading=new Intl.DateTimeFormat('et-EE',{timeZone:TZ,weekday:'long',day:'numeric',month:'long'});
  const dayfmt=new Intl.DateTimeFormat('et-EE',{timeZone:TZ,day:'numeric',month:'short'});
  const timefmt=new Intl.DateTimeFormat('et-EE',{timeZone:TZ,hour:'2-digit',minute:'2-digit'});
  const keyfmt=new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
  const svg={
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    users:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.6-4 2.4-6 5.5-6s4.9 2 5.5 6M14.5 14.5c2.8 0 4.8 1.6 5.5 5.5"/></svg>',
    clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',
    bank:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>'
  };
  const esc=v=>window.esc(v);
  const date=(iso,fmt)=>{const d=new Date(iso);return Number.isFinite(d.getTime())?fmt.format(d):'—'};
  const safeId=t=>{const n=Number(t?.id);return Number.isSafeInteger(n)&&n>0?n:null};
  const mine=t=>window.mineFor(t.id);
  const credit=()=>{const n=Number(window.totalCredits?.()??0);return Number.isNaN(n)?0:n};
  const counts=t=>{
    const confirmed=window.confirmedFor(t.id),wait=window.waitlistFor(t.id);
    const capacity=Math.max(0,Number(t.capacity)||0);
    return {confirmed,wait,capacity,free:Math.max(0,capacity-confirmed.length)};
  };
  function status(t,past,trainer,c){
    if(t.status==='cancelled')return '<span class="tl-pill tl-cancelled">Tühistatud</span>';
    const reg=mine(t);
    if(past)return (!trainer&&reg?.status==='confirmed')
      ?'<span class="tl-pill tl-booked">Olin registreeritud</span>'
      :'<span class="tl-pill tl-neutral">Toimunud</span>';
    if(!trainer&&reg?.status==='confirmed')return '<span class="tl-pill tl-booked">Registreeritud</span>';
    if(!trainer&&reg?.status==='waitlist')return '<span class="tl-pill tl-waiting">Ootenimekirjas</span>';
    return c.free>0?'<span class="tl-pill tl-free">'+c.free+' vaba kohta</span>'
      :'<span class="tl-pill tl-waiting">Kohad täis</span>';
  }
  function attendees(list){
    if(!list.length)return '<span class="tl-participants-none">Veel pole registreerunuid</span>';
    const top=list.slice(0,3).map(r=>{
      const name=String(window.pname(r.user_id)||'Kasutaja');
      const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toLocaleUpperCase('et')||'?';
      return '<span class="tl-person">'+(window.crossfitAvatars?.html(r.user_id,'small')||'<span class="tl-person-avatar" aria-hidden="true">'+esc(initials)+'</span>')+'<span>'+esc(name)+'</span></span>';
    }).join('');
    return top+(list.length>3?'<span class="tl-people-extra">+'+(list.length-3)+'</span>':'');
  }
  function action(t,past,trainer,c){
    const id=safeId(t);if(id===null)return '';
    const reg=mine(t);
    if(trainer)return '<button type="button" class="tl-action tl-action-main" onclick="openTraining('+id+')">'+(past?'Vaata treeningut':'Halda treeningut')+svg.arrow+'</button>';
    if(past)return '<button type="button" class="tl-action tl-action-secondary" onclick="openTraining('+id+')">Vaata treeningut'+svg.arrow+'</button>';
    if(reg)return '<button type="button" class="tl-action tl-action-secondary" onclick="openTraining('+id+')">'+
      (reg.status==='waitlist'?'Vaata ootenimekirja':'Vaata registreeringut')+svg.arrow+'</button>';
    if(credit()<=0)return '<button type="button" class="tl-action tl-action-secondary" onclick="openTraining('+id+')">Vaata treeningut'+svg.arrow+'</button>';
    return '<button type="button" class="tl-action tl-action-main" data-register-id="'+id+'" onclick="crossfitTrainingList.quickRegister('+id+')">'+
      (c.free>0?'Registreeru · 1 krediit':'Liitu ootenimekirjaga')+svg.arrow+'</button>';
  }
  function card(t,past,trainer){
    const id=safeId(t);if(id===null)return '';
    const c=counts(t),duration=Number(t.duration_minutes)||0;
    const fill=c.capacity?Math.min(100,Math.round(c.confirmed.length/c.capacity*100)):0;
    const stopped=t.status==='cancelled';
    const names=attendees(c.confirmed);
    return '<article class="tl-training-card'+(stopped?' tl-card-cancelled':'')+'">'+
      '<div class="tl-card-top"><div class="tl-card-datebox"><span class="tl-card-day">'+esc(date(t.starts_at,dayfmt))+'</span>'+
      '<strong>'+esc(date(t.starts_at,timefmt))+'</strong></div>'+
      '<div class="tl-card-heading"><h3>'+esc(t.title||'CrossFit')+'</h3>'+
      '<div class="tl-card-info">'+(duration?'<span>'+svg.clock+Math.round(duration)+' min</span>':'')+
      '<span>'+svg.users+c.confirmed.length+'/'+c.capacity+' registreerunud</span>'+
      (c.wait.length?'<span class="tl-wait-count">'+c.wait.length+' ootenimekirjas</span>':'')+
      '</div></div>'+status(t,past,trainer,c)+'</div>'+
      '<div class="tl-capacity"><div class="tl-capacity-track" role="meter" aria-label="Kohtade täituvus" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+fill+'"><span style="width:'+fill+'%"></span></div>'+
      '<div class="tl-capacity-label">'+(past||stopped?'Registreerunuid '+c.confirmed.length:c.free>0?'Vabu kohti '+c.free:'Kõik kohad täidetud')+'</div></div>'+
      '<div class="tl-participants"><span class="tl-participants-label">Registreerunud</span><div class="tl-participants-list">'+names+'</div></div>'+
      '<div class="tl-card-actions">'+action(t,past,trainer,c)+
      '<button type="button" class="tl-action tl-action-link" onclick="openTraining('+id+')">Täpsem info'+svg.arrow+'</button></div>'+(trainer&&(past||stopped)?'<button type="button" class="tl-history-remove" onclick="deleteTraining('+id+')">Eemalda ajaloost</button>':'')+
    '</article>';
  }
  function grouped(list,past,trainer){
    if(!list.length)return '<div class="tl-empty"><div class="tl-empty-icon">'+svg.calendar+'</div><strong>'+
      (past?'Varasemaid treeninguid pole.':'Tulevasi treeninguid pole veel lisatud.')+'</strong><span>'+
      (trainer?'Lisa treening, et see siin kuvataks.':'Kui treener lisab ajad, näed neid siin.')+'</span></div>';
    const groups=new Map();
    for(const t of list){const key=date(t.starts_at,keyfmt);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
    return [...groups.values()].map(items=>'<section class="tl-day-group"><h2 class="tl-day-title">'+esc(date(items[0].starts_at,heading))+
      '</h2><div class="tl-day-items">'+items.map(t=>card(t,past,trainer)).join('')+'</div></section>').join('');
  }
  function trainerTools(){
    const rows=Array.isArray(s.wodBank)?s.wodBank:null;
    const summary=rows?rows.filter(x=>x.status==='pending').length+' töötlemata · '+
      rows.filter(x=>x.status==='review').length+' kinnitamata':'Ava treeningukogu';
    return '<div class="tl-trainer-tool"><button type="button" onclick="openWodBank()">'+svg.bank+
      '<span><strong>WOD-pank</strong><small>'+summary+'</small></span>'+svg.arrow+'</button></div>';
  }
  function render(){
    const trainer=window.isTrainer(),past=s.trainingTab==='past';
    const future=window.upcomingTrainings(),completed=window.pastTrainings();
    const list=past?completed:future;
    const tools=trainer?
      '<div class="tl-header-actions"><button type="button" class="btn btn-soft btn-sm" onclick="openTemplates()">Mallid</button>'+
      '<button type="button" class="page-action" onclick="openTrainingForm()">'+svg.plus+' Lisa</button></div>':
      '<button type="button" class="tl-header-credit" onclick="go('+"'people'"+')">Krediiti <strong>'+
      esc(credit()===Infinity?'∞':String(Math.max(0,credit())))+'</strong></button>';
    return '<div class="tl-page"><header class="tl-page-header"><div><h1>Treeningud</h1><p>'+
      (trainer?'Treeninguajad, osalejad ja WOD-id ühes kohas.':'Vali sobiv aeg ja vaata, kes on registreerunud.')+
      '</p></div>'+tools+'</header>'+(trainer?trainerTools():'')+
      '<div class="tl-segment" role="group" aria-label="Treeningute filter">'+
      '<button type="button" class="'+(!past?'on':'')+'" aria-pressed="'+(!past)+'" onclick="setTrainingTab('+"'upcoming'"+')">Tulevased <span>'+future.length+'</span></button>'+
      '<button type="button" class="'+(past?'on':'')+'" aria-pressed="'+past+'" onclick="setTrainingTab('+"'past'"+')">Möödunud <span>'+completed.length+'</span></button></div>'+
      '<div class="tl-groups">'+grouped(list,past,trainer)+'</div></div>';
  }
  async function quickRegister(id){
    const n=Number(id);
    if(!Number.isSafeInteger(n)||n<=0||busy.has(n))return;
    const t=s.trainings.find(x=>Number(x.id)===n);
    if(window.isTrainer()||!t||t.status!=='published'||new Date(t.starts_at).getTime()<=Date.now()||mine(t)||credit()<=0)return;
    busy.add(n);
    const buttons=[...document.querySelectorAll('button[data-register-id="'+n+'"]')];
    const originals=buttons.map(button=>button.innerHTML);
    buttons.forEach(button=>{button.disabled=true;button.textContent='Registreerin…';});
    try{await window.registerTraining(n)}
    finally{busy.delete(n);buttons.forEach((button,i)=>{if(button.isConnected){button.disabled=false;button.innerHTML=originals[i]}})}
  }
  window.renderTrainings=render;
  window.crossfitTrainingList={render,card,quickRegister,counts};
})();