'use strict';

/* 12. samm: treeneri juhtpaneel.
 * Ainult kuvamine ja suunamine olemasolevatele treeningu- ja krediiditoimingutele.
 * Ei loo ega muuda andmebaasiridu ning ei mõjuta WOD-fotode ülevaatamist.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.renderHome!=='function'||typeof window.upcomingTrainings!=='function')return;
  const oldHome=window.renderHome;
  const esc=value=>window.esc(value);
  const TZN='Europe/Tallinn';
  const when=new Intl.DateTimeFormat('et-EE',{timeZone:TZN,weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
  const shortWhen=new Intl.DateTimeFormat('et-EE',{timeZone:TZN,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const dateNow=new Intl.DateTimeFormat('et-EE',{timeZone:TZN,weekday:'long',day:'numeric',month:'long'});
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const icons={
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    users:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.5-4 2.6-6 6-6s5.5 2 6 6M14.5 14.2c2.9-.1 5.2 1.8 5.7 5.8"/></svg>',
    credit:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h6"/></svg>',
    time:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    file:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',
    copy:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
    alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>'
  };
  function safeId(id){
    const n=Number(id);
    return Number.isSafeInteger(n)&&n>0?n:null;
  }
  function clients(){
    const removed=new Set((s.removedClients||[]).map(p=>p.user_id));
    return (s.profiles||[]).filter(p=>p.role==='client'&&!removed.has(p.user_id));
  }
  function available(uid){
    const n=Number(window.totalCredits(uid));
    return n===Infinity?Infinity:Math.max(0,Number.isFinite(n)?n:0);
  }
  function creditShort(n){return n===Infinity?'∞':String(n)}
  function registerCounts(t){
    const regs=(s.registrations||[]).filter(r=>Number(r.training_id)===Number(t.id));
    const confirmed=regs.filter(r=>r.status==='confirmed');
    const wait=regs.filter(r=>r.status==='waitlist').sort((a,b)=>Date.parse(a.created_at||0)-Date.parse(b.created_at||0)||Number(a.id||0)-Number(b.id||0));
    const cap=Math.max(0,Number(t.capacity)||0);
    return {confirmed,wait,cap,free:Math.max(0,cap-confirmed.length),used:confirmed.length};
  }
  function incoming(){return window.upcomingTrainings()}
  function fmt(value,format){
    const dt=new Date(value);
    return Number.isFinite(dt.getTime())?format.format(dt):'Kuupäev puudub';
  }
  function avatar(uid){
    if(window.crossfitAvatars?.html)return window.crossfitAvatars.html(uid,'small');
    const name=String(window.pname?.(uid)||'Kasutaja');
    return '<span class="tb-initial-avatar">'+esc(name.trim().slice(0,1).toLocaleUpperCase('et')||'?')+'</span>';
  }
  function summaryItem(label,value,icon,action,detail,accent=''){
    return '<button type="button" class="tb-stat '+accent+'" onclick="'+action+'">'+
      '<span class="tb-stat-icon">'+icon+'</span><span class="tb-stat-name">'+label+'</span>'+
      '<strong>'+value+'</strong><small>'+detail+'</small></button>';
  }
  function header(){
    const name=String(s.profile?.display_name||'').trim().split(/\s+/)[0]||'treener';
    return '<div class="tb-header"><span class="tb-eyebrow">TREENINGUTE ÜLEVAADE</span>'+
      '<h1>Tere, '+esc(name)+'!</h1><p>'+esc(fmt(new Date(),dateNow))+' · Olulised tegevused ja treeningud ühes kohas.</p></div>';
  }
  function stats(future,low,waiting,bank){
    const horizon=Date.now()+7*86400000;
    const next7=future.filter(t=>Date.parse(t.starts_at)<horizon).length;
    return '<div class="tb-stats" aria-label="Treeneri põhinäitajad">'+
      summaryItem('7 päeva trennid',String(next7),icons.calendar,"go('trainings')",'tulevast treeningut')+
      summaryItem('Ootenimekirjas',String(waiting),icons.users,"crossfitTrainerDashboard.scrollTo('tbWaitlist')",'tulevast registreeringut',waiting?'warn':'')+
      summaryItem('Vähe krediiti',String(low),icons.credit,"crossfitTrainerDashboard.scrollTo('tbLowCredits')",'0–2 treeningkorda',low?'warn':'')+
      summaryItem('WOD ülevaatus',bank===null?'—':String(bank),icons.file,'openWodBank()',
        bank===null?'ava WOD-pank':'kinnitamata kirjet',bank?'warn':'')+
    '</div>';
  }
  function nextTraining(future){
    const t=future[0];
    if(!t)return '<section class="tb-next tb-next-empty"><span class="tb-next-kicker">JÄRGMINE TREENING</span>'+
      '<h2>Tulevasi treeninguid pole lisatud</h2><p>Loo uus treeninguaeg ja ava klientidele registreerimine.</p>'+
      '<button type="button" class="tb-next-action" onclick="openTrainingForm()">Lisa treening '+icons.arrow+'</button></section>';
    const id=safeId(t.id),c=registerCounts(t);
    const percent=c.cap?Math.min(100,Math.round(c.used/c.cap*100)):0;
    const people=c.confirmed.slice(0,4).map(r=>avatar(r.user_id)).join('');
    return '<section class="tb-next">'+
      '<div class="tb-next-top"><span class="tb-next-kicker">JÄRGMINE TREENING</span>'+
        '<span class="tb-next-status">'+(c.free>0?c.free+' vaba kohta':'Kohad täis')+'</span></div>'+
      '<div class="tb-next-date">'+esc(fmt(t.starts_at,when))+'</div>'+
      '<h2>'+esc(t.title||'CrossFit WOD')+'</h2>'+
      '<div class="tb-next-facts"><span>'+icons.users+c.used+'/'+c.cap+' registreerunud</span>'+
        (Number(t.duration_minutes)>0?'<span>'+icons.time+Number(t.duration_minutes)+' min</span>':'')+
        (c.wait.length?'<span>'+c.wait.length+' ootenimekirjas</span>':'')+'</div>'+
      '<div class="tb-next-bar" role="meter" aria-label="Treeningu täituvus" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><span style="width:'+percent+'%"></span></div>'+
      (c.confirmed.length?'<div class="tb-next-attendees">'+people+
        '<small>Registreerunud'+(c.used>4?' (+'+(c.used-4)+' veel)':'')+'</small></div>':'<p class="tb-next-no-people">Registreerunuid veel ei ole</p>')+
      (id?'<button type="button" class="tb-next-action" onclick="openTraining('+id+')">Vaata osalejaid ja halda '+icons.arrow+'</button>':'')+
      '</section>';
  }
  function alertRow(t,c){
    const id=safeId(t.id);if(!id)return '';
    return '<button type="button" class="tb-wait-row" onclick="openTraining('+id+')">'+
      '<span class="tb-wait-icon">'+icons.users+'</span>'+
      '<span class="tb-wait-text"><strong>'+esc(t.title||'CrossFit')+'</strong>'+
      '<small>'+esc(fmt(t.starts_at,shortWhen))+'</small></span>'+
      '<span class="tb-wait-num">'+c.wait.length+' ootel</span>'+icons.arrow+'</button>';
  }
  function waitlists(future){
    const rows=future.map(t=>({t,c:registerCounts(t)})).filter(x=>x.c.wait.length).sort((a,b)=>Date.parse(a.t.starts_at)-Date.parse(b.t.starts_at));
    return '<section class="tb-section" id="tbWaitlist"><div class="tb-section-title"><h2>Ootenimekirjad</h2>'+
      '<span class="tb-section-total">'+rows.reduce((n,x)=>n+x.c.wait.length,0)+'</span></div>'+
      (rows.length?'<div class="tb-wait-list">'+rows.slice(0,4).map(x=>alertRow(x.t,x.c)).join('')+'</div>'+
        (rows.length>4?'<p class="tb-more-note">Kuvatud 4 lähimat. Kõiki näed treeningute alt.</p>':''):
        '<div class="tb-empty">Praegu ei ole tulevastes treeningutes ootenimekirja.</div>')+
      '</section>';
  }
  function creditRow(p){
    if(!uuid.test(String(p.user_id||'')))return '';
    const qty=available(p.user_id);
    return '<div class="tb-credit-row">'+avatar(p.user_id)+
      '<div class="tb-credit-person"><strong>'+esc(p.display_name||'Kasutaja')+'</strong>'+
        '<small>'+(qty===0?'Krediit otsas':'Alles '+creditShort(qty)+' treeningkorda')+'</small></div>'+
      '<span class="tb-credit-count '+(qty===0?'zero':'low')+'">'+creditShort(qty)+'</span>'+
      '<button type="button" class="tb-credit-add" onclick="openAddCredits(&quot;'+p.user_id+'&quot;)">Lisa</button></div>';
  }
  function lowCredits(list){
    const items=list.filter(p=>available(p.user_id)<=2)
      .sort((a,b)=>available(a.user_id)-available(b.user_id)||String(a.display_name||'').localeCompare(String(b.display_name||''),'et'));
    const zero=items.filter(p=>available(p.user_id)===0).length;
    return '<section class="tb-section" id="tbLowCredits"><div class="tb-section-title"><h2>Kliendid: vähe krediiti</h2>'+
      '<span class="tb-section-total">'+items.length+'</span></div>'+
      (items.length?'<p class="tb-section-sub">'+zero+' kliendil on krediit otsas.</p>'+
        '<div class="tb-credit-list">'+items.slice(0,4).map(creditRow).join('')+'</div>'+
        (items.length>4?'<p class="tb-more-note">Näidatud 4 klienti '+items.length+'-st.</p>':''):
        '<div class="tb-empty">Kõigil klientidel on vähemalt 3 treeningkorda või piiramatu pakett.</div>')+
      '<button type="button" class="tb-inline-link" onclick="go('+"'people'"+')">Ava kõik kliendid '+icons.arrow+'</button></section>';
  }
  function shortcuts(){
    const actions=[
      [icons.plus,'Lisa treening','openTrainingForm()'],
      [icons.copy,'Kopeeri eelmine','copyLatestTraining()'],
      [icons.file,'WOD-pank','openWodBank()'],
      [icons.users,'Halda kliente',"go('people')"]
    ];
    return '<section class="tb-section"><div class="tb-section-title"><h2>Kiirtoimingud</h2></div>'+
      '<div class="tb-shortcuts">'+actions.map(([icon,name,action])=>'<button type="button" onclick="'+action+'">'+icon+
      '<span>'+name+'</span></button>').join('')+'</div></section>';
  }
  function upcoming(future){
    const items=future.slice(1,5);
    return '<section class="tb-section"><div class="tb-section-title"><h2>Järgmised treeninguajad</h2>'+
      '<button type="button" class="tb-inline-link" onclick="go('+"'trainings'"+')">Kõik treeningud '+icons.arrow+'</button></div>'+
      (items.length?'<div class="tb-upcoming-list">'+items.map(t=>{
        const id=safeId(t.id),c=registerCounts(t);
        return '<button type="button" class="tb-upcoming-row" onclick="'+(id?'openTraining('+id+')':"go('trainings')")+'">'+
          '<span class="tb-upcoming-icon">'+icons.calendar+'</span>'+
          '<span class="tb-upcoming-main"><strong>'+esc(t.title||'CrossFit')+'</strong><small>'+
            esc(fmt(t.starts_at,shortWhen))+'</small></span>'+
          '<span class="tb-upcoming-meta">'+c.used+'/'+c.cap+' kohta'+(c.wait.length?' · '+c.wait.length+' ootel':'')+'</span>'+
          icons.arrow+'</button>';
      }).join('')+'</div>':'<div class="tb-empty">Rohkem tulevasi treeninguid pole hetkel lisatud.</div>')+'</section>';
  }
  function wodCount(){
    if(!Array.isArray(s.wodBank))return null;
    return s.wodBank.filter(w=>w.status==='review').length;
  }
  function dashboard(){
    const future=incoming(),active=clients();
    const low=active.filter(p=>available(p.user_id)<=2).length;
    const totalWait=future.reduce((n,t)=>n+registerCounts(t).wait.length,0);
    return '<div class="tb-dashboard">'+header()+stats(future,low,totalWait,wodCount())+
      nextTraining(future)+shortcuts()+waitlists(future)+lowCredits(active)+upcoming(future)+'</div>';
  }
  function scrollToId(id){
    const element=document.getElementById(id);
    if(element)element.scrollIntoView({behavior:'smooth',block:'start'});
    else window.go('trainings');
  }
  window.renderHome=function(){return window.isTrainer()?dashboard():oldHome()};
  window.crossfitTrainerDashboard={dashboard,scrollTo:scrollToId,registerCounts,clients,available};
})();