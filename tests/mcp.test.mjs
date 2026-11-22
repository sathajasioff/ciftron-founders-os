// MCP protocol, tools, undo, routines and cron auth. No network: fake admin client and fake Claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { handleMessage, negotiate, originAllowed, newToken, hashToken, tokenPrefix, checkArgs, ERR } from '../api/_lib/mcp.js';
import { buildTools, undoEdit } from '../api/_lib/mcp-tools.js';
import { isDue, localParts, routinePrompt, runRoutine } from '../api/_lib/routines.js';
import { cronAuthorized } from '../api/cron.js';
import { encrypt } from '../api/_lib/crypto.js';
import { fakeAdmin } from './fixtures/fake-admin.mjs';

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const V = '2026-07-28';
const modernHeaders = (method, name) => ({ 'mcp-protocol-version': V, 'mcp-method': method, ...(name ? { 'mcp-name': name } : {}) });
const meta = { 'io.modelcontextprotocol/protocolVersion': V, 'io.modelcontextprotocol/clientInfo': { name: 't', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };
const ok = async () => {};
const echoTool = [{ name: 'echo', title: 'Echo', description: 'x', annotations: {}, inputSchema: { type: 'object', properties: { s: { type: 'string', maxLength: 5 } }, required: ['s'], additionalProperties: false }, run: async ({ s }) => ({ s }) }];

// Protocol

test('legacy initialize answers with a legacy version, capabilities and server info', async () => {
  const r = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'c', version: '1' } } }, {}, { tools: [], authorize: ok });
  assert.equal(r.status, 200);
  assert.equal(r.body.result.protocolVersion, '2025-06-18');
  assert.ok(r.body.result.capabilities.tools);
  assert.equal(r.body.result.serverInfo.name, 'ciftron-founders-os');
  assert.equal(r.body.result.resultType, undefined);
  const r2 = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2024-01-01' } }, {}, { tools: [], authorize: ok });
  assert.equal(r2.body.result.protocolVersion, '2025-11-25');
});

test('notifications are accepted with 202 and no body', async () => {
  const r = await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, {}, { tools: [], authorize: ok });
  assert.deepEqual(r, { status: 202, body: null });
});

test('modern server/discover and tools/list carry resultType and caching hints', async () => {
  const d = await handleMessage({ jsonrpc: '2.0', id: 'd', method: 'server/discover', params: { _meta: meta } }, modernHeaders('server/discover'), { tools: echoTool, authorize: ok });
  assert.equal(d.status, 200);
  assert.equal(d.body.result.resultType, 'complete');
  assert.deepEqual(d.body.result.supportedVersions, [V]);
  assert.ok(d.body.result._meta['io.modelcontextprotocol/serverInfo']);
  assert.ok(d.body.result.ttlMs >= 0 && ['public', 'private'].includes(d.body.result.cacheScope));
  const l = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: meta } }, modernHeaders('tools/list'), { tools: echoTool, authorize: ok });
  assert.equal(l.body.result.resultType, 'complete');
  assert.equal(l.body.result.cacheScope, 'private');
  assert.equal(l.body.result.tools[0].name, 'echo');
  assert.equal(l.body.result.tools[0].run, undefined);
});

test('modern tools/call runs the tool; bad arguments come back as a tool error', async () => {
  const call = (args) => handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: args, _meta: meta } }, modernHeaders('tools/call', 'echo'), { tools: echoTool, authorize: ok });
  const good = await call({ s: 'hi' });
  assert.equal(good.body.result.isError, false);
  assert.deepEqual(good.body.result.structuredContent, { s: 'hi' });
  assert.equal(good.body.result.content[0].type, 'text');
  const long = await call({ s: 'toolong' });
  assert.equal(long.body.result.isError, true);
  assert.match(long.body.result.content[0].text, /longer than 5/);
  const extra = await call({ s: 'a', nope: 1 });
  assert.match(extra.body.result.content[0].text, /Unknown argument/);
});

