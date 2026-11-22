// Tools the MCP server exposes. Every query is filtered to the token owner's rows.
// Nothing here reads provider keys, connection settings or HighLevel conversations,
// and nothing publishes, posts or sends. Write tools are logged with the previous value.
import { getSecret, embed } from './providers.js';
import { DRAFT_TYPES, TARGETS, cleanCopy } from './chat.js';
import { businessContext, metaNow } from './context.js';

const uuid = { type: 'string', format: 'uuid' };
const version = { type: 'integer', minimum: 1, description: 'The version you read. The edit fails if the row changed since.' };
const overwrite = { type: 'boolean', description: 'Set true only when the owner asked you to change text they wrote themselves.' };
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export class ToolError extends Error {}
const fail = (m) => { throw new ToolError(m); };

// A read-only view of the admin client that always adds the owner filter.
export const ownerDb = (admin, ownerId) => ({
  from: (t) => ({ select: (...a) => admin.from(t).select(...a).eq('owner_id', ownerId) }),
});

export function buildTools({ admin, ownerId, token }) {
  const one = async (q) => { const { data, error } = await q; if (error) fail(error.message); return data; };
  const sel = (t, cols) => admin.from(t).select(cols).eq('owner_id', ownerId);
  const clip = (s, n = 4000) => (s == null ? s : String(s).length > n ? String(s).slice(0, n) + '...' : s);
  const by = `MCP: ${token.name}`;

  const log = (row) => one(admin.from('mcp_edit_log').insert({ owner_id: ownerId, token_id: token.id, ...row }));

  // Versioned edit with the text guard. Returns the updated row.
  async function edit(tool, table, id, ver, patch, textFields = [], allowOverwrite = false, extraCheck) {
    const keys = Object.keys(patch);
    if (!keys.length) fail('Nothing to change');
    const cur = await one(sel(table, '*').eq('id', id).maybeSingle());
    if (!cur) fail(`No ${table} row with that id`);
    if (cur.version !== ver) fail(`Version conflict: this row is at version ${cur.version}, you sent ${ver}. Read it again before editing.`);
    if (extraCheck) extraCheck(cur);
    const touchesText = textFields.some((f) => f in patch && patch[f] !== cur[f]);
    if (touchesText && cur.authored_by === 'me' && !allowOverwrite) {
      fail('The owner wrote this text. Only change it if they asked you to, then pass overwrite_my_text: true.');
    }
    const previous = Object.fromEntries(keys.map((k) => [k, cur[k]]));
    const updated = await one(admin.from(table).update({ ...patch, version: ver + 1 }).eq('id', id).eq('owner_id', ownerId).eq('version', ver).select().maybeSingle());
    if (!updated) fail('Version conflict: the row changed while saving. Read it again.');
    await log({ action: 'update', tool, table_name: table, row_id: id, previous_value: previous, new_value: patch, row_version: ver + 1 });
    return updated;
  }

  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  const text = (v, n) => (v === undefined ? undefined : cleanCopy(String(v)).slice(0, n));

  const read = [
    {
      name: 'get_brand_dna', title: 'Brand DNA', annotations: READ,
      description: 'The active Brand DNA: who the founder is, offers, audience, voice and words to avoid. Read this before writing anything.',
      inputSchema: obj(),
      run: async () => {
        const d = await one(sel('brand_dna', 'version_no, markdown, created_at').eq('is_active', true).maybeSingle());
        return d ? { version: d.version_no, compiled_at: d.created_at, markdown: d.markdown } : { message: 'No Brand DNA compiled yet. The owner compiles it in Brain.' };
      },
    },
    {
      name: 'search_brain', title: 'Search the Brain', annotations: READ,
      description: 'Semantic search over the founder\'s uploaded documents, transcripts and notes. Returns matching passages with their source.',
      inputSchema: obj({ query: { type: 'string', maxLength: 2000 }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, ['query']),
      run: async ({ query, limit = 8 }) => {
        let key;
        try { key = await getSecret(admin, ownerId, 'openai', 'api_key'); } catch { fail('Brain search needs the OpenAI key saved in Settings.'); }
        const [v] = await embed(key, [query]);
        const hits = await one(admin.rpc('match_chunks_for', { p_owner: ownerId, query_embedding: JSON.stringify(v), match_count: limit, min_similarity: 0.2 }));
        return { results: hits.map((h) => ({ source: h.source_name, passage: h.content, similarity: Math.round(h.similarity * 100) / 100 })) };
      },
    },
    {
      name: 'list_facts', title: 'Brain facts', annotations: READ,
      description: 'Facts in the Brain (identity, offers, audience, voice, beliefs, proof, goals, tools, never_say). Only approved facts are used in Brand DNA.',
      inputSchema: obj({ category: { type: 'string', enum: ['identity', 'offers', 'audience', 'voice', 'beliefs', 'proof', 'goals', 'tools', 'never_say'] }, status: { type: 'string', enum: ['proposed', 'approved', 'rejected'] } }),
      run: async ({ category, status }) => {
        let q = sel('brain_facts', 'id, category, text, status, starred, authored_by, version, updated_at').order('category').limit(300);
        if (category) q = q.eq('category', category);
        if (status) q = q.eq('status', status);
        return { facts: await one(q) };
      },
    },
    {
      name: 'list_offers', title: 'Offers', annotations: READ,
      description: 'The founder\'s offers with real prices. Never invent prices; use these.',
      inputSchema: obj(),
      run: async () => ({ offers: await one(sel('offers', 'id, name, price, currency, cadence, status, services').order('sort')) }),
    },
    {
      name: 'list_approvals', title: 'Approvals queue', annotations: READ,
      description: 'Drafts waiting for the owner (pending), or ones already approved or passed.',
      inputSchema: obj({ status: { type: 'string', enum: ['pending', 'approved', 'passed'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } }),
      run: async ({ status = 'pending', limit = 30 }) => ({
        approvals: (await one(sel('approvals', 'id, type, title, payload, tags, language, source_agent, target_module, status, authored_by, version, created_at')
          .eq('status', status).is('trashed_at', null).order('created_at', { ascending: false }).limit(limit)))
          .map(({ payload, ...a }) => ({ ...a, body: clip(payload?.body, 1500) })),
      }),
    },
    {
      name: 'get_approval', title: 'One draft', annotations: READ,
      description: 'The full text of one draft in Approvals.',
      inputSchema: obj({ id: uuid }, ['id']),
      run: async ({ id }) => {
        const a = await one(sel('approvals', 'id, type, title, payload, tags, language, source_agent, target_module, status, authored_by, version, created_at').eq('id', id).maybeSingle());
        if (!a) fail('No draft with that id');
        const { payload, ...rest } = a;
        return { ...rest, body: payload?.body ?? null };
      },
    },
    {
      name: 'list_content', title: 'Content board', annotations: READ,
      description: 'Content planning cards with stage, format, channel and publish date.',
      inputSchema: obj({ stage: { type: 'string', maxLength: 40 }, from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' }, limit: { type: 'integer', minimum: 1, maximum: 200 } }),
      run: async ({ stage, from, to, limit = 60 }) => {
        let q = sel('content_items', 'id, title, format, channel, language, stage, publish_date, hook, notes, tasks, authored_by, version, updated_at').order('publish_date', { ascending: true, nullsFirst: false }).limit(limit);
        if (stage) q = q.eq('stage', stage);
        if (from) q = q.gte('publish_date', from);
        if (to) q = q.lte('publish_date', to);
        return { items: (await one(q)).map((c) => ({ ...c, notes: clip(c.notes, 1500) })) };
      },
    },
    {
      name: 'list_goals', title: 'Goals', annotations: READ,
      description: 'Goals with target, current value, source of the number and due date.',
      inputSchema: obj(),
      run: async () => ({ goals: await one(sel('goals', 'id, raw, target, metric_source, metric_key, target_value, current_value, unit, start_date, due_date, last_synced_at, version').order('due_date')) }),
    },
    {
      name: 'list_email_sequences', title: 'Email sequences', annotations: READ,
      description: 'Email sequences with their emails (subject, preview and body).',
      inputSchema: obj({ id: uuid }),
      run: async ({ id }) => {
        let q = sel('email_sequences', 'id, name, sequence_type, language, status, emails, version, updated_at').order('updated_at', { ascending: false }).limit(30);
        if (id) q = q.eq('id', id);
        return { sequences: await one(q) };
      },
    },
    {
      name: 'list_funnels', title: 'Funnels', annotations: READ,
      description: 'Funnels with their brief and the latest page version number.',
      inputSchema: obj(),
      run: async () => ({ funnels: await one(sel('funnels', 'id, name, funnel_type, brief, status, current_version, updated_at').order('updated_at', { ascending: false }).limit(30)) }),
    },
    {
      name: 'list_programs', title: 'Programs', annotations: READ,
      description: 'Programs and courses with their modules and lessons.',
      inputSchema: obj(),
      run: async () => {
        const [programs, modules, lessons] = await Promise.all([
          one(sel('programs', 'id, name, description, stage, updated_at').order('updated_at', { ascending: false })),
          one(sel('program_modules', 'id, program_id, title, sort').order('sort')),
          one(sel('program_lessons', 'id, module_id, title, sort').order('sort')),
        ]);
        return { programs: programs.map((p) => ({ ...p, modules: modules.filter((m) => m.program_id === p.id).map((m) => ({ title: m.title, lessons: lessons.filter((l) => l.module_id === m.id).map((l) => l.title) })) })) };
      },
    },
    {
      name: 'list_vault', title: 'Swipe vault', annotations: READ,
      description: 'Saved swipe files: links, pasted text and their AI briefs.',
      inputSchema: obj({ limit: { type: 'integer', minimum: 1, maximum: 100 } }),
      run: async ({ limit = 40 }) => ({ items: (await one(sel('vault_items', 'id, kind, title, url, body, note, brief, created_at').order('created_at', { ascending: false }).limit(limit))).map((v) => ({ ...v, body: clip(v.body, 1500) })) }),
    },
    {
      name: 'list_agents', title: 'AI Team', annotations: READ,
      description: 'The AI Team agents, whether each is on, and their instructions.',
      inputSchema: obj(),
      run: async () => ({ agents: await one(sel('agents', 'slug, name, role, instructions, enabled').order('sort')) }),
    },
    {
      name: 'get_business_snapshot', title: 'Business snapshot', annotations: READ,
      description: 'Live numbers: HighLevel pipeline counts by stage, Meta Ads spend and leads for 7 days, pending approvals, content and goals. No contact details or conversations.',
      inputSchema: obj(),
      run: async () => {
        const ctx = await businessContext(ownerDb(admin, ownerId), admin, ownerId);
        const s = ctx.board?.stats;
        return {
          summary: ctx.text,
          pipeline: ctx.board ? { name: ctx.board.pipeline?.name, total: s.total, new_7d: s.newLeads7d, open: s.active, won: s.won, lost: s.lost, open_value: s.openValue, by_stage: ctx.board.stages.map((st) => ({ stage: st.name, count: ctx.board.opportunities.filter((o) => o.pipelineStageId === st.id).length })) } : null,
          meta_ads: ctx.meta ? pick(ctx.meta, ['spend', 'leads', 'cpl', 'previous']) : null,
        };
      },
    },
    {
      name: 'get_ads_summary', title: 'Meta Ads', annotations: READ,
      description: 'Meta Ads spend, leads and cost per lead by campaign (read-only).',
      inputSchema: obj({ range: { type: 'string', enum: ['last_7d', 'last_14d', 'last_30d'] } }),
      run: async ({ range = 'last_7d' }) => {
        try { return await metaNow(ownerDb(admin, ownerId), admin, ownerId, range); } catch (e) { fail(`Meta Ads not available: ${e.message}`); }
      },
    },
  ];

  const write = [
    {
      name: 'create_draft', title: 'Add a draft to Approvals', annotations: WRITE,
      description: 'Save a finished draft to the Approvals queue. The owner approves it before it goes anywhere. Use real facts only: no invented proof, results, prices, dates or guarantees.',
      inputSchema: obj({
        type: { type: 'string', enum: DRAFT_TYPES }, title: { type: 'string', maxLength: 140 }, body: { type: 'string', maxLength: 30000 },
        target: { type: 'string', enum: TARGETS, description: 'Module the draft moves into once approved' },
        language: { type: 'string', enum: ['en', 'fr-qc'] }, tags: { type: 'array', maxItems: 8, items: { type: 'string' } },
      }, ['type', 'title', 'body']),
      run: async (a) => {
        const row = await one(admin.from('approvals').insert({
          owner_id: ownerId, type: a.type, title: text(a.title, 140), payload: { body: text(a.body, 30000), via: 'mcp' }, tags: (a.tags || []).map((t) => String(t).toLowerCase().slice(0, 40)),
          language: a.language || 'en', source_agent: by, target_module: a.target || 'content', authored_by: 'ai',
        }).select('id, type, title, status, version, created_at').single());
        await log({ action: 'insert', tool: 'create_draft', table_name: 'approvals', row_id: row.id, previous_value: null, new_value: row, row_version: 1 });
        return { saved: row, note: 'Waiting in Approvals for the owner.' };
      },
    },
    {
      name: 'update_draft', title: 'Edit a pending draft', annotations: WRITE,
      description: 'Edit a draft that is still pending in Approvals. Approved or passed drafts cannot be changed here.',
      inputSchema: obj({ id: uuid, version, title: { type: 'string', maxLength: 140 }, body: { type: 'string', maxLength: 30000 }, language: { type: 'string', enum: ['en', 'fr-qc'] }, tags: { type: 'array', maxItems: 8, items: { type: 'string' } }, overwrite_my_text: overwrite }, ['id', 'version']),
      run: async (a) => {
        const cur = await one(sel('approvals', 'payload, status, trashed_at').eq('id', a.id).maybeSingle());
        if (!cur) fail('No draft with that id');
        const patch = pick({ title: text(a.title, 140), language: a.language, tags: a.tags?.map((t) => String(t).toLowerCase().slice(0, 40)) }, ['title', 'language', 'tags']);
        if (a.body !== undefined) patch.payload = { ...(cur.payload || {}), body: text(a.body, 30000) };
        const row = await edit('update_draft', 'approvals', a.id, a.version, patch, ['title', 'payload'], a.overwrite_my_text, (r) => {
          if (r.status !== 'pending' || r.trashed_at) fail('Only pending drafts can be edited');
        });
        return { saved: pick(row, ['id', 'title', 'status', 'version']) };
      },
    },
    {
      name: 'update_content_item', title: 'Edit a content card', annotations: WRITE,
      description: 'Change a content card: stage, publish date, channel, title, hook or notes. Planning only; nothing is posted.',
      inputSchema: obj({
        id: uuid, version, stage: { type: 'string', maxLength: 40 }, publish_date: { type: 'string', format: 'date' }, channel: { type: 'string', maxLength: 60 },
        title: { type: 'string', maxLength: 200 }, hook: { type: 'string', maxLength: 500 }, notes: { type: 'string', maxLength: 20000 }, overwrite_my_text: overwrite,
      }, ['id', 'version']),
      run: async (a) => {
        const patch = pick({ stage: a.stage, publish_date: a.publish_date, channel: a.channel, title: text(a.title, 200), hook: text(a.hook, 500), notes: text(a.notes, 20000) }, ['stage', 'publish_date', 'channel', 'title', 'hook', 'notes']);
        const row = await edit('update_content_item', 'content_items', a.id, a.version, patch, ['title', 'hook', 'notes'], a.overwrite_my_text);
        return { saved: pick(row, ['id', 'title', 'stage', 'publish_date', 'version']) };
      },
    },
    {
      name: 'update_fact', title: 'Edit a Brain fact', annotations: WRITE,
      description: 'Edit a Brain fact. Changed text goes back to proposed, so the owner approves it again before it reaches Brand DNA.',
      inputSchema: obj({ id: uuid, version, text: { type: 'string', maxLength: 2000 }, category: { type: 'string', enum: ['identity', 'offers', 'audience', 'voice', 'beliefs', 'proof', 'goals', 'tools', 'never_say'] }, starred: { type: 'boolean' }, overwrite_my_text: overwrite }, ['id', 'version']),
      run: async (a) => {
        const patch = pick({ text: text(a.text, 2000), category: a.category, starred: a.starred }, ['text', 'category', 'starred']);
        if (patch.text !== undefined) patch.status = 'proposed';
        const row = await edit('update_fact', 'brain_facts', a.id, a.version, patch, ['text'], a.overwrite_my_text);
        return { saved: pick(row, ['id', 'category', 'text', 'status', 'version']) };
      },
    },
    {
      name: 'update_goal', title: 'Edit a goal', annotations: WRITE,
      description: 'Change a goal\'s target, due date, or current value. current_value can only be set on manual goals; synced goals take their number from HighLevel, Meta Ads or Content.',
      inputSchema: obj({ id: uuid, version, current_value: { type: 'number' }, target_value: { type: 'number' }, due_date: { type: 'string', format: 'date' } }, ['id', 'version']),
      run: async (a) => {
        const patch = pick(a, ['current_value', 'target_value', 'due_date']);
        const row = await edit('update_goal', 'goals', a.id, a.version, patch, [], false, (g) => {
          if ('current_value' in patch && g.metric_source && g.metric_source !== 'manual') fail(`This goal syncs from ${g.metric_source}. Its current value cannot be set by hand.`);
        });
        return { saved: pick(row, ['id', 'raw', 'current_value', 'target_value', 'due_date', 'version']) };
      },
    },
    {
      name: 'add_vault_item', title: 'Save to the swipe vault', annotations: WRITE,
      description: 'Save a link or pasted text to the swipe vault for later study.',
      inputSchema: obj({ kind: { type: 'string', enum: ['url', 'text'] }, title: { type: 'string', maxLength: 200 }, url: { type: 'string', maxLength: 2000 }, body: { type: 'string', maxLength: 20000 }, note: { type: 'string', maxLength: 2000 } }, ['kind', 'title']),
      run: async (a) => {
        if (a.kind === 'url') {
          let u; try { u = new URL(a.url || ''); } catch { fail('url must be a valid http or https link'); }
          if (!/^https?:$/.test(u.protocol)) fail('url must be a valid http or https link');
        } else if (!a.body) fail('body is required for text items');
        const row = await one(admin.from('vault_items').insert({ owner_id: ownerId, kind: a.kind, title: text(a.title, 200), url: a.kind === 'url' ? a.url : null, body: a.body ? String(a.body) : null, note: text(a.note, 2000) || null })
          .select('id, kind, title, url, created_at').single());
        await log({ action: 'insert', tool: 'add_vault_item', table_name: 'vault_items', row_id: row.id, previous_value: null, new_value: row, row_version: null });
        return { saved: row };
      },
    },
  ];

  return token.scope === 'read_write' ? [...read, ...write] : read;
}

// Undo one logged MCP edit. Refuses when the row changed after the edit, so later work is kept.
export async function undoEdit(admin, ownerId, logId) {
  const one = async (q) => { const { data, error } = await q; if (error) fail(error.message); return data; };
  const entry = await one(admin.from('mcp_edit_log').select('*').eq('owner_id', ownerId).eq('id', logId).maybeSingle());
  if (!entry) fail('That edit is not in the log');
  if (entry.undone_at) fail('Already undone');
  const t = entry.table_name;
  if (!UNDO_TABLES.includes(t)) fail('This edit cannot be undone');
  const cur = await one(admin.from(t).select('*').eq('owner_id', ownerId).eq('id', entry.row_id).maybeSingle());
  const markDone = () => one(admin.from('mcp_edit_log').update({ undone_at: new Date().toISOString() }).eq('id', entry.id).eq('owner_id', ownerId));

  if (entry.action === 'insert') {
    if (!cur) { await markDone(); return { ok: true, message: 'Already removed' }; }
    if (t === 'approvals' && cur.status !== 'pending') fail('That draft was already approved or passed, so it stays. Handle it in Approvals.');
    if (entry.row_version != null && cur.version !== entry.row_version) fail('That row was edited after it was created. Remove it by hand if you still want it gone.');
    await one(admin.from(t).delete().eq('id', entry.row_id).eq('owner_id', ownerId));
    await markDone();
    return { ok: true, message: 'Removed' };
  }

  if (!cur) fail('That row no longer exists');
  if (cur.version !== entry.row_version) fail(`That row changed after this edit (now version ${cur.version}). Undo the later edits first or change it by hand.`);
  const restored = await one(admin.from(t).update({ ...entry.previous_value, version: cur.version + 1 }).eq('id', entry.row_id).eq('owner_id', ownerId).eq('version', cur.version).select('id, version').maybeSingle());
  if (!restored) fail('The row changed while undoing. Try again.');
  await markDone();
  return { ok: true, message: 'Restored the previous value', version: restored.version };
}

export const UNDO_TABLES = ['approvals', 'content_items', 'brain_facts', 'goals', 'vault_items'];
