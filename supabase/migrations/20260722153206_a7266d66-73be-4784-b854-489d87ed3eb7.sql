
CREATE OR REPLACE FUNCTION public.mention_search_all(_query text, _limit int DEFAULT 10)
RETURNS TABLE(kind text, entity_id uuid, label text, subtitle text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY
  WITH q AS (SELECT COALESCE(NULLIF(trim(_query),''), '') AS s),
  members AS (
    SELECT 'member'::text AS kind, p.user_id AS entity_id,
           p.display_name AS label,
           CASE WHEN public.has_active_plus_subscription(p.user_id) THEN 'STRAND+ Member' ELSE 'Member' END AS subtitle,
           p.avatar_url,
           CASE WHEN p.display_name ILIKE (SELECT s FROM q)||'%' THEN 0 ELSE 1 END AS rank
    FROM public.profiles p, q
    WHERE p.display_name IS NOT NULL
      AND (q.s = '' OR p.display_name ILIKE '%'||q.s||'%')
    ORDER BY rank, p.display_name ASC
    LIMIT LEAST(GREATEST(_limit,1),20)
  ),
  pros AS (
    SELECT 'pro'::text, pp.user_id, pp.display_name,
           COALESCE(pp.discipline::text,'Professional') || COALESCE(' · '||pp.location,''),
           NULL::text,
           CASE WHEN pp.display_name ILIKE (SELECT s FROM q)||'%' THEN 0 ELSE 1 END
    FROM public.pro_profiles pp, q
    WHERE pp.is_published = true
      AND (q.s = '' OR pp.display_name ILIKE '%'||q.s||'%')
    ORDER BY 5, pp.display_name ASC
    LIMIT LEAST(GREATEST(_limit,1),10)
  ),
  brands AS (
    SELECT 'brand'::text, bp.user_id, bp.brand_name,
           COALESCE('Brand · '||bp.category, 'Brand'),
           bp.logo_url,
           CASE WHEN bp.brand_name ILIKE (SELECT s FROM q)||'%' THEN 0 ELSE 1 END
    FROM public.brand_profiles bp, q
    WHERE bp.brand_name IS NOT NULL
      AND (q.s = '' OR bp.brand_name ILIKE '%'||q.s||'%')
    ORDER BY 5, bp.brand_name ASC
    LIMIT LEAST(GREATEST(_limit,1),10)
  )
  SELECT * FROM members
  UNION ALL SELECT kind, entity_id, label, subtitle, avatar_url FROM pros
  UNION ALL SELECT kind, entity_id, label, subtitle, avatar_url FROM brands;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mention_search_all(text,int) TO authenticated;
