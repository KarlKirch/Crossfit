'use strict';

/* 14. samm: treeneri kliendihaldus.
 * Kasutab olemasolevaid kliendi- ja krediidiandmeid. Krediidi lisamine ja
 * kliendi eemaldamine jäävad varasemate serverireeglite hooleks.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.renderClients!=='function'||typeof window.clientDetail!=='function')return;
  const originalList=window.renderClients;
  const originalDetail=window.clientDetail;
  const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const esc=v=>window.esc(v);
  const EU='Europe/Tallinn';
  const dateTime=new Intl.DateTimeFormat('et-EE',{timeZone:EU,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const dateOnly=new Intl.DateTimeFormat('et-EE',{timeZone:EU,day:'numeric',month:'short',year:'numeric'});
  let restoring=false;

  function fmt(value,withTime=false){
    const d=new Date(value);
    return Number.isFinite(d.getTime())?(withTime?dateTime:dateOnly).format(d):'—';
  }
  const count=(uid)=>{const n=Number(window.totalCredits?.(uid)??0);return n===Infinity?Infinity:Math.max(0,Number.isFinite(n)?n:0)};
  const countText=n=>n===Infinity?'∞':String(n);
  function mapTrainings(){return new Map((s.trainings||[]).map(t=>[Number(t.id),t]))}
  function removedMap(){return new Map((s.removedClients||[]).map(r=>[r.user_id,r]))}
  function valid(uid){return typeof uid==='string'&&ID.test(uid)}
  function profile(uid){return (s.profiles||[]).find(p=>p.user_id===uid&&p.role==='client')||null}
  function photograph(uid,size='medium'){
    if(window.crossfitAvatars?.html)return window.crossfitAvatars.html(uid,size);
    const name=String(profile(uid)?.display_name||'Kasutaja');
    return '<span class="cl-avatar-fallback">'+esc(name.trim().slice(0,1).toLocaleUpperCase('et')||'?')+'</span>';
  }
  function registrationStats(uid){
    const now=Date.now(),trainings=mapTrainings();
    let confirmedFuture=0,waiting=0,attended=0,lastAttended=0;
    const upcoming=[],history=[];
    for(const r of(s.registrations||[])){
      if(r.user_id!==uid)continue;
      const t=trainings.get(Number(r.training_id));
      if(!t)continue;
      const date=Date.parse(t.starts_at);
      const row={r,t,date};
      const isFuture=t.status==='published'&&date>now&&['confirmed','waitlist'].includes(r.status);
      if(isFuture){
        upcoming.push(row);
        if(r.status==='confirmed')confirmedFuture++;
        else waiting++;
      }else{
        history.push(row);
        if(r.status==='confirmed'&&t.status!=='cancelled'&&date<=now&&Number.isFinite(date)){
          attended++;lastAttended=Math.max(lastAttended,date);
        }
      }
    }
    upcoming.sort((a,b)=>a.date-b.date);
    history.sort((a,b)=>b.date-a.date);
    return {confirmedFuture,waiting,attended,lastAttended,upcoming,history};
  }
  function customers(){
    const removed=removedMap();
    return (s.profiles||[]).filter(p=>p.role==='client').map(p=>({
      p,uid:p.user_id,removed:removed.has(p.user_id),
      removedInfo:removed.get(p.user_id)||null,
      credit:count(p.user_id),reg:registrationStats(p.user_id)
    }));
  }
  function filterState(){
    return {term:String(s.clientSearch||''),filter:s.clientFilter||'all',sort:s.clientSort||'name'};
  }
  function filtered(all=customers()){
    const {term,filter,sort}=filterState(),q=term.trim().toLocaleLowerCase('et');
    const cleaned=all.filter(x=>{
      if(filter==='removed')return x.removed;
      if(x.removed)return false;
      if(filter==='zero'&&x.credit!==0)return false;
      if(filter==='low'&&!(x.credit>0&&x.credit<=2))return false;
      if(filter==='booked'&&!(x.reg.confirmedFuture+x.reg.waiting>0))return false;
      return true;
    }).filter(x=>!q||String(x.p.display_name||'').toLocaleLowerCase('et').includes(q));
    const alphabetical=(a,b)=>String(a.p.display_name||'').localeCompare(String(b.p.display_name||''),'et',{sensitivity:'base'});
    cleaned.sort((a,b)=>sort==='credit'?
      (a.credit-b.credit||alphabetical(a,b)):sort==='recent'?
      (b.reg.lastAttended-a.reg.lastAttended||alphabetical(a,b)):alphabetical(a,b));
    return cleaned;
  }
  function chips(all){
    const active=all.filter(x=>!x.removed);
    return [
      ['all','Kõik',active.length],
      ['zero','0 krediiti',active.filter(x=>x.credit===0).length],
      ['low','1–2 krediiti',active.filter(x=>x.credit>0&&x.credit<=2).length],
      ['booked','Registreeritud',active.filter(x=>x.reg.confirmedFuture+x.reg.waiting>0).length],
      ['removed','Eemaldatud',all.length-active.length]
    ];
  }
  function counts(all){
    const active=all.filter(x=>!x.removed);
    return [
      {label:'Aktiivsed',value:active.length},
      {label:'0 krediiti',value:active.filter(x=>x.credit===0).length},
      {label:'1–2 krediiti',value:active.filter(x=>x.credit>0&&x.credit<=2).length},
      {label:'Tulevasi registreeringuid',value:active.reduce((n,x)=>n+x.reg.confirmedFuture+x.reg.waiting,0)}
    ];
  }
  function creditBadge(n){
    const tone=n===0?'zero':n<=2?'low':'good';
    return '<span class="cl-credit cl-credit-'+tone+'"><strong>'+countText(n)+'</strong>'+
      '<small>'+(n===Infinity?'piiramatu':n===1?'treeningkord':'treeningkorda')+'</small></span>';
  }
  function row(c){
    if(!valid(c.uid))return '';
    const name=esc(c.p.display_name||'Kasutaja'),uid=c.uid;
    const archived=c.removed;
    const stateLabel=archived?'Eemaldatud':c.credit===0?'Krediit otsas':c.credit<=2?'Krediiti vähe':'Krediiti olemas';
    const meta=archived?'Eemaldatud '+esc(fmt(c.removedInfo?.removed_at)):
      c.reg.confirmedFuture+' tulevast · '+c.reg.attended+' osaletud'+
      (c.reg.waiting?' · '+c.reg.waiting+' ootel':'');
    return '<article class="cl-card'+(archived?' cl-card-archived':'')+'">'+
      '<div class="cl-card-primary">'+photograph(uid)+
      '<div class="cl-card-name"><strong>'+name+'</strong><span>'+meta+'</span>'+
      '<small class="cl-status '+(archived?'archived':c.credit<=2?'attention':'ok')+'">'+stateLabel+'</small></div>'+
      (!archived?creditBadge(c.credit):'<span class="cl-archived-pill">Arhiveeritud</span>')+
      '</div>'+
      '<div class="cl-card-actions">'+
      '<button type="button" class="cl-button cl-button-outline" onclick="openClient('+"'"+uid+"'"+')">Kliendikaart</button>'+
      (archived?
        '<button type="button" class="cl-button cl-button-main" onclick="crossfitClientDirectory.restore('+"'"+uid+"'"+')">Taasta klient</button>':
        '<button type="button" class="cl-button cl-button-main" onclick="openAddCredits('+"'"+uid+"'"+')">Lisa krediiti</button>')+
      '</div></article>';
  }
  function rows(list){
    return list.length?list.map(row).join(''):
      '<div class="cl-empty"><strong>Ühtegi vastavat klienti ei leitud.</strong>'+
      '<span>Proovi teist otsingut või vali mõni muu filter.</span>'+
      '<button type="button" class="btn btn-soft" onclick="crossfitClientDirectory.reset()">Tühjenda filtrid</button></div>';
  }
  function render(){
    if(!window.isTrainer())return originalList();
    const all=customers(),matches=filtered(all),state=filterState();
    return '<div class="cl-page"><header class="cl-page-head"><span>KLIENTIDE HALDUS</span><h1>Kliendid</h1>'+
      '<p>Otsi klient, kontrolli krediiti ja ava tema treeninguajalugu.</p></header>'+
      '<div class="cl-metrics">'+counts(all).map(c=>'<div class="cl-metric"><strong>'+c.value+'</strong><span>'+c.label+'</span></div>').join('')+'</div>'+
      '<div class="cl-search"><label for="clSearch">Otsi nime järgi</label>'+
      '<div class="cl-search-row"><span aria-hidden="true">⌕</span>'+
      '<input id="clSearch" type="search" autocomplete="off" placeholder="Sisesta kliendi nimi…" value="'+esc(state.term)+'" oninput="crossfitClientDirectory.search(this.value)" />'+
      (state.term?'<button type="button" onclick="crossfitClientDirectory.clearSearch()" aria-label="Tühjenda otsing">×</button>':'')+
      '</div></div>'+
      '<div class="cl-filters" role="group" aria-label="Kliendifiltrid">'+chips(all).map(([id,label,number])=>
        '<button type="button" class="cl-filter '+(state.filter===id?'selected':'')+'" aria-pressed="'+(state.filter===id)+'" onclick="crossfitClientDirectory.setFilter('+"'"+id+"'"+')">'+
        label+' <span>'+number+'</span></button>').join('')+'</div>'+
      '<div class="cl-results-heading"><strong>Kliendid <span id="clResultCount">'+matches.length+'</span></strong>'+
      '<label for="clSort">Järjesta</label><select id="clSort" onchange="crossfitClientDirectory.setSort(this.value)">'+
      [['name','Nime järgi'],['credit','Krediidi järgi'],['recent','Viimati treeninud']].map(([id,label])=>
        '<option value="'+id+'"'+(state.sort===id?' selected':'')+'>'+label+'</option>').join('')+'</select></div>'+
      '<div id="clResultList" class="cl-list" aria-live="polite">'+rows(matches)+'</div>'+
      '<p class="cl-data-note">Osalemiste ja treeningute ajalugu põhineb rakendusse laaditud andmetel. Varasemad treeningud ei pruugi täielikult sisalduda.</p>'+
      '</div>';
  }
  function refreshResults(){
    const target=document.getElementById('clResultList');
    if(!target){window.render();return}
    const all=customers(),list=filtered(all);
    target.innerHTML=rows(list);
    const n=document.getElementById('clResultCount');if(n)n.textContent=String(list.length);
  }
  function search(value){s.clientSearch=String(value||'');refreshResults()}
  function clearSearch(){
    s.clientSearch='';
    const input=document.getElementById('clSearch');
    if(input){input.value='';input.focus()}
    refreshResults();
  }
  function setFilter(value){
    if(!['all','zero','low','booked','removed'].includes(value))return;
    s.clientFilter=value;window.render();
  }
  function setSort(value){
    if(!['name','credit','recent'].includes(value))return;
    s.clientSort=value;refreshResults();
  }
  function reset(){s.clientSearch='';s.clientFilter='all';s.clientSort='name';window.render()}

  function linkTraining(t){
    const id=Number(t.id);
    if(!Number.isSafeInteger(id)||id<=0)return '';
    return ' onclick="openTraining('+id+')"';
  }
  function bookingItem(item){
    const {r,t}=item;
    const waiting=r.status==='waitlist';
    const cancelled=r.status==='cancelled'||t.status==='cancelled';
    const status=cancelled?'Tühistatud':waiting?'Ootenimekirjas':'Registreeritud';
    return '<button type="button" class="cl-history-row"'+linkTraining(t)+'>'+
      '<span class="cl-history-icon">◷</span>'+
      '<span><strong>'+esc(t.title||'CrossFit')+'</strong><small>'+esc(fmt(t.starts_at,true))+'</small></span>'+
      '<em class="'+(cancelled?'cancelled':waiting?'waiting':'confirmed')+'">'+status+'</em></button>';
  }
  function transactionItem(t){
    const delta=Number(t.delta)||0;
    return '<div class="cl-transaction">'+
      '<span class="'+(delta>=0?'cl-positive':'cl-negative')+'">'+(delta>0?'+':'')+delta+'</span>'+
      '<div><strong>'+esc(t.reason||'Krediidi muudatus')+'</strong><small>'+esc(fmt(t.created_at,true))+'</small></div></div>';
  }
  function detail(p){
    if(!window.isTrainer())return originalDetail(p);
    if(!valid(p?.user_id)||p.role!=='client')return '';
    const uid=p.user_id,removed=removedMap().has(uid),stat=registrationStats(uid),n=count(uid);
    const transaction=(s.creditTransactions||[]).filter(t=>t.user_id===uid)
      .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,20);
    return '<div class="cl-detail">'+
      '<div class="cl-detail-hero">'+photograph(uid,'large')+
      '<div><span>KLIENDIKAART</span><h2>'+esc(p.display_name||'Kasutaja')+'</h2>'+
      '<p>'+(removed?'Eemaldatud klient':'Aktiivne klient')+'</p></div></div>'+
      '<div class="cl-detail-stats">'+
      '<div><strong>'+countText(n)+'</strong><span>Krediiti alles</span></div>'+
      '<div><strong>'+stat.confirmedFuture+'</strong><span>Tulevasi treeninguid</span></div>'+
      '<div><strong>'+stat.attended+'</strong><span>Osaletud</span></div>'+
      '<div><strong>'+stat.waiting+'</strong><span>Ootel</span></div></div>'+
      '<div class="cl-detail-actions">'+(removed?
        '<button type="button" class="cl-button cl-button-main" onclick="crossfitClientDirectory.restore('+"'"+uid+"'"+')">Taasta klient</button>':
        '<button type="button" class="cl-button cl-button-main" onclick="openAddCredits('+"'"+uid+"'"+')">Lisa krediiti</button>')+
      '<button type="button" class="cl-button cl-button-outline" onclick="closeModal()">Sulge</button></div>'+
      '<section class="cl-detail-section"><h3>Tulevased registreeringud <span>'+stat.upcoming.length+'</span></h3>'+
      (stat.upcoming.length?stat.upcoming.slice(0,12).map(bookingItem).join(''):'<p>Klient pole tulevastele treeningutele registreeritud.</p>')+'</section>'+
      '<details class="cl-detail-section" open><summary>Treeningute ajalugu <span>'+stat.history.length+'</span></summary>'+
      (stat.history.length?stat.history.slice(0,20).map(bookingItem).join(''):'<p>Laaditud perioodis varasemaid registreeringuid pole.</p>')+
      (stat.history.length>20?'<p>Kuvatud viimased 20 kirjet.</p>':'')+
      '<p class="cl-detail-hint">Ajalugu põhineb laaditud treeningutel (kuni viimased 365 päeva) ning ei pruugi sisaldada kogu varasemat osalemist.</p></details>'+
      '<details class="cl-detail-section"><summary>Krediiditehingud <span>'+transaction.length+'</span></summary>'+
      (transaction.length?transaction.map(transactionItem).join(''):'<p>Tehinguid ei leitud.</p>')+
      '</details>'+
      (!removed?'<details class="cl-detail-section cl-danger"><summary>Kliendi eemaldamine</summary>'+
      '<p>Klient eemaldatakse aktiivsest nimekirjast. Tulevased registreeringud tühistatakse serveri reeglite järgi.</p>'+
      '<button type="button" class="btn btn-danger" onclick="removeClient('+"'"+uid+"'"+')">Eemalda klient</button></details>':'')+
      '</div>';
  }
  async function restore(uid){
    if(!window.isTrainer()||restoring||!valid(uid)||!profile(uid)||!removedMap().has(uid))return false;
    const name=String(profile(uid).display_name||'Kasutaja');
    if(!window.confirm('Kas soovid taastada kliendi '+name+' aktiivsete klientide nimekirja?'))return false;
    restoring=true;
    try{
      await window.rpc('wod_restore_client',{p_user_id:uid});
      s.modal=null;s.modalData=null;
      s.clientFilter='all';
      await window.reloadData('Klient taastatud');
      window.render();
      return true;
    }catch(error){window.toast(error?.message||'Kliendi taastamine ebaõnnestus');return false}
    finally{restoring=false}
  }
  window.renderClients=render;
  window.clientDetail=detail;
  window.crossfitClientDirectory={render,detail,customers,filtered,registrationStats,setFilter,setSort,search,clearSearch,reset,restore};
})();
