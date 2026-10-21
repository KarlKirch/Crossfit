'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const theme = read('forest-theme.css');

function token(name) {
  const match = theme.match(new RegExp('--' + name + ':\\s*(#[a-fA-F0-9]{6})(?=\\s*;)'));
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

test('RCF kinnitatud roheline värvikeel säilib', () => {
  assert.equal(token('bg').toUpperCase(), '#123426');
  assert.equal(token('card').toUpperCase(), '#1E4634');
  assert.equal(token('accent').toUpperCase(), '#B8F177');
});

test('põhitekst vastab vähemalt WCAG AA normaalsuuruses kontrastile', () => {
  assert.ok(contrast(token('card'), token('text')) >= 4.5);
  assert.ok(contrast(token('bg'), token('text')) >= 4.5);
});

test('metsaroheline kujundus laetakse algse stiilifaili järel', () => {
  const html = read('index.html');
  const baseIndex = html.indexOf('styles.css?');
  const themeIndex = html.indexOf('forest-theme.css?');
  assert.ok(baseIndex >= 0 && themeIndex > baseIndex);
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


test('heledal kliendikaardi statistikapinnal kasutatakse tumedat teksti', () => {
  assert.equal(token('surface-light').toUpperCase(), '#FFFFFF');
  assert.ok(contrast(token('surface-light'), token('surface-light-text')) >= 4.5);
  assert.match(theme, /body\s+\.cl-detail\s+\.cl-detail-stats>div\s*\{[^}]*background:var\(--surface-light\)/);
  assert.match(theme, /body\s+\.cl-detail\s+\.cl-detail-stats>div\s*\{[^}]*color:var\(--surface-light-text\)/);
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
  assert.ok(registrations.every(version => version === cacheV));
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
