-- Consent is role-aware. Brands have no health profile and receive no hair
-- guidance, so health_data and medical_disclaimer are not in scope for them.
-- Professionals instead give a confidentiality undertaking over member records
-- they are granted access to — a different obligation, with its own key.
create or replace function public.record_consents(_version text, _consents jsonb, _user_agent text default null::text, _source text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _uid uuid := auth.uid();
  _key text;
  _granted boolean;
  _roles text[];
  _mandatory text[];
  _all_mandatory boolean := true;
  _src text := coalesce(_source, 'consent_gate');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT coalesce(array_agg(role::text), ARRAY[]::text[]) INTO _roles
  FROM public.user_roles WHERE user_id = _uid;

  -- Union of mandatory keys across the account's roles. No roles yet ⇒ member.
  _mandatory := ARRAY['terms','privacy','age_18'];
  IF _roles = ARRAY[]::text[]
     OR 'consumer' = ANY(_roles) OR 'professional' = ANY(_roles) OR 'admin' = ANY(_roles) THEN
    _mandatory := _mandatory || 'medical_disclaimer';
  END IF;
  IF _roles = ARRAY[]::text[] OR 'consumer' = ANY(_roles) THEN
    _mandatory := _mandatory || 'health_data';
  END IF;
  IF 'professional' = ANY(_roles) THEN
    _mandatory := _mandatory || 'professional_data_handling';
  END IF;

  FOR _key, _granted IN
    SELECT k, (v)::boolean FROM jsonb_each_text(_consents) AS t(k, v)
  LOOP
    IF _key NOT IN ('terms','privacy','age_18','medical_disclaimer','health_data','professional_data_handling','personalised_offers','marketing_email') THEN
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

  -- The profile stamp means "this account has accepted everything required of
  -- it", so it is evaluated against the role-aware set, including any key that
  -- was already granted in an earlier append-only row.
  FOREACH _key IN ARRAY _mandatory LOOP
    IF COALESCE((_consents ->> _key)::boolean, false) IS NOT TRUE THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.user_consents c
        WHERE c.user_id = _uid AND c.consent_key = _key AND c.granted
          AND c.document_version = _version
      ) THEN
        _all_mandatory := false;
      END IF;
    END IF;
  END LOOP;

  IF _all_mandatory THEN
    UPDATE public.profiles
       SET terms_version = _version,
           terms_accepted_at = now()
     WHERE user_id = _uid;
  END IF;
END;
$function$;