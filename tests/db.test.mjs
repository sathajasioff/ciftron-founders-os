// Runs the real Supabase migrations in PGlite (in-process Postgres + pgvector)
// with small stand-ins for Supabase's auth and storage schemas, then checks RLS.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const M = '44444444-4444-4444-4444-444444444444';
let db;

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, extensions, storage, public to anon, authenticated, service_role;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function auth.jwt() to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  alter table storage.objects enable row level security;
  grant all on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  insert into auth.users values ('${A}', 'owner@example.com'), ('${B}', 'other@example.com'), ('${M}', 'member@example.com');
`;

const EMAIL = { [A]: 'owner@example.com', [B]: 'other@example.com', [M]: 'member@example.com' };
const as = async (uid, sql, params) => {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set request.jwt.claims = '{"email":"${EMAIL[uid] || ''}"}'; set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
};
const vec = (seed) => '[' + Array.from({ length: 1536 }, (_, i) => (i === seed ? 1 : 0.001)).join(',') + ']';

before(async () => {
  db = await PGlite.create({ extensions: { vector } });
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync('supabase/migrations').sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  }
});

test('every public table has row level security enabled', async () => {
  const r = await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(r.rows, []);
});

test('owner_id defaults to the signed-in user and other users see nothing', async () => {
  await as(A, `insert into brain_facts (category, text) values ('identity', 'A runs Ciftron')`);
  await as(B, `insert into brain_facts (category, text) values ('identity', 'B fact')`);
  const a = await as(A, 'select owner_id, text from brain_facts');
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].owner_id, A);
  const b = await as(B, `select * from brain_facts where text = 'A runs Ciftron'`);
  assert.equal(b.rows.length, 0);
});

test('a user cannot write rows owned by someone else', async () => {
  await assert.rejects(as(B, `insert into brain_facts (owner_id, category, text) values ('${A}', 'identity', 'sneaky')`), /row-level security/);
  const upd = await as(B, `update brain_facts set text = 'hacked', version = version + 1 where owner_id = '${A}' returning id`);
  assert.equal(upd.rows.length, 0);
});

test('signed-out (anon) callers see nothing', async () => {
  await db.exec(`reset role; set request.jwt.claim.sub = ''; set role anon;`);
  const r = await db.query('select * from brain_facts');
  await db.exec('reset role;');
  assert.equal(r.rows.length, 0);
});

test('provider_keys is unreadable from the browser roles', async () => {
  await db.query(`insert into provider_keys (owner_id, provider, ciphertext, iv, auth_tag) values ('${A}', 'openai', 'x', 'y', 'z')`);
  await assert.rejects(as(A, 'select * from provider_keys'), /permission denied/);
  await assert.rejects(as(A, `insert into provider_keys (owner_id, provider, ciphertext, iv, auth_tag) values ('${A}', 'anthropic', 'x', 'y', 'z')`), /permission denied/);
});

test('stale saves are rejected by the version check', async () => {
  const { rows: [f] } = await as(A, `insert into brain_facts (category, text) values ('voice', 'Plain words') returning id, version`);
  await as(A, `update brain_facts set text = 'Plain, human words', version = 2 where id = $1`, [f.id]);
  await assert.rejects(as(A, `update brain_facts set text = 'old tab save', version = 2 where id = $1`, [f.id]), /version_conflict/);
  const { rows: [now] } = await as(A, 'select text, version from brain_facts where id = $1', [f.id]);
  assert.equal(now.text, 'Plain, human words');
  assert.equal(now.version, 2);
});

test('audit log is append-only from the browser', async () => {
  await as(A, `insert into audit_log (action) values ('test')`);
  const del = await as(A, `delete from audit_log returning id`);
  assert.equal(del.rows.length, 0);
});

test('only one Brand DNA can be active per owner', async () => {
  await as(A, `insert into brand_dna (version_no, content, markdown, is_active) values (1, '{}', 'v1', true)`);
  await assert.rejects(as(A, `insert into brand_dna (version_no, content, markdown, is_active) values (2, '{}', 'v2', true)`), /duplicate key/);
});

test('match_chunks returns only the caller\'s chunks, nearest first', async () => {
  const { rows: [sa] } = await as(A, `insert into brain_sources (kind, name) values ('text', 'A notes') returning id`);
  const { rows: [sb] } = await as(B, `insert into brain_sources (kind, name) values ('text', 'B notes') returning id`);
  await as(A, `insert into brain_chunks (source_id, idx, content, embedding) values ($1, 0, 'follow-up speed', $2), ($1, 1, 'pricing', $3)`, [sa.id, vec(1), vec(2)]);
  await as(B, `insert into brain_chunks (source_id, idx, content, embedding) values ($1, 0, 'B secret', $2)`, [sb.id, vec(1)]);
  const r = await as(A, `select source_name, content, similarity from match_chunks($1::extensions.vector, 5, 0.0)`, [vec(1)]);
  assert.equal(r.rows[0].content, 'follow-up speed');
  assert.ok(r.rows.every((x) => x.source_name === 'A notes'));
});

test('storage: files only under the owner folder', async () => {
  await as(A, `insert into storage.objects (bucket_id, name) values ('brain', '${A}/doc.pdf')`);
  await assert.rejects(as(A, `insert into storage.objects (bucket_id, name) values ('brain', '${B}/doc.pdf')`), /row-level security/);
  const r = await as(B, `select * from storage.objects where bucket_id = 'brain'`);
  assert.equal(r.rows.length, 0);
});

// Phase 6
const asService = async (sql, params) => {
  await db.exec(`reset role; set role service_role;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
};

