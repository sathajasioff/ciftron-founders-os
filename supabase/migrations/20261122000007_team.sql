-- Team members: people the owner invites can sign in and work on the owner's data.
-- Members can do everything except manage keys, MCP tokens, the team, export and delete.
-- Every row still belongs to the owner (owner_id); a member acts inside the owner's workspace.

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('member')),
  created_at timestamptz not null default now(),
  check (member_id <> owner_id)
);
create index if not exists workspace_members_owner_idx on public.workspace_members (owner_id);
alter table public.workspace_members enable row level security;
drop policy if exists see_own_team on public.workspace_members;
create policy see_own_team on public.workspace_members for select to authenticated
  using (owner_id = (select auth.uid()) or member_id = (select auth.uid()));
revoke insert, update, delete on public.workspace_members from anon, authenticated;

-- The workspace the caller works in: the owner they belong to, or themselves.
-- Security definer so it can read workspace_members under row level security.
create or replace function public.workspace_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select m.owner_id from public.workspace_members m where m.member_id = auth.uid()), auth.uid());
$$;
revoke all on function public.workspace_owner() from public, anon;
grant execute on function public.workspace_owner() to authenticated, service_role;

do $$
declare t text;
begin
  -- Shared work: everyone in the workspace reads and writes.
  foreach t in array array[
    'offers', 'brain_sources', 'brain_chunks', 'brain_facts', 'style_guides', 'brand_dna',
    'agents', 'threads', 'messages', 'agent_routines', 'approvals', 'content_items', 'research_creators', 'research_posts',
    'learning_signals', 'funnels', 'funnel_versions', 'email_sequences', 'brand_board', 'graphics', 'graphic_versions',
    'programs', 'program_modules', 'program_lessons', 'vault_items', 'goals', 'goal_items']
  loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('drop policy if exists workspace_all on public.%I', t);
    execute format('create policy workspace_all on public.%I for all to authenticated using (owner_id = (select public.workspace_owner())) with check (owner_id = (select public.workspace_owner()))', t);
  end loop;

  -- Settings: members can read them; only the owner can change them.
  foreach t in array array['profiles', 'connections']
  loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('drop policy if exists workspace_read on public.%I', t);
    execute format('drop policy if exists owner_write on public.%I', t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (owner_id = (select public.workspace_owner()))', t);
    execute format('create policy owner_write on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;

  -- Append-only logs: everyone in the workspace reads and adds.
  foreach t in array array['audit_log', 'hl_write_log']
  loop
    execute format('drop policy if exists owner_read on public.%I', t);
    execute format('drop policy if exists owner_insert on public.%I', t);
    execute format('drop policy if exists workspace_read on public.%I', t);
    execute format('drop policy if exists workspace_insert on public.%I', t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (owner_id = (select public.workspace_owner()))', t);
    execute format('create policy workspace_insert on public.%I for insert to authenticated with check (owner_id = (select public.workspace_owner()))', t);
    -- Who did it: the signed-in person's email, filled in by the database.
    execute format('alter table public.%I add column if not exists actor_email text default (auth.jwt() ->> %L)', t, 'email');
  end loop;

  execute 'drop policy if exists owner_read on public.error_log';
  execute 'drop policy if exists workspace_read on public.error_log';
  execute 'create policy workspace_read on public.error_log for select to authenticated using (owner_id = (select public.workspace_owner()))';
  -- mcp_tokens and mcp_edit_log stay owner-only (unchanged).

  -- New rows from the browser belong to the workspace owner by default.
  for t in select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'owner_id' and c.column_default like '%auth.uid()%'
  loop
    execute format('alter table public.%I alter column owner_id set default public.workspace_owner()', t);
  end loop;
end $$;

-- Files: the workspace owner's folder.
drop policy if exists brain_owner_select on storage.objects;
drop policy if exists brain_owner_insert on storage.objects;
drop policy if exists brain_owner_update on storage.objects;
drop policy if exists brain_owner_delete on storage.objects;
create policy brain_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'brain' and (storage.foldername(name))[1] = (select public.workspace_owner())::text);
create policy brain_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brain' and (storage.foldername(name))[1] = (select public.workspace_owner())::text);
create policy brain_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'brain' and (storage.foldername(name))[1] = (select public.workspace_owner())::text);
create policy brain_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brain' and (storage.foldername(name))[1] = (select public.workspace_owner())::text);
