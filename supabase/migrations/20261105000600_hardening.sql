-- Grant hardening (Supabase security advisor): RPCs are for signed-in users only, internal helpers for the
-- service role only, plain helpers get a fixed search_path, pg_net lives in the extensions schema.

-- 1. No SECURITY DEFINER function in public is callable without signing in.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- 2. Helpers that only edge functions (service role), triggers or other SQL functions call.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.my_receipt(uuid, uuid) from authenticated;
revoke execute on function public.pip_size_for(text, integer, numeric) from authenticated;
revoke execute on function public.receipt_apply(uuid, text, text) from authenticated;
revoke execute on function public.receipts_question_timeout() from authenticated;
revoke execute on function public.receipts_resolve(uuid, uuid) from authenticated;
revoke execute on function public.rering_mark_sent(uuid) from authenticated;
revoke execute on function public.rerings_stop(uuid) from authenticated;
revoke execute on function public.setting_json(text) from authenticated;
revoke execute on function public.setting_num(text, numeric) from authenticated;
revoke execute on function public.signal_create_receipts(uuid) from authenticated;
revoke execute on function public.signals_expire_due() from authenticated;
revoke execute on function public.wann_create_receipts(uuid, uuid) from authenticated;

-- 3. Plain helpers: pin the search_path so a caller's setting cannot redirect them.
alter function public.hash_key(text) set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.base_symbol(text) set search_path = public;
alter function public.receipt_rank(text) set search_path = public;

-- 4. pg_net belongs in the extensions schema (Supabase only; its objects stay in schema net).
do $$ begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_net' and n.nspname = 'public') then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end $$;
