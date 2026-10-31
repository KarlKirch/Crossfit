'use strict';

/* 10. samm – lihtne Minu konto.
 * Asendab üksnes kliendi profiilivaate, ilma andmeid või krediiditehinguid muutmata.
 */
(function(){
  const s=window.state;
  if(!s || typeof window.renderMine!=='function')return;

  const previousRenderMine=window.renderMine;
  const esc=value=>window.esc(value);
  const icons={
    edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    wallet:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h5"/></svg>',
    history:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8M10 20h4"/></svg>',
    share:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.6 6.6-4m-6.6 6.8 6.6 4"/></svg>',
    info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
    logout:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5m4-11 4 4-4 4m4-4H9"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5 11-11"/></svg>'
  };

  function currentId(){return s.session?.user?.id||''}
  function validTrainingId(value){
    const n=Number(value);
    return Number.isSafeInteger(n)&&n>0?n:null;
  }
  function localDate(iso){
    const dt=new Date(iso);
    if(!Number.isFinite(dt.getTime()))return 'Kuupäev puudub';
    return new Intl.DateTimeFormat('et-EE',{
      timeZone:'Europe/Tallinn',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
    }).format(dt);
  }
  function onlyDate(iso){
    const dt=new Date(iso);
    if(!Number.isFinite(dt.getTime()))return '—';
    return new Intl.DateTimeFormat('et-EE',{
      timeZone:'Europe/Tallinn',day:'numeric',month:'short',year:'numeric'
    }).format(dt);
  }
  function credits(){
    const number=Number(window.totalCredits?.()??0);
    return Number.isNaN(number)?0:number;
  }
  function creditText(amount){
    return amount===Infinity?'∞':String(Math.max(0,amount));
  }
  function registrations(){
    const uid=currentId(),currentTime=Date.now();
    const trainingsById=new Map((s.trainings||[]).map(t=>[Number(t.id),t]));
    const past=[],future=[];
    for(const r of (s.registrations||[])){
      if(r.user_id!==uid)continue;
      const t=trainingsById.get(Number(r.training_id));
      if(!t)continue;
      const item={registration:r,training:t};
      const futureSession=Number.isFinite(Date.parse(t.starts_at))&&Date.parse(t.starts_at)>currentTime&&t.status==='published';
      if(futureSession&&(r.status==='confirmed'||r.status==='waitlist'))future.push(item);
      else past.push(item);
    }
    future.sort((a,b)=>new Date(a.training.starts_at)-new Date(b.training.starts_at));
    past.sort((a,b)=>new Date(b.training.starts_at)-new Date(a.training.starts_at));
    return {future,past};
  }
  function avatar(){
    const uid=currentId();
    if(window.crossfitAvatars?.html)return window.crossfitAvatars.html(uid,'large');
    const initials=String(s.profile?.display_name||'Kasutaja')
      .trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toLocaleUpperCase('et');
    return '<span class="cf-avatar cf-avatar-large"><span class="cf-avatar-initials">'+esc(initials||'?')+'</span></span>';
  }
  function topProfile(){
    const name=String(s.profile?.display_name||'Kasutaja');
    const email=String(s.session?.user?.email||'');
    const hasPhoto=!!s.profile?.avatar_path;
    return '<section class="my-profile-card" aria-label="Minu profiil">'+
      '<div class="my-profile-main">'+avatar()+
      '<div class="my-profile-identity"><span class="my-label">MINU KONTO</span>'+
      '<h1>'+esc(name)+'</h1><p>'+esc(email)+'</p></div></div>'+
      '<button type="button" class="my-profile-edit" onclick="openProfileEdit()">'+icons.edit+
      (hasPhoto?'Muuda profiili ja fotot':'Lisa profiilipilt või muuda profiili')+'</button>'+
    '</section>';
  }
  function creditCard(amount){
    const uid=currentId();
    const waiting=(s.registrations||[]).filter(r=>r.user_id===uid&&r.status==='waitlist'&&
      s.trainings.some(t=>Number(t.id)===Number(r.training_id)&&t.status==='published'&&Date.parse(t.starts_at)>Date.now())).length;
    return '<section class="my-credit-card" aria-label="Treeningkrediit">'+
      '<div class="my-credit-top"><span>'+icons.wallet+' TREENINGKREDIIT</span>'+
      '<span class="my-credit-indicator">'+(amount>0?'Aktiivne':'Täiendamist vajav')+'</span></div>'+
      '<div class="my-credit-amount"><strong>'+creditText(amount)+'</strong>'+
      '<div><b>'+(amount===1?'treeningkord':'treeningkorda')+' alles</b>'+
      '<span>Üks kinnitatud registreering kasutab ühe krediidi.</span></div></div>'+
      (amount<=0?'<p class="my-credit-notice">Krediidi saamiseks võta ühendust treeneriga. Äpis ei saa praegu maksta.</p>':'')+
      '<button type="button" class="my-credit-help-link" onclick="openCreditHelp()">Kuidas krediiti saada? '+icons.chevron+'</button>'+
      (waiting?'<p class="my-credit-wait-note">'+waiting+' tulevast ootenimekirja registreeringut. Krediit arvestatakse alles koha saamisel.</p>':'')+
      '<button type="button" class="my-credit-history-link" onclick="crossfitMyAccount.showCreditHistory()">'+
      'Vaata krediidi ajalugu '+icons.chevron+'</button></section>';
  }
  function status(reg,t){
    if(t.status==='cancelled')return ['Tühistatud','cancelled'];
    if(reg.status==='cancelled')return [reg.cancelled_late?'Hiline tühistus':'Tühistatud','cancelled'];
    if(reg.status==='waitlist')return ['Ootenimekirjas','waiting'];
    if(reg.status==='confirmed')return ['Registreeritud','booked'];
    return [String(reg.status||'Olek puudub'),'neutral'];
  }
  function bookingCard(item,history=false){
    const {training:t,registration:r}=item;
    const id=validTrainingId(t.id);
    if(id===null)return '';
    const [label,color]=status(r,t);
    const description=history?(r.status==='confirmed'&&t.status!=='cancelled'?'Toimunud treening':'Registreeringu ajalugu'):
      (r.status==='waitlist'?'Krediit arvestatakse koha saamisel':'Treeningukoht kinnitatud');
    return '<button class="my-booking-row" type="button" onclick="openTraining('+id+')">'+
      '<span class="my-booking-icon">'+icons.calendar+'</span>'+
      '<span class="my-booking-main"><strong>'+esc(t.title||'CrossFit')+'</strong>'+
      '<small>'+esc(localDate(t.starts_at))+'</small>'+
      '<span class="my-booking-description">'+description+'</span></span>'+
      '<span class="my-booking-side"><span class="my-pill my-pill-'+color+'">'+esc(label)+'</span>'+icons.chevron+'</span>'+
      '</button>';
  }
  function bookingSection(future){
    return '<section class="my-section"><div class="my-section-heading"><h2>Tulevased registreeringud</h2>'+
      '<span class="my-count">'+future.length+'</span></div>'+
      (future.length?'<div class="my-booking-list">'+future.slice(0,10).map(x=>bookingCard(x)).join('')+'</div>'+
      (future.length>10?'<p class="my-section-note">Kuvatud 10 lähimat registreeringut.</p>':''):
      '<div class="my-empty"><strong>Sul ei ole tulevasi registreeringuid.</strong>'+
      '<span>Leia endale sobiv treening ja registreeru.</span>'+
      '<button class="btn btn-primary" type="button" onclick="go('+"'trainings'"+')">Vaata treeninguid</button></div>')+
      '</section>';
  }
  function oldBookings(past){
    return '<details class="my-collapsible" id="myPastBookings"><summary>'+icons.history+
      '<span><strong>Treeningute ajalugu</strong><small>Varasemad ja tühistatud registreeringud</small></span>'+
      '<span class="my-count">'+past.length+'</span>'+icons.chevron+'</summary>'+
      '<div class="my-details-inner">'+(past.length?
       '<div class="my-booking-list">'+past.slice(0,20).map(item=>bookingCard(item,true)).join('')+'</div>'+
       (past.length>20?'<p class="my-section-note">Kuvatud 20 viimast registreeringut.</p>':''):
       '<p class="my-section-note">Treeningute ajalugu on veel tühi.</p>')+'</div></details>';
  }
  function transactionSection(){
    const transactions=(s.creditTransactions||[]).filter(x=>x.user_id===currentId())
      .slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const rows=transactions.slice(0,30).map(item=>{
      const delta=Number(item.delta)||0,creditDelta=delta>0?'+'+delta:String(delta);
      const reason=String(item.reason||'Treeningkrediidi muudatus');
      const sum=Number(item.amount_cents)||0;
      const type=delta>0&&/^tagastus/i.test(reason)?'Tagastatud':
        delta>0?'Lisatud':delta<0?'Maha arvestatud':'Korrigeeritud';
      return '<div class="my-transaction"><span class="my-transaction-badge '+(delta>=0?'positive':'negative')+'">'+esc(creditDelta)+'</span>'+
        '<span class="my-transaction-main"><span class="my-transaction-kind">'+type+'</span><strong>'+esc(reason)+'</strong>'+
        '<small>'+esc(onlyDate(item.created_at))+
        (sum>0?' · sularaha '+(sum/100).toFixed(2).replace('.',',')+' €':'')+'</small></span>'+
      '</div>';
    }).join('');
    return '<details class="my-collapsible" id="myCreditHistory"><summary>'+icons.wallet+
      '<span><strong>Krediidi ajalugu</strong><small>Lisamised, kasutamised ja tagastused</small></span>'+
      '<span class="my-count">'+transactions.length+'</span>'+icons.chevron+'</summary>'+
      '<div class="my-details-inner">'+(rows?'<div class="my-transaction-list">'+rows+'</div>'+
      (transactions.length>30?'<p class="my-section-note">Kuvatud 30 viimast tehingut.</p>':''):
      '<p class="my-section-note">Krediiditehinguid veel ei ole.</p>')+'</div></details>';
  }
  function menuRow(svg,label,description,action){
    return '<button type="button" class="my-settings-row" onclick="'+action+'"><span class="my-settings-icon">'+svg+'</span>'+
      '<span><strong>'+label+'</strong><small>'+description+'</small></span>'+icons.chevron+'</button>';
  }
  function settings(){
    const install=window.crossfitInstall?.installed?.()?'':
      menuRow(icons.calendar,'Paigalda rakendus','Lisa CrossFit telefoni avakuvale','installApp()');
    return '<details class="my-collapsible my-settings" id="myAccountSettings"><summary>'+icons.edit+
      '<span><strong>Konto ja seaded</strong><small>Teavitused, jagamine ja rakenduse haldus</small></span>'+icons.chevron+'</summary>'+
      '<div class="my-details-inner">'+
      menuRow(icons.edit,'Muuda profiili','Nimi ja profiilipilt','openProfileEdit()')+
      menuRow(icons.bell,'Teavitused','Vaata treeningute teateid',"go('notifications')")+
      (window.crossfitNotifications?.pushSettings?.()||'')+
      menuRow(icons.share,'Kutsu sõber','Jaga CrossFiti linki','openShare()')+
      install+
      menuRow(icons.info,'Rakenduse info','Versioon ja kasutustingimused','openInfo()')+
      menuRow(icons.logout,'Logi välja','Lõpeta selle seadme seanss','logout()')+
      '</div></details>';
  }
  function render(){
    if(window.isTrainer())return previousRenderMine();
    const amount=credits();
    const {future,past}=registrations();
    return '<div class="my-account-page">'+topProfile()+creditCard(amount)+
      bookingSection(future)+oldBookings(past)+transactionSection()+settings()+'</div>';
  }
  function showCreditHistory(){
    const detail=document.getElementById('myCreditHistory');
    if(detail){
      detail.open=true;
      detail.scrollIntoView({behavior:'smooth',block:'nearest'});
      detail.querySelector('summary')?.focus();
    }
  }

  window.renderMine=render;
  window.crossfitMyAccount={render,registrations,showCreditHistory};
})();