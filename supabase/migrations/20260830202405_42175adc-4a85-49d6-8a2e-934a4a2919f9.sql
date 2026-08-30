CREATE OR REPLACE FUNCTION public.profiles_registration_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _registration_fields_only boolean;
  _consent_fields_only boolean;
  _attribution_fields_only boolean;
  _consent_cols text[] := ARRAY[
    'terms_version','terms_accepted_at','personalised_offers_consent','updated_at',
    'consent_updated_at','personalised_offers_prompt_seen_at',
    'personalised_offers_prompt_count','personalised_offers_answered_at'
  ];
  _attribution_cols text[] := ARRAY[
    'acquisition_source','acquisition_source_other','acquisition_asked_at','updated_at'
  ];
  _registration_cols text[] := ARRAY[
    'avatar_url','display_name','phone_number','birth_year','postcode','country','heritage',
    'geo_checked_at','international_block','international_country','updated_at'
  ];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF public.can_write_consumer_onboarding(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  _consent_fields_only := (to_jsonb(NEW) - _consent_cols) = (to_jsonb(OLD) - _consent_cols);
  IF _consent_fields_only THEN
    RETURN NEW;
  END IF;

  -- The attribution question sits BEFORE the trial paywall, so its answer must
  -- always be writable even while the rest of the profile is locked.
  _attribution_fields_only := (to_jsonb(NEW) - _attribution_cols) = (to_jsonb(OLD) - _attribution_cols);
  IF _attribution_fields_only THEN
    RETURN NEW;
  END IF;

  _registration_fields_only :=
    (to_jsonb(NEW) - _registration_cols) = (to_jsonb(OLD) - _registration_cols);

  IF OLD.trial_offer_at IS NULL OR NOT _registration_fields_only THEN
    RAISE EXCEPTION 'Registration-only profile updates are locked until membership is active' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;