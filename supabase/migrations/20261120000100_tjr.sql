-- TJR liquidity-sweep futures strategy (docs/tjr). The Python worker (tjr/jtjr) does the work wherever it runs and talks
-- to J only through the `tjr-worker` function with its own key; everything here is ADMIN-ONLY, because the market
-- data licences are for personal use. Live trading is off and locked: see tjr_state and tjr_unlock_live.

create table public.tjr_versions (                      -- saved settings from the strategy builder
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 80),
  note          text not null default '',
  config        jsonb not null,
  config_id     text not null,                          -- fingerprint the engine computes: same rules + numbers, same id
  rules_version text not null default '',
  model         text not null check (model in ('A','B','C','D','E')),
  experimental  boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.tjr_runs (                          -- one backtest, walk-forward test, paper session or live session
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('backtest','walkforward','paper','live')),
  status        text not null default 'done' check (status in ('running','done','failed')),
  label         text not null default '',
  group_id      uuid,                                   -- runs compared on identical data and assumptions share this
  version_id    uuid references public.tjr_versions(id) on delete set null,
  model         text not null check (model in ('A','B','C','D','E')),
  experimental  boolean not null default false,
  symbol        text not null,
  trade_symbol  text not null,
  config        jsonb not null,
  config_id     text not null,
  rules_version text not null default '',
  period_from   timestamptz,
  period_to     timestamptz,
  metrics       jsonb not null default '{}'::jsonb,
  rejected      jsonb not null default '{}'::jsonb,     -- reason -> count of setups that did not become trades
  curve         jsonb not null default '[]'::jsonb,     -- [[time, equity], ...]
  provenance    jsonb not null default '{}'::jsonb,     -- which data file(s), their fingerprints and roll method
  extra         jsonb not null default '{}'::jsonb,     -- walk-forward: grid, frozen protocol, how often the test stretch was used
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index tjr_runs_recent on public.tjr_runs (created_at desc);
create index tjr_runs_group on public.tjr_runs (group_id) where group_id is not null;

create table public.tjr_trades (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.tjr_runs(id) on delete cascade,
  seq           integer not null,
  model         text not null,
  symbol        text not null,
  side          text not null check (side in ('long','short')),
  qty           integer not null check (qty > 0),
  signal_at     timestamptz not null,
  entry_at      timestamptz not null,
  entry         numeric not null,
  stop          numeric not null,
  target        numeric,
  target_label  text not null default '',
  exit_at       timestamptz,
  exit          numeric,
  exit_reason   text not null default '',
  risk_usd      numeric not null default 0,
  gross_usd     numeric not null default 0,
  costs_usd     numeric not null default 0,
  net_usd       numeric not null default 0,
  r             numeric not null default 0,
  mae           numeric not null default 0,
  mfe           numeric not null default 0,
  levels        text[] not null default '{}',
  confirmations jsonb not null default '[]'::jsonb,     -- each: kind, side, ts, value, timeframe, reason, expires_at, extra
  marks         jsonb not null default '[]'::jsonb,     -- swept levels and the target, with prices, for the chart
  partials      jsonb not null default '[]'::jsonb,
  bars          jsonb not null default '[]'::jsonb,     -- 5-minute candles around the trade: [ts, o, h, l, c, v]
  experimental  boolean not null default false,
  unique (run_id, seq)
);
create index tjr_trades_run on public.tjr_trades (run_id, entry_at);

create table public.tjr_events (                        -- the journal: signals, rejected setups, orders, fills, risk checks
  id      bigint generated always as identity primary key,
  run_id  uuid not null references public.tjr_runs(id) on delete cascade,
  ts      timestamptz not null,
  type    text not null,
  data    jsonb not null default '{}'::jsonb
);
create index tjr_events_run on public.tjr_events (run_id, ts);
create index tjr_events_type on public.tjr_events (run_id, type, ts);

create table public.tjr_jobs (                          -- work asked for in the app, done by the worker
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('backtest','compare','walkforward')),
  params      jsonb not null default '{}'::jsonb,       -- models, from, to, version_id or config, label
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  note        text,                                     -- what the worker said (error, or a one-line result)
  run_ids     uuid[] not null default '{}',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  finished_at timestamptz
);
create index tjr_jobs_queue on public.tjr_jobs (status, created_at);

