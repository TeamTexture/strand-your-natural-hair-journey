-- 1. Which stylist listing an enquiry is for.
ALTER TABLE public.pro_enquiries
  ADD COLUMN IF NOT EXISTS pro_profile_id uuid REFERENCES public.pro_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pro_enquiries_profile ON public.pro_enquiries (pro_profile_id, status);

-- Backfill from the responder login. Deterministic pick (oldest profile) in the
-- unlikely case a login holds more than one profile row.
UPDATE public.pro_enquiries e
   SET pro_profile_id = sub.id
  FROM (
    SELECT DISTINCT ON (user_id) id, user_id
      FROM public.pro_profiles
     WHERE user_id IS NOT NULL
     ORDER BY user_id, created_at
  ) sub
 WHERE e.pro_profile_id IS NULL
   AND e.pro_user_id = sub.user_id;

-- 2. Salon managers act on enquiries for the stylists they manage.
DROP POLICY IF EXISTS "Salon managers read stylist enquiries" ON public.pro_enquiries;
CREATE POLICY "Salon managers read stylist enquiries"
  ON public.pro_enquiries FOR SELECT TO authenticated
  USING (pro_profile_id IS NOT NULL AND public.can_manage_pro_profile(pro_profile_id, auth.uid()));

DROP POLICY IF EXISTS "Salon managers update stylist enquiries" ON public.pro_enquiries;
CREATE POLICY "Salon managers update stylist enquiries"
  ON public.pro_enquiries FOR UPDATE TO authenticated
  USING (pro_profile_id IS NOT NULL AND public.can_manage_pro_profile(pro_profile_id, auth.uid()))
  WITH CHECK (
    pro_profile_id IS NOT NULL
    AND public.can_manage_pro_profile(pro_profile_id, auth.uid())
    AND status = ANY (ARRAY['accepted'::pro_enquiry_status, 'declined'::pro_enquiry_status])
  );

-- 3. Enquiry keyed on the stylist LISTING, not a login.
--    A salon stylist has no login of her own, so the enquiry is answered by the
--    salon owner's login but always carries pro_profile_id so every surface can
--    label it "for <stylist>".
CREATE OR REPLACE FUNCTION public.send_enquiry_to_profile(
  _pro_profile_id uuid,
  _note text,
  _service_interest text,
  _preferred_timeframe text,
  _contact_method text,
  _contact_phone text,
  _location_preference text,
  _budget_range text,
  _share_passport_consent boolean DEFAULT false,
  _sender_role text DEFAULT 'consumer'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
  uid uuid := auth.uid();
  role_tag text := CASE WHEN _sender_role = 'pro' THEN 'pro' ELSE 'consumer' END;
  prof record;
  responder uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  SELECT id, user_id, salon_id, is_published, suspended_at
    INTO prof
    FROM public.pro_profiles
   WHERE id = _pro_profile_id;

  IF prof.id IS NULL THEN
    RAISE EXCEPTION 'That professional is no longer listed';
  END IF;
  IF prof.is_published IS NOT TRUE OR prof.suspended_at IS NOT NULL THEN
    RAISE EXCEPTION 'That professional is no longer listed';
  END IF;

  responder := prof.user_id;

  -- Salon stylist with no login: the salon owner's login answers for her.
  IF responder IS NULL AND prof.salon_id IS NOT NULL THEN
    SELECT m.user_id INTO responder
      FROM public.salon_members m
     WHERE m.salon_id = prof.salon_id
       AND m.role = 'owner'
       AND m.pro_profile_id IS NULL
     ORDER BY m.created_at
     LIMIT 1;
  END IF;

  IF responder IS NULL THEN
    RAISE EXCEPTION 'This listing cannot receive enquiries yet';
  END IF;
  IF uid = responder THEN
    RAISE EXCEPTION 'Cannot enquire with yourself';
  END IF;

  IF role_tag = 'pro' AND NOT public.has_role(uid, 'professional') THEN
    role_tag := 'consumer';
  END IF;

  INSERT INTO public.pro_enquiries (
    consumer_id, pro_user_id, pro_profile_id, note, service_interest,
    preferred_timeframe, contact_method, contact_phone, location_preference,
    budget_range, share_passport_consent, status, sender_role
  ) VALUES (
    uid, responder, prof.id, _note, _service_interest,
    _preferred_timeframe, _contact_method, _contact_phone, _location_preference,
    _budget_range, COALESCE(_share_passport_consent, false), 'pending', role_tag
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_enquiry_to_profile(uuid,text,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_enquiry_to_profile(uuid,text,text,text,text,text,text,text,boolean,text) TO authenticated;