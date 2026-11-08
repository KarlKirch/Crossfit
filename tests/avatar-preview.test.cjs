'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','avatar-ui.js'),'utf8');
const uid='22222222-2222-4222-8222-222222222222';
const avatarPath=uid+'/11111111-1111-4111-8111-111111111111.jpg';

function setup(withPhoto=true){
  const listeners={};const elements=[];
  const state={
    session:{access_token:'test',user:{id:uid}},profile:{user_id:uid,display_name:'Anna Test',avatar_path:withPhoto?avatarPath:null},
    profiles:[],modal:null
  };
  const history={
    entries:[{crossfitView:'trainings',crossfitModal:'training',crossfitModalData:11}],index:0,
    get state(){return this.entries[this.index]},
    get length(){return this.entries.length},
    pushState(x){this.entries=this.entries.slice(0,this.index+1);this.entries.push(x);this.index++},
    back(){if(this.index===0)return;this.index--;for(const fn of listeners.popstate||[])fn({state:this.state})}
  };
  const document={
    body:{appendChild(el){elements.push(el)}},
    addEventListener(type,fn){(listeners['doc:'+type]??=[]).push(fn)},
    createElement(){
      const el={className:'',innerHTML:'',removed:false,attrs:{},events:{},
        setAttribute(k,v){this.attrs[k]=v},
        addEventListener(type,fn){(this.events[type]??=[]).push(fn)},
        querySelector(){return {addEventListener(){},focus(){}}},
        remove(){this.removed=true}};
      return el;
    }
  };
  const window={
    state,loadData:async()=>{},renderMine:()=>'',renderMore:()=>'',clientCard:()=>'',personRow:()=>'',renderModal:()=>'',pname:()=>state.profile.display_name,
    esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),isTrainer:()=>false,
    addEventListener(type,fn){(listeners[type]??=[]).push(fn)},toast(){}
  };
  window.window=window;
  const context={window,document,history,fetch:async()=>({ok:true,status:200,json:async()=>({signedURL:'/storage/v1/object/sign/wod-avatars/'+avatarPath+'?token=test'})}),console,Date,Map,Set,Promise,URL};
  vm.runInNewContext(src,context,{filename:'avatar-ui.js'});
  return {window,state,history,elements,listeners};
}

test('Profiilipilt avaneb suuremana, jäädes sama treeningu detailvaatele',async()=>{
  const {window,state,history,elements}=setup();
  await window.loadData();
  const thumbnail=window.crossfitAvatars.html(uid,'small');
  assert.match(thumbnail,/cf-avatar-expandable/);
  assert.match(thumbnail,/crossfitAvatars\.open/);
  assert.match(thumbnail,/role="button"/);
  await window.crossfitAvatars.open(uid);
  assert.equal(elements.length,1);
  assert.match(elements[0].innerHTML,/Anna Test/);
  assert.match(elements[0].innerHTML,/cf-avatar-preview-name/);
  assert.equal(history.state.crossfitAvatarPreview,true);
  history.back();
  assert.equal(elements[0].removed,true);
  assert.equal(state.modal,null);
  assert.equal(history.state.crossfitModal,'training');
});

test('Suurenduse sulgemine viib tagasi ühe sammu',async()=>{
  const {window,history,elements}=setup();
  await window.loadData();
  await window.crossfitAvatars.open(uid);
  window.crossfitAvatars.close();
  assert.equal(elements[0].removed,true);
  assert.equal(history.state.crossfitAvatarPreview,undefined);
  assert.equal(history.state.crossfitView,'trainings');
});

test('Initsiaalidega pilditu profiil ei ava tühja eelvaadet',async()=>{
  const {window,history,elements}=setup(false);
  await window.loadData();
  assert.doesNotMatch(window.crossfitAvatars.html(uid),/cf-avatar-expandable/);
  await window.crossfitAvatars.open(uid);
  assert.equal(elements.length,0);
  assert.equal(history.length,1);
});
