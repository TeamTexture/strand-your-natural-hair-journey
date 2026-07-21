CREATE OR REPLACE FUNCTION public.brand_catalogue_items(
  _kind text DEFAULT 'all',
  _search text DEFAULT NULL,
  _limit integer DEFAULT 80
)
RETURNS TABLE(
  kind text,
  source_id uuid,
  name text,
  brand text,
  category text,
  image_url text,
  ingredients text[],
  tool_kind text,
  key_features text[],
  materials text[],
  source_url text,
  user_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  safe_limit integer := LEAST(GREATEST(COALESCE(_limit, 80), 1), 100);
  normalized_kind text := COALESCE(NULLIF(lower(trim(_kind)), ''), 'all');
  term text := NULLIF(lower(trim(COALESCE(_search, ''))), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'brand') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only brand accounts can browse the catalogue';
  END IF;

  IF normalized_kind NOT IN ('all', 'product', 'tool') THEN
    RAISE EXCEPTION 'Invalid catalogue kind';
  END IF;

  RETURN QUERY
  WITH product_rows AS (
    SELECT
      'product'::text AS kind,
      MIN(up.id)::uuid AS source_id,
      up.name::text AS name,
      NULLIF(up.brand, '')::text AS brand,
      NULLIF(up.category, '')::text AS category,
      NULLIF(MAX(up.image_url), '')::text AS image_url,
      (
        SELECT ARRAY_AGG(DISTINCT ing ORDER BY ing)
        FROM (
          SELECT unnest(COALESCE(up2.ingredients, '{}'::text[])) AS ing
          FROM public.user_products up2
          WHERE lower(trim(up2.name)) = lower(trim(up.name))
            AND lower(trim(COALESCE(up2.brand, ''))) = lower(trim(COALESCE(up.brand, '')))
          LIMIT 80
        ) i
        WHERE NULLIF(trim(ing), '') IS NOT NULL
      )::text[] AS ingredients,
      NULL::text AS tool_kind,
      '{}'::text[] AS key_features,
      '{}'::text[] AS materials,
      NULL::text AS source_url,
      COUNT(DISTINCT up.user_id)::bigint AS user_count
    FROM public.user_products up
    WHERE NULLIF(trim(up.name), '') IS NOT NULL
      AND (term IS NULL OR lower(COALESCE(up.name, '') || ' ' || COALESCE(up.brand, '') || ' ' || COALESCE(up.category, '')) LIKE '%' || term || '%')
    GROUP BY lower(trim(up.name)), lower(trim(COALESCE(up.brand, ''))), up.name, NULLIF(up.brand, ''), NULLIF(up.category, '')
  ),
  tool_rows AS (
    SELECT
      'tool'::text AS kind,
      MIN(ut.id)::uuid AS source_id,
      ut.name::text AS name,
      NULLIF(ut.brand, '')::text AS brand,
      NULLIF(ut.category, '')::text AS category,
      NULLIF(MAX(ut.image_url), '')::text AS image_url,
      '{}'::text[] AS ingredients,
      NULLIF(ut.category, '')::text AS tool_kind,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(ut.category, '')), NULL)::text[] AS key_features,
      '{}'::text[] AS materials,
      NULLIF(MAX(ut.source_url), '')::text AS source_url,
      COUNT(DISTINCT ut.user_id)::bigint AS user_count
    FROM public.user_tools ut
    WHERE NULLIF(trim(ut.name), '') IS NOT NULL
      AND (term IS NULL OR lower(COALESCE(ut.name, '') || ' ' || COALESCE(ut.brand, '') || ' ' || COALESCE(ut.category, '')) LIKE '%' || term || '%')
    GROUP BY lower(trim(ut.name)), lower(trim(COALESCE(ut.brand, ''))), ut.name, NULLIF(ut.brand, ''), NULLIF(ut.category, '')
  ),
  combined AS (
    SELECT * FROM product_rows WHERE normalized_kind IN ('all', 'product')
    UNION ALL
    SELECT * FROM tool_rows WHERE normalized_kind IN ('all', 'tool')
  )
  SELECT * FROM combined
  ORDER BY user_count DESC, name ASC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.brand_catalogue_items(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_catalogue_items(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_catalogue_items(text, text, integer) TO service_role;