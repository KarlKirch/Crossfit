// Rõuge CrossFit: treener kinnitab liitumise; vanad kinnitamata kontod ei vaja enam meililinki.
// Gateway kontrollib kasutaja JWT-d ja server kontrollib lisaks treeneri õigusi.
const ORIGIN = 'https://karlkirch.github.io';
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
function reply(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req: Request) => {
  if (req.headers.get('Origin') !== ORIGIN) return reply(403, 'Ava Rõuge CrossFiti äpp.');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, 'Lubatud on ainult POST-päring.');
  const base = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!base || !secret || !anon) return reply(503, 'Kinnitamise teenus ei ole ajutiselt saadaval.');
  const token = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/.test(token)) return reply(401, 'Palun logi uuesti sisse.');
  try {
    const raw = await req.text();
    if (raw.length > 1000) return reply(413, 'Päring on liiga pikk.');
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return reply(400, 'Vigane päring.'); }
    const clientId = typeof body.client_id === 'string' ? body.client_id : '';
    if (!uuid.test(clientId)) return reply(400, 'Kliendi tunnus on vigane.');
    const userResponse = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: token },
    });
    if (!userResponse.ok) return reply(401, 'Sessioon aegus. Logi uuesti sisse.');
    const user = await userResponse.json();
    if (!uuid.test(user?.id) || user.is_anonymous || user.id === clientId)
      return reply(403, 'Kinnitamine ei ole lubatud.');
    const adminHeaders = { apikey: secret, Authorization: 'Bearer ' + secret,
      'Content-Type': 'application/json' };
    const coachRes = await fetch(base + '/rest/v1/wod_profiles?select=role,approval_status&user_id=eq.' + user.id, {
      headers: adminHeaders,
    });
    if (!coachRes.ok) return reply(503, 'Treeneri õigusi ei saanud kontrollida.');
    const coach = await coachRes.json();
    if (coach?.[0]?.role !== 'trainer' || coach?.[0]?.approval_status !== 'approved')
      return reply(403, 'Liitumist saab kinnitada ainult treener.');
    const [targetRes, removedRes] = await Promise.all([
      fetch(base + '/rest/v1/wod_profiles?select=role,approval_status&user_id=eq.' + clientId, {
        headers: adminHeaders,
      }),
      fetch(base + '/rest/v1/wod_removed_clients?select=user_id&user_id=eq.' + clientId, {
        headers: adminHeaders,
      }),
    ]);
    if (!targetRes.ok || !removedRes.ok) return reply(503, 'Kliendi olekut ei saanud kontrollida.');
    const target = await targetRes.json(), removed = await removedRes.json();
    if (removed?.length || target?.[0]?.role !== 'client' ||
        !['pending', 'rejected'].includes(target?.[0]?.approval_status))
      return reply(409, 'Liitumistaotlus puudub või on juba läbi vaadatud.');
    // Auth projekt on ühine. Kinnitame ainult olemasoleva CrossFiti taotleja,
    // mitte kunagi ei lülita kogu Supabase'i e-posti kinnitamise nõuet välja.
    const confirm = await fetch(base + '/auth/v1/admin/users/' + clientId, {
      method: 'PUT', headers: adminHeaders, body: JSON.stringify({ email_confirm: true }),
    });
    if (!confirm.ok) return reply(503, 'Kliendi sisselogimist ei saanud avada. Proovi uuesti.');
    // Lõplik liitumine toimub vana treeneriõigusi kontrolliva RPC kaudu.
    const approved = await fetch(base + '/rest/v1/rpc/wod_review_join_request', {
      method: 'POST',
      headers: { apikey: anon, Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_client_id: clientId, p_approve: true }),
    });
    if (!approved.ok) return reply(409, 'Liitumise kinnitamine ebaõnnestus. Värskenda nimekirja ja proovi uuesti.');
    return reply(200, 'Kliendi konto kinnitatud. Nüüd saab kasutaja parooliga sisse logida.');
  } catch (_) {
    return reply(503, 'Kinnitamise teenusega ei saanud ühendust. Proovi uuesti.');
  }
});