test('header checks: missing or mismatched headers are 400 HeaderMismatch', async () => {
  const msg = { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'echo', arguments: { s: 'a' }, _meta: meta } };
  const noName = await handleMessage(msg, modernHeaders('tools/call'), { tools: echoTool, authorize: ok });
  assert.equal(noName.status, 400);
  assert.equal(noName.body.error.code, ERR.HEADER_MISMATCH);
  const wrong = await handleMessage(msg, modernHeaders('tools/call', 'other'), { tools: echoTool, authorize: ok });
  assert.equal(wrong.body.error.code, ERR.HEADER_MISMATCH);
  const b64 = await handleMessage(msg, modernHeaders('tools/call', `=?base64?${Buffer.from('echo').toString('base64')}?=`), { tools: echoTool, authorize: ok });
  assert.equal(b64.status, 200);
  const wrongMethod = await handleMessage(msg, modernHeaders('tools/list', 'echo'), { tools: echoTool, authorize: ok });
  assert.equal(wrongMethod.body.error.code, ERR.HEADER_MISMATCH);
  const noVersionHeader = await handleMessage(msg, { 'mcp-method': 'tools/call', 'mcp-name': 'echo' }, { tools: echoTool, authorize: ok });
  assert.equal(noVersionHeader.status, 400);
});

test('unsupported protocol versions get -32022 with the supported list', async () => {
  const r = await handleMessage({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } } }, { 'mcp-protocol-version': '2099-01-01', 'mcp-method': 'tools/list' }, { tools: [], authorize: ok });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, -32022);
  assert.equal(r.body.error.data.requested, '2099-01-01');
  assert.ok(r.body.error.data.supported.includes(V));
});

test('unknown methods: 404 for modern, JSON-RPC error for legacy; ping only on legacy', async () => {
  const m = await handleMessage({ jsonrpc: '2.0', id: 6, method: 'resources/list', params: { _meta: meta } }, modernHeaders('resources/list'), { tools: [], authorize: ok });
  assert.equal(m.status, 404);
  assert.equal(m.body.error.code, ERR.METHOD);
  const l = await handleMessage({ jsonrpc: '2.0', id: 7, method: 'resources/list' }, { 'mcp-protocol-version': '2025-11-25' }, { tools: [], authorize: ok });
  assert.equal(l.status, 200);
  assert.equal(l.body.error.code, ERR.METHOD);
  const p = await handleMessage({ jsonrpc: '2.0', id: 8, method: 'ping' }, { 'mcp-protocol-version': '2025-11-25' }, { tools: [], authorize: ok });
  assert.deepEqual(p.body.result, {});
  const pm = await handleMessage({ jsonrpc: '2.0', id: 9, method: 'ping', params: { _meta: meta } }, modernHeaders('ping'), { tools: [], authorize: ok });
  assert.equal(pm.status, 404);
});

test('auth failure is 401 and runs nothing; batches and responses are rejected', async () => {
  let ran = false;
  const tools = [{ ...echoTool[0], run: async () => { ran = true; } }];
  const deny = async () => { const e = new Error('Token not valid or revoked'); e.status = 401; throw e; };
  const r = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'echo', arguments: { s: 'a' } } }, { 'mcp-protocol-version': '2025-11-25' }, { tools, authorize: deny });
  assert.equal(r.status, 401);
  assert.equal(ran, false);
  assert.equal((await handleMessage([{ jsonrpc: '2.0', id: 1, method: 'ping' }], {}, { tools, authorize: ok })).status, 400);
  assert.equal((await handleMessage({ jsonrpc: '2.0', id: 1, result: {} , method: 'x' }, {}, { tools, authorize: ok })).status, 400);
  assert.equal((await handleMessage({ id: 1, method: 'ping' }, {}, { tools, authorize: ok })).status, 400);
});

test('negotiate: legacy without a header means 2025-03-26', () => {
  assert.deepEqual(negotiate({ method: 'tools/list' }, {}), { era: 'legacy', version: '2025-03-26' });
});

test('origin check: no Origin is fine, same host is fine, other sites are refused', () => {
  assert.equal(originAllowed(undefined, 'os.ciftron.com'), true);
  assert.equal(originAllowed('https://os.ciftron.com', 'os.ciftron.com'), true);
  assert.equal(originAllowed('https://evil.example', 'os.ciftron.com'), false);
  assert.equal(originAllowed('http://os.ciftron.com', 'os.ciftron.com'), false);
  assert.equal(originAllowed('https://claude.ai', 'os.ciftron.com', 'https://claude.ai'), true);
  assert.equal(originAllowed('not a url', 'x'), false);
});

test('tokens: random, prefixed, and only a hash is stored', () => {
  const a = newToken(), b = newToken();
  assert.notEqual(a, b);
  assert.match(a, /^cfos_[A-Za-z0-9_-]{43}$/);
  assert.equal(hashToken(a).length, 64);
  assert.notEqual(hashToken(a), a);
  assert.equal(tokenPrefix(a), a.slice(0, 12));
});

