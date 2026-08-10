ALTER TABLE public.treatment_plan_products ADD COLUMN IF NOT EXISTS storage_path text;

UPDATE public.treatment_plan_products p
SET storage_path = up.storage_path
FROM public.user_products up
WHERE p.user_product_id = up.id
  AND p.storage_path IS NULL
  AND up.storage_path IS NOT NULL;