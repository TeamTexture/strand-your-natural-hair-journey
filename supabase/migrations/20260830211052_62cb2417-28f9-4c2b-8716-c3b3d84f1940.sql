CREATE TABLE IF NOT EXISTS public.internal_notify_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.internal_notify_config FROM anon, authenticated;
GRANT ALL ON public.internal_notify_config TO service_role;

ALTER TABLE public.internal_notify_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_notify_config service only"
ON public.internal_notify_config FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_internal_notify_config_updated_at
BEFORE UPDATE ON public.internal_notify_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.internal_notify_config (key, value)
VALUES ('notify_trigger_secret', '66c705c9f8941014380c996d4cb947ca83e3402bacfcc44a')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.notify_admin_new_contact_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  BEGIN
    SELECT value INTO v_secret FROM public.internal_notify_config WHERE key = 'notify_trigger_secret';
    PERFORM net.http_post(
      url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/notify-admin-message',
      body := jsonb_build_object('message_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-strand-notify-secret', coalesce(v_secret, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_new_contact_message failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_message_recipient_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF new.kind IN ('text', 'image', 'voice') AND new.sender_id IS NOT NULL THEN
    BEGIN
      SELECT value INTO v_secret FROM public.internal_notify_config WHERE key = 'notify_trigger_secret';
      PERFORM net.http_post(
        url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/notify-message-recipient',
        body := jsonb_build_object('message_id', new.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-strand-notify-secret', coalesce(v_secret, '')
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_message_recipient_email failed: %', SQLERRM;
    END;
  END IF;
  RETURN new;
END;
$function$;