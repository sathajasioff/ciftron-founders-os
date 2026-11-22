-- Phase 10: designed funnel pages with private preview links, and program slide decks.

create table if not exists public.funnel_pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.workspace_owner() references auth.users(id) on delete cascade,
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  funnel_version_id uuid references public.funnel_versions(id) on delete set null,
  version_no int not null,
  style text not null default 'brand',
  html text not null check (length(html) <= 300000),
  public_token text not null unique check (length(public_token) >= 16),
  shared boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approval_id uuid references public.approvals(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (funnel_id, version_no)
);
create index if not exists funnel_pages_owner_idx on public.funnel_pages (owner_id, funnel_id);

create table if not exists public.program_decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.workspace_owner() references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  module_id uuid references public.program_modules(id) on delete set null,
  title text not null,
  style text not null default 'brand',
  slides jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approval_id uuid references public.approvals(id) on delete set null,
  authored_by text not null default 'ai' check (authored_by in ('me', 'ai')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists program_decks_owner_idx on public.program_decks (owner_id, program_id);
drop trigger if exists program_decks_version on public.program_decks;
create trigger program_decks_version before update on public.program_decks for each row execute function public.enforce_version();

do $$
declare t text;
begin
  foreach t in array array['funnel_pages', 'program_decks']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists workspace_all on public.%I', t);
    execute format('create policy workspace_all on public.%I for all to authenticated using (owner_id = (select public.workspace_owner())) with check (owner_id = (select public.workspace_owner()))', t);
  end loop;
end $$;
-- Preview links are served by the server (service role) by token; the public has no table access.