test('match_chunks_for: browser roles cannot call it; the service role gets one owner only', async () => {
  await assert.rejects(as(A, `select * from match_chunks_for($1, $2::extensions.vector, 5, 0.0)`, [A, vec(1)]), /permission denied/);
  const r = await asService(`select source_name, content from match_chunks_for($1, $2::extensions.vector, 5, 0.0)`, [A, vec(1)]);
  assert.ok(r.rows.length >= 1);
  assert.ok(r.rows.every((x) => x.source_name === 'A notes'));
});

test('mcp tables: owner can read, never write from the browser, and never sees token hashes', async () => {
  const { rows: [tok] } = await db.query(`insert into mcp_tokens (owner_id, name, token_hash, scope, token_prefix) values ($1, 'cli', 'abc123', 'read', 'cfos_abc') returning id`, [A]);
  const r = await as(A, 'select id, name, scope, token_prefix from mcp_tokens');
  assert.equal(r.rows.length, 1);
  await assert.rejects(as(A, 'select token_hash from mcp_tokens'), /permission denied/);
  assert.equal((await as(B, 'select id, name from mcp_tokens')).rows.length, 0);
  await assert.rejects(as(A, `insert into mcp_tokens (owner_id, name, token_hash, scope) values ($1, 'x', 'y', 'read')`, [A]), /row-level security|permission denied/);
  await assert.rejects(as(A, `update mcp_tokens set scope = 'read_write' where id = $1`, [tok.id]), /permission denied/);
  await db.query(`insert into mcp_edit_log (owner_id, token_id, action, tool, table_name, row_id, previous_value, new_value, row_version) values ($1, $2, 'update', 'update_goal', 'goals', gen_random_uuid(), '{}', '{}', 2)`, [A, tok.id]);
  assert.equal((await as(A, 'select id from mcp_edit_log')).rows.length, 1);
  await assert.rejects(as(A, `update mcp_edit_log set undone_at = now()`), /permission denied/);
  await assert.rejects(as(A, `insert into mcp_edit_log (owner_id, table_name, row_id) values ($1, 'goals', gen_random_uuid())`, [A]), /row-level security|permission denied/);
});

