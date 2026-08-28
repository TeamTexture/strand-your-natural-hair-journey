ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS usage_instructions_source text;

COMMENT ON COLUMN public.user_products.usage_instructions_source IS
  'Provenance of usage_instructions: label_photo (photographed label) or brand_page (brand official product page). Null = legacy/unknown.';