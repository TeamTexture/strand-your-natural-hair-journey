-- 1. Metrics function returned numeric where bigint was declared (sum() over the
-- archived rollup), so EVERY call failed with 42804 and all brand/pro/admin
-- engagement figures rendered as dashes. Cast the sums back to bigint.
CREATE OR REPLACE FUNCTION public.brand_offer_metrics(_offer_ids uuid[])
RETURNS TABLE(
  offer_id uuid,
  phase text,
  changed_at timestamptz,
  reach bigint,
  interactors bigint,
  code_copies bigint,
  link_clicks bigint,
  expands bigint,
  wishlist_adds bigint,
  raw_views bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  WITH perm AS (
    SELECT o.id, o.targeting_changed_at
    FROM public.brand_offers o
    WHERE o.id = ANY(_offer_ids)
      AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ),
  phases(phase) AS (VALUES ('all'), ('before'), ('after')),
  scope AS (
    SELECT p.id, p.targeting_changed_at, ph.phase
    FROM perm p
    CROSS JOIN phases ph
    WHERE ph.phase = 'all' OR p.targeting_changed_at IS NOT NULL
  ),
  ev AS (
    SELECT s.id, s.phase, s.targeting_changed_at,
           coalesce(e.user_id::text, e.session_id) AS member_key,
           e.event_type
    FROM scope s
    JOIN public.ad_events e ON e.offer_id = s.id
    WHERE s.phase = 'all'
       OR (s.phase = 'before' AND e.occurred_at < s.targeting_changed_at)
       OR (s.phase = 'after' AND e.occurred_at >= s.targeting_changed_at)
  ),
  live AS (
    SELECT ev.id, ev.phase,
           count(DISTINCT ev.member_key)::bigint AS reach,
           count(DISTINCT CASE
             WHEN ev.event_type IN ('expand', 'code_copy', 'link_click', 'wishlist')
             THEN ev.member_key END)::bigint AS interactors,
           (count(*) FILTER (WHERE ev.event_type = 'code_copy'))::bigint AS code_copies,
           (count(*) FILTER (WHERE ev.event_type = 'link_click'))::bigint AS link_clicks,
           (count(*) FILTER (WHERE ev.event_type = 'expand'))::bigint AS expands,
           (count(*) FILTER (WHERE ev.event_type = 'wishlist'))::bigint AS wishlist_adds,
           (count(*) FILTER (WHERE ev.event_type = 'view'))::bigint AS raw_views
    FROM ev
    GROUP BY ev.id, ev.phase
  ),
  archived AS (
    SELECT p.id,
           coalesce(sum(d.impressions), 0)::bigint AS reach,
           coalesce(sum(d.code_copies), 0)::bigint AS code_copies,
           coalesce(sum(d.link_clicks), 0)::bigint AS link_clicks,
           coalesce(sum(d.expands), 0)::bigint AS expands,
           coalesce(sum(d.wishlist_adds), 0)::bigint AS wishlist_adds,
           coalesce(sum(d.raw_views), 0)::bigint AS raw_views
    FROM perm p
    JOIN public.ad_stats_daily d ON d.offer_id = p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ad_events e
      WHERE e.offer_id = p.id AND e.slot = d.slot AND e.occurred_at::date = d.stat_date
    )
    GROUP BY p.id
  )
  SELECT s.id,
         s.phase,
         s.targeting_changed_at,
         (coalesce(l.reach, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.reach, 0) ELSE 0 END)::bigint,
         coalesce(l.interactors, 0)::bigint,
         (coalesce(l.code_copies, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.code_copies, 0) ELSE 0 END)::bigint,
         (coalesce(l.link_clicks, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.link_clicks, 0) ELSE 0 END)::bigint,
         (coalesce(l.expands, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.expands, 0) ELSE 0 END)::bigint,
         (coalesce(l.wishlist_adds, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.wishlist_adds, 0) ELSE 0 END)::bigint,
         (coalesce(l.raw_views, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.raw_views, 0) ELSE 0 END)::bigint
  FROM scope s
  LEFT JOIN live l ON l.id = s.id AND l.phase = s.phase
  LEFT JOIN archived a ON a.id = s.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.brand_offer_metrics(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_offer_metrics(uuid[]) TO service_role;

-- 2. Campaign owner access: brand-owned campaigns keep the strict brand paywall,
-- pro-owned campaigns are gated on an active professional subscription instead.
CREATE OR REPLACE FUNCTION public.campaign_owner_access(_user uuid, _owner_type text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user IS NOT NULL
    AND NOT public.is_access_restricted(_user)
    AND (
      public.has_role(_user, 'admin')
      OR CASE
           WHEN _owner_type = 'pro' THEN public.has_active_pro_subscription(_user)
           ELSE public.brand_paid_access(_user)
         END
    )
$function$;

GRANT EXECUTE ON FUNCTION public.campaign_owner_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_owner_access(uuid, text) TO service_role;

DROP POLICY IF EXISTS "Brand owns offers" ON public.brand_offers;
CREATE POLICY "Brand owns offers" ON public.brand_offers
FOR ALL TO authenticated
USING (((brand_user_id = auth.uid()) AND public.campaign_owner_access(auth.uid(), coalesce(owner_type, 'brand'))) OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (((brand_user_id = auth.uid()) AND public.campaign_owner_access(auth.uid(), coalesce(owner_type, 'brand'))) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Brand manages own placements" ON public.brand_offer_placements;
CREATE POLICY "Brand manages own placements" ON public.brand_offer_placements
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_placements.offer_id
  AND (((o.brand_user_id = auth.uid()) AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))) OR public.has_role(auth.uid(), 'admin'::public.app_role))))
