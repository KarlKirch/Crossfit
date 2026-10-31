'use strict';

/* CrossFit: ühtne treeningu detailvaade (9. samm).
 * Ainult kasutajaliides. Registreerimine, tagastusreeglid ja
 * maksete kinnitamine toimuvad olemasolevate serverifunktsioonidega.
 */
(function(){
  const state=window.state;
  if(!state || typeof window.renderModal!=='function')return;

  const beforeModal=window.renderModal;
  const esc=v=>window.esc(v);
  const svg={
    clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    users:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.6-4 2.4-6 5.5-6s4.9 2 5.5 6M14.5 14.5c2.8 0 4.8 1.6 5.5 5.5"/></svg>',
    check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5 11-11"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    right:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    file:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>'
  };
  const validId=t=>{
    const n=Number(t?.id);
    return Number.isSafeInteger(n)&&n>0?n:null;
  };
  function safeDate(value){
    const d=new Date(value);
    return Number.isFinite(d.getTime())?window.fullDateTime(d.toISOString()):'Kuupäev puudub';
  }
  function registrants(t){
    const confirmed=window.confirmedFor(t.id)||[];
    const waitlisted=window.waitlistFor(t.id)||[];
    const capacity=Math.max(0,Number(t.capacity)||0);
    return {confirmed,waitlisted,capacity,free:Math.max(0,capacity-confirmed.length)};
  }
  function current(t){return window.mineFor(t.id)}
  function past(t){return Number.isFinite(Date.parse(t.starts_at))&&new Date(t.starts_at)<=new Date()}
  function lateCancellation(t){
    try{return window.cancellationDeadline(t)<new Date()}
    catch(_){return false}
  }
  function status(t,c,trainer){
    if(t.status==='cancelled')return '<span class="td-badge td-badge-cancelled">Tühistatud</span>';
    if(past(t))return '<span class="td-badge td-badge-neutral">Toimunud</span>';
    const reg=trainer?null:current(t);
    if(reg?.status==='confirmed')return '<span class="td-badge td-badge-booked">'+svg.check+' Registreeritud</span>';
    if(reg?.status==='waitlist')return '<span class="td-badge td-badge-waiting">Ootenimekirjas</span>';
    return c.free>0?'<span class="td-badge td-badge-free">'+c.free+' vaba kohta</span>':
      '<span class="td-badge td-badge-waiting">Kohad täis</span>';
  }
  function hero(t,c,trainer){
    const duration=Math.max(0,Number(t.duration_minutes)||0);
    const filled=c.capacity?Math.min(100,Math.round(c.confirmed.length/c.capacity*100)):0;
    return '<section class="td-hero">'+
      '<div class="td-hero-header"><span class="td-kicker">CROSSFIT TREENING</span>'+status(t,c,trainer)+'</div>'+
      '<div class="td-date">'+esc(safeDate(t.starts_at))+'</div>'+
      '<h2>'+esc(t.title||'CrossFit')+'</h2>'+
      '<div class="td-hero-facts">'+
        (duration?'<span>'+svg.clock+duration+' min</span>':'')+
        '<span>'+svg.users+c.confirmed.length+' / '+c.capacity+' registreerunud</span>'+
      '</div>'+
      '<div class="td-hero-progress" role="meter" aria-label="Treeningu täituvus" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+filled+'"><span style="width:'+filled+'%"></span></div>'+
      '<p class="td-hero-capacity">'+(c.free>0?c.free+' vaba '+(c.free===1?'koht':'kohta'):'Vabu kohti pole')+
      (c.waitlisted.length?' · '+c.waitlisted.length+' ootenimekirjas':'')+'</p>'+
    '</section>';
  }
  function block(title,body,className=''){
    return '<section class="td-section '+className+'"><h3>'+title+'</h3>'+body+'</section>';
  }
  function workout(t){
    const text=String(t.workout||'').trim();
    return block(svg.file+' Päeva treening / WOD',text?
      '<div class="td-wod-body">'+esc(text)+'</div>':
      '<p class="td-muted">Treener ei ole veel WOD-i lisanud.</p>','td-wod');
  }
  function attendees(list,waitlist,trainer){
    if(!list.length)return '<div class="td-empty-attendees">Registreerunuid veel ei ole.</div>';
    return '<div class="td-attendee-list">'+list.map((r,i)=>{
      const nameFull=String(window.pname(r.user_id)||'Kasutaja');
      const name=trainer?nameFull:nameFull.trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toLocaleUpperCase('et')+'.').join(' ');
      const photo=window.crossfitAvatars?.html(r.user_id,'medium')||'<span class="td-avatar-fallback" aria-hidden="true">'+esc(name.slice(0,1).toLocaleUpperCase('et'))+'</span>';
      const balance=trainer&&r.status==='confirmed'&&r.credit_charged?'<span class="td-person-credit">1 krediit kasutatud</span>':'';
      const trainerPayment=trainer&&!waitlist&&r.payment_status==='unpaid'?'<span class="td-person-credit td-person-unpaid">Tasumata</span>':'';
      return '<div class="td-attendee">'+photo+
        '<div class="td-attendee-name"><strong>'+esc(name)+'</strong>'+
        '<small>'+(waitlist?(i+1)+'. ootenimekirjas':'Registreeritud')+'</small></div>'+
        balance+trainerPayment+'</div>';
    }).join('')+'</div>';
  }
  function attendeesSection(t,c,trainer){
    const pastTraining=past(t);
    if(!trainer&&(pastTraining||t.status==='cancelled'))return '';
    const confirmed=block('Registreerunud ('+c.confirmed.length+'/'+c.capacity+')',attendees(c.confirmed,false,trainer),'td-people');
    const waiting=c.waitlisted.length?block('Ootenimekiri ('+c.waitlisted.length+')',
      attendees(c.waitlisted,true,trainer),'td-people td-wait-list'):'';
    return confirmed+waiting;
  }
  function ruleBlock(t){
    let deadline='';
    try{deadline=safeDate(window.cancellationDeadline(t).toISOString())}catch(_){}
    const policy=String(window.cancellationRule(t)||'');
    return block('Tühistamise tingimused',
      '<p class="td-policy">'+esc(policy)+'</p>'+
      (deadline?'<p class="td-deadline">Tasuta tühistamine kuni '+esc(deadline)+'.</p>':''),
      'td-rules');
  }
  function btn(handler,label,kind='main'){
    return '<button type="button" class="td-button td-button-'+kind+'" onclick="'+handler+'">'+label+'</button>';
  }
  function trainerActions(t,id,closed){
    return block('Treeneri tegevused',
      '<div class="td-actions">'+
        btn('openTrainingForm('+id+')','Muuda treeningut')+
        btn('copyTraining('+id+')','Kopeeri treening','secondary')+
        btn('saveTrainingAsTemplate('+id+')','Salvesta mallina','secondary')+
        btn('openTemplates()','Treeningumallid','secondary')+'</div>'+
      '<details class="td-danger-zone"><summary>Treeningu tühistamine ja kustutamine</summary>'+
        '<div class="td-actions">'+
        (t.status!=='cancelled'?btn('cancelTraining('+id+')','Tühista ja tagasta krediidid','danger'):'')+
        btn('deleteTraining('+id+')',closed?'Eemalda ajaloost':'Kustuta treening','danger')+
        '</div><p>Need toimingud nõuavad kinnitamist.</p></details>',
      'td-actions-section');
  }
  function clientActions(t,id,c){
    if(t.status!=='published'||past(t))return '';
    const mine=current(t);
    const waiting=mine?.status==='waitlist';
    let deadline='';
    try{deadline=safeDate(window.cancellationDeadline(t).toISOString())}catch(_){}
    const deadlineText=deadline?'<p class="td-booking-deadline">Tasuta tühistamine kuni '+esc(deadline)+
      ' ('+Number(t.cancellation_hours||2)+' tundi enne treeningut).</p>':'';
    if(mine){
      let content='<div class="td-booking-status">'+
        '<strong>'+(waiting?'Oled ootenimekirjas':'Sinu koht on kinnitatud')+'</strong>'+
        '<p>'+(waiting?'Koha vabanemisel liigud automaatselt treeningule. Krediit arvestatakse koha kinnitamisel.':
          'Näeme treeningul! Siit saad registreeringut vaadata või selle tühistada.')+'</p>'+
        (waiting?'<span class="td-position">Koht ootenimekirjas: '+esc(String(window.waitPosition(t.id)||'—'))+'</span>':'')+
        '</div>'+(!waiting?deadlineText:'<p class="td-booking-deadline">Ootenimekirjast lahkudes krediiti ei arvestata.</p>')+
        '<div class="td-actions">'+
        btn('openCalendar('+id+')','Lisa kalendrisse','secondary')+
        btn('cancelRegistration('+id+')','Tühista registreering','danger')+
        '</div>';
      if(!waiting&&lateCancellation(t))content+='<p class="td-late-warning">Tasuta tühistamise tähtaeg on möödas. Tühistamisel krediiti ei tagastata.</p>';
      return block('Sinu registreering',content,'td-booking-section');
    }
    const credits=Number(window.totalCredits?.()??0);
    if(credits<=0)return block('Registreerimine',
      '<div class="td-no-credit"><strong>Treeningkrediit on otsas</strong>'+
      '<p>Registreerimiseks, ka ootenimekirjaga liitumiseks, on vaja vähemalt ühte krediiti. Krediit arvestatakse alles koha kinnitamisel.</p>'+
      btn('openCreditHelp()','Kuidas krediiti saada?','secondary')+'</div>',
      'td-booking-section');
    const full=c.free<=0;
    return block(full?'Liitu ootenimekirjaga':'Registreeru treeningule',
      '<div class="td-booking-intro"><p>'+(full?
        'Treening on täis. Krediit arvestatakse alles koha vabanemisel.':
        'Registreerimisel kasutatakse sinu kontolt 1 treeningkrediit.')+'</p>'+
      '<span>Sinu krediidijääk: '+esc(credits===Infinity?'∞':String(credits))+'</span></div>'+
      (!full?deadlineText:'')+
      btn('registerTraining('+id+')',full?'Liitu ootenimekirjaga':'Registreeru · 1 krediit'),
      'td-booking-section');
  }
  function detail(t){
    const id=validId(t);if(id===null)return '';
    const trainer=window.isTrainer();
    const counts=registrants(t);
    const note=String(t.note||'').trim();
    const actions=trainer?trainerActions(t,id,t.status==='cancelled'||past(t)):clientActions(t,id,counts);
    return '<div class="td-content">'+
      hero(t,counts,trainer)+
      actions+
      workout(t)+
      (note?block('Treeneri märkus','<p class="td-note">'+esc(note)+'</p>','td-notes'):'')+
      attendeesSection(t,counts,trainer)+
      ruleBlock(t)+
    '</div>';
  }
  window.renderModal=function(){
    if(state.modal!=='training')return beforeModal();
    const t=state.trainings.find(x=>Number(x.id)===Number(state.modalData));
    if(!t)return '';
    return '<div class="sheet-backdrop" onclick="backdropClose(event)">'+
      '<div class="sheet td-sheet" role="dialog" aria-modal="true" aria-labelledby="td-sheet-title" onclick="event.stopPropagation()">'+
      '<div class="sheet-head"><div id="td-sheet-title" class="sheet-title">Treeningu info</div>'+
        '<button type="button" class="sheet-close" onclick="closeModal()" aria-label="Sulge">×</button></div>'+
      '<div class="sheet-body">'+detail(t)+'</div></div></div>';
  };
  window.crossfitTrainingDetail={detail,registrants};
})();