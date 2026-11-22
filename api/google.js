// Google: sign-in (owner only), Calendar events, Meet transcripts. Read-only; nothing is sent to Google.
import { handler, requireOwner, HttpError, audit, adminClient } from './_lib/http.js';
import { getSecret } from './_lib/providers.js';
import { encrypt, last4 } from './_lib/crypto.js';
import { googleAccess } from './_lib/context.js';
import { redirectUri, signState, verifyState, authUrl, exchangeCode, calendarEvents, meetRecent, meetTranscript } from './_lib/google.js';
import { logError } from './_lib/errors.js';

export const config = { maxDuration: 60 };

const api = handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req, { ownerOnly: ['start', 'disconnect'].includes(body.action) });
  const one = async (q) => { const { data, error } = await q; if (error) throw new HttpError(400, error.message); return data; };

  if (body.action === 'start') {
    const conn = await one(db.from('connections').select('config').eq('provider', 'google').maybeSingle());
    if (!conn?.config?.client_id) throw new HttpError(400, 'Save your Google client ID and secret in Connections first');
    await getSecret(admin, user.id, 'google', 'client_secret');
    return { url: authUrl({ clientId: conn.config.client_id, redirect: redirectUri(req), state: signState(user.id) }), redirect: redirectUri(req) };
  }

  if (body.action === 'disconnect') {
    await admin.from('provider_keys').delete().eq('owner_id', user.id).eq('provider', 'google').eq('field', 'refresh_token');
    await audit(db, user.id, 'google_signed_out', 'provider', 'google');
    return { ok: true };
  }

  const token = await googleAccess(db, admin, user.id).catch((e) => { throw new HttpError(e.status || 400, e.message); });

  if (body.action === 'calendar') {
    const days = Math.min(Math.max(+body.days || 7, 1), 31);
    return { events: await calendarEvents(token, { days }).catch((e) => { throw new HttpError(e.status || 502, e.message); }) };
  }

  if (body.action === 'meet_list') {
    const calls = await meetRecent(token).catch((e) => { throw new HttpError(e.status || 502, e.message); });
    const have = new Set((await one(db.from('calls').select('external_id').eq('source', 'google_meet'))).map((c) => c.external_id));
    return { calls: calls.map((c) => ({ ...c, imported: have.has(c.transcript) })) };
  }

  if (body.action === 'meet_import') {
    const rec = String(body.record || ''), tr = String(body.transcript || '');
    if (!/^conferenceRecords\/[\w-]+$/.test(rec) || !tr.startsWith(rec + '/transcripts/') || !/^[\w/-]+$/.test(tr)) throw new HttpError(400, 'Invalid Meet transcript');
    const t = await meetTranscript(token, { record: rec, transcript: tr }).catch((e) => { throw new HttpError(e.status || 502, e.message); });
    const kind = ['sales', 'coaching', 'team', 'other'].includes(body.kind) ? body.kind : 'sales';
    const row = await one(db.from('calls').upsert({
      owner_id: user.id, title: String(body.title || 'Meet call').slice(0, 200), kind, occurred_at: body.start || null, source: 'google_meet', external_id: tr,
      transcript: t.text, speakers: t.speakers, duration_min: t.duration_min, status: 'new', authored_by: 'me',
    }, { onConflict: 'owner_id,external_id', ignoreDuplicates: true }).select('id'));
    return { call_id: row[0]?.id || null, duplicate: !row.length, chars: t.text.length };
  }

  throw new HttpError(400, 'Unknown action');
});

// Google sends the browser back here after consent (GET, no bearer token). The signed state names the owner.
async function callback(req, res) {
  const url = new URL(req.url, 'https://x');
  const back = (msg) => { res.statusCode = 302; res.setHeader('Location', `/#connections?google=${encodeURIComponent(msg)}`); res.setHeader('Cache-Control', 'no-store'); res.end(); };
  if (url.searchParams.get('error')) return back(url.searchParams.get('error') === 'access_denied' ? 'denied' : 'error');
  let admin = null, ownerId = null;
  try {
    ownerId = verifyState(url.searchParams.get('state'));
    admin = adminClient();
    const { data: conn } = await admin.from('connections').select('config').eq('owner_id', ownerId).eq('provider', 'google').maybeSingle();
    const clientSecret = await getSecret(admin, ownerId, 'google', 'client_secret');
    const tokens = await exchangeCode({ clientId: conn?.config?.client_id, clientSecret, code: url.searchParams.get('code'), redirect: redirectUri(req) });
    if (!tokens.refresh_token) return back('no_refresh');
    const { error } = await admin.from('provider_keys').upsert({ owner_id: ownerId, provider: 'google', field: 'refresh_token', ...encrypt(tokens.refresh_token), last4: last4(tokens.refresh_token), status: 'ok', test_message: 'Signed in with Google' }, { onConflict: 'owner_id,provider,field' });
    if (error) throw error;
    await admin.from('audit_log').insert({ owner_id: ownerId, action: 'google_signed_in', entity: 'provider', entity_id: 'google' });
    return back('connected');
  } catch (e) {
    await logError(admin, { ownerId, source: 'server', route: '/api/google callback', status: e.status || 500, error: e });
    return back(e.status === 400 ? `error:${String(e.message).slice(0, 160)}` : 'error');
  }
}

export default async function google(req, res) {
  if (req.method === 'GET') return callback(req, res);
  return api(req, res);
}
