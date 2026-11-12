'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('install-guide.js');
function make({installed=true,ios=false}={}){
  const nodes=[];
  const document={
    querySelector(){return {focus(){}};},
    querySelectorAll(){return [];},
    getElementById(){return null;},
    body:{insertAdjacentHTML(position,markup){nodes.push(markup)}},
    addEventListener(){}
  };
  const navigator={
    userAgent:ios?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1':
      'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0',
    standalone:ios&&installed,
    platform:ios?'iPhone':'Linux'
  };
  const window={
    matchMedia(){return {matches:installed&&!ios}},
    addEventListener(){},
    state:{installPrompt:null},
    toast(){},
    prompt(){}
  };
  const ctx={document,navigator,window,location:{host:'karlkirch.github.io',pathname:'/Crossfit/'}};
  vm.runInNewContext(source,ctx);
  return {window,nodes};
}
test('Paigaldatud Androidi rakenduse seadetest saab alati avakuva ikooni taastada',async()=>{
  const h=make();
  assert.match(h.window.crossfitInstall.moreItem(),/Lisa ikoon avakuvale/);
  await h.window.crossfitInstall.request();
  assert.equal(h.nodes.length,1);
  assert.match(h.nodes[0],/Taasta CrossFiti avakuva ikoon/);
  assert.match(h.nodes[0],/rakenduste loend/);
});
test('iPhone’i avakuva taastamise juhend on saadaval ka paigaldatud rakenduses',async()=>{
  const h=make({ios:true});
  await h.window.crossfitInstall.request();
  assert.match(h.nodes[0],/App Library/);
});
test('Paigaldamata Androidile pakutakse Chrome’i installimist',async()=>{
  const h=make({installed:false});
  await h.window.crossfitInstall.request();
  assert.match(h.nodes[0],/Paigalda CrossFit Androidile/);
  assert.match(h.nodes[0],/Installi rakendus/);
});
test('Nii kliendi kui treeneri menüüs on ikooni taastamise valik',()=>{
  assert.match(read('my-account-redesign.js'),/const install=menuRow\(icons.calendar,'Lisa ikoon avakuvale'/);
  assert.match(read('admin-redesign.js'),/const install=item\(ic.phone,'Lisa ikoon avakuvale'/);
  assert.doesNotMatch(read('admin-redesign.js'),/\.installed\?\.\(\)\?null/);
});
test('Kõik muudetud failid on uue PWA versiooniga',()=>{
  const html=read('index.html'),sw=read('sw.js');
  for(const file of ['install-guide.js?v=4','app.js?v=67','my-account-redesign.js?v=6','admin-redesign.js?v=3']){
    assert.ok(html.includes('./'+file),file+' missing in HTML');
    assert.ok(sw.includes("'./"+file+"'"),file+' missing in worker cache');
  }
  assert.match(read('app.js'),/const APP_VERSION='6.2.9'/);
});
