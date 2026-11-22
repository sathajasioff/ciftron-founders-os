-- Founders AI OS: core schema.
-- Single owner, but every table has owner_id and row level security anyway.
-- Run in the Supabase SQL editor, or with `supabase db push`.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Optimistic locking: every update must set version = old.version + 1.
-- A stale save (built on an older version) fails instead of overwriting newer work.
create or replace function public.enforce_version() returns trigger
language plpgsql as $$
begin
  if new.version is distinct from old.version + 1 then
    raise exception 'version_conflict: row % is at version %, update expected %', old.id, old.version, new.version - 1
      using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Core and settings
-- ---------------------------------------------------------------------------

create table public.profiles (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  full_name text,
  timezone text default 'America/Toronto',
  theme text default 'light' check (theme in ('light', 'dark')),
  language text default 'en' check (language in ('en', 'fr')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Encrypted provider keys. Browser roles get no access at all; only server functions
-- (service role) read this table, and the values are AES-256-GCM encrypted.
create table public.provider_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  field text not null default 'api_key',
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  last4 text,
  status text not null default 'untested' check (status in ('untested', 'ok', 'error')),
  test_message text,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider, field)
);

-- Non-secret connection settings (HighLevel Location ID, Meta ad account ID, MCP URLs).
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Brain
-- ---------------------------------------------------------------------------

-- Offers as positioning context. HighLevel still owns real products and prices.
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  price numeric(12, 2),
  currency text not null default 'USD',
  cadence text not null default 'month' check (cadence in ('one_time', 'month', 'year')),
  status text not null default 'live' check (status in ('live', 'paused', 'draft')),
  services text[] not null default '{}',
  hl_product_id text,
  in_dna boolean not null default true,
  sort int not null default 0,
  authored_by text not null default 'me' check (authored_by in ('me', 'ai')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brain_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('file', 'link', 'text')),
  name text not null,
  mime text,
  storage_path text,
  url text,
  content text,
  is_writing_sample boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
  error text,
  text_length int,
  chunk_count int not null default 0,
  facts_proposed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brain_chunks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid not null references public.brain_sources(id) on delete cascade,
  idx int not null,
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);
create index brain_chunks_source_idx on public.brain_chunks (source_id);
create index brain_chunks_embedding_idx on public.brain_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.brain_facts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('identity', 'offers', 'audience', 'voice', 'beliefs', 'proof', 'goals', 'tools', 'never_say')),
  text text not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  starred boolean not null default false,
  source_id uuid references public.brain_sources(id) on delete set null,
  source_quote text,
  authored_by text not null default 'ai' check (authored_by in ('me', 'ai')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brain_facts_owner_status_idx on public.brain_facts (owner_id, status);

create table public.style_guides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version_no int not null,
  guide jsonb not null,
  sample_source_ids uuid[] not null default '{}',
  authored_by text not null default 'ai' check (authored_by in ('me', 'ai')),
  created_at timestamptz not null default now(),
  unique (owner_id, version_no)
);

create table public.brand_dna (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version_no int not null,
  content jsonb not null,
  markdown text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, version_no)
);
create unique index brand_dna_one_active on public.brand_dna (owner_id) where is_active;

-- ---------------------------------------------------------------------------
-- AI chat, team and approvals (Phase 3)
-- ---------------------------------------------------------------------------

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  role text,
  instructions text not null default '',
  model text,
  enabled boolean not null default false,
  pinned boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  title text,
  strategy_room boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'strategist', 'challenger', 'verdict', 'system')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

