// HighLevel: read context and the pipeline board; confirmed, logged writes.
// Never reads or returns conversations.
import { handler, requireOwner, HttpError } from './_lib/http.js';
import { getSecret } from './_lib/providers.js';
import { hlFetch, sortStages, slimContact, boardStats, buildWrite, loadBoard, HL_SCOPES } from './_lib/hl.js';

export const config = { maxDuration: 30 };

export async function hlContext(user, db, admin) {
  const token = await getSecret(admin, user.id, 'highlevel', 'private_integration_token');
  const { data: conn } = await db.from('connections').select('config').eq('provider', 'highlevel').maybeSingle();
  const locationId = conn?.config?.location_id;
  if (!locationId) throw new HttpError(400, 'Add your HighLevel Location ID in Connections', { needs: 'highlevel' });
  return { token, locationId };
}

export default handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req);
  const { token, locationId } = await hlContext(user, db, admin);
  const action = body.action;

  if (action === 'board') {
    const b = await loadBoard(token, locationId, body.pipelineId);
    return { ...b, stats: boardStats(b.stages, b.opportunities) };
  }

  if (action === 'contact') {
    const id = String(body.contactId || '');
    if (!/^[A-Za-z0-9_-]{5,64}$/.test(id)) throw new HttpError(400, 'Invalid contact');
    const r = await hlFetch(token, `/contacts/${id}`, { scope: 'contacts.readonly' });
    return { contact: slimContact(r.contact || {}) };
  }

  if (action === 'context') {
    // Read-only snapshot: sub-account, products, funnels, social accounts, OS_ custom values.
    const safe = async (fn) => { try { return await fn(); } catch (e) { return { error: e.message }; } };
    const [loc, products, funnels, social, values] = await Promise.all([
      safe(() => hlFetch(token, `/locations/${locationId}`, { scope: 'locations.readonly' })),
      safe(() => hlFetch(token, '/products/', { query: { locationId, limit: 50 }, scope: 'products.readonly' })),
      safe(() => hlFetch(token, '/funnels/funnel/list', { query: { locationId, limit: 50 }, scope: 'funnels/funnel.readonly' })),
      safe(() => hlFetch(token, `/social-media-posting/${locationId}/accounts`, { scope: 'socialplanner/account.readonly' })),
      safe(() => hlFetch(token, `/locations/${locationId}/customValues`, { scope: 'locations/customValues.readonly' })),
    ]);
    const accounts = social.error ? social : (social.results?.accounts || social.accounts || []).map((a) => ({ id: a.id, name: a.name, platform: a.platform, type: a.type }));
    return {
      location: loc.error ? loc : { id: loc.location?.id, name: loc.location?.name, timezone: loc.location?.timezone },
      products: products.error ? products : (products.products || []).map((p) => ({ id: p._id || p.id, name: p.name, productType: p.productType })),
      funnels: funnels.error ? funnels : (funnels.funnels || []).map((f) => ({ id: f._id || f.id, name: f.name, steps: (f.steps || []).length })),
      socialAccounts: accounts,
      customValues: values.error ? values : (values.customValues || []).filter((v) => /^OS_/.test(v.name)).map((v) => ({ id: v.id, name: v.name, value: v.value, fieldKey: v.fieldKey })),
    };
  }

  if (action === 'preview' || action === 'write') {
    const kind = body.kind;
    const input = body.input || {};
    let stages = [];
    if (kind === 'move') {
      const { pipelines = [] } = await hlFetch(token, '/opportunities/pipelines', { query: { locationId }, scope: 'opportunities.readonly' });
      const p = pipelines.find((x) => x.id === input.pipelineId);
      if (!p) throw new HttpError(400, 'Pipeline not found');
      stages = sortStages(p);
    }
    if (kind === 'custom_value' && input.id) {
      // Updates are allowed only on values that already start with OS_.
      const { customValues = [] } = await hlFetch(token, `/locations/${locationId}/customValues`, { scope: 'locations/customValues.readonly' });
      const existing = customValues.find((v) => v.id === input.id);
      if (!existing || !/^OS_/.test(existing.name)) throw new HttpError(400, 'Only custom values starting with OS_ can be changed');
    }
    const w = buildWrite(kind, input, { locationId, stages });
    const preview = w.steps
      ? { steps: w.steps.map((st) => ({ method: st.method, url: st.path, body: st.body })), summary: w.summary, warning: w.warning, scope: w.scope }
      : { method: w.method, url: w.path, body: w.body, summary: w.summary, warning: w.warning, scope: w.scope };
    if (action === 'preview') return { preview };
    if (body.confirmed !== true) throw new HttpError(400, 'Confirm the preview first');

    if (w.steps) {
      // Multi-step writes run in order; each step is logged. A failure stops the rest.
      const saved = {}, results = [];
      for (const st of w.steps) {
        const path = st.path.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(saved[k] || ''));
        try {
          const r = await hlFetch(token, path, { method: st.method, body: st.body, scope: st.scope });
          if (st.saveAs) saved[st.saveAs] = r._id || r.product?._id || r.id || r.product?.id;
          results.push({ path, ok: true });
          await db.from('hl_write_log').insert({ owner_id: user.id, action: kind, target: `${w.summary} · ${st.method} ${path}`, payload: { method: st.method, url: path, body: st.body }, response: r, status: 'sent' });
        } catch (e) {
          await db.from('hl_write_log').insert({ owner_id: user.id, action: kind, target: `${w.summary} · ${st.method} ${path}`, payload: { method: st.method, url: path, body: st.body }, response: { error: e.message }, status: 'failed' });
          throw new HttpError(e.status || 502, `Stopped after ${results.length} of ${w.steps.length} steps: ${e.message}`, { done: results.length });
        }
      }
      return { ok: true, id: saved.productId || null, summary: w.summary, steps: results.length };
    }

    let response, status = 'sent';
    try {
      response = await hlFetch(token, w.path, { method: w.method, body: w.body, scope: w.scope });
    } catch (e) {
      status = 'failed';
      response = { error: e.message };
      await db.from('hl_write_log').insert({ owner_id: user.id, action: kind, target: w.summary, payload: { method: w.method, url: w.path, body: w.body }, response, status });
      throw e;
    }
    await db.from('hl_write_log').insert({ owner_id: user.id, action: kind, target: w.summary, payload: { method: w.method, url: w.path, body: w.body }, response, status });
    const id = response?.opportunity?.id || response?.contact?.id || response?.customValue?.id || response?.results?.post?._id || response?.results?.post?.id || response?.id || response?.redirect || null;
    return { ok: true, id, summary: w.summary };
  }

  if (action === 'scopes') return HL_SCOPES;
  throw new HttpError(400, 'Unknown action');
});
