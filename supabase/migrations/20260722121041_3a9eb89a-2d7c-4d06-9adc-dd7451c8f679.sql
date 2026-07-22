
CREATE OR REPLACE FUNCTION public.brand_public_catalogue(_brand_user_id uuid)
RETURNS TABLE(
  kind text,
  name text,
  brand text,
  category text,
  image_url text,
  storage_path text,
  source_url text,
  member_count bigint,
  offer_id uuid,
  brand_product_id uuid,
  viewer_on_shelf boolean,
  viewer_on_wishlist boolean,
  viewer_on_favourite boolean,
  viewer_previously_on_shelf boolean,
  viewer_item_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Products members have on their shelves / wishlists.
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
  -- Products the brand itself uploaded via campaigns.
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
      (array_agg(bo.id ORDER BY bo.created_at DESC))[1] AS offer_id,
      (array_agg(bpr.id ORDER BY bpr.created_at DESC))[1] AS brand_product_id
    FROM public.brand_products bpr
    JOIN public.brand_offers bo ON bo.id = bpr.offer_id
    WHERE bo.brand_user_id = _brand_user_id
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
    COALESCE(vp.on_shelf, vt.on_shelf, false) AS viewer_on_shelf,
    COALESCE(vp.on_wishlist, false) AS viewer_on_wishlist,
    COALESCE(vp.on_favourite, vt.on_favourite, false) AS viewer_on_favourite,
    COALESCE(vp.previously_on_shelf, false) AS viewer_previously_on_shelf,
    COALESCE(vp.id, vt.id) AS viewer_item_id
  FROM dedup d
  LEFT JOIN LATERAL (
    SELECT up.id, up.on_shelf, up.on_wishlist, up.on_favourite, up.previously_on_shelf,
           COALESCE(up.image_url, '') AS image_url, COALESCE(up.storage_path,'') AS storage_path
    FROM public.user_products up
    WHERE up.user_id = v_viewer
      AND lower(trim(up.name)) = d.key
      AND lower(trim(coalesce(up.brand,''))) = v_brand_name
    ORDER BY up.updated_at DESC
    LIMIT 1
  ) vp ON d.kind = 'product'
  LEFT JOIN LATERAL (
    SELECT ut.id, ut.on_shelf, ut.on_favourite,
           COALESCE(ut.image_url,'') AS image_url, COALESCE(ut.storage_path,'') AS storage_path
    FROM public.user_tools ut
    WHERE ut.user_id = v_viewer
      AND lower(trim(ut.name)) = d.key
      AND lower(trim(coalesce(ut.brand,''))) = v_brand_name
    ORDER BY ut.updated_at DESC
    LIMIT 1
  ) vt ON d.kind = 'tool'
  ORDER BY d.member_count DESC NULLS LAST, d.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.brand_public_catalogue(uuid) TO authenticated;
