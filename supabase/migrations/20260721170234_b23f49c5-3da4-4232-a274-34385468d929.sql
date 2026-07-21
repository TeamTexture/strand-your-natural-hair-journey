
-- Helper: today in Europe/London
CREATE OR REPLACE FUNCTION public.strand_today_london()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ((now() AT TIME ZONE 'Europe/London'))::date
$$;

-- brand_offers: replace narrow "live only" public read with paid-or-live within window
DROP POLICY IF EXISTS "Live offers publicly readable" ON public.brand_offers;
CREATE POLICY "Paid or live offers readable in window"
  ON public.brand_offers
  FOR SELECT
  USING (
    status IN ('paid_scheduled','live')
    AND starts_on IS NOT NULL AND ends_on IS NOT NULL
    AND starts_on <= public.strand_today_london()
    AND ends_on   >= public.strand_today_london()
  );

-- brand_offer_placements: broaden the public/live read to paid-or-live within window
DROP POLICY IF EXISTS "Placements of live offers readable" ON public.brand_offer_placements;
CREATE POLICY "Placements of paid or live offers readable in window"
  ON public.brand_offer_placements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = brand_offer_placements.offer_id
        AND o.status IN ('paid_scheduled','live')
        AND o.starts_on IS NOT NULL AND o.ends_on IS NOT NULL
        AND o.starts_on <= public.strand_today_london()
        AND o.ends_on   >= public.strand_today_london()
    )
  );

-- brand_products: same treatment so the attached product tile renders
DROP POLICY IF EXISTS "Live offer products readable" ON public.brand_products;
CREATE POLICY "Products of paid or live offers readable in window"
  ON public.brand_products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = brand_products.offer_id
        AND o.status IN ('paid_scheduled','live')
        AND o.starts_on IS NOT NULL AND o.ends_on IS NOT NULL
        AND o.starts_on <= public.strand_today_london()
        AND o.ends_on   >= public.strand_today_london()
    )
  );
