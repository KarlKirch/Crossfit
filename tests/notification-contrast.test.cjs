'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Grafiitteema ei muuda avatud/loetud teavitust valgeks',()=>{
  const css=read('graphite-theme.css');
  const base=css.match(/body \.nc-list \.nc-notice,\s*body \.nc-list \.nc-notice:visited\s*\{([^}]+)\}/);
  assert.ok(base,'Loetud teavituse alusvärvid puuduvad');
  assert.match(base[1],/background:\s*#293137!important/);
  assert.match(base[1],/color:\s*#F4F6F7!important/);
  const hover=css.match(/body \.nc-list \.nc-notice:is\(:hover,:focus,:focus-visible,:active\)\s*\{([^}]+)\}/);
  assert.ok(hover,'Puuteekraani hover/focus/active kontrastipuuduse kaitse puudub');
  assert.match(hover[1],/background:\s*#38464F!important/);
  assert.match(hover[1],/color:\s*#F4F6F7!important/);
  assert.match(css,/body \.nc-list \.nc-notice\.nc-unread:is\(:hover,:focus,:focus-visible,:active\)/);
  assert.match(css,/body \.nc-list \.nc-notice :is\(\.nc-description,\.nc-time,\.nc-category\)/);
});
test('Teadete loetuks märkimine ei eemalda tumeda kujunduse kaitset',()=>{
  const notice=read('notification-center.js');
  assert.match(notice,/const cat=category\(item\),urgent=IMPORTANT\.has\(item\.kind\),unread=!item\.read_at/);
  assert.match(notice,/nc-notice/);
  assert.match(read('forest-theme.css'),/body \.nc-list \.nc-notice:is\(:hover,:focus,:focus-visible,:active\)/);
});
test('Uus kujundus jõuab PWA vahemällu',()=>{
 const html=read('index.html'),sw=read('sw.js'),app=read('app.js');
 for(const asset of ['graphite-theme.css?v=5','forest-theme.css?v=13','app.js?v=88']){
   assert.ok(html.includes(asset),asset+' puudub HTML-is');
   assert.ok(sw.includes(asset),asset+' puudub PWA vahemälust');
 }
 assert.match(app,/const APP_VERSION='6\.4\.10'/);
 assert.match(sw,/crossfit-app-v123/);
 assert.match(app,/sw\.js\?v=123/);
});
