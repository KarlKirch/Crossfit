'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','client-preview.js'),'utf8');
function harness(){
 const past={id:27,title:'CrossFit',status:'published',archived_at:null,
   starts_at:'2026-11-19T17:00:00Z',duration_minutes:90,capacity:14};
 const future={id:80,title:'CrossFit',status:'published',archived_at:null,
   starts_at:'2090-12-02T17:00:00Z',duration_minutes:90,capacity:14};
 const names=Array.from({length:11},(_,i)=>({user_id:'real-'+i,display_name:'Osaleja '+i,role:'client'}));
 const registrations=names.map((p,i)=>({id:i+1,user_id:p.user_id,training_id:past.id,status:'confirmed'}));
 const guestBookings=Array.from({length:3},(_,i)=>({
   booking_id:i+1,training_id:past.id,full_name:'Külaline '+i,booking_status:'confirmed'}));
 const state={
   session:{access_token:'admin-private-token',user:{id:'trainer',email:'trainer@example.invalid'}},
   profile:{user_id:'trainer',display_name:'Treener',role:'trainer'},
   trainings:[past,future],registrations,guestBookings,profiles:names,
   wallets:[],creditTransactions:[],userPackages:[],notifications:[],packageTypes:[],
   view:'more',modal:null,modalData:null,trainingTab:'upcoming'
 };
 let renderCount=0;const calls=[];
 const win={state,render:()=>{renderCount++},renderMore:()=>'',renderModal:()=>'',toast:()=>{}};
 const document={addEventListener:()=>{}};
 const history={state:{},replaceState(){}};
 const fetch=async(url,opts)=>{
   calls.push({url,opts});
   return {ok:true,json:async()=>[{attendee_name:'Osaleja 0'},{attendee_name:'Külaline 0'}]};
 };
 const ctx={window:win,document,history,Date,Promise,Number,console,fetch};
 vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'client-preview.js'});
 return {win,state,past,future,registrations,guestBookings,names,calls,get renderCount(){return renderCount}};
}
test('Kliendieelvaates on möödunud treeningul kõik 11 päriskontot ja 3 külalist',()=>{
 const h=harness();
 assert.equal(h.win.rcfClientPreview.start(),true);
 const past=h.past.id;
 const confirmed=h.state.registrations.filter(r=>r.training_id===past&&r.status==='confirmed');
 const guests=h.state.guestBookings.filter(g=>g.training_id===past&&g.booking_status==='confirmed');
 assert.equal(confirmed.length,11);
 assert.equal(guests.length,3);
 assert.equal(confirmed.length+guests.length,14);
 assert.ok(h.state.profiles.some(p=>p.display_name==='Osaleja 0'));
 assert.equal(h.state.session.access_token,null,'näidiskliendile ei anta adminitokenit');
});
test('Kliendieelvaade säilitab tulevaste tundide kunstliku registreerimisstsenaariumi',()=>{
 const h=harness();
 h.win.rcfClientPreview.start('booked');
 assert.equal(h.state.registrations.filter(r=>r.training_id===80).length,1);
 assert.equal(h.state.registrations.filter(r=>r.training_id===27).length,11);
 h.win.rcfClientPreview.setScenario('waitlist');
 const wait=h.state.registrations.filter(r=>r.training_id===80&&r.status==='confirmed');
 assert.ok(wait.length>0);
 assert.equal(h.state.registrations.filter(r=>r.training_id===27).length,11);
});
test('Kliendieelvaade loeb tegelikku kohalolekut algse treeneri tokeniga ainult piiratud RPC-st',async()=>{
 const h=harness();
 h.win.rcfClientPreview.start();
 const roster=await h.win.rcfClientPreview.readCompletedAttendees(27);
 assert.equal(roster.length,2);
 assert.equal(h.calls.length,1);
 assert.match(h.calls[0].url,/\/rpc\/wod_completed_attendees_secure$/);
 assert.equal(h.calls[0].opts.headers.Authorization,'Bearer admin-private-token');
 assert.equal(JSON.parse(h.calls[0].opts.body).p_training_id,27);
 await assert.rejects(()=>h.win.rcfClientPreview.readCompletedAttendees(80));
 assert.equal(h.calls.length,1);
});
test('Näidiskliendi sulgemisel taastatakse kõik pärisandmed täpselt',()=>{
 const h=harness(),registrations=h.state.registrations,guests=h.state.guestBookings;
 assert.equal(h.win.rcfClientPreview.start(),true);
 assert.equal(h.win.rcfClientPreview.exit(),true);
 assert.equal(h.state.registrations,registrations);
 assert.equal(h.state.guestBookings,guests);
 assert.equal(h.state.session.access_token,'admin-private-token');
});
