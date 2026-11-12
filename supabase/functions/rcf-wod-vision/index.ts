// Rõuge CrossFit: vision-model transcription of saved WOD photos.
// OpenAI API key is read ONLY from Supabase Edge Function secrets.
const ORIGIN = 'https://karlkirch.github.io';
const headers = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};
const respond = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });
const model = Deno.env.get('WOD_VISION_MODEL') || 'gpt-5.4-mini';
function serverConfig() {
  const base = Deno.env.get('SUPABASE_URL') || '';
  const pub = Deno.env.get('SUPABASE_ANON_KEY')
    || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || '';
  return { base, pub, service };
}
const getText = (data: any): string => {
  const blocks: string[] = [];
  for (const item of data?.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string')
        blocks.push(content.text);
    }
  }
  return blocks.join('\n').trim();
};
const tooManyArtifacts = (text: string) => (text.match(/[©¢§¤~\\|]/g) || []).length >= 5;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (origin && origin !== ORIGIN) return respond(403, { code: 'ORIGIN_DENIED', message: 'Ava Rõuge CrossFiti rakendus.' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method === 'GET') {
    return respond(200, { configured: Boolean(Deno.env.get('OPENAI_API_KEY')), service: 'WOD Vision', model });
  }
  if (req.method !== 'POST') return respond(405, { code: 'METHOD_NOT_ALLOWED', message: 'Lubatud on ainult POST.' });
  const bearer = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(bearer)) return respond(401, { code: 'AUTH_REQUIRED', message: 'Logi rakendusse sisse.' });
  const {base,pub,service} = serverConfig();
  if (!base || !pub || !service) return respond(503, { code: 'BACKEND_UNAVAILABLE', message: 'Serveri autentimine pole seadistatud.' });
  const aiKey = Deno.env.get('OPENAI_API_KEY');
  if (!aiKey) return respond(503, { code: 'AI_NOT_CONFIGURED', message: 'Tehisintellekti pildilugemine vajab serveris OPENAI_API_KEY seadistamist.' });
  let input: any;
  try {
    const raw = await req.text();
    if (raw.length > 1000) return respond(413, { code: 'TOO_LARGE', message: 'Päring on liiga suur.' });
    input = JSON.parse(raw);
  } catch {
    return respond(400, { code: 'INVALID_INPUT', message: 'Vigane päring.' });
  }
  const entryId = Number(input?.entry_id);
  if (!Number.isSafeInteger(entryId) || entryId < 1) return respond(400, { code: 'INVALID_ID', message: 'WOD-i tunnus on vigane.' });
  const adminHeaders = { apikey:service, Authorization:'Bearer '+service };
  try {
    const userResp = await fetch(base+'/auth/v1/user',{
      headers:{apikey:pub,Authorization:bearer}, signal:AbortSignal.timeout(10000),
    });
    if (!userResp.ok) return respond(401, { code:'SESSION_EXPIRED', message:'Sisselogimine aegus. Logi uuesti sisse.' });
    const user = await userResp.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(user?.id||'')) || user?.is_anonymous)
      return respond(401,{code:'AUTH_REQUIRED',message:'Sisselogimine puudub.'});
    const coachResp = await fetch(base+'/rest/v1/wod_profiles?select=role,approval_status&user_id=eq.'+encodeURIComponent(user.id),{
      headers:adminHeaders,signal:AbortSignal.timeout(10000),
    });
    if (!coachResp.ok) return respond(503,{code:'ROLE_UNAVAILABLE',message:'Treeneri õigusi ei saa kontrollida.'});
    const profiles = await coachResp.json();
    if (profiles?.[0]?.role !== 'trainer' || profiles?.[0]?.approval_status !== 'approved')
      return respond(403,{code:'FORBIDDEN',message:'Fotolt WOD-i lugemine on lubatud ainult kinnitatud treenerile.'});
    const entryResp = await fetch(base+'/rest/v1/wod_bank_entries?select=id,image_path,status&id=eq.'+entryId,{
      headers:adminHeaders,signal:AbortSignal.timeout(10000),
    });
    if (!entryResp.ok) return respond(503,{code:'ENTRY_UNAVAILABLE',message:'WOD-i kirjet ei saa laadida.'});
    const entry = (await entryResp.json())?.[0];
    if (!entry?.image_path || !String(entry.image_path).includes('/'))
      return respond(404,{code:'PHOTO_MISSING',message:'WOD-i originaalfotot ei leitud.'});
    const safePath=String(entry.image_path).split('/').map(encodeURIComponent).join('/');
    const imgResp = await fetch(base+'/storage/v1/object/authenticated/wod-bank/'+safePath,{
      headers:adminHeaders,signal:AbortSignal.timeout(15000),
    });
    if (!imgResp.ok) return respond(404,{code:'PHOTO_UNAVAILABLE',message:'WOD-i fotot ei õnnestunud avada.'});
    const contentType=imgResp.headers.get('content-type')||'';
    const ext=String(entry.image_path).split('.').pop()?.toLowerCase();
    const mime = /image\/(jpeg|png|webp)/i.test(contentType) ? contentType.split(';')[0].toLowerCase()
      : ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'} as Record<string,string>)[ext||''];
    if (!mime) return respond(422,{code:'FORMAT_UNSUPPORTED',message:'Tehisintellekti pildilugemiseks kasuta JPG, PNG või WebP fotot.'});
    const bytes = new Uint8Array(await imgResp.arrayBuffer());
    if (bytes.byteLength < 128 || bytes.byteLength > 18 * 1024 * 1024)
      return respond(413,{code:'PHOTO_TOO_LARGE',message:'Foto peab olema kuni 18 MB.'});
    // Process the saved photograph, not an arbitrary caller-provided URL.
    const parts: string[]=[];
    for(let i=0;i<bytes.length;i+=16384){
      parts.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
    }
    const dataUrl='data:'+mime+';base64,'+btoa(parts.join(''));
    const payload={
      model,
      store:false,
      max_output_tokens:1600,
      instructions:
        'You are transcribing a CrossFit-style workout board photo into an Estonian gym app. '+
        'Read visible handwritten and printed workout instructions from the image, including all exercises, sets, repetitions, times, distances and weights. '+
        'Keep original exercise names, section headings, line breaks and numeric values accurately. '+
        'Do not interpret names, results, leaderboards, personal data or attendance as part of the workout. '+
        'Do NOT invent exercises, repetitions or numbers. Mark illegible segments [ebaselge] in place. '+
        'If the workout cannot be read reliably, set readable=false and workout_text to empty. '+
        'Return JSON only following the schema.',
      input:[{
        role:'user',
        content:[
          {type:'input_text',text:'Transcribe this workout exactly as readable from the board. Use [ebaselge] for truly unclear parts.'},
          {type:'input_image',image_url:dataUrl,detail:'original'}
        ]
      }],
      text:{format:{
        type:'json_schema',name:'wod_transcription',strict:true,
        schema:{type:'object',properties:{
          readable:{type:'boolean'},
          workout_text:{type:'string'},
          warnings:{type:'string'}
        },required:['readable','workout_text','warnings'],additionalProperties:false}
      }}
    };
    const aiResp=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:'Bearer '+aiKey,'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(55000),
    });
    const result=await aiResp.json().catch(()=>({}));
    if(!aiResp.ok){
      const code=aiResp.status===429?'AI_LIMIT':aiResp.status===401?'AI_KEY_INVALID':'AI_UNAVAILABLE';
      const message=code==='AI_LIMIT'?'AI teenuse kasutuslimiit või krediit on täis.'
        :code==='AI_KEY_INVALID'?'AI teenuse API võti on vigane.'
        :'AI pildilugemine ei vastanud. Proovi uuesti.';
      return respond(503,{code,message});
    }
    let parsed:any;
    try{parsed=JSON.parse(getText(result));}
    catch{return respond(502,{code:'AI_INVALID_RESULT',message:'Tehisintellekti tulemus polnud loetav. Proovi uuesti.'});}
    const workout=String(parsed?.workout_text||'').replace(/\r/g,'').trim();
    if(!parsed?.readable || workout.length<8 || tooManyArtifacts(workout))
      return respond(422,{code:'NOT_READABLE',message:'Foto käsikirja ei õnnestunud piisavalt täpselt lugeda.'});
    return respond(200,{text:workout,warnings:String(parsed?.warnings||'').slice(0,600),model});
  } catch(error){
    console.error('WOD vision service failed',error instanceof Error?error.message:'unknown');
    return respond(503,{code:'VISION_UNAVAILABLE',message:'AI pildilugemisega ei õnnestunud ühendust saada. Proovi uuesti.'});
  }
});
