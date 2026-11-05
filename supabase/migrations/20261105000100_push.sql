-- Push delivery state: cached FCM token, re-ring queue, device-authenticated receipt actions.
drop table if exists private.kv;
create table public.kv (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table public.kv enable row level security;   -- no policies: service role only

alter table public.push_log add column if not exists response jsonb;

-- iPhone re-rings: tick re-sends a push to web devices until the receipt is opened/skipped or `until` passes
create table public.rerings (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references public.receipts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null default 'signal',          -- signal | followup | wann
  title        text not null,
  body         text not null,
  route        text not null,
  data         jsonb not null default '{}',
  every_sec    integer not null default 30,
  until        timestamptz not null,
  last_sent_at timestamptz,
  done         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index rerings_due_idx on public.rerings (done, until) where not done;
alter table public.rerings enable row level security;   -- service role only

-- opening or acting on a receipt stops its re-rings
create or replace function public.rerings_stop(p_receipt uuid) returns void
language sql security definer set search_path = public as $$
  update public.rerings set done = true where receipt_id = p_receipt and not done;
$$;

create or replace function public.receipt_open(p_signal uuid default null, p_call uuid default null) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare r public.receipts;
begin
  r := public.my_receipt(p_signal, p_call);
  if r.id is null then raise exception 'no receipt' using errcode = 'P0002'; end if;
  update public.receipts set opened_at = coalesce(opened_at, now()),
    status = case when status = 'pending' then 'opened' else status end,
    status_source = case when status = 'pending' then 'open' else status_source end
  where id = r.id returning * into r;
  perform public.rerings_stop(r.id);
  return r;
end $$;

create or replace function public.receipt_skip(p_signal uuid default null, p_call uuid default null) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare r public.receipts;
begin
  r := public.my_receipt(p_signal, p_call);
  if r.id is null then raise exception 'no receipt' using errcode = 'P0002'; end if;
  perform public.receipt_apply(r.id, 'skipped', 'skip');
  update public.receipts set opened_at = coalesce(opened_at, now()) where id = r.id returning * into r;
  perform public.rerings_stop(r.id);
  return r;
end $$;

-- Native Android actions without a user session: the device proves itself with its secret.
create or replace function public.receipt_action_by_device(p_device uuid, p_secret_hash text, p_action text, p_signal uuid default null, p_call uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.devices%rowtype; r public.receipts%rowtype;
begin
  select * into d from public.devices where id = p_device;
  if not found or d.device_secret_hash is null or d.device_secret_hash <> p_secret_hash then
    raise exception 'bad device' using errcode = '42501';
  end if;
  update public.devices set last_seen = now() where id = d.id;
  select * into r from public.receipts where user_id = d.user_id
    and ((p_signal is not null and signal_id = p_signal) or (p_call is not null and wann_call_id = p_call)) limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'no receipt'); end if;
  if p_action = 'opened' then
    update public.receipts set opened_at = coalesce(opened_at, now()),
      status = case when status = 'pending' then 'opened' else status end,
      status_source = case when status = 'pending' then 'open' else status_source end where id = r.id;
  elsif p_action = 'skip' then
    perform public.receipt_apply(r.id, 'skipped', 'skip');
    update public.receipts set opened_at = coalesce(opened_at, now()) where id = r.id;
  elsif p_action = 'yes' then perform public.receipt_apply(r.id, 'taken', 'close_answer');
  elsif p_action = 'no' then perform public.receipt_apply(r.id, 'not_taken', 'close_answer');
  else return jsonb_build_object('ok', false, 'error', 'unknown action'); end if;
  perform public.rerings_stop(r.id);
  select * into r from public.receipts where id = r.id;
  return jsonb_build_object('ok', true, 'status', r.status, 'user_id', d.user_id);
end $$;
revoke execute on function public.receipt_action_by_device(uuid, text, text, uuid, uuid) from public, anon, authenticated;

-- tick bookkeeping: one call per re-ring sent
create or replace function public.rering_mark_sent(p_rering uuid) returns void
language sql security definer set search_path = public as $$
  update public.rerings set last_sent_at = now() where id = p_rering;
  update public.receipts r set ring_count = r.ring_count + 1, last_ring_at = now()
  from public.rerings g where g.id = p_rering and r.id = g.receipt_id;
$$;
