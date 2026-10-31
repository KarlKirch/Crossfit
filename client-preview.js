'use strict';

/* Rõuge CrossFit: admini mittekirjutav kliendieelvaade.
 * Kuvab päris kliendikomponente, kuid kasutab eraldi sünteetilist isikut
 * ja registreeringuid. Ei salvesta eelvaadet ega vaheta päris Supabase kontot.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.render!=='function')return;
  const DEMO='ffffffff-ffff-4fff-8fff-fffffffffff1';
  const originalMore=window.renderMore,originalModal=window.renderModal;
  const keys=['session','profile','view','modal','modalData','trainingTab',
    'trainings','registrations','profiles','wallets','creditTransactions',
    'userPackages','notifications','packageTypes','removedClients'];
  let original=null,scenario='booked';
  const validId=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;};
  const isPreview=()=>Boolean(s.clientPreview&&original);
  const scenarios=[
    ['booked','Registreeritud'],
    ['empty','0 krediiti'],
    ['credits','3 krediiti'],
    ['waitlist','Ootenimekiri']
  ];
  const scenarioLabel=key=>scenarios.find(x=>x[0]===key)?.[1]||scenarios[0][1];
  function fakeTraining(){
    const valid=(original.trainings||[]).filter(t=>t.status==='published'&&!t.archived_at&&Date.parse(t.starts_at)>Date.now())
      .sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
    if(valid.length)return valid[0];
    return {id:900000009,title:'CrossFit',starts_at:new Date(Date.now()+3*86400000).toISOString(),
      duration_minutes:90,capacity:12,cancellation_hours:2,status:'published',workout:'',
      archived_at:null,created_by:original.session?.user?.id};
  }
  function renderDemo(key){
    if(!original)return false;
    if(!scenarios.some(x=>x[0]===key))return false;
    scenario=key;
    const training=fakeTraining(),id=validId(training.id),hasReal=original.trainings.some(t=>Number(t.id)===id);
    s.trainings=hasReal?original.trainings.map(t=>({...t})):original.trainings.concat(training);
    s.profile={user_id:DEMO,display_name:'Näidisklient',role:'client',avatar_path:null};
    s.session={user:{id:DEMO,email:'naidisklient@example.invalid',user_metadata:{display_name:'Näidisklient'}},
      access_token:null,refresh_token:null};
    s.profiles=[s.profile]; // Päris klientide nimesid eelvaates ei kasutata.
    s.wallets=[{user_id:DEMO,credits:key==='empty'?0:3}];
    s.userPackages=[];
    s.creditTransactions=key==='empty'?[]:[{id:900001,user_id:DEMO,delta:3,reason:'Näidis: lisatud treeningkrediit',
      created_at:new Date().toISOString(),amount_cents:null}];
    s.registrations=(key==='booked'||key==='waitlist')&&id?[{
      id:900002,user_id:DEMO,training_id:id,
      status:key==='waitlist'?'waitlist':'confirmed',
      credit_charged:key==='booked',payment_status:'credit',created_at:new Date().toISOString()
    }]:[];
    s.notifications=(key==='booked'||key==='waitlist')&&id?[{
      id:900003,user_id:DEMO,training_id:id,kind:key==='waitlist'?'waitlist_joined':'registration_confirmed',
      title:key==='waitlist'?'Oled ootenimekirjas':'Registreering kinnitatud',
      body:'See on näidisteade kliendieelvaates.',created_at:new Date().toISOString(),read_at:null
    }]:[];
    s.removedClients=[];
    s.trainingTab='upcoming';
    s.view='home';s.modal=null;s.modalData=null;
    s.clientPreview=true;
    window.render();
    return true;
  }
  function start(key='booked'){
    if(original||!s.session?.user||s.profile?.role!=='trainer')return false;
    original={};
    for(const k of keys)original[k]=s[k];
    // Lõpetame päris kliendiandmete kasutamise juba enne esimest kliendivaate renderdust.
    const ok=renderDemo(key);
    if(!ok){original=null;return false;}
    return true;
  }
  function exit(){
    if(!original)return false;
    const save=original;original=null;
    for(const k of keys)s[k]=save[k];
    s.clientPreview=false;
    // Mobiili tagasi-nupp ei tohi eelvaatesse kinni jääda.
    if(typeof history!=='undefined'&&history.replaceState){
      history.replaceState({...history.state,crossfitView:s.view||'more',wodModal:null,wodId:null},'');
    }
    window.render();
    return true;
  }
  function setScenario(key){if(!isPreview())return false;return renderDemo(key);}
  function banner(){
    if(!isPreview())return '';
    return '<aside class="rcf-client-preview-banner" role="region" aria-label="KLIENDIVAADE – näidis">'+
      '<div class="rcf-preview-label"><strong>KLIENDIVAADE · NÄIDIS</strong>'+
      '<span>Kirjutuskaitstud eelvaade – ei muuda pärisandmeid</span></div>'+
      '<div class="rcf-preview-controls" role="group" aria-label="Kliendi olukord">'+
        scenarios.map(([key,label])=>'<button type="button" class="rcf-preview-scenario'+
          (scenario===key?' is-selected':'')+'" aria-pressed="'+(scenario===key)+
          '" onclick="rcfClientPreview.setScenario(\''+key+'\')">'+label+'</button>').join('')+
      '</div><button type="button" class="rcf-preview-exit" onclick="rcfClientPreview.exit()">Tagasi haldusesse</button>'+
      '</aside>';
  }
  function adminEntry(){
    return '<section class="rcf-preview-entry"><div><span class="rcf-preview-kicker">KASUTAJAKOGEMUS</span>'+
      '<h2>Vaata rakendust kliendina</h2><p>Testi avalehte, treeninguid, krediiti ja registreeringuid ilma kliendikontot loomata.</p></div>'+
      '<button type="button" class="rcf-preview-start" onclick="rcfClientPreview.start()">Vaata kliendina</button>'+
      '<small>Kliendieelvaade kasutab näidisandmeid ja on kirjutuskaitstud.</small></section>';
  }
  function help(){
    if(!s.session?.user)return false;
    s.modal='creditHelp';s.modalData=null;
    window.render();
    return true;
  }
  window.renderMore=function(){
    const html=originalMore();
    return s.profile?.role==='trainer'&&!isPreview()?adminEntry()+html:html;
  };
  window.renderModal=function(){
    if(s.modal!=='creditHelp')return originalModal();
    return '<div class="sheet-backdrop" onclick="backdropClose(event)">'+
      '<div class="sheet rcf-credit-help-sheet" role="dialog" aria-modal="true" aria-labelledby="rcf-credit-help-title" onclick="event.stopPropagation()">'+
      '<div class="sheet-head"><div class="sheet-title" id="rcf-credit-help-title">Kuidas krediiti saada?</div>'+
        '<button type="button" class="sheet-close" onclick="closeModal()" aria-label="Sulge">×</button></div>'+
      '<div class="sheet-body"><p>Ühel treeningul osalemiseks vajad 1 treeningkrediiti.</p>'+
      '<ol class="rcf-credit-steps"><li>Võta treeneriga ühendust treeningul või tavapärases kontaktikanalis.</li>'+
      '<li>Lepi treeneriga kokku treeningkrediidi kogus ja tasumine.</li>'+
      '<li>Treener lisab krediidi sinu kontole. Uut jääki näed lehel <strong>Minu</strong>.</li>'+
      '<li>Vali sobiv treening ja vajuta <strong>Registreeru</strong>.</li></ol>'+
      '<p class="rcf-credit-disclaimer">Rakenduses ei saa praegu krediiti otse osta ega selle eest maksta. Kui krediit on otsas, ei saa ka ootenimekirjaga liituda.</p>'+
      '<button type="button" class="btn btn-primary btn-block" onclick="closeModal();go(\'trainings\')">Vaata treeninguid</button>'+
      '</div></div></div>';
  };
  function blockUnsafe(event){
    if(!isPreview())return;
    const button=event.target?.closest?.('button,a,[onclick]');
    const action=String(button?.getAttribute?.('onclick')||'');
    // Navigatsioon, read-only detailid ja näidise vahetamine jäävad aktiivseks.
    // Kõik kirjutavad / seanssi muutvad toimingud blokeeritakse lisaks API kaitsele.
    if(/(?:registerTraining|cancelRegistration|logout|saveProfile|submitAuth|markNotificationsRead|togglePush|reloadData|crossfitNotifications\.(?:markAll|refresh)|installApp|openProfileEdit|openShare|downloadIcs|openGoogleCalendar|crossfitMyAccount\.showCreditHistory)/.test(action)){
      // Krediidiajaloole lubame siiski ainult lugemise.
      if(action.includes('showCreditHistory'))return;
      event.preventDefault();event.stopImmediatePropagation();
      window.toast('See on kirjutuskaitstud kliendieelvaade. Pärisandmeid ei muudeta.');
    }
  }
  document.addEventListener('click',blockUnsafe,true);
  window.openCreditHelp=help;
  window.rcfClientPreview={start,exit,setScenario,banner,isActive:isPreview,scenarioLabel};
})();