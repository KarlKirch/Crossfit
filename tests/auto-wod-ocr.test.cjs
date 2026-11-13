'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const bank=read('wod-bank.js'),ui=read('wod-review-ui.js');

test('Pildi üleslaadimisel salvestub ka tühja WOD-tekstiga kirje',async()=>{
  const begin=bank.indexOf('  window.wodFilePicked=async function(input){');
  const end=bank.indexOf('\n  window.copyWodText=',begin);
  assert.ok(begin>0&&end>begin);
  const s={session:{user:{id:'trainer-1'}},wodBank:[],modal:null,modalData:null};
  const calls=[],actions=[];
  const context={s,
    window:{
      toast:message=>actions.push(['toast',message]),
      api:async(url,opt)=>{
        calls.push({url,method:opt.method,body:JSON.parse(opt.body)});
        return [{id:123,image_path:'trainer-1/demo.jpg',status:'pending'}];
      },
      reloadData:async()=>{s.wodBank=[{id:123,image_path:'trainer-1/demo.jpg',status:'pending'}]},
      render:()=>actions.push(['render'])
    },
    storagePath:()=> 'trainer-1/demo.jpg',
    today:()=> '2026-11-13',
    dateFromFile:()=> '2026-11-13',
    uploadOriginal:async()=>actions.push(['upload']),
    queueHydrate:()=>{},console
  };
  vm.createContext(context);
  vm.runInContext(bank.slice(begin,end),context);
  const input={id:'wodGalleryInput',files:[{name:'test.jpg',type:'image/jpeg',size:1024}],value:'test.jpg'};
  await context.window.wodFilePicked(input);
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].body.image_path,'trainer-1/demo.jpg');
  assert.equal(calls[0].body.workout_text,null);
  assert.equal(calls[0].body.draft_text,null);
  assert.equal(calls[0].body.status,'pending');
  assert.equal(s.modal,'wodDetail');
  assert.equal(s.modalData,123);
  assert.equal(input.value,'');
  assert.equal(actions.some(x=>x[0]==='upload'),true);
});
test('WOD-pank ei käivita tasulist AI-d ega tasuta OCR-i',()=>{
  assert.doesNotMatch(bank,/Tesseract|OCR_SRC|makeDraft|buildAllWodDrafts|retryWodDraft|crossfitWodVision/);
  assert.doesNotMatch(ui,/buildAllWodDrafts|retryWodDraft|Loe fotolt tekst uuesti/);
  assert.doesNotMatch(read('index.html'),/src="\.\/wod-vision\.js|src="\.\/wod-ocr-quality\.js/);
  assert.doesNotMatch(read('sw.js'),/wod-vision\.js|wod-ocr-quality\.js/);
  assert.match(read('index.html'),/wod-bank\.js\?v=15/);
  assert.match(read('sw.js'),/wod-review-ui\.js\?v=11/);
});
test('Tühja tekstiga foto saab käsitsi salvestada ja varasema OCR-mustandi eemaldada',async()=>{
  const begin=ui.indexOf('  function editorData(entry,requireWorkout=false){');
  const end=ui.indexOf('\n  async function saveText()',begin);
  assert.ok(begin>0&&end>begin);
  const entry={id:9,status:'ready',workout_text:'old workout',draft_text:'old OCR',title:'WOD',source_date:'2026-11-13',image_path:'test.jpg'};
  const values={wodText:'',wodTitle:'',wodDate:'2026-11-13'};
  const calls=[];
  const ctx={
    document:{getElementById:id=>({value:values[id]})},
    window:{api:async(url,opt)=>calls.push({url,data:JSON.parse(opt.body)})},
    validDate:x=>x,numberId:x=>x,s:{},console
  };
  vm.createContext(ctx);vm.runInContext(ui.slice(begin,end)+'\nthis.persistEntry=persistEntry;',ctx);
  const result=await ctx.persistEntry(entry);
  assert.equal(result,'');
  assert.equal(calls.length,1);
  assert.equal(calls[0].data.workout_text,null);
  assert.equal(calls[0].data.draft_text,null);
  assert.equal(calls[0].data.status,'pending');
  assert.equal(entry.status,'pending');
});
test('Käsitsi lisatud WOD-i saab salvestada ja kasutada treeningus',async()=>{
  const begin=ui.indexOf('  function editorData(entry,requireWorkout=false){');
  const end=ui.indexOf('\n  async function saveText()',begin);
  const entry={id:10,status:'pending',workout_text:null,title:'WOD',source_date:'2026-11-13',image_path:'test.jpg'};
  const values={wodText:'4 rounds\n10 squats\n15 push-ups',wodTitle:'',wodDate:'2026-11-13'};
  const calls=[];
  const ctx={
    document:{getElementById:id=>({value:values[id]})},
    window:{api:async(url,opt)=>calls.push(JSON.parse(opt.body))},
    validDate:x=>x,numberId:x=>x,s:{},console
  };
  vm.createContext(ctx);vm.runInContext(ui.slice(begin,end)+'\nthis.persistEntry=persistEntry;',ctx);
  const result=await ctx.persistEntry(entry,true);
  assert.match(result,/squats/);
  assert.equal(calls[0].status,'ready');
  values.wodText='';
  await assert.rejects(()=>ctx.persistEntry(entry,true),/lisa WOD-i tekst/);
});
