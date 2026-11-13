'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('AI-pildilugemine ei ole äppi ühendatud ja server on maksepäringuteks suletud',()=>{
 const html=read('index.html'),sw=read('sw.js'),bank=read('wod-bank.js');
 assert.doesNotMatch(html,/wod-vision\.js|wod-ocr-quality\.js/);
 assert.doesNotMatch(sw,/wod-vision\.js|wod-ocr-quality\.js/);
 assert.doesNotMatch(bank,/crossfitWodVision|loadOcr\(/);
 const edge=read('supabase/functions/rcf-wod-vision/index.ts');
 assert.match(edge,/code:'AI_DISABLED'/);
 assert.doesNotMatch(edge,/api\.openai\.com/);
});
test('Versioon 6.3.2 kasutab foto ja käsitsi kava salvestamist',()=>{
 assert.match(read('app.js'),/const APP_VERSION='6\.3\.2'/);
 assert.match(read('index.html'),/wod-bank\.js\?v=15/);
 assert.match(read('sw.js'),/wod-review-ui\.js\?v=11/);
});
