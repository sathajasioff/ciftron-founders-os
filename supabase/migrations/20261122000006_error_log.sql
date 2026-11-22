-- Phase 7: error log. Server functions write here (secrets redacted first).
-- The owner can read it from Settings; only the server can add or remove rows.
create table if not exists public.error_log (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  source text not null check (source in ('server', 'browser', 'cron', 'mcp')),
  route text,
  status int,
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists error_log_owner_idx on public.error_log (owner_id, created_at desc);
create index if not exists error_log_created_idx on public.error_log (created_at);

alter table public.error_log enable row level security;
drop policy if exists owner_read on public.error_log;
create policy owner_read on public.error_log for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on public.error_log from anon, authenticated;
