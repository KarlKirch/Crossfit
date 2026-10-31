'use strict';
/* CrossFit: sõltuvusteta lokaalne suitsutest (Node.js >= 20).
   Ei kasuta võrku, päris kasutajaid, Supabase'i kirjutusi ega push-teateid. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('index.html');
const worker=read('sw.js');
const jsFiles=[...source.matchAll(/<script\s+src="\.\/([^"?]+)(?:\?[^"]+)?"\s+defer><\/script>/g)].map(x=>x[1]);
const cssFiles=[...source.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/([^"?]+)(?:\?[^"]+)?"\s*>/g)].map(x=>x[1]);
let count=0;
function test(name,fn){
  try{fn();count++;process.stdout.write('✓ '+name+'\n');}
  catch(e){process.stderr.write('✗ '+name+'\n'+(e.stack||e)+'\n');process.exitCode=1;}
}
test('Scripts included and in expected order',()=>{
  assert(jsFiles.length>=18,'Expected modular app scripts');
  assert.equal(jsFiles.at(-1),'client-preview.js');
  assert(jsFiles.indexOf('client-preview.js')>jsFiles.indexOf('brand-home.js'));
  assert(jsFiles.indexOf('brand-home.js')>jsFiles.indexOf('notification-center.js'));
  assert(jsFiles.indexOf('training-form-redesign.js')>jsFiles.indexOf('wod-review-ui.js'));
});
test('All linked JS/CSS files exist and parse',()=>{
  assert(cssFiles.length);
  for(const file of [...jsFiles,...cssFiles]){
    assert(fs.existsSync(path.join(root,file)),'Missing '+file);
    if(file.endsWith('.js'))new vm.Script(read(file),{filename:file});
  }
  new vm.Script(worker,{filename:'sw.js'});
});
test('PWA precache includes all linked assets',()=>{
  const match=worker.match(/const CORE=(\[[^\n]+\]);/);
  assert(match,'Missing CORE array');
  const precache=vm.runInNewContext(match[1]);
  for(const file of [...jsFiles,...cssFiles]){
    assert(precache.some(x=>x.split('?')[0]==='./'+file),'Not precached: '+file);
  }
  for(const entry of precache){
    const disk=entry.split('?')[0].replace(/^\.\//,'');
    if(!disk)continue;
    assert(fs.existsSync(path.join(root,disk)),'Missing cached asset: '+disk);
  }
});
test('Manifest and both PWA icons exist',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url,'/Crossfit/');
  assert.equal(manifest.scope,'/Crossfit/');
  assert.equal(manifest.name,'Rõuge CrossFit');
  assert.equal(manifest.theme_color,'#14191E');
   assert.equal(manifest.background_color,'#14191E');
  assert(fs.existsSync(path.join(root,'brand-rcf.webp')),'Missing RCF logo');
  for(const icon of manifest.icons){
    assert(fs.existsSync(path.join(root,icon.src.replace(/^\/Crossfit\//,''))),'Missing '+icon.src);
  }
});
const htmlRoot={innerHTML:''};
const passive={classList:{add(){},remove(){}},textContent:'',addEventListener(){}};
const document={
  visibilityState:'visible',
  getElementById(id){return id==='appRoot'?htmlRoot:id==='toast'||id==='updateBanner'||id==='updateNow'?passive:null;},
  addEventListener(){},querySelectorAll(){return []},querySelector(){return null},
  createElement(){return {style:{},click(){},setAttribute(){},addEventListener(){},append(){},remove(){},getContext(){return {clearRect(){},drawImage(){}}}};},
  body:{appendChild(){},removeChild(){}}
};
const location={search:'',pathname:'/Crossfit/',hash:''};
const history={state:{},length:1,pushState(value){this.state=value},replaceState(value){this.state=value}};
const sandbox={
  document,location,history,
  console,Date,Intl,Math,Promise,JSON,Number,String,Set,Map,Array,URL,URLSearchParams,
  navigator:{serviceWorker:{}},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  crossfitAuth:{configure(){}},
  crossfitInstall:{banner(){return ''},installed(){return true},moreItem(){return ''}},
  addEventListener(){},scrollTo(){},setInterval(){return 1},clearInterval(){},
  setTimeout(){return 1},clearTimeout(){},
  confirm(){return true},
  fetch(){throw new Error('Network must not be called in smoke tests')},
  atob(){return ''},
  crypto:{randomUUID(){return '11111111-1111-4111-8111-111111111111'}}
};
sandbox.window=sandbox;
const context=vm.createContext(sandbox);
test('App and all feature modules initialize without browser network',()=>{
  for(const file of jsFiles){
    const code=file==='app.js'?read(file).replace(/\nboot\(\);\s*$/,'\n'):read(file);
    vm.runInContext(code,context,{filename:file,timeout:10000});
  }
  assert(context.state&&typeof context.render==='function');
});
const uid='11111111-1111-4111-8111-111111111111';
const clientId='22222222-2222-4222-8222-222222222222';
const otherId='33333333-3333-4333-8333-333333333333';
const future=new Date(Date.now()+3*86400000).toISOString();
const past=new Date(Date.now()-3*86400000).toISOString();
Object.assign(context.state,{
  session:{user:{id:uid,email:'trainer@example.ee'},access_token:'test'},
  profile:{user_id:uid,role:'trainer',display_name:'Test Coach'},
  profiles:[{user_id:uid,role:'trainer',display_name:'Test Coach'},
    {user_id:clientId,role:'client',display_name:'Anna Test'},
    {user_id:otherId,role:'client',display_name:'Mari Test'}],
  trainings:[{id:11,title:'Monday WOD',starts_at:future,status:'published',capacity:8,duration_minutes:90,price_cents:500,cancellation_hours:4,workout:'20 burpees'},
    {id:12,title:'Old WOD',starts_at:past,status:'published',capacity:8,duration_minutes:90,price_cents:500,cancellation_hours:4}],
  registrations:[{id:1,training_id:11,user_id:clientId,status:'confirmed',credit_charged:true,created_at:past},
    {id:2,training_id:11,user_id:otherId,status:'waitlist',created_at:past}],
  wallets:[{user_id:clientId,credits:4},{user_id:otherId,credits:1},{user_id:uid,credits:0}],
  notifications:[{id:3,user_id:uid,title:'Koht vabanes!',body:'Treeningukoht kinnitatud.',kind:'waitlist_promoted',training_id:11,created_at:past,read_at:null}],
  creditTransactions:[],userPackages:[],packageTypes:[],removedClients:[],
  wodBank:[{id:25,title:'WOD 2020-01-01',status:'ready',source_date:'2020-01-01',workout_text:'10 squats',created_at:past}],
  trainingTemplates:[],announcements:[],trainingTab:'upcoming',modal:null,modalData:null
});
for(const role of ['trainer','client']){
  test(role+': all primary tabs render',()=>{
    context.state.profile.role=role;
    context.state.profile.user_id=role==='trainer'?uid:clientId;
    context.state.profile.display_name=role==='trainer'?'Test Coach':'Anna Test';
    context.state.session.user.id=context.state.profile.user_id;
    for(const tab of ['home','trainings','people','more','notifications']){
      context.state.modal=null;context.state.view=tab;
      context.render();
      assert(htmlRoot.innerHTML.length>150,'Empty '+tab);
    }
  });
  test(role+': training details open',()=>{
    context.state.modal='training';context.state.modalData=11;
    context.render();
    assert(htmlRoot.innerHTML.includes('Monday WOD'));
  });
}
test('Coach: create/edit workout and WOD bank open',()=>{
  context.state.session.user.id=uid;
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  for(const [modal,data,fragment] of [['trainingForm',null,'tfDuration'],['wodBank',null,'wb-body'],['wodDetail',25,'wod'],['client',clientId,'Anna Test']]){
    context.state.modal=modal;context.state.modalData=data;context.render();
    assert(htmlRoot.innerHTML.includes(fragment),'Missing '+fragment);
  }
});
test('New workouts default to 90 minutes',()=>{
  const form=context.trainingForm({});
  assert(form.includes('id="tfDuration"'));
  assert(form.includes('value="90"'));
});
test('Historical WOD dates and structure are kept',()=>{
  assert.equal(context.crossfitWodUI.displayWodTitle({title:'WOD 2020-01-01'}),'WOD 01.01.2020');
  const html=context.crossfitWodUI.structuredText('WOD: 10 burpees; 20 squats');
  assert(html.includes('10 burpees')&&html.includes('20 squats'));
});
test('Treeneri bränd ja kliendi kiire avaleht on erinevad',()=>{
  for(const role of ['trainer','client']){
    context.state.profile.role=role;
    context.state.profile.user_id=role==='trainer'?uid:clientId;
    context.state.session.user.id=context.state.profile.user_id;
    context.state.modal=null;context.state.view='home';context.render();
    if(role==='trainer')assert(htmlRoot.innerHTML.includes('rcf-brand-hero'));
    else{
      assert(!htmlRoot.innerHTML.includes('rcf-brand-hero'));
      assert(htmlRoot.innerHTML.includes('rcf-client-home'));
    }
    assert(htmlRoot.innerHTML.includes('brand-rcf.webp'));
    assert(htmlRoot.innerHTML.includes('Monday WOD'));
  }
});
test('Trainer can remove old test workouts from history',()=>{
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session.user.id=uid;
  context.state.trainingTab='past';
  context.state.modal=null;
  context.state.view='trainings';
  context.render();
  assert(htmlRoot.innerHTML.includes('Old WOD'));
  assert(htmlRoot.innerHTML.includes('tl-history-remove'));
  assert(htmlRoot.innerHTML.includes('deleteTraining(12)'));
  context.state.modal='training';context.state.modalData=12;
  context.render();
  assert(htmlRoot.innerHTML.includes('Eemalda ajaloost'));
});
test('Client never sees past-training removal',()=>{
  context.state.profile={user_id:clientId,role:'client',display_name:'Anna Test'};
  context.state.session.user.id=clientId;
  context.state.trainingTab='past';
  context.state.modal=null;context.state.view='trainings';
  context.render();
  assert(htmlRoot.innerHTML.includes('Old WOD'));
  assert(!htmlRoot.innerHTML.includes('tl-history-remove'));
  context.state.modal='training';context.state.modalData=12;
  context.render();
  assert(!htmlRoot.innerHTML.includes('deleteTraining(12)'));
});
test('Archived September trainings are invisible in both roles',()=>{
  const archived={id:991,title:'ARCHIVED TEST TRAINING',starts_at:past,status:'cancelled',
    archived_at:new Date().toISOString(),capacity:12,duration_minutes:90};
  context.state.trainings.push(archived);
  try{
    assert(!context.pastTrainings().some(t=>t.id===991));
    assert(!context.upcomingTrainings().some(t=>t.id===991));
    for(const role of ['trainer','client']){
      context.state.profile.role=role;
      context.state.profile.user_id=role==='trainer'?uid:clientId;
      context.state.session.user.id=context.state.profile.user_id;
      context.state.trainingTab='past';context.state.view='trainings';context.state.modal=null;
      context.render();
      assert(!htmlRoot.innerHTML.includes('ARCHIVED TEST TRAINING'));
    }
  }finally{context.state.trainings=context.state.trainings.filter(t=>t.id!==991);}
});
test('Trainer can cancel already-past training to return credits',()=>{
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session.user.id=uid;
  context.state.modal='training';context.state.modalData=12;context.state.view='trainings';
  context.render();
  assert(htmlRoot.innerHTML.includes('Tühista ja tagasta krediidid'));
  assert(htmlRoot.innerHTML.includes('cancelTraining(12)'));
  assert(read('app.js').includes('Kasutatud krediidid tagastati'));
});
test('Training removal uses server-side finance-safe RPC',()=>{
  assert(read('app.js').includes("rpc('wod_remove_training',{p_training_id:numericId})"));
  assert(read('app.js').includes('archived_at=is.null'));
  assert(!read('app.js').includes("await api(\`wod_trainings?id=eq.\${id}\`,{method:'DELETE'"));
  assert(read('forest-theme.css').includes('body .tl-history-remove'));
});
test('Client cannot see trainer-only actions',()=>{
  context.state.profile.role='client';
  context.state.session.user.id=clientId;
  context.state.modal=null;context.state.view='home';context.render();
  assert(!htmlRoot.innerHTML.includes('tb-dashboard'));
  assert(!htmlRoot.innerHTML.includes('ad-admin'));
});
test('Tasuta tühistamine on uuel treeningul vaikimisi 2 tundi',()=>{
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session.user.id=uid;
  const form=context.trainingForm({});
  assert.match(form,/id="tfCancel"[^>]*value="2"/);
  assert.match(context.cancellationRule({cancellation_hours:2}),/2 h enne treeningut/);
  const start='2026-11-12T19:00:00.000Z';
  const deadline=context.cancellationDeadline({starts_at:start,cancellation_hours:2});
  assert.equal(deadline.toISOString(),'2026-11-12T17:00:00.000Z');
  assert(read('credit-system.js').includes('d.cancellation_hours??2'));
  assert(!read('pro-features.js').includes('openTemplates()'));
  assert(!read('training-list-redesign.js').includes('openTemplates()'));
  context.copyTraining(12);
  assert.equal(context.state.modalData.cancellation_hours,2,'Vana treeningu kopeerimine peab kasutama uut 2h piiri');
});

test('Administraatori kliendieelvaade on kirjutuskaitstud ja taastab algvaate',()=>{
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session={user:{id:uid,email:'trainer@example.ee'},access_token:'test'};
  context.state.view='more';context.state.modal=null;
  const initialTrainingCount=context.state.trainings.length;
  context.render();
  assert(htmlRoot.innerHTML.includes('Vaata kliendina'),'Admin sees client preview entry');
  assert.equal(typeof context.rcfClientPreview?.start,'function');
  context.rcfClientPreview.start('booked');
  assert.equal(context.state.profile.role,'client');
  assert.equal(context.state.clientPreview,true);
  assert.equal(context.state.view,'home');
  assert(htmlRoot.innerHTML.includes('KLIENDIVAADE'), 'Preview banner is always visible');
  assert(!htmlRoot.innerHTML.includes('Haldus'));
  assert.equal(context.state.session.access_token,null);
  assert.equal(context.state.trainings.length,initialTrainingCount);
  assert(htmlRoot.innerHTML.includes('SINU JÄRGMINE TREENING'));
  context.rcfClientPreview.setScenario('empty');
  assert.equal(context.totalCredits(),0);
  context.rcfClientPreview.setScenario('credits');
  assert.equal(context.totalCredits(),3);
  context.rcfClientPreview.exit();
  assert.equal(context.state.clientPreview,false);
  assert.equal(context.state.profile.role,'trainer');
  assert.equal(context.state.session.user.id,uid);
  assert.equal(context.state.view,'more');
  assert.equal(context.state.trainings.length,initialTrainingCount);
});
test('Tavakliendi avaleht ei sisalda eksitavaid topeltvalikuid',()=>{
  context.state.profile={user_id:clientId,role:'client',display_name:'Anna Test'};
  context.state.session.user.id=clientId;
  context.state.view='home';
  context.render();
  assert(!htmlRoot.innerHTML.includes('Minu kavad'));
  assert(!htmlRoot.innerHTML.includes('Minu areng'));
  assert(!htmlRoot.innerHTML.includes('rcf-brand-hero'));
  assert(htmlRoot.innerHTML.includes('treening'));
});

test('Uus treening on 19:00, 90 min ja 8 eurot täiseurose sammuga',()=>{
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session.user.id=uid;
  const html=context.trainingForm({});
  assert.match(html,/id="tfTime"[^>]*>[\s\S]*<option selected>19:00<\/option>/);
  assert.match(html,/id="tfDuration"[^>]*value="90"/);
  assert.match(html,/id="tfPrice"[^>]*value="8"[^>]*step="1"/);
  assert(!html.includes('step="0.01"'));
});
test('Mallide valikud ei paista halduses, treeningus ega uuel treeningul',()=>{
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session.user.id=uid;context.state.modal=null;
  for(const view of ['more','trainings']){
    context.state.view=view;context.render();
    assert(!htmlRoot.innerHTML.includes('openTemplates()'));
    assert(!htmlRoot.innerHTML.includes('Treeningumallid'));
  }
  context.state.modal='training';context.state.modalData=12;context.render();
  assert(!htmlRoot.innerHTML.includes('saveTrainingAsTemplate('));
  assert(!context.trainingForm({}).includes('Mallid'));
});
test('WOD detail sisaldab ühte muudetavat teksti ja ühe sammu määramist',()=>{
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session.user.id=uid;
  context.state.wodBank=[{id:27,title:'WOD',status:'ready',image_path:'test.webp',
    source_date:'2026-10-30',workout_text:'5 ROUNDS 12 BURPEES',draft_text:'OLD OCR'}];
  context.state.modal='wodDetail';context.state.modalData=27;
  const html=context.renderModal();
  assert(html.includes('id="wodText"'));
  assert(!html.includes('Lõplik WOD-tekst'));
  assert(!html.includes('Kava ülevaade'));
  assert(!html.includes('Vaata automaatset algmustandit'));
  assert(!html.includes('Salvesta mustand'));
  assert(!html.includes('Loo tekstimustand uuesti'));
  assert(html.includes('wbExisting')||html.includes('Loo uus treening'));
});

test('WOD ei ilmu ei kliendi ega treeneri avalehele',()=>{
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session.user.id=uid;
  context.state.modal=null;context.state.view='home';context.render();
  assert(!htmlRoot.innerHTML.includes('Treeningu WOD'));
  assert(!htmlRoot.innerHTML.includes('20 burpees'));
  context.state.profile={user_id:clientId,role:'client',display_name:'Anna Test'};
  context.state.session.user.id=clientId;context.render();
  assert(!htmlRoot.innerHTML.includes('Treeningu WOD'));
  assert(!htmlRoot.innerHTML.includes('20 burpees'));
});
test('Treeningu sisu on ainult treeneri detailvaates',()=>{
  context.state.profile={user_id:clientId,role:'client',display_name:'Anna Test'};
  context.state.session.user.id=clientId;context.state.modal='training';context.state.modalData=11;
  context.render();
  assert(!htmlRoot.innerHTML.includes('20 burpees'));
  assert(!htmlRoot.innerHTML.includes('Päeva treening / WOD'));
  context.state.profile={user_id:uid,role:'trainer',display_name:'Test Coach'};
  context.state.session.user.id=uid;context.render();
  assert(htmlRoot.innerHTML.includes('20 burpees'));
});
test('Treeningud loetakse turvalise RPC kaudu, mitte otse tabelist',()=>{
  const app=read('app.js');
  assert(app.includes("rpc('wod_list_trainings_secure'"));
  assert(!app.includes('wod_trainings?select=*'));
});
process.stdout.write('\n'+count+' CrossFit smoke checks passed.\n');
if(process.exitCode)process.exit(process.exitCode);
