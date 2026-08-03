CREATE OR REPLACE FUNCTION public.send_enquiry_with_access(
  _pro_user_id uuid, _note text, _service_interest text, _preferred_timeframe text,
  _contact_method text, _contact_phone text, _location_preference text, _budget_range text,
  _share_passport_consent boolean DEFAULT false
) RETURNS uuid
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
    COALESCE(_share_passport_consent, false), 'pending'
  )
  RETURNING id INTO new_id;

  -- Consent is recorded on the enquiry only. Passport access (and therefore
  -- appearing in the pro's client book) is created when the pro accepts.
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_passport_access(_pro_user_id uuid, _grant boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  latest_enquiry uuid;
  latest_status public.pro_enquiry_status;
  access_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF _pro_user_id IS NULL OR _pro_user_id = uid THEN
    RAISE EXCEPTION 'Invalid professional';
  END IF;

  SELECT id, status INTO latest_enquiry, latest_status
  FROM public.pro_enquiries
  WHERE consumer_id = uid
    AND pro_user_id = _pro_user_id
    AND status <> 'withdrawn'
  ORDER BY created_at DESC
  LIMIT 1;

  IF _grant THEN
    IF latest_enquiry IS NOT NULL THEN
      UPDATE public.pro_enquiries
        SET share_passport_consent = true
        WHERE id = latest_enquiry;
    END IF;

    -- While the enquiry is still pending, only the consent flag is stored.
    IF latest_status IS DISTINCT FROM 'accepted'::public.pro_enquiry_status THEN
      RETURN NULL;
    END IF;

    SELECT id INTO access_id
    FROM public.pro_client_access
    WHERE consumer_id = uid AND pro_user_id = _pro_user_id AND revoked_at IS NULL
    LIMIT 1;

    IF access_id IS NOT NULL THEN
      UPDATE public.pro_client_access
        SET enquiry_id = COALESCE(latest_enquiry, enquiry_id)
        WHERE id = access_id;
      RETURN access_id;
    END IF;

    INSERT INTO public.pro_client_access (pro_user_id, consumer_id, enquiry_id)
      VALUES (_pro_user_id, uid, latest_enquiry)
      RETURNING id INTO access_id;
    RETURN access_id;
  END IF;

  UPDATE public.pro_client_access
    SET revoked_at = now()
    WHERE consumer_id = uid AND pro_user_id = _pro_user_id AND revoked_at IS NULL;

  IF latest_enquiry IS NOT NULL THEN
    UPDATE public.pro_enquiries
      SET share_passport_consent = false
      WHERE id = latest_enquiry AND status = 'pending';
  END IF;

  RETURN NULL;
END;
$$;

DELETE FROM public.pro_client_access a
WHERE a.revoked_at IS NULL
  AND a.enquiry_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.pro_enquiries e
    WHERE e.id = a.enquiry_id AND e.status = 'pending'
  );