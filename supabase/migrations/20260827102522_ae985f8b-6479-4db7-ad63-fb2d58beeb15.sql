ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS is_homemade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homemade_recipe jsonb;

CREATE INDEX IF NOT EXISTS user_products_homemade_idx
  ON public.user_products (user_id)
  WHERE is_homemade;

COMMENT ON COLUMN public.user_products.homemade_recipe IS
  'Array of { ingredient: text, amount: text } pairs for member-made recipes. amount is deliberately free text. ingredients text[] is kept in sync with the ingredient names for downstream consumers.';