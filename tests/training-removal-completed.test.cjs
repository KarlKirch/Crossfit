'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js');
const start=app.indexOf('async function deleteTraining(id){');
const end=app.indexOf('\nasync function registerTraining(id,',start);
assert.ok(start>0&&end>start,'Deletion function missing');
const code=app.slice(start,end);
function setup({time='2026-11-05T17:00:00Z',rpcResult='archived',trainer=true}={}){
  const calls=[],messages=[];
  const state={trainings:[{id:20,title:'CrossFit',starts_at:time,status:'published'}],
    registrations:[{id:1,training_id:20,credit_charged:true},{id:2,training_id:20,credit_charged:false}],
    guestBookings:[{booking_id:45,training_id:20}],
    modal:'training',modalData:20};
  const context={
    state,
    isTrainer:()=>trainer,
    now:()=>new Date('2026-11-17T19:00:00Z'),
    confirm:message=>{messages.push(message);return true},
    rpc:async(name,body)=>{calls.push({name,body});if(rpcResult instanceof Error)throw rpcResult;return rpcResult},
    toast:message=>messages.push('toast:'+message),
    render:()=>calls.push('render'),
    reloadData:async message=>{calls.push('reload');messages.push(message)},
    Number,Date
  };
  vm.createContext(context);vm.runInContext(code,context);
  return {ctx:context,state,calls,messages};
}
test('Toimunud 5. novembri treeningu eemaldamine säilitab serveris arvestuse',async()=>{
  const h=setup();
  await h.ctx.deleteTraining(20);
  assert.equal(h.calls[0].name,'wod_remove_training');
  assert.equal(h.calls[0].body.p_training_id,20);
  assert.ok(h.messages[0].includes('krediite ei tagastata'));
  assert.equal(h.state.trainings.length,0);
  assert.equal(h.state.registrations.length,0,'Only local view state clears');
  assert.equal(h.state.guestBookings.length,0);
  assert.equal(h.state.modal,null);
  assert.ok(h.messages.some(m=>m.includes('makseandmed säilisid')));
});
test('Kui server ei kinnita eemaldamist, treening jääb alles',async()=>{
  const h=setup({rpcResult:new Error('Treeningut ei saa eemaldada')});
  await h.ctx.deleteTraining(20);
  assert.equal(h.state.trainings.length,1);
  assert.equal(h.state.registrations.length,2);
  assert.ok(h.messages.some(m=>m.includes('Treeningut ei saa eemaldada')));
});
test('Tulevane registreeringutega treening nõuab tühistamist',async()=>{
  const h=setup({time:'2026-12-05T17:00:00Z',rpcResult:new Error('Registreeringutega tulevane treening tuleb enne eemaldamist tühistada.')});
  await h.ctx.deleteTraining(20);
  assert.match(h.messages[0],/Enne eemaldamist tuleb see tühistada/);
  assert.equal(h.state.trainings.length,1);
});
test('Migratsioon kaitseb tulevasi makseid, kuid lubab toimunud treeningu arhiveerimist',()=>{
  const sql=read('supabase/migrations/20261117_rcf_allow_completed_training_archive.sql');
  assert.match(sql,/auth\.uid\(\) IS NULL OR NOT private\.wod_is_trainer\(\)/);
  assert.match(sql,/IF v_training\.starts_at > now\(\)\s+AND v_training\.status <> 'cancelled'\s+AND EXISTS/);
  assert.match(sql,/UPDATE public\.wod_trainings\s+SET archived_at=now\(\),updated_at=now\(\)/);
  assert.match(sql,/RETURN 'archived';/);
});
