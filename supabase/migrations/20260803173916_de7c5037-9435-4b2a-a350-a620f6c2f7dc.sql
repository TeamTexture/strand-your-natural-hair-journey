CREATE OR REPLACE FUNCTION public.set_passport_access(_pro_user_id uuid, _grant boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  latest_enquiry uuid;
  access_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF _pro_user_id IS NULL OR _pro_user_id = uid THEN
    RAISE EXCEPTION 'Invalid professional';
  END IF;

  SELECT id INTO latest_enquiry
  FROM public.pro_enquiries
  WHERE consumer_id = uid
    AND pro_user_id = _pro_user_id
    AND status <> 'withdrawn'
  ORDER BY created_at DESC
  LIMIT 1;

  IF _grant THEN
    -- Consent applies to the live enquiry so the pro can accept it.
    IF latest_enquiry IS NOT NULL THEN
      UPDATE public.pro_enquiries
        SET share_passport_consent = true
        WHERE id = latest_enquiry;
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

  -- Withdraw access.
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

REVOKE ALL ON FUNCTION public.set_passport_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_passport_access(uuid, boolean) TO authenticated;