'use strict';

/* 16. samm: kiire treeninguvorm koos 90-minutilise vaikeajaga.
 * Kordusajad vajavad nähtavat eelvaadet ja kinnitust.
 * WOD valikus pakutakse ainult treeneri kinnitatud tekste.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.trainingForm!=='function'||typeof window.saveTrainingForm!=='function')return;
  const originalForm=window.trainingForm, originalSave=window.saveTrainingForm;
  const esc=x=>window.esc(x);
  const TIMEZONE='Europe/Tallinn';
  const fmt=new Intl.DateTimeFormat('et-EE',{timeZone:TIMEZONE,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const DAY=[['E',1],['T',2],['K',3],['N',4],['R',5],['L',6],['P',7]];
  let saving=false;
  const byId=id=>document.getElementById(id);
  const string=id=>String(byId(id)?.value||'');
  const number=id=>Number(string(id));
  const idOf=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;};
  function dateString(d){return new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
  function formDates(data){
    const t=data?.starts_at?new Date(data.starts_at):null;
    const parts=t&&Number.isFinite(t.getTime())?window.localParts(t.toISOString()):null;
    return parts||{date:dateString(new Date(Date.now()+86400000)),time:'19:00'};
  }
  function isEditing(data){return !!idOf(data?.id)}
  function validWods(){
    return Array.isArray(s.wodBank)?s.wodBank.filter(w=>w.status==='ready'&&String(w.workout_text||'').trim()&&idOf(w.id)):[];
  }
  function templates(){return Array.isArray(s.trainingTemplates)?s.trainingTemplates.filter(t=>t.active!==false&&idOf(t.id)):[]}
  function recurringDates(date,days,weeks,time){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return [];
    if(!Number.isSafeInteger(weeks)||weeks<1||weeks>12)return [];
    const start=new Date(date+'T12:00:00Z');
    if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==date)return [];
    const daySet=new Set(days.filter(d=>Number.isInteger(d)&&d>=1&&d<=7));
    const dates=[];
    for(let i=0;i<weeks*7;i++){
      const next=new Date(start.getTime()+i*86400000);
      const dow=next.getUTCDay()||7;
      if(daySet.has(dow))dates.push(next.toISOString().slice(0,10));
    }
    return dates;
  }
  function selectedDays(){
    return [...document.querySelectorAll('.tfDay:checked')].map(el=>Number(el.value)).filter(n=>Number.isInteger(n)&&n>=1&&n<=7);
  }
  function formPlan(){
    const date=string('tfDate'),time=string('tfTime');
    const repeating=!!byId('tfRepeat')?.checked;
    if(!repeating)return {dates:date?[date]:[],repeat:false,days:[],weeks:1,time};
    const days=selectedDays(),weeks=number('tfWeeks');
    return {dates:recurringDates(date,days,weeks,time),repeat:true,days,weeks,time};
  }
  function showRecurrence(){
    const wrap=byId('tfRepeatOptions');
    if(wrap)wrap.hidden=!byId('tfRepeat')?.checked;
    if(byId('tfRepeat')?.checked&&!selectedDays().length){
      const start=string('tfDate');
      const day=window.weekday(start);
      const input=[...document.querySelectorAll('.tfDay')].find(x=>Number(x.value)===day);
      if(input)input.checked=true;
    }
    preview();
  }
  function preview(){
    const d=formPlan(),el=byId('tfRepeatPreview'),submit=byId('tfSubmit');
    if(!el)return d;
    let text='';
    if(d.repeat&&d.days.length===0)text='Vali vähemalt üks nädalapäev.';
    else if(!d.dates.length)text='Kontrolli kuupäeva, nädalapäevi ja nädalate arvu.';
    else if(d.dates.length>36)text='Liiga palju aegu: vali kuni 36 treeningut korraga.';
    else{
      const times=d.dates.slice(0,6).map(date=>{
        const local=window.tallinnLocalToIso(date,d.time);
        return fmt.format(new Date(local));
      });
      text='Luuakse '+d.dates.length+' treeningut: '+times.join(' · ')+
        (d.dates.length>6?' · …':'');
    }
    el.textContent=text;
    if(submit)submit.textContent=d.dates.length>1?'Avalda '+d.dates.length+' treeningut':'Avalda treening';
    return d;
  }
  function field(id,label,value,attrs=''){
    return '<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" value="'+esc(value)+'" '+attrs+'></div>';
  }
  function details(data){
    const price=Number(data.price_cents??500)/100;
    const cancel=Number(data.cancellation_hours??4);
    return '<details class="tf-more"><summary>Lisaseaded <span>Hind, tühistamise aeg ja märkus</span></summary>'+
      '<div class="tf-more-fields"><div class="tf-two">'+
        field('tfPrice','Hind (€)',String(price),'type="number" min="0" max="10000" step="0.01" inputmode="decimal"')+
        field('tfCancel','Tasuta tühistamine (tundi enne)',String(cancel),'type="number" min="0" max="72" step="1"')+
      '</div><div class="field"><label for="tfNote">Treeneri märkus</label>'+
        '<textarea id="tfNote" placeholder="Mida peaks osaleja teadma?">'+esc(data.note||'')+'</textarea></div></div></details>';
  }
  function workout(data){
    const ready=validWods();
    return '<section class="tf-wod"><div class="tf-section-top"><h3>Treeningu sisu / WOD</h3>'+
      '<span>'+ready.length+' kinnitatud WOD-i</span></div>'+
      (ready.length?
        '<div class="tf-wod-tools">'+
          '<label for="tfWodSearch">Leia WOD-pangast</label>'+
          '<input id="tfWodSearch" type="search" placeholder="Otsi nime või harjutuse järgi…" oninput="crossfitTrainingForm.filterWods(this.value)">'+
          '<select id="tfWodSelect" aria-label="Vali kinnitatud WOD">'+
          '<option value="">Vali WOD…</option>'+
          ready.slice(0,80).map(w=>'<option value="'+idOf(w.id)+'">'+esc(String(w.title||'WOD').slice(0,85))+'</option>').join('')+
          '</select><button type="button" class="tf-wod-pick" onclick="crossfitTrainingForm.useWod()">Kasuta valitud WOD-i</button>'+
        '</div>':
        '<p class="tf-wod-empty">WOD-pangas pole veel kinnitatud treeninguid. Kirjuta WOD käsitsi või kinnita see WOD-pangas.</p>')+
      '<label for="tfWorkout">WOD-tekst</label>'+
      '<textarea id="tfWorkout" placeholder="Näiteks: 5 rounds&#10;10 burpees&#10;15 squats">'+esc(data.workout||'')+'</textarea></section>';
  }
  function repeat(data){
    if(isEditing(data))return '';
    const start=formDates(data).date;
    const day=window.weekday(start);
    return '<section class="tf-recurrence">'+
      '<label class="tf-repeat-toggle"><input id="tfRepeat" type="checkbox" onchange="crossfitTrainingForm.repeatChanged()">'+
      '<span><strong>Korda treeningut igal nädalal</strong><small>Kasulik regulaarsetele CrossFiti aegadele</small></span></label>'+
      '<div id="tfRepeatOptions" class="tf-repeat-options" hidden>'+
      '<div class="field"><label for="tfWeeks">Mitme nädala jooksul?</label>'+
        '<select id="tfWeeks" onchange="crossfitTrainingForm.preview()">'+
        [1,2,3,4,6,8,10,12].map(n=>'<option value="'+n+'"'+(n===4?' selected':'')+'>'+n+' '+(n===1?'nädal':'nädalat')+'</option>').join('')+
      '</select></div><div class="tf-weekdays"><span>Nädalapäevad</span><div>'+
      DAY.map(([name,v])=>'<label class="tf-weekday"><input class="tfDay" type="checkbox" value="'+v+'"'+(v===day?' checked':'')+
        ' onchange="crossfitTrainingForm.preview()"><span>'+name+'</span></label>').join('')+
      '</div></div></div>'+
      '<p id="tfRepeatPreview" class="tf-preview" aria-live="polite">Luuakse 1 treening.</p>'+
      '</section>';
  }
  function form(data={}){
    if(!window.isTrainer())return originalForm(data);
    const p=formDates(data),editing=isEditing(data);
    const currentDuration=Number(data.duration_minutes??90);
    return '<div class="tf-form">'+
      '<div class="tf-intro"><span>'+(editing?'TREENINGU MUUTMINE':'UUS TREENING')+'</span>'+
      '<h2>'+(editing?'Muuda treeningut':'Lisa uus treening')+'</h2>'+
      '<p>Vali aeg, kohtade arv ja WOD. '+(editing?'Muudatused salvestatakse olemasolevale treeningule.':'Soovi korral loo korduvad ajad korraga.')+'</p></div>'+
      '<section class="tf-section"><h3>Millal toimub?</h3>'+
      '<div class="tf-two">'+
        field('tfDate','Kuupäev',p.date,'type="date" required onchange="crossfitTrainingForm.preview()"')+
        '<div class="field"><label for="tfTime">Algusaeg (Eesti aeg)</label>'+
        '<select id="tfTime" onchange="crossfitTrainingForm.preview()">'+window.timeOptions(p.time)+'</select></div>'+
      '</div>'+field('tfTitle','Treeningu nimetus',data.title||'CrossFit','maxlength="120" required')+
      '<div class="tf-two">'+
        field('tfDuration','Kestus (min)',String(Number.isFinite(currentDuration)&&currentDuration>0?currentDuration:90),'type="number" min="15" max="240" step="5" required inputmode="numeric"')+
        field('tfCapacity','Kohtade arv',String(data.capacity??12),'type="number" min="1" max="100" required inputmode="numeric"')+
      '</div><p class="tf-help">Uue treeningu vaikimisi kestus on 90 minutit.</p></section>'+
      workout(data)+repeat(data)+details(data)+
      '<div class="tf-actions"><button type="button" id="tfSubmit" class="tf-save" onclick="crossfitTrainingForm.save('+(editing?idOf(data.id):'null')+')">'+
        (editing?'Salvesta muudatused':'Avalda treening')+'</button>'+
      '<button type="button" class="tf-cancel" onclick="closeModal()">Katkesta</button></div>'+
      '</div>';
  }
  function filterWods(value){
    const select=byId('tfWodSelect');if(!select)return;
    const q=String(value||'').trim().toLocaleLowerCase('et');
    const ready=validWods().filter(w=>
      [w.title,w.workout_text,w.source_date].some(x=>String(x||'').toLocaleLowerCase('et').includes(q))
    ).slice(0,80);
    // DOM API väldib kasutaja WOD-teksti lisamist HTML-ina.
    select.replaceChildren(new Option(q?'Leitud WOD-id: '+ready.length:'Vali WOD…',''));
    ready.forEach(w=>select.add(new Option(String(w.title||'WOD'),String(idOf(w.id)))));
  }
  function useWod(){
    const id=idOf(string('tfWodSelect'));
    const w=validWods().find(x=>idOf(x.id)===id);
    const textarea=byId('tfWorkout');
    if(!w||!textarea){window.toast('Vali kinnitatud WOD.');return false}
    const next=String(w.workout_text).trim();
    if(textarea.value.trim()&&textarea.value.trim()!==next){
      if(!window.confirm('WOD-väljal on juba tekst. Kas asendada see valitud WOD-iga?'))return false;
    }
    textarea.value=next;textarea.focus();
    window.toast('WOD lisatud vormile. Avaldamiseks vajuta Salvesta.');
    return true;
  }
  function validateForm(id){
    const date=string('tfDate'),time=string('tfTime'),title=string('tfTitle').trim(),
      duration=number('tfDuration'),capacity=number('tfCapacity'),priceEUR=number('tfPrice'),
      cancel=number('tfCancel');
    const price=Math.round(priceEUR*100),note=string('tfNote').trim(),workout=string('tfWorkout').trim();
    const plan=id?{dates:[date],repeat:false,days:[],weeks:1,time}:formPlan();
    if(!title||title.length>120||!Number.isInteger(duration)||duration<15||duration>240||
      duration%5!==0||!Number.isInteger(capacity)||capacity<1||capacity>100||
      !Number.isFinite(price)||price<0||price>1000000||!Number.isInteger(cancel)||cancel<0||cancel>72||
      !plan.dates.length||plan.dates.length>36||
      (plan.repeat&&plan.days.length===0)){
      return {error:'Kontrolli kuupäeva, nädalapäevi ja treeningu andmeid.'};
    }
    const starts=[];
    try{
      for(const localDate of plan.dates){
        const iso=window.tallinnLocalToIso(localDate,time);
        const local=window.localParts(iso);
        if(local.date!==localDate||local.time!==time)return {error:'Valitud kellaajale ei vasta Eesti ajavööndis kehtiv aeg.'};
        starts.push(iso);
      }
    }catch(_){return {error:'Kuupäeva või kellaaja teisendamine ebaõnnestus.'}}
    const now=Date.now();
    if(!id&&starts.some(iso=>Date.parse(iso)<=now))
      return {error:'Uue treeningu algusaeg peab olema tulevikus.'};
    if(id){
      const existing=s.trainings.find(x=>Number(x.id)===Number(id));
      if(!existing)return {error:'Muudetavat treeningut ei leitud.'};
      const confirmed=(s.registrations||[]).filter(r=>Number(r.training_id)===Number(id)&&r.status==='confirmed').length;
      if(capacity<confirmed)return {error:'Kohtade arv ei tohi olla väiksem kinnitatud registreeringute arvust ('+confirmed+').'};
    }
    return {title,duration,capacity,price,cancel,workout,note,starts,plan};
  }
  async function save(idValue){
    if(!window.isTrainer()||saving||s.modal!=='trainingForm')return false;
    const id=idOf(idValue),data=validateForm(id);
    if(data.error){window.toast(data.error);return false;}
    if(data.starts.length>1&&!window.confirm('Avaldad '+data.starts.length+' treeningut. Kas soovid jätkata?'))return false;
    const existingSlots=(s.trainings||[]).filter(t=>t.status==='published'&&Number(t.id)!==id)
      .map(t=>Date.parse(t.starts_at));
    const repeated=data.starts.filter(x=>existingSlots.includes(Date.parse(x)));
    if(repeated.length&&!window.confirm('Mõne valitud aja kohta on juba treening olemas ('+repeated.length+'). Kas soovid siiski jätkata?'))return false;
    saving=true;
    const button=byId('tfSubmit');if(button){button.disabled=true;button.textContent='Salvestan…'}
    const {title,duration,capacity,price,cancel,workout,note,starts}=data;
    try{
      const fields={title,duration_minutes:duration,capacity,price_cents:price,
        cancellation_hours:cancel,workout:workout||null,note:note||null};
      if(id){
        await window.api('wod_trainings?id=eq.'+id,{
          method:'PATCH',headers:{Prefer:'return=minimal'},
          body:JSON.stringify({...fields,starts_at:starts[0],updated_at:new Date().toISOString()})
        });
      }else{
        await window.api('wod_trainings',{
          method:'POST',headers:{Prefer:'return=minimal'},
          body:JSON.stringify(starts.map(starts_at=>({
            ...fields,starts_at,created_by:s.session.user.id,status:'published'
          })))
        });
      }
      s.modal=null;s.modalData=null;
      await window.reloadData(id?'Treening uuendatud':starts.length===1?'Treening avaldatud':starts.length+' treeningut avaldatud');
      return true;
    }catch(e){window.toast(e.message||'Treeningu salvestamine ebaõnnestus');return false}
    finally{saving=false;if(button?.isConnected){button.disabled=false;button.textContent=id?'Salvesta muudatused':'Avalda treening'}}
  }
  window.trainingForm=form;
  window.saveTrainingForm=save;
  window.crossfitTrainingForm={form,save,preview,repeatChanged:showRecurrence,recurringDates,
    validateForm,filterWods,useWod,formPlan};
})();
