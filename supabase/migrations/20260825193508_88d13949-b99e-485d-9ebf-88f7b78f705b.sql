CREATE OR REPLACE FUNCTION public.can_write_consumer_onboarding(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _user IS NOT NULL
    AND NOT public.is_access_restricted(_user)
    AND (
      -- Existing/pre-trial-funnel members keep the historical path.
      NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.user_id = _user
          AND p.trial_offer_at IS NOT NULL
      )
      -- Explicit bypasses requested for the trial wall.
      OR COALESCE((SELECT p.complimentary_access FROM public.profiles p WHERE p.user_id = _user), false)
      OR public.has_role(_user, 'admin')
      OR public.has_role(_user, 'professional')
      -- A card-confirmed live consumer entitlement.
      OR EXISTS (
        SELECT 1
        FROM public.consumer_subscriptions s
        WHERE s.user_id = _user
          AND s.status IN ('active', 'trialing')
          AND COALESCE(s.paused, false) = false
          AND (s.current_period_end IS NULL OR s.current_period_end > now())
      )
    )
$function$;

REVOKE ALL ON FUNCTION public.can_write_consumer_onboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_consumer_onboarding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_consumer_onboarding(uuid) TO service_role;

-- profiles: keep read/admin policies, but own profile edits from onboarding are blocked while trial-walled.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

DROP POLICY IF EXISTS "Users delete own profile" ON public.profiles;
CREATE POLICY "Users delete own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- health profile
DROP POLICY IF EXISTS "Users insert own health profile" ON public.user_health_profile;
DROP POLICY IF EXISTS "Users update own health profile" ON public.user_health_profile;
DROP POLICY IF EXISTS "Users delete own health profile" ON public.user_health_profile;
CREATE POLICY "Users insert own health profile"
ON public.user_health_profile
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own health profile"
ON public.user_health_profile
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own health profile"
ON public.user_health_profile
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- medications written by the health step
DROP POLICY IF EXISTS "Users insert own meds" ON public.user_medications;
DROP POLICY IF EXISTS "Users update own meds" ON public.user_medications;
DROP POLICY IF EXISTS "Users delete own meds" ON public.user_medications;
CREATE POLICY "Users insert own meds"
ON public.user_medications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own meds"
ON public.user_medications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own meds"
ON public.user_medications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- supplements
DROP POLICY IF EXISTS "Users insert own supplements" ON public.user_supplements;
DROP POLICY IF EXISTS "Users update own supplements" ON public.user_supplements;
DROP POLICY IF EXISTS "Users delete own supplements" ON public.user_supplements;
CREATE POLICY "Users insert own supplements"
ON public.user_supplements
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own supplements"
ON public.user_supplements
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own supplements"
ON public.user_supplements
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- hair profile
DROP POLICY IF EXISTS "Users insert own hair profile" ON public.user_hair_profile;
DROP POLICY IF EXISTS "Users update own hair profile" ON public.user_hair_profile;
DROP POLICY IF EXISTS "Users delete own hair profile" ON public.user_hair_profile;
CREATE POLICY "Users insert own hair profile"
ON public.user_hair_profile
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own hair profile"
ON public.user_hair_profile
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own hair profile"
ON public.user_hair_profile
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- style profile
DROP POLICY IF EXISTS "Users insert own style profile" ON public.user_style_profile;
DROP POLICY IF EXISTS "Users update own style profile" ON public.user_style_profile;
DROP POLICY IF EXISTS "Users delete own style profile" ON public.user_style_profile;
CREATE POLICY "Users insert own style profile"
ON public.user_style_profile
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own style profile"
ON public.user_style_profile
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own style profile"
ON public.user_style_profile
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- goals
DROP POLICY IF EXISTS "Users insert own goals" ON public.user_goals;
DROP POLICY IF EXISTS "Users update own goals" ON public.user_goals;
DROP POLICY IF EXISTS "Users delete own goals" ON public.user_goals;
CREATE POLICY "Users insert own goals"
ON public.user_goals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own goals"
ON public.user_goals
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own goals"
ON public.user_goals
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- challenges mirrored by the goal step
DROP POLICY IF EXISTS "Users manage their own challenges" ON public.user_challenges;
DROP POLICY IF EXISTS "Users view own challenges" ON public.user_challenges;
DROP POLICY IF EXISTS "Users insert own challenges" ON public.user_challenges;
DROP POLICY IF EXISTS "Users update own challenges" ON public.user_challenges;
DROP POLICY IF EXISTS "Users delete own challenges" ON public.user_challenges;
CREATE POLICY "Users view own challenges"
ON public.user_challenges
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Users insert own challenges"
ON public.user_challenges
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own challenges"
ON public.user_challenges
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own challenges"
ON public.user_challenges
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- onboarding drafts
DROP POLICY IF EXISTS "Members write own onboarding drafts" ON public.onboarding_drafts;
DROP POLICY IF EXISTS "Members update own onboarding drafts" ON public.onboarding_drafts;
DROP POLICY IF EXISTS "Members delete own onboarding drafts" ON public.onboarding_drafts;
CREATE POLICY "Members write own onboarding drafts"
ON public.onboarding_drafts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Members update own onboarding drafts"
ON public.onboarding_drafts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Members delete own onboarding drafts"
ON public.onboarding_drafts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- optional blood onboarding flow
DROP POLICY IF EXISTS "Users manage own blood panels" ON public.blood_panels;
DROP POLICY IF EXISTS "Users view own blood panels" ON public.blood_panels;
DROP POLICY IF EXISTS "Users insert own blood panels" ON public.blood_panels;
DROP POLICY IF EXISTS "Users update own blood panels" ON public.blood_panels;
DROP POLICY IF EXISTS "Users delete own blood panels" ON public.blood_panels;
CREATE POLICY "Users view own blood panels"
ON public.blood_panels
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Users insert own blood panels"
ON public.blood_panels
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own blood panels"
ON public.blood_panels
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own blood panels"
ON public.blood_panels
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

