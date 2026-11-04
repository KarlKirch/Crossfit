'use strict';
/* Rõuge CrossFit: tegelik kohalolek ja osaleja personaalne statistika.
   Broneeringud ei võrdu kohalolekuga; ainult treeneri märge loeb. */
(function(){
  const s=window.state;
  if(!s||typeof window.loadData!=='function')return;
  const originalLoad=window.loadData;
  const originalOpenClient=window.openClient;
  s.attendanceRows=[];
  s.myAttendanceSummary=null;
  s.clientAttendanceSummaries={};
  const esc=v=>window.esc(v);
  const isoDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?s:'';
  const safeId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0?Number(id):null;

  function attendanceStatus(registrationId){
    return s.attendanceRows.find(x=>Number(x.registration_id)===Number(registrationId))?.status||null;
  }
  function label(id){
    const status=attendanceStatus(id);
    return status==='present'?'Kohal käidud':status==='absent'?'Puudutud':'Kohalolek märkimata';
  }
  function completed(t){
    return Date.parse(t.starts_at)+Math.max(0,Number(t.duration_minutes)||0)*60000<=Date.now();
  }
  function weeks(summary){
    const input=Array.isArray(summary?.weeks)?summary.weeks:[];
    return input.filter(v=>isoDate(v?.week_start)).map(v=>({
      start:v.week_start,count:Math.max(0,Number(v.count)||0)
    })).sort((a,b)=>a.start.localeCompare(b.start)).slice(-52);
  }
  function streak(weeks52){
    if(!weeks52.length)return 0;
    let index=weeks52.length-1, n=0;
    // Käesolev nädal võib veel olla ilma treeninguta.
    if(!weeks52[index].count)index--;
    for(;index>=0&&weeks52[index].count>0;index--)n++;
    return n;
  }
  function fmt(iso){
    if(!iso||!Number.isFinite(Date.parse(iso)))return '—';
    return new Intl.DateTimeFormat('et-EE',{
      timeZone:'Europe/Tallinn',day:'numeric',month:'short',year:'numeric'
    }).format(new Date(iso));
  }
  function dateLabel(d){
    const raw=isoDate(d);
    if(!raw)return '—';
    const date=new Date(raw+'T12:00:00Z');
    return new Intl.DateTimeFormat('et-EE',{day:'numeric',month:'short',timeZone:'UTC'}).format(date);
  }
  function counts(summary){
    const total=Math.max(0,Number(summary?.total)||0);
    const month=Math.max(0,Number(summary?.month)||0);
    const absent=Math.max(0,Number(summary?.absent)||0);
    const marked=Math.max(0,Number(summary?.marked)||0);
    return {total,month,absent,marked,weekly:weeks(summary)};
  }
  let selectedWeek=null;
  function weekDetail(w){
    const start=new Date(w.start+'T12:00:00Z');
    const end=new Date(start);
    end.setUTCDate(end.getUTCDate()+6);
    const until=new Intl.DateTimeFormat('et-EE',{
      day:'numeric',month:'short',timeZone:'UTC'
    }).format(end);
    return dateLabel(w.start)+' – '+until+': '+w.count+
      (w.count===1?' kinnitatud osalemine':' kinnitatud osalemist');
  }
  function selectWeek(start){
    const found=weeks(s.myAttendanceSummary).slice(-12).find(w=>w.start===start);
    if(!found)return false;
    selectedWeek=start;
    const area=document.querySelector('.at-stats');
    if(!area)return true;
    area.querySelectorAll('.at-bar-cell').forEach(button=>{
      const pressed=button.dataset.week===start;
      button.setAttribute('aria-pressed',String(pressed));
    });
    const detail=area.querySelector('.at-week-detail');
    if(detail)detail.textContent=weekDetail(found);
    return true;
  }
  function statsCard(){
    if(window.isTrainer())return '';
    const summary=s.myAttendanceSummary;
    if(!summary){
      return '<section class="at-stats" aria-label="Minu treeningstatistika"><h2>Minu treeningstatistika</h2>'+
        '<p class="at-note">Laadin kohaloleku andmeid…</p></section>';
    }
    const stat=counts(summary);
    const last12=stat.weekly.slice(-12);
    const current=last12.at(-1)?.count||0;
    const average=(last12.reduce((n,w)=>n+w.count,0)/12).toLocaleString('et-EE',{
      minimumFractionDigits:1,maximumFractionDigits:1
    });
    const sequence=streak(stat.weekly);
    const high=Math.max(1,...last12.map(w=>w.count));
    const active=last12.find(w=>w.start===selectedWeek)||last12.at(-1)||null;
    const chart=last12.map(w=>{
      const height=Math.max(w.count?16:3,Math.round(w.count/high*84));
      const message=weekDetail(w);
      return '<button class="at-bar-cell" type="button" data-week="'+esc(w.start)+
        '" data-count="'+w.count+'" aria-label="'+esc(message)+
        '" aria-pressed="'+(w.start===active?.start)+
        '" onclick="crossfitAttendance.selectWeek(this.dataset.week)">'+
        '<strong class="at-bar-count">'+w.count+'</strong>'+
        '<span class="at-bar" style="height:'+height+'px" aria-hidden="true"></span>'+
        '<span class="at-bar-week">'+esc(dateLabel(w.start))+'</span></button>';
    }).join('');
    const total12=last12.reduce((sum,w)=>sum+w.count,0);
    return '<section class="at-stats" aria-label="Minu treeningstatistika">'+
      '<h2>Minu treeningstatistika</h2>'+
      '<div class="at-metrics">'+
        '<div><strong>'+current+'</strong><span>Sel nädalal kohal</span></div>'+
        '<div><strong>'+stat.month+'</strong><span>Sel kuul kohal</span></div>'+
        '<div><strong>'+stat.total+'</strong><span>Kokku kohal</span></div>'+
        '<div><strong>'+average+'</strong><span>Keskmiselt nädalas (12 nädalat)</span></div>'+
        '<div><strong>'+sequence+'</strong><span>Aktiivset nädalat järjest</span></div>'+
      '</div>'+
      '<div class="at-last-session"><span>Viimane treening</span>'+
        '<strong>'+esc(fmt(summary.last_attended))+'</strong></div>'+
      '<div class="at-chart-heading"><h3>Viimased 12 nädalat</h3>'+
        '<span>'+total12+' kinnitatud osalemist</span></div>'+
      '<div class="at-chart" role="group" aria-label="Vali nädal ja vaata kohalolekut">'+chart+'</div>'+
      '<p class="at-week-detail" role="status" aria-live="polite">'+
        (active?esc(weekDetail(active)):'Kohaloleku andmed puuduvad.')+'</p>'+
      '<p class="at-note">'+
        (stat.marked?'Treener on märkinud '+stat.marked+' korral kohaloleku, neist '+
          stat.absent+' puudumist.':'Kohalolekumärked veel puuduvad.')+'</p>'+
      '<p class="at-note">Arvesse lähevad ainult treeneri kinnitatud osalemised. '+
      'Varasemad registreeringud ei muutu automaatselt osalemisteks.</p>'+
    '</section>';
  }
  function clientCard(uid){
    if(!window.isTrainer()||s.clientPreview)return '';
    const summary=s.clientAttendanceSummaries?.[uid];
    if(!summary)return '<section class="at-client-card"><h3>Tegelik kohalolek</h3><p>Laadin osalemiste arvu…</p></section>';
    const stat=counts(summary);
    const last12=stat.weekly.slice(-12);
    const average=(last12.reduce((n,w)=>n+w.count,0)/12).toLocaleString('et-EE',{
      minimumFractionDigits:1,maximumFractionDigits:1
    });
    const sequence=streak(stat.weekly);
    return '<section class="at-client-card"><h3>Kliendi treeningaktiivsus</h3>'+
      '<div class="at-client-metrics">'+
      '<span><strong>'+(last12.at(-1)?.count||0)+'</strong> sel nädalal</span>'+
      '<span><strong>'+stat.month+'</strong> sel kuul</span>'+
      '<span><strong>'+stat.total+'</strong> korda kokku</span>'+
      '<span><strong>'+average+'</strong> keskmiselt nädalas (12 nädalat)</span>'+
      '<span><strong>'+sequence+'</strong> aktiivset nädalat järjest</span>'+
      '<span><strong>'+stat.absent+'</strong> märgitud puudumist</span></div>'+
      '<p>Viimati kohal: '+esc(fmt(summary.last_attended))+'</p>'+
      '<p>Need on treeneri kinnitatud osalemised, mitte üksnes broneeringud.</p></section>';
  }
  async function loadClient(uid){
    if(!window.isTrainer()||s.clientPreview||!s.session?.access_token||!uid)return;
    if(s.clientAttendanceSummaries?.[uid])return;
    try{
      const summary=await window.rpc('wod_attendance_summary',{p_user_id:uid});
      s.clientAttendanceSummaries[uid]=summary;
      if(s.modal==='client'&&s.modalData===uid)window.render();
    }catch(error){
      console.warn('Kliendi kohalolekustatistika laadimine ebaõnnestus',error);
      if(s.modal==='client'&&s.modalData===uid)window.toast('Kliendi statistikat ei õnnestunud laadida.');
    }
  }
  if(typeof originalOpenClient==='function'){
    window.openClient=function(uid){
      originalOpenClient(uid);
      if(window.isTrainer()&&!s.clientPreview)void loadClient(uid);
    };
  }
  window.loadData=async function(){
    await originalLoad();
    if(!s.session?.access_token||s.clientPreview){
      s.attendanceRows=[];s.myAttendanceSummary=null;s.clientAttendanceSummaries={};
      return;
    }
    const requests=[window.api('wod_attendance?select=registration_id,status,marked_at&order=marked_at.desc')];
    if(!window.isTrainer())requests.push(window.rpc('wod_attendance_summary',{p_user_id:null}));
    const result=await Promise.all(requests);
    s.attendanceRows=Array.isArray(result[0])?result[0]:[];
    s.myAttendanceSummary=window.isTrainer()?null:result[1];
    s.clientAttendanceSummaries={};
  };

  function panel(t){
    if(!window.isTrainer()||s.clientPreview||t?.status!=='published'||t.archived_at)return '';
    if(!completed(t))return '<section class="at-panel"><h3>Kohaloleku märkimine</h3>'+
      '<p>Märkimine avaneb pärast treeningu lõppu.</p></section>';
    const regs=s.registrations.filter(r=>Number(r.training_id)===Number(t.id)&&r.status==='confirmed');
    const present=regs.filter(r=>attendanceStatus(r.id)==='present').length;
    const absent=regs.filter(r=>attendanceStatus(r.id)==='absent').length;
    const rows=regs.map(r=>{
      const status=attendanceStatus(r.id);
      const id=safeId(r.id);
      if(id===null)return '';
      return '<div class="at-attendee"><div class="at-attendee-info"><strong>'+esc(window.pname(r.user_id))+
        '</strong><small>'+label(r.id)+'</small></div>'+
        '<div class="at-actions">'+
          '<button type="button" class="at-action '+(status==='present'?'selected present':'')+
          '" aria-pressed="'+(status==='present')+'" onclick="crossfitAttendance.mark('+id+',\'present\')">Kohal</button>'+
          '<button type="button" class="at-action '+(status==='absent'?'selected absent':'')+
          '" aria-pressed="'+(status==='absent')+'" onclick="crossfitAttendance.mark('+id+',\'absent\')">Puudus</button>'+
          (status?'<button type="button" class="at-action" onclick="crossfitAttendance.mark('+id+',\'unmarked\')">Tühista märge</button>':'')+
        '</div></div>';
    }).join('');
    return '<section class="at-panel" aria-label="Treeningu kohalolek">'+
      '<h3>Kohaloleku märkimine</h3>'+
      '<p>Kohal: <strong>'+present+'</strong> · Puudus: <strong>'+absent+
      '</strong> · Märkimata: <strong>'+(regs.length-present-absent)+'</strong></p>'+
      (regs.length?'<div class="at-attendees">'+rows+'</div>':'<p>Treeningul pole kinnitatud registreeringuid.</p>')+
      '<p class="at-note">Kohalolek on eraldi arvestus ega muuda makseid ega krediite.</p></section>';
  }
  let busy=false;
  async function mark(id,status){
    if(busy||!window.isTrainer()||s.clientPreview)return false;
    const reg=s.registrations.find(x=>Number(x.id)===Number(id));
    const t=s.trainings.find(x=>Number(x.id)===Number(reg?.training_id));
    if(!reg||reg.status!=='confirmed'||!t||!completed(t)||t.status!=='published')return false;
    if(!['present','absent','unmarked'].includes(status))return false;
    busy=true;
    try{
      const ok=await window.rpc('wod_mark_attendance',{p_registration_id:Number(id),p_status:status});
      if(ok!==true)throw new Error('Server ei kinnitanud kohaloleku muudatust.');
      if(status==='unmarked')s.attendanceRows=s.attendanceRows.filter(x=>Number(x.registration_id)!==Number(id));
      else{
        const row={registration_id:Number(id),status,marked_at:new Date().toISOString()};
        s.attendanceRows=s.attendanceRows.filter(x=>Number(x.registration_id)!==Number(id));
        s.attendanceRows.push(row);
      }
      s.clientAttendanceSummaries={};
      window.render();
      window.toast('Kohalolek salvestatud');
      return true;
    }catch(error){window.toast(error?.message||'Kohaloleku salvestamine ebaõnnestus');return false}
    finally{busy=false}
  }
  window.crossfitAttendance={panel,mark,label,statsCard,clientCard,loadClient,attendanceStatus,streak,weeks,selectWeek};
})();
