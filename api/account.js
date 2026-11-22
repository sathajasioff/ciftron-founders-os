// Data export and the danger zone. HighLevel data is never touched here.
import { handler, requireOwner, HttpError, audit } from './_lib/http.js';
import { newToken, hashToken, tokenPrefix } from './_lib/mcp.js';
import { undoEdit } from './_lib/mcp-tools.js';
import { errorRow } from './_lib/errors.js';

// Everything the OS stores, minus secrets and embeddings.
const EXPORT_TABLES = ['profiles', 'offers', 'brain_sources', 'brain_facts', 'style_guides', 'brand_dna', 'agents', 'threads', 'messages',
  'agent_routines', 'approvals', 'content_items', 'research_creators', 'research_posts', 'learning_signals', 'funnels', 'funnel_versions',
  'email_sequences', 'brand_board', 'graphics', 'graphic_versions', 'programs', 'program_modules', 'program_lessons', 'vault_items',
  'goals', 'goal_items', 'connections', 'audit_log', 'hl_write_log', 'error_log', 'voice_playbook', 'apify_runs', 'calls', 'revenue_entries', 'funnel_pages', 'program_decks', 'custom_connections'];

// Delete order respects foreign keys. Profiles stay so the account still works.
const DELETE_TABLES = ['workspace_members', 'custom_connections', 'funnel_pages', 'program_decks', 'calls', 'revenue_entries', 'voice_playbook', 'apify_runs', 'error_log', 'mcp_edit_log', 'mcp_tokens', 'hl_write_log', 'goal_items', 'goals', 'vault_items', 'program_lessons', 'program_modules',
  'programs', 'graphic_versions', 'graphics', 'brand_board', 'email_sequences', 'funnel_versions', 'funnels', 'learning_signals', 'research_posts',
  'research_creators', 'content_items', 'approvals', 'agent_routines', 'messages', 'threads', 'agents', 'brand_dna', 'style_guides',
  'brain_facts', 'brain_chunks', 'brain_sources', 'offers', 'connections', 'provider_keys', 'audit_log'];

export default handler(['POST'], async (req, body) => {
  // Members may report and clear errors; everything else here is the owner's.
  const { user, db, admin } = await requireOwner(req, { ownerOnly: !['log_error', 'errors_clear'].includes(body.action) });

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

  // MCP tokens. The plain token is returned once and only its hash is stored.
  if (body.action === 'mcp_token_create') {
    const name = String(body.name || '').trim().slice(0, 60);
    if (!name) throw new HttpError(400, 'Give the token a name, like "Claude Code laptop"');
    const scope = body.scope === 'read_write' ? 'read_write' : 'read';
    const { count } = await admin.from('mcp_tokens').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).is('revoked_at', null);
    if (count >= 10) throw new HttpError(400, 'Up to 10 active tokens. Revoke one first.');
    const token = newToken();
    const { data, error } = await admin.from('mcp_tokens').insert({ owner_id: user.id, name, scope, token_hash: hashToken(token), token_prefix: tokenPrefix(token) })
      .select('id, name, scope, token_prefix, created_at').single();
    if (error) throw new HttpError(500, error.message);
    await audit(db, user.id, 'mcp_token_created', 'mcp_tokens', data.id, { name, scope });
    return { token, ...data };
  }

  if (body.action === 'mcp_token_revoke') {
    const { data, error } = await admin.from('mcp_tokens').update({ revoked_at: new Date().toISOString() })
      .eq('owner_id', user.id).eq('id', String(body.id || '')).is('revoked_at', null).select('id').maybeSingle();
    if (error) throw new HttpError(400, error.message);
    if (!data) throw new HttpError(404, 'Token not found or already revoked');
    await audit(db, user.id, 'mcp_token_revoked', 'mcp_tokens', data.id);
    return { ok: true };
  }

  if (body.action === 'mcp_undo') {
    try {
      const out = await undoEdit(admin, user.id, Number(body.id));
      await audit(db, user.id, 'mcp_undo', 'mcp_edit_log', body.id);
      return out;
    } catch (e) {
      throw new HttpError(409, e.message);
    }
  }

  // Browser errors. Redacted like server errors, and capped so a loop cannot flood the log.
  if (body.action === 'log_error') {
    const since = new Date(Date.now() - 3600e3).toISOString();
    const { count } = await admin.from('error_log').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('source', 'browser').gte('created_at', since);
    if (count >= 30) return { ok: true, dropped: true };
    const d = body.detail && typeof body.detail === 'object' ? body.detail : {};
    const row = errorRow({ ownerId: user.id, source: 'browser', route: String(body.route || '').slice(0, 200), error: String(body.message || 'Unknown browser error'),
      detail: { stack: String(d.stack || '').slice(0, 3000), file: String(d.file || '').slice(0, 300), line: d.line, col: d.col, agent: String(req.headers['user-agent'] || '').slice(0, 200) } });
    const { error } = await admin.from('error_log').insert(row);
    if (error) throw new HttpError(500, error.message);
    return { ok: true };
  }

  if (body.action === 'errors_clear') {
    const { error } = await admin.from('error_log').delete().eq('owner_id', user.id);
    if (error) throw new HttpError(500, error.message);
    await audit(db, user.id, 'errors_cleared', 'error_log', null);
    return { ok: true };
  }

  // Team. Members sign in with a magic link like the owner; they never see keys or MCP tokens.
  if (body.action === 'member_invite') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new HttpError(400, 'Enter a valid email');
    if (email === user.email) throw new HttpError(400, 'That is your own email');
    const { count } = await admin.from('workspace_members').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
    if (count >= 5) throw new HttpError(400, 'Up to 5 team members. Remove one first.');
    // Find or create the sign-in account. Works with public sign-ups turned off.
    let memberId;
    const { data: made, error: makeErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (made?.user) memberId = made.user.id;
    else if (/already|registered|exists/i.test(makeErr?.message || '')) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) throw new HttpError(500, listErr.message);
      memberId = list.users.find((u) => (u.email || '').toLowerCase() === email)?.id;
    } else throw new HttpError(500, makeErr?.message || 'Could not create the account');
    if (!memberId) throw new HttpError(500, 'Could not find that account');
    const { data: row, error } = await admin.from('workspace_members').insert({ owner_id: user.id, member_id: memberId, email }).select('id, email, role, created_at').single();
    if (error) throw new HttpError(/duplicate|unique/i.test(error.message) ? 400 : 500, /duplicate|unique/i.test(error.message) ? 'That person is already on a team' : error.message);
    await audit(db, user.id, 'member_added', 'workspace_members', row.id, { email });
    return { member: row };
  }

  if (body.action === 'member_remove') {
    const { data: m, error } = await admin.from('workspace_members').select('id, member_id, email').eq('owner_id', user.id).eq('id', String(body.id || '')).maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!m) throw new HttpError(404, 'Not on your team');
    await admin.from('workspace_members').delete().eq('id', m.id).eq('owner_id', user.id);
    // Delete their sign-in account too, so they cannot request new sign-in links.
    await admin.auth.admin.deleteUser(m.member_id).catch(() => {});
    await audit(db, user.id, 'member_removed', 'workspace_members', m.id, { email: m.email });
    return { ok: true };
  }

  if (body.action === 'delete') {
    if (body.confirm !== 'delete') throw new HttpError(400, 'Type "delete" to confirm');
    const { data: team } = await admin.from('workspace_members').select('member_id').eq('owner_id', user.id);
    for (const m of team || []) await admin.auth.admin.deleteUser(m.member_id).catch(() => {});
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