create table public.tjr_datasets (                      -- real data files the worker has, so the app can offer them
  symbol      text primary key,
  source      text not null default '',
  first_at    timestamptz,
  last_at     timestamptz,
  rows        bigint not null default 0,
  sha256      text not null default '',
  roll_method text not null default '',
  seen_at     timestamptz not null default now()
);

create table public.tjr_state (                         -- one row: what the worker must obey
  id                boolean primary key default true check (id),
  mode              text not null default 'off' check (mode in ('off','paper','live')),
  kill              boolean not null default false,     -- emergency stop: close everything, open nothing
  kill_at           timestamptz,
  live_unlocked     boolean not null default false,     -- live orders are impossible while this is false
  live_unlocked_by  uuid references public.profiles(id) on delete set null,
  live_unlocked_at  timestamptz,
  active_version_id uuid references public.tjr_versions(id) on delete set null,
  worker_key_hash   text,
  worker_seen_at    timestamptz,                        -- heartbeat
  worker_info       jsonb not null default '{}'::jsonb, -- version, data feed and broker health, as the worker reports them
  updated_at        timestamptz not null default now()
);
insert into public.tjr_state (id) values (true);

-- ---------- access: admins read; nobody writes tables directly ----------
alter table public.tjr_versions enable row level security;
alter table public.tjr_runs     enable row level security;
alter table public.tjr_trades   enable row level security;
alter table public.tjr_events   enable row level security;
alter table public.tjr_jobs     enable row level security;
alter table public.tjr_datasets enable row level security;
alter table public.tjr_state    enable row level security;
create policy tjr_versions_admin on public.tjr_versions for select using (public.is_admin());
create policy tjr_runs_admin     on public.tjr_runs     for select using (public.is_admin());
create policy tjr_trades_admin   on public.tjr_trades   for select using (public.is_admin());
create policy tjr_events_admin   on public.tjr_events   for select using (public.is_admin());
create policy tjr_jobs_admin     on public.tjr_jobs     for select using (public.is_admin());
create policy tjr_datasets_admin on public.tjr_datasets for select using (public.is_admin());
revoke all on public.tjr_state from anon, authenticated;        -- holds the worker key hash: read it through tjr_status()

-- ---------- admin RPCs ----------
create or replace function public.tjr_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then null else (
    select jsonb_build_object('mode', s.mode, 'kill', s.kill, 'kill_at', s.kill_at, 'live_unlocked', s.live_unlocked, 'live_unlocked_at', s.live_unlocked_at,
      'active_version_id', s.active_version_id, 'has_worker_key', s.worker_key_hash is not null, 'worker_seen_at', s.worker_seen_at,
      'worker_online', coalesce(s.worker_seen_at > now() - interval '3 minutes', false), 'worker_info', s.worker_info, 'updated_at', s.updated_at)
    from public.tjr_state s) end;
$$;

create or replace function public.tjr_new_worker_key() returns text
language plpgsql security definer set search_path = public as $$
declare k text := 'jt_' || encode(gen_random_bytes(24), 'hex');
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update public.tjr_state set worker_key_hash = public.hash_key(k), updated_at = now();
  return k;      -- shown once; only its hash is kept
end $$;

