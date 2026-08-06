CREATE OR REPLACE FUNCTION public.ad_delivery_for_slot(_slot text)
RETURNS TABLE(offer_id uuid, was_matched boolean, match_reason text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_consent boolean := false;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  SELECT coalesce(p.personalised_offers_consent,false) INTO v_consent
  FROM public.profiles p WHERE p.user_id = v_user;

  RETURN QUERY
  WITH candidates AS (
    SELECT DISTINCT o.id,
           EXISTS (SELECT 1 FROM public.brand_offer_targeting t WHERE t.offer_id = o.id) AS targeted
    FROM public.brand_offer_placements pl
    JOIN public.brand_offers o ON o.id = pl.offer_id
    WHERE pl.slot = _slot::public.brand_placement_slot
      AND pl.placement_date = v_today
      AND o.status IN ('paid_scheduled','live')
      AND o.starts_on <= v_today
      AND o.ends_on >= v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.ad_offer_dismissals d
        WHERE d.offer_id = o.id AND d.user_id = v_user
      )
  ),
  eligible AS (
    SELECT c.id, true AS matched, aud.match_reason
    FROM candidates c
    JOIN public.ad_offer_audience aud ON aud.offer_id = c.id AND aud.user_id = v_user
    WHERE c.targeted AND v_consent
    UNION ALL
    SELECT c.id, false, NULL::text[]
    FROM candidates c
    WHERE NOT c.targeted
  )
  SELECT e.id,
         CASE WHEN e.matched THEN true ELSE NULL END,
         CASE WHEN e.matched THEN e.match_reason ELSE NULL END
  FROM eligible e
  ORDER BY e.matched DESC, e.id
  LIMIT 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ad_delivery_for_slot(text) FROM PUBLIC, anon;