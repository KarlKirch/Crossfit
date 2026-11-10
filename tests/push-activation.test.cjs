'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const src=read('push-health.js');
function setup({platform='Android',permission='default',support=true}={}){
  const messages=[],state={session:{user:{id:'a'}},view:'home'},notification={permission};
  let enabled=0,guides=0;
  const window={state,renderHome:()=>'<div>Avaleht</div>',render(){},
    addEventListener(){},setInterval(){return 1},matchMedia(){return {matches:platform!=='iPhone Safari'}},
    toast(t){messages.push(t)},crossfitInstall:{openGuide(){guides++}},
    enablePush(){enabled++;notification.permission='granted';return Promise.resolve(true)},
    api:async()=>[{user_id:'a'}]};
  if(support){window.Notification=notification;window.PushManager=function(){};}
  const navigator={userAgent:platform.startsWith('iPhone')?'iPhone':'Android',
    serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>({
      endpoint:'https://push.test/a',toJSON:()=>({keys:{p256dh:'a',auth:'b'}})
    })}})}};
  const document={addEventListener(){},getElementById(){return null},visibilityState:'visible'};
  vm.runInNewContext(src,{window,navigator,document,Notification:notification,console,
    Promise,Date,setTimeout(){return 1}},{filename:'push-health.js'});
  return {window,messages,enabled:()=>enabled,guides:()=>guides};
}
test('Luba teavitused töötab ka algolekus Kontrollin',async()=>{
  const h=setup();
  const p=h.window.crossfitPushHealth.activate();
  assert.equal(h.enabled(),1);
  await p;
});
test('Avalehel on kohe vajutatav Luba teavitused nupp',()=>{
  const h=setup();const html=h.window.renderHome();
  assert.match(html,/Luba teavitused/);
  assert.doesNotMatch(html,/Kontrollin…<\/button>/);
});
test('iPhone Safari avab avakuvale paigaldamise juhendi',async()=>{
  const h=setup({platform:'iPhone Safari'});
  await h.window.crossfitPushHealth.activate();
  assert.equal(h.guides(),1);assert.equal(h.enabled(),0);
});
test('Blokeeritud luba annab juhise ja ei küsi uuesti',async()=>{
  const h=setup({permission:'denied'});
  await h.window.crossfitPushHealth.activate();
  assert.equal(h.enabled(),0);
  assert.ok(h.messages.some(s=>/seadetes/.test(s)));
});
test('Toetamata brauseris saab kasutaja selgituse',async()=>{
  const h=setup({support:false});
  await h.window.crossfitPushHealth.activate();
  assert.ok(h.messages.some(s=>/ei toeta/.test(s)));
});
test('Avalehe lubamise nupp ei lülita push-tellimust kogemata välja',()=>{
  assert.doesNotMatch(src,/await window\.togglePush\(\)/);
  assert.match(src,/pending=enable\(\)/);
  assert.match(read('app.js'),/markNotificationsRead,enablePush,togglePush,installApp/);
});
