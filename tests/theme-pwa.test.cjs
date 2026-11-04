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
  assert.match(read('supabase/functions/rcf-signup/index.ts'), /app_identifier: 'rouge_crossfit'/);
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
  assert.match(auth, /E-posti kinnituskirja ei saadeta/);
  assert.match(read('supabase/functions/rcf-signup/index.ts'), /E-posti kinnituskirja ei saadeta/);
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
  assert.match(html, /property="og:url" content="https:\/\/karlkirch\.github\.io\/Crossfit\/\?liitu=rcf20261104"/);
  assert.match(html, /property="og:image:type" content="image\/png"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:description" content="Loo konto/);
  assert.match(app, /const SHARE_URL=APP_URL\+'liitu\.html'/);
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

test('CrossFiti liitumine ei saada Supabase Authi kinnituskirju ega muuda Futboli seadeid', () => {
  const app = read('app.js');
  const html = read('index.html');
  const sw = read('sw.js');
  const auth = read('auth-flow.js');
  const server = read('supabase/functions/rcf-signup/index.ts');
  const sql = read('supabase/migrations/20261104_rcf_signup_rate_gate.sql');
  assert.match(app, /functions\/v1\/rcf-signup/);
  assert.doesNotMatch(app, /auth\/v1\/signup/);
  assert.match(app, /display_name:name,join_reason:reason/);
  assert.match(server, /auth\/v1\/admin\/users/);
  assert.match(server, /email_confirm: false/);
  assert.match(server, /rcf_signup_try_slot/);
  assert.match(server, /'rouge_crossfit'/);
  assert.match(server, /password\.length < 8/);
  assert.match(server, /approval_status !== 'pending'/);
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/);
  assert.match(sql, /request\.jwt\.claim\.role/);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.rcf_signup_try_slot/);
  assert.match(sql, /TO service_role/);
  assert.match(auth, /minlength="\$\{signup\?8:6\}"/);
  assert.match(auth, /let method='password'/);
  assert.match(html, /auth-flow\.js\?v=8/);
  assert.ok(sw.includes('auth-flow.js?v=8'));
  assert.ok(sw.includes("'./liitu.html'"));
});

test('Erinevates seadmetes on uus liitumislink ning katkine e-posti lingiga sisselogimise valik peidetud',()=>{
  const index=read('index.html'),app=read('app.js'),qr=read('pro-features.js');
  const html=read('liitu.html'),css=read('liitu.css'),js=read('liitu.js');
  const auth=read('auth-flow.js'),sw=read('sw.js');
  assert.match(html, /<form id="join-form" novalidate>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/karlkirch\.github\.io\/Crossfit\/social-preview-rcf\.png">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/karlkirch\.github\.io\/Crossfit\/liitu\.html">/);
  assert.match(html, /id="join-email"/);
  assert.match(html, /minlength="8"/);
  assert.match(html, /E-posti kinnituskirja ei saadeta/);
  assert.match(js, /functions\/v1\/rcf-signup/);
  assert.doesNotMatch(js, /auth\/v1\/signup|auth\/v1\/otp/);
  assert.match(js, /credentials:'omit',cache:'no-store'/);
  assert.match(css, /input:focus-visible/);
  assert.match(index, /app\.js\?v=56/);
  assert.match(index, /pro-features\.js\?v=7/);
  assert.match(app, /const SHARE_URL=APP_URL\+'liitu\.html'/);
  assert.match(qr, /const APP_URL='https:\/\/karlkirch\.github\.io\/Crossfit\/liitu\.html'/);
  assert.match(auth, /const emailMode=false/);
  assert.match(auth, /const switcher=''/);
  assert.match(auth, /Unustasid parooli\?/);
  assert.match(sw, /crossfit-app-v88/);
  assert.ok(sw.includes("'./liitu.js?v=1'"));
});


