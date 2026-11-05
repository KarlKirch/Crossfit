'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const app=read('app.js');
const start=app.indexOf('let navigationHistoryReady=false;');
const end=app.indexOf('\nfunction render(){',start);
assert.ok(start>=0&&end>start,'Rakenduses peab olema mobiili navigatsioon');
const source=app.slice(start,end);
const tabSource=app.match(/function setTrainingTab\(tab\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(tabSource,'Treeningute filtril peab olema oma ajalookirje');

function createApp(){
  const handlers={};
  const history={
    entries:[{}],index:0,
    get state(){return this.entries[this.index]},
    get length(){return this.entries.length},
    replaceState(value){this.entries[this.index]=value},
    pushState(value){this.entries=this.entries.slice(0,this.index+1);this.entries.push(value);this.index++},
    back(){if(this.index===0)return;this.index--;handlers.popstate?.({state:this.state})}
  };
  const state={session:{user:{id:'test'}},view:'home',trainingTab:'upcoming',
    modal:null,modalData:null,notificationsReturnView:'home'};
  const window={addEventListener(type,handler){handlers[type]=handler},scrollTo(){}};
  const context={state,history,window,render(){context.syncModalHistory()}};
  vm.createContext(context);
  vm.runInContext(source+'\n'+tabSource,context);
  return {context,state,history};
}

test('Android tagasi liigub alamlehelt eelmisele ja hoiab avalehel esimesel vajutusel rakenduse avatuna',()=>{
  const {context,state,history}=createApp();
  context.ensureViewHistory();
  assert.equal(history.length,2);
  context.go('trainings');
  assert.equal(state.view,'trainings');
  history.back();
  assert.equal(state.view,'home');
  history.back();
  assert.equal(state.view,'home');
});

test('Tagasi sulgeb esmalt sisemise akna ja seejärel eelmise vaate',()=>{
  const {context,state,history}=createApp();
  context.ensureViewHistory();
  context.go('trainings');
  state.modal='training';state.modalData=12;context.syncModalHistory();
  state.modal='trainingForm';state.modalData={id:12};context.syncModalHistory();
  history.back();
  assert.equal(state.modal,'training');
  assert.equal(state.modalData,12);
  history.back();
  assert.equal(state.modal,null);
  assert.equal(state.view,'trainings');
  history.back();
  assert.equal(state.view,'home');
});

test('Treeningute Tulevased/Möödunud filtri saab ühe sammuga tagasi võtta',()=>{
  const {context,state,history}=createApp();
  context.ensureViewHistory();context.go('trainings');
  context.setTrainingTab('past');
  assert.equal(state.trainingTab,'past');
  history.back();
  assert.equal(state.trainingTab,'upcoming');
});

test('WOD-panga enda tagasinavigatsiooni ei kirjutata üle',()=>{
  const {context,state,history}=createApp();
  context.ensureViewHistory();
  history.pushState({...history.state,wodModal:'bank',wodId:null},'');
  state.modal='wodBank';
  const count=history.length;
  context.syncModalHistory();
  assert.equal(history.length,count);
  assert.equal(history.state.wodModal,'bank');
});

test('Kõik treenijad näevad osalejate täisnimesid',()=>{
  const list=read('training-list-redesign.js');
  const detail=read('training-detail-redesign.js');
  assert.match(list,/const name=realName\.trim\(\)\|\|'Kasutaja'/);
  assert.match(detail,/const name=nameFull\.trim\(\)\|\|'Kasutaja'/);
  assert.doesNotMatch(list,/trainer\?realName:/);
  assert.doesNotMatch(detail,/trainer\?nameFull:/);
});
