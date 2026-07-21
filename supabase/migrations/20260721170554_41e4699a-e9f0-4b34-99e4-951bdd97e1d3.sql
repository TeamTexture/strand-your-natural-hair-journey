
-- Fix brand offer stats tracking: grant privileges + widen RLS to paid_scheduled + add atomic RPC + aggregate reader.

GRANT SELECT, INSERT, UPDATE ON public.brand_offer_stats TO authenticated;
GRANT ALL ON public.brand_offer_stats TO service_role;

-- Widen INSERT/UPDATE policies to include paid_scheduled (banners are date-driven live).
DROP POLICY IF EXISTS "Anyone signed in can increment stats" ON public.brand_offer_stats;
DROP POLICY IF EXISTS "Anyone signed in can update stats" ON public.brand_offer_stats;

CREATE POLICY "Consumers can insert stats for active offers"
  ON public.brand_offer_stats FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = brand_offer_stats.offer_id
        AND o.status IN ('paid_scheduled','live','ended')
    )
  );

CREATE POLICY "Consumers can update stats for active offers"
  ON public.brand_offer_stats FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = brand_offer_stats.offer_id
        AND o.status IN ('paid_scheduled','live','ended')
    )
  );

-- Atomic upsert-increment RPC. Runs as owner to bypass the client's race between
-- select and insert while still validating the offer is in a trackable state.
CREATE OR REPLACE FUNCTION public.increment_brand_offer_stat(
  _offer_id uuid,
  _slot public.brand_placement_slot,
  _kind text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _kind NOT IN ('impressions','taps','wishlist_adds') THEN
    RAISE EXCEPTION 'Invalid stat kind: %', _kind;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.brand_offers
    WHERE id = _offer_id
      AND status IN ('paid_scheduled','live','ended')
  ) INTO v_ok;
  IF NOT v_ok THEN
    RETURN; -- silently no-op for offers not in a trackable state
  END IF;

  INSERT INTO public.brand_offer_stats (offer_id, slot, stat_date, impressions, taps, wishlist_adds)
  VALUES (
    _offer_id, _slot, v_today,
    CASE WHEN _kind = 'impressions'   THEN 1 ELSE 0 END,
    CASE WHEN _kind = 'taps'          THEN 1 ELSE 0 END,
    CASE WHEN _kind = 'wishlist_adds' THEN 1 ELSE 0 END
  )
  ON CONFLICT (offer_id, slot, stat_date) DO UPDATE
    SET impressions   = public.brand_offer_stats.impressions   + CASE WHEN _kind = 'impressions'   THEN 1 ELSE 0 END,
        taps          = public.brand_offer_stats.taps          + CASE WHEN _kind = 'taps'          THEN 1 ELSE 0 END,
        wishlist_adds = public.brand_offer_stats.wishlist_adds + CASE WHEN _kind = 'wishlist_adds' THEN 1 ELSE 0 END,
        updated_at    = now();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_brand_offer_stat(uuid, public.brand_placement_slot, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_brand_offer_stat(uuid, public.brand_placement_slot, text) TO authenticated;

-- Aggregate totals per offer for the owning brand or admins.
CREATE OR REPLACE FUNCTION public.brand_offer_totals(_offer_ids uuid[])
RETURNS TABLE (
  offer_id uuid,
  impressions bigint,
  taps bigint,
  wishlist_adds bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN QUERY
  SELECT s.offer_id,
         COALESCE(SUM(s.impressions), 0)::bigint,
         COALESCE(SUM(s.taps), 0)::bigint,
         COALESCE(SUM(s.wishlist_adds), 0)::bigint
  FROM public.brand_offer_stats s
  JOIN public.brand_offers o ON o.id = s.offer_id
  WHERE s.offer_id = ANY(_offer_ids)
    AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  GROUP BY s.offer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.brand_offer_totals(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_offer_totals(uuid[]) TO authenticated;
