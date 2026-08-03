-- 1. Role change history
CREATE TABLE IF NOT EXISTS public.role_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_account_type text,
  to_account_type text NOT NULL,
  changed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.role_change_log TO authenticated;
GRANT ALL ON public.role_change_log TO service_role;

ALTER TABLE public.role_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read role change log"
  ON public.role_change_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS role_change_log_user_idx ON public.role_change_log (user_id, created_at DESC);

-- 2. Canonical account type derivation
CREATE OR REPLACE FUNCTION public.account_type_of(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'professional') THEN 'professional'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'brand') THEN 'brand'
    ELSE 'consumer'
  END
$$;

-- 3. Atomic admin role conversion
CREATE OR REPLACE FUNCTION public.admin_set_account_type(_user_id uuid, _account_type text, _reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from text;
  v_target text := lower(trim(coalesce(_account_type, '')));
  v_name text;
  v_email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change account types';
  END IF;
  IF v_target NOT IN ('consumer','professional','brand') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User required';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Admins cannot change their own account type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  v_from := public.account_type_of(_user_id);
  IF v_from = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts cannot be converted';
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE user_id = _user_id;
  SELECT email::text INTO v_email FROM auth.users WHERE id = _user_id;

  -- Base role always present
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'consumer')
    ON CONFLICT (user_id, role) DO NOTHING;

  -- Remove the non-target account type roles
  DELETE FROM public.user_roles
   WHERE user_id = _user_id
     AND role IN ('professional','brand')
     AND role::text <> v_target;

  IF v_target IN ('professional','brand') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, v_target::app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF v_target = 'professional' THEN
    INSERT INTO public.pro_profiles (user_id, display_name, discipline, contact_email, is_published)
      VALUES (_user_id, COALESCE(NULLIF(v_name,''), 'New professional'), 'Stylist'::pro_discipline, v_email, false)
      ON CONFLICT (user_id) DO UPDATE SET suspended_at = NULL;
  ELSE
    -- Losing professional status: unpublish the listing, never delete it
    UPDATE public.pro_profiles
       SET is_published = false, suspended_at = now()
     WHERE user_id = _user_id;
    UPDATE public.pro_client_access
       SET revoked_at = now()
     WHERE pro_user_id = _user_id AND revoked_at IS NULL;
  END IF;

  IF v_target = 'brand' THEN
    INSERT INTO public.brand_profiles (user_id, brand_name, contact_name, contact_email)
      VALUES (_user_id, COALESCE(NULLIF(v_name,''), 'New brand'), NULLIF(v_name,''), v_email)
      ON CONFLICT (user_id) DO NOTHING;
  END IF;

  INSERT INTO public.role_change_log (user_id, from_account_type, to_account_type, changed_by, reason)
    VALUES (_user_id, v_from, v_target, auth.uid(), NULLIF(_reason,''));

  RETURN v_target;
END;
$$;

-- 4. Role history for the admin detail view
CREATE OR REPLACE FUNCTION public.admin_role_history(_user_id uuid)
RETURNS TABLE(id uuid, from_account_type text, to_account_type text, changed_by uuid, changed_by_name text, reason text, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read role history';
  END IF;
  RETURN QUERY
  SELECT l.id, l.from_account_type, l.to_account_type, l.changed_by,
         COALESCE(p.display_name, 'STRAND Team'), l.reason, l.created_at
  FROM public.role_change_log l
  LEFT JOIN public.profiles p ON p.user_id = l.changed_by
  WHERE l.user_id = _user_id
  ORDER BY l.created_at DESC;
END;
$$;

-- 5. Backfill / repair inconsistent role state
-- 5a. Everyone gets the base consumer role
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'consumer'::app_role FROM public.profiles p
ON CONFLICT (user_id, role) DO NOTHING;

-- 5b. Directory profile (or an active pro subscription for a non-brand account) but no professional role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT u.user_id, 'professional'::app_role
FROM (
  SELECT user_id FROM public.pro_profiles
  UNION
  SELECT s.pro_user_id FROM public.pro_subscriptions s
   WHERE s.status IN ('active','trialing')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles br WHERE br.user_id = s.pro_user_id AND br.role = 'brand')
) u
WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.user_id)
ON CONFLICT (user_id, role) DO NOTHING;

-- 5c. Brand profile or brand subscription but no brand role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT u.user_id, 'brand'::app_role
FROM (
  SELECT user_id FROM public.brand_profiles
  UNION SELECT brand_user_id FROM public.brand_subscriptions WHERE status IN ('active','trialing')
) u
WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.user_id)
ON CONFLICT (user_id, role) DO NOTHING;

-- 5d. Professional role but no directory shell
INSERT INTO public.pro_profiles (user_id, display_name, discipline, is_published)
SELECT r.user_id, COALESCE(NULLIF(p.display_name,''), 'New professional'), 'Stylist'::pro_discipline, false
FROM public.user_roles r
JOIN public.profiles p ON p.user_id = r.user_id
WHERE r.role = 'professional'
  AND NOT EXISTS (SELECT 1 FROM public.pro_profiles pp WHERE pp.user_id = r.user_id)
ON CONFLICT (user_id) DO NOTHING;

-- 5e. Brand role but no brand shell
INSERT INTO public.brand_profiles (user_id, brand_name, contact_name)
SELECT r.user_id, COALESCE(NULLIF(p.display_name,''), 'New brand'), NULLIF(p.display_name,'')
FROM public.user_roles r
JOIN public.profiles p ON p.user_id = r.user_id
WHERE r.role = 'brand'
  AND NOT EXISTS (SELECT 1 FROM public.brand_profiles bp WHERE bp.user_id = r.user_id)
ON CONFLICT (user_id) DO NOTHING;