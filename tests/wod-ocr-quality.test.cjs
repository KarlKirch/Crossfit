'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','wod-ocr-quality.js'),'utf8'),ctx);
const assess=ctx.window.crossfitWodOcrQuality.evaluate;
test('Rikutud 12.11 OCR tekst jääb välja ka kõrge confidence puhul',()=>{
 const junk='i ie 2 35355 3 : i\n'+'i 4 ol 8 Oy | ¢ 5 Jee\n'+'1 : PRX |S = 5 Ga po\n'+'1 4 & 1 & j= F co\n'+'| || Eos c pr\n'+'Hi | $33 © © oo wr\n'+'| ol 5 OER wn Z oN = a';
 assert.equal(assess(junk,97).ok,false);
});
test('Selgelt loetav WOD läbib kontrolli',()=>{
 for(const value of ['5 rounds\n10 burpees\n20 squats','AMRAP 12 MIN\n10 KB swings\n8 pull-ups','5x5 back squat','2000m row','3 ringi\n10 kükid\n20 hüpped'])
   assert.equal(assess(value,91).ok,true,value);
});
test('Juhuslikud numbrid ja madal kindlus ei läbi kontrolli',()=>{
 assert.equal(assess('i 4 ol 8 Oy | ¢ 5 Jee',90).ok,false);
 assert.equal(assess('2 355 33 55 2020',94).ok,false);
 assert.equal(assess('5 rounds\n10 burpees\n20 squats',17).ok,false);
});