test('Treeneri väljastatav CrossFiti taastekood on ühekordne ega nõua SMTP-d',()=>{
  const sql=read('supabase/migrations/20261104_rcf_trainer_password_recovery.sql');
  const fn=read('supabase/functions/rcf-password-recovery/index.ts');
  const ui=read('recovery-admin.js');
  const reset=read('taasta.js');
  const html=read('taasta.html');
  const auth=read('auth-flow.js');
  const app=read('app.js');
  const index=read('index.html');
  const sw=read('sw.js');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS private\.rcf_password_recovery/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON private\.rcf_password_recovery FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/current_setting\('request\.jwt\.claim\.role', true\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql,/AND p\.approval_status = 'approved'/);
  assert.match(sql,/AND p\.role = 'trainer'/);
  assert.match(sql,/FOR UPDATE OF r/);
  assert.match(sql,/failed_attempts = v_failed \+ 1/);
  assert.match(sql,/DELETE FROM private\.rcf_password_recovery WHERE user_id = v_uid/);
  assert.match(sql,/now\(\) \+ interval '24 hours'/);
  assert.match(fn,/auth\/v1\/user/);
  assert.match(fn,/approval_status !== 'approved'/);
  assert.match(fn,/auth\/v1\/admin\/users\/.*claimed\.value/);
  assert.match(fn,/crypto\.getRandomValues/);
  assert.match(fn,/rcf_password_recovery_issue/);
  assert.match(fn,/rcf_password_recovery_claim/);
  assert.match(fn,/rcf_password_recovery_allow_attempt/);
  assert.match(fn,/action === 'issue'/);
  assert.match(fn,/action === 'redeem'/);
  assert.match(fn,/password:newPassword/);
  assert.doesNotMatch(fn,/auth\/v1\/recover|auth\/v1\/otp/);
  assert.doesNotMatch(reset,/auth\/v1\/recover|auth\/v1\/otp/);
  assert.match(html,/taasta\.js\?v=1/);
  assert.match(html,/id="reset-password"/);
  assert.match(reset,/action:'redeem'/);
  assert.match(reset,/newPassword!==confirm/);
  assert.match(ui,/window\.crossfitRecovery=\{issue,close\}/);
  assert.match(read('client-directory.js'),/crossfitRecovery\.issue/);
  assert.match(auth,/href="\.\/taasta\.html"/);
  assert.match(read('liitu.html'),/href="\.\/taasta\.html"/);
  assert.match(index,/recovery-admin\.js\?v=1/);
  assert.match(index,/recovery\.css\?v=1/);
  assert.match(sw,/crossfit-app-v88/);
  assert.ok(sw.includes("'./taasta.js?v=1'"));
  assert.ok(app.includes('sw.js?v=87'));
});


