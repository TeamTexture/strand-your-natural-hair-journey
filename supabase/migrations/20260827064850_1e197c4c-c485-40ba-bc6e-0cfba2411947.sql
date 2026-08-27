CREATE OR REPLACE FUNCTION public.ad_delivery_for_slot(_slot text)
 RETURNS TABLE(offer_id uuid, was_matched boolean, match_reason text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND o.hidden_at IS NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.brand_public_catalogue(_brand_user_id uuid)
 RETURNS TABLE(kind text, name text, brand text, category text, image_url text, storage_path text, source_url text, member_count bigint, offer_id uuid, brand_product_id uuid, viewer_on_shelf boolean, viewer_on_wishlist boolean, viewer_on_favourite boolean, viewer_previously_on_shelf boolean, viewer_item_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_name text;
  v_viewer uuid := auth.uid();
BEGIN
  SELECT lower(trim(bp.brand_name)) INTO v_brand_name
  FROM public.brand_profiles bp
  WHERE bp.user_id = _brand_user_id;

  IF v_brand_name IS NULL OR v_brand_name = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  user_prod AS (
    SELECT
      'product'::text AS kind,
      lower(trim(up.name)) AS key,
      MIN(up.name) AS name,
      MIN(up.brand) AS brand,
      NULLIF(MIN(NULLIF(up.category, '')), '') AS category,
      MAX(NULLIF(up.image_url, '')) AS image_url,
      MAX(NULLIF(up.storage_path, '')) AS storage_path,
      MAX(NULLIF(up.source_url, '')) AS source_url,
      COUNT(DISTINCT up.user_id)::bigint AS member_count,
      NULL::uuid AS offer_id,
      NULL::uuid AS brand_product_id
    FROM public.user_products up
    WHERE lower(trim(coalesce(up.brand,''))) = v_brand_name
      AND NULLIF(trim(up.name), '') IS NOT NULL
    GROUP BY lower(trim(up.name))
  ),
  user_tool AS (
    SELECT
      'tool'::text AS kind,
      lower(trim(ut.name)) AS key,
      MIN(ut.name) AS name,
      MIN(ut.brand) AS brand,
      NULLIF(MIN(NULLIF(ut.category, '')), '') AS category,
      MAX(NULLIF(ut.image_url, '')) AS image_url,
      MAX(NULLIF(ut.storage_path, '')) AS storage_path,
      MAX(NULLIF(ut.source_url, '')) AS source_url,
      COUNT(DISTINCT ut.user_id)::bigint AS member_count,
      NULL::uuid AS offer_id,
      NULL::uuid AS brand_product_id
    FROM public.user_tools ut
    WHERE lower(trim(coalesce(ut.brand,''))) = v_brand_name
      AND NULLIF(trim(ut.name), '') IS NOT NULL
    GROUP BY lower(trim(ut.name))
  ),
  brand_prod AS (
    SELECT
      COALESCE(NULLIF(bpr.kind,''), 'product') AS kind,
      lower(trim(bpr.name)) AS key,
      MIN(bpr.name) AS name,
      v_brand_name AS brand,
      NULL::text AS category,
      MAX(NULLIF((bpr.image_urls)[1], '')) AS image_url,
      NULL::text AS storage_path,
      MAX(NULLIF(bpr.external_url, '')) AS source_url,
      0::bigint AS member_count,
      (array_agg(lo.offer_id ORDER BY lo.created_at DESC NULLS LAST))[1] AS offer_id,
      (array_agg(bpr.id ORDER BY bpr.created_at DESC))[1] AS brand_product_id
    FROM public.brand_products bpr
    LEFT JOIN LATERAL (
      SELECT bop.offer_id, bo.created_at
      FROM public.brand_offer_products bop
      JOIN public.brand_offers bo ON bo.id = bop.offer_id
      WHERE bop.brand_product_id = bpr.id
        AND bo.hidden_at IS NULL
      ORDER BY bo.created_at DESC
      LIMIT 1
    ) lo ON true
    WHERE bpr.brand_user_id = _brand_user_id
      AND NULLIF(trim(bpr.name), '') IS NOT NULL
    GROUP BY COALESCE(NULLIF(bpr.kind,''), 'product'), lower(trim(bpr.name))
  ),
  merged AS (
    SELECT * FROM user_prod
    UNION ALL SELECT * FROM user_tool
    UNION ALL SELECT * FROM brand_prod
  ),
  dedup AS (
    SELECT
      kind,
      key,
      MIN(name) AS name,
      MIN(brand) AS brand,
      MIN(category) AS category,
      MAX(image_url) AS image_url,
      MAX(storage_path) AS storage_path,
      MAX(source_url) AS source_url,
      SUM(member_count)::bigint AS member_count,
      MAX(offer_id) AS offer_id,
      MAX(brand_product_id) AS brand_product_id
    FROM merged
    GROUP BY kind, key
  )
  SELECT
    d.kind,
    d.name,
    d.brand,
    d.category,
    d.image_url,
    d.storage_path,
    d.source_url,
    d.member_count,
    d.offer_id,
    d.brand_product_id,
    EXISTS (
      SELECT 1 FROM public.user_products vp
      WHERE vp.user_id = v_viewer
        AND lower(trim(vp.name)) = d.key
        AND coalesce(vp.on_shelf, true)
    ) AS viewer_on_shelf,
    EXISTS (
      SELECT 1 FROM public.user_products vp
      WHERE vp.user_id = v_viewer
        AND lower(trim(vp.name)) = d.key
        AND coalesce(vp.wishlist, false)
    ) AS viewer_on_wishlist,
    EXISTS (
      SELECT 1 FROM public.user_products vp
      WHERE vp.user_id = v_viewer
        AND lower(trim(vp.name)) = d.key
        AND coalesce(vp.favourite, false)
    ) AS viewer_on_favourite,
    EXISTS (
      SELECT 1 FROM public.user_products vp
      WHERE vp.user_id = v_viewer
        AND lower(trim(vp.name)) = d.key
        AND coalesce(vp.on_shelf, true) = false
    ) AS viewer_previously_on_shelf,
    (
      SELECT vp.id FROM public.user_products vp
      WHERE vp.user_id = v_viewer
        AND lower(trim(vp.name)) = d.key
      ORDER BY coalesce(vp.on_shelf, true) DESC, vp.created_at DESC
      LIMIT 1
    ) AS viewer_item_id
  FROM dedup d
  ORDER BY d.member_count DESC, d.name;
END;
$function$;