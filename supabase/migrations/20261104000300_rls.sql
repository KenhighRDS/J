-- Row level security: subscribers read their own rows and the signals they received; admins read everything.
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.devices enable row level security;
alter table public.ea_sources enable row level security;
alter table public.user_source_blocks enable row level security;
alter table public.settings enable row level security;
alter table public.wann_calls enable row level security;
alter table public.wann_access enable row level security;
alter table public.signals enable row level security;
alter table public.signal_events enable row level security;
alter table public.receipts enable row level security;
alter table public.tracker_links enable row level security;
alter table public.tracker_positions enable row level security;
alter table public.reports enable row level security;
alter table public.push_log enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy invites_admin on public.invites for select to authenticated using (public.is_admin());
create policy devices_read on public.devices for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy ea_sources_admin on public.ea_sources for select to authenticated using (public.is_admin());
create policy blocks_read on public.user_source_blocks for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy settings_read on public.settings for select to authenticated using (true);
create policy wann_calls_read on public.wann_calls for select to authenticated
  using (public.is_admin() or exists (select 1 from public.receipts r where r.wann_call_id = wann_calls.id and r.user_id = auth.uid()));
create policy wann_access_read on public.wann_access for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy signals_read on public.signals for select to authenticated
  using (public.is_admin() or exists (select 1 from public.receipts r where r.signal_id = signals.id and r.user_id = auth.uid()));
create policy signal_events_read on public.signal_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.receipts r where r.signal_id = signal_events.signal_id and r.user_id = auth.uid()));
create policy receipts_read on public.receipts for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy tracker_links_read on public.tracker_links for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy tracker_positions_read on public.tracker_positions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy reports_read on public.reports for select to authenticated using (user_id = auth.uid() or user_id is null or public.is_admin());
create policy push_log_admin on public.push_log for select to authenticated using (public.is_admin());

-- the API roles never write tables directly
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated;
