-- Chart images from the EAs: one at open ("Nou achte la" / "Nou vann la"), one at close ("Nou close la").
-- The files live in the private storage bucket trade-shots (see *_storage.sql); the signal keeps their paths.
alter table public.signals add column if not exists shot_open text, add column if not exists shot_close text;
