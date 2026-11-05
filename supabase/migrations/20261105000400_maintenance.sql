-- Keeps the free tier free: tick only runs when there is work; old rows are pruned daily.
create or replace function private.tick_due() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rerings where not done and until > now())
      or exists (select 1 from public.signals where status = 'live' and order_type = 'market' and expires_at < now() + interval '70 seconds')
      or not exists (select 1 from public.profiles where role = 'admin');
$$;

-- same check, callable by the service role from the tick function (the private schema is not exposed through the API)
create or replace function public.tick_due_check() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rerings where not done and until > now())
      or exists (select 1 from public.signals where status = 'live' and order_type = 'market' and expires_at < now() + interval '70 seconds');
$$;
revoke execute on function public.tick_due_check() from public, anon, authenticated;

create or replace function private.maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int;
begin
  with x as (delete from public.push_log where created_at < now() - interval '14 days' returning 1) select count(*) into a from x;
  with x as (delete from public.rerings where done and created_at < now() - interval '2 days' returning 1) select count(*) into b from x;
  with x as (delete from public.tracker_positions where matched_signal_id is null and close_time is not null and close_time < now() - interval '60 days' returning 1) select count(*) into c from x;
  with x as (delete from public.signal_events where created_at < now() - interval '180 days' returning 1) select count(*) into d from x;
  return jsonb_build_object('push_log', a, 'rerings', b, 'tracker_positions', c, 'signal_events', d);
end $$;
