'use strict';
(function(){
  const endpoint='https://aanxpugvehwtcwwpefwx.supabase.co/functions/v1/rcf-password-recovery';
  const form=document.getElementById('reset-form');
  const feedback=document.getElementById('reset-feedback');
  const button=document.getElementById('reset-submit');
  const success=document.getElementById('reset-success');
  if(!form||!feedback||!button||!success)return;
  let busy=false;
  function message(text,pending=false){
    feedback.textContent=text;
    feedback.classList.toggle('pending',pending);
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!form.reportValidity())return;
    const email=document.getElementById('reset-email').value.trim().toLowerCase();
    const code=document.getElementById('reset-code').value.trim();
    const newPassword=document.getElementById('reset-password').value;
    const confirm=document.getElementById('reset-confirm').value;
    if(newPassword!==confirm){message('Sisestatud paroolid ei ühti.');return;}
    if(newPassword.length<8){message('Parool peab olema vähemalt 8 tähemärki pikk.');return;}
    busy=true;
    button.disabled=true;
    button.textContent='Kontrollin taastekoodi…';
    message('Kontrollin taastekoodi ja uuendan parooli…',true);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(endpoint,{
        method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'redeem',email,code,new_password:newPassword}),
        signal:controller.signal
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){message(body.message||'Parooli taastamine ebaõnnestus. Küsi treenerilt uus kood.');return;}
      document.getElementById('reset-password').value='';
      document.getElementById('reset-confirm').value='';
      document.getElementById('reset-code').value='';
      form.hidden=true;
      success.hidden=false;
      message('');
      success.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){
      message(e.name==='AbortError'
        ?'Ühendus aegus. Kontrolli ühendust ja proovi sisselogimist. Vajadusel küsi treenerilt uus kood.'
        :'Paroolitaasteteenusega ei saadud ühendust. Proovi hiljem.');
    }finally{
      clearTimeout(timeout);
      busy=false;
      button.disabled=false;
      button.textContent='Uuenda parool';
    }
  });
})();
