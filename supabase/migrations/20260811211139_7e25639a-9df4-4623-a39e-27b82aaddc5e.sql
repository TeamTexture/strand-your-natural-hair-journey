ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_confirmed_at timestamptz;

COMMENT ON COLUMN public.profiles.profile_confirmed_at IS
  'Set when the member has confirmed their own hair/health/colour answers in their own words. NULL = never confirmed since onboarding defaults were removed (2026-08). Never backfilled.';