test('Kohaloleku andmed on eraldi broneeringutest, ainult treener märgib ja klient näeb oma statistikat',()=>{
  const sql=read('supabase/migrations/20261104_rcf_attendance_stats.sql');
  const js=read('attendance-stats.js');
  const styles=read('attendance.css');
  const html=read('index.html');
  const sw=read('sw.js');
  const training=read('training-detail-redesign.js');
  const mine=read('my-account-redesign.js');
  const directory=read('client-directory.js');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.wod_attendance/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.wod_attendance FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/GRANT SELECT ON TABLE public\.wod_attendance TO authenticated/);
  assert.match(sql,/registration_id bigint PRIMARY KEY REFERENCES public\.wod_registrations/);
  assert.match(sql,/r\.user_id=\(SELECT auth\.uid\(\)\) OR \(SELECT private\.wod_is_trainer\(\)\)/);
  assert.match(sql,/NOT \(SELECT private\.wod_is_trainer\(\)\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.wod_mark_attendance\(bigint,text\) FROM PUBLIC,anon/);
  assert.match(sql,/r\.status<>'confirmed'/);
  assert.match(sql,/t\.starts_at \+ make_interval\(mins=>t\.duration_minutes\)>now\(\)/);
  assert.match(sql,/p_status='unmarked'/);
  assert.match(sql,/ON CONFLICT \(registration_id\) DO UPDATE/);
  assert.match(sql,/RETURNS jsonb/);
  assert.match(sql,/AT TIME ZONE 'Europe\/Tallinn'/);
  assert.match(sql,/uid IS DISTINCT FROM \(SELECT auth\.uid\(\)\)/);
  assert.match(sql,/generate_series\(0,51\)/);
  assert.match(js,/window\.rpc\('wod_mark_attendance'/);
  assert.match(js,/window\.rpc\('wod_attendance_summary'/);
  assert.match(js,/window\.api\('wod_attendance\?select=/);
  assert.match(js,/s\.clientPreview/);
  assert.match(js,/aria-pressed/);
  assert.match(js,/Kohalolek on eraldi arvestus ega muuda makseid ega krediite/);
  assert.match(js,/Vanemad registreeringud|Varasemad registreeringud/);
  assert.match(styles,/\.at-metrics/);
  assert.match(styles,/\.at-action\.selected\.present/);
  assert.match(mine,/crossfitAttendance\?\.statsCard/);
  assert.match(training,/crossfitAttendance\?\.panel/);
  assert.match(directory,/crossfitAttendance\?\.clientCard/);
  assert.match(html,/attendance-stats\.js\?v=2/);
  assert.match(html,/attendance\.css\?v=2/);
  assert.match(html,/app\.js\?v=56/);
  assert.match(sw,/crossfit-app-v88/);
  assert.match(sw,/attendance-stats\.js\?v=2/);
});

test('Privaatsõnumi pooleli kirjutatud tekst säilib asünkroonse värskendamise ajal',()=>{
  const chat=read('message-center.js');
  const html=read('index.html');
  const sw=read('sw.js');
  assert.match(chat,/function redrawKeepingDraft\(\)/);
  assert.match(chat,/document\.getElementById\('cmBody'\)\?\.value/);
  assert.match(chat,/if\(input\)input\.value=draft/);
  assert.match(chat,/if\(changed&&visible\(\)\)\{redrawKeepingDraft\(\)/);
  assert.match(chat,/if\(s\.modal==='privateMessages'\)\{redrawKeepingDraft\(\)/);
  assert.match(html,/message-center\.js\?v=3/);
  assert.match(sw,/message-center\.js\?v=3/);
});

test('CrossFiti registreerimise ja paroolitaaste API kasutavad PostgREST tänapäevast JWT rollivälja', () => {
  const sql = read('supabase/migrations/20261104_rcf_fix_jwt_claims.sql');
  const functions = [
    'rcf_signup_try_slot',
    'rcf_password_recovery_issue',
    'rcf_password_recovery_allow_attempt',
    'rcf_password_recovery_claim'
  ];
  for (const name of functions) {
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.'+name+'('),
      name+' ei saanud parandust');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name+'('),
      name+' õiguste piirang puudub');
  }
  assert.equal((sql.match(/current_setting\('request\.jwt\.claims', true\)/g)||[]).length,4);
  assert.doesNotMatch(sql, /IF current_setting\('request\.jwt\.claim\.role'/);
  assert.equal((sql.match(/IS DISTINCT FROM 'service_role'/g)||[]).length,4);
  assert.equal((sql.match(/TO service_role;/g)||[]).length,4);
  assert.match(read('supabase/functions/rcf-signup/index.ts'),/signup rate gate failed/);
});

test('Kasutaja aktiivsuses on käesolev nädal, viimase treeningu kuupäev ja valitav 12-nädalane graafik',()=>{
  const js=read('attendance-stats.js');
  const css=read('attendance.css');
  const mine=read('my-account-redesign.js');
  const directory=read('client-directory.js');
  assert.match(js,/Sel nädalal kohal/);
  assert.match(js,/Sel kuul kohal/);
  assert.match(js,/Kokku kohal/);
  assert.match(js,/Aktiivset nädalat järjest/);
  assert.match(js,/Viimane treening/);
  assert.match(js,/function selectWeek\(start\)/);
  assert.match(js,/aria-pressed/);
  assert.match(js,/class="at-week-detail"/);
  assert.match(js,/role="group"/);
  assert.match(css,/\.at-bar-cell:focus-visible/);
  assert.match(css,/\.at-chart\{[^}]*overflow-x:auto/);
  assert.match(mine,/crossfitAttendance\?\.statsCard/);
  assert.match(directory,/crossfitAttendance\?\.clientCard/);
  assert.match(js,/Kliendi treeningaktiivsus/);
  assert.match(js,/treeneri kinnitatud osalemised/);
});
