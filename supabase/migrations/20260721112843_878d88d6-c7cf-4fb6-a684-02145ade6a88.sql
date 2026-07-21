
ALTER TABLE public.pro_applications
  ADD COLUMN IF NOT EXISTS business_phone text,
  ADD COLUMN IF NOT EXISTS business_email text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb;

ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS business_phone text,
  ADD COLUMN IF NOT EXISTS business_email text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb;

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
    contact_email, website_url, instagram_handle, is_published,
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
    false,
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
        suspended_at = NULL
  RETURNING id INTO profile_id;

  RETURN profile_id;
END;
$function$;
