'use strict';

/* 15. samm: WOD-panga töölaud. Ainult kasutajaliides ja olemasolevad tegevused.
   Ükski kirje ei muutu automaatselt kinnitatuks ja fotosid ei kustutata.
   Uue/olemasoleva treeningu muutmise salvestab treener tavapärases treeninguvormis.
*/
(function(){
  const s=window.state;
  if(!s||typeof window.renderModal!=='function')return;
  const beforeModal=window.renderModal;
  const esc=v=>window.esc(v);
  const PAGE_SIZE=18;
  const dateFormat=new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',day:'numeric',month:'short',year:'numeric'});
  const numberId=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null};
  const validDrive=id=>typeof id==='string'&&/^[\w-]{10,}$/.test(id);
  const svg={
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>',
    camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h4l2-3h6l2 3h4v12H3V8Z"/><circle cx="12" cy="14" r="4"/></svg>',
    file:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5 11-11"/></svg>',
    clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  const settings=()=>{
    if(typeof s.wodUiFilter!=='string')s.wodUiFilter='all';
    if(typeof s.wodUiSearch!=='string')s.wodUiSearch='';
    if(!['newest','oldest','name'].includes(s.wodUiSort))s.wodUiSort='newest';
    if(!Number.isSafeInteger(s.wodUiPage)||s.wodUiPage<0)s.wodUiPage=0;
    return {filter:s.wodUiFilter,search:s.wodUiSearch,sort:s.wodUiSort,page:s.wodUiPage};
  };
  function statusName(status){
    if(status==='ready')return ['Valmis','ready'];
    if(status==='review')return ['Kinnitamata','review'];
    return ['Töötlemata','pending'];
  }
  function textOf(entry){return String(entry.workout_text||entry.draft_text||'').trim()}
  function dateOf(entry){
    if(entry.source_date){
      const parts=String(entry.source_date).split('-');
      if(parts.length===3)return parts.reverse().join('.');
    }
    const d=new Date(entry.created_at);
    return Number.isFinite(d.getTime())?dateFormat.format(d):'Kuupäev puudub';
  }
  function counts(){
    const all=Array.isArray(s.wodBank)?s.wodBank:[];
    return {
      all:all.length,
      review:all.filter(x=>x.status==='review').length,
      pending:all.filter(x=>x.status==='pending').length,
      ready:all.filter(x=>x.status==='ready').length,
      missing:all.filter(x=>!x.image_path&&!x.source_drive_file_id).length,
      noDraft:all.filter(x=>x.image_path&&!String(x.draft_text||'').trim()).length
    };
  }
  function filtered(){
    const opts=settings(),q=opts.search.trim().toLocaleLowerCase('et');
    const list=(s.wodBank||[]).filter(x=>{
      if(opts.filter==='missing')return !x.image_path&&!x.source_drive_file_id;
      if(opts.filter!=='all'&&x.status!==opts.filter)return false;
      if(!q)return true;
      return [x.title,x.workout_text,x.draft_text,x.source_date,x.source_filename]
        .some(v=>String(v||'').toLocaleLowerCase('et').includes(q));
    }).slice();
    const dated=x=>String(x.source_date||x.created_at||'');
    list.sort((a,b)=>opts.sort==='name'?
      String(a.title||'').localeCompare(String(b.title||''),'et',{sensitivity:'base'})||
        dated(b).localeCompare(dated(a)):
      opts.sort==='oldest'?
        dated(a).localeCompare(dated(b))||Number(a.id)-Number(b.id):
        dated(b).localeCompare(dated(a))||Number(b.id)-Number(a.id));
    return list;
  }
  function paged(){
    const list=filtered(),totalPages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
    s.wodUiPage=Math.max(0,Math.min(s.wodUiPage,totalPages-1));
    const start=s.wodUiPage*PAGE_SIZE;
    return {list:list.slice(start,start+PAGE_SIZE),total:list.length,totalPages,start};
  }
  function image(entry){
    if(entry.image_path){
      return '<img class="wb-photo" loading="lazy" data-wod-import-path="'+esc(entry.image_path)+'" alt="WOD originaalpilt">';
    }
    if(validDrive(entry.source_drive_file_id)){
      const url='https://drive.google.com/thumbnail?id='+encodeURIComponent(entry.source_drive_file_id)+'&sz=w700';
      return '<img class="wb-photo" src="'+esc(url)+'" alt="WOD originaalpilt Drive’is" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">'+
        '<span class="wb-photo-placeholder" hidden>Drive’i foto pole kättesaadav</span>';
    }
    return '<span class="wb-photo-placeholder">Originaalpilt puudub</span>';
  }
  function card(entry){
    const id=numberId(entry.id);if(id===null)return '';
    const [label,tone]=statusName(entry.status),text=textOf(entry);
    const snippet=text?esc(text.slice(0,155))+(text.length>155?'…':''):'Tekst puudub – ava ja vaata foto üle.';
    const date=esc(dateOf(entry));
    return '<article class="wb-card">'+
      '<div class="wb-card-photo">'+image(entry)+'</div>'+
      '<div class="wb-card-content">'+
        '<div class="wb-card-flags"><span class="wb-status wb-status-'+tone+'">'+label+'</span>'+
          (!entry.image_path&&!entry.source_drive_file_id?'<span class="wb-status wb-status-missing">Pilt puudu</span>':'')+'</div>'+
        '<h3>'+esc(entry.title||'WOD')+'</h3><p class="wb-date">'+date+'</p>'+
        '<p class="wb-excerpt">'+snippet+'</p>'+
        '<button type="button" class="wb-card-open" onclick="openWodEntry('+id+')">'+
          (entry.status==='ready'?'Ava WOD':'Ava ja vaata üle')+' '+svg.arrow+'</button>'+
      '</div></article>';
  }
  function filters(){
    const n=counts(),selected=settings().filter;
    return '<div class="wb-filters" role="group" aria-label="WOD olekufilter">'+
      [['all','Kõik'],['review','Ülevaatamisel'],['pending','Töötlemata'],['ready','Valmis'],['missing','Pilti puudu']].map(([key,label])=>
        '<button type="button" class="wb-filter '+(selected===key?'on':'')+'" aria-pressed="'+(selected===key)+'" onclick="crossfitWodUI.setFilter('+"'"+key+"'"+')">'+
          label+' <span>'+n[key]+'</span></button>').join('')+
    '</div>';
  }
  function pager(d){
    if(d.totalPages<=1)return '';
    return '<nav class="wb-pages" aria-label="WOD leheküljed">'+
      '<button type="button" onclick="crossfitWodUI.page(-1)" '+(s.wodUiPage===0?'disabled':'')+'>Eelmine</button>'+
      '<span>Leht '+(s.wodUiPage+1)+' / '+d.totalPages+'</span>'+
      '<button type="button" onclick="crossfitWodUI.page(1)" '+(s.wodUiPage>=d.totalPages-1?'disabled':'')+'>Järgmine</button>'+
    '</nav>';
  }
  function listSection(){
    const data=paged();
    const content=data.list.map(card).join('')||
      '<div class="wb-empty"><strong>Selliseid WOD-e ei leitud.</strong>'+
      '<p>Proovi muuta otsingut või vali teine olek.</p>'+
      '<button type="button" onclick="crossfitWodUI.reset()">Näita kõiki</button></div>';
    return '<div class="wb-count" id="wodShownCount">Kuvatud '+data.list.length+' / '+data.total+' WOD-i</div>'+
      '<div class="wb-list">'+content+'</div>'+pager(data);
  }
  function renderBank(){
    // Käivitab olemasoleva privaatfoto laadija, jättes fotoandmed ja OCR-i puutumata.
    beforeModal();
    const n=counts(),state=settings();
    return '<div class="sheet-backdrop" onclick="backdropClose(event)">'+
      '<div class="sheet wb-sheet" role="dialog" aria-modal="true" aria-labelledby="wbTitle" onclick="event.stopPropagation()">'+
      '<div class="sheet-head"><div class="sheet-title" id="wbTitle">WOD-pank</div>'+
        '<button type="button" class="sheet-close" aria-label="Sulge" onclick="closeModal()">×</button></div>'+
      '<div class="sheet-body wb-body">'+
      '<div class="wb-intro"><span>PRIVAATNE TREENINGUKOGU</span>'+
        '<h2>Leia ja kontrolli WOD-e</h2>'+
        '<p>Originaalfotod jäävad alles. Kinnitamata tekste ei muudeta automaatselt valmis WOD-ideks.</p></div>'+
      '<div class="wb-counts">'+
        [['all','Kõik WOD-id'],['review','Vajab kontrolli'],['pending','Töötlemata'],['ready','Valmis']].map(([key,label])=>
          '<button type="button" onclick="crossfitWodUI.setFilter('+"'"+(key==='all'?'all':key)+"'"+')"><strong>'+n[key]+
          '</strong><span>'+label+'</span></button>').join('')+'</div>'+
      '<div class="wb-upload"><h3>Lisa uusi fotosid</h3>'+
        '<div class="wb-upload-actions">'+
          '<button type="button" class="wb-primary" onclick="pickWodCamera()">'+svg.camera+' Tee pilt</button>'+
          '<button type="button" class="wb-secondary" onclick="pickWodGallery()">Vali galeriist</button>'+
          (n.missing?'<button type="button" class="wb-secondary" onclick="pickOldWodImages()">Lisa '+n.missing+' vana fotot</button>':'')+
          (n.noDraft?'<button type="button" class="wb-secondary" onclick="buildAllWodDrafts()">Loo tekstimustandid ('+n.noDraft+')</button>':'')+
        '</div>'+
        '<input type="file" id="wodCameraInput" accept="image/*" capture="environment" class="wb-file" onchange="wodFilePicked(this)">'+
        '<input type="file" id="wodGalleryInput" accept="image/*" class="wb-file" onchange="wodFilePicked(this)">'+
        '<input type="file" id="oldWodImagesInput" accept="image/*" multiple class="wb-file" onchange="oldWodImagesPicked(this)">'+
        '<p id="wodBatchOcrProgress" class="wb-upload-message" aria-live="polite">'+(s.wodBatchOcrRunning?'Tekstimustandite loomine käib…':'Tekstimustandid vajavad alati treeneri kontrolli.')+'</p>'+
        '<p id="wodOcrProgress" class="wb-upload-message" aria-live="polite"></p>'+
      '</div>'+
      '<div class="wb-search-panel"><label for="wbSearch">Otsi WOD-i</label>'+
        '<div class="wb-search-input">'+svg.search+
        '<input id="wbSearch" type="search" placeholder="Harjutus, pealkiri või kuupäev…" autocomplete="off" value="'+esc(state.search)+'" oninput="crossfitWodUI.search(this.value)">'+
        '</div></div>'+
      '<div id="wbFilterArea">'+filters()+'</div>'+
      '<div class="wb-sort"><label for="wbSort">Järjesta</label><select id="wbSort" onchange="crossfitWodUI.setSort(this.value)">'+
      [['newest','Uuemad enne'],['oldest','Vanemad enne'],['name','Nime järgi']].map(([key,label])=>
        '<option value="'+key+'"'+(state.sort===key?' selected':'')+'>'+label+'</option>').join('')+
      '</select></div>'+
      '<div id="wbResults" aria-live="polite">'+listSection()+'</div>'+
      '</div></div></div>';
  }
  function renderDetail(){
    const original=beforeModal(),entry=(s.wodBank||[]).find(x=>Number(x.id)===Number(s.modalData));
    if(!entry||!window.isTrainer())return original;
    const canUse=entry.status==='ready'&&String(entry.workout_text||'').trim();
    const existing=(s.trainings||[]).filter(t=>t.status==='published'&&Date.parse(t.starts_at)>Date.now())
      .sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).slice(0,50);
    const selection=canUse?'<div class="wb-use-panel"><h3>Lisa WOD olemasolevale treeningule</h3>'+
        '<p>Vali treening. Selle muutmisvorm avaneb eeltäidetud WOD-iga ja saad muudatuse enne salvestamist üle kontrollida.</p>'+
        (existing.length?
          '<label for="wbExisting">Treening</label><select id="wbExisting">'+existing.map(t=>{
            const id=numberId(t.id);if(id===null)return '';
            const date=dateOf({created_at:t.starts_at});
            return '<option value="'+id+'">'+esc(date+' · '+(t.title||'CrossFit'))+'</option>';
          }).join('')+'</select>'+
          '<button type="button" class="wb-primary" onclick="crossfitWodUI.useExisting()">Ava treening muutmiseks '+svg.arrow+'</button>':
          '<p>Ühtegi tulevast treeningut veel pole. Loo uus treening nupuga „Kasuta treeningus”.</p>')+
        '</div>':
      '<div class="wb-use-panel wb-use-disabled"><h3>WOD-i kasutamine</h3>'+
        '<p>Kinnita esmalt WOD-i tekst nupuga „Kinnita valmis”. Alles siis saad selle lisada olemasolevale treeningule.</p></div>';
    const warning='<div class="wb-review-note">'+svg.check+
      '<span>'+(entry.status==='ready'?'Valmis WOD – teksti saab treeningus kasutada.':
        'Võrdle teksti originaalfotoga, paranda vajadusel ja kinnita alles siis valmis.')+'</span></div>';
    const marker='<div class="training-meta" style="margin-bottom:12px">';
    if(!original.includes(marker))return original;
    return original.replace(marker,warning+selection+marker);
  }
  function renderModal(){
    if(!window.isTrainer())return beforeModal();
    if(s.modal==='wodBank')return renderBank();
    if(s.modal==='wodDetail')return renderDetail();
    return beforeModal();
  }
  function hydrate(){
    if(window.hydrateWodImportImages)window.hydrateWodImportImages().catch(error=>console.warn('WOD photos:',error));
  }
  function refreshResults(){
    const target=document.getElementById('wbResults');
    if(!target)return;
    target.innerHTML=listSection();
    const filtersEl=document.getElementById('wbFilterArea');
    if(filtersEl)filtersEl.innerHTML=filters();
    hydrate();
  }
  function search(value){s.wodUiSearch=String(value||'');s.wodUiPage=0;refreshResults()}
  function setFilter(value){
    if(!['all','review','pending','ready','missing'].includes(value))return;
    s.wodUiFilter=value;s.wodUiPage=0;refreshResults();
  }
  function setSort(value){
    if(!['newest','oldest','name'].includes(value))return;
    s.wodUiSort=value;s.wodUiPage=0;refreshResults();
  }
  function page(offset){
    s.wodUiPage=Math.max(0,s.wodUiPage+Number(offset||0));
    refreshResults();
    document.getElementById('wbResults')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function reset(){
    s.wodUiSearch='';s.wodUiFilter='all';s.wodUiSort='newest';s.wodUiPage=0;window.render();
  }
  function useExisting(){
    if(!window.isTrainer()||s.modal!=='wodDetail')return false;
    const entry=(s.wodBank||[]).find(x=>Number(x.id)===Number(s.modalData));
    if(entry?.status!=='ready'||!String(entry.workout_text||'').trim()){
      window.toast('WOD tuleb enne kasutamist kinnitada valmis.');
      return false;
    }
    // Kui tekst on avatud redaktoris muudetud, nõua enne kinnitatud versiooni uuendamist.
    const editor=document.getElementById('wodText');
    if(editor&&String(editor.value||'').trim()!==String(entry.workout_text).trim()){
      window.toast('Salvesta kõigepealt WOD-i muudatused.');
      return false;
    }
    const selected=numberId(document.getElementById('wbExisting')?.value);
    const training=(s.trainings||[]).find(t=>Number(t.id)===selected&&
      t.status==='published'&&Date.parse(t.starts_at)>Date.now());
    if(!training){window.toast('Vali tulevane treening.');return false}
    if(String(training.workout||'').trim()){
      if(!window.confirm('Valitud treeningul on juba WOD. Kas soovid avada muutmisvormi ja asendada selle uue WOD-iga?'))return false;
    }
    // Ainult avab treeningu muutmisvormi – muutus salvestub alles treeneri kinnitusel.
    window.openTrainingForm({...training,workout:String(entry.workout_text).trim()});
    return true;
  }

  window.renderModal=renderModal;
  window.crossfitWodUI={renderBank,renderDetail,filtered,paged,counts,setFilter,setSort,search,page,reset,useExisting};
})();