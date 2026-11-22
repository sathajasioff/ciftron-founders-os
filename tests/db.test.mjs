// Runs the real Supabase migrations in PGlite (in-process Postgres + pgvector)
// with small stand-ins for Supabase's auth and storage schemas, then checks RLS.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
let db;

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, extensions, storage, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  alter table storage.objects enable row level security;
  grant all on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  insert into auth.users values ('${A}', 'owner@example.com'), ('${B}', 'other@example.com');
`;

const as = async (uid, sql, params) => {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set role authenticated;`);
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
