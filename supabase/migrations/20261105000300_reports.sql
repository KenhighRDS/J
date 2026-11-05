-- Report data is computed once and frozen in reports.data.
create or replace function public.report_build(p_period text, p_start date, p_end date, p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare app jsonb; usr jsonb := null; wann jsonb := null; had_wann boolean := false;
begin
  with closed as (
    select * from public.signals where status = 'closed' and not is_test and closed_at::date between p_start and p_end
  ), sym as (
    select base_symbol, round(sum(result_pips)::numeric, 1) as pips, count(*) as n from closed group by base_symbol order by pips desc
  )
  select jsonb_build_object(
    'called', (select count(*) from public.signals where not is_test and coalesce(sent_at, created_at)::date between p_start and p_end),
    'wins', (select count(*) from closed where outcome = 'win'),
    'losses', (select count(*) from closed where outcome = 'loss'),
    'be', (select count(*) from closed where outcome = 'be'),
    'win_rate', (select case when count(*) filter (where outcome in ('win','loss')) = 0 then 0 else round(100.0 * count(*) filter (where outcome = 'win') / count(*) filter (where outcome in ('win','loss')), 1) end from closed),
    'pips', (select coalesce(round(sum(result_pips)::numeric, 1), 0) from closed),
    'best', (select jsonb_build_object('symbol', base_symbol, 'pips', result_pips) from closed where result_pips is not null order by result_pips desc limit 1),
    'symbols', (select coalesce(jsonb_agg(jsonb_build_object('symbol', base_symbol, 'pips', pips, 'n', n)), '[]'::jsonb) from sym)
  ) into app;

  if p_user is not null then
    with closed as (
      select sg.*, r.status as rstatus, r.user_pips, r.user_lot from public.signals sg
      join public.receipts r on r.signal_id = sg.id and r.user_id = p_user
      where sg.status = 'closed' and not sg.is_test and sg.closed_at::date between p_start and p_end
    ), taken as (
      select *, coalesce(user_pips, result_pips) as eff_pips from closed where rstatus in ('taken','likely_taken')
    )
    select jsonb_build_object(
      'name', (select name from public.profiles where id = p_user),
      'received', (select count(*) from closed),
      'taken', (select count(*) from closed where rstatus = 'taken'),
      'likely', (select count(*) from closed where rstatus = 'likely_taken'),
      'missed', (select count(*) from closed where rstatus in ('missed','not_taken')),
      'skipped', (select count(*) from closed where rstatus = 'skipped'),
      'wins', (select count(*) from taken where eff_pips > 1),
      'losses', (select count(*) from taken where eff_pips < -1),
      'pips', (select coalesce(round(sum(eff_pips)::numeric, 1), 0) from taken),
      'tracker', exists (select 1 from public.tracker_links t where t.user_id = p_user)
    ) into usr;

    select exists (select 1 from public.wann_access a where a.user_id = p_user and (a.enabled or a.enabled_at::date <= p_end)) into had_wann;
    if had_wann then
      with calls as (
        select c.*, r.status as rstatus from public.wann_calls c
        left join public.receipts r on r.wann_call_id = c.id and r.user_id = p_user
        where c.status = 'finished' and c.kickoff_utc::date between p_start and p_end and r.id is not null
      )
      select jsonb_build_object(
        'called', (select count(*) from calls),
        'won', (select count(*) from calls where outcome = 'won'),
        'lost', (select count(*) from calls where outcome = 'lost'),
        'hit_rate', (select case when count(*) filter (where outcome in ('won','lost')) = 0 then 0 else round(100.0 * count(*) filter (where outcome = 'won') / count(*) filter (where outcome in ('won','lost')), 1) end from calls),
        'taken', (select count(*) from calls where rstatus in ('taken','likely_taken')),
        'missed', (select count(*) from calls where rstatus in ('missed','not_taken'))
      ) into wann;
    end if;
  end if;
  return jsonb_build_object('period', p_period, 'start', p_start, 'end', p_end, 'app', app, 'user', usr, 'wann', wann);
end $$;
revoke execute on function public.report_build(text, date, date, uuid) from public, anon, authenticated;
