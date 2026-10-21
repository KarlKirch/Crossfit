'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {checkPublicSite} = require('../scripts/check-public-site.cjs');

test('avaliku äpi kontroll vaatab HTML-i, manifesti, teenusetöötajat ja logo', async () => {
  const urls = [];
  const fakeFetch = async url => {
    urls.push(url);
    return {
      ok: true, status: 200,
      text: async () => '<title>Rõuge CrossFit</title>',
    };
  };
  const result = await checkPublicSite({fetchImpl:fakeFetch,base:'https://example.invalid/Crossfit/'});
  assert.equal(result.checked,4);
  assert.deepEqual(urls.map(url=>new URL(url).pathname),[
    '/Crossfit/', '/Crossfit/manifest.webmanifest',
    '/Crossfit/sw.js', '/Crossfit/icon-512-rcf.webp'
  ]);
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
