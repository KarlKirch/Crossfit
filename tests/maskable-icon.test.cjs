'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
test('Android gets dark full-bleed maskable launcher icons, while iOS retains standard PNG icons',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  for(const size of [192,512]){
    const any=manifest.icons.find(icon=>icon.sizes===size+'x'+size&&icon.purpose==='any');
    const mask=manifest.icons.find(icon=>icon.sizes===size+'x'+size&&icon.purpose==='maskable');
    assert.ok(any&&mask,'Both standard and maskable icons must be present for '+size);
    assert.notEqual(mask.src,any.src,'Maskable artwork requires its own safe-area image');
    assert.equal(mask.type,'image/png');
    const file=path.join(root,mask.src.replace(/^\/Crossfit\//,''));
    assert.ok(fs.existsSync(file),'Missing '+file);
    const png=fs.readFileSync(file);
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
  }
});
test('PWA references and precaches updated icons, and restores original RCF browser emblem',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  const html=read('index.html'),sw=read('sw.js');
  assert.match(html,/manifest\.webmanifest\?v=15/);
  assert.match(html,/icon-512-rcf-v3\.png/);
  for(const icon of manifest.icons.filter(i=>i.purpose==='maskable')){
    const name=icon.src.split('/').pop();
    assert.ok(sw.includes("'./"+name+"'"),name+' not cached');
  }
  assert.match(read('scripts/generate-rcf-social-assets.py'),/safe_side = round\(size \* \.56\)/);
  for(const icon of manifest.icons)assert.match(icon.src,/-rcf-(?:maskable-)?v3\.png$/);
});
