CREATE OR REPLACE FUNCTION public.admin_notify_pro_capability_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.doctor_claim_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.doctor_claim_status IS DISTINCT FROM 'pending') THEN
    PERFORM public.notify_admins(
      'pro_capability_claim',
      'Doctor claim to verify',
      COALESCE(NULLIF(NEW.display_name, ''), 'A professional')
        || ' claims GMC registration' || COALESCE(' (' || NEW.gmc_number || ')', '') || '.',
      'pro_capability', NEW.user_id, '/admin/professionals?capability=doctor'
    );
  END IF;

  IF NEW.bloods_claim_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.bloods_claim_status IS DISTINCT FROM 'pending') THEN
    PERFORM public.notify_admins(
      'pro_capability_claim',
      'Blood-draw claim to verify',
      COALESCE(NULLIF(NEW.display_name, ''), 'A professional')
        || ' claims they can take bloods in person'
        || COALESCE(' (' || NEW.bloods_setting || ')', '') || '.',
      'pro_capability', NEW.user_id, '/admin/professionals?capability=bloods'
    );
  END IF;

  RETURN NEW;
END;
$function$;