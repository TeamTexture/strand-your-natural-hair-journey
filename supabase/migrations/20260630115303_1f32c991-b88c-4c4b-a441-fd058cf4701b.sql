ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Backfill: any profile that already has a hair profile row is considered onboarded.
UPDATE public.profiles p
SET onboarding_completed_at = COALESCE(p.onboarding_completed_at, now())
WHERE EXISTS (SELECT 1 FROM public.user_hair_profile h WHERE h.user_id = p.user_id);