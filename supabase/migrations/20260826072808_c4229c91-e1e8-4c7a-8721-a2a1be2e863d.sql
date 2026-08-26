ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS analysis_ingredients_hash text;