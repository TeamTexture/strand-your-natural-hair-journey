ALTER TABLE public.user_products DROP CONSTRAINT IF EXISTS user_products_ingredients_source_check;
ALTER TABLE public.user_products ADD CONSTRAINT user_products_ingredients_source_check
  CHECK (ingredients_source = ANY (ARRAY['brand','scan','link','manual','homemade','homemade_manual','homemade_scan']));