CREATE OR REPLACE FUNCTION public.sync_superchat_contact_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF tg_op = 'UPDATE'
     AND new.whatsapp_opt_in IS NOT DISTINCT FROM old.whatsapp_opt_in
     AND new.phone_number IS NOT DISTINCT FROM old.phone_number
     AND new.display_name IS NOT DISTINCT FROM old.display_name THEN
    RETURN new;
  END IF;

  IF coalesce(new.whatsapp_opt_in, false) = false
     AND new.superchat_contact_id IS NULL THEN
    RETURN new;
  END IF;

  BEGIN
    SELECT value INTO v_secret FROM public.internal_notify_config WHERE key = 'notify_trigger_secret';
    PERFORM net.http_post(
      url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/sync-superchat-contact',
      body := jsonb_build_object('user_id', new.user_id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-strand-notify-secret', coalesce(v_secret, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_superchat_contact_trigger failed: %', SQLERRM;
  END;

  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_superchat_contact_trigger() FROM PUBLIC, anon, authenticated;