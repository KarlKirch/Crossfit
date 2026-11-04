'use strict';
(function(){
  const endpoint='https://aanxpugvehwtcwwpefwx.supabase.co/functions/v1/rcf-signup';
  const form=document.getElementById('join-form');
  const button=document.getElementById('join-submit');
  const feedback=document.getElementById('join-feedback');
  const success=document.getElementById('join-success');
  if(!form||!button||!feedback||!success)return;
  let busy=false;
  function message(text,pending=false){
    feedback.textContent=text;
    feedback.classList.toggle('pending',pending);
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy)return;
    if(!form.reportValidity())return;
    const name=document.getElementById('join-name').value.trim();
    const email=document.getElementById('join-email').value.trim().toLowerCase();
    const password=document.getElementById('join-password').value;
    const reason=document.getElementById('join-reason').value.trim();
    if(name.length<2||password.length<8){
      message('Sisesta ees- ja perekonnanimi ning vähemalt 8 tähemärgiga parool.');
      return;
    }
    busy=true;
    button.disabled=true;
    button.textContent='Saadan taotlust…';
    message('Kontrollin ja saadan liitumistaotluse…',true);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(endpoint,{
        method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email,password,display_name:name,join_reason:reason}),
        signal:controller.signal
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        if(response.status===409)message(body.message||'Selle e-postiga konto on juba olemas. Proovi sisse logida.');
        else if(response.status===429)message(body.message||'Liiga palju liitumiskatseid. Võta ühendust treeneriga.');
        else message(body.message||'Liitumine ei õnnestunud. Võta ühendust treeneriga.');
        return;
      }
      form.hidden=true;
      success.hidden=false;
      document.getElementById('join-password').value='';
      message('');
      success.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){
      message(e.name==='AbortError'
        ?'Ühendus võttis liiga kaua aega. Kontrolli ühendust ja küsi treenerilt, kas taotlus jõudis kohale, enne kui uuesti proovid.'
        :'Liitumisteenusega ei saadud ühendust. Kontrolli internetti ja proovi uuesti.');
    }finally{
      clearTimeout(timeout);
      busy=false;
      button.disabled=false;
      button.textContent='Saada liitumistaotlus';
    }
  });
})();
