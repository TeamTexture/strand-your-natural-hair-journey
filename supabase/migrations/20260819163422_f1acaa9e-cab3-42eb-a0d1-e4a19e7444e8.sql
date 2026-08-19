ALTER TABLE public.user_supplements
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS storage_path text;