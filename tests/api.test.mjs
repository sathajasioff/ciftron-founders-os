// End-to-end tests of every /api function, with the real supabase-js client talking to a fake
// Supabase, and provider APIs (Anthropic, OpenAI, HighLevel, Meta, ElevenLabs) stubbed.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { installFakeSupabase, invoke, OWNER, USER_TOKEN, STRANGER_TOKEN } from './fixtures/fake-rest.mjs';
import { encrypt } from '../api/_lib/crypto.js';
import { hashToken } from '../api/_lib/mcp.js';

process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
const load = (f) => import(`../api/${f}.js`).then((m) => m.default);
const key = (provider, field, plain) => ({ owner_id: OWNER.id, provider, field, ...encrypt(plain), last4: plain.slice(-4), status: 'ok' });
const reply = (text) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } });
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
let fake;
afterEach(() => fake?.restore());

test('config: 503 until Supabase is set, then a clean URL and the public anon key', async () => {
  const config = await load('config');
  const saved = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_ANON_KEY };
  delete process.env.SUPABASE_URL;
  assert.equal((await invoke(config, { method: 'GET' })).status, 503);
  process.env.SUPABASE_URL = 'https://abc.supabase.co/rest/v1/ ';
  process.env.SUPABASE_ANON_KEY = ' anon ';
  const r = await invoke(config, { method: 'GET' });
  assert.deepEqual([r.body.supabaseUrl, r.body.supabaseAnonKey], ['https://abc.supabase.co', 'anon']);
  Object.assign(process.env, { SUPABASE_URL: saved.u || '', SUPABASE_ANON_KEY: saved.k || '' });
});

test('owner only: no token is 401, another account is 403', async () => {
  fake = installFakeSupabase();
  const keys = await load('keys');
  assert.equal((await invoke(keys, { method: 'GET', token: null })).status, 401);
  assert.equal((await invoke(keys, { method: 'GET', token: 'garbage' })).status, 401);
  assert.equal((await invoke(keys, { method: 'GET', token: STRANGER_TOKEN })).status, 403);
});

test('keys: saved encrypted, status never returns a secret, blank keeps the key, test and remove', async () => {
  fake = installFakeSupabase({ external: async (url) => (url.hostname === 'api.anthropic.com' ? ok({ data: [] }) : ok({})) });
  const keys = await load('keys');
  const plain = 'sk-ant-api03-REALSECRET1234';
  assert.equal((await invoke(keys, { body: { provider: 'anthropic', values: { api_key: plain } } })).status, 200);
  const stored = fake.tables.provider_keys[0];
  assert.ok(stored.ciphertext && !JSON.stringify(stored).includes(plain));
  assert.equal(stored.last4, '1234');
  const st = await invoke(keys, { method: 'GET' });
  assert.ok(!JSON.stringify(st.body).includes(plain) && !JSON.stringify(st.body).includes(stored.ciphertext));
  assert.equal(st.body.providers.find((p) => p.id === 'anthropic').connected, true);
  await invoke(keys, { body: { provider: 'anthropic', values: { api_key: '' } } });
  assert.equal(fake.tables.provider_keys[0].ciphertext, stored.ciphertext);
  const t = await invoke(keys, { body: { action: 'test', provider: 'anthropic' } });
  assert.equal(t.body.status, 'ok');
  const sent = fake.log.find((l) => l.external?.startsWith('https://api.anthropic.com'));
  assert.ok(sent);
  await invoke(keys, { method: 'DELETE', body: { provider: 'anthropic' } });
  assert.equal(fake.tables.provider_keys.length, 0);
  assert.ok(fake.tables.audit_log.some((a) => a.action === 'key_saved'));
});

test('brain: bootstrap seeds nine agents and offers once; search needs the OpenAI key', async () => {
  fake = installFakeSupabase({ external: async (url) => (url.pathname.endsWith('/embeddings') ? ok({ data: [{ index: 0, embedding: Array(1536).fill(0.01) }] }) : ok({})) });
  fake.tables.__rpc = { match_chunks: () => [{ id: 'c', source_name: 'about_me', content: 'brokers', similarity: 0.8 }] };
  const brain = await load('brain');
  const b = await invoke(brain, { body: { action: 'bootstrap' } });
  assert.equal(b.status, 200);
  assert.equal(fake.tables.agents.length, 9);
  assert.ok(fake.tables.offers.length >= 3);
  await invoke(brain, { body: { action: 'bootstrap' } });
  assert.equal(fake.tables.agents.length, 9, 'bootstrap is idempotent');
  const miss = await invoke(brain, { body: { action: 'search', query: 'brokers' } });
  assert.equal(miss.status, 400);
  assert.match(miss.body.error, /OpenAI/);
  fake.tables.provider_keys = [key('openai', 'api_key', 'sk-proj-x')];
  const hit = await invoke(brain, { body: { action: 'search', query: 'brokers' } });
  assert.equal(hit.body.results[0].source_name, 'about_me');
});

