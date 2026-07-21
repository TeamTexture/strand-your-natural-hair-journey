
-- 1. Column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_restricted boolean NOT NULL DEFAULT false;

-- 2. Extend the admin-only guard to cover access_restricted as well
CREATE OR REPLACE FUNCTION public.enforce_complimentary_access_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.complimentary_access IS DISTINCT FROM OLD.complimentary_access
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change complimentary_access';
  END IF;
  IF NEW.access_restricted IS DISTINCT FROM OLD.access_restricted
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change access_restricted';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Helper: is this user access-restricted?
CREATE OR REPLACE FUNCTION public.is_access_restricted(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT access_restricted FROM public.profiles WHERE user_id = _user_id),
    false
  )
$$;

-- 4. Gate subscription helpers on the restriction flag
CREATE OR REPLACE FUNCTION public.has_active_consumer_subscription(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.is_access_restricted(_user)
    AND (
      COALESCE((SELECT complimentary_access FROM public.profiles WHERE user_id = _user), false)
      OR public.has_role(_user, 'admin')
      OR public.has_role(_user, 'professional')
      OR EXISTS (
        SELECT 1 FROM public.consumer_subscriptions
        WHERE user_id = _user
          AND status IN ('active', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.has_active_pro_subscription(_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.is_access_restricted(_pro)
    AND EXISTS (
      SELECT 1 FROM public.pro_subscriptions
      WHERE pro_user_id = _pro
        AND status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > now())
    )
$$;

-- 5. Admin action: restrict a user (all-in-one)
CREATE OR REPLACE FUNCTION public.admin_restrict_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can restrict accounts';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Admins cannot restrict their own account';
  END IF;

  -- Flip the flag
  UPDATE public.profiles
    SET access_restricted = true
    WHERE user_id = _user_id;

  -- If they are a professional: pull their listing and cut client access.
  UPDATE public.pro_profiles
    SET is_published = false,
        suspended_at = now()
    WHERE user_id = _user_id;

  UPDATE public.pro_client_access
    SET revoked_at = now()
    WHERE pro_user_id = _user_id
      AND revoked_at IS NULL;
END;
$$;

-- 6. Admin action: lift the restriction
CREATE OR REPLACE FUNCTION public.admin_unrestrict_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can unrestrict accounts';
  END IF;

  UPDATE public.profiles
    SET access_restricted = false
    WHERE user_id = _user_id;
END;
$$;

-- 7. Grants
GRANT EXECUTE ON FUNCTION public.is_access_restricted(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restrict_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unrestrict_user(uuid) TO authenticated;
