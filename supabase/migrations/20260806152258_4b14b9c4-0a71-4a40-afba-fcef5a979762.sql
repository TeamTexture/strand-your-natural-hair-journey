-- 1. salons
CREATE TABLE public.salons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  postcode text,
  opening_hours jsonb,
  business_phone text,
  business_email text,
  cover_path text,
  avatar_path text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salons TO authenticated;
GRANT SELECT ON public.salons TO anon;
GRANT ALL ON public.salons TO service_role;
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;

-- 2. pro_profiles.salon_id + nullable user_id
ALTER TABLE public.pro_profiles
  ADD COLUMN salon_id uuid REFERENCES public.salons(id) ON DELETE SET NULL;
ALTER TABLE public.pro_profiles ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX pro_profiles_salon_id_idx ON public.pro_profiles(salon_id) WHERE salon_id IS NOT NULL;

-- 3. salon_members
CREATE TABLE public.salon_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','stylist')),
  pro_profile_id uuid REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, user_id, pro_profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_members TO authenticated;
GRANT ALL ON public.salon_members TO service_role;
ALTER TABLE public.salon_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX salon_members_user_idx ON public.salon_members(user_id);
CREATE INDEX salon_members_salon_idx ON public.salon_members(salon_id);

-- 4. access helpers (security definer, avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_salon_member(_salon_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _salon_id IS NOT NULL AND _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.salon_members m
     WHERE m.salon_id = _salon_id AND m.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_pro_profile(_profile_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.pro_profiles p
     WHERE p.id = _profile_id
       AND (
         p.user_id = _user_id
         OR EXISTS (
           SELECT 1 FROM public.salon_members m
            WHERE m.user_id = _user_id
              AND m.salon_id = p.salon_id
              AND p.salon_id IS NOT NULL
              AND (m.pro_profile_id IS NULL OR m.pro_profile_id = p.id)
         )
       )
  );
$$;

-- can this user create/attach a profile to this salon (owner-scope only)
CREATE OR REPLACE FUNCTION public.can_manage_salon_roster(_salon_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _salon_id IS NOT NULL AND _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.salon_members m
     WHERE m.salon_id = _salon_id
       AND m.user_id = _user_id
       AND m.pro_profile_id IS NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_salon_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_pro_profile(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_salon_roster(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_salon_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_pro_profile(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_salon_roster(uuid, uuid) TO authenticated, service_role;

-- 5. RLS: salons
CREATE POLICY "Anyone reads published salons" ON public.salons
  FOR SELECT USING (is_published = true);
CREATE POLICY "Members read own salon" ON public.salons
  FOR SELECT TO authenticated USING (public.is_salon_member(id, auth.uid()));
CREATE POLICY "Owners update own salon" ON public.salons
  FOR UPDATE TO authenticated
  USING (public.can_manage_salon_roster(id, auth.uid()))
  WITH CHECK (public.can_manage_salon_roster(id, auth.uid()));
CREATE POLICY "Admins manage salons" ON public.salons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: salon_members
CREATE POLICY "Members read own memberships" ON public.salon_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_salon_member(salon_id, auth.uid()));
CREATE POLICY "Admins manage salon members" ON public.salon_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: pro_profiles salon access
CREATE POLICY "Salon members read salon profiles" ON public.pro_profiles
  FOR SELECT TO authenticated
  USING (salon_id IS NOT NULL AND public.can_manage_pro_profile(id, auth.uid()));
CREATE POLICY "Salon members update salon profiles" ON public.pro_profiles
  FOR UPDATE TO authenticated
  USING (salon_id IS NOT NULL AND public.can_manage_pro_profile(id, auth.uid()))
  WITH CHECK (salon_id IS NOT NULL AND public.can_manage_pro_profile(id, auth.uid()));
CREATE POLICY "Salon owners add stylist profiles" ON public.pro_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL
    AND salon_id IS NOT NULL
    AND public.can_manage_salon_roster(salon_id, auth.uid())
  );

-- 6. application form
ALTER TABLE public.pro_applications
  ADD COLUMN is_salon boolean NOT NULL DEFAULT false,
  ADD COLUMN stylist_consent_confirmed_at timestamptz;

CREATE TABLE public.pro_application_stylists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.pro_applications(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  contact_email text,
  discipline public.pro_discipline,
  specialisms text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_application_stylists TO authenticated;
GRANT ALL ON public.pro_application_stylists TO service_role;
ALTER TABLE public.pro_application_stylists ENABLE ROW LEVEL SECURITY;
CREATE INDEX pro_application_stylists_app_idx ON public.pro_application_stylists(application_id);

CREATE POLICY "Applicants manage own application stylists" ON public.pro_application_stylists
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pro_applications a WHERE a.id = application_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pro_applications a WHERE a.id = application_id AND a.user_id = auth.uid()));
CREATE POLICY "Admins manage application stylists" ON public.pro_application_stylists
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE TRIGGER salons_set_updated_at BEFORE UPDATE ON public.salons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. approval: salon-aware
CREATE OR REPLACE FUNCTION public.approve_pro_application(_application_id uuid, _admin_notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  app public.pro_applications%ROWTYPE;
  profile_id uuid;
  new_salon_id uuid;
  st RECORD;
  first_profile_id uuid;
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

  IF app.is_salon THEN
    -- salon entity from shared business details
    SELECT s.id INTO new_salon_id
      FROM public.salons s
      JOIN public.salon_members m ON m.salon_id = s.id AND m.user_id = app.user_id AND m.pro_profile_id IS NULL
     LIMIT 1;

    IF new_salon_id IS NULL THEN
      INSERT INTO public.salons (
        name, address_line1, address_line2, city, postcode,
        opening_hours, business_phone, business_email, is_published
      ) VALUES (
        COALESCE(app.business_name, app.full_name),
        app.address_line1, app.address_line2, app.city, app.postcode,
        app.opening_hours, app.business_phone,
        COALESCE(app.business_email, app.email),
        true
      ) RETURNING id INTO new_salon_id;
    END IF;

    FOR st IN SELECT * FROM public.pro_application_stylists WHERE application_id = _application_id ORDER BY created_at
    LOOP
      INSERT INTO public.pro_profiles (
        user_id, salon_id, display_name, discipline, specialisms,
        location, postcode, contact_email, business_phone, business_email,
        address_line1, address_line2, city, opening_hours,
        is_published, profile_review_status, reviewed_at
      ) VALUES (
        NULL, new_salon_id, st.full_name,
        COALESCE(st.discipline, app.discipline), COALESCE(st.specialisms, '{}'),
        app.location, app.postcode,
        COALESCE(NULLIF(st.contact_email, ''), app.business_email, app.email),
        app.business_phone, COALESCE(app.business_email, app.email),
        app.address_line1, app.address_line2, app.city, app.opening_hours,
        true, 'approved'::pro_profile_review_status, now()
      ) RETURNING id INTO profile_id;
      first_profile_id := COALESCE(first_profile_id, profile_id);
    END LOOP;

    INSERT INTO public.salon_members (salon_id, user_id, role, pro_profile_id)
      VALUES (new_salon_id, app.user_id, 'owner', NULL)
      ON CONFLICT (salon_id, user_id, pro_profile_id) DO NOTHING;

    RETURN COALESCE(first_profile_id, new_salon_id);
  END IF;

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