DROP POLICY IF EXISTS "Users insert own blood" ON public.blood_results;
DROP POLICY IF EXISTS "Users update own blood" ON public.blood_results;
DROP POLICY IF EXISTS "Users delete own blood" ON public.blood_results;
CREATE POLICY "Users insert own blood"
ON public.blood_results
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users update own blood"
ON public.blood_results
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "Users delete own blood"
ON public.blood_results
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- before photos captured from onboarding
DROP POLICY IF EXISTS "users manage own before photos" ON public.user_before_photos;
DROP POLICY IF EXISTS "users view own before photos" ON public.user_before_photos;
DROP POLICY IF EXISTS "users insert own before photos" ON public.user_before_photos;
DROP POLICY IF EXISTS "users update own before photos" ON public.user_before_photos;
DROP POLICY IF EXISTS "users delete own before photos" ON public.user_before_photos;
CREATE POLICY "users view own before photos"
ON public.user_before_photos
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "users insert own before photos"
ON public.user_before_photos
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "users update own before photos"
ON public.user_before_photos
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id))
WITH CHECK (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));
CREATE POLICY "users delete own before photos"
ON public.user_before_photos
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.can_write_consumer_onboarding(user_id));

-- Storage objects uploaded from onboarding/profile-photo screens.
DROP POLICY IF EXISTS "Users upload own avatar files" ON storage.objects;
CREATE POLICY "Users upload own avatar files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_onboarding(auth.uid())
);
DROP POLICY IF EXISTS "Users update own avatar files" ON storage.objects;
CREATE POLICY "Users update own avatar files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_onboarding(auth.uid())
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_onboarding(auth.uid())
);
DROP POLICY IF EXISTS "Users delete own avatar files" ON storage.objects;
CREATE POLICY "Users delete own avatar files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_onboarding(auth.uid())
);

DROP POLICY IF EXISTS "before-photos: write own" ON storage.objects;
CREATE POLICY "before-photos: write own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'before-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_onboarding(auth.uid())
);
DROP POLICY IF EXISTS "before-photos: update own" ON storage.objects;
CREATE POLICY "before-photos: update own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'before-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_onboarding(auth.uid())
)
WITH CHECK (
  bucket_id = 'before-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_onboarding(auth.uid())
);
DROP POLICY IF EXISTS "before-photos: delete own" ON storage.objects;
CREATE POLICY "before-photos: delete own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'before-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_onboarding(auth.uid())
);