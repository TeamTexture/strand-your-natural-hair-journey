-- 1. Remove the launch floor from the targeting guard; keep audience resolution.
CREATE OR REPLACE FUNCTION public.brand_offer_targeting_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
BEGIN
  v_rules := public.ad_offer_rules(NEW.id);
  IF v_rules = '{}'::jsonb THEN RETURN NEW; END IF;  -- broad placement

  -- Delivery is unrestricted at any audience size (including zero). The
  -- 50-member floor governs REPORTING only (ad_estimate_reach, ad_offer_reach,
  -- brand_offer_stats), never whether a campaign may run.
  IF NEW.status IN ('approved_unpaid','paid_scheduled','live')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.resolve_ad_offer_audience(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Reporting gate: may this offer's numbers be shown to its brand?
--    Broad campaigns: always. Targeted: only at/above the audience floor.
CREATE OR REPLACE FUNCTION public.ad_offer_reportable(_offer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
  v_n integer;
BEGIN
  v_rules := public.ad_offer_rules(_offer_id);
  IF v_rules = '{}'::jsonb THEN RETURN true; END IF;
  SELECT count(*)::int INTO v_n FROM public.ad_offer_audience WHERE offer_id = _offer_id;
  IF v_n = 0 THEN
    SELECT count(*)::int INTO v_n FROM public.ad_match_users(v_rules);
  END IF;
  RETURN v_n >= public.ad_audience_floor();
END;
$$;

REVOKE ALL ON FUNCTION public.ad_offer_reportable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_offer_reportable(uuid) TO authenticated, service_role;

-- 3. Suppress performance numbers for a brand's own small-audience targeted
--    campaigns. Admins keep exact figures.
CREATE OR REPLACE VIEW public.brand_offer_stats
WITH (security_invoker = true)
AS
SELECT
  s.offer_id,
  s.slot,
  s.stat_date,
  CASE WHEN v.show THEN s.impressions END           AS impressions,
  CASE WHEN v.show THEN s.raw_views END             AS raw_views,
  CASE WHEN v.show THEN s.expands END               AS expands,
  CASE WHEN v.show THEN s.link_clicks END           AS link_clicks,
  CASE WHEN v.show THEN s.code_copies END           AS code_copies,
  CASE WHEN v.show THEN s.wishlist_adds END         AS wishlist_adds,
  CASE WHEN v.show THEN s.matched_impressions END   AS matched_impressions,
  CASE WHEN v.show THEN s.matched_link_clicks END   AS matched_link_clicks
FROM public.ad_stats_unified s
JOIN public.brand_offers o ON o.id = s.offer_id
CROSS JOIN LATERAL (
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.ad_offer_reportable(s.offer_id) AS show
) v
WHERE o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role);

GRANT SELECT ON public.brand_offer_stats TO authenticated;
GRANT ALL ON public.brand_offer_stats TO service_role;

-- 4. Reach reporting: unchanged floor for brands, exact counts for admins.
CREATE OR REPLACE FUNCTION public.ad_estimate_reach(_rules jsonb)
RETURNS TABLE(reach integer, meets_floor boolean, audience_floor integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.ad_audience_floor();
  v_n integer;
  v_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  SELECT count(*)::int INTO v_n FROM public.ad_match_users(_rules);
  RETURN QUERY SELECT
    CASE WHEN v_n >= v_min OR v_admin THEN v_n ELSE NULL END,
    v_n >= v_min,
    v_min;
END;
$$;

CREATE OR REPLACE FUNCTION public.ad_offer_reach(_offer_id uuid)
RETURNS TABLE(reach integer, meets_floor boolean, audience_floor integer, is_targeted boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.ad_audience_floor();
  v_rules jsonb;
  v_n integer;
  v_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF NOT EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = _offer_id AND (o.brand_user_id = auth.uid() OR v_admin)
  ) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  v_rules := public.ad_offer_rules(_offer_id);
  IF v_rules = '{}'::jsonb THEN
    RETURN QUERY SELECT NULL::integer, true, v_min, false;
    RETURN;
  END IF;
  SELECT count(*)::int INTO v_n FROM public.ad_match_users(v_rules);
  RETURN QUERY SELECT
    CASE WHEN v_n >= v_min OR v_admin THEN v_n ELSE NULL END,
    v_n >= v_min,
    v_min,
    true;
END;
$$;

REVOKE ALL ON FUNCTION public.ad_estimate_reach(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ad_offer_reach(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_estimate_reach(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ad_offer_reach(uuid) TO authenticated, service_role;