-- ============================================================
-- BRAND SHELF PART 1 — brand-owned product catalogue
-- ============================================================

ALTER TABLE public.brand_products
  ADD COLUMN IF NOT EXISTS brand_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS ingredients_source text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

ALTER TABLE public.brand_products ALTER COLUMN offer_id DROP NOT NULL;

-- Backfill brand ownership from the owning campaign.
UPDATE public.brand_products p
SET brand_user_id = o.brand_user_id
FROM public.brand_offers o
WHERE p.offer_id = o.id AND p.brand_user_id IS NULL;

-- Campaign products already reviewed by admins as part of the offer are
-- treated as approved so nothing that is live today disappears.
UPDATE public.brand_products p
SET approval_status = 'approved', is_published = true
FROM public.brand_offers o
WHERE p.offer_id = o.id
  AND o.status IN ('approved_unpaid','paid_scheduled','live','ended')
  AND p.approval_status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_products_owner_present') THEN
    ALTER TABLE public.brand_products
      ADD CONSTRAINT brand_products_owner_present
      CHECK (brand_user_id IS NOT NULL OR offer_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_products_approval_status_check') THEN
    ALTER TABLE public.brand_products
      ADD CONSTRAINT brand_products_approval_status_check
      CHECK (approval_status IN ('pending','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_products_ingredients_source_check') THEN
    ALTER TABLE public.brand_products
      ADD CONSTRAINT brand_products_ingredients_source_check
      CHECK (ingredients_source IS NULL OR ingredients_source IN ('brand','scan','link'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS brand_products_brand_user_idx
  ON public.brand_products (brand_user_id) WHERE brand_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS brand_products_shelf_idx
  ON public.brand_products (brand_user_id, position)
  WHERE approval_status = 'approved' AND is_published;
CREATE INDEX IF NOT EXISTS brand_products_name_lower_idx
  ON public.brand_products (lower(name));

-- ------------------------------------------------------------
-- Offers REFERENCE products (many-to-many) instead of owning them
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brand_offer_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  brand_product_id uuid NOT NULL REFERENCES public.brand_products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, brand_product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_offer_products TO authenticated;
GRANT ALL ON public.brand_offer_products TO service_role;

ALTER TABLE public.brand_offer_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand manages own offer product links"
  ON public.brand_offer_products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brand_offers o
                 WHERE o.id = brand_offer_products.offer_id
                   AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brand_offers o
                 WHERE o.id = brand_offer_products.offer_id
                   AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "Offer product links readable with the offer"
  ON public.brand_offer_products FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brand_offers o
                 WHERE o.id = brand_offer_products.offer_id
                   AND o.status IN ('paid_scheduled','live','ended')));

-- Seed the join table from the existing ownership rows so history is intact.
INSERT INTO public.brand_offer_products (offer_id, brand_product_id, position)
SELECT p.offer_id, p.id, p.position
FROM public.brand_products p
WHERE p.offer_id IS NOT NULL
ON CONFLICT (offer_id, brand_product_id) DO NOTHING;

-- ------------------------------------------------------------
-- Admin-only approval transitions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brand_products_guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean := public.has_role(auth.uid(), 'admin');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin THEN
      NEW.approval_status := 'pending';
      NEW.rejection_reason := NULL;
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT is_admin THEN
    -- A brand may never move its own product through review.
    NEW.approval_status := OLD.approval_status;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;

    -- Editing the substance of an approved product sends it back to review.
    IF OLD.approval_status = 'approved' AND (
         NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.ingredients IS DISTINCT FROM OLD.ingredients
      OR NEW.key_features IS DISTINCT FROM OLD.key_features
      OR NEW.materials IS DISTINCT FROM OLD.materials
      OR NEW.image_urls IS DISTINCT FROM OLD.image_urls
      OR NEW.external_url IS DISTINCT FROM OLD.external_url
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.tool_kind IS DISTINCT FROM OLD.tool_kind
      OR NEW.ingredients_source IS DISTINCT FROM OLD.ingredients_source
    ) THEN
      NEW.approval_status := 'pending';
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
      NEW.is_published := false;
    END IF;
  ELSE
    IF NEW.approval_status = 'approved' AND OLD.approval_status <> 'approved' THEN
      NEW.approved_at := now();
      NEW.approved_by := auth.uid();
      NEW.rejection_reason := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brand_products_guard_approval_trg ON public.brand_products;
CREATE TRIGGER brand_products_guard_approval_trg
  BEFORE INSERT OR UPDATE ON public.brand_products
  FOR EACH ROW EXECUTE FUNCTION public.brand_products_guard_approval();

-- ------------------------------------------------------------
-- RLS — brand ownership by brand_user_id, consumer read when approved+published
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Brand manages own products" ON public.brand_products;
CREATE POLICY "Brand manages own products"
  ON public.brand_products FOR ALL TO authenticated
  USING (
    brand_user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.brand_offers o
               WHERE o.id = brand_products.offer_id AND o.brand_user_id = auth.uid())
  )
  WITH CHECK (
    brand_user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.brand_offers o
               WHERE o.id = brand_products.offer_id AND o.brand_user_id = auth.uid())
  );

