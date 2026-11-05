-- J schema. Every table has RLS (policies in 000300). Writes to shared tables go through RPCs/edge functions.
create extension if not exists pgcrypto;

create schema if not exists private;  -- never exposed through the API
revoke all on schema private from public, anon, authenticated;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null unique,
  name             text,
  role             text not null default 'subscriber' check (role in ('admin','subscriber')),
  status           text not null default 'invited' check (status in ('invited','active','removed')),
  balance          numeric(14,2),
  balance_currency text default 'USD',
  risk_pct         numeric(5,2) not null default 1 check (risk_pct > 0 and risk_pct <= 100),
  balance_source   text not null default 'manual' check (balance_source in ('manual','tracker')),
  last_seen        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- every auth user gets a profile row (invites, admin seeding)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'name', null))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  invited_by  uuid references public.profiles(id) on delete set null,
  sent_at     timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at  timestamptz
);
create index invites_email_idx on public.invites (lower(email));

create table public.devices (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  platform           text not null check (platform in ('android','web')),
  fcm_token          text not null unique,
  device_secret_hash text,
  app_version        text,
  user_agent         text,
  last_seen          timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index devices_user_idx on public.devices (user_id);

create table public.ea_sources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  api_key_hash text not null,
  active       boolean not null default true,
  last_seen    timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.user_source_blocks (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  ea_source_id uuid not null references public.ea_sources(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, ea_source_id)
);

create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value) values
  ('market_expiry_sec', '120'), ('re_ring_sec', '30'), ('match_tolerance_pips', '{"default": 5, "XAUUSD": 20}'),
  ('pip_size_overrides', '{"XAUUSD": 0.1}'), ('report_hour_ny', '17'), ('wann_window_days', '7'), ('close_question_hours', '48');

create table public.wann_calls (
  id              uuid primary key default gen_random_uuid(),
  wann_game_id    bigint not null unique,
  sport           text not null,
  competition     text not null,
  home            text not null,
  away            text not null,
  kickoff_utc     timestamptz not null,
  pick            text not null check (pick in ('home','draw','away','home_or_draw','away_or_draw')),
  pick_label      text not null,
  probability     numeric(5,2) not null,
  call_type       text not null check (call_type in ('straight','win_or_draw')),
  status          text not null default 'live' check (status in ('live','withdrawn','finished')),
  final_score     text,
  outcome         text check (outcome in ('won','lost','void')),
  model_version   text,
  prediction_time timestamptz,
  sent_at         timestamptz,
  withdrawn_at    timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger wann_calls_updated before update on public.wann_calls for each row execute function public.set_updated_at();

create table public.wann_access (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  enabled    boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references public.profiles(id) on delete set null
);

create table public.signals (
  id               uuid primary key default gen_random_uuid(),
  ea_source_id     uuid references public.ea_sources(id) on delete set null,
  ea_uid           text,
  source_name      text,
  symbol           text not null,
  base_symbol      text not null,
  direction        text not null check (direction in ('buy','sell')),
  order_type       text not null check (order_type in ('market','buy_stop','sell_stop','buy_limit','sell_limit')),
  entry            numeric not null,
  sl               numeric,
  tp               numeric,
  ea_lot           numeric,
  digits           integer not null default 5,
  point            numeric,
  pip_size         numeric not null,
  tick_size        numeric,
  tick_value       numeric,
  contract_size    numeric,
  vol_min          numeric not null default 0.01,
  vol_step         numeric not null default 0.01,
  vol_max          numeric not null default 100,
  account_currency text,
  status           text not null default 'live' check (status in ('live','triggered','closed','cancelled','expired')),
  expires_at       timestamptz,
  triggered_at     timestamptz,
  trigger_price    numeric,
  closed_at        timestamptz,
  close_price      numeric,
  result_pips      numeric,
  outcome          text check (outcome in ('win','loss','be')),
  close_reason     text check (close_reason in ('tp','sl','manual')),
  is_test          boolean not null default false,
  test_targets     uuid[] not null default '{}',
  created_by       uuid references public.profiles(id) on delete set null,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (ea_source_id, ea_uid)
);
create index signals_status_idx on public.signals (status, expires_at);
create index signals_created_idx on public.signals (created_at desc);
create trigger signals_updated before update on public.signals for each row execute function public.set_updated_at();

create table public.signal_events (
  id         bigint generated always as identity primary key,
  signal_id  uuid not null references public.signals(id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}',
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index signal_events_signal_idx on public.signal_events (signal_id, created_at);

create table public.receipts (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null default 'ea' check (kind in ('ea','wann')),
  signal_id        uuid references public.signals(id) on delete cascade,
  wann_call_id     uuid references public.wann_calls(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  delivered_at     timestamptz,
  opened_at        timestamptz,
  copied           jsonb not null default '{}',
  status           text not null default 'pending'
                   check (status in ('pending','opened','likely_taken','taken','skipped','missed','not_taken')),
  status_source    text check (status_source in ('open','swipe','skip','copy','tracker','close_answer','expiry')),
  user_lot         numeric,
  ring_count       integer not null default 0,
  last_ring_at     timestamptz,
  question_sent_at timestamptz,
  answered_at      timestamptz,
  user_entry       numeric,
  user_close       numeric,
  user_pips        numeric,
  tracker_position_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((kind = 'ea' and signal_id is not null and wann_call_id is null) or (kind = 'wann' and wann_call_id is not null and signal_id is null))
);
create unique index receipts_signal_user_uq on public.receipts (signal_id, user_id) where signal_id is not null;
create unique index receipts_wann_user_uq on public.receipts (wann_call_id, user_id) where wann_call_id is not null;
create index receipts_user_idx on public.receipts (user_id, created_at desc);
create index receipts_status_idx on public.receipts (status);
create trigger receipts_updated before update on public.receipts for each row execute function public.set_updated_at();

create table public.tracker_links (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.profiles(id) on delete cascade,
  key_hash       text not null,
  account_login  text,
  server         text,
  balance        numeric(14,2),
  currency       text,
  last_heartbeat timestamptz,
  created_at     timestamptz not null default now()
);

create table public.tracker_positions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  ticket            bigint not null,
  symbol            text not null,
  base_symbol       text not null,
  type              text not null check (type in ('buy','sell')),
  volume            numeric,
  open_price        numeric,
  open_time         timestamptz,
  sl                numeric,
  tp                numeric,
  close_price       numeric,
  close_time        timestamptz,
  profit            numeric,
  matched_signal_id uuid references public.signals(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, ticket)
);
create trigger tracker_positions_updated before update on public.tracker_positions for each row execute function public.set_updated_at();

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade,   -- null = app-wide
  period       text not null check (period in ('weekly','monthly')),
  period_start date not null,
  period_end   date not null,
  data         jsonb not null,
  created_at   timestamptz not null default now()
);
create unique index reports_uq on public.reports (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), period, period_start);
create index reports_user_idx on public.reports (user_id, created_at desc);

create table public.push_log (
  id           bigint generated always as identity primary key,
  device_id    uuid,
  user_id      uuid,
  signal_id    uuid,
  wann_call_id uuid,
  kind         text,
  title        text,
  fcm_status   text,
  error        text,
  created_at   timestamptz not null default now()
);
create index push_log_created_idx on public.push_log (created_at desc);

-- cached FCM OAuth token and job state; service role only
create table private.kv (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table private.config (key text primary key, value text not null);   -- functions_url, cron_key (set once, see SETUP.md)
