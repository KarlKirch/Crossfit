'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('training-detail-redesign.js');
function setup({trainer=true,guest=false,full=true,preview=false,paid='credit'}={}){
  const tid=18,uid=guest?'guest:25':'a-user',regid=guest?-25:101;
  const waiting={id:regid,user_id:uid,is_guest:guest,status:'waitlist',payment_method:paid};
  const state={clientPreview:preview,modal:'training',modalData:tid,
    trainings:[{id:tid,status:'published',capacity:8,archived_at:null,starts_at:'2099-10-10T10:00:00Z'}],
    registrations:guest?[]:[waiting],guestBookings:guest?[waiting]:[]};
  const calls=[],toasts=[];
  const window={
    state,renderModal(){return ''},isTrainer:()=>trainer,esc:x=>String(x),
    waitlistFor:()=>[waiting],confirmedFor:()=>Array.from({length:full?8:7},(_,id)=>({id})),
    pname:()=>guest?'Grethe (külaline)':'Tarvo Test',
    confirm:()=>true,
    rpc:async(name,body)=>{calls.push({name,body});return true},
    reloadData:async(message)=>{toasts.push(message)},
    toast:message=>toasts.push(message)
  };
  vm.runInNewContext(source,{window,Number,Date,Boolean,Math});
  return {state,waiting,window,calls,toasts};
}
test('Treener kinnitab valitud ootel kliendi lisakohale, ilma mahutavust muutmata',async()=>{
  const h=setup();
  const result=await h.window.crossfitTrainingDetail.admitExtra(18,101,false);
  assert.equal(result,true);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].name,'wod_trainer_admit_extra');
  assert.equal(h.calls[0].body.p_training_id,18);
  assert.equal(h.calls[0].body.p_registration_id,101);
  assert.equal(h.calls[0].body.p_is_guest,false);
  assert.equal(h.state.trainings[0].capacity,8);
});
test('Treener kinnitab ka veebilehe külalise ootejärjekorrast',async()=>{
  const h=setup({guest:true,paid:'cash'});
  assert.equal(await h.window.crossfitTrainingDetail.admitExtra(18,25,true),true);
  assert.equal(h.calls[0].body.p_is_guest,true);
  assert.equal(h.calls[0].body.p_registration_id,25);
});
test('Klient ja kliendieelvaade ei saa lisakohta kinnitada',async()=>{
  for(const options of [{trainer:false},{preview:true}]){
    const h=setup(options);
    assert.equal(await h.window.crossfitTrainingDetail.admitExtra(18,101,false),false);
    assert.equal(h.calls.length,0);
  }
});
test('Vaba tavakoha korral käsitsi lisakohta ei kinnitata',async()=>{
  const h=setup({full:false});
  assert.equal(await h.window.crossfitTrainingDetail.admitExtra(18,101,false),false);
  assert.equal(h.calls.length,0);
});
test('Treeneri ootejärjekorra vaates on lisakoha nupp ja kinnitatud nime juures tähis',()=>{
  assert.match(source,/trainer&&waitlist&&t\?\.status==='published'/);
  assert.match(source,/Kinnita lisakohale/);
  assert.match(source,/Treeneri lisakoht/);
  assert.match(source,/extraCount/);
});
test('Lisakoht kajastub kinnitatud külaliste nimekirjas, mitte kohtade arvus',()=>{
  const app=read('app.js');
  assert.match(app,/rpc\('wod_list_crossfit_guest_bookings_v3'\)/);
  assert.match(app,/coach_extra_seat:!!g\.coach_extra_seat/);
  const sql=read('supabase/migrations/20261117_rcf_trainer_extra_seat.sql');
  assert.match(sql,/wod_trainer_admit_extra/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/private\.wod_charge_registration_credit/);
  assert.match(sql,/t\.capacity/);
  assert.doesNotMatch(sql,/SET capacity\s*=/i);
  assert.match(sql,/wod_list_crossfit_guest_bookings_v3/);
});
