CREATE OR REPLACE FUNCTION public.pro_enquiries_lock_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (auth.uid() = OLD.consumer_id OR auth.uid() = OLD.pro_user_id) THEN
    IF NEW.pro_user_id IS DISTINCT FROM OLD.pro_user_id
       OR NEW.consumer_id IS DISTINCT FROM OLD.consumer_id
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only the enquiry status and response fields can be changed';
    END IF;
    -- The member owns their sharing consent; the professional may never change it.
    IF NEW.share_passport_consent IS DISTINCT FROM OLD.share_passport_consent
       AND auth.uid() <> OLD.consumer_id THEN
      RAISE EXCEPTION 'Only the member can change passport sharing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;