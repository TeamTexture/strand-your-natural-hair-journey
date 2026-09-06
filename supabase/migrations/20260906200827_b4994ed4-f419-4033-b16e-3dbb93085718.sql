-- An E.164 shape constraint on the whole row blocks every unrelated profile
-- update for legacy rows. Validation belongs on phone writes, not consent writes.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_number_e164;

CREATE OR REPLACE FUNCTION public.profiles_normalise_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _normalised text;
BEGIN
  -- Inserts and deliberate phone edits remain strict.
  IF TG_OP = 'INSERT' OR NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN
    IF NEW.phone_number IS NULL OR btrim(NEW.phone_number) = '' THEN
      NEW.phone_number := NULL;
      RETURN NEW;
    END IF;

    _normalised := public.normalise_phone_e164(NEW.phone_number);
    IF _normalised IS NULL THEN
      RAISE EXCEPTION 'That mobile number is not valid. Enter it with the country code, e.g. +44 7700 900123.';
    END IF;
    NEW.phone_number := _normalised;
    RETURN NEW;
  END IF;

  -- On an unrelated update, quietly repair a recognisable legacy number.
  -- If an old value cannot be recognised, preserve it and never block the
  -- unrelated action; it will be validated if the member later edits it.
  IF NEW.phone_number IS NOT NULL
     AND NEW.phone_number !~ '^\+[1-9][0-9]{6,14}$' THEN
    _normalised := public.normalise_phone_e164(NEW.phone_number);
    IF _normalised IS NOT NULL THEN
      NEW.phone_number := _normalised;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_normalise_phone_trg ON public.profiles;
CREATE TRIGGER profiles_normalise_phone_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_normalise_phone();

-- Repair all recognisable legacy values now. This is deliberately limited to
-- values the shared normaliser can convert without guessing.
UPDATE public.profiles
SET phone_number = public.normalise_phone_e164(phone_number)
WHERE phone_number IS NOT NULL
  AND phone_number !~ '^\+[1-9][0-9]{6,14}$'
  AND public.normalise_phone_e164(phone_number) IS NOT NULL;