CREATE POLICY "Approved published brand products readable"
  ON public.brand_products FOR SELECT TO authenticated
  USING (approval_status = 'approved' AND is_published AND brand_user_id IS NOT NULL);

-- ------------------------------------------------------------
-- Aggregate-only member counts for brands. Threshold is a named constant.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brand_count_min_threshold()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 50 $$;

REVOKE ALL ON FUNCTION public.brand_count_min_threshold() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_count_min_threshold() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.brand_product_member_counts(_brand_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  brand_product_id uuid,
  name text,
  shelf_count integer,
  wishlist_count integer,
  favourite_count integer,
  suppressed boolean,
  min_threshold integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid := COALESCE(_brand_user_id, auth.uid());
  v_min integer := public.brand_count_min_threshold();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  -- A brand may only ever ask about its own products.
  IF v_brand <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  RETURN QUERY
  WITH prods AS (
    SELECT p.id, p.name FROM public.brand_products p WHERE p.brand_user_id = v_brand
  ),
  raw AS (
    SELECT
      pr.id,
      pr.name,
      (SELECT count(*) FROM public.user_products up
        WHERE up.linked_brand_product_id = pr.id AND up.on_shelf)::int AS shelf_raw,
      (SELECT count(*) FROM public.user_products up
        WHERE up.linked_brand_product_id = pr.id AND up.on_wishlist)::int AS wish_raw,
      (SELECT count(*) FROM public.user_products up
        WHERE up.linked_brand_product_id = pr.id AND up.on_favourite)::int AS fav_raw
    FROM prods pr
  )
  SELECT
    r.id,
    r.name,
    -- Suppression happens HERE, at the data layer: sub-threshold figures are
    -- never returned to the caller at all.
    CASE WHEN r.shelf_raw >= v_min THEN r.shelf_raw ELSE NULL END,
    CASE WHEN r.wish_raw  >= v_min THEN r.wish_raw  ELSE NULL END,
    CASE WHEN r.fav_raw   >= v_min THEN r.fav_raw   ELSE NULL END,
    (r.shelf_raw < v_min AND r.wish_raw < v_min AND r.fav_raw < v_min),
    v_min
  FROM raw r
  ORDER BY r.name;
END;
$$;

REVOKE ALL ON FUNCTION public.brand_product_member_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_product_member_counts(uuid) TO authenticated, service_role;

-- Brand shelf for the public brand listing: approved + published only.
CREATE OR REPLACE FUNCTION public.brand_shelf_products(_brand_user_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  kind text,
  tool_kind text,
  image_urls text[],
  ingredients text[],
  ingredients_source text,
  key_features text[],
  materials text[],
  external_url text,
  sort_position integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.description, p.kind, p.tool_kind, p.image_urls,
         p.ingredients, p.ingredients_source, p.key_features, p.materials,
         p.external_url, p.position AS sort_position
  FROM public.brand_products p
  WHERE p.brand_user_id = _brand_user_id
    AND p.approval_status = 'approved'
    AND p.is_published
    AND auth.uid() IS NOT NULL
  ORDER BY p.position ASC, p.name ASC
$$;

REVOKE ALL ON FUNCTION public.brand_shelf_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_shelf_products(uuid) TO authenticated, service_role;