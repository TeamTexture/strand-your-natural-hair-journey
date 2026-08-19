CREATE OR REPLACE FUNCTION public.mention_search_all(_query text, _limit integer DEFAULT 10)
 RETURNS TABLE(kind text, entity_id uuid, label text, subtitle text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY
  WITH q AS (SELECT COALESCE(NULLIF(trim(_query),''), '') AS s),
  members AS (
    SELECT 'member'::text AS kind, p.user_id AS entity_id,
           p.display_name AS label,
           CASE WHEN public.has_active_plus_subscription(p.user_id) THEN 'STRAND+ Member' ELSE 'Member' END AS subtitle,
           p.avatar_url AS avatar_url,
           CASE WHEN p.display_name ILIKE (SELECT s FROM q)||'%' THEN 0 ELSE 1 END AS rank
    FROM public.profiles p, q
    WHERE p.display_name IS NOT NULL
      AND (q.s = '' OR p.display_name ILIKE '%'||q.s||'%')
    ORDER BY rank, p.display_name ASC
    LIMIT LEAST(GREATEST(_limit,1),20)
  ),
  pros AS (
    SELECT 'pro'::text AS kind, pp.user_id AS entity_id, pp.display_name AS label,
           COALESCE(pp.discipline::text,'Professional') || COALESCE(' · '||pp.location,'') AS subtitle,
           NULL::text AS avatar_url,
           CASE WHEN pp.display_name ILIKE (SELECT s FROM q)||'%' THEN 0 ELSE 1 END AS rank
    FROM public.pro_profiles pp, q
    WHERE pp.is_published = true
      AND (q.s = '' OR pp.display_name ILIKE '%'||q.s||'%')
    ORDER BY rank, pp.display_name ASC
    LIMIT LEAST(GREATEST(_limit,1),10)
  ),
  brands AS (
    SELECT 'brand'::text AS kind, bp.user_id AS entity_id, bp.brand_name AS label,
           COALESCE('Brand · '||bp.category, 'Brand') AS subtitle,
           bp.logo_path AS avatar_url,
           CASE WHEN bp.brand_name ILIKE (SELECT s FROM q)||'%' THEN 0 ELSE 1 END AS rank
    FROM public.brand_profiles bp, q
    WHERE bp.brand_name IS NOT NULL
      AND (q.s = '' OR bp.brand_name ILIKE '%'||q.s||'%')
    ORDER BY rank, bp.brand_name ASC
    LIMIT LEAST(GREATEST(_limit,1),10)
  )
  SELECT m.kind, m.entity_id, m.label, m.subtitle, m.avatar_url FROM members m
  UNION ALL SELECT pr.kind, pr.entity_id, pr.label, pr.subtitle, pr.avatar_url FROM pros pr
  UNION ALL SELECT b.kind, b.entity_id, b.label, b.subtitle, b.avatar_url FROM brands b;
END;
$function$;