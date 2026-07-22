CREATE OR REPLACE FUNCTION public.forum_search_plus_members(_query text, _limit int DEFAULT 8)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'STRAND+ required';
  END IF;
  RETURN QUERY
  SELECT p.user_id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE (public.has_active_plus_subscription(p.user_id) OR public.has_role(p.user_id,'admin'))
    AND p.display_name IS NOT NULL
    AND (_query IS NULL OR _query = '' OR p.display_name ILIKE '%' || _query || '%')
  ORDER BY (CASE WHEN p.display_name ILIKE _query || '%' THEN 0 ELSE 1 END), p.display_name ASC
  LIMIT LEAST(GREATEST(_limit,1), 20);
END;
$$;