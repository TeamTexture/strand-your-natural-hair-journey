-- 1. Leftover rows from the two deleted test accounts (no FK to auth.users).
DELETE FROM public.moodboards
WHERE user_id IN (
  'e377d88c-e981-4b40-a187-31f81b446093',
  'f617613a-2198-4a5f-bcad-55e91c6873a8'
);

-- 2. ONE server-side normaliser. Mirrors src/lib/phone.ts: strips formatting,
--    converts 00 / bare-national forms, strips the trunk zero, and defaults a
--    bare national number to the UK (+44). Returns NULL when the result is not a
--    plausible E.164 number, so the CHECK below rejects the write.
CREATE OR REPLACE FUNCTION public.normalise_phone_e164(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  had_plus boolean;
  d text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;

  had_plus := left(btrim(raw), 1) = '+';
  d := regexp_replace(raw, '[^0-9]', '', 'g');
  IF d = '' THEN
    RETURN NULL;
  END IF;

  IF NOT had_plus THEN
    IF left(d, 2) = '00' THEN
      d := substr(d, 3);
    ELSIF left(d, 1) = '0' THEN
      -- Local national number typed with a trunk zero: assume the UK.
      d := '44' || regexp_replace(d, '^0+', '');
    ELSIF length(d) <= 11 AND left(d, 1) = '7' THEN
      -- Bare UK mobile without the trunk zero.
      d := '44' || d;
    END IF;
  END IF;

  IF d ~ '^[1-9][0-9]{6,14}$' THEN
    RETURN '+' || d;
  END IF;

  RETURN NULL;
END;
$$;

-- 3. Every write path goes through the normaliser.
CREATE OR REPLACE FUNCTION public.profiles_normalise_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.phone_number IS NOT NULL AND btrim(NEW.phone_number) <> '' THEN
    NEW.phone_number := public.normalise_phone_e164(NEW.phone_number);
    IF NEW.phone_number IS NULL THEN
      RAISE EXCEPTION 'That mobile number is not valid. Enter it with the country code, e.g. +44 7700 900123.';
    END IF;
  ELSE
    NEW.phone_number := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_normalise_phone_trg ON public.profiles;
CREATE TRIGGER profiles_normalise_phone_trg
BEFORE INSERT OR UPDATE OF phone_number ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_normalise_phone();

-- 4. Storage shape: any valid international number, not UK-only.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_number_uk_mobile;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_number_e164
  CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9][0-9]{6,14}$') NOT VALID;