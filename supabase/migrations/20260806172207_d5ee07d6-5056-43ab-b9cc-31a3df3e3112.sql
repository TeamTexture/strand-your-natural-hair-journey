ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS ingredients_source text
    CHECK (ingredients_source IN ('brand', 'scan', 'link', 'manual'));

-- Backfill from how the row was originally created.
UPDATE public.user_products
SET ingredients_source = CASE
  WHEN linked_brand_product_id IS NOT NULL THEN 'brand'
  WHEN product_key LIKE 'scan-%' THEN 'scan'
  WHEN product_key LIKE 'link-%' OR source_url IS NOT NULL THEN 'link'
  ELSE 'manual'
END
WHERE ingredients_source IS NULL;

COMMENT ON COLUMN public.user_products.ingredients_source IS
  'Provenance of the product detail/ingredients on this row: brand (inherited from an approved brand catalogue product), scan (label photos), link (product URL), manual.';