test('chat: agent drafts land in Approvals as AI drafts; Jarvis stores nothing', async () => {
  fake = installFakeSupabase({
    seed: { agents: [{ id: 'ag1', owner_id: OWNER.id, slug: 'content-strategist', name: 'Content Strategist', instructions: 'x', enabled: true, version: 1 }], provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')] },
    external: async (url) => (url.hostname === 'api.anthropic.com' ? reply('Here.\n<draft type="Hooks" title="Speed hooks — fast" language="en" target="content">One — two</draft>') : new Response('{}', { status: 401 })),
  });
  const chat = await load('chat');
  const r = await invoke(chat, { body: { agent_slug: 'content-strategist', message: 'Hooks about follow-up speed' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const a = fake.tables.approvals[0];
  assert.equal(a.authored_by, 'ai');
  assert.equal(a.status, 'pending');
  assert.equal(a.title, 'Speed hooks, fast');
  assert.ok(r.body.warnings.some((w) => /Brain search skipped/.test(w)));
  const before = (fake.tables.messages || []).length;
  const j = await invoke(chat, { body: { mode: 'jarvis', message: 'How are we doing?' } });
  assert.equal(j.status, 200);
  assert.equal((fake.tables.messages || []).length, before, 'Jarvis keeps no transcript');
});

test('hl: preview never calls HighLevel; write needs confirm, logs, and custom values stay OS_ only', async () => {
  fake = installFakeSupabase({
    seed: { provider_keys: [key('highlevel', 'private_integration_token', 'pit-abc')], connections: [{ owner_id: OWNER.id, provider: 'highlevel', config: { location_id: 'loc1' } }] },
    external: async (url, init) => (url.pathname.endsWith('/customValues') && (init.method || 'GET') === 'GET' ? ok({ customValues: [{ id: 'cv1', name: 'Business Name', value: 'x' }] }) : ok({ customValue: { id: 'new' } })),
  });
  const hl = await load('hl');
  const p = await invoke(hl, { body: { action: 'preview', kind: 'custom_value', input: { name: 'OS_offer_name', value: 'Lead Gen' } } });
  assert.equal(p.status, 200);
  assert.ok(!fake.log.some((l) => l.external), 'preview made no HighLevel call');
  assert.equal((await invoke(hl, { body: { action: 'write', kind: 'custom_value', input: { name: 'OS_offer_name', value: 'x' } } })).status, 400);
  assert.equal((await invoke(hl, { body: { action: 'preview', kind: 'custom_value', input: { name: 'Business Name', value: 'x' } } })).status, 400);
  assert.equal((await invoke(hl, { body: { action: 'preview', kind: 'custom_value', input: { id: 'cv1', name: 'OS_x', value: 'x' } } })).status, 400, 'cannot edit a non-OS_ value by id');
  const w = await invoke(hl, { body: { action: 'write', confirmed: true, kind: 'custom_value', input: { name: 'OS_offer_name', value: 'Lead Gen' } } });
  assert.equal(w.status, 200);
  assert.equal(fake.tables.hl_write_log.at(-1).status, 'sent');
  assert.ok(!fake.log.some((l) => l.external && /conversations/.test(l.external)));
});

test('meta: read-only insights for the saved ad account', async () => {
  fake = installFakeSupabase({
    seed: { provider_keys: [key('meta_ads', 'access_token', 'EAAtoken')], connections: [{ owner_id: OWNER.id, provider: 'meta_ads', config: { ad_account_id: '12345' } }] },
    external: async () => ok({ data: [{ campaign_id: '1', campaign_name: 'Leads', spend: '100', actions: [{ action_type: 'lead', value: '5' }] }] }),
  });
  const meta = await load('meta');
  const r = await invoke(meta, { body: { range: 'last_7d' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(fake.log.filter((l) => l.external).every((l) => (l.method || 'GET') === 'GET' && l.external.includes('act_12345')));
});

test('voice: ElevenLabs audio comes back as base64; a bad key asks the browser to fall back', async () => {
  let status = 200;
  fake = installFakeSupabase({ seed: { provider_keys: [key('elevenlabs', 'api_key', 'xi-key')] }, external: async () => new Response(status === 200 ? new Uint8Array([1, 2, 3]) : 'unauthorized', { status }) });
  const voice = await load('voice');
  const r = await invoke(voice, { body: { text: 'Two drafts are waiting.' } });
  assert.equal(r.body.audio, Buffer.from([1, 2, 3]).toString('base64'));
  status = 401;
  const bad = await invoke(voice, { body: { text: 'Hi' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.fallback, true);
});

test('studio: a goal becomes a measurable target; routine_run saves drafts to Approvals', async () => {
  fake = installFakeSupabase({
    seed: {
      provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')],
      agents: [{ id: 'ag1', owner_id: OWNER.id, slug: 'copywriter', name: 'Copywriter', enabled: true, instructions: '', version: 1 }],
      agent_routines: [{ id: 'r1', owner_id: OWNER.id, agent_id: 'ag1', cadence: 'daily', prompt: 'Three captions', enabled: false, language: 'en' }],
    },
    external: async (url, init) => {
      if (url.hostname !== 'api.anthropic.com') return new Response('{}', { status: 500 });
      const sys = JSON.parse(init.body).system || '';
      return /goal/i.test(sys) && !/routine/i.test(init.body)
        ? reply('{"target":"Book 15 calls","metric_key":"manual","target_value":15,"unit":"calls","due_date":"2026-12-31","checklist":["Post daily"]}')
        : reply('<draft type="Caption" title="Caption one" language="en" target="content">Text</draft>');
    },
  });
  const studio = await load('studio');
  const g = await invoke(studio, { body: { action: 'goal', raw: 'Book 15 calls by end of year' } });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(fake.tables.goals[0].target_value, 15);
  const r = await invoke(studio, { body: { action: 'routine_run', id: 'r1' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.drafts, 1);
  assert.equal(fake.tables.approvals.at(-1).source_agent, 'Copywriter (daily routine)');
});

test('account: export has no secrets; MCP token shown once and stored hashed; revoke; delete needs the word', async () => {
  fake = installFakeSupabase({ seed: { provider_keys: [key('openai', 'api_key', 'sk-proj-SECRET')], brain_sources: [{ id: 's', owner_id: OWNER.id, name: 'n', content: 'long text' }] } });
  const account = await load('account');
  const ex = await invoke(account, { body: { action: 'export' } });
  const dump = JSON.stringify(ex.body);
  assert.ok(!dump.includes('SECRET') && !dump.includes('ciphertext') && !('provider_keys' in ex.body) && !('mcp_tokens' in ex.body));
  assert.equal(ex.body.brain_sources[0].content_chars, 9);
  const t = await invoke(account, { body: { action: 'mcp_token_create', name: 'Laptop', scope: 'read' } });
  assert.match(t.body.token, /^cfos_/);
  const row = fake.tables.mcp_tokens[0];
  assert.equal(row.token_hash, hashToken(t.body.token));
  assert.ok(!JSON.stringify(row).includes(t.body.token));
  assert.equal((await invoke(account, { body: { action: 'mcp_token_revoke', id: row.id } })).status, 200);
  assert.ok(fake.tables.mcp_tokens[0].revoked_at);
  assert.equal((await invoke(account, { body: { action: 'delete', confirm: 'Delete' } })).status, 400);
  assert.equal((await invoke(account, { body: { action: 'delete', confirm: 'delete' } })).status, 200);
  assert.equal(fake.tables.provider_keys.length, 0);
});

test('account: browser errors are redacted and capped at 30 an hour; clear empties the log', async () => {
  fake = installFakeSupabase();
  const account = await load('account');
  await invoke(account, { body: { action: 'log_error', message: 'failed with Bearer abcdefghijklmnop1234', route: '#chat' } });
  assert.ok(!fake.tables.error_log[0].message.includes('abcdefghijklmnop1234'));
  assert.equal(fake.tables.error_log[0].source, 'browser');
  for (let i = 0; i < 40; i++) await invoke(account, { body: { action: 'log_error', message: `e${i}` } });
  assert.equal(fake.tables.error_log.length, 30);
  await invoke(account, { body: { action: 'errors_clear' } });
  assert.equal(fake.tables.error_log.length, 0);
});

test('mcp over HTTP: a read token lists read tools only; a read-write token saves a logged draft', async () => {
  fake = installFakeSupabase({ seed: {
    mcp_tokens: [{ id: 't1', owner_id: OWNER.id, name: 'Reader', scope: 'read', token_hash: hashToken('cfos_read'), revoked_at: null },
      { id: 't2', owner_id: OWNER.id, name: 'Writer', scope: 'read_write', token_hash: hashToken('cfos_write'), revoked_at: null },
      { id: 't3', owner_id: OWNER.id, name: 'Old', scope: 'read_write', token_hash: hashToken('cfos_old'), revoked_at: '2026-11-01T00:00:00Z' }],
    brand_dna: [{ id: 'd', owner_id: OWNER.id, version_no: 2, markdown: '# DNA', is_active: true }],
  } });
  const mcp = await load('mcp');
  const rpc = (token, method, params = {}) => invoke(mcp, { token, headers: { 'mcp-protocol-version': '2025-11-25' }, body: { jsonrpc: '2.0', id: 1, method, params } });
  assert.equal((await rpc('cfos_old', 'tools/list')).status, 401);
  assert.equal((await rpc('cfos_nope', 'tools/list')).status, 401);
  const list = (await rpc('cfos_read', 'tools/list')).body.result.tools.map((t) => t.name);
  assert.ok(list.includes('get_brand_dna') && !list.includes('create_draft'));
  const denied = await rpc('cfos_read', 'tools/call', { name: 'create_draft', arguments: { type: 'Idea', title: 't', body: 'b' } });
  assert.equal(denied.body.error.code, -32602);
  const dna = await rpc('cfos_read', 'tools/call', { name: 'get_brand_dna', arguments: {} });
  assert.equal(dna.body.result.structuredContent.markdown, '# DNA');
  const made = await rpc('cfos_write', 'tools/call', { name: 'create_draft', arguments: { type: 'Idea', title: 'From MCP', body: 'b' } });
  assert.equal(made.body.result.isError, false);
  assert.equal(fake.tables.approvals[0].source_agent, 'MCP: Writer');
  assert.equal(fake.tables.mcp_edit_log[0].token_id, 't2');
  assert.ok(!fake.log.some((l) => /provider_keys|connections/.test(l.path || '')));
});

test('cron over HTTP: runs due routines once a day with the secret, and prunes old errors', async () => {
  process.env.CRON_SECRET = 'c'.repeat(32);
  fake = installFakeSupabase({
    seed: {
      provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')],
      profiles: [{ owner_id: OWNER.id, timezone: 'America/Toronto' }],
      agents: [{ id: 'ag1', owner_id: OWNER.id, slug: 'copywriter', name: 'Copywriter', enabled: true, instructions: '', version: 1 }],
      agent_routines: [{ id: 'r1', owner_id: OWNER.id, agent_id: 'ag1', cadence: 'daily', prompt: 'Captions', enabled: true }, { id: 'r2', owner_id: OWNER.id, agent_id: 'ag1', cadence: 'daily', prompt: 'Off', enabled: false }],
      error_log: [{ id: 1, owner_id: OWNER.id, source: 'server', message: 'old', created_at: '2020-01-01T00:00:00Z' }],
    },
    external: async () => reply('<draft type="Caption" title="One" language="en" target="content">Text</draft>'),
  });
  const cron = await load('cron');
  assert.equal((await invoke(cron, { method: 'GET', token: 'wrong' })).status, 401);
  const r = await invoke(cron, { method: 'GET', token: process.env.CRON_SECRET });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ran, 1);
  assert.equal(fake.tables.approvals.length, 1);
  assert.equal(fake.tables.error_log.length, 0);
  const again = await invoke(cron, { method: 'GET', token: process.env.CRON_SECRET });
  assert.equal(again.body.ran, 0, 'a routine runs once per day');
});

test('server crash: logged to error_log with the owner, secrets removed', async () => {
  fake = installFakeSupabase({ seed: { provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')] }, external: async () => { throw new Error('socket hang up near sk-ant-api03-LEAKEDKEY123456'); } });
  const chat = await load('chat');
  const r = await invoke(chat, { body: { message: 'hi' }, url: '/api/chat' });
  assert.equal(r.status, 500);
  const e = fake.tables.error_log.at(-1);
  assert.equal(e.owner_id, OWNER.id);
  assert.equal(e.route, '/api/chat');
  assert.ok(!JSON.stringify(e).includes('LEAKEDKEY') && !r.body.error.includes('LEAKEDKEY'));
});
