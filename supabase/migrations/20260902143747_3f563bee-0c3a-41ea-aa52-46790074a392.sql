ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_number_uk_mobile;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_number_uk_mobile
  CHECK (phone_number IS NULL OR phone_number ~ '^\+447[0-9]{9}$')
  NOT VALID;

COMMENT ON CONSTRAINT profiles_phone_number_uk_mobile ON public.profiles IS
  'UK mobile numbers only, stored E.164 as +447XXXXXXXXX. NOT VALID so legacy rows saved before registration validation are untouched; every new write is checked.';