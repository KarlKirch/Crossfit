'use strict';

/* 11. samm. Krediidi haldamise kasutajaliides.
 * Ainus kirjutustoiming on olemasolev ja kontrollitud wod_add_credits RPC.
 * Tühistamise, krediidi kulumise ja ootenimekirja reegleid ei muudeta.
 */
(function(){
  const s=window.state;
  if(!s||typeof window.renderModal!=='function'||typeof window.clientCard!=='function')return;
  const previousModal=window.renderModal;
  const previousCard=window.clientCard;
  const previousDetail=window.clientDetail;
  let saving=false;
  const esc=v=>window.esc(v);
  const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

  const money=cents=>(cents/100).toFixed(2).replace('.',',')+' €';
  const balance=uid=>Math.max(0,Number(s.wallets.find(w=>w.user_id===uid)?.credits||0));

  const person=uid=>s.profiles.find(p=>p.user_id===uid&&p.role==='client');
  function validClient(uid){
    if(!ID.test(uid)||!person(uid))return false;
    return !(s.removedClients||[]).some(r=>r.user_id===uid);
  }
  function parseCash(text){
    if(text==null||String(text).trim()==='')return null;
    const clean=String(text).trim().replace(/\s/g,'');
    if(!/^\d+(?:[.,]\d{1,2})?$/.test(clean))return NaN;
    const cents=Math.round(Number(clean.replace(',','.'))*100);
    return Number.isSafeInteger(cents)&&cents>=0&&cents<=100000000?cents:NaN;
  }
  function validQty(value){
    const qty=Number(value);
    return Number.isInteger(qty)&&qty>=1&&qty<=100;
  }
  function previewData(uid){
    const q=Number(document.getElementById('creditQty')?.value||0);
    const raw=document.getElementById('creditCash')?.value;
    const cash=parseCash(raw);
    const before=balance(uid);
    return {qty:q,before,after:before+q,cash,valid:validQty(q)&&!Number.isNaN(cash)};
  }
  function preview(uid){
    const p=previewData(uid);
    const amount=document.getElementById('creditBeforeAfter');
    const cash=document.getElementById('creditCashPreview');
    const button=document.getElementById('creditSaveBtn');
    const error=document.getElementById('creditInputError');
    if(amount)amount.textContent=p.valid?p.before+' → '+p.after+' krediiti':'Kontrolli lisatavat kogust ja summat';
    if(cash)cash.textContent=p.cash===null?'Sularahas saadud summa pole märgitud':
      Number.isNaN(p.cash)?'Sularahas saadud summa peab olema korrektne':
      'Sularahas saadud: '+money(p.cash);
    if(error)error.textContent=p.valid?'':'Krediit peab olema täisarv 1–100; sularaha summa kuni kahe komakohaga.';
    if(button)button.disabled=saving||!p.valid;
    return p;
  }
  function setQty(value){
    const el=document.getElementById('creditQty');
    if(el){el.value=String(value);preview(s.modalData);}
  }
  function form(uid){
    if(!window.isTrainer()||!validClient(uid))return '';
    const p=person(uid),before=balance(uid);
    return '<div class="cx-add-page">'+
      '<div class="cx-add-hero"><div class="cx-kicker">LISA TREENINGKREDIITI</div>'+
        '<h2>'+esc(p.display_name||'Klient')+'</h2>'+
        '<div class="cx-balance-current">'+before+' <span>krediiti hetkel</span></div>'+
      '</div>'+
      '<form class="cx-credit-form" onsubmit="event.preventDefault();crossfitCredits.submit()">'+
        '<label for="creditQty">Mitu treeningkorda lisada?</label>'+
        '<input id="creditQty" type="number" inputmode="numeric" min="1" max="100" step="1" value="1" required oninput="crossfitCredits.preview()">'+
        '<div class="cx-credit-presets" aria-label="Kiirvalikud">'+
          [1,5,10,20].map(n=>'<button type="button" onclick="crossfitCredits.setQty('+n+')">+'+n+'</button>').join('')+
        '</div>'+
        '<label for="creditCash">Sularahas saadud summa (€) <span>– valikuline</span></label>'+
        '<input id="creditCash" type="text" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="Näiteks 25,00" oninput="crossfitCredits.preview()">'+
        '<label for="creditNote">Märkus <span>– valikuline</span></label>'+
        '<input id="creditNote" type="text" maxlength="90" placeholder="Näiteks: 5 trenni krediit">'+
        '<div class="cx-credit-preview" aria-live="polite">'+
          '<span>Krediidijääk pärast lisamist</span>'+
          '<strong id="creditBeforeAfter">'+before+' → '+(before+1)+' krediiti</strong>'+
          '<small id="creditCashPreview">Sularahas saadud summa pole märgitud</small>'+
          '<small id="creditInputError" class="cx-credit-error"></small>'+
        '</div>'+
        '<p class="cx-form-hint">Krediit kantakse kontole kohe pärast salvestamist. Sularahas tasumine on treeneri ja kliendi omavaheline arveldus.</p>'+
        '<div class="cx-form-actions">'+
          '<button id="creditSaveBtn" type="submit" class="btn btn-primary">Kinnita krediidi lisamine</button>'+
          '<button type="button" class="btn btn-soft" onclick="closeModal()">Katkesta</button>'+
        '</div>'+
      '</form></div>';
  }
  function modal(){
    if(s.modal!=='addCredits')return previousModal();
    if(!window.isTrainer()||!validClient(String(s.modalData||'')))return '';
    return '<div class="sheet-backdrop" onclick="backdropClose(event)"><div class="sheet cx-credit-sheet" role="dialog" aria-modal="true" aria-labelledby="cx-modal-title" onclick="event.stopPropagation()">'+
      '<div class="sheet-head"><div class="sheet-title" id="cx-modal-title">Lisa krediiti</div><button class="sheet-close" type="button" onclick="closeModal()" aria-label="Sulge">×</button></div>'+
      '<div class="sheet-body">'+form(s.modalData)+'</div></div></div>';
  }

  async function submit(){
    const uid=String(s.modalData||'');
    if(saving||!window.isTrainer()||!validClient(uid)||s.modal!=='addCredits')return false;
    const p=preview(uid),note=document.getElementById('creditNote')?.value.trim()||null;
    if(!p.valid){window.toast('Kontrolli krediidi kogust ja sularaha summat');return false}
    saving=true;
    const btn=document.getElementById('creditSaveBtn');
    if(btn){btn.disabled=true;btn.textContent='Lisan krediiti…'}
    try{
      const result=await window.rpc('wod_add_credits',{
        p_user_id:uid,p_credits:p.qty,p_cash_cents:p.cash,p_note:note
      });
      // RPC annab uue saldo tagasi. Näita seda ka siis, kui järgnev värskendus
      // võrgu tõttu ebaõnnestub; ära saada krediidi lisamist uuesti.
      const returned=Number(result);
      if(Number.isSafeInteger(returned)&&returned>=0){
        const wallet=s.wallets.find(w=>w.user_id===uid);
        if(wallet)wallet.credits=returned;
        else s.wallets.push({user_id:uid,credits:returned});
      }
      s.modal='client';s.modalData=uid;
      await window.reloadData('Lisatud '+p.qty+' '+(p.qty===1?'krediit':'krediiti'));
      window.render();
      return true;
    }catch(error){
      window.toast(String(error?.message||'Krediidi lisamine ebaõnnestus'));
      return false;
    }finally{
      saving=false;
      if(btn?.isConnected){btn.disabled=false;btn.textContent='Kinnita krediidi lisamine'}
    }
  }
  function listCard(p){
    const base=previousCard(p);
    if(!window.isTrainer()||!validClient(p.user_id))return base;
    const qty=balance(p.user_id);
    const pending=(s.registrations||[]).filter(r=>r.user_id===p.user_id&&r.status==='waitlist').length;
    const stateText=qty===0?'Krediit otsas':qty<=2?'Krediiti vähe':'Krediit olemas';
    const cls=qty===0?'zero':qty<=2?'low':'good';
    const notice='<div class="cx-client-credit '+cls+'">'+
      '<span>'+stateText+'</span>'+
      '<strong>'+qty+' '+(qty===1?'treeningkord':'treeningkorda')+'</strong>'+
      (pending?'<small>'+pending+' ootenimekirjas</small>':'')+
      '</div>';
    const anchor='<div class="client-actions">';
    return base.includes(anchor)?base.replace(anchor,notice+anchor):base+notice;
  }
  function clientDetail(p){
    const base=previousDetail(p);
    if(!window.isTrainer()||!validClient(p.user_id))return base;
    const uid=p.user_id;
    const next=(s.registrations||[]).filter(r=>r.user_id===uid&&r.status==='waitlist'&&
      s.trainings.some(t=>t.id===r.training_id&&t.status==='published'&&Date.parse(t.starts_at)>Date.now())).length;
    const counts='<div class="cx-client-explainer">'+
      '<strong>Krediidi arvestus</strong>'+
      '<p>Kinnitatud registreerimine kasutab 1 krediidi. Ootenimekirjas krediit ei vähene; koha saamisel kasutatakse 1 krediit, kui kontol on piisavalt krediiti.</p>'+
      (next?'<span>'+next+' tulevast ootenimekirja registreeringut</span>':'')+
      '</div>';
    const marker='<div class="section"><h2>Krediidi ajalugu</h2>';
    return base.includes(marker)?base.replace(marker,counts+marker):counts+base;
  }
  window.renderModal=modal;
  window.clientCard=listCard;
  window.clientDetail=clientDetail;
  window.crossfitCredits={preview,setQty,submit,parseCash,validQty,form};
})();