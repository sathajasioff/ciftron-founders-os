-- Phase 9: calls (Google Meet, uploads), revenue (manual entries; Stripe is read live), Google connection.

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.workspace_owner() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'sales' check (kind in ('sales', 'coaching', 'team', 'other')),
  occurred_at timestamptz,
  source text not null check (source in ('google_meet', 'upload', 'paste')),
  external_id text,
  transcript text not null,
  duration_min int,
  speakers text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'analyzed', 'error')),
  analysis jsonb,
  error text,
  brain_source_id uuid references public.brain_sources(id) on delete set null,
  authored_by text not null default 'me' check (authored_by in ('me', 'ai')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, external_id)
);
create index if not exists calls_owner_idx on public.calls (owner_id, occurred_at desc);
drop trigger if exists calls_version on public.calls;
create trigger calls_version before update on public.calls for each row execute function public.enforce_version();

create table if not exists public.revenue_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.workspace_owner() references auth.users(id) on delete cascade,
  occurred_on date not null default current_date,
  amount numeric(12, 2) not null check (amount <> 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  client text,
  description text,
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists revenue_entries_owner_idx on public.revenue_entries (owner_id, occurred_on desc);
drop trigger if exists revenue_entries_touch on public.revenue_entries;
create trigger revenue_entries_touch before update on public.revenue_entries for each row execute function public.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['calls', 'revenue_entries']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists workspace_all on public.%I', t);
    execute format('create policy workspace_all on public.%I for all to authenticated using (owner_id = (select public.workspace_owner())) with check (owner_id = (select public.workspace_owner()))', t);
  end loop;
end $$;
