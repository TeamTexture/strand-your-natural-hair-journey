ALTER TABLE public.pro_enquiries
  ADD COLUMN IF NOT EXISTS sender_role text NOT NULL DEFAULT 'consumer'
  CHECK (sender_role IN ('consumer','pro'));

CREATE OR REPLACE FUNCTION public.send_enquiry_with_access(
  _pro_user_id uuid, _note text, _service_interest text, _preferred_timeframe text,
  _contact_method text, _contact_phone text, _location_preference text, _budget_range text,
  _share_passport_consent boolean DEFAULT false,
  _sender_role text DEFAULT 'consumer'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  uid uuid := auth.uid();
  role_tag text := CASE WHEN _sender_role = 'pro' THEN 'pro' ELSE 'consumer' END;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF uid = _pro_user_id THEN
    RAISE EXCEPTION 'Cannot enquire with yourself';
  END IF;

  -- Only an account that actually holds the professional role may send a
  -- professional-to-professional enquiry; everything else is a member enquiry.
  IF role_tag = 'pro' AND NOT public.has_role(uid, 'professional') THEN
    role_tag := 'consumer';
  END IF;

  INSERT INTO public.pro_enquiries (
    consumer_id, pro_user_id, note, service_interest, preferred_timeframe,
    contact_method, contact_phone, location_preference, budget_range,
    share_passport_consent, status, sender_role
  ) VALUES (
    uid, _pro_user_id, _note, _service_interest, _preferred_timeframe,
    _contact_method, _contact_phone, _location_preference, _budget_range,
    COALESCE(_share_passport_consent, false), 'pending', role_tag
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_enquiry_with_access(uuid,text,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_enquiry_with_access(uuid,text,text,text,text,text,text,text,boolean,text) TO authenticated;