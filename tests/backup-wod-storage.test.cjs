'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {backupWodStorage}=require('../scripts/backup-wod-storage.cjs');

test('WOD fotode varundus kopeerib alamkaustad, kontrollib SHA256 ja salvestab manifesti', async()=>{
  const dest=await fs.mkdtemp(path.join(os.tmpdir(),'rcf-backup-test-'));
  const sent=[];
  const mockFetch=async (url,opt={})=>{
    const u=String(url);sent.push({url:u,method:opt.method||'GET'});
    if(u.endsWith('/object/list/wod-bank')){
      const prefix=JSON.parse(opt.body).prefix;
      if(prefix==='')return Response.json([{name:'test-trainer',id:null}]);
      if(prefix==='test-trainer')return Response.json([{name:'one.webp',id:'test-object-1',metadata:{mimetype:'image/webp'}}]);
      return Response.json([]);
    }
    if(u.endsWith('/object/authenticated/wod-bank/test-trainer/one.webp'))return new Response(Buffer.from('FAKE-PHOTO-BYTES'));
    return new Response('Not found',{status:404});
  };
  try{
    const result=await backupWodStorage({
      supabaseUrl:'https://test-project.supabase.co',
      serviceKey:'test-credential-not-real',
      destination:dest,
      fetchImpl:mockFetch
    });
    assert.equal(result.count,1);
    assert.equal(result.failed,0);
    assert.equal((await fs.readFile(path.join(dest,'wod-bank/test-trainer/one.webp'))).toString(),'FAKE-PHOTO-BYTES');
    const manifest=JSON.parse(await fs.readFile(path.join(dest,'wod-bank-manifest.json'),'utf8'));
    assert.equal(manifest.objects[0].sha256,crypto.createHash('sha256').update('FAKE-PHOTO-BYTES').digest('hex'));
    assert.ok(sent.some(x=>x.url.includes('/object/list/wod-bank')));
    assert.ok(sent.some(x=>x.url.includes('/object/authenticated/wod-bank/')));
  } finally {await fs.rm(dest,{recursive:true,force:true})}
});

test('WOD varundus keeldub pildifaili kausta läbimisest',async()=>{
  const dest=await fs.mkdtemp(path.join(os.tmpdir(),'rcf-backup-test-'));
  const mockFetch=async()=>Response.json([{name:'..',id:'dangerous'}]);
  try{
    await assert.rejects(backupWodStorage({
      supabaseUrl:'https://test-project.supabase.co',
      serviceKey:'test-credential-not-real',
      destination:dest,fetchImpl:mockFetch
    }),/Faili nimi ei sobi/);
  }finally{await fs.rm(dest,{recursive:true,force:true})}
});

test('WOD varundus keeldub salvestamast lähtekoodireposse',async()=>{
  await assert.rejects(backupWodStorage({
    supabaseUrl:'https://test-project.supabase.co',
    serviceKey:'test-credential-not-real',
    destination:path.join(__dirname,'private-backup'),
    fetchImpl:async()=>Response.json([])
  }),/väljaspool lähtekoodirepot/);
});

test('WOD varundus nõuab serveripoolset võtit',async()=>{
  await assert.rejects(backupWodStorage({
    supabaseUrl:'https://test-project.supabase.co',
    serviceKey:'',
    destination:path.join(os.tmpdir(),'rcf-test-no-key'),
    fetchImpl:async()=>Response.json([])
  }),/SUPABASE_SERVICE_ROLE_KEY/);
});
