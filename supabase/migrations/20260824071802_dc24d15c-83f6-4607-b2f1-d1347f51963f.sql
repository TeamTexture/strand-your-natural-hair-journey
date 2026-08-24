ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_prompt_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS product_prompt_seen_at timestamptz;