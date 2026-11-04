// Rõuge CrossFit account requests without Supabase confirmation emails.
// Auth project is shared with Futbol: do NOT modify project-wide Confirm Email.
// An unconfirmed account is only created as a pending trainer approval request.
const ORIGIN = 'https://karlkirch.github.io';
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};
function reply(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store' }
  });
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POST_LIMIT = 2000;

async function hash(value: string, secret: string) {
  const payload = new TextEncoder().encode(secret + ':' + value);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async (req: Request) => {
  // This public endpoint uses server credentials. It must not trust a browser
  // claim to be authenticated; only CORS + independent database quotas apply.
  if (req.headers.get('Origin') !== ORIGIN) return reply(403, 'Ava Rõuge CrossFiti äpp.');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, 'Lubatud on ainult POST-päring.');
  const base = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !secret) return reply(503, 'Liitumisteenus ei ole ajutiselt saadaval.');
  if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    return reply(415, 'Vajalik on JSON-päring.');

  try {
    const raw = await req.text();
    if (raw.length > POST_LIMIT) return reply(413, 'Liitumistaotlus on liiga pikk.');
    let values: Record<string, unknown>;
    try { values = JSON.parse(raw); } catch { return reply(400, 'Vigane liitumistaotlus.'); }
    if (!values || typeof values !== 'object' || Array.isArray(values))
      return reply(400, 'Vigane liitumistaotlus.');

    const email = typeof values.email === 'string' ? values.email.trim().toLowerCase() : '';
    const password = typeof values.password === 'string' ? values.password : '';
    const name = typeof values.display_name === 'string' ? values.display_name.trim() : '';
    const reason = typeof values.join_reason === 'string' ? values.join_reason.trim() : '';
    if (email.length > 254 || !EMAIL.test(email))
      return reply(400, 'Sisesta korrektne e-posti aadress.');
    if (password.length < 8 || password.length > 128)
      return reply(400, 'Parool peab olema 8–128 tähemärki pikk.');
    if (name.length < 2 || name.length > 120 || /[\r\n<>]/.test(name))
      return reply(400, 'Sisesta ees- ja perekonnanimi.');
    if (reason.length > 300) return reply(400, 'Liitumise põhjendus on liiga pikk.');

    // Supabase's gateway appends a trusted forwarding hop. Avoid relying on
    // a client-supplied first X-Forwarded-For entry to set quotas.
    const forwarded = req.headers.get('x-forwarded-for') || '';
    const forwardingHops = forwarded.split(',').map(v => v.trim()).filter(Boolean);
    const connectingIp = req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') || forwardingHops.at(-1) || 'unknown';
    // Hash both identifiers using a server-only salt, storing no raw IP/email.
    const [ipHash, emailHash] = await Promise.all([
      hash(connectingIp, secret), hash(email, secret)
    ]);
    const admin = { 'apikey': secret, 'Authorization': 'Bearer ' + secret,
      'Content-Type': 'application/json' };
    const gate = await fetch(base + '/rest/v1/rpc/rcf_signup_try_slot', {
      method: 'POST', headers: admin,
      body: JSON.stringify({ p_ip_hash: ipHash, p_email_hash: emailHash })
    });
    if (!gate.ok) {
      // Do not log email, IP, authorization headers or API keys.
      // Status and PostgREST code are sufficient to diagnose quota failures.
      const diagnostic = await gate.json().catch(() => ({}));
      console.error('rcf-signup rate gate failed', {
        status: gate.status,
        code: String(diagnostic?.code || 'unknown').slice(0, 24)
      });
      return reply(503, 'Liitumistaotluste piirangut ei saanud kontrollida. Võta ühendust treeneriga.');
    }
    if (await gate.json() !== true)
      return reply(429, 'Liiga palju liitumiskatseid. Proovi hiljem uuesti või võta ühendust treeneriga.');

    // GoTrue Admin createUser does NOT send a signup verification email.
    // Keep the email unconfirmed until the already protected rcf-approve-join
    // function confirms it as part of the trainer's explicit approval.
    const created = await fetch(base + '/auth/v1/admin/users', {
      method: 'POST', headers: admin,
      body: JSON.stringify({ email, password, email_confirm: false,
        user_metadata: { display_name: name, join_reason: reason,
          app_identifier: 'rouge_crossfit' } })
    });
    if (!created.ok) {
      if (created.status === 422 || created.status === 409)
        return reply(409, 'Selle e-postiga konto võib juba olemas olla. Proovi sisse logida või võta ühendust treeneriga.');
      // Never echo GoTrue raw error details or authentication secrets.
      return reply(503, 'Kontot ei saanud luua. Võta ühendust treeneriga.');
    }
    const user = await created.json();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(String(user?.id || '')))
      return reply(503, 'Konto loomise vastus oli vigane.');

    // Signup database trigger creates pending profile, zero wallet and
    // trainer notification. Verify the result before saying it was sent.
    const profileResult = await fetch(
      base + '/rest/v1/wod_profiles?select=user_id,role,approval_status&user_id=eq.' + user.id,
      { headers: admin }
    );
    if (!profileResult.ok) return reply(503, 'Konto loodi, kuid liitumistaotluse olekut ei õnnestunud kontrollida. Võta ühendust treeneriga.');
    const profiles = await profileResult.json();
    if (profiles?.[0]?.role !== 'client' || profiles?.[0]?.approval_status !== 'pending')
      return reply(503, 'Konto loodi, kuid liitumistaotlus tuleb treeneril üle kontrollida.');

    return reply(200, 'Konto loodud. Liitumistaotlus jõudis treenerile. E-posti kinnituskirja ei saadeta. Pärast treeneri heakskiitu logi parooliga sisse.');
  } catch (error) {
    console.error('CrossFit signup failed', error instanceof Error ? error.name : 'unknown');
    return reply(503, 'Liitumisteenusega ei saanud ühendust. Proovi hiljem.');
  }
});