WITH CHECK (EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_placements.offer_id
  AND (((o.brand_user_id = auth.uid()) AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))) OR public.has_role(auth.uid(), 'admin'::public.app_role))));

DROP POLICY IF EXISTS "Brand manages own offer product links" ON public.brand_offer_products;
CREATE POLICY "Brand manages own offer product links" ON public.brand_offer_products
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_products.offer_id
  AND (((o.brand_user_id = auth.uid()) AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))) OR public.has_role(auth.uid(), 'admin'::public.app_role))))
WITH CHECK (EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_products.offer_id
  AND (((o.brand_user_id = auth.uid()) AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))) OR public.has_role(auth.uid(), 'admin'::public.app_role))));

DROP POLICY IF EXISTS "Owners read own targeting" ON public.brand_offer_targeting;
CREATE POLICY "Owners read own targeting" ON public.brand_offer_targeting
FOR SELECT TO authenticated
USING ((EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_targeting.offer_id
  AND o.brand_user_id = auth.uid() AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))))
  OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Owners add targeting before launch" ON public.brand_offer_targeting;
CREATE POLICY "Owners add targeting before launch" ON public.brand_offer_targeting
FOR INSERT TO authenticated
WITH CHECK ((EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_targeting.offer_id
  AND o.brand_user_id = auth.uid() AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))
  AND o.status = ANY (ARRAY['draft'::public.brand_offer_status, 'under_review'::public.brand_offer_status])))
  OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Owners remove targeting before launch" ON public.brand_offer_targeting;
CREATE POLICY "Owners remove targeting before launch" ON public.brand_offer_targeting
FOR DELETE TO authenticated
USING ((EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_targeting.offer_id
  AND o.brand_user_id = auth.uid() AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))
  AND o.status = ANY (ARRAY['draft'::public.brand_offer_status, 'under_review'::public.brand_offer_status])))
  OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Brands manage own revisions, admins manage all" ON public.brand_offer_revisions;
CREATE POLICY "Brands manage own revisions, admins manage all" ON public.brand_offer_revisions
FOR ALL TO authenticated
USING (((brand_user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_revisions.offer_id
    AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))))
  OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (((brand_user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_revisions.offer_id
    AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))))
  OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Brands read own revisions, admins read all" ON public.brand_offer_revisions;
CREATE POLICY "Brands read own revisions, admins read all" ON public.brand_offer_revisions
FOR SELECT TO authenticated
USING (((brand_user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_revisions.offer_id
    AND public.campaign_owner_access(auth.uid(), coalesce(o.owner_type, 'brand'))))
  OR public.has_role(auth.uid(), 'admin'::public.app_role));