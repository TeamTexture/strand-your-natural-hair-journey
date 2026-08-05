-- 1. Restrict public/anon-readable commercial data to signed-in users only

DROP POLICY IF EXISTS "Placements of paid or live offers readable in window" ON public.brand_offer_placements;
CREATE POLICY "Placements of paid or live offers readable in window"
ON public.brand_offer_placements
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.brand_offers o
  WHERE o.id = brand_offer_placements.offer_id
    AND o.status = ANY (ARRAY['paid_scheduled'::brand_offer_status, 'live'::brand_offer_status])
    AND o.starts_on IS NOT NULL AND o.ends_on IS NOT NULL
    AND o.starts_on <= strand_today_london()
    AND o.ends_on >= strand_today_london()
));

DROP POLICY IF EXISTS "Paid or live offers readable in window" ON public.brand_offers;
CREATE POLICY "Paid or live offers readable in window"
ON public.brand_offers
FOR SELECT
TO authenticated
USING (
  status = ANY (ARRAY['paid_scheduled'::brand_offer_status, 'live'::brand_offer_status])
  AND starts_on IS NOT NULL AND ends_on IS NOT NULL
  AND starts_on <= strand_today_london()
  AND ends_on >= strand_today_london()
);

DROP POLICY IF EXISTS "Products of paid or live offers readable in window" ON public.brand_products;
CREATE POLICY "Products of paid or live offers readable in window"
ON public.brand_products
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.brand_offers o
  WHERE o.id = brand_products.offer_id
    AND o.status = ANY (ARRAY['paid_scheduled'::brand_offer_status, 'live'::brand_offer_status])
    AND o.starts_on IS NOT NULL AND o.ends_on IS NOT NULL
    AND o.starts_on <= strand_today_london()
    AND o.ends_on >= strand_today_london()
));

-- pro_offers: rebuild its public read policy as authenticated-only
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pro_offers' AND cmd = 'SELECT'
      AND 'public' = ANY (roles)
  LOOP
    EXECUTE format('DROP POLICY %I ON public.pro_offers', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Signed-in users read active offers of published pros"
ON public.pro_offers
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.pro_profiles p
    WHERE p.user_id = pro_offers.pro_user_id
      AND p.is_published = true
  )
);

REVOKE SELECT ON public.brand_offers FROM anon;
REVOKE SELECT ON public.brand_products FROM anon;
REVOKE SELECT ON public.brand_offer_placements FROM anon;
REVOKE SELECT ON public.pro_offers FROM anon;

GRANT SELECT ON public.brand_offers TO authenticated;
GRANT SELECT ON public.brand_products TO authenticated;
GRANT SELECT ON public.brand_offer_placements TO authenticated;
GRANT SELECT ON public.pro_offers TO authenticated;

-- 2. Anonymous callers must not be able to execute SECURITY DEFINER routines
REVOKE EXECUTE ON FUNCTION public.appointments_lock_client_columns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pro_enquiries_lock_columns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_booking_click_prompted(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_booking_click(uuid, text, uuid) FROM anon;