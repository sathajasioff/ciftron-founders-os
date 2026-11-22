// Provider keys: save (encrypted), list status, test, remove. Keys never go back to the browser.
import { handler, requireOwner, HttpError, audit } from './_lib/http.js';
import { encrypt, last4 } from './_lib/crypto.js';
import { PROVIDERS, testProvider, getSecret } from './_lib/providers.js';
import { decrypt } from './_lib/crypto.js';
import { validateConnection, safeGet } from './_lib/connect.js';

export default handler(['GET', 'POST', 'DELETE'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req, { ownerOnly: req.method !== 'GET' });

  if (req.method === 'GET') {
    const [{ data: keys, error }, { data: conns }] = await Promise.all([
      admin.from('provider_keys').select('provider, field, last4, status, test_message, last_tested_at, updated_at').eq('owner_id', user.id),
      db.from('connections').select('provider, config, enabled'),
    ]);
    if (error) throw error;
    const custom = keys.filter((k) => k.provider.startsWith('custom:')).map((k) => ({ id: k.provider.slice(7), last4: k.last4 }));
    return {
      custom,
      providers: Object.entries(PROVIDERS).map(([id, p]) => {
        const ks = keys.filter((k) => k.provider === id);
        const conn = (conns || []).find((c) => c.provider === id);
        const connected = p.secret.every((f) => ks.some((k) => k.field === f));
        return {
          id, name: p.name, connected, phase: p.phase || null, ...(id === 'google' ? { linked: ks.some((k) => k.field === 'refresh_token') } : {}),
          status: ks.some((k) => k.status === 'error') ? 'error' : ks.every((k) => k.status === 'ok') && ks.length ? 'ok' : connected ? 'untested' : 'none',
          last4: ks.filter((k) => k.field !== 'refresh_token').map((k) => k.last4).filter(Boolean)[0] || null,
          test_message: ks[0]?.test_message || null,
          last_tested_at: ks[0]?.last_tested_at || null,
          fields: { secret: p.secret, plain: p.plain },
          config: conn?.config || {},
        };
      }),
    };
  }

  // Custom read-only API connections (owner only). The key is stored encrypted under provider 'custom:<id>'.
  if (String(body.action || '').startsWith('custom_')) return customConnection(body, { user, db, admin });

  const p = PROVIDERS[body.provider];
  if (!p) throw new HttpError(400, 'Unknown provider');

  if (req.method === 'DELETE') {
    await admin.from('provider_keys').delete().eq('owner_id', user.id).eq('provider', body.provider);
    await db.from('connections').delete().eq('provider', body.provider);
    await audit(db, user.id, 'key_removed', 'provider', body.provider);
    return { ok: true };
  }

  if (body.action === 'test') {
    const secrets = {};
    for (const f of p.secret) secrets[f] = await getSecret(admin, user.id, body.provider, f);
    if (body.provider === 'google') { try { secrets.refresh_token = await getSecret(admin, user.id, 'google', 'refresh_token'); } catch { /* not signed in yet */ } }
    const { data: conn } = await db.from('connections').select('config').eq('provider', body.provider).maybeSingle();
    const r = await testProvider(body.provider, secrets, conn?.config || {});
    const status = r.deferred ? 'untested' : r.ok ? 'ok' : 'error';
    await admin.from('provider_keys').update({ status, test_message: r.message, last_tested_at: new Date().toISOString() })
      .eq('owner_id', user.id).eq('provider', body.provider);
    return { ok: r.ok, status, message: r.message };
  }

  // Save. Blank secret fields keep the stored value, so plain settings can change alone.
  const values = body.values || {};
  for (const f of p.secret) {
    const v = typeof values[f] === 'string' ? values[f].trim() : '';
    if (!v) continue;
    if (v.length > 4000) throw new HttpError(400, 'That key is too long');
    const enc = encrypt(v);
    const { error } = await admin.from('provider_keys').upsert(
      { owner_id: user.id, provider: body.provider, field: f, ...enc, last4: last4(v), status: 'untested', test_message: null },
      { onConflict: 'owner_id,provider,field' });
    if (error) throw error;
  }
  if (p.plain.length) {
    const config = {};
    for (const f of p.plain) if (typeof values[f] === 'string') config[f] = values[f].trim().slice(0, 500);
    const { error } = await db.from('connections').upsert({ owner_id: user.id, provider: body.provider, config }, { onConflict: 'owner_id,provider' });
    if (error) throw error;
  }
  await audit(db, user.id, 'key_saved', 'provider', body.provider);
  return { ok: true };
});

