-- 1. GLOSSARY NAME INTEGRITY -------------------------------------------------
-- A generic INCI "Alcohol" must never be displayed or reasoned about as the
-- more specific (and more alarming) "Alcohol Denat.".
UPDATE public.glossary_terms
SET display_name = 'Alcohol',
    what_it_is = 'Ethanol used as a solvent and carrier so other ingredients spread evenly, and to help a product dry faster on the hair.',
    aliases = ARRAY['ethanol','alcohol'],
    updated_at = now()
WHERE inci_key = 'alcohol';

UPDATE public.glossary_terms
SET display_name = 'Isopropyl Alcohol',
    what_it_is = 'A fast-evaporating solvent used to dissolve other ingredients and help a product dry quickly on the hair.',
    aliases = ARRAY['isopropanol','ipa'],
    updated_at = now()
WHERE inci_key = 'isopropyl alcohol';

UPDATE public.glossary_terms
SET aliases = ARRAY['denatured alcohol','sd alcohol 40','alcohol denat'],
    updated_at = now()
WHERE inci_key = 'alcohol denat';

-- 2. PURGE THE RETIRED CROSS-PRODUCT FIT CACHE -------------------------------
-- Every `ingredient_fit:<inci_key>` row was generated product-blind and could
-- contradict the product-specific analysis. Retired mechanism, so purged.
DELETE FROM public.ai_summaries WHERE kind LIKE 'ingredient_fit:%';

-- 3. INGREDIENT LIST PROVENANCE ---------------------------------------------
ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS ingredients_provenance text,
  ADD COLUMN IF NOT EXISTS ingredients_captured_at timestamptz;

COMMENT ON COLUMN public.user_products.ingredients_provenance IS
  'Which text was authoritative for the stored ingredients array: label_photo | brand_site | brand_catalogue | manual | homemade. label_photo always wins over brand_site.';

UPDATE public.user_products
SET ingredients_provenance = CASE
      WHEN ingredients_source = 'scan' THEN 'label_photo'
      WHEN ingredients_source = 'link' THEN 'brand_site'
      WHEN ingredients_source = 'brand' THEN 'brand_catalogue'
      WHEN ingredients_source LIKE 'homemade%' THEN 'homemade'
      ELSE 'manual'
    END,
    ingredients_captured_at = COALESCE(ingredients_captured_at, updated_at)
WHERE ingredients_provenance IS NULL;

-- 4. BACKFILL QUEUE ---------------------------------------------------------
CREATE TABLE public.product_analysis_backfill (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  user_product_id uuid NOT NULL REFERENCES public.user_products(id) ON DELETE CASCADE,
  product_key text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_product_id)
);

GRANT SELECT ON public.product_analysis_backfill TO authenticated;
GRANT ALL ON public.product_analysis_backfill TO service_role;
ALTER TABLE public.product_analysis_backfill ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read backfill progress"
ON public.product_analysis_backfill
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_pab_status ON public.product_analysis_backfill (status, created_at);
CREATE INDEX idx_pab_user ON public.product_analysis_backfill (user_id);

CREATE TRIGGER update_product_analysis_backfill_updated_at
BEFORE UPDATE ON public.product_analysis_backfill
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: every saved product that has a real ingredient list.
INSERT INTO public.product_analysis_backfill (user_id, user_product_id, product_key)
SELECT up.user_id, up.id, up.product_key
FROM public.user_products up
WHERE up.ingredients IS NOT NULL
  AND array_length(up.ingredients, 1) >= 2
ON CONFLICT (user_product_id) DO NOTHING;

-- 5. JOB STATE — single-flight lease + circuit breaker ----------------------
CREATE TABLE public.ai_backfill_state (
  job text NOT NULL PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  lease_until timestamptz,
  last_run_at timestamptz,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_backfill_state TO authenticated;
GRANT ALL ON public.ai_backfill_state TO service_role;
ALTER TABLE public.ai_backfill_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read backfill state"
ON public.ai_backfill_state
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ai_backfill_state_updated_at
BEFORE UPDATE ON public.ai_backfill_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_backfill_state (job) VALUES ('product_analysis_backfill')
ON CONFLICT (job) DO NOTHING;

-- Progress readout for the admin panel.
CREATE OR REPLACE FUNCTION public.product_analysis_backfill_progress()
RETURNS TABLE (status text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.status, count(*)::bigint
  FROM public.product_analysis_backfill b
  WHERE public.has_role(auth.uid(), 'admin')
  GROUP BY b.status
$$;