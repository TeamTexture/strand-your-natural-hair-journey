CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emails jsonb;
  v_complimentary boolean := false;
  v_consumer_trial boolean := false;
BEGIN
  SELECT value INTO v_emails FROM public.platform_settings WHERE key = 'complimentary_emails';
  IF v_emails IS NOT NULL AND jsonb_typeof(v_emails) = 'array' THEN
    v_complimentary := EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_emails) e
      WHERE lower(trim(e)) = lower(trim(coalesce(new.email, '')))
    );
  END IF;

  v_consumer_trial :=
    NOT v_complimentary
    AND NOT coalesce((new.raw_user_meta_data->>'pro_intent')::boolean, false)
    AND NOT coalesce((new.raw_user_meta_data->>'brand_intent')::boolean, false);

  INSERT INTO public.profiles (user_id, display_name, complimentary_access, trial_offer_at)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
      v_complimentary,
      CASE WHEN v_consumer_trial THEN now() ELSE NULL END
    )
    ON CONFLICT (user_id) DO UPDATE
      SET
        complimentary_access = public.profiles.complimentary_access OR EXCLUDED.complimentary_access,
        trial_offer_at = CASE
          WHEN EXCLUDED.trial_offer_at IS NOT NULL
            AND public.profiles.trial_offer_at IS NULL
            AND public.profiles.complimentary_access = false
          THEN EXCLUDED.trial_offer_at
          ELSE public.profiles.trial_offer_at
        END;
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Backfill the small set of consumer accounts created after the trial funnel was introduced
-- but before the signup trigger stamped them automatically.
UPDATE public.profiles p
SET trial_offer_at = now()
WHERE p.trial_offer_at IS NULL
  AND p.created_at >= timestamptz '2026-08-25 18:28:00+00'
  AND COALESCE(p.complimentary_access, false) = false
  AND NOT public.has_role(p.user_id, 'admin')
  AND NOT public.has_role(p.user_id, 'professional')
  AND NOT public.has_role(p.user_id, 'brand')
  AND NOT EXISTS (
    SELECT 1 FROM public.brand_profiles bp WHERE bp.user_id = p.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.pro_applications pa WHERE pa.user_id = p.user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.consumer_subscriptions cs
    WHERE cs.user_id = p.user_id
      AND cs.status IN ('active', 'trialing')
      AND COALESCE(cs.paused, false) = false
      AND (cs.current_period_end IS NULL OR cs.current_period_end > now())
  );