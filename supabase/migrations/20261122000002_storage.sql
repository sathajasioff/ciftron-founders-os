-- Private storage buckets. Files live under <owner_id>/... and only the owner can reach them.

insert into storage.buckets (id, name, public, file_size_limit)
values ('brain', 'brain', false, 52428800)
on conflict (id) do nothing;

create policy brain_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'brain' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy brain_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brain' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy brain_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'brain' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy brain_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brain' and (storage.foldername(name))[1] = (select auth.uid())::text);