test('checkArgs covers uuid, date, integer and enum', () => {
  const s = { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, d: { type: 'string', format: 'date' }, n: { type: 'integer', minimum: 1 }, e: { type: 'string', enum: ['a'] } }, required: ['id'] };
  assert.match(checkArgs(s, {}), /Missing/);
  assert.match(checkArgs(s, { id: 'x' }), /UUID/);
  assert.match(checkArgs(s, { id: OWNER, d: 'tomorrow' }), /date/);
  assert.match(checkArgs(s, { id: OWNER, n: 1.5 }), /integer/);
  assert.match(checkArgs(s, { id: OWNER, n: 0 }), /at least/);
  assert.match(checkArgs(s, { id: OWNER, e: 'b' }), /one of/);
  assert.equal(checkArgs(s, { id: OWNER, d: '2026-12-01', n: 2, e: 'a' }), null);
});

// Tools

const seed = () => fakeAdmin({
  brand_dna: [{ id: 'd1', owner_id: OWNER, version_no: 3, markdown: '# DNA', is_active: true }, { id: 'd2', owner_id: OTHER, version_no: 1, markdown: '# OTHER', is_active: true }],
  approvals: [
    { id: 'a1', owner_id: OWNER, type: 'Idea', title: 'Mine', payload: { body: 'my words' }, status: 'pending', trashed_at: null, authored_by: 'me', version: 1, tags: [], language: 'en' },
    { id: 'a2', owner_id: OWNER, type: 'Idea', title: 'AI one', payload: { body: 'ai words' }, status: 'pending', trashed_at: null, authored_by: 'ai', version: 2, tags: [], language: 'en' },
    { id: 'a3', owner_id: OWNER, type: 'Idea', title: 'Done', payload: { body: 'x' }, status: 'approved', trashed_at: null, authored_by: 'ai', version: 1, tags: [], language: 'en' },
    { id: 'b1', owner_id: OTHER, type: 'Idea', title: 'Other owner', payload: {}, status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, tags: [], language: 'en' },
  ],
  goals: [{ id: 'g1', owner_id: OWNER, raw: '20 calls', metric_source: 'highlevel', current_value: 3, target_value: 20, version: 1 }, { id: 'g2', owner_id: OWNER, raw: 'Manual', metric_source: 'manual', current_value: 1, target_value: 5, version: 1 }],
  brain_facts: [{ id: 'f1', owner_id: OWNER, category: 'voice', text: 'Plain words', status: 'approved', authored_by: 'ai', version: 4 }],
  provider_keys: [{ owner_id: OWNER, provider: 'anthropic', field: 'api_key', ...encrypt('sk-ant-secret') }],
});
const rw = { id: 't1', name: 'Claude Code', scope: 'read_write' };
const ro = { id: 't2', name: 'Reader', scope: 'read' };
const tool = (tools, n) => tools.find((t) => t.name === n);

test('read tokens get only read tools; read-write tokens add the write tools', () => {
  const admin = seed();
  const r = buildTools({ admin, ownerId: OWNER, token: ro }).map((t) => t.name);
  const w = buildTools({ admin, ownerId: OWNER, token: rw }).map((t) => t.name);
  assert.ok(!r.includes('create_draft') && r.includes('get_brand_dna'));
  assert.ok(w.includes('create_draft') && w.includes('update_goal'));
  for (const t of buildTools({ admin, ownerId: OWNER, token: rw })) {
    assert.equal(t.annotations.readOnlyHint, !['create_draft', 'update_draft', 'update_content_item', 'update_fact', 'update_goal', 'add_vault_item'].includes(t.name), t.name);
  }
});

test('reads are scoped to the token owner', async () => {
  const admin = seed();
  const tools = buildTools({ admin, ownerId: OWNER, token: ro });
  assert.equal((await tool(tools, 'get_brand_dna').run({})).markdown, '# DNA');
  const list = await tool(tools, 'list_approvals').run({});
  assert.deepEqual(list.approvals.map((a) => a.id).sort(), ['a1', 'a2']);
  await assert.rejects(tool(tools, 'get_approval').run({ id: 'b1' }), /No draft/);
});

