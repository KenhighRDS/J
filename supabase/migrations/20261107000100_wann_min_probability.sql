-- Admin-tunable Wann threshold: only calls at or above this probability are taken from the feed (default 85, e.g. 90).
insert into public.settings (key, value) values ('wann_min_probability', '85') on conflict (key) do nothing;
