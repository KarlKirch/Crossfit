'use strict';

/* Kohapealne sularahabroneering: kinnitab koha või lisab ootenimekirja.
 * Treener kinnitab makse eraldi pärast raha vastuvõtmist.
 */
(function(){
  const s=window.state;
  let busy=false;
  async function register(id){
    const tid=Number(id);
    if(busy||!Number.isSafeInteger(tid)||tid<=0)return false;
    if(s.clientPreview){
      window.toast('Kliendieelvaade on kirjutuskaitstud.');
      return false;
    }
    const t=(s.trainings||[]).find(x=>Number(x.id)===tid);
    if(!t||t.status!=='published'||Date.parse(t.starts_at)<=Date.now()){
      window.toast('Treening pole registreerimiseks avatud.');
      return false;
    }
    const price=(Number(t.price_cents)||0)/100;
    const money=new Intl.NumberFormat('et-EE',{style:'currency',currency:'EUR'}).format(price);
    const full=window.confirmedFor(tid).length>=Number(t.capacity);
    if(!window.confirm('Kas '+(full?'liituda ootenimekirjaga':'kinnitada treeningukoht')+
      ' ja tasuda '+money+' kohapeal sularahas?')){
      return false;
    }
    busy=true;
    try{
      const result=await window.rpc('wod_register_cash',{p_training_id:tid});
      await window.reloadData(result?.[0]?.registration_status==='waitlist'?
        'Oled ootenimekirjas. Tasud, kui saad koha.':'Koht kinnitatud. Tasud kohapeal treenerile.');
      // Ära ava treeningu vaadet uuesti, kui klient jõudis vahepeal vestlusse.
      if(s.modal==='training'&&Number(s.modalData)===tid)window.render();
      return true;
    }catch(error){
      window.toast(error?.message||'Sularahabroneering ebaõnnestus.');
      return false;
    }finally{busy=false}
  }
  window.crossfitCash={register};
})();