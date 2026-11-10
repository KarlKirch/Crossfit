'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const from=app.indexOf('function sessionExpiry(session){');
const to=app.indexOf('\nasync function ensureProfile()',from);
assert.ok(from>0&&to>from);
const code=app.slice(from,to);
function setup(){
  const state={session:null},store={},calls=[];
  const localStorage={setItem(k,v){store[k]=v},getItem(k){return store[k]},removeItem(k){delete store[k]}};
  let handler=async()=>({access_token:'next',refresh_token:'fresh',expires_in:3600,user:{id:'1'}});
  const ctx={state,localStorage,Date,Number,Promise,JSON,console,atob:()=>'',SUPABASE_URL:'https://example.test',
    headers:()=>({}),request:async(url,options)=>{calls.push([url,options]);return handler()}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,state,store,calls,setHandler(fn){handler=fn}};
}
test('Salvestatud kehtiv seanss ei vaja uut parooli ega tokeni uuendust',async()=>{
  const h=setup();
  h.ctx.saveSession({access_token:'valid',refresh_token:'valid-refresh',expires_in:3600,user:{id:'1'}});
  assert.equal(h.ctx.sessionExpiresSoon(h.state.session),false);
  assert.equal(JSON.parse(h.store.wod_session).refresh_token,'valid-refresh');
  assert.equal(h.calls.length,0);
});
test('Aeguv seanss uuendatakse ja uus refresh_token salvestatakse',async()=>{
  const h=setup();
  h.ctx.saveSession({access_token:'old',refresh_token:'old-refresh',expires_at:Math.floor(Date.now()/1000)-2});
  const ok=await h.ctx.refreshSession();
  assert.equal(ok,true);
  assert.equal(h.state.session.refresh_token,'fresh');
  assert.equal(JSON.parse(h.store.wod_session).refresh_token,'fresh');
  assert.equal(h.calls.length,1);
});
test('Paralleelsed uuendused ei kasuta sama refresh tokenit kaks korda',async()=>{
  const h=setup();let done;
  h.ctx.saveSession({access_token:'old',refresh_token:'old-refresh',expires_at:1});
  h.setHandler(()=>new Promise(resolve=>{done=resolve}));
  const a=h.ctx.refreshSession(),b=h.ctx.refreshSession();
  assert.equal(h.calls.length,1);
  done({access_token:'new',refresh_token:'rotated',expires_in:3600});
  assert.equal(await a,true);assert.equal(await b,true);
  assert.equal(h.calls.length,1);
});
test('Ajutine võrguviga jätab salvestatud seansi alles',async()=>{
  const h=setup();
  h.ctx.saveSession({access_token:'old',refresh_token:'old-refresh',expires_at:1});
  h.setHandler(()=>Promise.reject(new Error('Network timeout')));
  await assert.rejects(h.ctx.refreshSession(),/Network timeout/);
  assert.equal(JSON.parse(h.store.wod_session).refresh_token,'old-refresh');
});
test('Serveri kinnitatud vigane refresh token lõpetab seansi',async()=>{
  const h=setup();
  h.ctx.saveSession({access_token:'old',refresh_token:'revoked',expires_at:1});
  h.setHandler(()=>Promise.reject(Object.assign(new Error('Invalid refresh token'),{status:400})));
  assert.equal(await h.ctx.refreshSession(),false);
  assert.equal(h.state.session,null);
  assert.equal(h.store.wod_session,undefined);
});
test('Minu lehe kitsas paigutus ja PWA vahemälu on kaasatud',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','mobile-account.css'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(html,/mobile-account.css\?v=1/);
  assert.match(sw,/mobile-account.css\?v=1/);
});
