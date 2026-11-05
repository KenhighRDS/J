-- Helpers, receipt state engine, RPCs. All RPCs are SECURITY DEFINER with a pinned search_path and check auth.uid().

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.status <> 'removed');
$$;

create or replace function public.setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default);
$$;

create or replace function public.setting_json(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.settings where key = p_key), '{}'::jsonb);
$$;

-- XAUUSDm, XAUUSD.r, #XAUUSD, US30m -> XAUUSD / US30
create or replace function public.base_symbol(p_symbol text) returns text
language plpgsql immutable as $$
declare s text := upper(coalesce(p_symbol, ''));
begin
  s := regexp_replace(s, '^[#.\s]+', '');
  s := regexp_replace(s, '[._\-/\s].*$', '');
  if s ~ '^[A-Z]{6}' then return left(s, 6); end if;
  if s ~ '^[A-Z]{2,5}[0-9]{2,4}[A-Z]{1,2}$' then return regexp_replace(s, '[A-Z]{1,2}$', ''); end if;
  return s;
end $$;

create or replace function public.pip_size_for(p_base text, p_digits integer, p_point numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare o numeric;
begin
  o := (public.setting_json('pip_size_overrides') ->> p_base)::numeric;
  if o is not null then return o; end if;
  if p_base like 'XAU%' then return 0.10; end if;
  if p_digits in (3,5) and p_point is not null then return p_point * 10; end if;
  return coalesce(p_point, power(10, -coalesce(p_digits, 5)));
end $$;

create or replace function public.hash_key(p_key text) returns text
language sql immutable as $$ select encode(digest(p_key, 'sha256'), 'hex') $$;

-- ---------- receipt state engine: strongest source wins ----------
create or replace function public.receipt_rank(p_source text) returns integer
language sql immutable as $$
  select case p_source when 'tracker' then 50 when 'swipe' then 40 when 'skip' then 40
                       when 'close_answer' then 30 when 'copy' then 20 when 'expiry' then 10 else 0 end;
$$;

create or replace function public.receipt_apply(p_receipt uuid, p_status text, p_source text) returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.receipts%rowtype;
begin
  select * into r from public.receipts where id = p_receipt for update;
  if not found then return false; end if;
  if r.status_source = 'tracker' and p_source <> 'tracker' then return false; end if;
  if public.receipt_rank(p_source) < public.receipt_rank(r.status_source) then return false; end if;
  update public.receipts set status = p_status, status_source = p_source,
    answered_at = case when p_source = 'close_answer' then now() else answered_at end
  where id = p_receipt;
  return true;
end $$;

-- the user's receipt for a signal or wann call (one of the ids)
create or replace function public.my_receipt(p_signal uuid, p_call uuid) returns public.receipts
language sql stable security definer set search_path = public as $$
  select r.* from public.receipts r
  where r.user_id = auth.uid() and ((p_signal is not null and r.signal_id = p_signal) or (p_call is not null and r.wann_call_id = p_call))
  limit 1;
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
  return r;
end $$;

create or replace function public.receipt_copy(p_field text, p_signal uuid default null, p_call uuid default null) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare r public.receipts;
begin
  r := public.my_receipt(p_signal, p_call);
  if r.id is null then raise exception 'no receipt' using errcode = 'P0002'; end if;
  update public.receipts set copied = copied || jsonb_build_object(p_field, to_jsonb(now())),
    opened_at = coalesce(opened_at, now()),
    status = case when status = 'pending' then 'opened' else status end,
    status_source = case when status = 'pending' then 'open' else status_source end
  where id = r.id returning * into r;
  return r;
end $$;

create or replace function public.receipt_take(p_signal uuid default null, p_call uuid default null, p_lot numeric default null) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare r public.receipts; s_status text;
begin
  r := public.my_receipt(p_signal, p_call);
  if r.id is null then raise exception 'no receipt' using errcode = 'P0002'; end if;
  if p_signal is not null then
    select status into s_status from public.signals where id = p_signal;
    if s_status in ('closed','cancelled') then raise exception 'signal is closed' using errcode = 'P0001'; end if;
  end if;
  perform public.receipt_apply(r.id, 'taken', 'swipe');
  update public.receipts set user_lot = coalesce(p_lot, user_lot), opened_at = coalesce(opened_at, now()) where id = r.id returning * into r;
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
  return r;
end $$;

create or replace function public.receipt_answer(p_yes boolean, p_signal uuid default null, p_call uuid default null) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare r public.receipts;
begin
  r := public.my_receipt(p_signal, p_call);
  if r.id is null then raise exception 'no receipt' using errcode = 'P0002'; end if;
  perform public.receipt_apply(r.id, case when p_yes then 'taken' else 'not_taken' end, 'close_answer');
  select * into r from public.receipts where id = r.id;
  return r;
end $$;

-- copy heuristic at expiry / trigger / cancel
create or replace function public.receipts_resolve(p_signal uuid default null, p_call uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record; need_sl boolean := true;
begin
  if p_signal is not null then select (sl is not null) into need_sl from public.signals where id = p_signal; end if;
  for r in select * from public.receipts
           where ((p_signal is not null and signal_id = p_signal) or (p_call is not null and wann_call_id = p_call))
             and status in ('pending','opened') loop
    if r.opened_at is null then
      perform public.receipt_apply(r.id, 'missed', 'expiry'); n := n + 1;
    elsif (r.kind = 'ea' and r.copied ? 'entry' and r.copied ? 'tp' and r.copied ? 'lot' and (not need_sl or r.copied ? 'sl'))
       or (r.kind = 'wann' and r.copied ? 'pick') then
      perform public.receipt_apply(r.id, 'likely_taken', 'copy'); n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- market signals past expiry
create or replace function public.signals_expire_due() returns setof uuid
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in update public.signals set status = 'expired'
           where status = 'live' and order_type = 'market' and expires_at is not null and expires_at < now()
           returning id loop
    perform public.receipts_resolve(s.id, null);
    return next s.id;
  end loop;
end $$;

-- close question: unanswered after N hours
create or replace function public.receipts_question_timeout() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; h numeric := public.setting_num('close_question_hours', 48);
begin
  with t as (
    update public.receipts set status = 'not_taken', status_source = 'expiry'
    where question_sent_at is not null and answered_at is null and status = 'opened'
      and question_sent_at < now() - make_interval(hours => h::int)
    returning 1)
  select count(*) into n from t;
  return n;
end $$;

-- recipients of a new signal: active subscribers + admins, minus blocked; test signals -> targets (or admins)
create or replace function public.signal_create_receipts(p_signal uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare s public.signals%rowtype; n integer;
begin
  select * into s from public.signals where id = p_signal;
  if not found then return 0; end if;
  with targets as (
    select p.id from public.profiles p
    where p.status = 'active'
      and (not s.is_test or p.role = 'admin' or p.id = any (s.test_targets))
      and (s.is_test = false or coalesce(array_length(s.test_targets, 1), 0) = 0 or p.id = any (s.test_targets) or p.role = 'admin')
      and (s.ea_source_id is null or not exists (select 1 from public.user_source_blocks b where b.user_id = p.id and b.ea_source_id = s.ea_source_id))
  ), ins as (
    insert into public.receipts (kind, signal_id, user_id) select 'ea', s.id, id from targets
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

create or replace function public.wann_create_receipts(p_call uuid, p_only_user uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with ins as (
    insert into public.receipts (kind, wann_call_id, user_id)
    select 'wann', p_call, a.user_id from public.wann_access a join public.profiles p on p.id = a.user_id
    where a.enabled and p.status = 'active' and (p_only_user is null or a.user_id = p_only_user)
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- ---------- user RPCs ----------
create or replace function public.profile_touch() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;

create or replace function public.profile_accept_invite() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  update public.profiles set status = 'active' where id = auth.uid() and status = 'invited' returning * into p;
  if p.id is null then select * into p from public.profiles where id = auth.uid(); end if;
  update public.invites set accepted_at = coalesce(accepted_at, now()) where lower(email) = lower(p.email) and accepted_at is null and revoked_at is null;
  return p;
end $$;

create or replace function public.profile_set_balance(p_balance numeric, p_risk numeric default null, p_currency text default null) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  update public.profiles set balance = p_balance, risk_pct = coalesce(p_risk, risk_pct), balance_currency = coalesce(p_currency, balance_currency),
    balance_source = 'manual'
  where id = auth.uid() returning * into p;
  return p;
end $$;

create or replace function public.profile_set_name(p_name text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set name = nullif(trim(p_name), '') where id = auth.uid();
$$;

create or replace function public.device_register(p_platform text, p_token text, p_app_version text default null, p_secret_hash text default null, p_user_agent text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.devices (user_id, platform, fcm_token, app_version, device_secret_hash, user_agent)
  values (auth.uid(), p_platform, p_token, p_app_version, p_secret_hash, left(p_user_agent, 300))
  on conflict (fcm_token) do update set user_id = excluded.user_id, platform = excluded.platform, app_version = excluded.app_version,
    device_secret_hash = coalesce(excluded.device_secret_hash, public.devices.device_secret_hash), user_agent = excluded.user_agent, last_seen = now()
  returning id into d;
  return d;
end $$;

create or replace function public.device_unregister(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.devices where fcm_token = p_token and user_id = auth.uid();
$$;

create or replace function public.tracker_pair_key() returns text
language plpgsql security definer set search_path = public as $$
declare k text := 'jt_' || encode(gen_random_bytes(18), 'hex');
begin
  insert into public.tracker_links (user_id, key_hash) values (auth.uid(), public.hash_key(k))
  on conflict (user_id) do update set key_hash = excluded.key_hash, last_heartbeat = null, account_login = null, server = null;
  return k;
end $$;

create or replace function public.tracker_unlink() returns void
language sql security definer set search_path = public as $$
  delete from public.tracker_links where user_id = auth.uid();
  update public.profiles set balance_source = 'manual' where id = auth.uid();
$$;

-- ---------- admin RPCs ----------
create or replace function public.admin_create_ea_source(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := 'jk_' || encode(gen_random_bytes(24), 'hex'); sid uuid;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  insert into public.ea_sources (name, api_key_hash, created_by) values (trim(p_name), public.hash_key(k), auth.uid()) returning id into sid;
  return jsonb_build_object('id', sid, 'name', trim(p_name), 'api_key', k);
end $$;

create or replace function public.admin_rotate_ea_key(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare k text := 'jk_' || encode(gen_random_bytes(24), 'hex');
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update public.ea_sources set api_key_hash = public.hash_key(k) where id = p_id;
  return k;
end $$;

create or replace function public.admin_set_ea_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update public.ea_sources set active = p_active where id = p_id;
end $$;

create or replace function public.admin_set_source_block(p_user uuid, p_source uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_blocked then insert into public.user_source_blocks (user_id, ea_source_id) values (p_user, p_source) on conflict do nothing;
  else delete from public.user_source_blocks where user_id = p_user and ea_source_id = p_source; end if;
end $$;

create or replace function public.admin_set_wann_access(p_user uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  insert into public.wann_access (user_id, enabled, enabled_at, enabled_by) values (p_user, p_enabled, case when p_enabled then now() end, auth.uid())
  on conflict (user_id) do update set enabled = excluded.enabled, enabled_at = case when excluded.enabled then now() else public.wann_access.enabled_at end, enabled_by = auth.uid();
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  insert into public.settings (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function public.admin_set_profile(p_user uuid, p_name text default null, p_balance numeric default null, p_risk numeric default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update public.profiles set name = coalesce(nullif(trim(p_name), ''), name), balance = coalesce(p_balance, balance), risk_pct = coalesce(p_risk, risk_pct) where id = p_user;
end $$;

-- kills every session of a user (called by admin-remove-user with the service role)
create or replace function public.admin_kill_sessions(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
end $$;
revoke execute on function public.admin_kill_sessions(uuid) from public, anon, authenticated;

-- per-signal user status list for admins
create or replace function public.admin_signal_receipts(p_signal uuid) returns table (
  user_id uuid, email text, name text, status text, status_source text, opened_at timestamptz, user_lot numeric, user_entry numeric, user_close numeric, user_pips numeric)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.email, p.name, r.status, r.status_source, r.opened_at, r.user_lot, r.user_entry, r.user_close, r.user_pips
  from public.receipts r join public.profiles p on p.id = r.user_id
  where r.signal_id = p_signal and public.is_admin()
  order by p.email;
$$;
