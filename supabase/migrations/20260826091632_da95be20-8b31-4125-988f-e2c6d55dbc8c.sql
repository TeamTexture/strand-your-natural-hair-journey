ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS marketed_purpose_note text,
  ADD COLUMN IF NOT EXISTS marketed_purpose_confidence text;