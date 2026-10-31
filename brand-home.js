'use strict';

/* Rõuge CrossFit dark forest dashboard v1. Visual-only change:
   existing booking, credit, waitlist and WOD functions stay authoritative. */
(function(){
  const s=window.state;
  if(!s||typeof window.renderHome!=='function')return;
  const previous=window.renderHome;
  const esc=v=>window.esc(v);
  const icons={
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    dumbbell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8v8M2 10v4M19 8v8M22 10v4M5 12h14"/></svg>',
    trend:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11M10 20V7M16 20V4M22 20v-9"/></svg>',
    user:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/></svg>',
    people:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c1-4 3-6 6-6s5 2 6 6M16 7a3 3 0 1 1 0 6M17 15c3 0 5 2 5 5"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8M10 21h4"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    credit:'<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v5c0 2 3.5 3.5 8 3.5S20 12 20 10V5M4 10v6c0 2 3.5 3.5 8 3.5s8-1.5 8-3.5v-6"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>'
  };
  const eid=t=>{const n=Number(t?.id);return Number.isSafeInteger(n)&&n>0?n:null;};
  const clock=new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
  const dd=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'});
  const short=new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const now=()=>Date.now();
  const future=()=>window.upcomingTrainings().slice().sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  const confirmed=t=>(s.registrations||[]).filter(r=>Number(r.training_id)===Number(t.id)&&r.status==='confirmed');
  const waitlist=t=>(s.registrations||[]).filter(r=>Number(r.training_id)===Number(t.id)&&r.status==='waitlist');
  const available=t=>Math.max(0,Math.max(0,Number(t.capacity)||0)-confirmed(t).length);
  const myReg=t=>(s.registrations||[]).find(r=>r.user_id===s.session?.user?.id&&Number(r.training_id)===Number(t.id)&&['confirmed','waitlist'].includes(r.status));
  const credit=()=>{
    const val=Number(window.totalCredits?.()??0);
    return val===Infinity?'∞':String(Number.isFinite(val)?Math.max(0,val):0);
  };
  const attendeeCount=()=>{
    const uid=s.session?.user?.id;
    return (s.registrations||[]).filter(r=>r.user_id===uid&&r.status==='confirmed'&&
      (s.trainings||[]).some(t=>Number(t.id)===Number(r.training_id)&&t.status!=='cancelled'&&
        Date.parse(t.starts_at)<now()&&Date.parse(t.starts_at)>now()-30*86400000)).length;
  };
  function banner(trainer){
    const name=String(s.profile?.display_name||'').trim().split(/\s+/)[0]||'Treenija';
    return '<section class="rcf-brand-hero">'+
      '<img class="rcf-main-logo" src="./brand-rcf.webp" alt="Rõuge CrossFit RCF logo" width="160" height="160">'+
      '<div class="rcf-greeting"><span>Tere,</span><h1>'+esc(name)+'!</h1>'+
      '<p>'+(trainer?'Sinu treeningute juhtimiskeskus.':'Hea, et oled tagasi!')+'</p></div>'+
      '</section>';
  }
  function tile(icon,label,action,main=false){
    return '<button type="button" class="rcf-shortcut'+(main?' is-featured':'')+'" onclick="'+action+'">'+
      '<span class="rcf-shortcut-icon">'+icon+'</span><strong>'+label+'</strong></button>';
  }
  function quick(trainer){
    const items=trainer?[
      [icons.calendar,'Treeningud',"go('trainings')",true],
      [icons.dumbbell,'WOD-pank','openWodBank()',false],
      [icons.people,'Kliendid',"go('people')",false],
      [icons.user,'Haldus',"go('more')",false]
    ]:[
      [icons.calendar,'Treeningud',"go('trainings')",true]
    ];
    return '<div class="rcf-shortcuts" aria-label="Kiire navigeerimine">'+items.map(a=>tile(...a)).join('')+'</div>';
  }
  function sectionTitle(title,label,action){
    return '<div class="rcf-section-head"><h2>'+title+'</h2>'+
      (action?'<button type="button" onclick="'+action+'">'+label+' '+icons.chevron+'</button>':'')+'</div>';
  }
  function nextCard(t,trainer){
    if(!t)return '<div class="rcf-feature-card rcf-feature-empty"><span class="rcf-card-eyebrow">JÄRGMINE TREENING</span>'+
      '<h3>Treeninguid pole praegu lisatud</h3><p>'+(trainer?'Lisa järgmine treeninguaeg.':'Uued treeninguajad ilmuvad siia.')+'</p>'+
      (trainer?'<button type="button" class="rcf-green-cta" onclick="openTrainingForm()">Lisa treening '+icons.chevron+'</button>':
        '<button type="button" class="rcf-green-cta" onclick="go('+"'trainings'"+')">Vaata treeninguid '+icons.chevron+'</button>')+'</div>';
    const id=eid(t),booked=myReg(t);
    const action=trainer?'Vaata treeningut':booked?.status==='confirmed'?'Vaata oma registreeringut':
      booked?.status==='waitlist'?'Vaata ootenimekirja':'Vaata ja registreeru';
    return '<article class="rcf-feature-card">'+
      '<span class="rcf-card-eyebrow">'+(!trainer&&booked?'SINU JÄRGMINE TREENING':!trainer?'JÄRGMINE VABA TREENING':'JÄRGMINE TREENING')+'</span>'+
      '<p class="rcf-feature-date">'+esc(clock.format(new Date(t.starts_at)))+'</p>'+
      '<h3>'+esc(t.title||'CrossFit WOD')+'</h3>'+
      '<div class="rcf-feature-metrics"><span>'+icons.people+' '+confirmed(t).length+' / '+Math.max(0,Number(t.capacity)||0)+' kohta</span>'+
      '<span>'+Number(t.duration_minutes||90)+' min</span>'+
      (waitlist(t).length?'<span>'+waitlist(t).length+' ootel</span>':'')+'</div>'+
      (id?'<button type="button" class="rcf-green-cta" onclick="openTraining('+id+')">'+action+icons.chevron+'</button>':'')+
      '</article>';
  }
  function wodCard(featured){
    // Sama treening, mis kliendil avalehel esil; mitte suvaline muu päeva WOD.
    const selected=featured;
    if(!selected)return '';
    const text=String(selected.workout||'').trim();
    if(!text)return '<div class="rcf-wod-card rcf-wod-empty"><h3>Selle treeningu WOD pole veel lisatud</h3>'+
      '<p>Treener lisab kava enne treeningut. Siin näed seda kohe pärast avaldamist.</p></div>';
    const id=eid(selected);
    return '<article class="rcf-wod-card">'+
      '<span class="rcf-card-eyebrow">VALITUD TREENINGU WOD</span>'+
      '<h3>'+esc(selected.title||'CrossFit WOD')+'</h3>'+
      '<p class="rcf-wod-date">'+esc(short.format(new Date(selected.starts_at)))+'</p>'+
      '<div class="rcf-wod-content">'+esc(text)+'</div>'+
      (id?'<button type="button" class="rcf-wod-link" onclick="openTraining('+id+')">Vaata WOD-i '+icons.chevron+'</button>':'')+
      '</article>';
  }
  function metric(icon,title,value,description,action){
    return '<button type="button" class="rcf-metric-card" onclick="'+action+'">'+
      '<span class="rcf-metric-icon">'+icon+'</span>'+
      '<span class="rcf-metric-copy"><span>'+title+'</span><strong>'+value+'</strong><small>'+description+'</small></span>'+
      icons.chevron+'</button>';
  }
  function latest(futureList,featured){
    const items=futureList.filter(t=>Number(t.id)!==Number(featured?.id)).slice(0,3);
    return sectionTitle('Veel treeninguid','Vaata kõiki',"go('trainings')")+
      (items.length?'<div class="rcf-later-list">'+items.map(t=>{
        const id=eid(t);
        return '<button type="button" onclick="'+(id?'openTraining('+id+')':"go('trainings')")+'">'+
          '<span class="rcf-later-date">'+icons.calendar+'</span><span><strong>'+esc(t.title||'CrossFit')+'</strong><small>'+esc(short.format(new Date(t.starts_at)))+'</small></span>'+
          icons.chevron+'</button>';
      }).join('')+'</div>':'<div class="rcf-mini-empty">Rohkem tulevasi treeninguid pole.</div>');
  }
  function trainerStats(list){
    const active=new Set((s.removedClients||[]).map(x=>x.user_id));
    const clients=(s.profiles||[]).filter(x=>x.role==='client'&&!active.has(x.user_id));
    const low=clients.filter(c=>{
      const n=Number(window.totalCredits?.(c.user_id)??0);
      return n!==Infinity&&Number.isFinite(n)&&n<=2;
    }).length;
    const waiting=list.reduce((count,t)=>count+waitlist(t).length,0);
    return '<div class="rcf-metrics">'+
      metric(icons.people,'Kliendid',clients.length,'aktiivset klienti',"go('people')")+
      metric(icons.bell,'Ootenimekiri',waiting,'ootavat registreeringut',"go('trainings')")+
      metric(icons.credit,'Vähe krediiti',low,'0–2 treeningkorda',"go('people')")+
      '</div>';
  }
  function clientStats(){
    const uid=s.session?.user?.id;
    const pending=(s.registrations||[]).filter(r=>r.user_id===uid&&
      ['confirmed','waitlist'].includes(r.status)&&future().some(t=>Number(t.id)===Number(r.training_id))).length;
    return '<div class="rcf-metrics">'+
      metric(icons.credit,'Krediiti alles',credit(),'treeningkorda',"go('people')")+
      metric(icons.calendar,'Minu registreeringud',pending,'tulevast aega',"go('people')")+
      '</div>';
  }
  function render(){
    if(!s.profile||!s.session?.user)return previous();
    const trainer=window.isTrainer(),list=future();
    const booked=!trainer&&list.find(t=>myReg(t)?.status==='confirmed');
    const waiting=!trainer&&!booked&&list.find(t=>myReg(t)?.status==='waitlist');
    const t=trainer?list[0]||null:
      booked||waiting||list.find(t=>available(t)>0)||list[0]||null;
    const title=!trainer&&booked?'Sinu järgmine treening':
      !trainer&&waiting?'Sinu ootenimekiri':'Järgmine treening';
    const head=sectionTitle(title,'Vaata kõiki',"go('trainings')")+nextCard(t,trainer);
    const stats=trainer?trainerStats(list):clientStats();
    const wod=sectionTitle('Treeningu WOD','',null)+wodCard(t);
    if(!trainer)return '<div class="rcf-home rcf-client-home">'+head+stats+wod+latest(list,t)+'</div>';
    return '<div class="rcf-home">'+banner(true)+quick(true)+head+wod+stats+
      '<div class="rcf-admin-quick">'+tile(icons.plus,'Lisa treening','openTrainingForm()',true)+
      tile(icons.dumbbell,'WOD-pank','openWodBank()')+'</div>'+latest(list,t)+'</div>';
  }
  window.renderHome=render;
  window.rcfBrandHome={render,attendeeCount};
})();