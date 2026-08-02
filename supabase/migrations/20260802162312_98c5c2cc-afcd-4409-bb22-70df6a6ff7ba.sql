DROP POLICY IF EXISTS "Pro updates own profile" ON public.pro_profiles;
CREATE POLICY "Pro updates own profile"
  ON public.pro_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_pro_profile_self_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins (and service-side writes with no auth context) may do anything.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- A professional may only submit their own profile for review; they can
  -- never approve or publish it themselves.
  IF NEW.profile_review_status IS DISTINCT FROM OLD.profile_review_status THEN
    IF NOT (
      NEW.profile_review_status = 'submitted'
      AND OLD.profile_review_status IN ('draft','changes_requested')
    ) THEN
      NEW.profile_review_status := OLD.profile_review_status;
    END IF;
  END IF;

  IF NEW.is_published IS DISTINCT FROM OLD.is_published
     AND NEW.is_published = true
     AND OLD.profile_review_status <> 'approved' THEN
    NEW.is_published := OLD.is_published;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_pro_profile_self_review ON public.pro_profiles;
CREATE TRIGGER guard_pro_profile_self_review
  BEFORE UPDATE ON public.pro_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_pro_profile_self_review();