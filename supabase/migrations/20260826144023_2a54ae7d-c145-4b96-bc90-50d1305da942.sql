CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('strand-klaviyo-abandoned-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'strand-klaviyo-abandoned-daily');

SELECT cron.schedule(
  'strand-klaviyo-abandoned-daily',
  '10 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/klaviyo-status-lists',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYmltZWdsaWZ2ZXJ1dnR2YXhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjc5MTIsImV4cCI6MjA5MjYwMzkxMn0.dNLvHMApQk6SlCadbEvDyy_B9RB-_Amdz-uQmiiBOR8"}'::jsonb,
    body := '{"mode":"abandoned-daily"}'::jsonb
  );
  $cron$
);