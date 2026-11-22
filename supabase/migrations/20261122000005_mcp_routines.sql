-- Phase 6: MCP server and recurring routines.

-- Brain search for the MCP server and routines. These run with the service role, which
-- skips row level security, so the owner is passed in and filtered on explicitly.
-- Browser roles cannot call it; they keep using match_chunks, which runs as the caller.
create or replace function public.match_chunks_for(
  p_owner uuid,
  query_embedding extensions.vector(1536),
  match_count int default 8,
  min_similarity float default 0.2
) returns table (id uuid, source_id uuid, source_name text, idx int, content text, similarity float)
language sql stable security invoker set search_path = public, extensions as $$
  select c.id, c.source_id, s.name, c.idx, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.brain_chunks c
  join public.brain_sources s on s.id = c.source_id and s.owner_id = p_owner
  where c.owner_id = p_owner
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit least(match_count, 50);
$$;
revoke all on function public.match_chunks_for(uuid, extensions.vector, int, float) from public, anon, authenticated;
grant execute on function public.match_chunks_for(uuid, extensions.vector, int, float) to service_role;

-- MCP tokens: a short prefix so the owner can tell tokens apart. The token itself is never stored.
alter table public.mcp_tokens add column if not exists token_prefix text;

-- MCP edit log: what kind of change, which tool, and the row version right after the edit.
-- Undo only runs if the row is still at that version, so later work is never overwritten.
alter table public.mcp_edit_log add column if not exists action text not null default 'update' check (action in ('insert', 'update'));
alter table public.mcp_edit_log add column if not exists tool text;
alter table public.mcp_edit_log add column if not exists row_version int;
create index if not exists mcp_edit_log_owner_idx on public.mcp_edit_log (owner_id, created_at desc);

-- Routines: when they run and how the last run went. Each run only creates drafts in Approvals.
alter table public.agent_routines add column if not exists title text;
alter table public.agent_routines add column if not exists weekday int check (weekday between 0 and 6);
alter table public.agent_routines add column if not exists day_of_month int check (day_of_month between 1 and 28);
alter table public.agent_routines add column if not exists language text not null default 'en' check (language in ('en', 'fr-qc'));
alter table public.agent_routines add column if not exists last_status text check (last_status in ('ok', 'error', 'skipped'));
alter table public.agent_routines add column if not exists last_error text;
alter table public.agent_routines add column if not exists last_draft_count int;
create index if not exists agent_routines_owner_idx on public.agent_routines (owner_id, enabled);

-- Hide token hashes from the browser. A column revoke alone does nothing while the
-- table-level grant exists, so replace the table grant with a list of safe columns.
revoke all on public.mcp_tokens from anon, authenticated;
grant select (id, owner_id, name, scope, token_prefix, last_used_at, revoked_at, created_at) on public.mcp_tokens to authenticated;
-- The edit log is written by the server only.
revoke insert, update, delete on public.mcp_edit_log from anon, authenticated;
