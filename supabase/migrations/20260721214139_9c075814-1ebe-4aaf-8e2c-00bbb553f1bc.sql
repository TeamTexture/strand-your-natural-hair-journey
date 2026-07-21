CREATE OR REPLACE FUNCTION public.admin_list_pro_usage()
 RETURNS TABLE(user_id uuid, display_name text, discipline text, contact_email text, email text, is_published boolean, suspended_at timestamp with time zone, access_restricted boolean, application_status text, application_created_at timestamp with time zone, sub_status text, sub_current_period_end timestamp with time zone, sub_cancel_at_period_end boolean, session_count bigint, last_session timestamp with time zone, sessions_last_30d bigint, enquiries_total bigint, enquiries_pending bigint, enquiries_accepted bigint, enquiries_declined bigint, active_clients bigint, views_last_30d bigint, offers_live bigint, appointments_total bigint, appointments_upcoming bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    COALESCE(ap.total, 0),
    COALESCE(ap.upcoming, 0),
    pp.created_at
  FROM public.pro_profiles pp
  LEFT JOIN public.pro_subscriptions ps ON ps.pro_user_id = pp.user_id
  LEFT JOIN auth.users u ON u.id = pp.user_id
  LEFT JOIN public.profiles pr ON pr.user_id = pp.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS session_count,
           MAX(s.started_at) AS last_session,
           COUNT(*) FILTER (WHERE s.started_at > now() - interval '30 days') AS sessions_last_30d
    FROM public.user_sessions s WHERE s.user_id = pp.user_id
  ) sa ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE e.status = 'pending') AS pending,
           COUNT(*) FILTER (WHERE e.status = 'accepted') AS accepted,
           COUNT(*) FILTER (WHERE e.status = 'declined') AS declined
    FROM public.pro_enquiries e WHERE e.pro_user_id = pp.user_id
  ) en ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS active_clients FROM public.pro_client_access pca
    WHERE pca.pro_user_id = pp.user_id AND pca.revoked_at IS NULL
  ) ac ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS views_30d FROM public.pro_passport_views v
    WHERE v.pro_user_id = pp.user_id AND v.viewed_at > now() - interval '30 days'
  ) vw ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS live FROM public.pro_offers o
    WHERE o.pro_user_id = pp.user_id AND o.is_active
      AND (o.starts_at IS NULL OR o.starts_at <= now())
      AND (o.ends_at IS NULL OR o.ends_at >= now())
  ) of ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (
             WHERE a.status NOT IN ('completed','cancelled','no_show')
               AND a.appointment_date >= CURRENT_DATE
           ) AS upcoming
    FROM public.appointments a
    WHERE a.linked_pro_user_id = pp.user_id
  ) ap ON true;
END;
$function$;