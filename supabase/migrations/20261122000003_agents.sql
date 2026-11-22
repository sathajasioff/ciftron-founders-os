-- Phase 3: agent ordering and faster thread lookups.
alter table public.agents add column if not exists sort int not null default 0;
create index if not exists threads_owner_agent_idx on public.threads (owner_id, agent_id, updated_at desc);
create index if not exists approvals_source_agent_idx on public.approvals (owner_id, source_agent, created_at desc);
