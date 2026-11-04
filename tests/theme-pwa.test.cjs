'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const theme = read('forest-theme.css');
const graphite = read('graphite-theme.css');

function token(name) {
  const match = graphite.match(new RegExp('--' + name + ':\\s*(#[a-fA-F0-9]{6})(?=\\s*;)'));
  assert.ok(match, 'Puuduv värvimuutuja --' + name);
  return match[1];
}
function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('RCF grafiithall ja laimiroheline värvipalett', () => {
  assert.equal(token('bg').toUpperCase(), '#14191E');
  assert.equal(token('card').toUpperCase(), '#293137');
  assert.equal(token('accent').toUpperCase(), '#B9EA6F');
  assert.equal(token('text').toUpperCase(), '#F4F6F7');
});

test('põhitekst vastab vähemalt WCAG AA normaalsuuruses kontrastile', () => {
  assert.ok(contrast(token('card'), token('text')) >= 4.5);
  assert.ok(contrast(token('bg'), token('text')) >= 4.5);
});

test('grafiidikiht laetakse viimasena nii telefonis kui arvutis', () => {
  const html = read('index.html');
  const base = html.indexOf('styles.css?');
  const forest = html.indexOf('forest-theme.css?');
  const graphiteIndex = html.indexOf('graphite-theme.css?');
  assert.ok(base >= 0 && forest > base && graphiteIndex > forest);
});

test('PWA manifesti põhiandmed ja ikoonide viited on olemas', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Rõuge CrossFit');
  assert.equal(manifest.start_url, '/Crossfit/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const relative = icon.src.replace(/^\/Crossfit\//, '');
    assert.ok(fs.existsSync(path.join(root, relative)), 'Ikoon puudub: ' + relative);
  }
});

test('teenusetöötaja on seotud sama rakenduse vahemäluga', () => {
  const sw = read('sw.js');
  assert.match(sw, /crossfit-app-v\d+/);
  assert.match(sw, /\/Crossfit\//);
  assert.match(sw, /notificationclick/);
});


test('kliendikaardi tumedal statistikaalal on hele tekst', () => {
  assert.equal(token('surface-light').toUpperCase(), '#293137');
  assert.ok(contrast(token('surface-light'), token('surface-light-text')) >= 4.5);
  assert.match(graphite, /body\s+\.cl-detail\s+\.cl-detail-stats>div/);
});

test('treeningukaart ja detailaken kasutavad ühiseid kujundusmuutujaid', () => {
  assert.match(theme, /body\s+\.tl-training-card\s*\{[^}]*background:var\(--card\)/);
  assert.match(theme, /body\s+\.td-section\s*\{[^}]*background:var\(--card\)/);
  assert.match(theme, /body\s+\.tl-action-main\s*\{[^}]*background:var\(--accent\)/);
  assert.match(theme, /body\s+\.td-button-main\s*\{[^}]*background:var\(--accent\)/);
});


test('PWA vahemälu ja laaditavate failide versioonid on kooskõlas', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const app = read('app.js');
  const themeV = html.match(/forest-theme\.css\?v=(\d+)/)?.[1];
  const appV = html.match(/app\.js\?v=(\d+)/)?.[1];
  const cacheV = sw.match(/crossfit-app-v(\d+)/)?.[1];
  assert.ok(themeV && appV && cacheV);
  assert.ok(sw.includes('forest-theme.css?v=' + themeV));
  const registrations = [...app.matchAll(/sw\.js\?v=(\d+)/g)].map(match => match[1]);
  assert.equal(registrations.length, 2);
  // Registreerimise URL võib jääda ühe versiooni võrra maha: SW sisu muutus
  // käivitab brauseris uuenduse ning uus cache tunnus puhastab vana vahemälu.
  assert.ok(registrations.every(version => Number(cacheV) - Number(version) >= 0 && Number(cacheV) - Number(version) <= 1));
});


