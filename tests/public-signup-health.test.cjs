'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {checkPublicSite} = require('../scripts/check-public-site.cjs');

function fakeFetch({brokenApi=false,brokenJoin=false} = {}) {
  const urls = [];
  const fetchImpl = async (url, options={}) => {
    urls.push({url,method:options.method||'GET'});
    if (options.method === 'OPTIONS') {
      return {status:brokenApi?503:204,
        headers:{get:(key)=>key==='access-control-allow-origin'?'https://karlkirch.github.io':null}};
    }
    if (brokenJoin&&url.includes('liitu.html')) return {ok:false,status:404};
    let text = '';
    if (url.endsWith('/Crossfit/'))text='<title>Rõuge CrossFit</title>';
    if (url.includes('liitu.html'))text='<form id="join-form" novalidate><script src="./liitu.js?v=1"></script>social-preview-rcf.png';
    if (url.includes('liitu.js'))text="const endpoint='/functions/v1/rcf-signup';";
    if (url.endsWith('sw.js'))text="'./liitu.html'";
    return {ok:true,status:200,text:async()=>text};
  };
  return {fetchImpl,urls};
}

test('Avalik liitumisleht, pildid, PWA ja turvaline OPTIONS kontroll',async()=>{
  const {fetchImpl,urls}=fakeFetch();
  const result=await checkPublicSite({fetchImpl});
  assert.equal(result.checked,8);
  assert.ok(urls.some(x=>x.url.endsWith('/liitu.html')));
  assert.ok(urls.some(x=>x.url.includes('/liitu.js?v=1')));
  assert.ok(urls.some(x=>x.url.includes('/liitu.css?v=1')));
  assert.ok(urls.some(x=>x.method==='OPTIONS'&&x.url.includes('/functions/v1/rcf-signup')));
  assert.ok(!urls.some(x=>x.method==='POST'));
});

test('Liitumislehe 404 või serveri CORS tõrge tekitab töökindluse hoiatuse',async()=>{
  await assert.rejects(()=>checkPublicSite({fetchImpl:fakeFetch({brokenJoin:true}).fetchImpl}),/HTTP 404/);
  await assert.rejects(()=>checkPublicSite({fetchImpl:fakeFetch({brokenApi:true}).fetchImpl}),/CORS/);
});
