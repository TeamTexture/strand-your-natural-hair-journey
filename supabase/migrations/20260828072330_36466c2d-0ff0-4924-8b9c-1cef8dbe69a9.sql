-- Paced re-analysis backfill: run a small bounded batch every 10 minutes.
-- The function itself holds a single-flight lease, so overlapping ticks exit
-- immediately, and it pauses itself on a billing/policy block.
select cron.schedule(
  'product-analysis-backfill-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/product-analysis-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('limit', 6),
    timeout_milliseconds := 120000
  );
  $$
);