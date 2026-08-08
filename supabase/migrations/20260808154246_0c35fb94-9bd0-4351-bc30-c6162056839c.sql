-- Add an originating-surface column to the append-only consent ledger.
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS source text;

DROP FUNCTION IF EXISTS public.record_consents(text, jsonb, text);
DROP FUNCTION IF EXISTS public.withdraw_consent(text, text);

CREATE OR REPLACE FUNCTION public.record_consents(
  _version text,
  _consents jsonb,
  _user_agent text DEFAULT NULL,
  _source text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _key text;
  _granted boolean;
  _mandatory text[] := ARRAY['terms','privacy','age_18','medical_disclaimer','health_data'];
  _all_mandatory boolean := true;
  _src text := coalesce(_source, 'consent_gate');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR _key, _granted IN
    SELECT k, (v)::boolean FROM jsonb_each_text(_consents) AS t(k, v)
  LOOP
    IF _key NOT IN ('terms','privacy','age_18','medical_disclaimer','health_data','personalised_offers','marketing_email') THEN
      RAISE EXCEPTION 'Unknown consent key: %', _key;
    END IF;

    INSERT INTO public.user_consents (user_id, consent_key, granted, document_version, user_agent, source)
    VALUES (_uid, _key, _granted, _version, _user_agent, _src);

    IF _key = 'personalised_offers' THEN
      UPDATE public.profiles SET personalised_offers_consent = _granted WHERE user_id = _uid;
      INSERT INTO public.ad_consent_log (user_id, consent_given, source)
      VALUES (_uid, _granted, _src);
    END IF;

    IF _key = 'marketing_email' THEN
      INSERT INTO public.email_preferences (user_id, marketing_consent, marketing_consent_at)
      VALUES (_uid, _granted, CASE WHEN _granted THEN now() ELSE NULL END)
      ON CONFLICT (user_id) DO UPDATE
        SET marketing_consent = EXCLUDED.marketing_consent,
            marketing_consent_at = EXCLUDED.marketing_consent_at;
    END IF;
  END LOOP;

  FOREACH _key IN ARRAY _mandatory LOOP
    IF COALESCE((_consents ->> _key)::boolean, false) IS NOT TRUE THEN
      _all_mandatory := false;
    END IF;
  END LOOP;

  IF _all_mandatory THEN
    UPDATE public.profiles
       SET terms_version = _version,
           terms_accepted_at = now()
     WHERE user_id = _uid;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_consent(
  _key text,
  _version text DEFAULT NULL,
  _source text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _src text := coalesce(_source, 'settings');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _key NOT IN ('personalised_offers','marketing_email') THEN
    RAISE EXCEPTION 'Only optional consents can be withdrawn here';
  END IF;

  INSERT INTO public.user_consents (user_id, consent_key, granted, document_version, source)
  VALUES (_uid, _key, false, _version, _src);

  IF _key = 'personalised_offers' THEN
    UPDATE public.profiles SET personalised_offers_consent = false WHERE user_id = _uid;
    INSERT INTO public.ad_consent_log (user_id, consent_given, source) VALUES (_uid, false, _src);
  ELSE
    INSERT INTO public.email_preferences (user_id, marketing_consent, marketing_consent_at)
    VALUES (_uid, false, NULL)
    ON CONFLICT (user_id) DO UPDATE SET marketing_consent = false, marketing_consent_at = NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_consents(text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_consent(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_consents(text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_consent(text, text, text) TO authenticated;