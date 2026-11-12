'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const code=read('wod-bank.js');
const start=code.indexOf('  async function makeDraft(');
const end=code.indexOf('\n  window.loadData=async function()',start);
assert.ok(start>=0&&end>start);
const fn=code.slice(start,end);
function setup(opts={}){
  const entry={id:9,status:opts.status||'pending',workout_text:opts.workout??null,
    draft_text:null,image_path:'demo/test.jpg'};
  const s={wodBank:[entry],modal:'wodDetail',modalData:9,wodOcrBusy:false};
  const editor={value:opts.editor||''},status={textContent:''},calls=[],notices=[];
  let recognition=async()=>({data:{text:'5 rounds\n10 burpees\n20 squats',confidence:88}});
  const context={
    s,
    document:{getElementById:id=>id==='wodText'?editor:id==='wodOcrProgress'?status:null},
    window:{
      toast:text=>notices.push(text),
      api:async(url,opt)=>{
        calls.push({url,body:JSON.parse(opt.body),method:opt.method,prefer:opt.headers.Prefer});
        return opts.blocked?[]:[{id:9}];
      }
    },
    loadOcr:async()=>({recognize:(...args)=>recognition(...args)}),
    prepareOcrCanvas:async()=>({}),
    downloadOriginal:async()=>({}),
    cleanBatchOcrText:raw=>String(raw||'').trim(),
    usefulOcrText:(text,confidence)=>context.window.crossfitWodOcrQuality.evaluate(text,confidence).ok,
    console:{warn(){}},
    Date,Number
  };
  vm.createContext(context);
  vm.runInContext(read('wod-ocr-quality.js'),context);
  vm.runInContext(fn+'\nthis.makeDraft=makeDraft;',context);
  return {entry,s,editor,status,calls,notices,run:context.makeDraft,
    setRecognition:fn=>{recognition=fn}};
}
test('Foto üleslaadimise OCR täidab WOD-i kava, kuid jätab selle kontrollimiseks',async()=>{
  const h=setup();
  const ok=await h.run(h.entry,{},true,true);
  assert.equal(ok,true);
  assert.equal(h.calls.length,1);
  assert.match(h.calls[0].url,/status=eq.pending&workout_text=is.null&draft_text=is.null/);
  assert.equal(h.calls[0].body.status,'review');
  assert.equal(h.calls[0].body.workout_text,'5 rounds\n10 burpees\n20 squats');
  assert.equal(h.calls[0].body.draft_text,h.entry.workout_text);
  assert.equal(h.editor.value,h.entry.workout_text);
  assert.equal(h.entry.status,'review');
  assert.match(h.status.textContent,/Kontrolli/);
  assert.equal(h.s.wodOcrBusy,false);
});
test('Kui WOD-i vahepeal muudeti, OCR ei kirjuta seda üle',async()=>{
  const h=setup({blocked:true});
  const ok=await h.run(h.entry,{},false,true);
  assert.equal(ok,false);
  assert.equal(h.entry.workout_text,null);
  assert.equal(h.entry.status,'pending');
  assert.equal(h.editor.value,'');
  assert.match(h.status.textContent,/ei asendatud/);
});
test('Korduslugemine säilitab olemasoleva kinnitatud WOD-kava',async()=>{
  const h=setup({status:'ready',workout:'Minu parandatud WOD'});
  const ok=await h.run(h.entry,{},false,false);
  assert.equal(ok,true);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].body.workout_text,undefined);
  assert.equal(h.calls[0].body.status,undefined);
  assert.equal(h.entry.workout_text,'Minu parandatud WOD');
});
test('OCR veaga jääb originaalpilt alles ning kava ei salvestata ekslikult',async()=>{
  const h=setup();
  h.setRecognition(async()=>{throw new Error('Unable to load language data')});
  const ok=await h.run(h.entry,{},true,true);
  assert.equal(ok,false);
  assert.equal(h.calls.length,0);
  assert.equal(h.entry.workout_text,null);
  assert.match(h.status.textContent,/Originaalfoto säilis/);
  assert.equal(h.s.wodOcrBusy,false);
});
test('Uue foto lisamine käivitab OCR-i ning uuesti lugemise nupp on nähtav',()=>{
  const bank=read('wod-bank.js');
  const review=read('wod-review-ui.js');
  assert.match(bank,/await makeDraft\(saved,file,true,true\)/);
  assert.match(review,/retryWodDraft\('/);
  assert.match(review,/id="wodOcrProgress"/);
  assert.match(read('index.html'),/wod-bank\.js\?v=12/);
  assert.match(read('sw.js'),/wod-review-ui\.js\?v=9/);
});

test('OCR-kaootilist teksti ei kanta WOD-i kavasse ka suure confidence puhul',async()=>{
  const h=setup();
  h.setRecognition(async()=>({data:{
    text:'i ie 2 35355 3 : i\\ni 4 ol 8 Oy | ¢ 5 Jee\\n1 : PRX |S = 5 Ga po\\nHi | $33 © © oo wr',
    confidence:93
  }}));
  const ok=await h.run(h.entry,{},true,true);
  assert.equal(ok,false);
  assert.equal(h.calls.length,0);
  assert.equal(h.entry.workout_text,null);
  assert.equal(h.entry.status,'pending');
  assert.match(h.status.textContent,/WOD-i tekst jäeti tühjaks/);
});
