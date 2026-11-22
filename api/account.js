// Data export and the danger zone. HighLevel data is never touched here.
import { handler, requireOwner, HttpError, audit } from './_lib/http.js';

// Everything the OS stores, minus secrets and embeddings.
const EXPORT_TABLES = ['profiles', 'offers', 'brain_sources', 'brain_facts', 'style_guides', 'brand_dna', 'agents', 'threads', 'messages',
  'agent_routines', 'approvals', 'content_items', 'research_creators', 'research_posts', 'learning_signals', 'funnels', 'funnel_versions',
  'email_sequences', 'brand_board', 'graphics', 'graphic_versions', 'programs', 'program_modules', 'program_lessons', 'vault_items',
  'goals', 'goal_items', 'connections', 'audit_log', 'hl_write_log'];

// Delete order respects foreign keys. Profiles stay so the account still works.
const DELETE_TABLES = ['mcp_edit_log', 'mcp_tokens', 'hl_write_log', 'goal_items', 'goals', 'vault_items', 'program_lessons', 'program_modules',
  'programs', 'graphic_versions', 'graphics', 'brand_board', 'email_sequences', 'funnel_versions', 'funnels', 'learning_signals', 'research_posts',
  'research_creators', 'content_items', 'approvals', 'agent_routines', 'messages', 'threads', 'agents', 'brand_dna', 'style_guides',
  'brain_facts', 'brain_chunks', 'brain_sources', 'offers', 'connections', 'provider_keys', 'audit_log'];

export default handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req);

  if (body.action === 'export') {
    const out = { exported_at: new Date().toISOString(), note: 'API keys and embeddings are not included.' };
    for (const t of EXPORT_TABLES) {
      const { data, error } = await db.from(t).select('*');
      if (error) throw new HttpError(500, `${t}: ${error.message}`);
      out[t] = data;
    }
    out.brain_sources = out.brain_sources.map(({ content, ...s }) => ({ ...s, content_chars: content ? content.length : 0 }));
    await audit(db, user.id, 'export', 'account', user.id);
    return out;
  }

  if (body.action === 'delete') {
    if (body.confirm !== 'delete') throw new HttpError(400, 'Type "delete" to confirm');
    const { data: files } = await admin.storage.from('brain').list(user.id, { limit: 1000 });
    if (files?.length) await admin.storage.from('brain').remove(files.map((f) => `${user.id}/${f.name}`));
    for (const t of DELETE_TABLES) {
      const { error } = await admin.from(t).delete().eq('owner_id', user.id);
      if (error) throw new HttpError(500, `${t}: ${error.message}`);
    }
    await admin.from('audit_log').insert({ owner_id: user.id, action: 'all_data_deleted', entity: 'account', entity_id: user.id });
    return { ok: true };
  }

  throw new HttpError(400, 'Unknown action');
});
