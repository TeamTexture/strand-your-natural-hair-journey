DO $$
DECLARE
  app public.pro_applications%ROWTYPE;
BEGIN
  SELECT * INTO app FROM public.pro_applications
   WHERE user_id = 'd8139824-7752-4f89-8279-8a3a9c50526c'
   ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No application found';
  END IF;

  UPDATE public.pro_applications
     SET status = 'approved', reviewed_at = now()
   WHERE id = app.id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (app.user_id, 'professional')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.pro_profiles (
    user_id, display_name, discipline, location, postcode,
    contact_email, website_url, instagram_handle,
    is_published, profile_review_status, reviewed_at, suspended_at,
    business_phone, business_email, address_line1, address_line2, city, opening_hours
  ) VALUES (
    app.user_id, app.full_name, app.discipline, app.location, app.postcode,
    COALESCE(app.business_email, app.email), app.website_url, app.instagram_handle,
    true, 'approved'::pro_profile_review_status, now(), NULL,
    app.business_phone, app.business_email, app.address_line1, app.address_line2, app.city, app.opening_hours
  )
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = COALESCE(public.pro_profiles.display_name, EXCLUDED.display_name),
        discipline = COALESCE(public.pro_profiles.discipline, EXCLUDED.discipline),
        contact_email = COALESCE(public.pro_profiles.contact_email, EXCLUDED.contact_email),
        location = COALESCE(public.pro_profiles.location, EXCLUDED.location),
        postcode = COALESCE(public.pro_profiles.postcode, EXCLUDED.postcode),
        profile_review_status = 'approved'::pro_profile_review_status,
        reviewed_at = now(),
        is_published = true,
        suspended_at = NULL;
END $$;