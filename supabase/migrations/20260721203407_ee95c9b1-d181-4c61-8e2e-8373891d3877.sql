CREATE OR REPLACE FUNCTION public.send_enquiry_with_access(
  _pro_user_id uuid,
  _note text,
  _service_interest text,
  _preferred_timeframe text,
  _contact_method text,
  _contact_phone text,
  _location_preference text,
  _budget_range text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF uid = _pro_user_id THEN
    RAISE EXCEPTION 'Cannot enquire with yourself';
  END IF;

  INSERT INTO public.pro_enquiries (
    consumer_id, pro_user_id, note, service_interest, preferred_timeframe,
    contact_method, contact_phone, location_preference, budget_range,
    share_passport_consent, status
  ) VALUES (
    uid, _pro_user_id, _note, _service_interest, _preferred_timeframe,
    _contact_method, _contact_phone, _location_preference, _budget_range,
    true, 'pending'
  )
  RETURNING id INTO new_id;

  -- Automatic passport access on send
  INSERT INTO public.pro_client_access (pro_user_id, consumer_id, enquiry_id)
    VALUES (_pro_user_id, uid, new_id)
    ON CONFLICT (pro_user_id, consumer_id) WHERE revoked_at IS NULL
    DO UPDATE SET enquiry_id = EXCLUDED.enquiry_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_enquiry_with_access(uuid,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.send_enquiry_with_access(uuid,text,text,text,text,text,text,text) TO authenticated;