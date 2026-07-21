
ALTER TABLE public.brand_offer_stats
  ADD COLUMN IF NOT EXISTS code_copies integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_brand_offer_stat(_offer_id uuid, _slot brand_placement_slot, _kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _kind NOT IN ('impressions','taps','wishlist_adds','code_copies','link_clicks') THEN
    RAISE EXCEPTION 'Invalid stat kind: %', _kind;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.brand_offers
    WHERE id = _offer_id
      AND status IN ('paid_scheduled','live','ended')
  ) INTO v_ok;
  IF NOT v_ok THEN
    RETURN;
  END IF;

  INSERT INTO public.brand_offer_stats (offer_id, slot, stat_date, impressions, taps, wishlist_adds, code_copies, link_clicks)
  VALUES (
    _offer_id, _slot, v_today,
    CASE WHEN _kind = 'impressions'   THEN 1 ELSE 0 END,
    CASE WHEN _kind = 'taps'          THEN 1 ELSE 0 END,
    CASE WHEN _kind = 'wishlist_adds' THEN 1 ELSE 0 END,
    CASE WHEN _kind = 'code_copies'   THEN 1 ELSE 0 END,
    CASE WHEN _kind = 'link_clicks'   THEN 1 ELSE 0 END
  )
  ON CONFLICT (offer_id, slot, stat_date) DO UPDATE
    SET impressions   = public.brand_offer_stats.impressions   + CASE WHEN _kind = 'impressions'   THEN 1 ELSE 0 END,
        taps          = public.brand_offer_stats.taps          + CASE WHEN _kind = 'taps'          THEN 1 ELSE 0 END,
        wishlist_adds = public.brand_offer_stats.wishlist_adds + CASE WHEN _kind = 'wishlist_adds' THEN 1 ELSE 0 END,
        code_copies   = public.brand_offer_stats.code_copies   + CASE WHEN _kind = 'code_copies'   THEN 1 ELSE 0 END,
        link_clicks   = public.brand_offer_stats.link_clicks   + CASE WHEN _kind = 'link_clicks'   THEN 1 ELSE 0 END,
        updated_at    = now();
END;
$function$;

DROP FUNCTION IF EXISTS public.brand_offer_totals(uuid[]);
CREATE OR REPLACE FUNCTION public.brand_offer_totals(_offer_ids uuid[])
 RETURNS TABLE(offer_id uuid, impressions bigint, taps bigint, wishlist_adds bigint, code_copies bigint, link_clicks bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN QUERY
  SELECT s.offer_id,
         COALESCE(SUM(s.impressions), 0)::bigint,
         COALESCE(SUM(s.taps), 0)::bigint,
         COALESCE(SUM(s.wishlist_adds), 0)::bigint,
         COALESCE(SUM(s.code_copies), 0)::bigint,
         COALESCE(SUM(s.link_clicks), 0)::bigint
  FROM public.brand_offer_stats s
  JOIN public.brand_offers o ON o.id = s.offer_id
  WHERE s.offer_id = ANY(_offer_ids)
    AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  GROUP BY s.offer_id;
END;
$function$;
