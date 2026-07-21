-- Link user_products rows to the brand offer that surfaced them so the
-- wishlist can display the sponsored context (discount code, end date) as
-- long as the offer is live.
ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS linked_brand_offer_id uuid,
  ADD COLUMN IF NOT EXISTS linked_brand_product_id uuid;

CREATE INDEX IF NOT EXISTS user_products_linked_brand_offer_idx
  ON public.user_products (linked_brand_offer_id)
  WHERE linked_brand_offer_id IS NOT NULL;