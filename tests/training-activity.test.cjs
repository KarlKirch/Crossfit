'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.resolve(__dirname,'../attendance-stats.js'),'utf8');
function weeks52(){
  const monday=Date.UTC(2025,10,10,12);
  return Array.from({length:52},(_,i)=>({
    week_start:new Date(monday+i*7*86400000).toISOString().slice(0,10),count:0
  }));
}
function fixture(summary,trainer=false){
  const state={
    session:{access_token:'mock-client-token'},clientPreview:false,
    attendanceRows:[],myAttendanceSummary:summary,
    clientAttendanceSummaries:{},modal:null,modalData:null
  };
  const window={
    state,esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    loadData:async()=>{},isTrainer:()=>trainer,rpc:async()=>summary,
    api:async()=>[],render:()=>{},toast:()=>{},openClient:()=>{}
  };
  vm.runInNewContext(source,{window,document:{querySelector:()=>null},Date,Intl,console});
  // The module initializes the async-load state; give it a finished summary.
  state.myAttendanceSummary=summary;
  return {window,state,attendance:window.crossfitAttendance};
}

test('Isiklik aktiivsus näitab nädalat, kuud, koguarvu, keskmist ja järjestikuseid nädalaid',()=>{
  const weeks=weeks52();
  weeks.at(-1).count=2;
  weeks.at(-2).count=1;
  const {attendance}=fixture({
    total:8,month:3,absent:2,marked:10,
    last_attended:'2026-11-04T17:00:00Z',weeks
  });
  const html=attendance.statsCard();
  for(const label of ['Sel nädalal kohal','Sel kuul kohal','Kokku kohal',
    'Keskmiselt nädalas (12 nädalat)','Aktiivset nädalat järjest','Viimane treening']){
    assert.ok(html.includes(label),label+' puudub');
  }
  assert.match(html,/<strong>2<\/strong><span>Sel nädalal kohal/);
  assert.match(html,/<strong>3<\/strong><span>Sel kuul kohal/);
  assert.match(html,/<strong>8<\/strong><span>Kokku kohal/);
  assert.match(html,/<strong>0,3<\/strong><span>Keskmiselt nädalas/);
  assert.match(html,/<strong>2<\/strong><span>Aktiivset nädalat järjest/);
  assert.equal((html.match(/class="at-bar-cell"/g)||[]).length,12);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
  assert.ok(html.includes('Treener on märkinud 10 korral kohaloleku, neist 2 puudumist.'));
  assert.ok(!html.includes('Treeningkrediit')); // Statistika ei sega finantsarvestust.
});

test('Kasutaja saab valida 12 nädala graafikul konkreetse nädala',()=>{
  const weeks=weeks52();
  weeks.at(-1).count=2;
  weeks.at(-2).count=1;
  const {attendance}=fixture({total:3,month:2,absent:0,marked:3,weeks,last_attended:null});
  assert.equal(attendance.selectWeek(weeks.at(-2).week_start),true);
  const html=attendance.statsCard();
  assert.ok(html.includes('data-week="'+weeks.at(-2).week_start+
    '" data-count="1" aria-label='));
  assert.ok(html.includes('1 kinnitatud osalemine'));
  assert.ok(html.includes('aria-pressed="true" onclick="crossfitAttendance.selectWeek'));
  assert.equal(attendance.selectWeek('2020-01-01'),false);
});

test('Käimasolev tühi nädal ei katkesta varem kogunenud aktiivsete nädalate jada',()=>{
  const weeks=weeks52();
  weeks.at(-2).count=2;
  weeks.at(-3).count=1;
  const {attendance}=fixture({total:3,month:0,absent:0,marked:3,weeks,last_attended:null});
  assert.equal(attendance.streak(weeks),2);
  const html=attendance.statsCard();
  assert.match(html,/<strong>0<\/strong><span>Sel nädalal kohal/);
  assert.match(html,/<strong>2<\/strong><span>Aktiivset nädalat järjest/);
  assert.ok(html.includes('Viimane treening'));
});

test('Ainult treener saab teise kliendi statistikat näha; kliendi isiklik vaade on eraldatud',()=>{
  const weeks=weeks52();
  weeks.at(-1).count=1;
  const summary={total:4,month:1,absent:2,marked:6,weeks,last_attended:null};
  const {attendance,state}=fixture(summary,true);
  assert.equal(attendance.statsCard(),'');
  state.clientAttendanceSummaries={u1:summary};
  const html=attendance.clientCard('u1');
  for(const label of ['sel nädalal','sel kuul','korda kokku',
    'keskmiselt nädalas (12 nädalat)','aktiivset nädalat järjest',
    'märgitud puudumist'])assert.ok(html.includes(label),label);
  assert.ok(!html.includes('Testklient')); // Nimede või e-posti leket ei teki.
});

test('Ilma kohalolekumärgeteta näidatakse nulli, mitte varasemaid registreeringuid',()=>{
  const weeks=weeks52();
  const {attendance}=fixture({total:0,month:0,absent:0,marked:0,weeks,last_attended:null});
  const html=attendance.statsCard();
  assert.ok(html.includes('Kohalolekumärked veel puuduvad.'));
  assert.ok(html.includes('Varasemad registreeringud ei muutu automaatselt osalemisteks.'));
  assert.equal((html.match(/class="at-bar-cell"/g)||[]).length,12);
});
