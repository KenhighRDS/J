-- Supabase only (pg_cron). The Wann feed is pulled only while some active member has the Wann channel.
select cron.unschedule('j-wann-sync');
select cron.schedule('j-wann-sync', '*/15 * * * *', $$ select private.call_function('wann-sync') where exists (select 1 from public.channel_users('wann')) $$);