test('agent_routines: schedule columns are checked and rows stay with their owner', async () => {
  const { rows: [ag] } = await as(A, `insert into agents (slug, name) values ('content-strategist', 'Content Strategist') returning id`);
  await as(A, `insert into agent_routines (agent_id, cadence, prompt, weekday, language, enabled) values ($1, 'weekly', 'Plan next week', 1, 'fr-qc', true)`, [ag.id]);
  await assert.rejects(as(A, `insert into agent_routines (agent_id, cadence, prompt, weekday) values ($1, 'weekly', 'x', 9)`, [ag.id]), /check/);
  await assert.rejects(as(A, `insert into agent_routines (agent_id, cadence, prompt, day_of_month) values ($1, 'monthly', 'x', 31)`, [ag.id]), /check/);
  assert.equal((await as(B, 'select * from agent_routines')).rows.length, 0);
});

// Phase 7
test('error_log: owner reads own rows only, and cannot write or delete from the browser', async () => {
  await asService(`insert into error_log (owner_id, source, route, message) values ($1, 'server', '/api/chat', 'boom'), ($2, 'server', '/api/chat', 'other')`, [A, B]);
  const r = await as(A, 'select message from error_log');
  assert.deepEqual(r.rows.map((x) => x.message), ['boom']);
  await assert.rejects(as(A, `insert into error_log (owner_id, source, message) values ($1, 'browser', 'x')`, [A]), /permission denied/);
  await assert.rejects(as(A, 'delete from error_log'), /permission denied/);
  await assert.rejects(as(A, `insert into error_log (owner_id, source, message) values ($1, 'nope', 'x')`, [A]).catch(() => asService(`insert into error_log (owner_id, source, message) values ($1, 'nope', 'x')`, [A])), /check/);
});

// Team members
test('members work on the owner data; settings, keys and MCP stay with the owner', async () => {
  // Before joining, M sees nothing of A's.
  assert.equal((await as(M, 'select * from brain_facts')).rows.length, 0);
  await asService(`insert into workspace_members (owner_id, member_id, email) values ($1, $2, 'member@example.com')`, [A, M]);
  assert.equal((await as(M, 'select public.workspace_owner() as o')).rows[0].o, A);
  assert.equal((await as(A, 'select public.workspace_owner() as o')).rows[0].o, A);
  // Reads and writes A's work; new rows belong to A.
  assert.ok((await as(M, 'select * from brain_facts')).rows.every((r) => r.owner_id === A));
  const { rows: [f] } = await as(M, `insert into brain_facts (category, text) values ('voice', 'From the member') returning owner_id`);
  assert.equal(f.owner_id, A);
  assert.equal((await as(B, `select * from brain_facts where text = 'From the member'`)).rows.length, 0);
  // Logs record who did it.
  const { rows: [a] } = await as(M, `insert into audit_log (owner_id, action, entity) values ($1, 'test', 'x') returning actor_email`, [A]);
  assert.equal(a.actor_email, 'member@example.com');
  // Settings: readable, not writable.
  await asService(`insert into connections (owner_id, provider, config) values ($1, 'highlevel', '{"location_id":"loc"}') on conflict do nothing`, [A]);
  assert.equal((await as(M, `select * from connections where provider = 'highlevel'`)).rows.length, 1);
  assert.equal((await as(M, `update connections set config = '{}' where provider = 'highlevel' returning provider`)).rows.length, 0);
  await assert.rejects(as(M, `insert into connections (owner_id, provider, config) values ($1, 'openai', '{}')`, [A]), /row-level security/);
  // Keys and MCP: never.
  await assert.rejects(as(M, 'select * from provider_keys'), /permission denied/);
  assert.equal((await as(M, 'select id from mcp_tokens')).rows.length, 0);
  assert.equal((await as(M, 'select id from mcp_edit_log')).rows.length, 0);
  // Files: the owner's folder only.
  await as(M, `insert into storage.objects (bucket_id, name) values ('brain', '${A}/chat/x.png')`);
  await assert.rejects(as(M, `insert into storage.objects (bucket_id, name) values ('brain', '${M}/x.png')`), /row-level security/);
  // The team list: visible to both, editable by neither from the browser.
  assert.equal((await as(A, 'select email from workspace_members')).rows.length, 1);
  assert.equal((await as(M, 'select email from workspace_members')).rows.length, 1);
  assert.equal((await as(B, 'select email from workspace_members')).rows.length, 0);
  await assert.rejects(as(A, `insert into workspace_members (owner_id, member_id, email) values ($1, $2, 'x')`, [A, B]), /permission denied/);
  // Removed: back to nothing.
  await asService(`delete from workspace_members where member_id = $1`, [M]);
  assert.equal((await as(M, 'select * from brain_facts')).rows.length, 0);
});

