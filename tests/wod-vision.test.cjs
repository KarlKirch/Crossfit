'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('AI only sends saved WOD ID and keeps API key on server',()=>{
 const front=read('wod-vision.js');
 assert.match(front,/entry_id:numeric/);
 assert.match(front,/Authorization:'Bearer '\+token/);
 assert.doesNotMatch(front,/sk-proj-/);
 const edge=read('supabase/functions/rcf-wod-vision/index.ts');
 assert.match(edge,/Deno\.env\.get\('OPENAI_API_KEY'\)/);
 assert.match(edge,/role !== 'trainer'/);
 assert.match(edge,/store:false/);
 assert.match(edge,/input_image/);
});
test('WOD AI script loads before WOD bank script and is cached',()=>{
 const html=read('index.html'),sw=read('sw.js');
 assert.ok(html.indexOf('wod-vision.js?v=1')<html.indexOf('wod-bank.js?v=13'));
 assert.match(sw,/wod-vision\.js\?v=1/);
 assert.match(read('app.js'),/const APP_VERSION='6\.3\.0'/);
});
