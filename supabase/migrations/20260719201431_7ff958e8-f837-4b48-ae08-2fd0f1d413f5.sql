ALTER TABLE public.user_hair_profile
  ADD COLUMN IF NOT EXISTS length_inches numeric(4,1),
  ADD COLUMN IF NOT EXISTS length_bucket text;