test('voice_playbook and apify_runs: workspace-scoped, and playbook edits need the current version', async () => {
  const { rows: [p] } = await as(A, `insert into voice_playbook (question, answer) values ('How fast?', 'Five minutes') returning id, version, owner_id, status`);
  assert.deepEqual([p.owner_id, p.status, p.version], [A, 'proposed', 1]);
  await assert.rejects(as(A, `update voice_playbook set answer = 'x', version = 1 where id = $1`, [p.id]), /version_conflict/);
  await as(A, `update voice_playbook set status = 'approved', version = 2 where id = $1`, [p.id]);
  assert.equal((await as(B, 'select * from voice_playbook')).rows.length, 0);
  await as(A, `insert into apify_runs (platform, actor, status, cost_usd, items, outliers) values ('Instagram', 'apify~instagram-post-scraper', 'SUCCEEDED', 0.0123, 24, 3)`);
  assert.equal(Number((await as(A, 'select cost_usd from apify_runs')).rows[0].cost_usd), 0.0123);
  assert.equal((await as(B, 'select * from apify_runs')).rows.length, 0);
  await assert.rejects(as(A, `insert into content_items (title, format, funnel_stage) values ('x', 'Idea', 'nope')`), /check/);
});

test('calls and revenue_entries: workspace-scoped with checked values; calls need the current version', async () => {
  const { rows: [c] } = await as(A, `insert into calls (title, source, transcript) values ('Discovery', 'paste', 'Marc: hi') returning id, owner_id, version, kind, status`);
  assert.deepEqual([c.owner_id, c.version, c.kind, c.status], [A, 1, 'sales', 'new']);
  await assert.rejects(as(A, `insert into calls (title, source, transcript) values ('x', 'zoom', 't')`), /check/);
  await assert.rejects(as(A, `update calls set status = 'analyzed', version = 1 where id = $1`, [c.id]), /version_conflict/);
  await as(A, `insert into calls (title, source, transcript, external_id) values ('Meet', 'google_meet', 't', 'conferenceRecords/r/transcripts/t')`);
  await assert.rejects(as(A, `insert into calls (title, source, transcript, external_id) values ('Meet again', 'google_meet', 't', 'conferenceRecords/r/transcripts/t')`), /duplicate|unique/);
  assert.equal((await as(B, 'select * from calls')).rows.length, 0);
  await as(A, `insert into revenue_entries (amount, currency, client, recurring) values (1500, 'CAD', 'Batisseur', true)`);
  await assert.rejects(as(A, `insert into revenue_entries (amount, currency) values (0, 'USD')`), /check/);
  await assert.rejects(as(A, `insert into revenue_entries (amount, currency) values (10, 'usd')`), /check/);
  assert.equal((await as(B, 'select * from revenue_entries')).rows.length, 0);
});

