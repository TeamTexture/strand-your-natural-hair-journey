
-- Enable pg_net for outbound HTTP from the database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Seed admin notification email setting (empty by default; admins set in /admin/settings)
INSERT INTO public.platform_settings (key, value)
VALUES ('admin_notification_email', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Notification trigger function: fire-and-forget call to edge function.
CREATE OR REPLACE FUNCTION public.notify_admin_new_pro_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text;
  project_ref text;
  service_key text;
BEGIN
  -- Resolve project ref from current DB URL settings. Fall back gracefully.
  BEGIN
    SELECT current_setting('app.settings.supabase_url', true) INTO fn_url;
  EXCEPTION WHEN OTHERS THEN
    fn_url := NULL;
  END;

  -- Use the known project ref from the Cloud environment.
  project_ref := 'wibimeglifveruvtvaxe';
  fn_url := 'https://' || project_ref || '.supabase.co/functions/v1/notify-admin-application';

  BEGIN
    PERFORM extensions.http_post(
      url := fn_url,
      body := jsonb_build_object('application_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block the insert on notification failures.
    RAISE WARNING 'notify_admin_new_pro_application failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_pro_application ON public.pro_applications;
CREATE TRIGGER trg_notify_admin_new_pro_application
  AFTER INSERT ON public.pro_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_pro_application();
