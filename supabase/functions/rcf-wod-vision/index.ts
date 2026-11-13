// Paid WOD photo AI processing disabled at user's request.
// Photos are retained, and WOD text is optional and manually entered.
const headers={
  'Access-Control-Allow-Origin':'https://karlkirch.github.io',
  'Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
  'Cache-Control':'no-store',
  'Content-Type':'application/json; charset=utf-8',
  'Vary':'Origin'
};
Deno.serve((req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method==='GET')return Response.json(
    {service:'WOD Vision',configured:false,enabled:false,message:'Tasuline AI-pildilugemine on välja lülitatud.'},
    {headers}
  );
  return Response.json(
    {code:'AI_DISABLED',message:'Tasuline pildilugemine on välja lülitatud. Lisa WOD-i kava soovi korral käsitsi.'},
    {status:410,headers}
  );
});
