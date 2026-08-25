DROP FUNCTION IF EXISTS public.admin_list_member_activity();

CREATE OR REPLACE FUNCTION public.admin_list_member_activity()
RETURNS TABLE(
  user_id uuid,
  session_count bigint,
  last_session timestamptz,
  sessions_last_30d bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read member activity';
  END IF;
  RETURN QUERY
    SELECT
      s.user_id,
      COUNT(*)::bigint AS session_count,
      MAX(s.started_at) AS last_session,
      COUNT(*) FILTER (WHERE s.started_at > now() - interval '30 days')::bigint AS sessions_last_30d,
      u.created_at
    FROM public.user_sessions s
    JOIN auth.users u ON u.id = s.user_id
    GROUP BY s.user_id, u.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_member_activity() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_member_activity() TO authenticated, service_role;