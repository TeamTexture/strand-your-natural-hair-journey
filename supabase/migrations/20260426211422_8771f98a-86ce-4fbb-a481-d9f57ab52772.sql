ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS on_favourite boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS user_products_user_favourite_idx
  ON public.user_products (user_id) WHERE on_favourite = true;