async function customConnection(body, { user, db, admin }) {
  const one = async (q) => { const { data, error } = await q; if (error) throw new HttpError(400, error.message); return data; };
  const kp = (id) => `custom:${id}`;
  if (body.action === 'custom_save') {
    let c;
    try { c = validateConnection(body.connection); } catch (e) { throw new HttpError(400, e.message); }
    let row;
    if (body.id) {
      const cur = await one(db.from('custom_connections').select('id, version').eq('id', String(body.id)).maybeSingle());
      if (!cur) throw new HttpError(404, 'Connection not found');
      row = await one(db.from('custom_connections').update({ ...c, version: cur.version + 1, last_status: null, last_message: null }).eq('id', cur.id).eq('version', cur.version).select('id').maybeSingle());
      if (!row) throw new HttpError(409, 'Changed somewhere else. Reload and try again.');
    } else {
      row = await one(db.from('custom_connections').insert({ owner_id: user.id, ...c, version: 1 }).select('id').single());
    }
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    if (key) {
      if (key.length > 4000) throw new HttpError(400, 'That key is too long');
      const { error } = await admin.from('provider_keys').upsert({ owner_id: user.id, provider: kp(row.id), field: 'api_key', ...encrypt(key), last4: last4(key), status: 'untested', test_message: null }, { onConflict: 'owner_id,provider,field' });
      if (error) throw error;
    }
    if (c.auth === 'none') await admin.from('provider_keys').delete().eq('owner_id', user.id).eq('provider', kp(row.id));
    await audit(db, user.id, 'custom_connection_saved', 'custom_connection', row.id);
    return { id: row.id };
  }
  const conn = await one(db.from('custom_connections').select('*').eq('id', String(body.id || '')).maybeSingle());
  if (!conn) throw new HttpError(404, 'Connection not found');
  if (body.action === 'custom_delete') {
    await admin.from('provider_keys').delete().eq('owner_id', user.id).eq('provider', kp(conn.id));
    await one(db.from('custom_connections').delete().eq('id', conn.id));
    await audit(db, user.id, 'custom_connection_removed', 'custom_connection', conn.id);
    return { ok: true };
  }
  if (body.action === 'custom_test') {
    const { data: k } = await admin.from('provider_keys').select('ciphertext, iv, auth_tag').eq('owner_id', user.id).eq('provider', kp(conn.id)).eq('field', 'api_key').maybeSingle();
    if (conn.auth !== 'none' && !k) throw new HttpError(400, 'Add the key first');
    const path = conn.endpoints[0]?.path || '/';
    let msg, status;
    try { const r = await safeGet(conn, path, k ? decrypt(k) : null); status = r.ok ? 'ok' : 'error'; msg = r.ok ? `Works: GET ${path} returned ${r.status}` : `GET ${path} returned ${r.status}`; }
    catch (e) { status = 'error'; msg = e.message; }
    await one(db.from('custom_connections').update({ last_status: status, last_message: msg.slice(0, 300), last_tested_at: new Date().toISOString(), version: conn.version + 1 }).eq('id', conn.id).eq('version', conn.version));
    return { ok: status === 'ok', message: msg };
  }
  throw new HttpError(400, 'Unknown action');
}
