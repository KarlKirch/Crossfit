'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('Android launcher icon URLs are new and images are available',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  const paths=manifest.icons.map(i=>i.src);
  assert.equal(paths.length,4);
  for(const src of paths){
    assert.match(src,/^\/Crossfit\/icon-(192|512)-rcf-(maskable-)?v3\.png$/);
    const full=path.join(root,src.replace('/Crossfit/',''));
    assert.ok(fs.existsSync(full),full+' missing');
    const bytes=fs.readFileSync(full);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }
  assert.match(read('index.html'),/manifest\.webmanifest\?v=15/);
});
test('Home-screen icon instructions distinguish deleted shortcut from uninstalled PWA',()=>{
  const guide=read('install-guide.js');
  assert.match(guide,/eemalda rakendus täielikult/);
  assert.match(guide,/Desinstalli/);
  assert.match(guide,/Installi rakendus/);
  assert.match(guide,/Avakuva ikooni eemaldamine ei pruugi rakendust kustutada/);
});
