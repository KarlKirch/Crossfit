'use strict';
// WOD AI photo transcription. Secrets remain in Supabase Edge Function.
(function(){
  const BASE='https://aanxpugvehwtcwwpefwx.supabase.co/functions/v1/rcf-wod-vision';
  const KEY='sb_publishable_ICMR8EF0LK69VjfVRWe0ew_120LIV7A';
  let lastCheck=null,lastChecked=0,activeRequest=null;
  async function availability(force=false){
    if(!force&&lastCheck&&Date.now()-lastChecked<60000)return lastCheck;
    try{
      const res=await fetch(BASE,{method:'GET',headers:{apikey:KEY},
        cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!res.ok)throw new Error('AI teenus ei vasta ('+res.status+').');
      const info=await res.json();
      lastCheck={configured:info.configured===true,model:info.model||''};
      lastChecked=Date.now();
      return lastCheck;
    }catch(error){
      console.warn('WOD AI availability check failed',error);
      return {configured:false,reason:'unavailable'};
    }
  }
  async function read(id){
    const numeric=Number(id);
    if(!Number.isSafeInteger(numeric)||numeric<1)
      throw new Error('WOD-i tunnus on vigane.');
    const status=await availability();
    if(!status.configured)return {text:'',reason:status.reason||'not_configured'};
    const token=window.state?.session?.access_token;
    if(!token)throw new Error('Sisselogimine aegus. Logi uuesti sisse.');
    if(activeRequest)return {text:'',reason:'busy'};
    activeRequest=(async()=>{
      const res=await fetch(BASE,{method:'POST',headers:{
        apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'
      },body:JSON.stringify({entry_id:numeric}),cache:'no-store',
      signal:AbortSignal.timeout(65000)});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(payload.message||'AI pildilugemine ebaõnnestus.');
      return {text:String(payload.text||'').trim(),warnings:String(payload.warnings||'').trim(),model:payload.model};
    })();
    try{return await activeRequest}finally{activeRequest=null}
  }
  window.crossfitWodVision={availability,read};
})();
