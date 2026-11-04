'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const script=fs.readFileSync(path.join(__dirname,'..','attendance-stats.js'),'utf8');
const monday=Date.UTC(2025,10,10);
const weeks=Array.from({length:52},(_,i)=>({
  week_start:new Date(monday+i*7*86400000).toISOString().slice(0,10),
  count:i===49?1:i===50?2:0
}));
function createDashboard(summary,options={}){
  const state={
    session:{access_token:'SYNTHETIC_TEST_TOKEN'},clientPreview:false,
    registrations:[{id:1,status:'confirmed'}],
    trainings:[],profiles:[],attendanceRows:[]
  };
  const w={
    state,loadData:async()=>{},
    isTrainer:()=>Boolean(options.trainer),
    esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    api:async()=>[],
    rpc:async()=>{if(options.fail)throw new Error('Synthetic RPC unavailable');return summary;},
    toast:()=>{},
    render:()=>{},
    pname:()=> 'Näidisklient'
  };
  vm.runInNewContext(script,{window:w,console,Date,Intl,Promise});
  return w;
}

test('Kliendi ülevaates on selle nädala, kuu, koguarvu ja viimase treeningu mõõdikud',async()=>{
  const w=createDashboard({
    total:3,month:2,absent:1,marked:4,
    last_attended:'2026-10-31T17:00:00Z',weeks
  });
  await w.loadData();
  const card=w.crossfitAttendance.statsCard();
  assert.match(card,/<strong>0<\/strong><span>Sel nädalal<\/span>/);
  assert.match(card,/<strong>2<\/strong><span>Sel kuul<\/span>/);
  assert.match(card,/<strong>3<\/strong><span>Kokku osalemisi<\/span>/);
  assert.match(card,/<strong>0,3<\/strong><span>Keskmiselt nädalas \(12 näd\)<\/span>/);
  assert.match(card,/<strong>2<\/strong><span>Aktiivseid nädalaid järjest<\/span>/);
  assert.match(card,/<span>Viimati kohal<\/span>/);
  assert.match(card,/Treeneri kinnitatud/);
  assert.match(card,/1 puudumist/);
  assert.equal((card.match(/class="at-bar-cell/g)||[]).length,12);
  assert.equal((card.match(/class="at-bar-count"/g)||[]).length,12);
  assert.match(card,/role="img" tabindex="0" aria-label="Viimase 12 nädala treeningud/);
});

test('Broneering ei muutu ilma treeneri märketa osalemiseks',async()=>{
  const w=createDashboard({total:0,month:0,absent:0,marked:0,last_attended:null,
    weeks:weeks.map(v=>({...v,count:0}))});
  await w.loadData();
  const card=w.crossfitAttendance.statsCard();
  assert.match(card,/<strong>0<\/strong><span>Kokku osalemisi<\/span>/);
  assert.match(card,/Sinu kohalolekut ei ole veel märgitud/);
  assert.match(card,/Varasemad registreeringud ei muutu automaatselt osalemisteks/);
});

test('Kui statistika päring ebaõnnestub, siis ülejäänud äpp jääb kasutatavaks',async()=>{
  const w=createDashboard(null,{fail:true});
  await assert.doesNotReject(()=>w.loadData());
  assert.equal(w.state.attendanceLoadError,true);
  assert.equal(w.state.myAttendanceSummary,null);
  const card=w.crossfitAttendance.statsCard();
  assert.match(card,/Statistikat ei õnnestunud laadida/);
  assert.match(card,/Proovi uuesti/);
});

test('Treenerile ei näidata kliendi isikliku statistika juhtpaneeli',async()=>{
  const w=createDashboard({total:1,month:1,weeks},{trainer:true});
  await w.loadData();
  assert.equal(w.crossfitAttendance.statsCard(),'');
});
