-- Supabase-only (storage schema): the private bucket for EA chart images and who may read them.
-- Writes come only from the ingest function (service role). Reads: admins, and members who received that signal.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trade-shots', 'trade-shots', false, 3145728, array['image/png'])
on conflict (id) do nothing;

drop policy if exists trade_shots_read on storage.objects;
create policy trade_shots_read on storage.objects for select to authenticated
  using (bucket_id = 'trade-shots' and (
    public.is_admin()
    or exists (select 1 from public.receipts r where r.user_id = auth.uid() and r.signal_id::text = (storage.foldername(name))[1])
  ));
