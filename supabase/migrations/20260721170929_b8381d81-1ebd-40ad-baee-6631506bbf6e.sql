
-- Root cause of banners not showing: RLS policies permitted signed-in reads
-- of paid/live offers, but the tables had ZERO Data-API GRANTs to
-- `authenticated`, so PostgREST returned permission-denied before RLS was
-- even evaluated. Grant the base privileges — the existing policies already
-- restrict what non-owners can actually read (paid + in-window only).

GRANT SELECT ON public.brand_offers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brand_offers TO authenticated;
GRANT ALL ON public.brand_offers TO service_role;

GRANT SELECT ON public.brand_offer_placements TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brand_offer_placements TO authenticated;
GRANT ALL ON public.brand_offer_placements TO service_role;

GRANT SELECT ON public.brand_products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brand_products TO authenticated;
GRANT ALL ON public.brand_products TO service_role;

GRANT SELECT ON public.brand_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brand_profiles TO authenticated;
GRANT ALL ON public.brand_profiles TO service_role;

-- (brand_offer_stats grants already added in previous migration.)

-- Brand profile visibility: OfferPage joins brand_profiles!inner to display
-- the brand name. Consumers need read access to the profile of any brand
-- that currently has a paid/in-window offer. Owners/admins keep full access
-- via existing policies; this is strictly additive.
DROP POLICY IF EXISTS "Brand profile of active offer readable" ON public.brand_profiles;
CREATE POLICY "Brand profile of active offer readable"
  ON public.brand_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.brand_user_id = brand_profiles.user_id
        AND o.status IN ('paid_scheduled','live')
        AND o.starts_on IS NOT NULL AND o.ends_on IS NOT NULL
        AND o.starts_on <= public.strand_today_london()
        AND o.ends_on   >= public.strand_today_london()
    )
  );
