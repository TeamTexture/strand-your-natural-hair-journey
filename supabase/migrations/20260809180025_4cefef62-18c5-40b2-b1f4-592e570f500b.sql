ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS hidden_from_directory boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Brand profile of active offer readable" ON public.brand_profiles;
CREATE POLICY "Brand profile of active offer readable"
ON public.brand_profiles FOR SELECT
USING (
  NOT hidden_from_directory
  AND EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.brand_user_id = brand_profiles.user_id
      AND o.status = ANY (ARRAY['paid_scheduled'::brand_offer_status, 'live'::brand_offer_status])
      AND o.starts_on IS NOT NULL AND o.ends_on IS NOT NULL
      AND o.starts_on <= public.strand_today_london()
      AND o.ends_on >= public.strand_today_london()
  )
);

DROP POLICY IF EXISTS "Verified blood test brands readable" ON public.brand_profiles;
CREATE POLICY "Verified blood test brands readable"
ON public.brand_profiles FOR SELECT
USING (
  NOT hidden_from_directory
  AND offers_at_home_blood_tests_verified
  AND public.has_active_brand_subscription(user_id)
);