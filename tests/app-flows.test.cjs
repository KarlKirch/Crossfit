'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// Käivitab päris app.js-i eraldatud VM-is. Päris Supabase'i ei ühendata.
function harness({ confirmAction = true, response = 'archived', error = null } = {}) {
  const requests = [];
  const confirmations = [];
  const element = () => ({
    innerHTML: '', textContent: '', disabled: false,
    classList: { add() {}, remove() {} },
    addEventListener() {}
  });
  const elements = {
    appRoot: element(),
    toast: element(),
    updateBanner: element(),
    updateNow: element()
  };
  const storage = new Map();
  const ctx = {
    Date, Intl, URL, URLSearchParams,
    console: { warn() {}, log() {}, error() {} },
    location: { hash: '', pathname: '/Crossfit/', search: '' },
    navigator: {},
    history: {
      state: { crossfitView: 'home' },
      length: 1,
      replaceState() {},
      pushState() {}
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    setTimeout: () => 1,
    clearTimeout() {},
    addEventListener() {},
    confirm(message) {
      confirmations.push(message);
      return confirmAction;
    },
    async fetch(url, options) {
      requests.push({ url: String(url), options });
      return error
        ? { ok: false, status: 400, text: async () => JSON.stringify({ message: error }) }
        : { ok: true, status: 200, text: async () => JSON.stringify(response) };
    }
  };
  ctx.window = ctx;
  ctx.document = {
    getElementById: id => elements[id] ?? null,
    addEventListener() {}
  };
  ctx.crossfitAuth = { configure() {}, render: () => '' };
  vm.createContext(ctx);
  vm.runInContext(appSource, ctx, { filename: 'app.js', timeout: 3000 });
  // Testkonto eksisteerib ainult mälus; ei kasuta päris sessiooni.
  ctx.state.session = { access_token: 'test-only', user: { id: 'test-trainer' } };
  ctx.state.profile = { role: 'trainer', display_name: 'Testtreener' };
  ctx.loadData = async () => {};
  ctx.renderHome = () => '';
  ctx.renderModal = () => '';
  return { ctx, requests, confirmations, elements };
}

test('treeneri tühistamine kasutab serveri krediiditagastuse funktsiooni', async () => {
  const h = harness({ response: true });
  await h.ctx.cancelTraining(9);
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].url, /\/rest\/v1\/rpc\/wod_cancel_training$/);
  assert.equal(JSON.parse(h.requests[0].options.body).p_training_id, 9);
  assert.match(h.confirmations[0], /krediit/i);
  assert.match(h.elements.toast.textContent, /krediidid tagastati/i);
});

test('tühistamisest loobumisel serverile päringut ei saadeta', async () => {
  const h = harness({ confirmAction: false });
  await h.ctx.cancelTraining(9);
  assert.equal(h.requests.length, 0);
});

test('klient ei saa treeningut ajaloost eemaldada', async () => {
  const h = harness();
  h.ctx.state.profile.role = 'client';
  await h.ctx.deleteTraining(11);
  assert.equal(h.requests.length, 0);
  assert.match(h.elements.toast.textContent, /ainult treenerile/i);
});

test('registreeringutega treeningu eemaldamine kutsub ajalugu säilitavat serverifunktsiooni', async () => {
  const h = harness({ response: 'archived' });
  h.ctx.state.trainings = [{ id: 11, title: 'Test-WOD', starts_at: '2026-10-10T16:00:00Z', status: 'published' }];
  h.ctx.state.registrations = [{ id: 1, training_id: 11, user_id: 'test-client', status: 'confirmed' }];
  await h.ctx.deleteTraining(11);
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].url, /\/rest\/v1\/rpc\/wod_remove_training$/);
  assert.equal(JSON.parse(h.requests[0].options.body).p_training_id, 11);
  assert.match(h.confirmations[0], /arvestus säilivad/i);
  assert.match(h.elements.toast.textContent, /Krediidi- ja makseandmed säilitati/i);
});

test('vigast treeningu ID-d ei saadeta serverile', async () => {
  const h = harness();
  await h.ctx.deleteTraining(-4);
  await h.ctx.deleteTraining('valesti');
  assert.equal(h.requests.length, 0);
});

test('serveri tõrget ei esitata eduka krediiditagastusena', async () => {
  const h = harness({ error: 'Serveri kontroll ebaõnnestus' });
  await h.ctx.cancelTraining(9);
  assert.equal(h.requests.length, 1);
  assert.match(h.elements.toast.textContent, /Serveri kontroll ebaõnnestus/);
  assert.doesNotMatch(h.elements.toast.textContent, /tagastati/i);
});
