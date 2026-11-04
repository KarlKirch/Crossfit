// Rõuge CrossFit: treener annab ühekordse taastekoodi, klient määrab uue parooli.
// Ühist Supabase Auth projekti kasutatakse ka Futbolis; selle kontosid ei muudeta.
// verify_jwt=false ONLY for the redeem action; the issue action validates JWT + trainer role.
const ORIGIN = 'https://karlkirch.github.io';
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function reply(status: number, message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({message, ...extra}), {
    status, headers: {...cors,'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store'}
  });
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, x=>x.toString(16).padStart(2,'0')).join('');
}
async function hmac(secret: string, text: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(text))));
}
async function json(req: Request): Promise<Record<string,unknown>|null> {
  if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return null;
  const text = await req.text();
  if (text.length > 2200) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {return null;}
}
function rpcHeaders(secret:string) {
  return {'apikey':secret,'Authorization':'Bearer '+secret,
    'Content-Type':'application/json'};
}
async function rpc(base:string,secret:string,name:string,body:Record<string,unknown>) {
  const response = await fetch(base+'/rest/v1/rpc/'+name,
    {method:'POST',headers:rpcHeaders(secret),body:JSON.stringify(body)});
  if (!response.ok) {
    console.error('RCF recovery RPC failed',name,response.status);
    return {ok:false,value:null};
  }
  return {ok:true,value:await response.json()};
}
Deno.serve(async (req: Request)=>{
  if (req.headers.get('Origin') !== ORIGIN) return reply(403,'Ava Rõuge CrossFiti äpp.');
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (req.method !== 'POST') return reply(405,'Lubatud on ainult POST-päring.');
  const base = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!base || !secret || !anon) return reply(503,'Paroolitaaste pole ajutiselt saadaval.');
  try {
    const body = await json(req);
    if (!body) return reply(400,'Vigane taastepäring.');
    const action = body.action;
    if (action === 'issue') {
      const bearer = req.headers.get('Authorization') || '';
      const clientId = typeof body.client_id === 'string' ? body.client_id : '';
      if (!/^Bearer\s+\S+$/.test(bearer)) return reply(401,'Palun logi treenerina sisse.');
      if (!UUID.test(clientId)) return reply(400,'Kliendi tunnus on vigane.');
      const auth = await fetch(base+'/auth/v1/user',
        {headers:{apikey:anon,Authorization:bearer}});
      if (!auth.ok) return reply(401,'Sessioon aegus. Logi uuesti sisse.');
      const user = await auth.json();
      if (!UUID.test(user?.id) || user.id === clientId || user.is_anonymous)
        return reply(403,'Koodi väljastamine ei ole lubatud.');
      const coachCheck = await fetch(base+'/rest/v1/wod_profiles?select=role,approval_status&user_id=eq.'+user.id,
        {headers:rpcHeaders(secret)});
      if (!coachCheck.ok) return reply(503,'Treeneri õiguste kontroll ebaõnnestus.');
      const coaches = await coachCheck.json();
      if (coaches?.[0]?.role !== 'trainer' || coaches?.[0]?.approval_status !== 'approved')
        return reply(403,'Taastekoodi saab väljastada ainult kinnitatud treener.');
      const targetRes = await fetch(base+'/auth/v1/admin/users/'+clientId,
        {headers:rpcHeaders(secret)});
      if (!targetRes.ok) return reply(409,'Selle kliendi kontole ei saa koodi väljastada.');
      const target = await targetRes.json();
      const email = String(target?.email||'').trim().toLowerCase();
      if (!EMAIL.test(email)) return reply(409,'Kliendil puudub korrektne e-posti aadress.');
      // 16 random hex characters = 64 bits, max 5 wrong guesses per code.
      const raw = hex(crypto.getRandomValues(new Uint8Array(8))).toUpperCase();
      const hashed = await hmac(secret,'rcf-reset-v1:'+email+':'+raw);
      const db = await rpc(base,secret,'rcf_password_recovery_issue',
        {p_user_id:clientId,p_code_hash:hashed,p_issued_by:user.id});
      if (!db.ok) return reply(503,'Taastekoodi salvestamine ebaõnnestus.');
      if (db.value !== true)
        return reply(429,'Koodi ei saanud väljastada. Kui eelmine kood loodi äsja, proovi minuti pärast.');
      return reply(200,'Taastekood loodud. Edasta see kliendile eraldi sõnumiga.',
        {code:raw.match(/.{4}/g)?.join('-'),expires_in_hours:24});
    }
    if (action === 'redeem') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const raw = typeof body.code === 'string'
        ? body.code.toUpperCase().replace(/[\s-]/g,'') : '';
      const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
      if (email.length > 254 || !EMAIL.test(email) || !/^[A-F0-9]{16}$/.test(raw))
        return reply(400,'Sisesta korrektne e-post ja 16-märgiline taastekood.');
      if (newPassword.length < 8 || newPassword.length > 128)
        return reply(400,'Uus parool peab olema 8–128 tähemärki pikk.');
      const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') ||
        (req.headers.get('x-forwarded-for')||'').split(',').map(s=>s.trim()).filter(Boolean).at(-1) || 'unknown';
      const [ipHash,emailHash] = await Promise.all([
        hmac(secret,'rcf-reset-ip:'+ip),hmac(secret,'rcf-reset-email:'+email)]);
      const gate = await rpc(base,secret,'rcf_password_recovery_allow_attempt',
        {p_ip_hash:ipHash,p_email_hash:emailHash});
      if (!gate.ok) return reply(503,'Taastekatsete piirangut ei saanud kontrollida.');
      if (gate.value !== true) return reply(429,'Liiga palju taastekatseid. Proovi hiljem või küsi treenerilt uus kood.');
      const codeHash = await hmac(secret,'rcf-reset-v1:'+email+':'+raw);
      const claimed = await rpc(base,secret,'rcf_password_recovery_claim',
        {p_email:email,p_code_hash:codeHash});
      if (!claimed.ok) return reply(503,'Taastekoodi kontrollimine ebaõnnestus.');
      if (!UUID.test(claimed.value))
        return reply(400,'Taastekood on vigane, aegunud või juba kasutatud. Küsi vajadusel treenerilt uus kood.');
      const updated = await fetch(base+'/auth/v1/admin/users/'+claimed.value,{
        method:'PUT',headers:rpcHeaders(secret),body:JSON.stringify({password:newPassword})
      });
      if (!updated.ok) {
        console.error('RCF recovery GoTrue update failed',updated.status);
        return reply(503,'Parooli ei õnnestunud uuendada. Palu treenerilt uus taastekood.');
      }
      return reply(200,'Parool uuendatud. Nüüd saad uue parooliga sisse logida.');
    }
    return reply(400,'Tundmatu taastetoiming.');
  } catch(error) {
    console.error('RCF recovery error',error instanceof Error ? error.name : 'unknown');
    return reply(503,'Paroolitaasteteenusega ei saadud ühendust. Proovi hiljem.');
  }
});
