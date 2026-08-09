CREATE OR REPLACE FUNCTION public.admin_notify_pro_capability_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.doctor_claim_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.doctor_claim_status IS DISTINCT FROM 'pending') THEN
    INSERT INTO public.admin_notifications (type, entity_type, entity_id, title, body, url)
    VALUES ('pro_capability_claim', 'pro_capability', NEW.user_id,
            'Doctor claim to verify',
            COALESCE(NULLIF(NEW.display_name, ''), 'A professional')
              || ' claims GMC registration' || COALESCE(' (' || NEW.gmc_number || ')', '') || '.',
            '/admin/professionals?capability=doctor');
  END IF;

  IF NEW.bloods_claim_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.bloods_claim_status IS DISTINCT FROM 'pending') THEN
    INSERT INTO public.admin_notifications (type, entity_type, entity_id, title, body, url)
    VALUES ('pro_capability_claim', 'pro_capability', NEW.user_id,
            'Blood-draw claim to verify',
            COALESCE(NULLIF(NEW.display_name, ''), 'A professional')
              || ' claims they can take bloods in person'
              || COALESCE(' (' || NEW.bloods_setting || ')', '') || '.',
            '/admin/professionals?capability=bloods');
  END IF;

  RETURN NEW;
END;
$function$;