'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),
      path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function harness({missingPanel=false,rpcError=false}={}){
  const user={id:41,training_id:5,user_id:'user-1',status:'confirmed'};
  const state={session:{access_token:'testing'},modal:'training',modalData:5,clientPreview:false,
    registrations:[user],trainings:[{id:5,status:'published',starts_at:'2020-11-05T17:00:00Z',duration_minutes:90}],
    attendanceRows:[],clientAttendanceSummaries:{abc:1}};
  const sheet={scrollTop:520};
  let replacement='',renderCalls=0,restoreCalls=0,requests=0;
  const current={closest:selector=>selector==='.sheet'?sheet:null,
    get outerHTML(){return replacement},set outerHTML(next){replacement=next;}};
  const document={querySelector:selector=>selector==='.sheet .at-panel[aria-label="Treeningu kohalolek"]'
    &&!missingPanel?current:null};
  const w={
    document,state,loadData:async()=>{},isTrainer:()=>true,
    esc:x=>String(x),pname:()=> 'Mari',
    api:async()=>[],rpc:async()=>{requests++;if(rpcError)throw Error('Võrk puudub');return true},
    render:()=>{renderCalls++},renderKeepingTrainingScroll:()=>{restoreCalls++},
    toast:()=>{}
  };
  vm.runInNewContext(read('attendance-stats.js'),{window:w,Date,Number,Promise,console});
  return {w,sheet,state,get replacement(){return replacement},get renderCalls(){return renderCalls},
    get restoreCalls(){return restoreCalls},get requests(){return requests}};
}
test('Kohal vajutamine uuendab vaid kohaloleku ploki ja jätab kerimiskoha alles',async()=>{
  const h=harness();
  assert.equal(await h.w.crossfitAttendance.mark(41,'present'),true);
  assert.equal(h.requests,1);
  assert.equal(h.renderCalls,0);
  assert.equal(h.restoreCalls,0);
  assert.equal(h.sheet.scrollTop,520);
  assert.match(h.replacement,/Kohal: <strong>1<\/strong>/);
  assert.match(h.replacement,/Kohal käidud/);
  assert.match(h.replacement,/aria-pressed="true" onclick="crossfitAttendance.mark\(41,'present'\)"/);
});
test('Ka Puudus ja Tühista märge ei vii nimekirja algusesse',async()=>{
  const h=harness();
  assert.equal(await h.w.crossfitAttendance.mark(41,'absent'),true);
  assert.equal(h.sheet.scrollTop,520);
  assert.match(h.replacement,/Puudus: <strong>1<\/strong>/);
  assert.equal(await h.w.crossfitAttendance.mark(41,'unmarked'),true);
  assert.equal(h.sheet.scrollTop,520);
  assert.match(h.replacement,/Märkimata: <strong>1<\/strong>/);
  assert.equal(h.renderCalls,0);
});
test('Puuduva DOM ploki korral kasutatakse kerimiskohta säilitavat renderdust',async()=>{
  const h=harness({missingPanel:true});
  assert.equal(await h.w.crossfitAttendance.mark(41,'present'),true);
  assert.equal(h.restoreCalls,1);
  assert.equal(h.renderCalls,0);
});
test('Serveriveaga ei näidata ekslikult kohalolekut ja kerimist ei muudeta',async()=>{
  const h=harness({rpcError:true});
  assert.equal(await h.w.crossfitAttendance.mark(41,'present'),false);
  assert.equal(h.state.attendanceRows.length,0);
  assert.equal(h.sheet.scrollTop,520);
  assert.equal(h.renderCalls,0);
});
test('Külaliste kohaloleku ja makse korral taastatakse modaali kerimine',()=>{
  const app=read('app.js'),html=read('index.html'),sw=read('sw.js');
  assert.match(app,/function captureTrainingScroll\(\)/);
  assert.match(app,/function restoreTrainingScroll\(saved\)/);
  assert.match(app,/const saved=captureTrainingScroll\(\);\s*try\{\s*state\.loading=true;/);
  assert.match(app,/await window\.loadData\(\);\s*render\(\);\s*restoreTrainingScroll\(saved\)/);
  assert.match(app,/await reloadData\(paid\?'Märgitud tasutuks':'Märgitud tasumata'\);/);
  assert.doesNotMatch(app,/await reloadData\(paid\?'Märgitud tasutuks':'Märgitud tasumata'\);render\(\)/);
  assert.match(html,/attendance-stats\.js\?v=3/);
  assert.match(sw,/attendance-stats\.js\?v=3/);
});
