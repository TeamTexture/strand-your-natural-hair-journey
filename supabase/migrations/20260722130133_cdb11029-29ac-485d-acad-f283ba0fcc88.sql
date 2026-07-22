
CREATE OR REPLACE FUNCTION public.forum_author_meta(_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  city text,
  goal_title text,
  hair_type text
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

  IF NOT (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'STRAND+ required';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
    -- Postcode outward area only (never the full postcode).
    NULLIF(
      upper(
        regexp_replace(
          split_part(coalesce(p.postcode, ''), ' ', 1),
          '[^A-Za-z0-9]', '', 'g'
        )
      ),
      ''
    ) AS city,
    -- Most recent in-progress goal title, else null.
    (
      SELECT g.title
      FROM public.user_goals g
      WHERE g.user_id = p.user_id
        AND g.status = 'in_progress'
        AND NULLIF(trim(g.title), '') IS NOT NULL
      ORDER BY g.updated_at DESC
      LIMIT 1
    ) AS goal_title,
    -- Hair type, humanised: "Type 4C" style. Falls back to density if no texture.
    NULLIF(
      trim(
        CASE
          WHEN h.surface_texture IS NOT NULL AND h.surface_texture <> '' THEN
            'Type ' || upper(replace(replace(h.surface_texture, 'type_', ''), '_', ''))
          ELSE ''
        END
      ),
      ''
    ) AS hair_type
  FROM public.profiles p
  LEFT JOIN public.user_hair_profile h ON h.user_id = p.user_id
  WHERE p.user_id = ANY(_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.forum_author_meta(uuid[]) TO authenticated;
