CREATE OR REPLACE FUNCTION public.notify_admin_new_contact_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/notify-admin-message',
      body := jsonb_build_object('message_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_new_contact_message failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_admin_new_pro_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fn_url text;
BEGIN
  IF NEW.payment_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  fn_url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/notify-admin-application';

  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      body := jsonb_build_object('application_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_new_pro_application failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
