-- private.call_function (cron migration) declared variables named url/key; "key" collided with private.config.key,
-- so every pg_cron call failed with "column reference key is ambiguous". Variables renamed; behaviour unchanged.
create or replace function private.call_function(p_name text, p_body jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = private, public, extensions as $$
declare v_url text; v_key text;
begin
  select c.value into v_url from private.config c where c.key = 'functions_url';
  select c.value into v_key from private.config c where c.key = 'cron_key';
  if v_url is null or v_key is null then return; end if;
  perform net.http_post(url := v_url || '/' || p_name, headers := jsonb_build_object('Content-Type', 'application/json', 'x-j-cron-key', v_key),
                        body := p_body, timeout_milliseconds := 55000);
end $$;
