CREATE OR REPLACE FUNCTION public.profiles_registration_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _old_basic_complete boolean;
  _registration_fields_only boolean;
  _consent_fields_only boolean;
  _consent_cols text[] := ARRAY['terms_version','terms_accepted_at','personalised_offers_consent','updated_at'];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF public.can_write_consumer_onboarding(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  -- Consent decisions are a legal gate taken at registration, BEFORE any card
  -- is confirmed. Recording them touches only the consent columns, so a
  -- consent-only update is always allowed; nothing else opens up.
  _consent_fields_only := (to_jsonb(NEW) - _consent_cols) = (to_jsonb(OLD) - _consent_cols);
  IF _consent_fields_only THEN
    RETURN NEW;
  END IF;

  _old_basic_complete := (
    OLD.avatar_url IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(OLD.display_name, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(OLD.phone_number, '')), '') IS NOT NULL
    AND OLD.birth_year IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(OLD.postcode, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(OLD.country, '')), '') IS NOT NULL
  );

  _registration_fields_only :=
    (to_jsonb(NEW) - ARRAY[
      'avatar_url',
      'display_name',
      'phone_number',
      'birth_year',
      'postcode',
      'country',
      'heritage',
      'updated_at'
    ]) =
    (to_jsonb(OLD) - ARRAY[
      'avatar_url',
      'display_name',
      'phone_number',
      'birth_year',
      'postcode',
      'country',
      'heritage',
      'updated_at'
    ]);

  IF OLD.trial_offer_at IS NULL OR _old_basic_complete OR NOT _registration_fields_only THEN
    RAISE EXCEPTION 'Registration-only profile updates are locked until membership is active' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;