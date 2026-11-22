// End-to-end tests of every /api function, with the real supabase-js client talking to a fake
// Supabase, and provider APIs (Anthropic, OpenAI, HighLevel, Meta, ElevenLabs) stubbed.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { installFakeSupabase, invoke, OWNER, MEMBER, USER_TOKEN, STRANGER_TOKEN, MEMBER_TOKEN } from './fixtures/fake-rest.mjs';
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

test('team: the owner adds a member, who works on the owner data but cannot touch keys, MCP, team, export or delete', async () => {
  fake = installFakeSupabase({
    seed: { provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')], agents: [{ id: 'ag1', owner_id: OWNER.id, slug: 'copywriter', name: 'Copywriter', enabled: true, instructions: '', version: 1 }] },
    external: async () => reply('<draft type="Caption" title="From member" language="en" target="content">Text</draft>'),
  });
  const account = await load('account'), keys = await load('keys'), chat = await load('chat');
  // Not on the team yet: refused like any stranger.
  assert.equal((await invoke(chat, { token: MEMBER_TOKEN, body: { message: 'hi' } })).status, 403);
  // Only valid emails, not the owner's own, and members cannot invite.
  assert.equal((await invoke(account, { body: { action: 'member_invite', email: 'nope' } })).status, 400);
  assert.equal((await invoke(account, { body: { action: 'member_invite', email: OWNER.email } })).status, 400);
  // The owner adds a brand-new person: a sign-in account is created and they join the team.
  const added = await invoke(account, { body: { action: 'member_invite', email: 'New.Person@Example.com' } });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.equal(fake.tables.workspace_members[0].email, 'new.person@example.com');
  assert.equal(fake.tables.workspace_members[0].owner_id, OWNER.id);
  // Someone who already has an account can be added too (found, not recreated).
  fake.tables.workspace_members = [];
  fake.tables.__users.push({ id: MEMBER.id, email: MEMBER.email });
  const again = await invoke(account, { body: { action: 'member_invite', email: MEMBER.email } });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(fake.tables.workspace_members[0].member_id, MEMBER.id);
  // The member works in the owner's workspace: drafts are saved under the owner, using the owner's key server-side.
  const r = await invoke(chat, { token: MEMBER_TOKEN, body: { agent_slug: 'copywriter', message: 'A caption' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(fake.tables.approvals[0].owner_id, OWNER.id);
  assert.equal(fake.tables.approvals[0].title, 'From member');
  // Key status is visible, keys are not changeable.
  const st = await invoke(keys, { method: 'GET', token: MEMBER_TOKEN });
  assert.equal(st.status, 200);
  assert.ok(!JSON.stringify(st.body).includes('sk-ant'));
  for (const call of [{ body: { provider: 'openai', values: { api_key: 'sk-x' } } }, { body: { action: 'test', provider: 'anthropic' } }, { method: 'DELETE', body: { provider: 'anthropic' } }]) {
    assert.equal((await invoke(keys, { token: MEMBER_TOKEN, ...call })).status, 403, JSON.stringify(call));
  }
  assert.equal(fake.tables.provider_keys.length, 1);
  // Owner-only account actions.
  for (const action of ['export', 'mcp_token_create', 'mcp_undo', 'member_invite', 'member_remove', 'delete']) {
    const res = await invoke(account, { token: MEMBER_TOKEN, body: { action, name: 'x', email: 'a@b.co', confirm: 'delete' } });
    assert.equal(res.status, 403, action);
  }
  assert.equal((await invoke(account, { token: MEMBER_TOKEN, body: { action: 'log_error', message: 'oops' } })).status, 200);
  // Removing them deletes their sign-in account; they are refused right away.
  const id = fake.tables.workspace_members[0].id;
  assert.equal((await invoke(account, { body: { action: 'member_remove', id } })).status, 200);
  assert.equal(fake.tables.workspace_members.length, 0);
  assert.ok(fake.log.some((l) => l.auth === `DELETE /auth/v1/admin/users/${MEMBER.id}`));
  assert.equal((await invoke(chat, { token: MEMBER_TOKEN, body: { message: 'hi' } })).status, 403);
});

test('team: at most 5 members', async () => {
  fake = installFakeSupabase({ seed: { workspace_members: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, owner_id: OWNER.id, member_id: `u${i}`, email: `p${i}@x.co` })) } });
  const account = await load('account');
  const r = await invoke(account, { body: { action: 'member_invite', email: 'sixth@x.co' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Up to 5/);
});

// Phase 8
test('feed: a Facebook account fetches through Apify, scores by engagement and records the run cost', async () => {
  fake = installFakeSupabase({
    seed: { provider_keys: [key('apify', 'api_token', 'apify_api_tok')], research_creators: [{ id: 'cr1', owner_id: OWNER.id, platform: 'Facebook', handle: '@ciftron', is_mine: true }] },
    external: async (url) => (url.pathname.includes('/runs')
      ? ok({ data: { id: 'run1', status: 'SUCCEEDED', usageTotalUsd: 0.021, defaultDatasetId: 'ds1' } })
      : ok([{ postId: 'a', text: 'A', likes: 10 }, { postId: 'b', text: 'B', likes: 12 }, { postId: 'c', text: 'C', likes: 90, comments: 10, shares: 5 }])),
  });
  const studio = await load('studio');
  const r = await invoke(studio, { body: { action: 'research_fetch', creator_id: 'cr1' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.posts, r.body.metric, r.body.outliers, r.body.cost], [3, 'engagement', 1, 0.021]);
  const run = fake.tables.apify_runs[0];
  assert.deepEqual([run.cost_usd, run.items, run.outliers, run.platform, run.actor], [0.021, 3, 1, 'Facebook', 'apify~facebook-posts-scraper']);
  const sent = fake.log.find((l) => l.external?.includes('/acts/apify~facebook-posts-scraper/runs'));
  assert.deepEqual(JSON.parse(sent.body).startUrls, [{ url: 'https://www.facebook.com/ciftron' }]);
  assert.equal(fake.tables.research_posts.find((p) => p.external_id === 'c').engagement, 125);
});

test('feed: an unfinished Apify run is still logged with its cost and shows a retry message', async () => {
  fake = installFakeSupabase({
    seed: { provider_keys: [key('apify', 'api_token', 'apify_api_tok')], research_creators: [{ id: 'cr1', owner_id: OWNER.id, platform: 'LinkedIn', handle: '@me', profile_url: 'https://www.linkedin.com/in/me' }] },
    external: async () => ok({ data: { id: 'run2', status: 'RUNNING', usageTotalUsd: 0.003 } }),
  });
  const studio = await load('studio');
  const r = await invoke(studio, { body: { action: 'research_fetch', creator_id: 'cr1' } });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /still running/);
  assert.equal(fake.tables.apify_runs[0].cost_usd, 0.003);
  assert.match(fake.tables.research_creators[0].fetch_error, /still running/);
});

test('content funnel: ideas per stage become Approvals drafts tagged with their stage', async () => {
  fake = installFakeSupabase({
    seed: { provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')], offers: [{ id: 'o1', owner_id: OWNER.id, name: 'Lead Gen', price: 497, currency: 'USD', cadence: 'month', services: ['Meta Ads'] }] },
    external: async () => reply(JSON.stringify({ tofu: [{ title: 'Leads go cold', format: 'Short video', hook: 'h', angle: 'a', cta: 'Follow' }, { title: 'Second' }], mofu: [{ title: 'How we follow up' }], bofu: [{ title: 'Book the audit', cta: 'Book' }] })),
  });
  const studio = await load('studio');
  const r = await invoke(studio, { body: { action: 'content_funnel', offer_id: 'o1', counts: { tofu: 2, mofu: 1, bofu: 1 } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.by_stage, { tofu: 2, mofu: 1, bofu: 1 });
  assert.equal(fake.tables.approvals.length, 4);
  const b = fake.tables.approvals.find((a) => a.title === 'Book the audit');
  assert.equal(b.payload.funnel_stage, 'bofu');
  assert.ok(b.tags.includes('bofu'));
  const prompt = JSON.parse(fake.log.find((l) => l.external?.includes('anthropic')).body).messages[0].content;
  assert.match(prompt, /Lead Gen" at 497 USD per month/);
  assert.equal((await invoke(studio, { body: { action: 'content_funnel' } })).status, 400);
});

test('playbook: proposals need a real quote; approved pairs reach every chat prompt', async () => {
  const source = 'Most brokers lose leads because they call back the next day. I call within five minutes, every time. '.repeat(3);
  fake = installFakeSupabase({
    seed: { provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')], brain_sources: [{ id: 's1', owner_id: OWNER.id, name: 'Sales notes', content: source, status: 'ready' }] },
    external: async (url, init) => {
      const sys = JSON.parse(init.body).system || '';
      if (/voice playbook/.test(sys)) return reply(JSON.stringify({ pairs: [{ question: 'How fast?', answer: 'Five minutes.', quote: 'I call within five minutes, every time.' }, { question: 'Guarantee?', answer: '10x', quote: 'made up quote that is not there' }] }));
      return reply('Answer');
    },
  });
  const studio = await load('studio'), chat = await load('chat');
  const r = await invoke(studio, { body: { action: 'playbook_propose' } });
  assert.equal(r.body.proposed, 1);
  assert.equal(fake.tables.voice_playbook[0].status, 'proposed');
  await invoke(chat, { body: { message: 'hello' } });
  let sys = JSON.parse(fake.log.filter((l) => l.external?.includes('anthropic')).at(-1).body).system;
  assert.ok(!sys.includes('Five minutes.'), 'proposed pairs are not used');
  fake.tables.voice_playbook[0].status = 'approved';
  await invoke(chat, { body: { message: 'hello again' } });
  sys = JSON.parse(fake.log.filter((l) => l.external?.includes('anthropic')).at(-1).body).system;
  assert.match(sys, /Q: How fast\?\nA: Five minutes\./);
});

test('model picker: GPT and OpenRouter models answer chat; unknown models are refused', async () => {
  fake = installFakeSupabase({
    seed: { provider_keys: [key('openai', 'api_key', 'sk-proj-x'), key('openrouter', 'api_key', 'sk-or-v1-x')] },
    external: async (url) => {
      if (url.pathname.endsWith('/embeddings')) return ok({ data: [{ index: 0, embedding: Array(1536).fill(0) }] });
      if (url.hostname === 'openrouter.ai' && url.pathname.endsWith('/models')) return ok({ data: [{ id: 'google/gemini-x', name: 'Gemini X', architecture: { output_modalities: ['text'] } }, { id: 'img/model', name: 'Img', architecture: { output_modalities: ['image', 'text'] } }] });
      return ok({ choices: [{ message: { content: `from ${url.hostname}` } }] });
    },
  });
  fake.tables.__rpc = { match_chunks: () => [] };
  const chat = await load('chat'), studio = await load('studio');
  const g = await invoke(chat, { body: { message: 'hi', model: 'gpt' } });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.match(fake.tables.messages.at(-1).content, /api.openai.com/);
  const o = await invoke(chat, { body: { message: 'hi', model: 'or:google/gemini-x' } });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.equal(fake.tables.messages.at(-1).model, 'google/gemini-x');
  const sent = JSON.parse(fake.log.filter((l) => l.external?.includes('openrouter.ai/api/v1/chat')).at(-1).body);
  assert.equal(sent.model, 'google/gemini-x');
  assert.equal(sent.messages[0].role, 'system');
  assert.equal((await invoke(chat, { body: { message: 'hi', model: 'evil model; drop' } })).status, 400);
  const m = await invoke(studio, { body: { action: 'chat_models' } });
  assert.deepEqual(m.body.models.map((x) => x.id), ['google/gemini-x']);
  assert.ok(!fake.log.some((l) => l.external?.includes('anthropic')), 'no Claude key needed');
});

// Phase 9
import { signState } from '../api/_lib/google.js';
const googleSeed = (extra = {}) => ({
  connections: [{ owner_id: OWNER.id, provider: 'google', config: { client_id: 'cid.apps.googleusercontent.com' } }],
  provider_keys: [key('google', 'client_secret', 'GOCSPX-secret'), key('anthropic', 'api_key', 'sk-ant-k'), ...(extra.keys || [])],
  ...extra.tables,
});
const callGet = async (fn, url) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() { return this; }, status(c) { this.statusCode = c; return this; }, json() { return this; } };
  await fn({ method: 'GET', url, headers: { host: 'os.ciftron.com', 'x-forwarded-proto': 'https' } }, res);
  return res;
};

test('google: owner gets a sign-in link; the callback stores the refresh token encrypted; bad state is refused', async () => {
  fake = installFakeSupabase({ seed: googleSeed(), external: async (url) => (url.hostname === 'oauth2.googleapis.com' ? ok({ access_token: 'ya29.a', refresh_token: '1//refresh-secret-token', expires_in: 3599 }) : ok({})) });
  const google = await load('google');
  const st = await invoke(google, { body: { action: 'start' }, headers: { host: 'os.ciftron.com', 'x-forwarded-proto': 'https' } });
  assert.equal(st.status, 200, JSON.stringify(st.body));
  const u = new URL(st.body.url);
  assert.equal(u.searchParams.get('client_id'), 'cid.apps.googleusercontent.com');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://os.ciftron.com/api/google');
  assert.equal((await invoke(google, { token: MEMBER_TOKEN, body: { action: 'start' } })).status, 403);
  const cb = await callGet(google, `/api/google?code=4/abc&state=${encodeURIComponent(u.searchParams.get('state'))}`);
  assert.equal(cb.statusCode, 302);
  assert.equal(cb.headers.location, '/#connections?google=connected');
  const rt = fake.tables.provider_keys.find((k) => k.provider === 'google' && k.field === 'refresh_token');
  assert.ok(rt && !JSON.stringify(rt).includes('refresh-secret-token'), 'stored encrypted');
  const exchange = fake.log.find((l) => l.external?.startsWith('https://oauth2.googleapis.com/token'));
  assert.match(exchange.body, /grant_type=authorization_code/);
  assert.match(exchange.body, /redirect_uri=https%3A%2F%2Fos.ciftron.com%2Fapi%2Fgoogle/);
  const good = signState(OWNER.id), dot = good.indexOf('.') + 1;
  const forged = good.slice(0, dot) + (good[dot] === 'A' ? 'B' : 'A') + good.slice(dot + 1);
  const bad = await callGet(google, `/api/google?code=x&state=${encodeURIComponent(forged)}`);
  assert.match(bad.headers.location, /google=error/);
  assert.equal(fake.tables.provider_keys.filter((k) => k.field === 'refresh_token').length, 1);
  const denied = await callGet(google, '/api/google?error=access_denied&state=x');
  assert.equal(denied.headers.location, '/#connections?google=denied');
});

test('google: Meet calls list with an imported flag; import stores the transcript once', async () => {
  const meet = {
    '/v2/conferenceRecords': { conferenceRecords: [{ name: 'conferenceRecords/r1', startTime: '2026-11-20T15:00:00Z', endTime: '2026-11-20T15:30:00Z', space: 'spaces/s1' }] },
    '/v2/conferenceRecords/r1/transcripts': { transcripts: [{ name: 'conferenceRecords/r1/transcripts/t1', state: 'FILE_GENERATED' }] },
    '/v2/spaces/s1': { meetingCode: 'abc' },
    '/calendar/v3/calendars/primary/events': { items: [{ id: 'e', summary: 'Broker discovery', start: { dateTime: '2026-11-20T15:00:00Z' }, conferenceData: { conferenceId: 'abc' } }] },
    '/v2/conferenceRecords/r1/participants': { participants: [{ name: 'conferenceRecords/r1/participants/p1', signedinUser: { displayName: 'Marc' } }] },
    '/v2/conferenceRecords/r1/transcripts/t1/entries': { transcriptEntries: [{ participant: 'conferenceRecords/r1/participants/p1', text: 'What does it cost?', startTime: '2026-11-20T15:01:00Z', endTime: '2026-11-20T15:01:03Z' }] },
  };
  fake = installFakeSupabase({
    seed: googleSeed({ keys: [key('google', 'refresh_token', '1//rt')] }),
    external: async (url) => (url.hostname === 'oauth2.googleapis.com' ? ok({ access_token: 'ya29.a' }) : meet[url.pathname] ? ok(meet[url.pathname]) : new Response('{}', { status: 404 })),
  });
  const google = await load('google');
  const l = await invoke(google, { body: { action: 'meet_list' } });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.deepEqual([l.body.calls[0].title, l.body.calls[0].imported], ['Broker discovery', false]);
  const im = await invoke(google, { body: { action: 'meet_import', record: 'conferenceRecords/r1', transcript: 'conferenceRecords/r1/transcripts/t1', title: 'Broker discovery', start: '2026-11-20T15:00:00Z', kind: 'sales' } });
  assert.equal(im.status, 200, JSON.stringify(im.body));
  assert.equal(fake.tables.calls[0].transcript, 'Marc: What does it cost?');
  assert.equal(fake.tables.calls[0].owner_id, OWNER.id);
  assert.equal((await invoke(google, { body: { action: 'meet_list' } })).body.calls[0].imported, true);
  assert.equal((await invoke(google, { body: { action: 'meet_import', record: 'conferenceRecords/r1', transcript: '../../etc/passwd' } })).status, 400);
  const cal = await invoke(google, { token: MEMBER_TOKEN, body: { action: 'calendar' } });
  assert.equal(cal.status, 403, 'not a member yet');
});

test('calls: AI review saved with a version bump; added to the Brain once; answers proposed to the playbook', async () => {
  fake = installFakeSupabase({
    seed: { provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')], calls: [{ id: 'c1', owner_id: OWNER.id, title: 'Broker discovery', kind: 'sales', source: 'paste', transcript: 'Marc: What does it cost?\nJasinthan: It is 497 a month.', speakers: ['Marc', 'Jasinthan'], status: 'new', version: 1 }] },
    external: async () => reply(JSON.stringify({ summary: 'Pricing call.', outcome: 'Follow up Friday', questions_asked: ['What does it cost?'], objections: [{ objection: 'Price', how_handled: 'Stated price', better_response: 'Tie it to lost leads' }], went_well: ['Clear'], improve: ['Ask budget first'], next_steps: ['Send proposal'], faq_candidates: [{ question: 'What does it cost?', answer: 'It is 497 a month.' }] })),
  });
  fake.tables.calls[0].version = 1;
  const studio = await load('studio');
  const r = await invoke(studio, { body: { action: 'call_analyze', id: 'c1' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([fake.tables.calls[0].status, fake.tables.calls[0].version, fake.tables.calls[0].analysis.objections[0].objection], ['analyzed', 2, 'Price']);
  const prompt = JSON.parse(fake.log.find((l) => l.external?.includes('anthropic')).body).messages[0].content;
  assert.match(prompt, /It is 497 a month/);
  const b = await invoke(studio, { body: { action: 'call_to_brain', id: 'c1' } });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.match(fake.tables.brain_sources[0].content, /Summary: Pricing call\.[\s\S]*Marc: What does it cost\?/);
  assert.equal(fake.tables.calls[0].brain_source_id, b.body.source_id);
  assert.equal((await invoke(studio, { body: { action: 'call_to_brain', id: 'c1' } })).body.existing, true);
  const p = await invoke(studio, { body: { action: 'call_to_playbook', id: 'c1' } });
  assert.equal(p.body.proposed, 1);
  assert.equal(fake.tables.voice_playbook[0].status, 'proposed');
  assert.equal((await invoke(studio, { body: { action: 'call_to_playbook', id: 'c1' } })).body.proposed, 0, 'no duplicates');
});

test('revenue: Stripe and logged payments combine; no Stripe key still works; Jarvis hears the totals', async () => {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 10);
  fake = installFakeSupabase({
    seed: { provider_keys: [key('stripe', 'api_key', 'rk_live_x'), key('anthropic', 'api_key', 'sk-ant-k')], revenue_entries: [{ id: 'r1', owner_id: OWNER.id, occurred_on: thisMonth, amount: 1500, currency: 'CAD', client: 'Batisseur', recurring: true }] },
    external: async (url) => {
      if (url.hostname === 'api.stripe.com') return url.pathname.endsWith('/charges') ? ok({ has_more: false, data: [{ id: 'ch_1', status: 'succeeded', paid: true, amount: 49700, amount_refunded: 0, currency: 'usd', created: Math.floor(Date.now() / 1000) }] }) : ok({ has_more: false, data: [] });
      if (url.hostname === 'api.anthropic.com') return reply('You made 497 USD and 1500 CAD this month.');
      return new Response('{}', { status: 404 });
    },
  });
  const studio = await load('studio'), chat = await load('chat');
  const r = await invoke(studio, { body: { action: 'revenue' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.stripe, r.body.summary.this_month.USD, r.body.summary.this_month.CAD, r.body.summary.mrr.CAD], [true, 497, 1500, 1500]);
  await invoke(chat, { body: { mode: 'jarvis', message: 'How much did I make?' } });
  const sys = JSON.parse(fake.log.filter((l) => l.external?.includes('anthropic')).at(-1).body).system;
  assert.match(sys, /Revenue: USD 497 this month/);
  fake.tables.provider_keys = fake.tables.provider_keys.filter((k) => k.provider !== 'stripe');
  const r2 = await invoke(studio, { body: { action: 'revenue' } });
  assert.deepEqual([r2.body.stripe, r2.body.stripe_error, r2.body.summary.this_month.CAD], [false, null, 1500]);
});

test('keys: Google test refreshes the token and reads the calendar; without sign-in it asks for it', async () => {
  fake = installFakeSupabase({ seed: googleSeed(), external: async (url) => (url.hostname === 'oauth2.googleapis.com' ? ok({ access_token: 'ya29.a' }) : ok({ items: [{ id: '1', summary: 'x', start: { dateTime: new Date().toISOString() } }] })) });
  const keys = await load('keys');
  const t1 = await invoke(keys, { body: { action: 'test', provider: 'google' } });
  assert.match(t1.body.message, /Sign in with Google/);
  fake.tables.provider_keys.push(key('google', 'refresh_token', '1//rt'));
  const t2 = await invoke(keys, { body: { action: 'test', provider: 'google' } });
  assert.equal(t2.body.status, 'ok', JSON.stringify(t2.body));
  const st = await invoke(keys, { method: 'GET' });
  const g = st.body.providers.find((p) => p.id === 'google');
  assert.deepEqual([g.connected, g.linked, g.last4], [true, true, 'cret']);
});
