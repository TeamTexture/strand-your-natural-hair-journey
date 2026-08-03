-- 1. The curated directory must be readable by the same audience as published
--    pro profiles: everyone, signed in or not. Without the anon grant the
--    consumer directory query failed for logged-out visitors and fell back to
--    the static seed, hiding every real approved professional.
GRANT SELECT ON public.professionals_directory TO anon;

DROP POLICY IF EXISTS "Anyone can view active professionals" ON public.professionals_directory;
CREATE POLICY "Anyone can view active professionals"
  ON public.professionals_directory FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- 2. ONE action = live. Approval sets every flag the directory query and RLS
--    require, in the same transaction.
CREATE OR REPLACE FUNCTION public.approve_pro_application(_application_id uuid, _admin_notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  app public.pro_applications%ROWTYPE;
  profile_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve applications';
  END IF;

  SELECT * INTO app FROM public.pro_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  IF app.user_id IS NULL THEN
    RAISE EXCEPTION 'Application has no linked user account';
  END IF;

  UPDATE public.pro_applications
    SET status = 'approved',
        admin_notes = COALESCE(_admin_notes, admin_notes),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = _application_id;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (app.user_id, 'professional')
    ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.pro_profiles (
    user_id, display_name, discipline, location, postcode,
    contact_email, website_url, instagram_handle,
    is_published, profile_review_status, reviewed_at, suspended_at,
    business_phone, business_email, address_line1, address_line2, city, opening_hours
  ) VALUES (
    app.user_id,
    app.full_name,
    app.discipline,
    app.location,
    app.postcode,
    COALESCE(app.business_email, app.email),
    app.website_url,
    app.instagram_handle,
    true,
    'approved'::pro_profile_review_status,
    now(),
    NULL,
    app.business_phone,
    app.business_email,
    app.address_line1,
    app.address_line2,
    app.city,
    app.opening_hours
  )
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        discipline = EXCLUDED.discipline,
        business_phone = EXCLUDED.business_phone,
        business_email = EXCLUDED.business_email,
        address_line1 = EXCLUDED.address_line1,
        address_line2 = EXCLUDED.address_line2,
        city = EXCLUDED.city,
        opening_hours = EXCLUDED.opening_hours,
        profile_review_status = 'approved'::pro_profile_review_status,
        reviewed_at = now(),
        is_published = true,
        suspended_at = NULL
  RETURNING id INTO profile_id;

  RETURN profile_id;
END;
$function$;

-- 3. Un-approval / suspension uses the same single mechanism in reverse.
CREATE OR REPLACE FUNCTION public.sync_pro_listing_from_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('rejected','suspended','pending') THEN
    UPDATE public.pro_profiles
       SET is_published = false,
           suspended_at = COALESCE(suspended_at, now())
     WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_pro_listing_from_application ON public.pro_applications;
CREATE TRIGGER sync_pro_listing_from_application
  AFTER UPDATE ON public.pro_applications
  FOR EACH ROW EXECUTE FUNCTION public.sync_pro_listing_from_application();

-- 4. Repair existing data: approved applications whose listing is not live.
UPDATE public.pro_profiles p
   SET is_published = true,
       profile_review_status = 'approved'::pro_profile_review_status,
       suspended_at = NULL,
       reviewed_at = COALESCE(p.reviewed_at, now())
 WHERE EXISTS (
         SELECT 1 FROM public.pro_applications a
          WHERE a.user_id = p.user_id AND a.status = 'approved'
       )
   AND NOT EXISTS (
         SELECT 1 FROM public.profiles pr
          WHERE pr.user_id = p.user_id AND pr.access_restricted = true
       )
   AND (p.is_published = false OR p.suspended_at IS NOT NULL
        OR p.profile_review_status <> 'approved'::pro_profile_review_status);