create table public.agent_routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  prompt text not null,
  enabled boolean not null default false,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  language text not null default 'en' check (language in ('en', 'fr-qc')),
  source_agent text,
  target_module text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'passed')),
  trashed_at timestamptz,
  authored_by text not null default 'ai' check (authored_by in ('me', 'ai')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index approvals_status_idx on public.approvals (owner_id, status) where trashed_at is null;

-- ---------------------------------------------------------------------------
-- Creation studio (Phase 5; tables exist so the shape is fixed early)
-- ---------------------------------------------------------------------------

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  format text not null,
  channel text,
  language text not null default 'en' check (language in ('en', 'fr-qc')),
  stage text not null default 'Idea',
  publish_date date,
  hook text,
  notes text,
  tasks jsonb not null default '{"script":false,"film":false,"edit":false,"thumbnail":false,"upload":false}'::jsonb,
  approval_id uuid references public.approvals(id) on delete set null,
  authored_by text not null default 'me' check (authored_by in ('me', 'ai')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_creators (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  platform text not null,
  handle text not null,
  is_mine boolean not null default false,
  median_views int,
  created_at timestamptz not null default now(),
  unique (owner_id, platform, handle)
);

create table public.research_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creator_id uuid not null references public.research_creators(id) on delete cascade,
  external_id text not null,
  title text,
  url text,
  format text,
  views int,
  outlier_score numeric(8, 2),
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (owner_id, creator_id, external_id)
);

create table public.learning_signals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  signal text not null,
  evidence text,
  weight text not null default 'medium' check (weight in ('low', 'medium', 'high')),
  state text not null default 'on' check (state in ('on', 'paused', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.funnels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  funnel_type text not null,
  offer_id uuid references public.offers(id) on delete set null,
  brief jsonb not null default '{}'::jsonb,
  order_form_url text,
  current_version int not null default 0,
  status text not null default 'draft',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.funnel_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  version_no int not null,
  output jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  unique (funnel_id, version_no)
);

create table public.email_sequences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sequence_type text not null,
  offer_id uuid references public.offers(id) on delete set null,
  language text not null default 'en' check (language in ('en', 'fr-qc')),
  emails jsonb not null default '[]'::jsonb,
  authored_by text not null default 'ai' check (authored_by in ('me', 'ai')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brand_board (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  palettes jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '[]'::jsonb,
  logo_path text,
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 20),
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table public.graphics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  format text not null,
  width int not null,
  height int not null,
  brief jsonb not null default '{}'::jsonb,
  current_version int not null default 0,
  created_at timestamptz not null default now()
);

create table public.graphic_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  graphic_id uuid not null references public.graphics(id) on delete cascade,
  version_no int not null,
  storage_path text not null,
  prompt text,
  created_at timestamptz not null default now(),
  unique (graphic_id, version_no)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  stage text not null default 'idea',
  private_notes text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_modules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  title text not null,
  sort int not null default 0
);

create table public.program_lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  module_id uuid not null references public.program_modules(id) on delete cascade,
  title text not null,
  body text,
  file_paths text[] not null default '{}',
  sort int not null default 0
);

-- Vault items are inspiration only. There is deliberately no link to brain_facts.
create table public.vault_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('url', 'text', 'screenshot')),
  title text not null,
  url text,
  body text,
  storage_path text,
  note text,
  brief jsonb,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  raw text not null,
  target text,
  metric_source text check (metric_source in ('highlevel', 'meta_ads', 'content', 'manual')),
  target_value numeric,
  current_value numeric not null default 0,
  unit text,
  due_date date,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- HighLevel and MCP (Phases 4 and 6)
-- ---------------------------------------------------------------------------

create table public.hl_write_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null,
  target text not null,
  payload jsonb not null,
  response jsonb,
  status text not null check (status in ('sent', 'failed')),
  created_at timestamptz not null default now()
);

create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  scope text not null check (scope in ('read', 'read_write')),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mcp_edit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid references public.mcp_tokens(id) on delete set null,
  table_name text not null,
  row_id uuid not null,
  previous_value jsonb,
  new_value jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  -- Tables with optimistic locking.
  foreach t in array array['offers', 'brain_facts', 'agents', 'approvals', 'content_items', 'funnels', 'email_sequences', 'brand_board', 'programs', 'goals']
  loop
    execute format('create trigger %I_version before update on public.%I for each row execute function public.enforce_version()', t, t);
  end loop;
  -- Tables with a plain updated_at.
  foreach t in array array['profiles', 'provider_keys', 'connections', 'brain_sources', 'threads', 'learning_signals']
  loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  -- Full owner access.
  foreach t in array array[
    'profiles', 'connections', 'offers', 'brain_sources', 'brain_chunks', 'brain_facts', 'style_guides', 'brand_dna',
    'agents', 'threads', 'messages', 'agent_routines', 'approvals', 'content_items', 'research_creators', 'research_posts',
    'learning_signals', 'funnels', 'funnel_versions', 'email_sequences', 'brand_board', 'graphics', 'graphic_versions',
    'programs', 'program_modules', 'program_lessons', 'vault_items', 'goals', 'goal_items']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;

  -- Append-only logs: the owner can read and add, never edit or delete from the browser.
  foreach t in array array['audit_log', 'hl_write_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
  end loop;

  -- MCP tables: read-only from the browser; server functions manage them.
  foreach t in array array['mcp_tokens', 'mcp_edit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;

  -- Secrets: RLS on with no policy, and no grants. Only the service role reaches it.
  execute 'alter table public.provider_keys enable row level security';
  execute 'revoke all on public.provider_keys from anon, authenticated';
end $$;

-- Hide token hashes from the browser even though the owner can list tokens.
revoke select (token_hash) on public.mcp_tokens from authenticated;

-- ---------------------------------------------------------------------------
-- Brain search. Runs as the caller, so RLS limits it to the owner's chunks.
-- ---------------------------------------------------------------------------

create or replace function public.match_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 8,
  min_similarity float default 0.2
) returns table (id uuid, source_id uuid, source_name text, idx int, content text, similarity float)
language sql stable security invoker set search_path = public, extensions as $$
  select c.id, c.source_id, s.name, c.idx, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.brain_chunks c
  join public.brain_sources s on s.id = c.source_id
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit least(match_count, 50);
$$;
