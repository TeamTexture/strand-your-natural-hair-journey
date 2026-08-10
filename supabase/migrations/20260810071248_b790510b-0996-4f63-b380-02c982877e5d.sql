ALTER TABLE public.treatment_plan_products
  ADD COLUMN IF NOT EXISTS user_product_id uuid REFERENCES public.user_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_url text;

CREATE INDEX IF NOT EXISTS treatment_plan_products_user_product_idx
  ON public.treatment_plan_products (user_product_id);