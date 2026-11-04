'use strict';

/* Igapäevane avaliku CrossFiti äpi ja eraldi liitumislehe kontroll.
   Ei loo kontosid, ei puuduta kasutajaandmeid ega saada e-kirju. */
const DEFAULT_BASE = 'https://karlkirch.github.io/Crossfit/';
const JOIN_API = 'https://aanxpugvehwtcwwpefwx.supabase.co/functions/v1/rcf-signup';
const ASSETS = [
  '',
  'manifest.webmanifest',
  'sw.js',
  'icon-512-rcf.webp',
  'liitu.html',
  'liitu.css?v=1',
  'liitu.js?v=1'
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
    } else if (asset === 'liitu.html') {
      const html = await response.text();
      if (!/<form id="join-form"\s+novalidate>/.test(html) ||
          !/liitu\.js\?v=1/.test(html) ||
          !/social-preview-rcf\.png/.test(html)) {
        throw new Error('Liitumislehe vorm või logo puudub: ' + url);
      }
    } else if (asset === 'liitu.js?v=1') {
      const js = await response.text();
      if (!js.includes('/functions/v1/rcf-signup') ||
          js.includes('/auth/v1/signup') || js.includes('/auth/v1/otp')) {
        throw new Error('Liitumisleht ei kasuta enam e-kirjavaba registreerimist: ' + url);
      }
    } else if (asset === 'sw.js') {
      const js = await response.text();
      if (!js.includes("'./liitu.html'")) {
        throw new Error('Uus liitumisleht puudub PWA vahemälu ressurssidest: ' + url);
      }
    }
  }

  // Ainult CORS eelkontroll: ei saadeta päris liitumistaotlust ega looda kasutajat.
  const response = await fetchImpl(JOIN_API, {
    method: 'OPTIONS',
    headers: {
      Origin: root.origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store'
  });
  if (response.status !== 204 ||
      response.headers?.get('access-control-allow-origin') !== root.origin) {
    throw new Error('Liitumisserver ei vasta õigesti brauseri CORS eelkontrollile (HTTP ' +
      response.status + ')');
  }
  return {checked: ASSETS.length + 1, base: root.href};
}
module.exports = {checkPublicSite};

if (require.main === module) {
  checkPublicSite().then(result => {
    console.log('RCF avalik äpp, liitumisleht ja server vastavad: ' +
      result.checked + ' kontrolli OK');
  }).catch(error => {
    console.error('RCF kontroll nurjus: ' + error.message);
    process.exitCode = 1;
  });
}
