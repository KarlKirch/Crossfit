'use strict';
/* Rõuge CrossFit: toimunud treeningu üks foto, kuupõhine arhiiv.
   Privaatne Supabase Storage. Avalik tekst-WOD jääb kliendi jaoks peidetuks. */
(function(){
  const s=window.state;
  if(!s||typeof window.renderTrainings!=='function'||typeof window.renderModal!=='function'||typeof window.loadData!=='function')return;
  const BASE='https://aanxpugvehwtcwwpefwx.supabase.co';
  const KEY='sb_publishable_ICMR8EF0LK69VjfVRWe0ew_120LIV7A';
  const BUCKET='rcf-training-photos';
  const TTL=3600;
  const pastList=window.renderTrainings,detailView=window.renderModal,load=window.loadData;
  const thumbUrls=new Map(),pending=new Map(),saving=new Set();
  const fmtDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'});
  const fmtMonth=new Intl.DateTimeFormat('et-EE',{timeZone:'UTC',month:'long',year:'numeric'});
  const fmtDay=new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',weekday:'long',day:'numeric',month:'long'});
  const fmtTime=new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',hour:'2-digit',minute:'2-digit'});
  const esc=v=>window.esc(v);
  s.trainingPhotos=s.trainingPhotos||[];
  s.photoArchiveMonth=s.photoArchiveMonth||null;
  s.photoArchiveMineOnly=false;
  const monthOf=t=>fmtDate.format(new Date(t.starts_at)).slice(0,7);
  const dateOf=t=>fmtDate.format(new Date(t.starts_at));
  const idOf=t=>Number.isSafeInteger(Number(t?.id))&&Number(t?.id)>0?Number(t.id):null;
  const finished=t=>!!t&&t.status==='published'&&!t.archived_at&&
    Number.isFinite(Date.parse(t.starts_at))&&
    Date.parse(t.starts_at)+Math.max(0,Number(t.duration_minutes)||0)*60000<=Date.now();
  const trainer=()=>window.isTrainer()&&!s.clientPreview;
  const photo=id=>s.trainingPhotos.find(p=>Number(p.training_id)===Number(id))||null;
  const safePath=path=>/^[0-9]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/.test(String(path||''));
  const encodePath=path=>path.split('/').map(encodeURIComponent).join('/');
  const authHeaders=(more={})=>({apikey:KEY,Authorization:'Bearer '+s.session.access_token,...more});
  const link=path=>{const v=thumbUrls.get(path);return v&&v.exp>Date.now()?v.url:null};
  async function storage(url,options){
    if(!s.session?.access_token||s.clientPreview)throw Error('Sessioon puudub.');
    const res=await fetch(url,options);
    if(!res.ok){
      let message='Foto salvestamise teenus ei vasta.';
      try{const body=await res.json();message=body.message||body.error||message}catch(_){}
      throw Error(message);
    }
    return res.status===204?null:res.json().catch(()=>null);
  }
  async function signed(path){
    if(!safePath(path)||!s.session?.access_token)return null;
    const existing=link(path);if(existing)return existing;
    if(pending.has(path))return pending.get(path);
    const job=(async()=>{
      const result=await storage(BASE+'/storage/v1/object/sign/'+BUCKET+'/'+encodePath(path),{
        method:'POST',headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({expiresIn:TTL})
      });
      const raw=String(result?.signedURL||result?.signedUrl||'');
      const prefix='/storage/v1/object/sign/'+BUCKET+'/';
      const alt='/object/sign/'+BUCKET+'/';
      const relative=raw.startsWith(prefix)?raw:raw.startsWith(alt)?'/storage/v1'+raw:null;
      if(!relative)return null;
      const url=BASE+relative;
      thumbUrls.set(path,{url,exp:Date.now()+(TTL-180)*1000});
      return url;
    })().finally(()=>pending.delete(path));
    pending.set(path,job);return job;
  }
  function hydrate(path,url){
    if(!url||!document?.querySelectorAll)return;
    for(const img of document.querySelectorAll('img[data-pa-photo]')){
      if(img.dataset.paPhoto!==path)continue;
      img.src=url;img.hidden=false;
      const placeholder=img.parentElement?.querySelector('.pa-photo-placeholder');
      if(placeholder)placeholder.hidden=true;
    }
  }
  function warmPhotos(){
    if(s.view!=='trainings'||s.trainingTab!=='past'||!s.session?.access_token)return;
    const month=s.photoArchiveMonth;
    const visible=window.pastTrainings().filter(t=>monthOf(t)===month);
    for(const t of visible.slice(0,30)){
      const row=photo(t.id);
      if(!row||!safePath(row.image_path)||link(row.image_path))continue;
      signed(row.image_path).then(url=>hydrate(row.image_path,url))
        .catch(err=>console.warn('Arhiivi pisipilt:',err));
    }
  }
  window.loadData=async function(){
    await load();
    if(!s.session?.access_token||s.clientPreview){s.trainingPhotos=[];return}
    try{
      const rows=await window.api('wod_training_photos?select=training_id,image_path,updated_at&order=updated_at.desc&limit=500');
      s.trainingPhotos=Array.isArray(rows)?rows.filter(p=>safePath(p.image_path)):[];
      Promise.resolve().then(warmPhotos);
    }catch(e){
      console.warn('Treeningufotode nimekirja laadimine:',e);
      s.trainingPhotos=[];
    }
  };
  function thumbnail(row,trainingId,emptyLabel='Foto puudub'){
    if(!row||!safePath(row.image_path))
      return '<span class="pa-empty-thumb" aria-hidden="true"><span>▧</span><small>'+esc(emptyLabel)+'</small></span>';
    const url=link(row.image_path);
    return '<button type="button" class="pa-thumb" onclick="crossfitPhotoArchive.open('+trainingId+')" aria-label="Vaata treeningukava pilti">'+
      '<span class="pa-photo-placeholder"'+(url?' hidden':'')+'>▧<small>Foto olemas</small></span>'+
      '<img data-pa-photo="'+esc(row.image_path)+'" '+(url?'src="'+esc(url)+'" ':'hidden ')+
      'alt="Treeningukava foto" loading="lazy" decoding="async"></button>';
  }
  function monthShift(month,offset){
    const a=month.split('-').map(Number);
    return new Date(Date.UTC(a[0],a[1]-1+offset,1)).toISOString().slice(0,7);
  }
  const monthText=month=>{
    const raw=fmtMonth.format(new Date(month+'-01T12:00:00Z'));
    return raw.charAt(0).toLocaleUpperCase('et')+raw.slice(1);
  };
  function calendar(month,list){
    const dates=new Map();
    list.forEach(t=>{const key=dateOf(t);const rows=dates.get(key)||[];rows.push(t);dates.set(key,rows)});
    const [year,mm]=month.split('-').map(Number);
    const start=new Date(Date.UTC(year,mm-1,1)).getUTCDay();
    const offset=(start+6)%7;
    const days=new Date(Date.UTC(year,mm,0)).getUTCDate();
    const leading=Array.from({length:offset},()=>'<span class="pa-calendar-empty"></span>').join('');
    const cells=Array.from({length:days},(_,i)=>{
      const day=i+1,key=month+'-'+String(day).padStart(2,'0'),items=dates.get(key)||[];
      const hasPhoto=items.some(t=>!!photo(t.id));
      if(!items.length)return '<span class="pa-day pa-day-empty">'+day+'</span>';
      return '<button type="button" class="pa-day pa-day-training'+(hasPhoto?' pa-day-photo':'')+
        '" onclick="crossfitPhotoArchive.jump(\''+key+'\')" title="'+items.length+' treeningut, '+(hasPhoto?'foto olemas':'fotot ei ole')+
        '" aria-label="'+day+'. '+monthText(month)+': '+items.length+' treeningut'+(hasPhoto?', foto olemas':'')+'">'+
        day+'<span class="pa-dot"></span></button>';
    }).join('');
    return '<div class="pa-calendar" aria-label="Möödunud treeningute kuupäevad">'+
      '<div class="pa-weekdays">'+['E','T','K','N','R','L','P'].map(x=>'<span>'+x+'</span>').join('')+'</div>'+
      '<div class="pa-days">'+leading+cells+'</div>'+
      '<div class="pa-legend"><span><i></i> Foto olemas</span><span><i></i> Treening toimunud</span></div></div>';
  }
  function card(t){
    const id=idOf(t);if(id===null)return '';
    const row=photo(id),available=finished(t),canManage=trainer()&&available;
    const image=thumbnail(row,id);
    return '<article class="pa-archive-card" data-pa-date="'+dateOf(t)+'">'+
      image+'<div class="pa-archive-main">'+
      '<strong>'+esc(fmtDay.format(new Date(t.starts_at)))+'</strong>'+
      '<span>'+esc(t.title||'CrossFit')+' · '+esc(fmtTime.format(new Date(t.starts_at)))+'</span>'+
      '<span class="pa-tag'+(row?' pa-tag-ready':'')+'">'+
      (t.status==='cancelled'?'Treening tühistatud':row?'Kava foto olemas':'Kava foto puudub')+'</span>'+
      '<div class="pa-actions">'+
      '<button type="button" onclick="openTraining('+id+')">Vaata treeningut</button>'+
      (canManage?'<button type="button" class="pa-manage" onclick="crossfitPhotoArchive.choose('+id+')">'+(row?'Asenda foto':'+ Lisa foto')+'</button>':'')+
      '</div>'+(trainer()?'<button type="button" class="tl-history-remove" onclick="deleteTraining('+id+')">Eemalda ajaloost</button>':'')+'</article>';
  }
  window.renderTrainings=function(){
    const base=pastList();
    if(s.trainingTab!=='past')return base;
    const all=window.pastTrainings(),first=all[0],last=all[all.length-1];
    const recent=first?monthOf(first):fmtDate.format(new Date()).slice(0,7);
    if(!s.photoArchiveMonth)s.photoArchiveMonth=recent;
    const selected=s.photoArchiveMonth;
    const oldest=last?monthOf(last):selected;
    const limit=recent;
    const maxMine=!trainer()&&s.photoArchiveMineOnly;
    const current=all.filter(t=>monthOf(t)===selected&&
      (!maxMine||s.registrations.some(r=>Number(r.training_id)===Number(t.id)&&
      r.user_id===s.session?.user?.id&&r.status==='confirmed')));
    const days=[...new Set(current.map(dateOf))];
    const records=current.map(card).join('');
    const archive='<section class="pa-archive" aria-label="Treeningute fotoarhiiv">'+
      '<div class="pa-heading"><div><h2>Treeningute arhiiv</h2><p>Vali kuu või kuupäev ja vaata treeningukava fotot.</p></div>'+
      '<span class="pa-photo-count">'+current.filter(t=>!!photo(t.id)).length+' fotot</span></div>'+
      '<div class="pa-month-nav">'+
      '<button type="button" aria-label="Eelmine kuu" onclick="crossfitPhotoArchive.month(-1)" '+(selected<=oldest?'disabled':'')+'>‹</button>'+
      '<strong>'+esc(monthText(selected))+'</strong>'+
      '<button type="button" aria-label="Järgmine kuu" onclick="crossfitPhotoArchive.month(1)" '+(selected>=limit?'disabled':'')+'>›</button></div>'+
      (!trainer()?'<label class="pa-mine"><input type="checkbox" '+(maxMine?'checked ':'')+
       'onchange="crossfitPhotoArchive.mine(this.checked)"> Ainult minu registreeritud treeningud</label>':'')+
      calendar(selected,current)+
      '<div class="pa-results" aria-live="polite">'+
      (days.length?'<span class="pa-results-count">'+current.length+' treeningut</span>':'')+
      (records||'<div class="pa-empty">Selles kuus sobivaid möödunud treeninguid ei ole.</div>')+
      '</div></section>';
    const anchor='<div class="tl-groups">';
    const i=base.indexOf(anchor);
    Promise.resolve().then(warmPhotos);
    return i<0?base+archive:base.slice(0,i)+archive+'</div>';
  };
  function photoSection(t){
    if(!finished(t))return '';
    const id=idOf(t);if(id===null)return '';
    const row=photo(id),busy=saving.has(id),canManage=trainer();
    return '<section class="pa-detail" aria-label="Treeningukava foto">'+
      '<div class="pa-detail-heading"><h3>Treeningukava foto</h3><span>'+esc(fmtDay.format(new Date(t.starts_at)))+'</span></div>'+
      (row?'<div class="pa-detail-photo">'+thumbnail(row,id)+'</div>':
       '<div class="pa-detail-empty">Selle treeningu kava fotot ei ole veel lisatud.</div>')+
      (canManage?'<div class="pa-detail-actions">'+
        '<button type="button" class="pa-upload" '+(busy?'disabled ':'')+
        'onclick="crossfitPhotoArchive.choose('+id+')">'+(busy?'Salvestan…':row?'Asenda foto':'+ Lisa foto')+'</button>'+
        (row?'<button type="button" class="pa-delete" '+(busy?'disabled ':'')+
        'onclick="crossfitPhotoArchive.remove('+id+')">Kustuta foto</button>':'')+
        '<input type="file" class="pa-file" id="pa-file-'+id+'" accept="image/*" hidden '+
        'onchange="crossfitPhotoArchive.onFile(event,'+id+')"></div>':'')+
      '</section>';
  }
  window.renderModal=function(){
    const html=detailView();
    if(s.modal!=='training')return html;
    const t=s.trainings.find(x=>Number(x.id)===Number(s.modalData));
    if(!finished(t)||!html)return html;
    const tag='<div class="td-content">';
    return html.replace(tag,tag+photoSection(t));
  };
  async function getPhotoUrl(id){
    const row=photo(id);
    return row&&safePath(row.image_path)?signed(row.image_path):null;
  }
  let preview=null;
  function dismiss(){
    if(!preview)return;
    preview.remove();preview=null;
    document.body.classList.remove('pa-preview-open');
  }
  function close(){
    if(history.state?.paPhotoPreview&&history.length>1){dismiss();history.back()}
    else dismiss();
  }
  async function open(id){
    const t=s.trainings.find(x=>Number(x.id)===Number(id));
    if(!finished(t)||!photo(id)||!s.session?.access_token)return false;
    let url;
    try{url=await getPhotoUrl(id)}catch(err){window.toast('Pilti ei õnnestunud avada.');return false}
    if(!url)return false;
    dismiss();
    const overlay=document.createElement('div');
    overlay.className='pa-preview';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Treeningukava foto');
    overlay.innerHTML='<div class="pa-preview-content">'+
      '<button type="button" class="pa-preview-close" aria-label="Sulge foto">×</button>'+
      '<img src="'+esc(url)+'" alt="Treeningukava foto – '+esc(fmtDay.format(new Date(t.starts_at)))+'">'+
      '<p>Suurendamiseks kasuta kahe sõrmega liigutust.</p></div>';
    overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
    overlay.querySelector('.pa-preview-close')?.addEventListener('click',close);
    preview=overlay;document.body.appendChild(overlay);
    document.body.classList.add('pa-preview-open');
    try{history.pushState({...history.state,paPhotoPreview:true},'',location.href)}catch(_){}
    return true;
  }
  window.addEventListener('popstate',()=>dismiss());
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&preview){event.preventDefault();close()}});
  function redraw(){
    if(s.modal==='training'&&typeof window.renderKeepingTrainingScroll==='function')window.renderKeepingTrainingScroll();
    else{
      const top=window.scrollY||0;
      window.render();
      if(typeof window.scrollTo==='function')window.scrollTo({top,behavior:'instant'});
    }
  }
  function choose(id){
    const t=s.trainings.find(x=>Number(x.id)===Number(id));
    if(!trainer()||!finished(t)||saving.has(Number(id)))return false;
    let input=document.getElementById('pa-file-'+id);
    if(!input){
      input=document.createElement('input');input.type='file';input.accept='image/*';input.hidden=true;
      input.addEventListener('change',event=>{void onFile(event,id);input.remove()});
      document.body.appendChild(input);
    }
    input.click();
    return true;
  }
  function compress(file){
    if(!file||!file.type.startsWith('image/')||file.size>20*1024*1024)
      return Promise.reject(Error('Vali kuni 20 MB suurune pildifail.'));
    return new Promise((resolve,reject)=>{
      const address=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{
        URL.revokeObjectURL(address);
        const size=Math.max(img.naturalWidth,img.naturalHeight);
        if(!size){reject(Error('Pilti ei saa avada.'));return}
        const ratio=Math.min(1,2200/size);
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
        canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
        const ctx=canvas.getContext('2d');
        if(!ctx){reject(Error('Pildi töötlemine ei õnnestunud.'));return}
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{
          if(!blob||blob.size>6*1024*1024)reject(Error('Pilt on liiga suur. Vali väiksem foto.'));
          else resolve(blob);
        },'image/jpeg',0.86);
      };
      img.onerror=()=>{
        URL.revokeObjectURL(address);
        if(file.type==='image/jpeg'&&file.size<=6*1024*1024)resolve(file);
        else reject(Error('Selle pildifaili vormingut ei saa avada. Proovi JPG-fotot.'));
      };
      img.src=address;
    });
  }
  async function removeFile(path){
    if(!safePath(path))return;
    await storage(BASE+'/storage/v1/object/'+BUCKET,{
      method:'DELETE',headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({prefixes:[path]})
    });
    thumbUrls.delete(path);
  }
  async function onFile(event,id){
    const file=event?.target?.files?.[0];
    if(event?.target)event.target.value='';
    const t=s.trainings.find(x=>Number(x.id)===Number(id));
    if(!file||!trainer()||!finished(t)||saving.has(Number(id)))return false;
    saving.add(Number(id));
    let newPath=null,uploaded=false;
    try{
      const jpeg=await compress(file);
      const uuid=crypto?.randomUUID?.();
      if(!uuid)throw Error('Pildi identifikaatori loomine ebaõnnestus.');
      newPath=String(id)+'/'+uuid+'.jpg';
      const previous=photo(id);
      window.toast('Salvestan treeningukava fotot…');
      await storage(BASE+'/storage/v1/object/'+BUCKET+'/'+encodePath(newPath),{
        method:'POST',headers:authHeaders({'Content-Type':'image/jpeg','x-upsert':'false'}),
        body:jpeg
      });
      uploaded=true;
      const rows=await window.api('wod_training_photos?on_conflict=training_id',{
        method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({
          training_id:Number(id),image_path:newPath,
          uploaded_by:s.session.user.id,updated_at:new Date().toISOString()
        })
      });
      if(!Array.isArray(rows)||!rows.length)throw Error('Andmebaas ei kinnitanud foto salvestamist.');
      s.trainingPhotos=s.trainingPhotos.filter(p=>Number(p.training_id)!==Number(id));
      s.trainingPhotos.push(rows[0]);
      if(previous&&previous.image_path!==newPath)
        removeFile(previous.image_path).catch(err=>console.warn('Vana foto puhastamine:',err));
      const url=await signed(newPath).catch(()=>null);
      if(url)hydrate(newPath,url);
      window.toast('Treeningukava foto lisatud.');
      return true;
    }catch(error){
      if(uploaded&&newPath)removeFile(newPath).catch(()=>{});
      window.toast(error.message||'Foto salvestamine ebaõnnestus.');
      return false;
    }finally{
      saving.delete(Number(id));
      redraw();
    }
  }
  async function remove(id){
    const t=s.trainings.find(x=>Number(x.id)===Number(id)),row=photo(id);
    if(!trainer()||!finished(t)||!row||saving.has(Number(id)))return false;
    if(!window.confirm('Kas kustutada selle treeningu kava foto?'))return false;
    saving.add(Number(id));
    try{
      await window.api('wod_training_photos?training_id=eq.'+Number(id),{
        method:'DELETE',headers:{Prefer:'return=minimal'}
      });
      s.trainingPhotos=s.trainingPhotos.filter(p=>Number(p.training_id)!==Number(id));
      removeFile(row.image_path).catch(err=>console.warn('Foto faili eemaldamine:',err));
      window.toast('Treeningukava foto kustutatud.');
      return true;
    }catch(error){
      window.toast(error.message||'Foto kustutamine ebaõnnestus.');return false;
    }finally{saving.delete(Number(id));redraw()}
  }
  function month(offset){
    if(!Number.isInteger(offset)||Math.abs(offset)!==1||s.trainingTab!=='past')return;
    const all=window.pastTrainings();
    const first=all[0],last=all[all.length-1];
    if(!first||!last)return;
    const target=monthShift(s.photoArchiveMonth||monthOf(first),offset);
    if(target<monthOf(last)||target>monthOf(first))return;
    s.photoArchiveMonth=target;
    window.render();
    Promise.resolve().then(warmPhotos);
  }
  function mine(checked){
    s.photoArchiveMineOnly=Boolean(checked);
    if(s.trainingTab==='past')window.render();
  }
  function jump(key){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key)))return;
    document.querySelector('.pa-archive-card[data-pa-date="'+key+'"]')?.scrollIntoView?.({behavior:'smooth',block:'center'});
  }
  window.crossfitPhotoArchive={photo,finished,render:()=>window.renderTrainings(),open,close,
    choose,onFile,remove,month,mine,jump,signed};
})();