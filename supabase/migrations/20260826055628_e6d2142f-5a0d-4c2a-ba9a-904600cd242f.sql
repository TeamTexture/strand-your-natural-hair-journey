ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personalised_offers_prompt_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS personalised_offers_prompt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personalised_offers_answered_at timestamptz;

-- Allow the prompt bookkeeping columns through the registration lock the same
-- way the consent columns already pass (they are never member-entered data).
CREATE OR REPLACE FUNCTION public.profiles_registration_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_basic_complete boolean;
  _registration_fields_only boolean;
  _consent_fields_only boolean;
  _consent_cols text[] := ARRAY[
    'terms_version','terms_accepted_at','personalised_offers_consent','updated_at',
    'consent_updated_at','personalised_offers_prompt_seen_at',
    'personalised_offers_prompt_count','personalised_offers_answered_at'
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
      'avatar_url','display_name','phone_number','birth_year','postcode','country','heritage','updated_at'
    ]) =
    (to_jsonb(OLD) - ARRAY[
      'avatar_url','display_name','phone_number','birth_year','postcode','country','heritage','updated_at'
    ]);

  IF OLD.trial_offer_at IS NULL OR _old_basic_complete OR NOT _registration_fields_only THEN
    RAISE EXCEPTION 'Registration-only profile updates are locked until membership is active' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

-- One-call bookkeeping for the /home offers card: records that it was shown and,
-- when she chose, that it is answered and must never appear again.
CREATE OR REPLACE FUNCTION public.personalised_offers_prompt_ack(_answered boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.profiles
  SET personalised_offers_prompt_seen_at = now(),
      personalised_offers_prompt_count = COALESCE(personalised_offers_prompt_count, 0) + 1,
      personalised_offers_answered_at = CASE
        WHEN COALESCE(_answered, false) THEN now() ELSE personalised_offers_answered_at END
  WHERE user_id = v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.personalised_offers_prompt_ack(boolean) TO authenticated;

-- Queryable Klaviyo sync log (successes and failures) so pushes can be audited
-- without digging through function console output.
CREATE TABLE IF NOT EXISTS public.klaviyo_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  email text,
  user_id uuid,
  list_id text,
  action text NOT NULL,
  ok boolean NOT NULL,
  error text,
  context jsonb
);

GRANT SELECT ON public.klaviyo_sync_log TO authenticated;
GRANT ALL ON public.klaviyo_sync_log TO service_role;
ALTER TABLE public.klaviyo_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read klaviyo sync log" ON public.klaviyo_sync_log;
CREATE POLICY "Admins read klaviyo sync log" ON public.klaviyo_sync_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS klaviyo_sync_log_created_idx ON public.klaviyo_sync_log (created_at DESC);