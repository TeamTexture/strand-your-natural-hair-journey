
-- pro_profiles ---------------------------------------------------------
CREATE TABLE public.pro_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  discipline public.pro_discipline NOT NULL,
  bio text,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  location text,
  postcode text,
  contact_email text,
  booking_url text,
  website_url text,
  instagram_handle text,
  avatar_path text,
  cover_path text,
  photos text[] NOT NULL DEFAULT '{}'::text[],
  is_published boolean NOT NULL DEFAULT false,
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_profiles TO authenticated;
GRANT SELECT ON public.pro_profiles TO anon;
GRANT ALL ON public.pro_profiles TO service_role;

ALTER TABLE public.pro_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pro reads own profile"
  ON public.pro_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone reads published profiles"
  ON public.pro_profiles FOR SELECT TO anon, authenticated
  USING (is_published = true AND suspended_at IS NULL);

CREATE POLICY "Admin reads all profiles"
  ON public.pro_profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Pro updates own profile"
  ON public.pro_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin manages all profiles"
  ON public.pro_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pro_profiles_set_updated_at
  BEFORE UPDATE ON public.pro_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- pro_offers -----------------------------------------------------------
CREATE TABLE public.pro_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  code text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pro_offers_pro_user_id_idx ON public.pro_offers(pro_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_offers TO authenticated;
GRANT SELECT ON public.pro_offers TO anon;
GRANT ALL ON public.pro_offers TO service_role;

ALTER TABLE public.pro_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pro manages own offers"
  ON public.pro_offers FOR ALL TO authenticated
  USING (auth.uid() = pro_user_id)
  WITH CHECK (auth.uid() = pro_user_id);

CREATE POLICY "Public reads active offers of published pros"
  ON public.pro_offers FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
    AND EXISTS (
      SELECT 1 FROM public.pro_profiles p
      WHERE p.user_id = pro_offers.pro_user_id
        AND p.is_published = true
        AND p.suspended_at IS NULL
    )
  );

CREATE POLICY "Admin manages all offers"
  ON public.pro_offers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pro_offers_set_updated_at
  BEFORE UPDATE ON public.pro_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic approval: grant role + create profile from application --------
CREATE OR REPLACE FUNCTION public.approve_pro_application(
  _application_id uuid,
  _admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    contact_email, website_url, instagram_handle, is_published
  ) VALUES (
    app.user_id,
    app.full_name,
    app.discipline,
    app.location,
    app.postcode,
    app.email,
    app.website_url,
    app.instagram_handle,
    false
  )
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        discipline = EXCLUDED.discipline,
        suspended_at = NULL
  RETURNING id INTO profile_id;

  RETURN profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_pro_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pro_application(uuid, text) TO authenticated;
