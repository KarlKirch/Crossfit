'use strict';

/**
 * WOD pildifailide eraldi varukoopia. Käivita üksnes usaldatud arvutis,
 * mitte veebibrauseris. Ära lisa service_role võtit ega varukoopiat Giti.
 * Näide: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *         RCF_BACKUP_DIR=/turvaline/kaust node scripts/backup-wod-storage.cjs
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const REPO_ROOT=path.resolve(__dirname,'..');
const BUCKET='wod-bank';

function safeName(name){
  if(typeof name!=='string'||!name||name==='.'||name==='..'||name.includes('/')||
     name.includes('\\')||name.includes('\0')){
    throw new Error('Faili nimi ei sobi turvaliseks varundamiseks');
  }
  return name;
}
function outsideRepo(destination){
  const target=path.resolve(destination);
  if(target===REPO_ROOT||target.startsWith(REPO_ROOT+path.sep)){
    throw new Error('Varukoopia sihtkoht peab olema väljaspool lähtekoodirepot');
  }
  return target;
}
async function backupWodStorage({
  supabaseUrl=process.env.SUPABASE_URL,
  serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,
  destination=process.env.RCF_BACKUP_DIR,
  fetchImpl=globalThis.fetch
}={}){
  if(!serviceKey)throw new Error('SUPABASE_SERVICE_ROLE_KEY on kohustuslik (ära salvesta koodi sisse)');
  if(!supabaseUrl||!/^https:\/\/[^/]+/.test(supabaseUrl))throw new Error('SUPABASE_URL peab kasutama HTTPS-i');
  if(!destination)throw new Error('RCF_BACKUP_DIR on kohustuslik');
  const target=outsideRepo(destination);
  const base=supabaseUrl.replace(/\/+$/,'');
  const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey};
  const manifest={bucket:BUCKET,created_at:new Date().toISOString(),objects:[]};
  const explored=new Set();
  const folders=[''];
  const objects=[];

  while(folders.length){
    const prefix=folders.pop();
    if(explored.has(prefix))continue;
    explored.add(prefix);
    if(explored.size>10000)throw new Error('Liiga palju kaustu; varundus peatati');
    for(let offset=0;offset<100000;offset+=100){
      const res=await fetchImpl(base+'/storage/v1/object/list/'+BUCKET,{
        method:'POST',headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify({prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}})
      });
      if(!res.ok)throw new Error('Storage nimekirja lugemine nurjus: HTTP '+res.status);
      const rows=await res.json();
      if(!Array.isArray(rows))throw new Error('Storage nimekirja formaat ei sobi');
      for(const entry of rows){
        const name=safeName(entry?.name);
        const relative=prefix?prefix+'/'+name:name;
        if(entry.id==null&&entry.metadata==null)folders.push(relative);
        else objects.push(relative);
      }
      if(rows.length<100)break;
    }
  }

  await fs.mkdir(target,{recursive:true,mode:0o700});
  for(const objectPath of objects.sort()){
    const url=base+'/storage/v1/object/authenticated/'+BUCKET+'/'+objectPath.split('/').map(encodeURIComponent).join('/');
    const res=await fetchImpl(url,{headers});
    if(!res.ok)throw new Error('WOD faili allalaadimine nurjus: HTTP '+res.status);
    const buffer=Buffer.from(await res.arrayBuffer());
    const name=path.join(target,BUCKET,...objectPath.split('/'));
    await fs.mkdir(path.dirname(name),{recursive:true,mode:0o700});
    await fs.writeFile(name,buffer,{flag:'wx',mode:0o600});
    manifest.objects.push({
      path:objectPath,
      size_bytes:buffer.length,
      sha256:crypto.createHash('sha256').update(buffer).digest('hex')
    });
  }

  const pathManifest=path.join(target,BUCKET+'-manifest.json');
  await fs.writeFile(pathManifest,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return {count:manifest.objects.length,failed:0,destination:target};
}

module.exports={backupWodStorage};
if(require.main===module){
  backupWodStorage().then(result=>{
    console.log('WOD piltide varundus lõpetatud: '+result.count+' faili. Kontrolli manifesti SHA256 väärtusi.');
  }).catch(e=>{
    console.error('WOD varundus katkes: '+e.message);
    process.exitCode=1;
  });
}
