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
      u.id AS user_id,
      COUNT(s.id)::bigint AS session_count,
      MAX(s.started_at) AS last_session,
      COUNT(s.id) FILTER (WHERE s.started_at > now() - interval '30 days')::bigint AS sessions_last_30d,
      u.created_at
    FROM auth.users u
    LEFT JOIN public.user_sessions s ON s.user_id = u.id
    GROUP BY u.id, u.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_member_activity() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_member_activity() TO authenticated, service_role;