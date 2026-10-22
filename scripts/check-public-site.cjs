'use strict';

/* Avaliku rakenduse ligipääsetavuse kontroll. Ei kasuta kontosid,
   autentimist ega Supabase'i andmeid. Ajastatud GitHub Actionsiga. */
const DEFAULT_BASE = 'https://karlkirch.github.io/Crossfit/';
const ASSETS = [
  '',
  'manifest.webmanifest',
  'sw.js',
  'icon-512-rcf.webp'
];

async function checkPublicSite({fetchImpl = fetch, base = DEFAULT_BASE} = {}) {
  const root = new URL(base);
  if (root.protocol !== 'https:') throw new Error('Avaliku äpi kontroll nõuab HTTPS-i');
  for (const asset of ASSETS) {
    const url = new URL(asset, root).href;
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + url);
    if (asset === '') {
      const html = await response.text();
      if (!/<title>\s*Rõuge CrossFit\s*<\/title>/i.test(html)) {
        throw new Error('Avalehe pealkiri puudub või on vigane: ' + url);
      }
    }
  }
  return {checked: ASSETS.length, base: root.href};
}
module.exports = {checkPublicSite};

if (require.main === module) {
  checkPublicSite().then(result => {
    console.log('RCF avalik äpp vastab: ' + result.checked + ' ressurssi OK');
  }).catch(error => {
    console.error('RCF kontroll nurjus: ' + error.message);
    process.exitCode = 1;
  });
}
