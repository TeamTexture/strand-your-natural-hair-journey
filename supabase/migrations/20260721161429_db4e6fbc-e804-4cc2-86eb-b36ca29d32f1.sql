-- Extend brand_products to support both products and tools
ALTER TABLE public.brand_products
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product' CHECK (kind IN ('product','tool')),
  ADD COLUMN IF NOT EXISTS tool_kind text,
  ADD COLUMN IF NOT EXISTS key_features text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS materials text[] NOT NULL DEFAULT '{}';

-- Link user_tools rows back to their originating brand offer / brand product,
-- mirroring user_products.linked_brand_offer_id / linked_brand_product_id.
ALTER TABLE public.user_tools
  ADD COLUMN IF NOT EXISTS linked_brand_offer_id uuid REFERENCES public.brand_offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_brand_product_id uuid REFERENCES public.brand_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_tools_linked_brand_offer
  ON public.user_tools(linked_brand_offer_id)
  WHERE linked_brand_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_tools_linked_brand_product
  ON public.user_tools(linked_brand_product_id)
  WHERE linked_brand_product_id IS NOT NULL;