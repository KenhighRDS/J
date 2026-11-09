-- Private bucket for EA chart images (one open and one close PNG per signal). Members read a signal's images only
-- once they hold its receipt; admins read all. Writes come from the ingest-signal function with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trade-shots', 'trade-shots', false, 3145728, array['image/png'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'trade_shots_read') then
    create policy trade_shots_read on storage.objects for select to authenticated
      using (bucket_id = 'trade-shots' and (
        public.is_admin()
        or exists (select 1 from public.receipts r where r.user_id = auth.uid() and r.signal_id::text = (storage.foldername(name))[1])
      ));
  end if;
end $$;