test('no tool reads secrets, connection settings or HighLevel conversations', async () => {
  const src = readFileSync('api/_lib/mcp-tools.js', 'utf8');
  assert.ok(!/from\('provider_keys'\)|from\('connections'\)/.test(src));
  assert.ok(!/conversations/i.test(src.replace(/HighLevel conversations/g, '').replace(/No contact details or conversations/g, '')));
  // Calling every read tool never touches provider_keys directly (getSecret is only used for search, server side).
  const admin = seed();
  const tools = buildTools({ admin, ownerId: OWNER, token: rw });
  for (const t of tools.filter((x) => x.annotations.readOnlyHint && !x.inputSchema.required.length && !['get_business_snapshot', 'get_ads_summary', 'get_revenue'].includes(x.name))) await t.run({});
  assert.ok(!admin.calls.some((c) => c.table === 'provider_keys' || c.table === 'connections'));
  const out = JSON.stringify(await Promise.all(tools.filter((x) => x.name.startsWith('list_')).map((t) => t.run({}))));
  assert.ok(!out.includes('sk-ant-secret') && !out.includes('ciphertext'));
});

test('create_draft saves to Approvals as an AI draft and logs it; undo removes it', async () => {
  const admin = seed();
  const tools = buildTools({ admin, ownerId: OWNER, token: rw });
  const r = await tool(tools, 'create_draft').run({ type: 'Hooks', title: 'Three hooks — fast', body: 'One — two', target: 'content', language: 'fr-qc', tags: ['Speed'] });
  const row = admin.tables.approvals.find((a) => a.id === r.saved.id);
  assert.equal(row.status, 'pending');
  assert.equal(row.authored_by, 'ai');
  assert.equal(row.source_agent, 'MCP: Claude Code');
  assert.equal(row.title, 'Three hooks, fast');
  assert.ok(!row.payload.body.includes('—'));
  const log = admin.tables.mcp_edit_log.at(-1);
  assert.equal(log.action, 'insert');
  assert.equal(log.token_id, 't1');
  await undoEdit(admin, OWNER, log.id);
  assert.ok(!admin.tables.approvals.some((a) => a.id === r.saved.id));
  assert.ok(admin.tables.mcp_edit_log.at(-1).undone_at);
  await assert.rejects(undoEdit(admin, OWNER, log.id), /Already undone/);
});

test('updates need the current version and never overwrite owner text without the flag', async () => {
  const admin = seed();
  const tools = buildTools({ admin, ownerId: OWNER, token: rw });
  const upd = tool(tools, 'update_draft');
  await assert.rejects(upd.run({ id: 'a2', version: 1, title: 'x' }), /Version conflict/);
  await assert.rejects(upd.run({ id: 'a1', version: 1, body: 'replaced' }), /owner wrote this/);
  const ok1 = await upd.run({ id: 'a1', version: 1, tags: ['keep'] });
  assert.equal(ok1.saved.version, 2);
  const ok2 = await upd.run({ id: 'a1', version: 2, body: 'replaced', overwrite_my_text: true });
  assert.equal(ok2.saved.version, 3);
  await assert.rejects(upd.run({ id: 'a3', version: 1, title: 'x' }), /Only pending/);
  await assert.rejects(upd.run({ id: 'b1', version: 1, title: 'x' }), /No draft/);
});

test('update_goal refuses hand-set numbers on synced goals; update_fact sends text back to proposed', async () => {
  const admin = seed();
  const tools = buildTools({ admin, ownerId: OWNER, token: rw });
  await assert.rejects(tool(tools, 'update_goal').run({ id: 'g1', version: 1, current_value: 10 }), /syncs from highlevel/);
  assert.equal((await tool(tools, 'update_goal').run({ id: 'g1', version: 1, due_date: '2026-12-31' })).saved.due_date, '2026-12-31');
  assert.equal((await tool(tools, 'update_goal').run({ id: 'g2', version: 1, current_value: 4 })).saved.current_value, 4);
  const f = await tool(tools, 'update_fact').run({ id: 'f1', version: 4, text: 'Short, plain words' });
  assert.equal(f.saved.status, 'proposed');
});

test('undo restores the previous value, and refuses if the row changed after the edit', async () => {
  const admin = seed();
  const tools = buildTools({ admin, ownerId: OWNER, token: rw });
  await tool(tools, 'update_goal').run({ id: 'g2', version: 1, current_value: 4, target_value: 8 });
  const first = admin.tables.mcp_edit_log.at(-1);
  assert.deepEqual(first.previous_value, { current_value: 1, target_value: 5 });
  await tool(tools, 'update_goal').run({ id: 'g2', version: 2, current_value: 6 });
  await assert.rejects(undoEdit(admin, OWNER, first.id), /changed after this edit/);
  const second = admin.tables.mcp_edit_log.at(-1);
  await undoEdit(admin, OWNER, second.id);
  const g = admin.tables.goals.find((x) => x.id === 'g2');
  assert.equal(g.current_value, 4);
  assert.equal(g.version, 4);
  // The first edit is still stale against the restored row (version moved on), so it stays put.
  await assert.rejects(undoEdit(admin, OWNER, first.id), /changed after this edit/);
  await assert.rejects(undoEdit(admin, OTHER, second.id), /not in the log/);
});

