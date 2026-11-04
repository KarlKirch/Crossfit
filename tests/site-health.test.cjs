'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {checkPublicSite} = require('../scripts/check-public-site.cjs');

test('avaliku äpi kontroll vaatab HTML-i, liitumist, teenusetöötajat ja serveri CORS-i', async () => {
  const urls = [];
  const fakeFetch = async (url, options={}) => {
    urls.push({url, method:options.method || 'GET'});
    if (options.method === 'OPTIONS') {
      return {status:204,headers:{get:()=> 'https://example.invalid'}};
    }
    const text = url.includes('liitu.html')
      ? '<form id="join-form" novalidate><script src="./liitu.js?v=1"></script>social-preview-rcf.png'
      : url.includes('liitu.js')
        ? 'https://example.invalid/functions/v1/rcf-signup'
        : url.endsWith('/sw.js')
          ? "'./liitu.html'"
          : '<title>Rõuge CrossFit</title>';
    return {ok:true,status:200,text:async()=>text};
  };
  const result = await checkPublicSite({fetchImpl:fakeFetch,base:'https://example.invalid/Crossfit/'});
  assert.equal(result.checked,8);
  assert.deepEqual(urls.map(x=>new URL(x.url).pathname),[
    '/Crossfit/', '/Crossfit/manifest.webmanifest',
    '/Crossfit/sw.js', '/Crossfit/icon-512-rcf.webp',
    '/Crossfit/liitu.html','/Crossfit/liitu.css','/Crossfit/liitu.js',
    '/functions/v1/rcf-signup'
  ]);
  assert.equal(urls.at(-1).method,'OPTIONS');
});

test('avaliku äpi kontroll annab katkise ressursi puhul veateate', async () => {
  const fakeFetch = async () => ({ok:false,status:503});
  await assert.rejects(
    () => checkPublicSite({fetchImpl:fakeFetch,base:'https://example.invalid/Crossfit/'}),
    /HTTP 503/
  );
});

test('avalehel peab olema õige Rõuge CrossFiti pealkiri', async () => {
  const fakeFetch = async () => ({ok:true,status:200,text:async()=>'<title>Viga</title>'});
  await assert.rejects(
    () => checkPublicSite({fetchImpl:fakeFetch,base:'https://example.invalid/Crossfit/'}),
    /pealkiri/
  );
});