create or replace function public.tjr_save_version(p_name text, p_config jsonb, p_config_id text, p_rules text, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; m text := p_config ->> 'model';
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if m is null or m not in ('A','B','C','D','E') then raise exception 'config has no valid model'; end if;
  insert into public.tjr_versions (name, note, config, config_id, rules_version, model, experimental, created_by)
  values (trim(p_name), coalesce(p_note, ''), p_config, p_config_id, coalesce(p_rules, ''), m, m = 'E' or coalesce((p_config ->> 'use_ext79')::boolean, false), auth.uid())
  returning id into v;
  return v;
end $$;

create or replace function public.tjr_set_active(p_version uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_version is not null and not exists (select 1 from public.tjr_versions where id = p_version) then raise exception 'no such version'; end if;
  update public.tjr_state set active_version_id = p_version, updated_at = now();
end $$;

create or replace function public.tjr_enqueue(p_kind text, p_params jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare j uuid;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if (select count(*) from public.tjr_jobs where status in ('queued','running')) >= 10 then raise exception 'ten jobs are already waiting'; end if;
  insert into public.tjr_jobs (kind, params, created_by) values (p_kind, coalesce(p_params, '{}'::jsonb), auth.uid()) returning id into j;
  return j;
end $$;

-- Mode. Paper needs nothing more than an admin. Live needs the lock opened first, and the kill switch off.
create or replace function public.tjr_set_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.tjr_state;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into s from public.tjr_state;
  if p_mode not in ('off','paper','live') then raise exception 'unknown mode'; end if;
  if p_mode = 'live' and not s.live_unlocked then raise exception 'live trading is locked' using errcode = '42501'; end if;
  if p_mode <> 'off' and s.kill then raise exception 'the emergency stop is on' using errcode = '42501'; end if;
  update public.tjr_state set mode = p_mode, updated_at = now();
end $$;

-- Emergency stop. On: mode goes to off, live is locked again, and the worker closes what is open. Off: only clears the
-- flag; nothing restarts by itself.
create or replace function public.tjr_kill(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_on then
    update public.tjr_state set kill = true, kill_at = now(), mode = 'off', live_unlocked = false, live_unlocked_by = null, live_unlocked_at = null, updated_at = now();
  else
    update public.tjr_state set kill = false, updated_at = now();
  end if;
end $$;

-- Opening the live lock takes the exact phrase, typed. It does not start anything: the mode still has to be set, and
-- the worker has its own switch on its own machine. Locking again needs no phrase.
create or replace function public.tjr_unlock_live(p_phrase text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_phrase is distinct from 'ENABLE LIVE TRADING' then raise exception 'wrong phrase' using errcode = '22023'; end if;
  if (select kill from public.tjr_state) then raise exception 'the emergency stop is on' using errcode = '42501'; end if;
  update public.tjr_state set live_unlocked = true, live_unlocked_by = auth.uid(), live_unlocked_at = now(), updated_at = now();
end $$;

create or replace function public.tjr_lock_live() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update public.tjr_state set live_unlocked = false, live_unlocked_by = null, live_unlocked_at = null, mode = case when mode = 'live' then 'off' else mode end, updated_at = now();
end $$;

create or replace function public.tjr_delete_run(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  delete from public.tjr_runs where id = p_run and kind in ('backtest','walkforward');     -- paper and live records are kept
end $$;

-- ---------- what the worker function calls (service role only) ----------
create or replace function public.tjr_worker_ok(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select worker_key_hash = public.hash_key(p_key) from public.tjr_state where worker_key_hash is not null), false);
$$;

create or replace function public.tjr_worker_state(p_info jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  update public.tjr_state set worker_seen_at = now(), worker_info = coalesce(p_info, '{}'::jsonb);
  select jsonb_build_object('mode', s.mode, 'kill', s.kill, 'live_unlocked', s.live_unlocked,
           'version', (select jsonb_build_object('id', v.id, 'name', v.name, 'config', v.config, 'config_id', v.config_id) from public.tjr_versions v where v.id = s.active_version_id))
    into out from public.tjr_state s;
  return out;
end $$;

create or replace function public.tjr_claim_job() returns jsonb
language plpgsql security definer set search_path = public as $$
declare j public.tjr_jobs;
begin
  update public.tjr_jobs set status = 'failed', note = 'the worker stopped before finishing', finished_at = now()
   where status = 'running' and claimed_at < now() - interval '2 hours';
  select * into j from public.tjr_jobs where status = 'queued' order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.tjr_jobs set status = 'running', claimed_at = now() where id = j.id;
  return jsonb_build_object('id', j.id, 'kind', j.kind, 'params', j.params,
    'version', (select jsonb_build_object('id', v.id, 'name', v.name, 'config', v.config) from public.tjr_versions v where v.id = nullif(j.params ->> 'version_id', '')::uuid));
end $$;

do $$ declare f text; begin
  foreach f in array array['tjr_worker_ok(text)','tjr_worker_state(jsonb)','tjr_claim_job()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['tjr_status()','tjr_new_worker_key()','tjr_save_version(text,jsonb,text,text,text)','tjr_set_active(uuid)','tjr_enqueue(text,jsonb)','tjr_set_mode(text)','tjr_kill(boolean)','tjr_unlock_live(text)','tjr_lock_live()','tjr_delete_run(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
