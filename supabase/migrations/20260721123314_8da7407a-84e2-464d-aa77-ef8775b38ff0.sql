CREATE OR REPLACE FUNCTION public.admin_list_pro_usage()
RETURNS TABLE(
  user_id uuid,
  display_name text,
  discipline text,
  contact_email text,
  email text,
  is_published boolean,
  suspended_at timestamptz,
  access_restricted boolean,
  application_status text,
  application_created_at timestamptz,
  sub_status text,
  sub_current_period_end timestamptz,
  sub_cancel_at_period_end boolean,
  session_count bigint,
  last_session timestamptz,
  sessions_last_30d bigint,
  enquiries_total bigint,
  enquiries_pending bigint,
  enquiries_accepted bigint,
  enquiries_declined bigint,
  active_clients bigint,
  views_last_30d bigint,
  offers_live bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read pro usage';
  END IF;
  RETURN QUERY
  SELECT
    pp.user_id,
    pp.display_name,
    pp.discipline::text,
    pp.contact_email,
    u.email::text,
    pp.is_published,
    pp.suspended_at,
    COALESCE(pr.access_restricted, false),
    (SELECT pa.status::text FROM public.pro_applications pa WHERE pa.user_id = pp.user_id ORDER BY pa.created_at DESC LIMIT 1),
    (SELECT pa.created_at FROM public.pro_applications pa WHERE pa.user_id = pp.user_id ORDER BY pa.created_at DESC LIMIT 1),
    ps.status,
    ps.current_period_end,
    ps.cancel_at_period_end,
    COALESCE(sa.session_count, 0),
    sa.last_session,
    COALESCE(sa.sessions_last_30d, 0),
    COALESCE(en.total, 0),
    COALESCE(en.pending, 0),
    COALESCE(en.accepted, 0),
    COALESCE(en.declined, 0),
    COALESCE(ac.active_clients, 0),
    COALESCE(vw.views_30d, 0),
    COALESCE(of.live, 0),
    pp.created_at
  FROM public.pro_profiles pp
  LEFT JOIN public.pro_subscriptions ps ON ps.pro_user_id = pp.user_id
  LEFT JOIN auth.users u ON u.id = pp.user_id
  LEFT JOIN public.profiles pr ON pr.user_id = pp.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS session_count,
           MAX(started_at) AS last_session,
           COUNT(*) FILTER (WHERE started_at > now() - interval '30 days') AS sessions_last_30d
    FROM public.user_sessions WHERE user_id = pp.user_id
  ) sa ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'pending') AS pending,
           COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
           COUNT(*) FILTER (WHERE status = 'declined') AS declined
    FROM public.pro_enquiries WHERE pro_user_id = pp.user_id
  ) en ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS active_clients FROM public.pro_client_access
    WHERE pro_user_id = pp.user_id AND revoked_at IS NULL
  ) ac ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS views_30d FROM public.pro_passport_views
    WHERE pro_user_id = pp.user_id AND viewed_at > now() - interval '30 days'
  ) vw ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS live FROM public.pro_offers
    WHERE pro_user_id = pp.user_id AND is_active
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at >= now())
  ) of ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_pro_usage() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_pro_usage_detail(_pro uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read pro usage detail';
  END IF;
  SELECT jsonb_build_object(
    'recent_views', COALESCE((
      SELECT jsonb_agg(x)
      FROM (
        SELECT jsonb_build_object(
          'consumer_id', v.consumer_id,
          'consumer_name', p.display_name,
          'section', v.section,
          'viewed_at', v.viewed_at
        ) AS x
        FROM public.pro_passport_views v
        LEFT JOIN public.profiles p ON p.user_id = v.consumer_id
        WHERE v.pro_user_id = _pro
        ORDER BY v.viewed_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'response_stats', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'responded', COUNT(*) FILTER (WHERE responded_at IS NOT NULL),
        'pending', COUNT(*) FILTER (WHERE responded_at IS NULL),
        'avg_response_hours', AVG(EXTRACT(EPOCH FROM (responded_at - created_at))/3600.0)
          FILTER (WHERE responded_at IS NOT NULL)
      ) FROM public.pro_enquiries WHERE pro_user_id = _pro
    ),
    'live_offers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'code', code,
        'starts_at', starts_at, 'ends_at', ends_at
      ))
      FROM (
        SELECT id, title, code, starts_at, ends_at, created_at
        FROM public.pro_offers
        WHERE pro_user_id = _pro AND is_active
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
        ORDER BY created_at DESC
      ) o
    ), '[]'::jsonb),
    'profile', (
      SELECT jsonb_build_object(
        'bio', bio,
        'services', services,
        'photos', photos,
        'location', location,
        'postcode', postcode,
        'website_url', website_url,
        'instagram_handle', instagram_handle,
        'avatar_path', avatar_path,
        'business_phone', business_phone,
        'business_email', business_email,
        'address_line1', address_line1,
        'city', city,
        'opening_hours', opening_hours
      ) FROM public.pro_profiles WHERE user_id = _pro
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_pro_usage_detail(uuid) TO authenticated;