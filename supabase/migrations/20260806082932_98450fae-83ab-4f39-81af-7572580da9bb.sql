ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS sells_supplements_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sells_supplements_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplements_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplements_verified_by uuid;

CREATE OR REPLACE FUNCTION public.brand_profiles_lock_blood_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.offers_at_home_blood_tests_verified := OLD.offers_at_home_blood_tests_verified;
  NEW.blood_tests_verified_at := OLD.blood_tests_verified_at;
  NEW.blood_tests_verified_by := OLD.blood_tests_verified_by;
  NEW.sells_supplements_verified := OLD.sells_supplements_verified;
  NEW.supplements_verified_at := OLD.supplements_verified_at;
  NEW.supplements_verified_by := OLD.supplements_verified_by;
  RETURN NEW;
END;
$function$;