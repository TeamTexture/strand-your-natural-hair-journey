select cron.unschedule('product-analysis-backfill-tick');

select cron.schedule(
  'product-analysis-backfill-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/product-analysis-backfill',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYmltZWdsaWZ2ZXJ1dnR2YXhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjc5MTIsImV4cCI6MjA5MjYwMzkxMn0.dNLvHMApQk6SlCadbEvDyy_B9RB-_Amdz-uQmiiBOR8"}'::jsonb,
    body := '{"limit":6}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);