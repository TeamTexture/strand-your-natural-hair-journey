-- One canonical campaign metrics function.
--
-- Everything a brand sees about a campaign comes from here: the dashboard card,
-- the detail page's Performance block, and the before/after audience split.
-- They previously used three different sources (brand_offer_totals over the
-- daily rollup view, the brand_offer_stats view, and brand_offer_split_totals
-- over ad_events) which produced three different impression figures for the
-- same campaign.
--
-- Definitions, fixed here so no caller can re-derive them differently:
--   reach       = distinct members with ANY event on the advert. An interaction
--                 cannot happen without exposure, so reach >= interactors by
--                 construction, which bounds the engagement rate at 100%.
--   interactors = distinct members who expanded, copied the code, clicked the
--                 link, or saved it to a wishlist.
--   the rest    = raw event totals (a member may contribute many).
-- Archived days (ad_events pruned into ad_stats_daily) are added to the totals;
-- their per-day distinct impressions are added to reach, which can only grow
-- reach, so the invariant holds.
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
    -- before/after only exist once the audience has actually changed
    WHERE ph.phase = 'all' OR p.targeting_changed_at IS NOT NULL
  ),
  ev AS (
    SELECT s.id, s.phase, s.targeting_changed_at,
           coalesce(e.user_id::text, e.session_id) AS member_key,
           e.event_type,
           e.slot,
           e.occurred_at::date AS stat_date
    FROM scope s
    JOIN public.ad_events e ON e.offer_id = s.id
    WHERE s.phase = 'all'
       OR (s.phase = 'before' AND e.occurred_at < s.targeting_changed_at)
       OR (s.phase = 'after' AND e.occurred_at >= s.targeting_changed_at)
  ),
  live AS (
    SELECT ev.id, ev.phase, ev.targeting_changed_at,
           count(DISTINCT ev.member_key) AS reach,
           count(DISTINCT CASE
             WHEN ev.event_type IN ('expand', 'code_copy', 'link_click', 'wishlist')
             THEN ev.member_key END) AS interactors,
           count(*) FILTER (WHERE ev.event_type = 'code_copy') AS code_copies,
           count(*) FILTER (WHERE ev.event_type = 'link_click') AS link_clicks,
           count(*) FILTER (WHERE ev.event_type = 'expand') AS expands,
           count(*) FILTER (WHERE ev.event_type = 'wishlist') AS wishlist_adds,
           count(*) FILTER (WHERE ev.event_type = 'view') AS raw_views
    FROM ev
    GROUP BY ev.id, ev.phase, ev.targeting_changed_at
  ),
  -- Days whose raw events have been pruned into the permanent rollup.
  archived AS (
    SELECT p.id,
           coalesce(sum(d.impressions), 0) AS reach,
           coalesce(sum(d.code_copies), 0) AS code_copies,
           coalesce(sum(d.link_clicks), 0) AS link_clicks,
           coalesce(sum(d.expands), 0) AS expands,
           coalesce(sum(d.wishlist_adds), 0) AS wishlist_adds,
           coalesce(sum(d.raw_views), 0) AS raw_views
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
         coalesce(l.reach, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.reach, 0) ELSE 0 END,
         coalesce(l.interactors, 0),
         coalesce(l.code_copies, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.code_copies, 0) ELSE 0 END,
         coalesce(l.link_clicks, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.link_clicks, 0) ELSE 0 END,
         coalesce(l.expands, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.expands, 0) ELSE 0 END,
         coalesce(l.wishlist_adds, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.wishlist_adds, 0) ELSE 0 END,
         coalesce(l.raw_views, 0) + CASE WHEN s.phase = 'all' THEN coalesce(a.raw_views, 0) ELSE 0 END
  FROM scope s
  LEFT JOIN live l ON l.id = s.id AND l.phase = s.phase
  LEFT JOIN archived a ON a.id = s.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.brand_offer_metrics(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_offer_metrics(uuid[]) TO service_role;

-- The brand_offer_stats view calls ad_offer_reportable in a lateral join, but
-- EXECUTE on that function was never granted to authenticated — so every brand
-- read of the view failed with a permission error, which the client swallowed
-- and rendered as zeros.
GRANT EXECUTE ON FUNCTION public.ad_offer_reportable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ad_offer_reportable(uuid) TO service_role;