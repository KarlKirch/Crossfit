'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),sw=read('sw.js');
test('Serveri versioon ja äpi versioon on identsed',()=>{
 const json=JSON.parse(read('version.json'));
 assert.equal(json.app_version,app.match(/const APP_VERSION='([^']+)'/)[1]);
 assert.equal(json.worker_version,Number(sw.match(/crossfit-app-v(\d+)/)[1]));
 assert.match(html,/app\.js\?v=86/);
});
test('Telefoni esiplaanile tulek kontrollib serveri versiooni',()=>{
 assert.match(app,/fetch\('\.\/version\.json\?fresh='/);
 assert.match(app,/document\.addEventListener\('visibilitychange'/);
 assert.match(app,/window\.addEventListener\('focus'/);
 assert.match(app,/showUpdateBanner\(\)/);
});
test('Uuenduse nupp on mõlema kasutajarolli seadetel olemas',()=>{
 assert.match(read('admin-redesign.js'),/Uuenda äppi/);
 assert.match(read('my-account-redesign.js'),/Uuenda äppi/);
 assert.match(app,/Object\.assign\(window,\{updateAppNow/);
 assert.match(html,/uuenda\.html\?v=2/);
});
test('Uuenduse parandamise leht ei ole enam naelutatud vanale SW v89 URL-ile',()=>{
 const repair=read('uuenda.html');
 assert.match(repair,/const newWorker='\.\/sw\.js'/);
 assert.doesNotMatch(repair,/version=89|sw\.js\?v=89/);
 assert.match(repair,/await reg\.update\(\)/);
});