test('WOD, kliendi, konto, teavituste ja treeneri kaardid jagavad ühist raadiust', () => {
  assert.match(theme, /--ui-card-radius:\s*18px;/);
  const group = [
    '.wb-card', '.nc-notice', '.my-account-card', '.tf-section',
    '.ad-entry', '.tb-section', '.cl-card'
  ].join(',');
  assert.ok(theme.includes('body :is(' + group + ')'), 'Ühiste kaartide CSS-rühm puudub');
  assert.match(theme, /border-radius:var\(--ui-card-radius\)/);
});

test('puutetundlikud põhinupud ning fookuse visuaal on läbivalt ühtsed', () => {
  assert.match(theme, /--ui-control-radius:\s*12px;/);
  assert.match(theme, /--ui-touch-target:\s*44px;/);
  assert.match(theme, /min-height:var\(--ui-touch-target\)/);
  assert.match(theme, /outline:2px solid var\(--accent\)/);
});


test('laimirohelisel nupul on loetav grafiiditekst', () => {
  assert.ok(contrast(token('accent'), '#14191E') >= 4.5);
});

test('PWA ja telefoni brauseri ülemine riba kasutavad grafiiti', () => {
  const html = read('index.html');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.match(html, /name="theme-color" content="#14191E"/i);
  assert.equal(manifest.theme_color.toUpperCase(), '#14191E');
  assert.equal(manifest.background_color.toUpperCase(), '#14191E');
});

test('uue teema fail on teenusetöötaja vahemälus', () => {
  const html = read('index.html'), sw = read('sw.js');
  const version = html.match(/graphite-theme\.css\?v=(\d+)/)?.[1];
  assert.ok(version);
  assert.ok(sw.includes('graphite-theme.css?v=' + version));
});

