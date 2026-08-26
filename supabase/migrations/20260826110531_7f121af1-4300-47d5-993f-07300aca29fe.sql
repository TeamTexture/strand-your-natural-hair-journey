-- Pre-paywall onboarding write permission: steps 1 (goal & challenges) and 2
-- (About You) are captured BEFORE the trial paywall, so they must not depend on
-- an active subscription. Everything else still goes through
-- can_write_consumer_onboarding.
CREATE OR REPLACE FUNCTION public.can_write_consumer_prepaywall(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user IS NOT NULL AND NOT public.is_access_restricted(_user)
$$;

GRANT EXECUTE ON FUNCTION public.can_write_consumer_prepaywall(uuid) TO authenticated, service_role;

-- user_goals / user_challenges: step 1 of onboarding.
DROP POLICY IF EXISTS "Users insert own goals" ON public.user_goals;
DROP POLICY IF EXISTS "Users update own goals" ON public.user_goals;
DROP POLICY IF EXISTS "Users delete own goals" ON public.user_goals;
CREATE POLICY "Users insert own goals" ON public.user_goals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_prepaywall(user_id));
CREATE POLICY "Users update own goals" ON public.user_goals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.can_write_consumer_prepaywall(user_id))
  WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_prepaywall(user_id));
CREATE POLICY "Users delete own goals" ON public.user_goals FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.can_write_consumer_prepaywall(user_id));

DROP POLICY IF EXISTS "Users insert own challenges" ON public.user_challenges;
DROP POLICY IF EXISTS "Users update own challenges" ON public.user_challenges;
DROP POLICY IF EXISTS "Users delete own challenges" ON public.user_challenges;
CREATE POLICY "Users insert own challenges" ON public.user_challenges FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_prepaywall(user_id));
CREATE POLICY "Users update own challenges" ON public.user_challenges FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.can_write_consumer_prepaywall(user_id))
  WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_prepaywall(user_id));
CREATE POLICY "Users delete own challenges" ON public.user_challenges FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.can_write_consumer_prepaywall(user_id));

-- Profiles: About You columns stay writable before payment, even on a second
-- pass (a member correcting her postcode must not be locked out). Every other
-- column is still frozen until the trial/membership is live.
CREATE OR REPLACE FUNCTION public.profiles_registration_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _registration_fields_only boolean;
  _consent_fields_only boolean;
  _consent_cols text[] := ARRAY[
    'terms_version','terms_accepted_at','personalised_offers_consent','updated_at',
    'consent_updated_at','personalised_offers_prompt_seen_at',
    'personalised_offers_prompt_count','personalised_offers_answered_at'
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

  _registration_fields_only :=
    (to_jsonb(NEW) - _registration_cols) = (to_jsonb(OLD) - _registration_cols);

  IF OLD.trial_offer_at IS NULL OR NOT _registration_fields_only THEN
    RAISE EXCEPTION 'Registration-only profile updates are locked until membership is active' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;