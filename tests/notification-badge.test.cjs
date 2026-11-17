'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function png(pathname,size){
  const bytes=fs.readFileSync(path.join(root,pathname));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature');
  assert.equal(bytes.readUInt32BE(16),size,'pixel width');
  assert.equal(bytes.readUInt32BE(20),size,'pixel height');
  assert.equal(bytes[25],6,'badge must be RGBA, not opaque RGB');
  const chunks=[];
  let offset=8;
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    if(type==='IDAT')chunks.push(bytes.subarray(offset+8,offset+8+length));
    offset+=12+length;
    if(type==='IEND')break;
  }
  const rgba=zlib.inflateSync(Buffer.concat(chunks));
  assert.equal(rgba[4],0,'top-left pixel alpha must be zero (transparent background)');
  assert.ok(bytes.length>500,'badge should contain actual emblem details');
}
test('Monochrome RCF notification badge is truly transparent PNG, not launcher icon',()=>{
  png('notification-badge-rcf-96.png',96);
  png('notification-badge-rcf-192.png',192);
  const serviceWorker=read('sw.js');
  assert.match(serviceWorker,/badge:'\.\/notification-badge-rcf-96\.png'/);
  assert.match(serviceWorker,/icon:'\.\/icon-192-rcf-v3\.png'/);
  assert.doesNotMatch(serviceWorker,/badge:'\.\/icon-192\.png'/);
  assert.match(serviceWorker,/notification-badge-rcf-96\.png/);
  assert.match(serviceWorker,/notification-badge-rcf-192\.png/);
});
test('App installs new service worker and new notification assets',()=>{
  const app=read('app.js'),html=read('index.html'),sw=read('sw.js');
  assert.match(app,/const APP_VERSION='6\.4\.8'/);
  assert.match(app,/sw\.js\?v=121/);
  assert.match(html,/app\.js\?v=86/);
  assert.match(sw,/const CACHE='crossfit-app-v121'/);
  assert.match(sw,/app\.js\?v=86/);
});