test('registreerimisvormi nimi ja tekst on tumedal kaardil loetavad', () => {
  assert.match(graphite, /body \.auth-card\{background:#293137;color:#F4F6F7/);
  assert.match(graphite, /body \.auth-card \.field label\{color:#F4F6F7/);
  assert.match(graphite, /body \.auth-card \.auth-field-note\{color:#C2CDD3/);
  assert.ok(contrast('#293137', '#F4F6F7') >= 4.5);
});

test('iPhone’i installijuhend näitab Safari lisamist ja Open as Web App valikut', () => {
  const guide = read('install-guide.js');
  assert.match(guide, /Lisa avakuvale/);
  assert.match(guide, /Open as Web App/);
  assert.match(guide, /Vaata juhendit/);
  assert.match(read('index.html'), /apple-touch-icon/);
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.ok(manifest.icons.some(icon => icon.type === 'image/png' && icon.sizes === '192x192'));
});

test('uued CrossFiti liitumised on Futboli kontodest eristatavad', () => {
  const app = read('app.js');
  const approvals = read('approval-system.js');
  const migration = read('supabase/migrations/20261103_rcf_signup_notifications.sql');
  assert.match(app, /app_identifier:'rouge_crossfit'/);
  assert.match(approvals, /wod_list_join_requests_v2/);
  assert.match(approvals, /email_verified===false/);
  assert.match(migration, /NEW\.raw_user_meta_data->>'app_identifier' IS DISTINCT FROM 'rouge_crossfit'/);
  assert.match(migration, /BEFORE UPDATE OF approval_status/);
});

test('iPhone’i tõuketeavituse luba küsitakse otsesest kasutajatoimingust', () => {
  const app = read('app.js');
  assert.match(app, /if\(Notification\.permission!=='granted'\)\{await enablePush\(\);return\}/);
  assert.match(app, /isIOSDevice\(\)&&!isStandaloneMode\(\)/);
});

test('liitumisel ei ole e-posti lingi avamise kohustust', () => {
  const app = read('app.js');
  const auth = read('auth-flow.js');
  const approvals = read('approval-system.js');
  assert.match(auth, /E-posti kinnitamise lisasammu ei ole vaja/);
  assert.match(app, /E-posti kinnituskirja avamine ei ole vajalik/);
  assert.match(app, /functions\/v1\/rcf-approve-join/);
  assert.match(approvals, /await window\.crossfitApproveJoin\(id\)/);
  assert.doesNotMatch(approvals, /disabled title="Kliendi e-post pole veel kinnitatud"/);
});

test('kinnitamata liituja kinnitamine on piiratud treeneriga serveris', () => {
  const fn = read('supabase/functions/rcf-approve-join/index.ts');
  assert.match(fn, /\/auth\/v1\/user/);
  assert.match(fn, /coach\?\.\[0\]\?\.role !== 'trainer'/);
  assert.match(fn, /\/auth\/v1\/admin\/users\//);
  assert.match(fn, /email_confirm: true/);
  assert.match(fn, /\/rest\/v1\/rpc\/wod_review_join_request/);
  assert.doesNotMatch(read('app.js'), /SUPABASE_SERVICE_ROLE_KEY/);
});

test('avaliku sisselogimislehe juures kuvatakse arusaadav liitumiskord', () => {
  const auth = read('auth-flow.js');
  const theme = read('graphite-theme.css');
  assert.match(auth, /Kuidas Rõuge CrossFitiga liituda\?/);
  assert.match(auth, /Liitumistaotlus jõuab automaatselt treenerile/);
  assert.match(auth, /Treener kinnitab sinu kasutajakonto/);
  assert.match(auth, /Pärast kinnitamist logi sisse ja registreeru treeningule/);
  assert.match(auth, /Konto loomiseks ei pea e-posti kinnituskirja avama/);
  assert.match(auth, /\$\{form\}\$\{joinGuide\}/);
  assert.match(theme, /body \.auth-join-steps/);
});

test('Minu profiili dialoogi foto ja abitekstid on tumedal taustal loetavad', () => {
  assert.match(read('styles.css'), /\.cf-photo-editor\{[^}]*background:#fff/);
  assert.match(graphite, /body \.sheet \.cf-photo-editor\{\s*background:#293137;\s*color:#F4F6F7/);
  assert.match(graphite, /body \.sheet \.cf-photo-current strong\{color:#F4F6F7\}/);
  assert.match(graphite, /body \.sheet \.cf-photo-editor p\{color:#C2CDD3\}/);
  assert.match(graphite, /body \.sheet \.cf-profile-form input:disabled/);
  assert.ok(contrast('#293137','#D4DFE4') >= 4.5);
  assert.ok(contrast('#293137','#C2CDD3') >= 4.5);
});

test('Rõuge CrossFiti jagamislink näitab uut logo ja selget liitumiskutset', () => {
  const html = read('index.html');
  const app = read('app.js');
  const sw = read('sw.js');
  assert.match(html, /property="og:image" content="https:\/\/karlkirch\.github\.io\/Crossfit\/social-preview-rcf\.png"/);
  assert.match(html, /property="og:image:type" content="image\/png"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:description" content="Loo konto/);
  assert.match(app, /const SHARE_URL=APP_URL\+'\?liitu=rcf20261104'/);
  assert.match(app, /navigator\.clipboard\.writeText\(SHARE_URL\)/);
  assert.match(app, /url:SHARE_URL/);
  assert.ok(sw.includes("'./social-preview-rcf.png'"));
  const file = require('node:fs').readFileSync(require('node:path').join(require('node:path').resolve(__dirname,'..'),'social-preview-rcf.png'));
  assert.equal(file.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(file.readUInt32BE(16),1200);
  assert.equal(file.readUInt32BE(20),630);
  assert.ok(file.length < 600000);
  for (const size of [192,512]) {
    const icon = require('node:fs').readFileSync(require('node:path').join(require('node:path').resolve(__dirname,'..'),`icon-${size}.png`));
    assert.equal(icon.readUInt32BE(16),size);
    assert.equal(icon.readUInt32BE(20),size);
  }
});
