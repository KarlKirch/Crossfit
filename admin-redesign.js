'use strict';

/* CrossFit – treeneri Haldus (13. samm).
 * Koondab olemasolevad haldustoimingud, ei muuda krediiti,
 * WOD ülevaatuse staatusi ega kasutajaõigusi.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.renderMore!=='function')return;
  const previousMore=window.renderMore;
  const esc=v=>window.esc(v);
  const ic={
    template:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    speaker:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-2l13-5v12L4 13Z"/><path d="M7 14v5h4l1-4M19 9c1 1 1 5 0 6"/></svg>',
    chart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V12M9 20V5M15 20v-9M21 20v-5M2 20h20"/></svg>',
    download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13m-4-4 4 4 4-4M5 20h14"/></svg>',
    users:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.6-3.7 2.5-6 6-6s5.4 2.3 6 6M14.5 14.2c2.8-.1 5 1.7 5.5 5.8"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8M10 20h4"/></svg>',
    avatar:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6"/></svg>',
    share:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.6 6.6-4m-6.6 6.8 6.6 4"/></svg>',
    phone:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
    info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-9.5h.01"/></svg>',
    logout:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5m4-11 4 4-4 4m4-4H9"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'
  };
  function activeClients(){
    const removed=new Set((s.removedClients||[]).map(r=>r.user_id));
    return (s.profiles||[]).filter(p=>p.role==='client'&&!removed.has(p.user_id)).length;
  }
  function completedTrainings90(){
    const end=Date.now(),start=end-90*86400000;
    return (s.trainings||[]).filter(t=>{
      const timestamp=Date.parse(t.starts_at);
      return Number.isFinite(timestamp)&&timestamp>=start&&timestamp<=end&&t.status!=='cancelled';
    }).length;
  }
  function metrics(){
    const announcements=Array.isArray(s.announcements)?s.announcements.length:0;
    return [
      {name:'Teadaandeid',value:announcements,detail:'viimaseid salvestatud',icon:ic.speaker},
      {name:'Treeninguid',value:completedTrainings90(),detail:'viimase 90 päeva jooksul',icon:ic.calendar},
      {name:'Kliente',value:activeClients(),detail:'aktiivses nimekirjas',icon:ic.users}
    ];
  }
  function statCard(item){
    return '<div class="ad-stat"><span class="ad-stat-icon">'+item.icon+'</span>'+
      '<span class="ad-stat-name">'+item.name+'</span><strong>'+item.value+'</strong>'+
      '<small>'+item.detail+'</small></div>';
  }
  function item(icon,name,description,onclick,accent=''){
    return '<button class="ad-entry '+accent+'" type="button" onclick="'+onclick+'">'+
      '<span class="ad-entry-icon">'+icon+'</span>'+
      '<span class="ad-entry-text"><strong>'+name+'</strong><small>'+description+'</small></span>'+
      '<span class="ad-entry-arrow">'+ic.chevron+'</span></button>';
  }
  function group(name,desc,items,id){
    return '<section class="ad-section"'+(id?' id="'+id+'"':'')+'><div class="ad-section-heading">'+
      '<h2>'+name+'</h2><p>'+desc+'</p></div>'+
      '<div class="ad-item-list">'+items.join('')+'</div></section>';
  }
  function profile(){
    const name=String(s.profile?.display_name||'Treener');
    const email=String(s.session?.user?.email||'');
    const uid=s.session?.user?.id;
    const avatar=window.crossfitAvatars?.html(uid,'medium')||'<span class="ad-profile-fallback">'+ic.avatar+'</span>';
    return '<div class="ad-profile">'+avatar+'<span><strong>'+esc(name)+'</strong>'+
      '<small>'+esc(email)+'</small></span><span class="ad-role">Treener</span></div>';
  }
  function render(){
    if(!window.isTrainer())return previousMore();
    const summary=metrics();
    const install=window.crossfitInstall?.installed?.()?null:
      item(ic.phone,'Paigalda rakendus','Lisa CrossFit telefoni või arvuti avakuvale','installApp()');
    return '<div class="ad-admin">'+
      '<header class="ad-heading"><span>JUHTIMINE JA SEADISTUS</span>'+
        '<h1>Haldus</h1><p>Treeningud, teavitused ja aruanded ühes kohas.</p></header>'+
      '<div class="ad-stats" aria-label="Haldusnäitajad">'+summary.map(statCard).join('')+'</div>'+
      group('Treeningute korraldus','Valmista treeningud ette ning halda kliente.',[
        item(ic.calendar,'Treeninguajad','Muuda aegu, kohti ja registreeringuid',"go('trainings')"),
        item(ic.users,'Kliendid ja krediidid','Krediidijäägid ja kliendikaardid',"go('people')")
      ])+
      group('Suhtlus','Jõua treenijateni kiiresti.',[
        item(ic.speaker,'Saada teadaanne','Kõigile või valitud treeningu osalejatele','openAnnouncement()'),
        item(ic.bell,'Teavitused','Sinu teated ja tõuketeavituste seaded',"go('notifications')")
      ])+
      group('Aruanded ja andmed','Vaata tulemusi või ekspordi andmed.',[
        item(ic.chart,'Statistika','Täituvus, osalemised ja aktiivsus viimase 90 päeva jooksul','openStats()'),
        item(ic.download,'Ekspordi andmed','Laadi kliendid, krediidid, treeningud ja teated CSV-faili','crossfitAdmin.exportData()')
      ])+
      '<p class="ad-privacy">Eksport sisaldab klientide ja registreeringute isikuandmeid. Hoia allalaaditud fail privaatsena.</p>'+
      group('Konto ja rakendus','Sinu profiil ja rakenduse kasutamine.',[
        item(ic.avatar,'Minu profiil','Muuda nime ja profiilipilti','openProfileEdit()'),
        item(ic.share,'Kutsu sõber','Jaga CrossFiti linki või QR-koodi','openShare()'),
        ...(install?[install]:[]),
        item(ic.info,'Rakenduse info','Versioon ja kasutuspõhimõtted','openInfo()'),
        item(ic.logout,'Logi välja','Lõpeta selle seadme seanss','logout()','ad-entry-danger')
      ])+
      profile()+
    '</div>';
  }
  function exportData(){
    if(!window.isTrainer())return;
    if(!window.confirm('Eksporditav CSV sisaldab klientide nimesid, krediiditehinguid ja registreeringuid. Kas soovid faili alla laadida?'))return;
    window.exportAllData();
  }
  window.renderMore=render;
  window.crossfitAdmin={render,metrics,exportData};
})();