test('funnel_pages and program_decks: workspace-scoped, tokens unique and long, decks need the current version', async () => {
  const { rows: [f] } = await as(A, `insert into funnels (name, funnel_type) values ('Review call', 'Sales funnel') returning id`);
  const { rows: [pg] } = await as(A, `insert into funnel_pages (funnel_id, version_no, html, public_token) values ($1, 1, '<html></html>', 'tok_abcdefghijklmnop') returning owner_id, shared, status`, [f.id]);
  assert.deepEqual([pg.owner_id, pg.shared, pg.status], [A, true, 'draft']);
  await assert.rejects(as(A, `insert into funnel_pages (funnel_id, version_no, html, public_token) values ($1, 2, 'x', 'short')`, [f.id]), /check/);
  await assert.rejects(as(A, `insert into funnel_pages (funnel_id, version_no, html, public_token) values ($1, 2, 'x', 'tok_abcdefghijklmnop')`, [f.id]), /duplicate|unique/);
  await assert.rejects(as(A, `insert into funnel_pages (funnel_id, version_no, html, public_token) values ($1, 1, 'x', 'tok_zzzzzzzzzzzzzzzz')`, [f.id]), /duplicate|unique/);
  await assert.rejects(as(A, `insert into funnel_pages (funnel_id, version_no, html, public_token, status) values ($1, 3, 'x', 'tok_yyyyyyyyyyyyyyyy', 'live')`, [f.id]), /check/);
  assert.equal((await as(B, 'select * from funnel_pages')).rows.length, 0);
  const { rows: [p] } = await as(A, `insert into programs (name) values ('Lead Speed') returning id`);
  const { rows: [d] } = await as(A, `insert into program_decks (program_id, title, slides) values ($1, 'Deck', '[{"layout":"title","title":"A"}]') returning id, version, status`, [p.id]);
  assert.deepEqual([d.version, d.status], [1, 'draft']);
  await assert.rejects(as(A, `update program_decks set status = 'approved', version = 1 where id = $1`, [d.id]), /version_conflict/);
  await as(A, `update program_decks set status = 'approved', version = 2 where id = $1`, [d.id]);
  assert.equal((await as(B, 'select * from program_decks')).rows.length, 0);
  await as(A, `delete from programs where id = $1`, [p.id]);
  assert.equal((await as(A, 'select * from program_decks')).rows.length, 0, 'decks go with their program');
});

test('custom_connections: owner writes, members read, strangers see nothing; checks on address and auth; design rules capped', async () => {
  await asService(`insert into workspace_members (owner_id, member_id, email) values ($1, $2, 'member@example.com') on conflict do nothing`, [A, M]);
  const { rows: [c] } = await as(A, `insert into custom_connections (name, base_url, auth, endpoints) values ('Calendly', 'https://api.calendly.com', 'bearer', '[{"name":"Events","path":"/scheduled_events"}]') returning id, owner_id, version`);
  assert.deepEqual([c.owner_id, c.version], [A, 1]);
  await assert.rejects(as(A, `insert into custom_connections (name, base_url) values ('Bad', 'http://x.com')`), /check/);
  await assert.rejects(as(A, `insert into custom_connections (name, base_url, auth) values ('Bad2', 'https://x.com', 'cookie')`), /check/);
  await assert.rejects(as(A, `insert into custom_connections (name, base_url, auth_name) values ('Bad3', 'https://x.com', 'X Key')`), /check/);
  await assert.rejects(as(A, `insert into custom_connections (name, base_url) values ('Calendly', 'https://x.com')`), /duplicate|unique/);
  await assert.rejects(as(A, `update custom_connections set name = 'C2', version = 1 where id = $1`, [c.id]), /version_conflict/);
  assert.equal((await as(M, 'select name from custom_connections')).rows.length, 1, 'members can see and use connections');
  assert.equal((await as(M, `update custom_connections set name = 'Hacked', version = 2 where id = $1 returning id`, [c.id])).rows.length, 0, 'members cannot change them');
  await assert.rejects(as(M, `insert into custom_connections (name, base_url, owner_id) values ('Mine', 'https://x.com', $1)`, [A]), /row-level security|violates/);
  assert.equal((await as(B, 'select * from custom_connections')).rows.length, 0);
  await as(A, `insert into brand_board (owner_id, design_rules) values ($1, 'No gradients') on conflict (owner_id) do update set design_rules = 'No gradients'`, [A]);
  await assert.rejects(as(A, `update brand_board set design_rules = 'stale'`), /version_conflict/);
  await assert.rejects(as(A, `update brand_board set design_rules = repeat('x', 4001), version = version + 1`), /check/);
  await asService(`delete from workspace_members where member_id = $1`, [M]);
});
