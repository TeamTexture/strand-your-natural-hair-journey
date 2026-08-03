-- 1. Reviews: professionals may only change status/decided_at
CREATE OR REPLACE FUNCTION public.reviews_lock_pro_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.professional_id = auth.uid()
     AND (OLD.client_user_id IS DISTINCT FROM auth.uid()) THEN
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.body_text IS DISTINCT FROM OLD.body_text
       OR NEW.transcription_text IS DISTINCT FROM OLD.transcription_text
       OR NEW.audio_path IS DISTINCT FROM OLD.audio_path
       OR NEW.client_user_id IS DISTINCT FROM OLD.client_user_id
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id THEN
      RAISE EXCEPTION 'Professionals may only approve or decline a review, not edit its content';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_lock_pro_columns ON public.reviews;
CREATE TRIGGER reviews_lock_pro_columns
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.reviews_lock_pro_columns();

-- 2. pro_enquiries: lock immutable columns for non-service_role updates
CREATE OR REPLACE FUNCTION public.pro_enquiries_lock_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (auth.uid() = OLD.consumer_id OR auth.uid() = OLD.pro_user_id) THEN
    IF NEW.pro_user_id IS DISTINCT FROM OLD.pro_user_id
       OR NEW.consumer_id IS DISTINCT FROM OLD.consumer_id
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
       OR NEW.share_passport_consent IS DISTINCT FROM OLD.share_passport_consent
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only the enquiry status and response fields can be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pro_enquiries_lock_columns ON public.pro_enquiries;
CREATE TRIGGER pro_enquiries_lock_columns
BEFORE UPDATE ON public.pro_enquiries
FOR EACH ROW EXECUTE FUNCTION public.pro_enquiries_lock_columns();

-- 3. Revoke anon EXECUTE on SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.prorettype = 'trigger'::regtype AS is_trig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    IF r.is_trig THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END IF;
  END LOOP;
END $$;