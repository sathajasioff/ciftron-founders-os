-- Phase 11: custom read-only API connections, and design rules on the brand board.
-- New agents need no migration: they are added on the next sign-in without touching existing agents.

create table if not exists public.custom_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.workspace_owner() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  base_url text not null check (base_url like 'https://%' and length(base_url) <= 300),
  auth text not null default 'bearer' check (auth in ('bearer', 'header', 'query', 'none')),
  auth_name text check (auth_name is null or auth_name ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
  endpoints jsonb not null default '[]'::jsonb check (jsonb_typeof(endpoints) = 'array' and jsonb_array_length(endpoints) <= 20),
  last_status text check (last_status in ('ok', 'error')),
  last_message text,
  last_tested_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);
create index if not exists custom_connections_owner_idx on public.custom_connections (owner_id);
drop trigger if exists custom_connections_version on public.custom_connections;
create trigger custom_connections_version before update on public.custom_connections for each row execute function public.enforce_version();

alter table public.custom_connections enable row level security;
-- Like the other settings: the team can see connections and use them; only the owner adds, changes or removes them.
drop policy if exists workspace_read on public.custom_connections;
drop policy if exists owner_write on public.custom_connections;
create policy workspace_read on public.custom_connections for select to authenticated using (owner_id = (select public.workspace_owner()));
create policy owner_write on public.custom_connections for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Keys for these live encrypted in provider_keys (provider 'custom:<id>'), which the browser cannot read.

-- Design rules: how graphics, funnel pages and slides should look, in the owner's words.
alter table public.brand_board add column if not exists design_rules text check (design_rules is null or length(design_rules) <= 4000);

-- Fix: the version check named old.id, which brand_board (keyed by owner_id) does not have, so a stale brand board save
-- failed with a confusing error instead of version_conflict.
create or replace function public.enforce_version() returns trigger
language plpgsql as $$
begin
  if new.version is distinct from old.version + 1 then
    raise exception 'version_conflict: row % is at version %, update expected %', coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'owner_id'), old.version, new.version - 1
      using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end $$;
