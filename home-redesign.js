'use strict';

/* CrossFit avaleht 2026: asendab ainult esitlusvaate.
 * Treeningule registreerimine, krediidiarvestus ja WOD-pank jäävad seniste funktsioonide hooleks.
 * Laadida viimase laiendusena, pärast credit-system.js ja pro-features.js.
 */
(function(){
  const s=window.state;
  if(!s || typeof window.upcomingTrainings!=='function' || typeof window.renderHome!=='function') return;

  const svg={
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    credit:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h5"/></svg>',
    people:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.6-4 2.4-6 5.5-6s4.9 2 5.5 6M14.5 14.5c2.8 0 4.8 1.6 5.5 5.5"/></svg>',
    right:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',
    bank:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>',
    repeat:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
    clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  const escapeText=value=>window.esc(value);
  const numericId=t=>Number(t.id);
  const displayDate=iso=>window.fullDateTime(iso);
  const shortDate=iso=>window.dateTime(iso);
  const seatCount=t=>{
    const capacity=Math.max(0,Number(t.capacity)||0);
    const taken=window.confirmedFor(t.id).length;
    return {capacity,taken,free:Math.max(0,capacity-taken)};
  };
  function booking(t){
    const uid=s.session?.user?.id;
    return s.registrations.find(r=>r.user_id===uid&&r.training_id===t.id&&
      (r.status==='confirmed'||r.status==='waitlist'))||null;
  }
  function userBalance(){
    return Number(window.totalCredits?.()??0);
  }
  function balanceText(){
    const amount=userBalance();
    return amount===Infinity?'∞':Math.max(0,amount).toLocaleString('et-EE');
  }
  const titleFor=t=>escapeText(t.title||'CrossFit');
  function statusBadge(t){
    const {free}=seatCount(t),mine=booking(t);
    if(mine?.status==='confirmed')return '<span class="home-status home-status-booked">Registreeritud</span>';
    if(mine?.status==='waitlist')return '<span class="home-status home-status-waiting">Ootenimekirjas</span>';
    return free>0
      ?'<span class="home-status home-status-available">'+free+' vaba kohta</span>'
      :'<span class="home-status home-status-waiting">Kohad täis</span>';
  }

  // Registreerumise juures on teadlikult üks otsene tegevus, kuid
  // olemasoleva RPC krediidi- ja ootenimekirjareegleid ei muudeta.
  function mainAction(t){
    const id=numericId(t),mine=booking(t),free=seatCount(t).free,credits=userBalance();
    if(mine)return '<button type="button" class="home-primary-cta" onclick="openTraining('+id+')">'+
      (mine.status==='waitlist'?'Vaata ootenimekirja kohta':'Vaata oma registreeringut')+svg.right+'</button>';
    if(credits<=0)return '<button type="button" class="home-primary-cta" onclick="go('+"'people'"+')">Vaata treeningkrediiti'+svg.right+'</button>';
    return '<button type="button" class="home-primary-cta" onclick="registerTraining('+id+')">'+
      (free>0?'Registreeru treeningule':'Liitu ootenimekirjaga')+svg.right+'</button>';
  }
  function sessionHero(t,trainer=false){
    if(!t){
      return '<section class="home-feature-card home-feature-empty">'+
        '<div class="home-eyebrow">'+(trainer?'JÄRGMINE TREENING':'UUS TREENING')+'</div>'+
        '<h2>Treeninguid pole hetkel lisatud</h2>'+
        '<p>'+(trainer?'Lisa uus treening, et inimesed saaksid registreeruda.':'Kui treener lisab treeninguaja, näed seda siin.')+'</p>'+
        '<button type="button" class="home-primary-cta" onclick="'+
          (trainer?'openTrainingForm()':'go('+"'trainings'"+')')+'">'+
          (trainer?'Lisa treening':'Vaata treeninguid')+svg.right+'</button>'+
      '</section>';
    }
    const seats=seatCount(t),mine=booking(t),id=numericId(t);
    const duration=Math.max(0,Number(t.duration_minutes)||0);
    const info=trainer?'<span>'+svg.people+seats.taken+' / '+seats.capacity+' registreerunud</span>'
      :'<span>'+svg.people+seats.free+' '+(seats.free===1?'vaba koht':'vaba kohta')+'</span>';
    return '<section class="home-feature-card">'+
      '<div class="home-feature-top"><span class="home-eyebrow">'+
        (trainer?'JÄRGMINE TREENING':mine?'SINU TREENING':'JÄRGMINE TREENINGUAEG')+
        '</span>'+statusBadge(t)+'</div>'+
      '<div class="home-date-label">'+escapeText(displayDate(t.starts_at))+'</div>'+
      '<h2>'+titleFor(t)+'</h2>'+
      '<div class="home-feature-meta">'+info+(duration?'<span>'+svg.clock+duration+' min</span>':'')+'</div>'+
      (trainer?'<button type="button" class="home-primary-cta" onclick="openTraining('+id+')">Ava treening'+svg.right+'</button>':mainAction(t))+
      (!trainer&&!mine&&userBalance()<=0?'<p class="home-hero-hint">Registreerumiseks vajaliku krediidi lisab treener.</p>':'')+
    '</section>';
  }
  function smallMetric(icon,label,value,details,action){
    return '<button type="button" class="home-stat-card" onclick="'+action+'">'+
      '<span class="home-stat-icon">'+icon+'</span>'+
      '<span class="home-stat-label">'+label+'</span>'+
      '<strong>'+value+'</strong>'+
      '<span class="home-stat-detail">'+details+'</span>'+
    '</button>';
  }
  function sessionRow(t){
    const id=numericId(t),seats=seatCount(t);
    return '<button type="button" class="home-upcoming-row" onclick="openTraining('+id+')">'+
      '<span class="home-upcoming-date">'+svg.calendar+'</span>'+
      '<span class="home-upcoming-description"><strong>'+titleFor(t)+'</strong>'+
      '<small>'+escapeText(shortDate(t.starts_at))+'</small></span>'+
      '<span class="home-upcoming-right">'+statusBadge(t)+svg.right+'</span>'+
    '</button>';
  }

  function clientHome(){
    const future=window.upcomingTrainings();
    const uid=s.session?.user?.id;
    const nextBooked=future.find(t=>s.registrations.some(r=>r.user_id===uid&&r.training_id===t.id&&r.status==='confirmed'));
    // Too fookusesse järgmine registreerimata aeg; kui kõik ajad on
    // juba broneeritud, näita järgmise treeningu registreeringut.
    const openSpot=future.find(t=>!booking(t)&&seatCount(t).free>0);
    const availableToBook=openSpot||future.find(t=>!booking(t));
    const spotlight=availableToBook||future[0]||null;
    const later=future.filter(t=>t.id!==spotlight?.id).slice(0,3);
    const credits=userBalance();
    const name=String(s.profile?.display_name||'').trim().split(/\s+/)[0]||'Treenija';

    return '<div class="home-dashboard home-dashboard-client">'+
      '<div class="home-welcome"><div><span class="home-welcome-kicker">SINU CROSSFIT</span>'+
      '<h1>Tere, '+escapeText(name)+'!</h1>'+
      '<p>Vali sobiv treeninguaeg ja hoia oma registreeringutel silm peal.</p></div></div>'+
      (credits<=0?'<div class="home-credit-alert"><strong>Treeningkrediit on otsas</strong><span>Uue treeningkrediidi lisamiseks võta ühendust treeneriga.</span></div>':'')+
      sessionHero(spotlight)+
      '<div class="home-quick-stats">'+
        smallMetric(svg.credit,'Krediidijääk',balanceText(),'treeningkorda alles',"go('people')")+
        smallMetric(svg.calendar,'Minu järgmine',nextBooked?escapeText(new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',day:'numeric',month:'short'}).format(new Date(nextBooked.starts_at))):'—',
          nextBooked?escapeText(new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',hour:'2-digit',minute:'2-digit'}).format(new Date(nextBooked.starts_at))):'Pole broneeringuid',
          nextBooked?'openTraining('+numericId(nextBooked)+')':"go('trainings')")+
      '</div>'+
      '<section class="home-more-trainings">'+
        '<div class="home-section-header"><h2>Järgmised treeningud</h2><button type="button" onclick="go('+"'trainings'"+')">Vaata kõiki '+svg.right+'</button></div>'+
        (later.length?'<div class="home-upcoming-list">'+later.map(sessionRow).join('')+'</div>':
          '<div class="home-empty-small">Rohkem tulevasi treeninguid pole praegu lisatud.</div>')+
      '</section>'+
    '</div>';
  }

  function trainerHome(){
    const future=window.upcomingTrainings();
    const next=future[0]||null;
    const removed=new Set((s.removedClients||[]).map(x=>x.user_id));
    const clients=s.profiles.filter(p=>p.role==='client'&&!removed.has(p.user_id));
    const credits=uid=>Math.max(0,Number(s.wallets.find(w=>w.user_id===uid)?.credits||0));
    const lowCredit=clients.filter(p=>credits(p.user_id)<=2).length;
    const waitlisted=s.registrations.filter(r=>r.status==='waitlist'&&future.some(t=>t.id===r.training_id)).length;
    const other=future.slice(1,4);
    return '<div class="home-dashboard home-dashboard-trainer">'+
      '<div class="home-welcome"><div><span class="home-welcome-kicker">TREENINGUTE HALDUS</span>'+
      '<h1>Ülevaade</h1><p>Järgmised treeningud ja olulised tegevused ühes kohas.</p></div></div>'+
      sessionHero(next,true)+
      '<div class="home-trainer-stats">'+
        smallMetric(svg.people,'Aktiivseid kliente',String(clients.length),'kliendikaardid',"go('people')")+
        smallMetric(svg.calendar,'Ootenimekirjas',String(waitlisted),'registreeringut',"go('trainings')")+
        smallMetric(svg.credit,'Vähe krediiti',String(lowCredit),'0–2 treeningkorda',"go('people')")+
      '</div>'+
      '<section class="home-trainer-actions">'+
        '<div class="home-section-header"><h2>Kiirtoimingud</h2></div>'+
        '<div class="home-action-grid">'+
          '<button type="button" onclick="openTrainingForm()">'+svg.plus+'<span>Lisa treening</span></button>'+
          '<button type="button" onclick="copyLatestTraining()">'+svg.repeat+'<span>Kopeeri eelmine</span></button>'+
          '<button type="button" onclick="openWodBank()">'+svg.bank+'<span>WOD-pank</span></button>'+
          '<button type="button" onclick="go('+"'people'"+')">'+svg.people+'<span>Halda kliente</span></button>'+
        '</div>'+
      '</section>'+
      '<section class="home-more-trainings">'+
        '<div class="home-section-header"><h2>Tulevased treeningud</h2><button type="button" onclick="go('+"'trainings'"+')">Vaata kõiki '+svg.right+'</button></div>'+
        (other.length?'<div class="home-upcoming-list">'+other.map(sessionRow).join('')+'</div>':
          '<div class="home-empty-small">Rohkem tulevasi treeninguid pole lisatud.</div>')+
      '</section>'+
    '</div>';
  }

  window.renderHome=function(){
    return window.isTrainer()?trainerHome():clientHome();
  };
  window.crossfitHome={seatCount,booking,clientHome,trainerHome};
})();