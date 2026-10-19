'use strict';

(function(){
  const s=window.state;
  if(!s) return;

  const SB_URL='https://aanxpugvehwtcwwpefwx.supabase.co';
  const SB_KEY='sb_publishable_ICMR8EF0LK69VjfVRWe0ew_120LIV7A';
  const BUCKET='wod-bank';
  const baseRenderModal=window.renderModal;
  const imageCache=new Map();

  function displayDate(date){
    if(!date) return '';
    const [y,m,d]=String(date).split('-');
    return y&&m&&d?`${d}.${m}.${y}`:String(date);
  }

  function dateFromFile(file){
    const m=String(file?.name||'').match(/(20\d{2})(\d{2})(\d{2})/);
    if(m) return `${m[1]}-${m[2]}-${m[3]}`;
    if(file?.lastModified){
      try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn'}).format(new Date(file.lastModified))}
      catch(_){}
    }
    return null;
  }

  function safeExt(file){
    const name=String(file?.name||'');
    const ext=(name.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]||'').toLowerCase();
    if(['jpg','jpeg','png','webp','heic','heif'].includes(ext)) return ext;
    const byType={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif'};
    return byType[file?.type]||'jpg';
  }

  function storagePath(file){
    const uid=s.session.user.id;
    const stamp=Date.now();
    const rand=(crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,12);
    return `${uid}/${stamp}-${rand}.${safeExt(file)}`;
  }

  function encPath(path){return String(path).split('/').map(encodeURIComponent).join('/')}

  function authHeaders(extra={}){
    return {apikey:SB_KEY,Authorization:'Bearer '+s.session.access_token,...extra};
  }

  async function storageRequest(url,opt={}){
    const r=await fetch(url,opt);
    if(!r.ok){
      const txt=await r.text().catch(()=>'');
      let msg=txt;
      try{const j=JSON.parse(txt);msg=j.message||j.error||j.msg||txt}catch(_){}
      throw new Error(msg||`Storage HTTP ${r.status}`);
    }
    return r;
  }

  async function uploadOriginal(file,path){
    await storageRequest(`${SB_URL}/storage/v1/object/${BUCKET}/${encPath(path)}`,{
      method:'POST',
      headers:authHeaders({
        'Content-Type':file.type||'application/octet-stream',
        'x-upsert':'false',
        'cache-control':'3600'
      }),
      body:file
    });
  }

  async function removeOriginal(path){
    if(!path) return;
    await storageRequest(`${SB_URL}/storage/v1/object/${BUCKET}`,{
      method:'DELETE',
      headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({prefixes:[path]})
    });
  }

  async function imageUrl(path){
    if(!path) return '';
    if(imageCache.has(path)) return imageCache.get(path);
    const r=await storageRequest(`${SB_URL}/storage/v1/object/authenticated/${BUCKET}/${encPath(path)}`,{
      headers:authHeaders()
    });
    const url=URL.createObjectURL(await r.blob());
    imageCache.set(path,url);
    return url;
  }

  async function attach(entry,file){
    if(!entry||!file) return;
    if(!String(file.type||'').startsWith('image/')) throw new Error('Vali pildifail');
    if(file.size>25*1024*1024) throw new Error('Pilt on liiga suur. Maksimum on 25 MB.');
    const path=storagePath(file);
    await uploadOriginal(file,path);
    try{
      await window.api(`wod_bank_entries?id=eq.${entry.id}`,{
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({
          image_path:path,
          source_filename:file.name||entry.source_filename||null,
          updated_at:new Date().toISOString()
        })
      });
    }catch(e){
      await removeOriginal(path).catch(()=>{});
      throw e;
    }
  }

  function driveViewUrl(id){
    return id?'https://drive.google.com/file/d/'+encodeURIComponent(id)+'/view':'';
  }

  function driveThumbUrl(id){
    return id?'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w1000':'';
  }

  function meaningfulDraft(value){return String(value||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().length>0}

  function statusMeta(status){
    if(status==='ready') return ['Valmis','green'];
    if(status==='review') return ['Kinnitamata','amber'];
    return ['Töötlemata',''];
  }

  function sheet(title,body){
    return `<div class="sheet-backdrop" onclick="backdropClose(event)"><div class="sheet" onclick="event.stopPropagation()"><div class="sheet-head"><div class="sheet-title">${window.esc(title)}</div><button class="sheet-close" onclick="closeModal()" aria-label="Sulge">×</button></div><div class="sheet-body">${body}</div></div></div>`;
  }

  function card(e){
    const st=statusMeta(e.status);
    const txt=(e.workout_text||e.draft_text||'').trim();
    const excerpt=txt?window.esc(txt.slice(0,150))+(txt.length>150?'…':''):'Tekstimustandit pole veel.';
    const thumb=e.image_path
      ? `<img data-wod-import-path="${window.esc(e.image_path)}" alt="WOD originaalpilt" style="width:100%;height:100%;object-fit:cover;display:block">`
      : e.source_drive_file_id
        ? `<img src="${window.esc(driveThumbUrl(e.source_drive_file_id))}" alt="WOD originaalpilt Google Drive'is" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none'">`
        : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:11px;color:#7a837e">Originaalpilt<br>lisamata</div>';
    return `<div class="client-card" onclick="openWodEntry(${e.id})" style="cursor:pointer">
      <div class="client-top"><div style="min-width:0"><div class="client-name">${window.esc(e.title||'WOD')}</div><div class="client-meta">${e.source_date?displayDate(e.source_date):window.shortDate(e.created_at)}${(e.image_path||e.source_drive_file_id)?'':' · pilt puudu'}</div></div><span class="pill ${st[1]}">${st[0]}</span></div>
      <div style="display:grid;grid-template-columns:84px 1fr;gap:10px;margin-top:10px;align-items:start"><div style="width:84px;height:108px;border-radius:10px;overflow:hidden;background:#eef1ef">${thumb}</div><div class="card-sub" style="white-space:pre-line;max-height:108px;overflow:hidden">${excerpt}</div></div>
    </div>`;
  }

  function bankSheet(){
    const pending=s.wodBank.filter(x=>x.status==='pending').length;
    const review=s.wodBank.filter(x=>x.status==='review').length;
    const missing=s.wodBank.filter(x=>!x.image_path&&!x.source_drive_file_id).length;
    const driveLinked=s.wodBank.filter(x=>!x.image_path&&x.source_drive_file_id).length;
    const missingDrafts=s.wodBank.filter(x=>x.image_path&&!meaningfulDraft(x.draft_text)).length;
    setTimeout(hydrate,30);
    return `<div class="card">
      <div class="card-title">Privaatne WOD-pank</div>
      <div class="card-sub">Originaalpilt ja redigeeritav WOD-tekst jäävad mõlemad alles.</div>
      <div id="wodBatchOcrProgress" class="card-sub" style="margin-top:8px">${missingDrafts?`Tekstimustandita pilte: ${missingDrafts}. Vajuta nuppu või jäta WOD-pank avatuks – edenemine kuvatakse siin.`:'Kõigil piltidel on tekstimustand olemas.'}</div>
      <div class="training-actions" style="margin-top:12px">
        <button class="btn btn-primary" onclick="pickWodCamera()">Tee pilt</button>
        <button class="btn btn-soft" onclick="pickWodGallery()">Vali galeriist</button>
        ${missing?`<button class="btn btn-soft" onclick="pickOldWodImages()">Lisa ${missing} vana originaalpilti</button>`:''}
        ${missingDrafts?`<button class="btn btn-primary" onclick="buildAllWodDrafts()">Loo tekstimustandid (${missingDrafts})</button>`:''}
      </div>
      <input id="oldWodImagesInput" type="file" accept="image/*" multiple style="display:none" onchange="oldWodImagesPicked(this)">
    </div>
    <div class="metric-grid" style="margin-top:12px">${window.metric(s.wodBank.length,'WOD-i')}${window.metric(review,'Vajab ülevaatust')}${window.metric(driveLinked,'Drive originaal')}${window.metric(missing,'Pilti puudu')}</div>
    <div class="section"><h2>Treeningud</h2><small>${s.wodBank.length}</small></div>
    <div class="stack">${s.wodBank.map(card).join('')||'<div class="empty">WOD-pank on tühi.</div>'}</div>`;
  }

  function detailImage(e){
    if(e.image_path){
      setTimeout(hydrate,30);
      return `<div style="border-radius:14px;overflow:hidden;background:#eef1ef;margin-bottom:12px"><img data-wod-import-path="${window.esc(e.image_path)}" onclick="event.stopPropagation();openWodImage(\'${window.esc(e.image_path)}\')" alt="WOD originaalpilt" title="Ava originaalsuuruses" style="width:100%;max-height:480px;object-fit:contain;display:block;cursor:zoom-in"></div>`;
    }
    if(e.source_drive_file_id){
      const thumb=driveThumbUrl(e.source_drive_file_id);
      const view=driveViewUrl(e.source_drive_file_id);
      return `<div style="border-radius:14px;overflow:hidden;background:#eef1ef;margin-bottom:8px"><img src="${window.esc(thumb)}" alt="WOD originaalpilt Google Drive'is" style="width:100%;max-height:480px;object-fit:contain;display:block"></div><div class="training-actions" style="margin-bottom:12px"><a class="btn btn-soft" href="${window.esc(view)}" target="_blank" rel="noopener">Ava originaal Drive'is</a></div>`;
    }
    return `<div class="card" style="margin-bottom:12px;border-style:dashed"><div class="card-title">Originaalpilt on veel lisamata</div><div class="card-sub">Tekst on juba WOD-pangas. Lisa selle juurde sama kuupäeva originaalfoto.</div><div class="training-actions" style="margin-top:10px"><button class="btn btn-primary" onclick="pickOneOldWodImage(${e.id})">Lisa originaalpilt</button></div><input id="oneOldWodInput-${e.id}" type="file" accept="image/*" style="display:none" onchange="oneOldWodImagePicked(${e.id},this)"></div>`;
  }

  function detailSheet(e){
    const st=statusMeta(e.status);
    const hasText=(e.workout_text||e.draft_text||'').trim();
    return `${detailImage(e)}
      <div class="training-meta" style="margin-bottom:12px"><span class="pill ${st[1]}">${st[0]}</span><span class="pill ${(e.image_path||e.source_drive_file_id)?'green':'amber'}">${e.image_path?'Originaalpilt Supabase’is':(e.source_drive_file_id?'Originaalpilt Drive’is':'Originaalpilt puudu')}</span></div>
      <div class="form">
        <div class="form-grid"><div class="field"><label>Kuupäev</label><input id="wodDate" type="date" value="${window.esc(e.source_date||'')}"></div><div class="field"><label>Pealkiri</label><input id="wodTitle" maxlength="120" value="${window.esc(e.title||'WOD')}"></div></div>
        <div class="field"><label>Lõplik WOD-tekst</label><textarea id="wodText" style="min-height:260px" placeholder="Paranda või täienda teksti siin...">${window.esc(e.workout_text||e.draft_text||'')}</textarea></div>
        ${e.draft_text?`<details class="card" style="box-shadow:none"><summary style="cursor:pointer;font-weight:700">Vaata algmustandit</summary><div class="card-sub" style="white-space:pre-wrap;margin-top:10px">${window.esc(e.draft_text)}</div></details>`:''}
        <div class="form-actions"><button class="btn btn-dark" onclick="copyWodText(${e.id})">Kopeeri kogu WOD</button><button class="btn btn-primary" onclick="saveWodEntry(${e.id},true)">Kinnita valmis</button><button class="btn btn-soft" onclick="saveWodEntry(${e.id},false)">Salvesta mustand</button>${e.image_path?'<button class="btn btn-soft" onclick="retryWodDraft('+e.id+')">Loo tekstimustand uuesti</button>':''}</div>
        <div class="training-actions"><button class="btn btn-dark" onclick="useWodInTraining(${e.id})" ${hasText?'':'disabled'}>Kasuta treeningus</button><button class="btn btn-danger" onclick="deleteWodEntry(${e.id})">Kustuta WOD</button></div>
      </div>`;
  }

  async function hydrate(){
    const imgs=[...document.querySelectorAll('img[data-wod-import-path]')];
    await Promise.all(imgs.map(async img=>{
      const path=img.getAttribute('data-wod-import-path');
      if(!path||img.dataset.loaded==='1') return;
      try{img.src=await imageUrl(path);img.dataset.loaded='1'}catch(e){console.warn(e)}
    }));
  }

  window.pickOldWodImages=function(){document.getElementById('oldWodImagesInput')?.click()};

  window.oldWodImagesPicked=async function(input){
    const files=[...(input?.files||[])];
    if(!files.length) return;
    input.value='';
    let attached=0,skipped=0;
    const used=new Set();
    window.toast(`Lisan ${files.length} originaalpilti…`);

    for(const file of files){
      const date=dateFromFile(file);
      const entry=s.wodBank.find(x=>!x.image_path&&!used.has(x.id)&&(
        (date&&x.source_date===date) ||
        (x.source_filename&&x.source_filename===file.name)
      ));
      if(!entry){skipped++;continue}
      try{await attach(entry,file);used.add(entry.id);attached++}catch(e){console.warn(e);skipped++}
    }

    await window.reloadData(attached?`${attached} originaalpilti lisatud`:'Sobivaid pilte ei leitud');
    s.modal='wodBank';s.modalData=null;window.render();setTimeout(hydrate,30);
    if(skipped) window.toast(`${attached} lisatud, ${skipped} jäi sobitamata`);
  };

  window.pickOneOldWodImage=function(id){document.getElementById(`oneOldWodInput-${id}`)?.click()};

  window.oneOldWodImagePicked=async function(id,input){
    const file=input?.files?.[0];
    if(!file) return;
    input.value='';
    const entry=s.wodBank.find(x=>x.id===id);
    if(!entry) return;
    try{
      window.toast('Salvestan originaalpilti…');
      await attach(entry,file);
      await window.reloadData('Originaalpilt lisatud');
      s.modal='wodDetail';s.modalData=id;window.render();setTimeout(hydrate,30);
    }catch(e){window.toast(e.message||'Originaalpildi lisamine ebaõnnestus')}
  };

  window.renderModal=function(){
    if(s.modal==='wodBank') return sheet('WOD-pank',bankSheet());
    if(s.modal==='wodDetail'){
      const e=s.wodBank.find(x=>x.id===s.modalData);
      if(!e) return '';
      return sheet('WOD',detailSheet(e));
    }
    return baseRenderModal();
  };

  Object.assign(window,{pickOldWodImages,oldWodImagesPicked,pickOneOldWodImage,oneOldWodImagePicked});
})();
