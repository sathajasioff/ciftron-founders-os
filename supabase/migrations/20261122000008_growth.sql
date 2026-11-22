-- Phase 8: your own feed, content funnel, voice playbook, Apify cost tracking.

-- Feed: engagement numbers and thumbnails, so posts without view counts (Facebook, LinkedIn) still rank.
alter table public.research_posts add column if not exists likes int;
alter table public.research_posts add column if not exists comments int;
alter table public.research_posts add column if not exists shares int;
alter table public.research_posts add column if not exists engagement int;
alter table public.research_posts add column if not exists thumbnail_url text;
alter table public.research_creators add column if not exists profile_url text;

-- Apify runs and what they cost.
create table if not exists public.apify_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.workspace_owner() references auth.users(id) on delete cascade,
  creator_id uuid references public.research_creators(id) on delete set null,
  platform text not null,
  actor text not null,
  run_id text,
  status text not null,
  cost_usd numeric(10, 4),
  items int not null default 0,
  outliers int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists apify_runs_owner_idx on public.apify_runs (owner_id, created_at desc);

-- Content funnel stage on cards.
alter table public.content_items add column if not exists funnel_stage text check (funnel_stage in ('tofu', 'mofu', 'bofu'));

-- Voice playbook: how the owner answers common questions. Approved pairs shape every draft.
create table if not exists public.voice_playbook (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.workspace_owner() references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  source_quote text,
  authored_by text not null default 'ai' check (authored_by in ('me', 'ai')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists voice_playbook_owner_idx on public.voice_playbook (owner_id, status);
drop trigger if exists voice_playbook_version on public.voice_playbook;
create trigger voice_playbook_version before update on public.voice_playbook for each row execute function public.enforce_version();

do $$
declare t text;
begin
  foreach t in array array['apify_runs', 'voice_playbook']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists workspace_all on public.%I', t);
    execute format('create policy workspace_all on public.%I for all to authenticated using (owner_id = (select public.workspace_owner())) with check (owner_id = (select public.workspace_owner()))', t);
  end loop;
end $$;
