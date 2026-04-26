ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS off_shelf_reason text,
  ADD COLUMN IF NOT EXISTS off_shelf_voice_url text;