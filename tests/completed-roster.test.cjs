'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),
 fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function harness({preview=false,trainer=false,finished=true,serverFail=false}={}){
 const id=27,training={id,title:'CrossFit',status:'published',archived_at:null,
   starts_at:finished?'2026-11-19T17:00:00Z':'2090-11-19T17:00:00Z',duration_minutes:90};
 const state={session:{user:{id:'coach'},access_token:preview?null:'demo'},trainings:[training],
   modal:'training',modalData:id,clientPreview:preview};
 let html='',calls=[],network=[],renderCount=0;
 const roster=[{attendee_name:'Mari Maasikas'},{attendee_name:'Jaan Tamm'},
  {attendee_name:'Anne Kask'},{attendee_name:'Leena Saar'}];
 const panel={set outerHTML(value){html=value},get outerHTML(){return html}};
 const window={state,renderModal:()=>'<div class="sheet"><div class="sheet-body"><div class="td-content">INFO</div></div></div>',
   openTraining:()=>{renderCount++},isTrainer:()=>trainer,esc:x=>String(x).replace(/</g,'&lt;'),
   rpc:async(name,args)=>{calls.push({name,args});if(serverFail)throw Error('Network');return roster},
   loadData:async()=>{},crossfitAttendance:{mark:async()=>true},
   rcfClientPreview:{readCompletedAttendees:async id=>{network.push({id});return roster}},
   addEventListener:()=>{}};
 const document={querySelector:selector=>selector.includes('td-completed-roster')?panel:null};
 const context={window,document,Date,Promise,Number,Intl,
   console:{warn(){}},fetch:async(url,opt)=>{network.push({url,opt});return {ok:true,json:async()=>roster}}};
 vm.createContext(context);
 vm.runInContext(read('completed-roster.js'),context,{filename:'completed-roster.js',timeout:3000});
 return {window,state,document,roster,panel,calls,network,get renderCount(){return renderCount},
   get html(){return html}};
}
test('Kliendile kuvatakse toimunud treeningu kõik kinnitatud nimed, mitte ainult kolm',async()=>{
 const h=harness();
 const initial=h.window.renderModal();
 assert.match(initial,/Laadin kohalolijate nimekirja/);
 assert.match(initial,/td-completed-roster/);
 assert.equal(await h.window.crossfitCompletedRoster.refresh(27),true);
 assert.match(h.html,/Osalesid \(4\)/);
 for(const person of h.roster)assert.match(h.html,new RegExp(person.attendee_name));
 assert.match(h.html,/<ul class="td-roster-names">/);
 assert.doesNotMatch(h.html,/Sularaha|Registreeritud|krediit/);
 assert.equal(h.calls[0].name,'wod_completed_attendees_secure');
 assert.equal(h.calls[0].args.p_training_id,27);
});
test('Treener saab sama täieliku nimeloendi',async()=>{
 const h=harness({trainer:true});
 await h.window.crossfitCompletedRoster.refresh(27);
 assert.match(h.html,/Osalesid \(4\)/);
});
test('Kliendieelvaade kasutab lugemiseks ainult RPC-d ega kirjuta',async()=>{
 const h=harness({preview:true});
 assert.equal(await h.window.crossfitCompletedRoster.refresh(27),true);
 assert.equal(h.calls.length,0);
 assert.equal(h.network.length,1);
 assert.equal(h.network[0].id,27);
});
test('Tulevasel treeningul kohalolijate loend puudub',async()=>{
 const h=harness({finished:false});
 assert.doesNotMatch(h.window.renderModal(),/td-completed-roster/);
 assert.equal(await h.window.crossfitCompletedRoster.refresh(27),false);
 assert.equal(h.calls.length,0);
});
test('Võrguvea korral on kordusnupp, mitte ekslik osalejate arv',async()=>{
 const h=harness({serverFail:true});
 assert.equal(await h.window.crossfitCompletedRoster.refresh(27),false);
 assert.match(h.html,/Proovi uuesti/);
 assert.doesNotMatch(h.html,/Osalesid \(4\)/);
});
test('Serveri SQL lubab kinnitatud liikmele ainult toimunud treeningute tegeliku kohaloleku',()=>{
 const sql=read('supabase/migrations/20261119_rcf_completed_attendees_approved_members.sql');
 assert.match(sql,/private\.wod_is_active_user\(\)/);
 assert.match(sql,/g\.attendance_status='present'/);
 assert.match(sql,/a\.status='present'/);
 assert.match(sql,/t\.archived_at IS NULL/);
 assert.match(sql,/REVOKE ALL .* FROM PUBLIC,anon/);
 assert.match(sql,/GRANT EXECUTE .* TO authenticated/);
});
test('Uued failid ja äpi versioon on seotud',()=>{
 const html=read('index.html'),sw=read('sw.js'),app=read('app.js'),
 version=JSON.parse(read('version.json'));
 assert.match(html,/completed-roster\.js\?v=2/);
 assert.match(html,/completed-roster\.css\?v=1/);
 assert.match(sw,/completed-roster\.js\?v=2/);
 assert.match(sw,/crossfit-app-v128/);
 assert.match(app,/APP_VERSION='6\.4\.15'/);
 assert.equal(version.app_version,'6.4.15');
 assert.equal(version.worker_version,127);
});
