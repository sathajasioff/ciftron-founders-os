-- Phase 5: creation studio. Drafts made inside a module still pass through Approvals.

alter table public.email_sequences add column if not exists status text not null default 'draft' check (status in ('draft', 'approved'));
alter table public.email_sequences add column if not exists approval_id uuid references public.approvals(id) on delete set null;

alter table public.funnel_versions add column if not exists status text not null default 'draft' check (status in ('draft', 'approved'));
alter table public.funnel_versions add column if not exists approval_id uuid references public.approvals(id) on delete set null;

alter table public.graphic_versions add column if not exists status text not null default 'draft' check (status in ('draft', 'approved'));
alter table public.graphic_versions add column if not exists approval_id uuid references public.approvals(id) on delete set null;
alter table public.graphics add column if not exists title text;

alter table public.goals add column if not exists metric_key text;
alter table public.goals add column if not exists start_date date not null default current_date;
alter table public.goals add column if not exists last_synced_at timestamptz;

alter table public.learning_signals add column if not exists key text;
create unique index if not exists learning_signals_owner_key on public.learning_signals (owner_id, key);

alter table public.programs add column if not exists description text;
alter table public.vault_items add column if not exists briefed_at timestamptz;
alter table public.research_creators add column if not exists last_fetched_at timestamptz;
alter table public.research_creators add column if not exists fetch_error text;

create index if not exists content_items_owner_date_idx on public.content_items (owner_id, publish_date);
create index if not exists research_posts_score_idx on public.research_posts (owner_id, outlier_score desc);
