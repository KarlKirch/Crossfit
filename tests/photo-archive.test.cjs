'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'..'),read=n=>fs.readFileSync(path.join(base,n),'utf8');
const source=read('photo-archive.js');
function setup({trainer=false,tab='past',done=true}={}){
 const t={id:27,title:'CrossFit',status:'published',archived_at:null,
   starts_at:done?'2026-11-17T17:00:00Z':'2090-11-17T17:00:00Z',
   duration_minutes:90};
 const s={trainingTab:tab,view:'trainings',session:{access_token:'test',user:{id:'user'}},
   trainings:[t],registrations:[],trainingPhotos:[],clientPreview:false,modal:'training',modalData:27};
 let renderCount=0,requests=[];
 const w={state:s,
   isTrainer:()=>trainer,
   renderTrainings:()=>'<div class="tl-page"><div class="tl-groups">OLD</div></div>',
   renderModal:()=>'<div class="sheet"><div class="sheet-body"><div class="td-content">DETAIL</div></div></div>',
   loadData:async()=>{},
   pastTrainings:()=>done?[t]:[],
   esc:x=>String(x),
   api:async(url,opt)=>{requests.push({url,opt});return []},
   render:()=>{renderCount++},
   toast:()=>{},
   confirm:()=>true,
   renderKeepingTrainingScroll:()=>{renderCount++}
 };
 w.window=w;
 const context={window:w,document:{querySelectorAll:()=>[],querySelector:()=>null},
   Date,Intl,URL,Promise,Number,console,
   history:{state:{},length:1,back(){},pushState(){}},
   location:{href:'https://example.com/'},setTimeout:()=>1,crypto:{randomUUID:()=> 'a80dcc22-458c-4d84-a2e4-3fe44d92d30e'}};
 w.addEventListener=()=>{};
 vm.createContext(context);vm.runInContext(source,context,{timeout:2000});
 return {w,s,t,requests,get renderCount(){return renderCount}};
}
test('Möödunud vaates on kuupõhine arhiiv, päevakalender ja fotode loend',()=>{
 const x=setup();
 const result=x.w.renderTrainings();
 assert.match(result,/Treeningute arhiiv/);
 assert.match(result,/November 2026/);
 assert.match(result,/pa-calendar/);
 assert.match(result,/Kava foto puudub/);
 assert.match(result,/Vaata treeningut/);
});
test('Tulevastes treeningutes ei muudeta olemasolevat kuvamist',()=>{
 const x=setup({tab:'upcoming'});
 assert.equal(x.w.renderTrainings(),'<div class="tl-page"><div class="tl-groups">OLD</div></div>');
});
test('Klient saab möödunud treeningu fotot vaadata, kuid mitte muuta',()=>{
 const x=setup();
 x.s.trainingPhotos=[{training_id:27,image_path:'27/a80dcc22-458c-4d84-a2e4-3fe44d92d30e.jpg'}];
 const h=x.w.renderModal();
 assert.match(h,/Treeningukava foto/);
 assert.match(h,/crossfitPhotoArchive.open\(27\)/);
 assert.doesNotMatch(h,/crossfitPhotoArchive.choose\(27\)/);
 assert.doesNotMatch(h,/crossfitPhotoArchive.remove\(27\)/);
});
test('Treeneril on lisamine ja eemaldamine ainult toimunud treeningus',()=>{
 const coach=setup({trainer:true});
 const h=coach.w.renderModal();
 assert.match(h,/crossfitPhotoArchive.choose\(27\)/);
 const future=setup({trainer:true,done:false});
 assert.doesNotMatch(future.w.renderModal(),/Treeningukava foto/);
});
test('Kliendi üleslaadimistoiming lükatakse tagasi enne võrguühendust',async()=>{
 const x=setup();
 const done=await x.w.crossfitPhotoArchive.onFile({target:{files:[{type:'image/jpeg',size:100}],value:'x'}},27);
 assert.equal(done,false);
 assert.equal(x.requests.length,0);
});
test('Kuukalendri vaade ei kaota olemasolevaid mine ja photo andmeid',()=>{
 const x=setup();
 x.s.trainingPhotos=[{training_id:27,image_path:'27/a80dcc22-458c-4d84-a2e4-3fe44d92d30e.jpg'}];
 const page=x.w.renderTrainings();
 assert.match(page,/Foto olemas/);
 assert.match(page,/pa-day-photo/);
});
test('Privaatse bucket-i ja RLS-i seadistus on migreeritud',()=>{
 const sql=read('supabase/migrations/20261119_rcf_training_photo_archive_private.sql');
 assert.match(sql,/public\s*,\s*false|false,6291456/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/private\.wod_is_active_user\(\)/);
 assert.match(sql,/private\.wod_is_trainer\(\)/);
 assert.match(sql,/starts_at\+make_interval/);
 assert.match(sql,/storage\.objects/);
});
test('Äpi failid ja versioon on omavahel kooskõlas',()=>{
 const html=read('index.html'),sw=read('sw.js'),app=read('app.js'),
 v=JSON.parse(read('version.json'));
 assert.match(html,/photo-archive\.js\?v=1/);
 assert.match(html,/photo-archive\.css\?v=1/);
 assert.match(sw,/photo-archive\.js\?v=1/);
 assert.match(sw,/crossfit-app-v128/);
 assert.match(app,/APP_VERSION='6\.4\.15'/);
 assert.equal(v.app_version,'6.4.15');
 assert.equal(v.worker_version,127);
});
