'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const workerCode=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const start=app.indexOf('let appUpdateBusy=false;');
const end=app.indexOf('async function logout()',start);
assert.ok(start>=0&&end>start,'Uuendamisfunktsiooni lähtekood puudub');
const updateCode=app.slice(start,end);

function setup({waiting=true,updateError=false}={}){
  const listeners={};
  const worker={
    state:'installed', messages:[],
    addEventListener(){},removeEventListener(){},
    postMessage(message){
      this.messages.push(message);
      for(const handler of listeners.controllerchange||[])handler();
    }
  };
  let updateCalls=0, assigned='',bannerVisible=false;
  const reg={
    waiting:waiting?worker:null,
    installing:null,
    async update(){updateCalls++;if(updateError)throw new Error('Võrk ei vasta');},
    addEventListener(){}
  };
  const sw={
    async getRegistration(){return reg;},
    addEventListener(type,fn){(listeners[type]??=[]).push(fn);},
    removeEventListener(type,fn){
      if(listeners[type])listeners[type]=listeners[type].filter(v=>v!==fn);
    }
  };
  const status={textContent:''};
  const link={hidden:true};
  const button={disabled:false,textContent:'Uuenda',addEventListener(){}};
  const banner={classList:{remove(){bannerVisible=true;}}};
  const elements={updateStatus:status,updateHelp:link};
  const sandbox={
    window:null,
    state:{swReg:reg},navigator:{onLine:true,serviceWorker:sw},
    updateNow:button,updateBanner:banner,
    document:{getElementById:id=>elements[id]||null,addEventListener(){}},
    location:{assign(value){assigned=value;},reload(){}},
    Date,Promise,console,setTimeout,clearTimeout
  };
  sandbox.window=sandbox;
  const ctx=vm.createContext(sandbox);
  vm.runInContext(updateCode,ctx,{filename:'pwa-update-app.js'});
  return {ctx,worker,reg,status,link,button,
    get updateCalls(){return updateCalls;},
    get assigned(){return assigned;},
    get bannerVisible(){return bannerVisible;}
  };
}

test('Nupp kontrollib esmalt serverit ja aktiveerib ootel SW (ei lae sama lehte lihtsalt uuesti)',async()=>{
  const obj=setup({waiting:true});
  await obj.ctx.updateAppNow();
  assert.equal(obj.updateCalls,1);
  assert.equal(obj.worker.messages.length,1);
  assert.equal(obj.worker.messages[0].type,'SKIP_WAITING');
  assert.equal(obj.button.disabled,false);
  assert.equal(obj.link.hidden,true);
});

test('Kui uus töötaja pole ootel, avatakse serveripõhine värske URL',async()=>{
  const obj=setup({waiting:false});
  await obj.ctx.updateAppNow();
  assert.equal(obj.updateCalls,1);
  assert.match(obj.assigned,/\.\/\?version=\d+&refresh=\d+/);
});

test('Võrgutõrge näitab taastamise linki ega lukusta uuendusnuppu',async()=>{
  const obj=setup({updateError:true});
  await obj.ctx.updateAppNow();
  assert.equal(obj.updateCalls,1);
  assert.match(obj.status.textContent,/Võrk ei vasta/);
  assert.equal(obj.bannerVisible,true);
  assert.equal(obj.link.hidden,false);
  assert.equal(obj.button.disabled,false);
});

test('Ühe mittekriitilise faili ebaõnnestumine ei takista uue töötaja installi',async()=>{
  const handlers={};
  const cache={required:[],files:[],async addAll(files){this.required=files;},
    async put(file){this.files.push(file);}};
  const sandbox={
    self:{addEventListener(type,fn){handlers[type]=fn;}},
    caches:{async open(){return cache;}},
    async fetch(file){
      if(String(file).includes('brand-landscape.svg'))throw new Error('Näidise faili laadimisviga');
      return {ok:true};
    },
    AbortController,Promise,setTimeout,clearTimeout,console,
    URL,Response
  };
  const ctx=vm.createContext(sandbox);
  vm.runInContext(workerCode,ctx,{filename:'sw.js'});
  let install;
  handlers.install({waitUntil(p){install=p;}});
  await assert.doesNotReject(async()=>await install);
  assert.equal(cache.required.length,4);
  assert.ok(cache.required.includes('./index.html'));
  assert.ok(cache.required.some(file=>/^\.\/app\.js\?v=\d+$/.test(file)));
  assert.ok(cache.files.includes('./attendance-stats.js?v=2'));
  assert.ok(!cache.files.includes('./brand-landscape.svg'));
});