test('undo of an approved MCP draft is refused so approved work stays', async () => {
  const admin = seed();
  const tools = buildTools({ admin, ownerId: OWNER, token: rw });
  const r = await tool(tools, 'create_draft').run({ type: 'Idea', title: 'Keep', body: 'b' });
  admin.tables.approvals.find((a) => a.id === r.saved.id).status = 'approved';
  await assert.rejects(undoEdit(admin, OWNER, admin.tables.mcp_edit_log.at(-1).id), /already approved/);
});

test('add_vault_item validates links and logs the insert', async () => {
  const admin = seed();
  const tools = buildTools({ admin, ownerId: OWNER, token: rw });
  await assert.rejects(tool(tools, 'add_vault_item').run({ kind: 'url', title: 'x', url: 'javascript:alert(1)' }), /valid http/);
  await assert.rejects(tool(tools, 'add_vault_item').run({ kind: 'text', title: 'x' }), /body is required/);
  const r = await tool(tools, 'add_vault_item').run({ kind: 'url', title: 'Ref', url: 'https://example.com/post' });
  assert.equal(admin.tables.vault_items[0].owner_id, OWNER);
  assert.equal(admin.tables.mcp_edit_log.at(-1).row_id, r.saved.id);
});

// Routines

test('isDue follows cadence, weekday, day of month and the owner time zone', () => {
  const mon = new Date('2026-11-23T15:00:00Z'); // Monday in Toronto
  assert.equal(isDue({ enabled: true, cadence: 'daily' }, mon, 'America/Toronto'), true);
  assert.equal(isDue({ enabled: false, cadence: 'daily' }, mon, 'America/Toronto'), false);
  assert.equal(isDue({ enabled: true, cadence: 'weekly', weekday: 1 }, mon, 'America/Toronto'), true);
  assert.equal(isDue({ enabled: true, cadence: 'weekly', weekday: 2 }, mon, 'America/Toronto'), false);
  assert.equal(isDue({ enabled: true, cadence: 'monthly', day_of_month: 23 }, mon, 'America/Toronto'), true);
  assert.equal(isDue({ enabled: true, cadence: 'monthly', day_of_month: 1 }, mon, 'America/Toronto'), false);
  assert.equal(isDue({ enabled: true, cadence: 'daily', last_run_at: '2026-11-23T11:00:00Z' }, mon, 'America/Toronto'), false);
  assert.equal(isDue({ enabled: true, cadence: 'daily', last_run_at: '2026-11-22T11:00:00Z' }, mon, 'America/Toronto'), true);
  // 02:00 UTC Tuesday is still Monday evening in Toronto.
  assert.equal(localParts(new Date('2026-11-24T02:00:00Z'), 'America/Toronto').weekday, 1);
  assert.equal(localParts(mon, 'Not/AZone').date, '2026-11-23');
});

test('routinePrompt asks for draft tags and the chosen language', () => {
  const p = routinePrompt({ cadence: 'weekly', title: 'Plan', prompt: 'Plan next week', language: 'fr-qc' }, new Date('2026-11-23T15:00:00Z'), 'America/Toronto');
  assert.match(p, /Plan next week/);
  assert.match(p, /<draft>/);
  assert.match(p, /Quebec French/);
});

