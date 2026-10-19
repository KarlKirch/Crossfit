'use strict';

(function(){
  const s=window.state;
  if(!s) return;

  const SB_URL='https://aanxpugvehwtcwwpefwx.supabase.co';
  const SB_KEY='sb_publishable_ICMR8EF0LK69VjfVRWe0ew_120LIV7A';
  const BUCKET='wod-bank';
  const OCR_SRC='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  const baseLoadData=window.loadData;
  const baseRenderMore=window.renderMore;
  const baseRenderModal=window.renderModal;
  const baseQuickSheet=window.quickSheet;
  const baseCloseModal=window.closeModal;
  const baseBackdropClose=window.backdropClose;

  s.wodBank=s.wodBank||[];
  s.wodOcrBusy=false;
  s.wodBatchOcrRunning=false;
  s.wodBatchOcrDone=0;
  s.wodBatchOcrTotal=0;
  s.wodBankScrollTop=s.wodBankScrollTop||0;

  const imageUrlCache=new Map();
  let ocrLoadPromise=null;

  const bankIcon='<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>';
  const cameraIcon='<svg viewBox="0 0 24 24"><path d="M4 7h4l1.5-2h5L16 7h4v12H4V7Z"/><circle cx="12" cy="13" r="4"/></svg>';

  function statusMeta(status){
    if(status==='ready') return ['Valmis','green'];
    if(status==='review') return ['Vajab ülevaatust','amber'];
    return ['Töötlemata',''];
  }

  function today(){
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn'}).format(new Date());
  }

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

  async function downloadOriginalUncached(path){
    const r=await storageRequest(`${SB_URL}/storage/v1/object/authenticated/${BUCKET}/${encPath(path)}`,{
      headers:authHeaders()
    });
    return await r.blob();
  }

  function cleanBatchOcrText(raw){
    const exerciseWords=/\b(warm|strength|metcon|amrap|emom|round|rounds|reps|rep|for time|time cap|deadlift|squat|press|push|pull|burpee|swing|snatch|clean|thruster|lunge|sit|box|wall|run|row|bike|ski|jump|plank|carry|kettlebell|kb|db|barbell|front|back|overhead|ohs|toes|t2b|v-up|muscle|crawl|shuttle|cal|meter|metre|min|sec|rest|partner|team)\b/i;
    const resultLine=/^[A-Za-zÀ-ž][A-Za-zÀ-ž .'-]{1,22}\s*[-–:]\s*\d+(?:[.,:]\d+)?(?:\s*[/x]\s*\d+(?:[.,]\d+)?)?(?:\s*(?:kg|pb|ob))?\s*$/i;
    return String(raw||'')
      .replace(/\r/g,'')
      .split('\n')
      .map(x=>x.replace(/[ \t]+$/,'').trimEnd())
      .filter(line=>{
        const t=line.trim();
        if(!t) return true;
        if(resultLine.test(t)&&!exerciseWords.test(t)) return false;
        return true;
      })
      .join('\n')
      .replace(/\n{3,}/g,'\n\n')
      .trim();
  }

  function updateBatchOcrProgress(message){
    const el=document.getElementById('wodBatchOcrProgress');
    if(el) el.textContent=message||'';
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

  async function readExifOrientation(blob){
    try{
      const buf=await blob.slice(0,128*1024).arrayBuffer();
      const v=new DataView(buf);
      if(v.getUint16(0,false)!==0xFFD8) return 1;
      let offset=2;
      while(offset+4<v.byteLength){
        if(v.getUint8(offset)!==0xFF){offset++;continue}
        const marker=v.getUint8(offset+1);
        if(marker===0xDA||marker===0xD9) break;
        const len=v.getUint16(offset+2,false);
        if(marker===0xE1&&offset+2+len<=v.byteLength){
          const exif=offset+4;
          if(v.getUint32(exif,false)===0x45786966){
            const tiff=exif+6;
            const little=v.getUint16(tiff,false)===0x4949;
            const firstIfd=tiff+v.getUint32(tiff+4,little);
            const count=v.getUint16(firstIfd,little);
            for(let i=0;i<count;i++){
              const e=firstIfd+2+i*12;
              if(e+12>v.byteLength) break;
              if(v.getUint16(e,little)===0x0112){
                const o=v.getUint16(e+8,little);
                return [1,3,6,8].includes(o)?o:1;
              }
            }
          }
        }
        offset+=2+len;
      }
    }catch(_){}
    return 1;
  }

  async function prepareOcrCanvas(blob,enhance=true){
    const orientation=await readExifOrientation(blob);
    let bitmap;
    try{
      bitmap=await createImageBitmap(blob,{imageOrientation:'none'});
    }catch(_){
      bitmap=await createImageBitmap(blob);
    }
    const rawW=bitmap.width, rawH=bitmap.height;
    const swap=orientation===6||orientation===8;
    const orientedW=swap?rawH:rawW;
    const orientedH=swap?rawW:rawH;
    const scale=Math.min(1,2200/Math.max(orientedW,orientedH));
    const outW=Math.max(1,Math.round(orientedW*scale));
    const outH=Math.max(1,Math.round(orientedH*scale));
    const canvas=document.createElement('canvas');
    canvas.width=outW;canvas.height=outH;
    const ctx=canvas.getContext('2d',{willReadFrequently:enhance});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,outW,outH);
    ctx.save();
    if(orientation===6){
      ctx.translate(outW,0);ctx.rotate(Math.PI/2);ctx.scale(scale,scale);
    }else if(orientation===8){
      ctx.translate(0,outH);ctx.rotate(-Math.PI/2);ctx.scale(scale,scale);
    }else if(orientation===3){
      ctx.translate(outW,outH);ctx.rotate(Math.PI);ctx.scale(scale,scale);
    }else{
      ctx.scale(scale,scale);
    }
    ctx.drawImage(bitmap,0,0);
    ctx.restore();
    bitmap.close?.();

    if(enhance){
      const img=ctx.getImageData(0,0,outW,outH);
      const d=img.data;
      const contrast=1.55;
      for(let i=0;i<d.length;i+=4){
        const gray=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
        const v=Math.max(0,Math.min(255,(gray-128)*contrast+150));
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(img,0,0);
    }
    return canvas;
  }

  function usefulOcrText(text,confidence){
    const clean=String(text||'').trim();
    const letters=(clean.match(/[A-Za-zÀ-ž0-9]/g)||[]).length;
    const words=(clean.match(/[A-Za-zÀ-ž]{2,}/g)||[]).length;
    return clean.length>=12&&letters>=8&&words>=2&&(Number(confidence)||0)>=18;
  }

  function loadOcr(){
    if(window.Tesseract) return Promise.resolve(window.Tesseract);
    if(ocrLoadPromise) return ocrLoadPromise;
    ocrLoadPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=OCR_SRC;
      script.async=true;
      script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('Tekstituvastuse moodul ei käivitunud'));
      script.onerror=()=>reject(new Error('Tekstituvastuse moodulit ei saanud laadida'));
      document.head.appendChild(script);
    }).catch(e=>{ocrLoadPromise=null;throw e});
    return ocrLoadPromise;
  }

  async function makeDraft(entry,fileOrBlob=null,showToast=true){
    if(!entry||s.wodOcrBusy) return;
    s.wodOcrBusy=true;
    if(showToast) window.toast('Loon pildist tekstimustandit…');
    try{
      const T=await loadOcr();
      const rawSource=fileOrBlob||await downloadOriginal(entry.image_path);
      const source=await prepareOcrCanvas(rawSource,true);
      const result=await T.recognize(source,'eng',{
        logger:m=>{
          if(m.status==='recognizing text'&&typeof m.progress==='number'){
            const pct=Math.round(m.progress*100);
            const el=document.getElementById('wodOcrProgress');
            if(el) el.textContent=`Tekstituvastus ${pct}%`;
          }
        }
      });
      const text=String(result?.data?.text||'')
        .replace(/\r/g,'')
        .replace(/[ \t]+\n/g,'\n')
        .replace(/\n{3,}/g,'\n\n')
        .trim();

      if(!usefulOcrText(text,result?.data?.confidence)) throw new Error('Pildilt ei õnnestunud piisavalt usaldusväärset teksti tuvastada');

      await window.api(`wod_bank_entries?id=eq.${entry.id}`,{
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({
          draft_text:text,
          workout_text:entry.workout_text?.trim()?entry.workout_text:text,
          status:'review',
          updated_at:new Date().toISOString()
        })
      });

      await window.reloadData('Tekstimustand loodud – vaata see üle');
      if(s.modal==='wodDetail'){s.modalData=entry.id;window.render();queueHydrate();}
    }catch(e){
      if(showToast) window.toast('Pilt on alles. Tekstimustandit ei õnnestunud luua.');
      console.warn('WOD OCR failed',e);
    }finally{
      s.wodOcrBusy=false;
      const el=document.getElementById('wodOcrProgress');
      if(el) el.textContent='';
    }
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
      <div class="card-sub">Originaalpilt jääb alati alles. Tekstimustand on abivahend – lõplikku WOD-teksti saad ise muuta.</div>
      <div class="training-actions" style="margin-top:12px">
        <button class="btn btn-primary" onclick="pickWodCamera()">Tee pilt</button>
        <button class="btn btn-soft" onclick="pickWodGallery()">Vali galeriist</button>
      </div>
      <input id="wodCameraInput" type="file" accept="image/*" capture="environment" style="display:none" onchange="wodFilePicked(this)">
      <input id="wodGalleryInput" type="file" accept="image/*" style="display:none" onchange="wodFilePicked(this)">
      <div id="wodOcrProgress" class="card-sub" style="margin-top:8px"></div>
    </div>
    <div class="metric-grid" style="margin-top:12px">
      ${window.metric(s.wodBank.length,'WOD-i')}
      ${window.metric(pending,'Töötlemata')}
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
          <div class="field"><label>Pealkiri</label><input id="wodTitle" maxlength="120" value="${window.esc(e.title||'WOD')}"></div>
        </div>
        <div class="field">
          <label>Lõplik WOD-tekst</label>
          <textarea id="wodText" style="min-height:260px" placeholder="Paranda või täienda teksti siin...">${window.esc(e.workout_text||e.draft_text||'')}</textarea>
        </div>
        ${e.draft_text?`<details class="card" style="box-shadow:none"><summary style="cursor:pointer;font-weight:700">Vaata automaatset algmustandit</summary><div class="card-sub" style="white-space:pre-wrap;margin-top:10px">${window.esc(e.draft_text)}</div></details>`:''}
        <div id="wodOcrProgress" class="card-sub"></div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="saveWodEntry(${e.id},true)">Kinnita valmis</button>
          <button class="btn btn-soft" onclick="saveWodEntry(${e.id},false)">Salvesta mustand</button>
          <button class="btn btn-soft" onclick="retryWodDraft(${e.id})">Loo tekstimustand uuesti</button>
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

  window.buildAllWodDrafts=async function(){
    if(!window.isTrainer()||s.wodBatchOcrRunning) return;
    const queue=s.wodBank.filter(e=>e.image_path&&!String(e.draft_text||'').trim());
    if(!queue.length){
      updateBatchOcrProgress('Kõigil piltidel on tekstimustand olemas.');
      return;
    }

    s.wodBatchOcrRunning=true;
    s.wodBatchOcrDone=0;
    s.wodBatchOcrTotal=queue.length;
    updateBatchOcrProgress(`Valmistan tekstimustandeid: 0 / ${queue.length}`);

    let worker=null;
    try{
      const T=await loadOcr();
      worker=await T.createWorker('eng',1,{
        logger:m=>{
          if(m.status==='recognizing text'&&typeof m.progress==='number'){
            const pct=Math.round(m.progress*100);
            updateBatchOcrProgress(`Tekstimustandid ${s.wodBatchOcrDone} / ${s.wodBatchOcrTotal} · praegune pilt ${pct}%`);
          }
        }
      });
      await worker.setParameters({
        tessedit_pageseg_mode:'11',
        preserve_interword_spaces:'1'
      });

      for(const entry of queue){
        try{
          const blob=await downloadOriginalUncached(entry.image_path);
          const canvas=await prepareOcrCanvas(blob,true);
          let result=await worker.recognize(canvas);
          let text=cleanBatchOcrText(result?.data?.text||'');

          if(!usefulOcrText(text,result?.data?.confidence)){
            const plain=await prepareOcrCanvas(blob,false);
            const retry=await worker.recognize(plain);
            if((Number(retry?.data?.confidence)||0)>(Number(result?.data?.confidence)||0)){
              result=retry;
              text=cleanBatchOcrText(retry?.data?.text||'');
            }
          }
          if(!usefulOcrText(text,result?.data?.confidence)){
            throw new Error('OCR confidence too low');
          }

          const keepWorkout=String(entry.workout_text||'').trim();
          await window.api(`wod_bank_entries?id=eq.${entry.id}`,{
            method:'PATCH',
            headers:{Prefer:'return=minimal'},
            body:JSON.stringify({
              draft_text:text,
              workout_text:keepWorkout||text,
              status:entry.status==='ready'?'ready':'review',
              updated_at:new Date().toISOString()
            })
          });

          entry.draft_text=text;
          if(!keepWorkout) entry.workout_text=text;
          if(entry.status!=='ready') entry.status='review';
        }catch(err){
          console.warn('WOD batch OCR failed',entry?.id,err);
          // Madala kvaliteediga OCR-i ei salvestata prügitekstina.
          // Kirje jääb töötlemata ja järgmine käivitus võib uuesti proovida.
          entry._ocrFailed=true;
        }

        s.wodBatchOcrDone++;
        updateBatchOcrProgress(`Valmistan tekstimustandeid: ${s.wodBatchOcrDone} / ${s.wodBatchOcrTotal}`);
        await new Promise(resolve=>setTimeout(resolve,20));
      }

      await window.reloadData('Kõik WOD-i tekstimustandid on loodud');
      if(s.modal==='wodBank'){
        window.render();
        queueHydrate();
        restoreWodBankScroll();
      }
    }catch(err){
      console.warn('WOD batch OCR stopped',err);
      updateBatchOcrProgress('Tekstimustandite loomine peatus. Ava WOD-pank uuesti, et jätkata.');
      window.toast('Tekstimustandite loomine peatus. Jätkame järgmisel avamisel.');
    }finally{
      if(worker) await worker.terminate().catch(()=>{});
      s.wodBatchOcrRunning=false;
    }
  };

  window.openWodBank=async function(){
    if(!window.isTrainer()) return;
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
    // Käsikirjaliste tahvlipiltide automaatne OCR on välja lülitatud.
    // Tekstimustandid lisatakse kontrollitud visuaalse lugemisega.
  };

  window.openWodEntry=function(id){
    if(!window.isTrainer()) return;
    const sheetEl=document.querySelector('.sheet');
    if(sheetEl) s.wodBankScrollTop=sheetEl.scrollTop||0;
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
    if(s.modal==='wodDetail'){
      s.modal='wodBank';
      s.modalData=null;
      window.render();
      queueHydrate();
      restoreWodBankScroll();
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
    const sourceDate=dateFromFile(file);
    const title=`WOD ${displayDate(sourceDate)}`;

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

      const current=s.wodBank.find(x=>x.image_path===path)||entry;
      if(current) makeDraft(current,file,true);
    }catch(e){
      window.toast(e.message||'Pildi salvestamine ebaõnnestus');
      console.warn(e);
    }
  };

  window.saveWodEntry=async function(id,ready){
    const e=s.wodBank.find(x=>x.id===id);
    if(!e) return;
    const sourceDate=document.getElementById('wodDate')?.value||null;
    const title=document.getElementById('wodTitle')?.value.trim()||'WOD';
    const workout=document.getElementById('wodText')?.value.trim()||null;
    const status=ready?'ready':(workout?'review':'pending');
    try{
      await window.api(`wod_bank_entries?id=eq.${id}`,{
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({
          source_date:sourceDate,title,workout_text:workout,status,
          updated_at:new Date().toISOString()
        })
      });
      await window.reloadData(ready?'WOD kinnitatud':'WOD salvestatud');
      s.modal='wodDetail';s.modalData=id;window.render();queueHydrate();
    }catch(err){window.toast(err.message||'Salvestamine ebaõnnestus')}
  };

  window.retryWodDraft=async function(id){
    const e=s.wodBank.find(x=>x.id===id);
    if(e) await makeDraft(e,null,true);
  };

  window.useWodInTraining=function(id){
    const e=s.wodBank.find(x=>x.id===id);
    if(!e) return;
    const text=(document.getElementById('wodText')?.value||e.workout_text||e.draft_text||'').trim();
    if(!text){window.toast('WOD-tekst on tühi');return}
    window.openTrainingForm({
      title:'CrossFit',
      workout:text,
      note:e.source_date?`WOD-pangast: ${displayDate(e.source_date)}`:'WOD-pangast',
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
    saveWodEntry,retryWodDraft,useWodInTraining,deleteWodEntry,buildAllWodDrafts,openWodImage
  });

  setTimeout(()=>{
    if(s.session&&s.profile&&window.isTrainer()) window.reloadData();
  },160);
})();
