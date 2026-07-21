ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS specialisms text[] NOT NULL DEFAULT '{}'::text[];