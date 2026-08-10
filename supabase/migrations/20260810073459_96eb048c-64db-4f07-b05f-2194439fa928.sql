-- 1. Server-side STRAND+ requirement on assignment to an existing member.
CREATE OR REPLACE FUNCTION public.assign_treatment_template(
  _template_id uuid,
  _client_user_id uuid DEFAULT NULL,
  _invited_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _is_admin boolean;
  _owner uuid;
  _id uuid;
  _email text := nullif(lower(trim(_invited_email)), '');
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _is_admin := public.has_role(_me, 'admin');

  SELECT owner_user_id INTO _owner FROM public.treatment_plan_templates WHERE id = _template_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF _owner <> _me AND NOT _is_admin THEN RAISE EXCEPTION 'Not your template'; END IF;

  IF _client_user_id IS NULL AND _email IS NULL THEN
    RAISE EXCEPTION 'Pick a member or enter an email address';
  END IF;

  -- Treatment plans are a STRAND+ feature for every client, with no exceptions.
  IF _client_user_id IS NOT NULL
     AND NOT public.has_active_plus_subscription(_client_user_id) THEN
    RAISE EXCEPTION 'This member does not have STRAND+';
  END IF;

  INSERT INTO public.treatment_plan_assignments (
    professional_id, assigner_user_id, assigner_type, client_user_id, template_id, invited_email, status
  ) VALUES (
    CASE WHEN _is_admin AND _owner = _me AND NOT EXISTS (
      SELECT 1 FROM public.pro_profiles p WHERE p.user_id = _me
    ) THEN NULL ELSE _me END,
    _me,
    CASE WHEN EXISTS (SELECT 1 FROM public.pro_profiles p WHERE p.user_id = _me) THEN 'professional'::public.treatment_assigner_type
         ELSE 'admin'::public.treatment_assigner_type END,
    _client_user_id,
    _template_id,
    _email,
    'pending'
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_treatment_template(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_treatment_template(uuid, uuid, text) TO authenticated;

-- 2. Assignable clients: STRAND+ holders only.
CREATE OR REPLACE FUNCTION public.treatment_assignable_clients()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN '[]'::jsonb ELSE COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'name')
    FROM (
      SELECT DISTINCT ON (u.id) jsonb_build_object(
        'user_id', u.id,
        'name', COALESCE(NULLIF(pr.display_name, ''), u.email, 'Member'),
        'email', u.email
      ) AS x
      FROM auth.users u
      LEFT JOIN public.profiles pr ON pr.user_id = u.id
      WHERE u.id <> auth.uid()
        AND public.has_active_plus_subscription(u.id)
        AND (
          public.has_role(auth.uid(), 'admin')
          OR EXISTS (
            SELECT 1 FROM public.pro_client_access a
            WHERE a.pro_user_id = auth.uid()
              AND a.consumer_id = u.id
              AND a.revoked_at IS NULL
          )
        )
    ) q
  ), '[]'::jsonb) END;
$$;
REVOKE ALL ON FUNCTION public.treatment_assignable_clients() FROM public;
GRANT EXECUTE ON FUNCTION public.treatment_assignable_clients() TO authenticated;

-- 3. Passport treatment plans. Consent model unchanged: plan content only where
--    has_accepted_plan_access passes, media only where has_media_access passes,
--    otherwise title and status only.
CREATE OR REPLACE FUNCTION public.passport_treatment_plans(_client uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN '[]'::jsonb
    WHEN NOT (public.has_role(auth.uid(), 'admin')
              OR public.has_active_client_access(auth.uid(), _client)) THEN '[]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'start_date' DESC)
      FROM (
        SELECT jsonb_build_object(
          'plan_id', p.id,
          'title', p.title,
          'status', p.status,
          'start_date', p.start_date,
          'duration_weeks', p.duration_weeks,
          'has_plan_access', public.has_accepted_plan_access(p.id, auth.uid()),
          'has_media_access', public.has_media_access(p.id, auth.uid()),
          'schedule', CASE WHEN public.has_accepted_plan_access(p.id, auth.uid())
            THEN COALESCE((SELECT jsonb_agg(to_jsonb(s))
                           FROM public.treatment_plan_schedule s WHERE s.plan_id = p.id), '[]'::jsonb)
            ELSE '[]'::jsonb END,
          'entries', CASE WHEN public.has_accepted_plan_access(p.id, auth.uid())
            THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
                             'entry_date', e.entry_date, 'status', e.status,
                             'time_of_day', e.time_of_day, 'schedule_id', e.schedule_id))
                           FROM public.treatment_plan_entries e WHERE e.plan_id = p.id), '[]'::jsonb)
            ELSE '[]'::jsonb END,
          'checkins', CASE WHEN public.has_accepted_plan_access(p.id, auth.uid())
            THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
                             'id', c.id,
                             'week_number', c.week_number,
                             'submitted_at', c.submitted_at,
                             'ratings', c.ratings,
                             'written_note', c.written_note,
                             'media', CASE WHEN public.has_media_access(p.id, auth.uid())
                               THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                                'id', m.id, 'media_type', m.media_type,
                                                'storage_path', m.storage_path,
                                                'caption', m.caption))
                                              FROM public.treatment_plan_media m
                                              WHERE m.checkin_id = c.id), '[]'::jsonb)
                               ELSE '[]'::jsonb END
                           ) ORDER BY c.week_number)
                           FROM public.treatment_plan_checkins c
                           WHERE c.plan_id = p.id AND c.submitted_at IS NOT NULL), '[]'::jsonb)
            ELSE '[]'::jsonb END,
          'products', CASE WHEN public.has_accepted_plan_access(p.id, auth.uid())
            THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
                             'id', pp.id, 'product_name', pp.product_name, 'brand', pp.brand))
                           FROM public.treatment_plan_products pp WHERE pp.plan_id = p.id), '[]'::jsonb)
            ELSE '[]'::jsonb END
        ) AS x
        FROM public.treatment_plans p
        WHERE p.user_id = _client
      ) q
    ), '[]'::jsonb)
  END;
$$;
REVOKE ALL ON FUNCTION public.passport_treatment_plans(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.passport_treatment_plans(uuid) TO authenticated;