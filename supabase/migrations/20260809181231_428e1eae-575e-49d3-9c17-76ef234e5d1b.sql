CREATE OR REPLACE FUNCTION public.brand_paid_access(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user IS NOT NULL
    AND NOT public.is_access_restricted(_user)
    AND (
      public.has_role(_user, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = _user AND p.complimentary_access
      )
      OR EXISTS (
        SELECT 1 FROM public.brand_subscriptions
        WHERE brand_user_id = _user
          AND status IN ('active', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
      )
    )
$$;

REVOKE ALL ON FUNCTION public.brand_paid_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_paid_access(uuid) TO authenticated, service_role;

-- brand_products
DROP POLICY IF EXISTS "Brand manages own products" ON public.brand_products;
CREATE POLICY "Brand manages own products"
ON public.brand_products FOR ALL TO authenticated
USING (
  (brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
);

-- brand_offers
DROP POLICY IF EXISTS "Brand owns offers" ON public.brand_offers;
CREATE POLICY "Brand owns offers"
ON public.brand_offers FOR ALL TO authenticated
USING (
  (brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
);

-- brand_offer_products
DROP POLICY IF EXISTS "Brand manages own offer product links" ON public.brand_offer_products;
CREATE POLICY "Brand manages own offer product links"
ON public.brand_offer_products FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = brand_offer_products.offer_id
      AND ((o.brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
           OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = brand_offer_products.offer_id
      AND ((o.brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
           OR public.has_role(auth.uid(), 'admin'))
  )
);

-- brand_offer_placements
DROP POLICY IF EXISTS "Brand manages own placements" ON public.brand_offer_placements;
CREATE POLICY "Brand manages own placements"
ON public.brand_offer_placements FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = brand_offer_placements.offer_id
      AND ((o.brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
           OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = brand_offer_placements.offer_id
      AND ((o.brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
           OR public.has_role(auth.uid(), 'admin'))
  )
);

-- brand_offer_targeting
DROP POLICY IF EXISTS "Owners read own targeting" ON public.brand_offer_targeting;
CREATE POLICY "Owners read own targeting"
ON public.brand_offer_targeting FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = brand_offer_targeting.offer_id
      AND o.brand_user_id = auth.uid()
      AND public.brand_paid_access(auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Owners add targeting before launch" ON public.brand_offer_targeting;
CREATE POLICY "Owners add targeting before launch"
ON public.brand_offer_targeting FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = brand_offer_targeting.offer_id
      AND o.brand_user_id = auth.uid()
      AND public.brand_paid_access(auth.uid())
      AND o.status IN ('draft','under_review')
  )
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Owners remove targeting before launch" ON public.brand_offer_targeting;
CREATE POLICY "Owners remove targeting before launch"
ON public.brand_offer_targeting FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = brand_offer_targeting.offer_id
      AND o.brand_user_id = auth.uid()
      AND public.brand_paid_access(auth.uid())
      AND o.status IN ('draft','under_review')
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- brand_offer_revisions (also tighten from PUBLIC to authenticated)
DROP POLICY IF EXISTS "Brands manage own revisions, admins manage all" ON public.brand_offer_revisions;
CREATE POLICY "Brands manage own revisions, admins manage all"
ON public.brand_offer_revisions FOR ALL TO authenticated
USING (
  (brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Brands read own revisions, admins read all" ON public.brand_offer_revisions;
CREATE POLICY "Brands read own revisions, admins read all"
ON public.brand_offer_revisions FOR SELECT TO authenticated
USING (
  (brand_user_id = auth.uid() AND public.brand_paid_access(auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
);

-- brand_offer_stats_legacy
DROP POLICY IF EXISTS "Brand reads own stats above reporting floor" ON public.brand_offer_stats_legacy;
CREATE POLICY "Brand reads own stats above reporting floor"
ON public.brand_offer_stats_legacy FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = brand_offer_stats_legacy.offer_id
        AND o.brand_user_id = auth.uid()
    )
    AND public.brand_paid_access(auth.uid())
    AND public.ad_offer_reportable(offer_id)
  )
);