test('runRoutine saves drafts to Approvals only, and records the run', async () => {
  const admin = fakeAdmin({
    agents: [{ id: 'ag1', owner_id: OWNER, slug: 'content-strategist', name: 'Content Strategist', enabled: true, instructions: 'Plan content.' }],
    agent_routines: [{ id: 'r1', owner_id: OWNER, agent_id: 'ag1', cadence: 'weekly', prompt: 'Plan next week', enabled: true, language: 'en' }],
    provider_keys: [{ owner_id: OWNER, provider: 'anthropic', field: 'api_key', ...encrypt('sk-ant-x') }],
  });
  let seen;
  const callClaude = async (key, args) => { seen = { key, ...args }; return 'Here you go.\n<draft type="Hooks" title="Speed hooks" language="en" target="content" tags="speed">Hook one\nHook two</draft>'; };
  const r = await runRoutine(admin, OWNER, admin.tables.agent_routines[0], { callClaude, timeZone: 'America/Toronto' });
  assert.deepEqual(r, { status: 'ok', drafts: 1 });
  assert.equal(seen.key, 'sk-ant-x');
  const a = admin.tables.approvals[0];
  assert.equal(a.status ?? 'pending', 'pending');
  assert.equal(a.source_agent, 'Content Strategist (weekly routine)');
  assert.ok(a.tags.includes('routine'));
  assert.equal(a.payload.routine_id, 'r1');
  const rt = admin.tables.agent_routines[0];
  assert.equal(rt.last_status, 'ok');
  assert.equal(rt.last_draft_count, 1);
  assert.ok(rt.last_run_at);
  // Only approvals, the routine row and logs are written.
  const written = new Set(admin.calls.filter((c) => c.op && c.op !== 'select').map((c) => c.table));
  assert.deepEqual([...written].sort(), ['agent_routines', 'approvals', 'audit_log']);
});

test('runRoutine keeps a reply without draft tags as one Brief, and records errors', async () => {
  const admin = fakeAdmin({
    agents: [{ id: 'ag1', owner_id: OWNER, slug: 'copywriter', name: 'Copywriter', enabled: true, instructions: '' }, { id: 'ag2', owner_id: OWNER, slug: 'designer', name: 'Designer', enabled: false }],
    agent_routines: [{ id: 'r1', owner_id: OWNER, agent_id: 'ag1', cadence: 'daily', prompt: 'x', enabled: true }, { id: 'r2', owner_id: OWNER, agent_id: 'ag2', cadence: 'daily', prompt: 'x', enabled: true }, { id: 'r3', owner_id: OWNER, agent_id: 'ag1', cadence: 'daily', prompt: 'x', enabled: true }],
    provider_keys: [{ owner_id: OWNER, provider: 'anthropic', field: 'api_key', ...encrypt('k') }],
  });
  const r1 = await runRoutine(admin, OWNER, admin.tables.agent_routines[0], { callClaude: async () => 'Plain answer with no tags.' });
  assert.equal(r1.drafts, 1);
  assert.equal(admin.tables.approvals[0].type, 'Brief');
  const r2 = await runRoutine(admin, OWNER, admin.tables.agent_routines[1], { callClaude: async () => 'never' });
  assert.equal(r2.status, 'skipped');
  const r3 = await runRoutine(admin, OWNER, admin.tables.agent_routines[2], { callClaude: async () => { throw new Error('Anthropic: no credits'); } });
  assert.equal(r3.status, 'error');
  assert.equal(admin.tables.agent_routines[2].last_error, 'Anthropic: no credits');
});

test('cron only runs with the exact CRON_SECRET bearer', () => {
  const s = 'x'.repeat(32);
  assert.equal(cronAuthorized(`Bearer ${s}`, s), true);
  assert.equal(cronAuthorized(`Bearer ${s}y`, s), false);
  assert.equal(cronAuthorized('', s), false);
  assert.equal(cronAuthorized('Bearer short', 'short'), false);
  assert.equal(cronAuthorized(`Bearer ${s}`, undefined), false);
});

// HTTP layer of /api/mcp, for the paths that need no database.
const call = async (req) => {
  const { default: mcp } = await import('../api/mcp.js');
  const res = { headers: {}, code: 0, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, send(b) { this.body = JSON.parse(b); return this; }, end() { return this; } };
  await mcp({ headers: {}, ...req }, res);
  return res;
};

test('/api/mcp: GET is 405, foreign Origin is 403, missing token is 401 with WWW-Authenticate', async () => {
  assert.equal((await call({ method: 'GET' })).code, 405);
  assert.equal((await call({ method: 'POST', headers: { origin: 'https://evil.example', host: 'os.ciftron.com' }, body: {} })).code, 403);
  const r = await call({ method: 'POST', headers: { host: 'os.ciftron.com', 'mcp-protocol-version': '2025-11-25' }, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  assert.equal(r.code, 401);
  assert.match(r.headers['www-authenticate'], /Bearer/);
  assert.match(r.body.error.message, /Missing token/);
  assert.equal((await call({ method: 'POST', headers: {}, body: '{not json' })).code, 400);
  assert.equal((await call({ method: 'POST', headers: {}, body: { jsonrpc: '2.0', method: 'notifications/initialized' } })).code, 202);
});
