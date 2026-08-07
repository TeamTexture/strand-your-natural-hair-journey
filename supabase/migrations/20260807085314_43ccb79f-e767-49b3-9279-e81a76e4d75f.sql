-- The legacy stats table feeds ad_stats_unified and was directly readable by a
-- brand, bypassing the reporting floor applied in brand_offer_stats.
DROP POLICY IF EXISTS "Brand reads own stats" ON public.brand_offer_stats_legacy;

CREATE POLICY "Brand reads own stats above reporting floor"
ON public.brand_offer_stats_legacy
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = brand_offer_stats_legacy.offer_id
        AND o.brand_user_id = auth.uid()
    )
    AND public.ad_offer_reportable(brand_offer_stats_legacy.offer_id)
  )
);