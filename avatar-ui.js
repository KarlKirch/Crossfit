'use strict';

/* Privaatne CrossFit profiilipiltide süsteem.
   - Kasutaja võib muuta ainult oma pilti (Supabase RLS).
   - Pildid on privaatse bucket'i ajutiste URL-idega.
   - 512 px keskele sobitatav JPEG, suurendus ja nihutamine enne salvestust.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.loadData!=='function')return;

  const ROOT='https://aanxpugvehwtcwwpefwx.supabase.co';
  const KEY='sb_publishable_ICMR8EF0LK69VjfVRWe0ew_120LIV7A';
  const BUCKET='wod-avatars';
  const TTL=3600;
  const cache=new Map();
  const previousLoad=window.loadData;
  const previousMine=window.renderMine;
  const previousMore=window.renderMore;
  const previousClientCard=window.clientCard;
  const previousPersonRow=window.personRow;
  const previousRenderModal=window.renderModal;
  let edit=null;
  let saving=false;

  const esc=v=>window.esc(v);
  function currentId(){return s.session?.user?.id||null}
  function profile(id){
    if(!id)return null;
    if(s.profile?.user_id===id)return s.profile;
    return s.profiles.find(p=>p.user_id===id)||null;
  }
  function headers(){
    return {apikey:KEY,Authorization:'Bearer '+s.session.access_token};
  }
  async function request(url,opts={}){
    const response=await fetch(url,opts);
    if(!response.ok){
      let msg='Pildi salvestamine ebaõnnestus';
      try{const x=await response.json();msg=x.message||x.error||x.msg||msg}catch(_){}
      throw new Error(msg);
    }
    if(response.status===204)return null;
    return response.json().catch(()=>null);
  }
  function validPath(path,id){
    return !!(id&&typeof path==='string'&&new RegExp('^'+id+'/[a-z0-9-]+[.]jpg$').test(path));
  }
  async function signed(path){
    if(!s.session?.access_token || !path)return null;
    const id=path.split('/')[0];
    if(!validPath(path,id))return null;
    const existing=cache.get(path);
    if(existing&&existing.until>Date.now())return existing.url;
    const raw=await request(ROOT+'/storage/v1/object/sign/'+BUCKET+'/'+path,{
      method:'POST',headers:{...headers(),'Content-Type':'application/json'},
      body:JSON.stringify({expiresIn:TTL})
    });
    const signedURL=raw?.signedURL||raw?.signedUrl||'';
    // URL pärineb Supabase'ist; muu päritoluga URL-e ei kasuta.
    const signedPath=signedURL.startsWith('/storage/v1/object/sign/'+BUCKET+'/')
      ?signedURL
      :signedURL.startsWith('/object/sign/'+BUCKET+'/')
        ?'/storage/v1'+signedURL
        :null;
    if(!signedPath)return null;
    const url=ROOT+signedPath;
    cache.set(path,{url,until:Date.now()+(TTL-180)*1000});
    return url;
  }
  async function refresh(){
    const userProfiles=[...(s.profiles||[])];
    if(s.profile&&!userProfiles.some(p=>p.user_id===s.profile.user_id))userProfiles.push(s.profile);
    const unique=[...new Set(userProfiles.filter(p=>validPath(p.avatar_path,p.user_id)).map(p=>p.avatar_path))];
    // Töötle mõistliku partiina, et mitte saata korraga liiga palju päringuid.
    for(let i=0;i<unique.length;i+=8){
      await Promise.all(unique.slice(i,i+8).map(path=>signed(path).catch(()=>null)));
    }
  }
  window.loadData=async function(){
    await previousLoad();
    if(s.session?.access_token)await refresh().catch(error=>console.warn('Avatar links:',error));
  };
  function html(id,variant='small'){
    const p=profile(id);
    const name=String(p?.display_name||window.pname?.(id)||'Kasutaja');
    const letters=name.split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join('').toLocaleUpperCase('et')||'?';
    const src=p?.avatar_path&&cache.get(p.avatar_path)?.url;
    const classes='cf-avatar cf-avatar-'+variant;
    return src?
      '<span class="'+classes+'"><img src="'+esc(src)+'" alt="'+esc(name)+' profiilipilt" referrerpolicy="no-referrer" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="cf-avatar-initials" hidden>'+esc(letters)+'</span></span>':
      '<span class="'+classes+'"><span class="cf-avatar-initials">'+esc(letters)+'</span></span>';
  }
  window.renderMine=function(){
    let current=previousMine();
    if(window.isTrainer())return current;
    const anchor='<div class="card"><div class="card-title-row">';
    const add='<div class="card cf-myprofile-card"><div class="card-title-row cf-myprofile-row">'+html(currentId(),'medium');
    return current.includes(anchor)?current.replace(anchor,add):current;
  };
  window.renderMore=function(){
    let current=previousMore();
    if(!window.isTrainer())return current;
    const anchor='<div class="card"><div class="card-title-row">';
    const add='<div class="card cf-myprofile-card"><div class="card-title-row cf-myprofile-row">'+html(currentId(),'medium');
    return current.includes(anchor)?current.replace(anchor,add):current;
  };
  window.clientCard=function(p){
    const source=previousClientCard(p);
    const anchor='<div class="client-top">';
    return source.includes(anchor)
      ?source.replace(anchor,'<div class="client-top cf-client-top">'+html(p.user_id,'medium'))
      :source;
  };
  window.personRow=function(r,t,pos){
    const source=previousPersonRow(r,t,pos);
    const anchor='<div class="person">';
    return source.includes(anchor)?source.replace(anchor,'<div class="person cf-person-row">'+html(r.user_id,'small')):source;
  };

  function editor(){
    const uid=currentId();
    return '<div class="cf-photo-editor">'+
      '<div class="cf-photo-current">'+html(uid,'large')+
      '<div><strong>Profiilipilt</strong><span>Teised treenijad näevad seda registreerunute nimekirjas.</span></div></div>'+
      '<div class="cf-photo-buttons">'+
        '<label for="cfPhotoFile" class="btn btn-primary">Vali foto</label>'+
        '<input id="cfPhotoFile" class="cf-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onchange="crossfitAvatars.selectFile(event)">'+
        (profile(uid)?.avatar_path?'<button type="button" class="btn btn-soft" onclick="crossfitAvatars.remove()">Kustuta foto</button>':'')+
      '</div>'+
      '<p>Fotot saab enne salvestamist nihutada ja suurendada.</p></div>';
  }
  function profileSheet(){
    return '<div class="sheet-backdrop" onclick="backdropClose(event)"><div class="sheet" onclick="event.stopPropagation()">'+
      '<div class="sheet-head"><div class="sheet-title">Minu profiil</div>'+
      '<button class="sheet-close" onclick="closeModal()" aria-label="Sulge">×</button></div>'+
      '<div class="sheet-body">'+editor()+
      '<div class="form cf-profile-form">'+
      '<div class="field"><label for="pfName">Kuvatav nimi</label><input id="pfName" value="'+esc(s.profile?.display_name||'')+'" autocomplete="name"></div>'+
      '<div class="field"><label for="pfEmail">E-post</label><input id="pfEmail" value="'+esc(s.session?.user?.email||'')+'" disabled></div>'+
      '<div class="form-actions"><button type="button" class="btn btn-primary" onclick="saveProfile()">Salvesta nimi</button>'+
      '<button type="button" class="btn btn-soft" onclick="closeModal()">Sulge</button></div></div></div></div></div>';
  }
  function cropSheet(){
    return '<div class="sheet-backdrop" onclick="backdropClose(event)"><div class="sheet" onclick="event.stopPropagation()">'+
      '<div class="sheet-head"><div class="sheet-title">Kärbi profiilipilti</div>'+
      '<button class="sheet-close" onclick="crossfitAvatars.cancel()" aria-label="Sulge">×</button></div>'+
      '<div class="sheet-body cf-crop-body">'+
      '<p>Liiguta pilti sõrmega ning kasuta suurendamiseks liugurit.</p>'+
      '<canvas id="cfCropCanvas" width="320" height="320" aria-label="Profiilipildi kärpimise eelvaade"></canvas>'+
      '<label for="cfCropZoom">Suurendus</label>'+
      '<input id="cfCropZoom" type="range" min="1" max="2.5" step="0.05" value="1" oninput="crossfitAvatars.zoom(this.value)">'+
      '<div class="form-actions"><button id="cfCropSave" type="button" class="btn btn-primary" onclick="crossfitAvatars.save()">Salvesta foto</button>'+
      '<button type="button" class="btn btn-soft" onclick="crossfitAvatars.cancel()">Katkesta</button></div>'+
      '</div></div></div>';
  }
  window.renderModal=function(){
    if(s.modal==='profile')return profileSheet();
    if(s.modal==='avatarCrop')return cropSheet();
    return previousRenderModal();
  };
  function resetEdit(){
    if(edit?.url)URL.revokeObjectURL(edit.url);
    edit=null;
  }
  function cancel(){
    resetEdit();
    s.modal='profile';
    window.render();
  }
  async function selectFile(event){
    const input=event?.target;
    const f=input?.files?.[0];
    if(!f)return;
    input.value='';
    if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type)||f.size>12*1024*1024){
      window.toast('Vali JPG, PNG või WebP foto (kuni 12 MB).');
      return;
    }
    resetEdit();
    const url=URL.createObjectURL(f);
    const img=new Image();
    try{
      img.src=url;
      await img.decode();
      if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000){
        throw new Error('Foto mõõtmed ei sobi.');
      }
      edit={url,img,zoom:1,x:0,y:0};
      s.modal='avatarCrop';
      window.render();
      requestAnimationFrame(()=>{paint();attachDrag()});
    }catch(error){
      URL.revokeObjectURL(url);
      window.toast('Foto avamine ebaõnnestus. Proovi JPG või PNG fotot.');
    }
  }
  function clampCrop(){
    if(!edit)return;
    const image=edit.img,zoom=edit.zoom;
    const fit=Math.max(320/image.naturalWidth,320/image.naturalHeight);
    const iw=image.naturalWidth*fit*zoom,ih=image.naturalHeight*fit*zoom;
    const maxX=Math.max(0,(iw-320)/2),maxY=Math.max(0,(ih-320)/2);
    edit.x=Math.max(-maxX,Math.min(maxX,edit.x));
    edit.y=Math.max(-maxY,Math.min(maxY,edit.y));
    return {iw,ih};
  }
  function draw(ctx,size){
    if(!edit)return;
    const {iw,ih}=clampCrop();
    const mul=size/320;
    ctx.clearRect(0,0,size,size);
    ctx.fillStyle='#F4F4EE';ctx.fillRect(0,0,size,size);
    ctx.drawImage(edit.img,(160-iw/2+edit.x)*mul,(160-ih/2+edit.y)*mul,iw*mul,ih*mul);
  }
  function paint(){
    const canvas=document.getElementById('cfCropCanvas');
    if(canvas&&edit)draw(canvas.getContext('2d'),320);
  }
  function zoom(v){
    if(!edit)return;
    edit.zoom=Math.max(1,Math.min(2.5,Number(v)||1));
    paint();
  }
  function attachDrag(){
    const canvas=document.getElementById('cfCropCanvas');
    if(!canvas||!edit)return;
    let position=null;
    canvas.addEventListener('pointerdown',event=>{
      if(!edit)return;
      position={x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      if(!position||!edit)return;
      const width=canvas.getBoundingClientRect().width||320;
      const scale=320/width;
      edit.x+=(event.clientX-position.x)*scale;
      edit.y+=(event.clientY-position.y)*scale;
      position={x:event.clientX,y:event.clientY};
      paint();
    });
    const release=()=>{position=null};
    canvas.addEventListener('pointerup',release);
    canvas.addEventListener('pointercancel',release);
    canvas.addEventListener('lostpointercapture',release);
  }
  async function save(){
    if(!edit||saving||!currentId())return;
    saving=true;
    const btn=document.getElementById('cfCropSave');
    if(btn){btn.disabled=true;btn.textContent='Salvestan…'}
    const uid=currentId();
    const old=profile(uid)?.avatar_path||null;
    let newPath=null;
    try{
      const canvas=document.createElement('canvas');
      canvas.width=512;canvas.height=512;
      draw(canvas.getContext('2d'),512);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(new Error('Pildi töötlemine ebaõnnestus')),'image/jpeg',0.86));
      if(blob.size>2097152)throw new Error('Foto on liiga suur.');
      const fileId=crypto.randomUUID().toLowerCase();
      newPath=uid+'/'+fileId+'.jpg';
      // Ainult uus objekt; teise kasutaja faili ülekirjutamise võimalust pole.
      const upload=await fetch(ROOT+'/storage/v1/object/'+BUCKET+'/'+newPath,{
        method:'POST',headers:{...headers(),'Content-Type':'image/jpeg','x-upsert':'false'},body:blob
      });
      if(!upload.ok){
        let detail='Foto üleslaadimine ebaõnnestus';
        try{const payload=await upload.json();detail=payload.message||payload.error||detail}catch(_){}
        throw new Error(detail);
      }
      await window.api('wod_profiles?user_id=eq.'+uid,{
        method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({avatar_path:newPath})
      });
      if(s.profile)s.profile.avatar_path=newPath;
      const p=s.profiles.find(x=>x.user_id===uid);
      if(p)p.avatar_path=newPath;
      cache.delete(newPath);
      await signed(newPath).catch(()=>null);
      resetEdit();
      s.modal='profile';
      window.render();
      window.toast('Profiilipilt salvestatud');
      if(old&&validPath(old,uid)&&old!==newPath)removeObject(old).catch(()=>{});
    }catch(error){
      if(newPath && s.profile?.avatar_path!==newPath)removeObject(newPath).catch(()=>{});
      window.toast(error.message||'Foto salvestamine ebaõnnestus');
    }finally{
      saving=false;
      if(btn?.isConnected){btn.disabled=false;btn.textContent='Salvesta foto'}
    }
  }
  async function removeObject(path){
    const response=await fetch(ROOT+'/storage/v1/object/'+BUCKET+'/'+path,{
      method:'DELETE',headers:headers()
    });
    if(!response.ok)throw new Error('Foto kustutamine ebaõnnestus');
  }
  async function remove(){
    const uid=currentId(),path=profile(uid)?.avatar_path;
    if(!uid||!validPath(path,uid)||saving)return;
    if(!window.confirm('Kas soovid oma profiilipildi kustutada?'))return;
    saving=true;
    try{
      await window.api('wod_profiles?user_id=eq.'+uid,{
        method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({avatar_path:null})
      });
      if(s.profile)s.profile.avatar_path=null;
      const p=s.profiles.find(x=>x.user_id===uid);if(p)p.avatar_path=null;
      cache.delete(path);
      window.render();
      window.toast('Profiilipilt kustutatud');
      removeObject(path).catch(()=>{});
    }catch(error){window.toast(error.message||'Kustutamine ebaõnnestus')}
    finally{saving=false}
  }
  window.crossfitAvatars={html,refresh,selectFile,zoom,cancel,save,remove};
})();