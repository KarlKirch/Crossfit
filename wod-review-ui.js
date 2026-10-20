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
  // Vanades fotodes kasuta tahvlile märgitud kuupäeva, kui tekst seda selgelt sisaldab.
  // Uutel fotodel kasuta loomiskuupäeva; teadmata ajaloolist kuupäeva ära asenda impordiajaga.
  function validDate(value){
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return '';
    const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
    if(y<2000||y>2100)return '';
    const dt=new Date(Date.UTC(y,m-1,d,12));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()+1===m&&dt.getUTCDate()===d?match[0]:'';
  }
  function imageDateFromText(entry){
    const text=String(entry.workout_text||entry.draft_text||'').slice(0,180);
    const regex=/\b([0-3]?\d)[.\/]([01]?\d)[.\/](20\d{2})(?:\b|[.])/g;
    let hit;
    while((hit=regex.exec(text))!==null){
      if(hit.index>75)break;
      const found=validDate(hit[3]+'-'+hit[2].padStart(2,'0')+'-'+hit[1].padStart(2,'0'));
      if(found)return found;
    }
    return '';
  }
  function effectiveDate(entry){
    const recorded=validDate(entry.source_date);
    if(entry.source_drive_file_id){
      const board=imageDateFromText(entry);
      if(board)return {date:board,kind:'board',conflict:!!recorded&&recorded!==board,recorded};
      if(recorded)return {date:recorded,kind:'filename',conflict:false,recorded};
      return {date:'',kind:'unknown',conflict:false,recorded:''};
    }
    if(recorded)return {date:recorded,kind:'new',conflict:false,recorded};
    const created=new Date(entry.created_at);
    const createdDate=Number.isFinite(created.getTime())?
      new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'}).format(created):'';
    return {date:validDate(createdDate),kind:'new',conflict:false,recorded:''};
  }
  function dateOf(entry){
    const date=effectiveDate(entry).date;
    if(!date)return 'Kuupäev teadmata';
    const [year,month,day]=date.split('-');
    return day+'.'+month+'.'+year;
  }
  function dateCaption(entry){
    const kind=effectiveDate(entry).kind;
    return kind==='board'?'Kuupäev WOD-i tekstist':
      kind==='filename'?'Foto kuupäev failinimest':
      kind==='new'?'Foto loomise kuupäev':'Kuupäev vajab kontrollimist';
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
    const dated=x=>effectiveDate(x).date;
    list.sort((a,b)=>{
      if(opts.sort==='name')return String(a.title||'').localeCompare(String(b.title||''),'et',{sensitivity:'base'})||
        dated(b).localeCompare(dated(a))||Number(b.id)-Number(a.id);
      const ad=dated(a),bd=dated(b);
      // Teadmata kuupäevaga vanad fotod on alati nimekirja lõpus.
      if(!ad)return bd?1:0;
      if(!bd)return -1;
      return (opts.sort==='oldest'?ad.localeCompare(bd):bd.localeCompare(ad))||
        String(b.created_at||'').localeCompare(String(a.created_at||''))||Number(b.id)-Number(a.id);
    });
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
  // Võtab WOD-i algtekstist ainult kuvatava struktuuri. Andmebaasis
  // säilib algne OCR/mustand täpselt sellisena, nagu treener selle salvestas.
  function formattedSections(raw){
    const text=String(raw||'').replace(/\r\n?/g,'\n').trim();
    if(!text)return [];
    const pattern=/(^|[.!?]\s+|\n+)((?:PARTNER|TEAM)\s+WOD|WARM[\s-]?UP|SOE(?:\s*\(warm[\s-]?up\))?|STRENGTH|SKILL|WOD|CORE|FINISH(?:ER)?|TABATA|MOBILITY|COOL[\s-]?DOWN)\b/gi;
    const markers=[];
    let match;
    while((match=pattern.exec(text))!==null){
      const pos=match.index+match[1].length;
      if(pos>0&&text[pos-1]==='.')continue; // ära tõlgenda lühendi osa alapealkirjaks
      markers.push(pos);
    }
    const chunks=[];
    if(markers.length&&markers[0]>0)chunks.push({heading:'',body:text.slice(0,markers[0]).trim()});
    if(!markers.length)chunks.push({heading:'',body:text});
    for(let i=0;i<markers.length;i++){
      const fragment=text.slice(markers[i],markers[i+1]??text.length).trim();
      const colon=fragment.indexOf(':');
      const dot=fragment.search(/\.\s*(?:\n|$)/);
      let heading='',body=fragment;
      if(colon>0&&colon<115&&!fragment.slice(0,colon).includes(';')&&!fragment.slice(0,colon).includes('\n')){
        heading=fragment.slice(0,colon).trim();
        body=fragment.slice(colon+1).trim();
      }else if(dot>0&&dot<55){
        heading=fragment.slice(0,dot).trim();
        body=fragment.slice(dot+1).trim();
      }
      chunks.push({heading,body});
    }
    return chunks.filter(x=>x.heading||x.body).map(x=>({
      heading:x.heading,
      lines:x.body.split(/\s*;\s*|\n+/).map(line=>line.trim()).filter(Boolean)
    }));
  }
  function structuredText(raw,compact=false){
    const all=formattedSections(raw);
    if(!all.length)return '<p class="wb-wod-unavailable">Tekst puudub – ava kava ja kontrolli originaalfotot.</p>';
    let remaining=compact?10:Infinity,truncated=false;
    const parts=[];
    for(const section of all){
      if(remaining<=0){truncated=true;break}
      const count=Math.min(remaining,section.lines.length);
      const lines=section.lines.slice(0,count);
      if(section.lines.length>count)truncated=true;
      remaining-=count;
      const heading=section.heading?'<h4 class="wb-wod-heading">'+esc(section.heading)+'</h4>':'';
      const body=lines.map(line=>'<div class="wb-wod-line">'+esc(line)+'</div>').join('');
      parts.push('<div class="wb-wod-section">'+heading+body+'</div>');
    }
    return '<div class="wb-structured-wod">'+parts.join('')+
      (truncated?'<p class="wb-wod-more">Kava jätkub – ava kogu WOD.</p>':'')+'</div>';
  }
  function card(entry){
    const id=numberId(entry.id);if(id===null)return '';
    const [label,tone]=statusName(entry.status),text=textOf(entry);
    const date=esc(dateOf(entry)),dateInfo=effectiveDate(entry);
    return '<article class="wb-card">'+
      '<div class="wb-card-head">'+
        '<div class="wb-card-photo">'+image(entry)+'</div>'+
        '<div class="wb-card-content">'+
          '<div class="wb-card-flags"><span class="wb-status wb-status-'+tone+'">'+label+'</span>'+
            (!entry.image_path&&!entry.source_drive_file_id?'<span class="wb-status wb-status-missing">Pilt puudu</span>':'')+'</div>'+
          '<h3>'+esc(entry.title||'WOD')+'</h3><p class="wb-date">'+date+' · '+dateCaption(entry)+'</p>'+
          (dateInfo.conflict?'<span class="wb-date-conflict">Kuupäev erineb failinimest – kontrolli fotot</span>':'')+
        '</div></div>'+
      '<div class="wb-card-workout">'+structuredText(text,true)+'</div>'+
      '<button type="button" class="wb-card-open" onclick="openWodEntry('+id+')">'+
        (entry.status==='ready'?'Vaata kogu WOD-i':'Ava kogu kava ja kontrolli')+' '+svg.arrow+'</button>'+
    '</article>';
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
      '<button type="button" class="wb-page-prev" onclick="crossfitWodUI.page(-1)" '+(s.wodUiPage===0?'disabled':'')+'>← Eelmine</button>'+
      '<span class="wb-page-current">Leht '+(s.wodUiPage+1)+' / '+d.totalPages+'</span>'+
      '<button type="button" class="wb-page-next" onclick="crossfitWodUI.page(1)" '+(s.wodUiPage>=d.totalPages-1?'disabled':'')+'>Järgmine →</button>'+
    '</nav>';
  }
  function listSection(){
    const data=paged();
    const content=data.list.map(card).join('')||
      '<div class="wb-empty"><strong>Selliseid WOD-e ei leitud.</strong>'+
      '<p>Proovi muuta otsingut või vali teine olek.</p>'+
      '<button type="button" onclick="crossfitWodUI.reset()">Näita kõiki</button></div>';
    const navigation=pager(data);
    return '<div class="wb-count" id="wodShownCount">Kuvatud '+data.list.length+' / '+data.total+' WOD-i</div>'+
      (navigation?'<div class="wb-top-pagination">'+navigation+'</div>':'')+
      '<div class="wb-list">'+content+'</div>'+navigation;
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
    const info=effectiveDate(entry);
    const boardHint='<div class="wb-photo-date-note"><strong>Järjestamise kuupäev: '+esc(dateOf(entry))+'</strong>'+
      '<span>'+dateCaption(entry)+'</span>'+
      (info.conflict?'<p>WOD-i tekstis on '+esc(dateOf(entry))+
        ', kuid faili kuupäev on '+esc(info.recorded.split('-').reverse().join('.'))+
        '. Kontrolli originaalfotot ja vajadusel paranda kuupäevavälja.</p>':'')+'</div>';
    const structured='<section class="wb-detail-preview"><h3>Kava ülevaade</h3>'+
      structuredText(textOf(entry),false)+'</section>';
    return original.replace(marker,boardHint+warning+structured+selection+marker);
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
  window.crossfitWodUI={renderBank,renderDetail,filtered,paged,counts,setFilter,setSort,search,page,reset,useExisting,formattedSections,structuredText,effectiveDate,dateOf,imageDateFromText};
})();