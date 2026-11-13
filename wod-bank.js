'use strict';

(function(){
  const s=window.state;
  if(!s) return;

  const SB_URL='https://aanxpugvehwtcwwpefwx.supabase.co';
  const SB_KEY='sb_publishable_ICMR8EF0LK69VjfVRWe0ew_120LIV7A';
  const BUCKET='wod-bank';

  const baseLoadData=window.loadData;
  const baseRenderMore=window.renderMore;
  const baseRenderModal=window.renderModal;
  const baseQuickSheet=window.quickSheet;
  const baseCloseModal=window.closeModal;
  const baseBackdropClose=window.backdropClose;

  s.wodBank=s.wodBank||[];
  s.wodBankScrollTop=s.wodBankScrollTop||0;

  const imageUrlCache=new Map();

  const bankIcon='<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>';
  const cameraIcon='<svg viewBox="0 0 24 24"><path d="M4 7h4l1.5-2h5L16 7h4v12H4V7Z"/><circle cx="12" cy="13" r="4"/></svg>';

  function statusMeta(status){
    if(status==='ready') return ['Valmis','green'];
    if(status==='review') return ['Kinnitamata','amber'];
    return ['Töötlemata',''];
  }

  function today(){
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn'}).format(new Date());
  }

  // Automaatne 'WOD' / 'WOD + kuupäev' ei ole kasutaja kirjutatud pealkiri.
  // Näita nende kirjete redigeerimisvälja tühjana; käsitsi antud nimetused säilivad.
  function wodEditableTitle(raw){
    const title=String(raw||'').trim();
    return /^WOD(?:[\s-]+(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}))?$/i.test(title)?'':title;
  }
  window.wodEditableTitle=wodEditableTitle;

  function displayDate(date){
    if(!date) return '';
    const [y,m,d]=String(date).split('-');
    return y&&m&&d?`${d}.${m}.${y}`:String(date);
  }

  function dateFromFile(file){
    // Galeriist valides eelista pildifaili loomise/muutmise kuupäeva
    // failinimes sisalduvale võimalikule vanale kuupäevale.
    if(Number.isFinite(file?.lastModified)&&file.lastModified>0){
      const date=new Date(file.lastModified);
      if(Number.isFinite(date.getTime())){
        return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
      }
    }
    const m=String(file?.name||'').match(/(20\d{2})(\d{2})(\d{2})/);
    if(m)return m[1]+'-'+m[2]+'-'+m[3];
    return today();
  }

  function safeExt(file){
    const name=String(file?.name||'');
    const ext=(name.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]||'').toLowerCase();
    if(['jpg','jpeg','png','webp','heic','heif'].includes(ext)) return ext;
    const byType={
      'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
      'image/heic':'heic','image/heif':'heif'
    };
    return byType[file?.type]||'jpg';
  }

  function storagePath(file){
    const uid=s.session.user.id;
    const stamp=Date.now();
    const rand=(crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,12);
    return `${uid}/${stamp}-${rand}.${safeExt(file)}`;
  }

  function encPath(path){
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  function authHeaders(extra={}){
    return {
      apikey:SB_KEY,
      Authorization:'Bearer '+s.session.access_token,
      ...extra
    };
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

  async function downloadOriginal(path){
    const cached=imageUrlCache.get(path);
    if(cached?.blob) return cached.blob;
    const r=await storageRequest(`${SB_URL}/storage/v1/object/authenticated/${BUCKET}/${encPath(path)}`,{
      headers:authHeaders()
    });
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const old=imageUrlCache.get(path);
    if(old?.url) URL.revokeObjectURL(old.url);
    imageUrlCache.set(path,{url,blob});
    return blob;
  }

  async function getImageUrl(path){
    const cached=imageUrlCache.get(path);
    if(cached?.url) return cached.url;
    await downloadOriginal(path);
    return imageUrlCache.get(path)?.url||'';
  }

  async function deleteOriginal(path){
    await storageRequest(`${SB_URL}/storage/v1/object/${BUCKET}`,{
      method:'DELETE',
      headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({prefixes:[path]})
    });
    const cached=imageUrlCache.get(path);
    if(cached?.url) URL.revokeObjectURL(cached.url);
    imageUrlCache.delete(path);
  }

  window.loadData=async function(){
    await baseLoadData();
    if(!window.isTrainer()){
      s.wodBank=[];
      return;
    }
    s.wodBank=await window.api('wod_bank_entries?select=*&order=source_date.desc.nullslast,created_at.desc')||[];
    s.wodBank.sort((a,b)=>{
      const ad=a.source_date||'';
      const bd=b.source_date||'';
      if(ad!==bd) return bd.localeCompare(ad);
      return String(b.created_at||'').localeCompare(String(a.created_at||''));
    });
  };

  function menuItem(){
    const pending=s.wodBank.filter(x=>x.status==='pending').length;
    const review=s.wodBank.filter(x=>x.status==='review').length;
    const countText=[pending?`${pending} töötlemata`:'',review?`${review} ülevaatamisel`:''].filter(Boolean).join(' · ')||`${s.wodBank.length} kirjet`;
    return `<button class="menu-item" onclick="openWodBank()"><div class="menu-main"><div class="menu-icon">${bankIcon}</div><div><div class="menu-label">WOD-pank</div><div class="menu-desc">Privaatne treeningukogu · ${countText}</div></div></div><span class="chev">›</span></button>`;
  }

  window.renderMore=function(){
    const html=baseRenderMore();
    if(!window.isTrainer()) return html;
    const marker='<button class="menu-item" onclick="openAnnouncement()">';
    return html.includes(marker)?html.replace(marker,menuItem()+marker):html+menuItem();
  };

  window.quickSheet=function(){
    const html=baseQuickSheet();
    if(!window.isTrainer()) return html;
    const btn=`<button class="quick" onclick="openWodBank()">${cameraIcon}<b>WOD-pank</b><span>Tee pilt või vali galeriist</span></button>`;
    const pos=html.lastIndexOf('</div>');
    return pos>=0?html.slice(0,pos)+btn+html.slice(pos):html+btn;
  };

  function sheet(title,body){
    return `<div class="sheet-backdrop" onclick="backdropClose(event)"><div class="sheet" onclick="event.stopPropagation()"><div class="sheet-head"><div class="sheet-title">${window.esc(title)}</div><button class="sheet-close" onclick="closeModal()" aria-label="Sulge">×</button></div><div class="sheet-body">${body}</div></div></div>`;
  }

  function bankCard(e){
    const st=statusMeta(e.status);
    const txt=(e.workout_text||e.draft_text||'').trim();
    const excerpt=txt?window.esc(txt.slice(0,150))+(txt.length>150?'…':''):'Tekstimustandit pole veel.';
    return `<div class="client-card" onclick="openWodEntry(${e.id})" style="cursor:pointer">
      <div class="client-top">
        <div style="min-width:0">
          <div class="client-name">${window.esc(e.title||'WOD')}</div>
          <div class="client-meta">${e.source_date?displayDate(e.source_date):window.shortDate(e.created_at)}</div>
        </div>
        <span class="pill ${st[1]}">${st[0]}</span>
      </div>
      <div style="display:grid;grid-template-columns:84px 1fr;gap:10px;margin-top:10px;align-items:start">
        <div style="width:84px;height:108px;border-radius:10px;overflow:hidden;background:#eef1ef">
          <img data-wod-path="${window.esc(e.image_path)}" alt="WOD originaalpilt" style="width:100%;height:100%;object-fit:cover;display:block">
        </div>
        <div class="card-sub" style="white-space:pre-line;max-height:108px;overflow:hidden">${excerpt}</div>
      </div>
    </div>`;
  }

  function wodBankSheet(){
    queueHydrate();
    const pending=s.wodBank.filter(x=>x.status==='pending').length;
    const review=s.wodBank.filter(x=>x.status==='review').length;
    return `<div class="card">
      <div class="card-title">Privaatne WOD-pank</div>
      <div class="card-sub">Lisa foto galeriist või pildista tahvlit. Foto salvestatakse ka tühja WOD-i kavaga ning teksti võid hiljem käsitsi juurde kirjutada.</div>
      <div class="training-actions" style="margin-top:12px">
        <button class="btn btn-primary" onclick="pickWodCamera()">Tee pilt</button>
        <button class="btn btn-soft" onclick="pickWodGallery()">Vali galeriist</button>
      </div>
      <input id="wodCameraInput" type="file" accept="image/*" capture="environment" style="display:none" onchange="wodFilePicked(this)">
      <input id="wodGalleryInput" type="file" accept="image/*" style="display:none" onchange="wodFilePicked(this)">
      <div class="card-sub" style="margin-top:8px">Teksti lisamine on vabatahtlik. Automaatset pildilugemist ei kasutata.</div>
    </div>
    <div class="metric-grid" style="margin-top:12px">
      ${window.metric(s.wodBank.length,'WOD-i')}
      ${window.metric(pending,'Tekstita fotot')}
      ${window.metric(review,'Vajab ülevaatust')}
    </div>
    <div class="section"><h2>Treeningud</h2><small>${s.wodBank.length}</small></div>
    <div class="stack">${s.wodBank.map(bankCard).join('')||'<div class="empty">WOD-pank on veel tühi. Tee esimene pilt või vali olemasolev foto galeriist.</div>'}</div>`;
  }

  function detailImage(e){
    return `<div style="border-radius:14px;overflow:hidden;background:#eef1ef;margin-bottom:12px">
      <img data-wod-path="${window.esc(e.image_path)}" onclick="event.stopPropagation();openWodImage('${window.esc(e.image_path)}')" alt="WOD originaalpilt" title="Ava originaalsuuruses" style="width:100%;max-height:480px;object-fit:contain;display:block;cursor:zoom-in">
    </div>`;
  }

  function wodDetailSheet(e){
    queueHydrate();
    const st=statusMeta(e.status);
    return `${detailImage(e)}
      <div class="training-meta" style="margin-bottom:12px"><span class="pill ${st[1]}">${st[0]}</span><span class="pill">Originaalpilt säilitatud</span></div>
      <div class="form">
        <div class="form-grid">
          <div class="field"><label>Kuupäev</label><input id="wodDate" type="date" value="${window.esc(e.source_date||'')}"></div>
          <div class="field"><label>Pealkiri</label><input id="wodTitle" maxlength="120" value="${window.esc(wodEditableTitle(e.title))}"></div>
        </div>
        <div class="field">
          <label>WOD-i kava (valikuline)</label>
          <textarea id="wodText" style="min-height:260px" placeholder="Lisa soovi korral kava käsitsi. Võid jätta tühjaks.">${window.esc(e.workout_text||e.draft_text||'')}</textarea>
        </div>
        <p class="card-sub">Originaalfoto säilib ka siis, kui jätad tekstivälja tühjaks.</p>
        <div class="form-actions">
          <button class="btn btn-dark" onclick="copyWodText(${e.id})">Kopeeri kogu WOD</button>\n          <button class="btn btn-primary" onclick="saveWodEntry(${e.id},true)">Kinnita valmis</button>
          <button class="btn btn-soft" onclick="saveWodEntry(${e.id},false)">Salvesta foto / mustand</button>
        </div>
        <div class="training-actions">
          <button class="btn btn-dark" onclick="useWodInTraining(${e.id})" ${(e.workout_text||e.draft_text||'').trim()?'':'disabled'}>Kasuta treeningus</button>
          <button class="btn btn-danger" onclick="deleteWodEntry(${e.id})">Kustuta WOD</button>
        </div>
      </div>`;
  }

  function queueHydrate(){
    setTimeout(hydrateImages,30);
  }

  async function hydrateImages(){
    const imgs=[...document.querySelectorAll('img[data-wod-path]')];
    await Promise.all(imgs.map(async img=>{
      const path=img.getAttribute('data-wod-path');
      if(!path||img.dataset.loaded==='1') return;
      try{
        img.src=await getImageUrl(path);
        img.dataset.loaded='1';
      }catch(e){
        img.alt='Pilti ei õnnestunud laadida';
        console.warn('WOD image load failed',e);
      }
    }));
  }

  function pushWodHistory(kind,id=null){
    const current=history.state||{};
    if(current.wodModal===kind&&(kind!=='detail'||Number(current.wodId)===Number(id))) return;
    history.pushState({...current,wodModal:kind,wodId:id},'');
  }

  function renderWodHistoryState(state){
    const viewer=document.getElementById('wodImageViewer');
    if(viewer) viewer.remove();
    if(state?.wodModal==='detail'&&state.wodId){
      s.modal='wodDetail';s.modalData=Number(state.wodId);window.render();queueHydrate();return;
    }
    if(state?.wodModal==='bank'){
      s.modal='wodBank';s.modalData=null;window.render();queueHydrate();restoreWodBankScroll();return;
    }
    if(s.modal==='wodDetail'||s.modal==='wodBank'){
      s.modal=null;s.modalData=null;window.render();
    }
  }

  window.addEventListener('popstate',event=>renderWodHistoryState(event.state));
  window.openWodBank=async function(){
    if(!window.isTrainer()) return;
    pushWodHistory('bank');
    s.modal='wodBank';
    s.modalData=null;
    window.render();
    queueHydrate();
    try{
      await window.reloadData();
      if(s.modal==='wodBank'){
        window.render();
        queueHydrate();
      }
    }catch(e){
      console.warn('WOD bank refresh failed',e);
    }
    // Vanu WOD-e ei loeta massiliselt automaatselt: kontrolli neid eraldi.
  };

  window.openWodEntry=function(id){
    if(!window.isTrainer()) return;
    const sheetEl=document.querySelector('.sheet');
    if(sheetEl) s.wodBankScrollTop=sheetEl.scrollTop||0;
    pushWodHistory('detail',id);
    s.modal='wodDetail';
    s.modalData=id;
    window.render();
    queueHydrate();
  };


  function restoreWodBankScroll(){
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        const sheetEl=document.querySelector('.sheet');
        if(sheetEl) sheetEl.scrollTop=s.wodBankScrollTop||0;
      });
    });
  }

  window.closeModal=function(){
    if(s.modal==='wodDetail'||s.modal==='wodBank'){
      if(history.state?.wodModal){
        history.back();
      }else if(s.modal==='wodDetail'){
        s.modal='wodBank';s.modalData=null;window.render();queueHydrate();restoreWodBankScroll();
      }else{
        baseCloseModal();
      }
      return;
    }
    baseCloseModal();
  };

  window.backdropClose=function(e){
    if(e?.target?.classList?.contains('sheet-backdrop')){
      window.closeModal();
      return;
    }
    baseBackdropClose(e);
  };

  window.openWodImage=async function(path){
    if(!path) return;
    try{
      const url=await getImageUrl(path);
      const overlay=document.createElement('div');
      overlay.id='wodImageViewer';
      overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:#000;display:flex;align-items:center;justify-content:center;overflow:auto;padding:0;';
      overlay.innerHTML=`<button type="button" aria-label="Sulge" style="position:fixed;top:14px;right:14px;z-index:2;width:44px;height:44px;border:0;border-radius:50%;background:#ffffffdd;font-size:28px;line-height:1">×</button><img src="${url}" alt="WOD originaalpilt" style="display:block;max-width:none;max-height:none;width:auto;height:auto;min-width:100%;object-fit:contain;transform-origin:center center">`;
      overlay.addEventListener('click',e=>{
        if(e.target===overlay||e.target.tagName==='BUTTON') overlay.remove();
      });
      document.body.appendChild(overlay);
    }catch(e){
      window.toast('Originaalpilti ei õnnestunud avada');
      console.warn(e);
    }
  };

  window.pickWodCamera=function(){
    document.getElementById('wodCameraInput')?.click();
  };

  window.pickWodGallery=function(){
    document.getElementById('wodGalleryInput')?.click();
  };

  window.wodFilePicked=async function(input){
    const file=input?.files?.[0];
    if(!file) return;
    input.value='';
    if(!String(file.type||'').startsWith('image/')){
      window.toast('Vali pildifail');
      return;
    }
    if(file.size>25*1024*1024){
      window.toast('Pilt on liiga suur. Maksimum on 25 MB.');
      return;
    }

    const path=storagePath(file);
    const sourceDate=input?.id==='wodCameraInput'?today():dateFromFile(file);
    const title='WOD'; // Tehniline baaspealkiri; kasutajale on pealkirjaväli tühi.

    window.toast('Salvestan originaalpilti…');
    try{
      await uploadOriginal(file,path);
      const rows=await window.api('wod_bank_entries',{
        method:'POST',
        headers:{Prefer:'return=representation'},
        body:JSON.stringify({
          source_date:sourceDate,
          title,
          image_path:path,
          draft_text:null,
          workout_text:null,
          status:'pending',
          created_by:s.session.user.id
        })
      });
      const entry=Array.isArray(rows)?rows[0]:rows;
      await window.reloadData('Originaalpilt salvestatud');
      s.modal='wodDetail';
      s.modalData=entry?.id||s.wodBank.find(x=>x.image_path===path)?.id;
      window.render();
      queueHydrate();

      // Originaalfoto jääb alles, WOD-i teksti võib lisada hiljem käsitsi.
    }catch(e){
      window.toast(e.message||'Pildi salvestamine ebaõnnestus');
      console.warn(e);
    }
  };

  window.copyWodText=async function(id){
    const e=s.wodBank.find(x=>x.id===id);
    const text=(document.getElementById('wodText')?.value||e?.workout_text||e?.draft_text||'').trim();
    if(!text){window.toast('WOD-tekst on tühi');return}
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
      }else{
        const ta=document.createElement('textarea');
        ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
        document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
      }
      window.toast('Kogu WOD-tekst kopeeritud');
    }catch(err){
      window.toast('Kopeerimine ebaõnnestus');
      console.warn(err);
    }
  };
  window.saveWodEntry=async function(id,ready){
    const e=s.wodBank.find(x=>x.id===id);
    if(!e) return;
    const sourceDate=document.getElementById('wodDate')?.value||null;
    const title=document.getElementById('wodTitle')?.value.trim()||'WOD';
    const workout=document.getElementById('wodText')?.value.trim()||null;
    if(ready&&!workout){window.toast('Kinnitamiseks lisa WOD-i tekst või paranda see originaalpildi põhjal.');return}
    const status=ready?'ready':(workout?'review':'pending');
    try{
      await window.api(`wod_bank_entries?id=eq.${id}`,{
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({
          source_date:sourceDate,title,workout_text:workout,status,
          ...(workout?{}:{draft_text:null}),
          updated_at:new Date().toISOString()
        })
      });
      await window.reloadData(ready?'WOD kinnitatud':(workout?'WOD salvestatud':'Foto salvestatud – saad teksti hiljem lisada'));
      s.modal='wodDetail';s.modalData=id;window.render();queueHydrate();
    }catch(err){window.toast(err.message||'Salvestamine ebaõnnestus')}
  };

  window.useWodInTraining=function(id){
    const e=s.wodBank.find(x=>x.id===id);
    if(!e) return;
    const text=(document.getElementById('wodText')?.value||e.workout_text||e.draft_text||'').trim();
    if(!text){window.toast('WOD-tekst on tühi');return}
    window.openTrainingForm({
      title:'CrossFit',
      workout:text,
      duration_minutes:90,
      note:'',
      price_cents:0
    });
  };

  window.deleteWodEntry=async function(id){
    const e=s.wodBank.find(x=>x.id===id);
    if(!e||!confirm('Kustutada see WOD koos originaalpildiga? Seda ei saa tagasi võtta.')) return;
    try{
      await deleteOriginal(e.image_path);
      await window.api(`wod_bank_entries?id=eq.${id}`,{
        method:'DELETE',
        headers:{Prefer:'return=minimal'}
      });
      s.modal='wodBank';s.modalData=null;
      await window.reloadData('WOD kustutatud');
      window.render();queueHydrate();
    }catch(err){window.toast(err.message||'WOD-i kustutamine ebaõnnestus')}
  };

  window.renderModal=function(){
    if(s.modal==='wodBank') return sheet('WOD-pank',wodBankSheet());
    if(s.modal==='wodDetail'){
      const e=s.wodBank.find(x=>x.id===s.modalData);
      if(!e) return '';
      return sheet('WOD',wodDetailSheet(e));
    }
    return baseRenderModal();
  };

  Object.assign(window,{
    openWodBank,openWodEntry,pickWodCamera,pickWodGallery,wodFilePicked,
    saveWodEntry,useWodInTraining,deleteWodEntry,openWodImage,copyWodText
  });

  setTimeout(()=>{
    if(s.session&&s.profile&&window.isTrainer()) window.reloadData();
  },160);
})();
