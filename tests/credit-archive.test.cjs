'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'credit-system.js'), 'utf8');

function load({trainer}) {
  const requests = [];
  const archived = {id: 90, title: 'Eemaldatud proovitrenn', archived_at:'2026-10-20T10:00:00Z'};
  const active = {id: 91, title:'Tulevane treening', archived_at:null};
  const state = {
    session:{user:{id:'test-client'}},profile:{role:trainer?'trainer':'client'},
    trainings:[],profiles:[],registrations:[],wallets:[],creditTransactions:[],
    notifications:[],removedClients:[],packageTypes:[],userPackages:[]
  };
  const ctx = {
    state, setTimeout(){return 0;}, console,
    isTrainer:()=>trainer,
    now:()=>new Date('2026-10-22T08:00:00Z'),
    renderModal(){return ''},
    api:async query=>{
      requests.push(query);
      if (query.startsWith('wod_trainings?')) {
        // Simuleerib PostgREST-i tegelikku archive-filter käitumist.
        return query.includes('archived_at=is.null') ? [active] : [archived, active];
      }
      return [];
    }
  };
  ctx.window=ctx;
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:'credit-system.js',timeout:3000});
  return {ctx,requests,state,archived,active};
}

for (const trainer of [true,false]) {
  test((trainer?'Treener':'Klient')+' ei laadi arhiveeritud treeninguid krediidimooduli kaudu',async()=>{
    const h=load({trainer});
    await h.ctx.loadData();
    assert.match(h.requests[0],/archived_at=is\.null/,
      'Päring peab filtreerima ajalukku eemaldatud treeningud');
    assert.deepEqual(Array.from(h.state.trainings.map(x=>x.id)),[h.active.id],
      'Arhiveeritud proovitrenn ei tohi ilmuda avalehele ega ajaloovaatesse');
  });
}
