// Provider keys: save (encrypted), list status, test, remove. Keys never go back to the browser.
import { handler, requireOwner, HttpError, audit } from './_lib/http.js';
import { encrypt, last4 } from './_lib/crypto.js';
import { PROVIDERS, testProvider, getSecret } from './_lib/providers.js';

export default handler(['GET', 'POST', 'DELETE'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req, { ownerOnly: req.method !== 'GET' });

  if (req.method === 'GET') {
    const [{ data: keys, error }, { data: conns }] = await Promise.all([
      admin.from('provider_keys').select('provider, field, last4, status, test_message, last_tested_at, updated_at').eq('owner_id', user.id),
      db.from('connections').select('provider, config, enabled'),
    ]);
    if (error) throw error;
    return {
      providers: Object.entries(PROVIDERS).map(([id, p]) => {
        const ks = keys.filter((k) => k.provider === id);
        const conn = (conns || []).find((c) => c.provider === id);
        const connected = p.secret.every((f) => ks.some((k) => k.field === f));
        return {
          id, name: p.name, connected, phase: p.phase || null,
          status: ks.some((k) => k.status === 'error') ? 'error' : ks.every((k) => k.status === 'ok') && ks.length ? 'ok' : connected ? 'untested' : 'none',
          last4: ks.map((k) => k.last4).filter(Boolean)[0] || null,
          test_message: ks[0]?.test_message || null,
          last_tested_at: ks[0]?.last_tested_at || null,
          fields: { secret: p.secret, plain: p.plain },
          config: conn?.config || {},
        };
      }),
    };
  }

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
