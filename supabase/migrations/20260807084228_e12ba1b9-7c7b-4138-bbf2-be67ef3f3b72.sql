ALTER TABLE public.brand_products DROP CONSTRAINT IF EXISTS brand_products_source_type_check;
ALTER TABLE public.brand_products
  ADD CONSTRAINT brand_products_source_type_check
  CHECK (source_type IN ('manual','scan','link','ai','linked','ai_generated'));

ALTER TABLE public.brand_products DROP CONSTRAINT IF EXISTS brand_products_ingredients_source_check;
ALTER TABLE public.brand_products
  ADD CONSTRAINT brand_products_ingredients_source_check
  CHECK (ingredients_source IS NULL OR ingredients_source IN ('brand','manual','scan','link'));

UPDATE public.brand_products SET kind = 'product' WHERE kind IS NULL OR kind NOT IN ('product','tool','supplement');
ALTER TABLE public.brand_products DROP CONSTRAINT IF EXISTS brand_products_kind_check;
ALTER TABLE public.brand_products
  ADD CONSTRAINT brand_products_kind_check
  CHECK (kind IN ('product','tool','supplement'));