CREATE TABLE IF NOT EXISTS public.treatment_plan_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_name text,
  invited_email text,
  status text NOT NULL DEFAULT 'pending',
  share_media boolean NOT NULL DEFAULT false,
  media_revoked_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_plan_shares_status_chk
    CHECK (status IN ('pending','accepted','declined','revoked')),
  CONSTRAINT treatment_plan_shares_target_chk
    CHECK (professional_user_id IS NOT NULL OR invited_email IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS treatment_plan_shares_pro_uniq
  ON public.treatment_plan_shares(plan_id, professional_user_id)
  WHERE professional_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS treatment_plan_shares_email_uniq
  ON public.treatment_plan_shares(plan_id, lower(invited_email))
  WHERE invited_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS treatment_plan_shares_pro_idx
  ON public.treatment_plan_shares(professional_user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_shares TO authenticated;
GRANT ALL ON public.treatment_plan_shares TO service_role;

ALTER TABLE public.treatment_plan_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage shares on own plans" ON public.treatment_plan_shares;
CREATE POLICY "Owners manage shares on own plans"
  ON public.treatment_plan_shares
  TO authenticated
  USING (owner_user_id = auth.uid() AND public.owns_treatment_plan(plan_id, auth.uid()))
  WITH CHECK (owner_user_id = auth.uid() AND public.owns_treatment_plan(plan_id, auth.uid()));

DROP POLICY IF EXISTS "Invited professional reads own share" ON public.treatment_plan_shares;
CREATE POLICY "Invited professional reads own share"
  ON public.treatment_plan_shares
  FOR SELECT
  TO authenticated
  USING (professional_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read plan shares" ON public.treatment_plan_shares;
CREATE POLICY "Admins read plan shares"
  ON public.treatment_plan_shares
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.treatment_shares_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.share_media AND NOT COALESCE(OLD.share_media, false) THEN
    NEW.media_revoked_at := NULL;
  ELSIF COALESCE(OLD.share_media, false) AND NOT NEW.share_media THEN
    NEW.media_revoked_at := COALESCE(NEW.media_revoked_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS treatment_plan_shares_touch ON public.treatment_plan_shares;
CREATE TRIGGER treatment_plan_shares_touch
  BEFORE UPDATE ON public.treatment_plan_shares
  FOR EACH ROW EXECUTE FUNCTION public.treatment_shares_touch();

CREATE OR REPLACE FUNCTION public.has_accepted_plan_access(_plan_id uuid, _pro uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _pro IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.treatment_plan_assignments a
        WHERE a.plan_id = _plan_id
          AND a.professional_id = _pro
          AND a.status = 'accepted'
      )
      OR EXISTS (
        SELECT 1 FROM public.treatment_plan_shares s
        WHERE s.plan_id = _plan_id
          AND s.professional_user_id = _pro
          AND s.status = 'accepted'
      )
    )
    AND (public.has_role(_pro, 'admin') OR public.has_professional_undertaking(_pro))
$$;

CREATE OR REPLACE FUNCTION public.has_media_access(_plan_id uuid, _pro uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _pro IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.treatment_plan_assignments a
        WHERE a.plan_id = _plan_id
          AND a.status = 'accepted'
          AND a.media_sharing_consent = true
          AND a.media_consent_revoked_at IS NULL
          AND (
            (a.assigner_type = 'professional' AND a.professional_id = _pro)
            OR
            (a.assigner_type = 'admin' AND a.assigner_user_id = _pro AND public.has_role(_pro, 'admin'))
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.treatment_plan_shares s
        WHERE s.plan_id = _plan_id
          AND s.professional_user_id = _pro
          AND s.status = 'accepted'
          AND s.share_media = true
          AND s.media_revoked_at IS NULL
      )
    )
    AND (public.has_role(_pro, 'admin') OR public.has_professional_undertaking(_pro))
$$;

CREATE OR REPLACE FUNCTION public.claim_my_treatment_shares()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text;
  _n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = auth.uid();
  IF _email IS NULL THEN RETURN 0; END IF;

  UPDATE public.treatment_plan_shares s
     SET professional_user_id = auth.uid()
   WHERE s.professional_user_id IS NULL
     AND lower(s.invited_email) = _email
     AND s.status = 'pending'
     AND NOT EXISTS (
       SELECT 1 FROM public.treatment_plan_shares o
       WHERE o.plan_id = s.plan_id AND o.professional_user_id = auth.uid()
     );
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.claim_my_treatment_shares() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_my_treatment_shares() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.treatment_share_detail(_share_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'share_media', s.share_media,
    'plan_id', s.plan_id,
    'plan_title', p.title,
    'duration_weeks', p.duration_weeks,
    'start_date', p.start_date,
    'step_count', (SELECT count(*) FROM public.treatment_plan_schedule sc WHERE sc.plan_id = p.id),
    'member_name', COALESCE((SELECT pr.display_name FROM public.profiles pr WHERE pr.user_id = s.owner_user_id), 'A STRAND member'),
    'invited_name', s.invited_name
  )
  FROM public.treatment_plan_shares s
  JOIN public.treatment_plans p ON p.id = s.plan_id
  WHERE s.id = _share_id
    AND (s.professional_user_id = auth.uid() OR s.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
$$;

REVOKE ALL ON FUNCTION public.treatment_share_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treatment_share_detail(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.treatment_share_respond(_share_id uuid, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.treatment_plan_shares;
BEGIN
  SELECT * INTO _row FROM public.treatment_plan_shares WHERE id = _share_id;
  IF _row.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF _row.professional_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF _row.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;
  IF _accept AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_professional_undertaking(auth.uid())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'undertaking_required');
  END IF;

  UPDATE public.treatment_plan_shares
     SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
         responded_at = now()
   WHERE id = _share_id;

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN _accept THEN 'accepted' ELSE 'declined' END);
END $$;

REVOKE ALL ON FUNCTION public.treatment_share_respond(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treatment_share_respond(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.treatment_pro_search(_q text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN '[]'::jsonb ELSE COALESCE(
    (SELECT jsonb_agg(x ORDER BY x->>'display_name')
     FROM (
       SELECT jsonb_build_object(
         'user_id', pf.user_id,
         'display_name', COALESCE(pf.display_name, 'Professional'),
         'discipline', pf.discipline::text,
         'city', pf.city
       ) AS x
       FROM public.pro_profiles pf
       WHERE pf.user_id IS NOT NULL
         AND pf.is_published = true
         AND (
           COALESCE(pf.display_name, '') ILIKE '%' || COALESCE(_q, '') || '%'
           OR COALESCE(pf.city, '') ILIKE '%' || COALESCE(_q, '') || '%'
         )
       LIMIT 20
     ) s), '[]'::jsonb) END;
$$;

REVOKE ALL ON FUNCTION public.treatment_pro_search(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treatment_pro_search(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pro_treatment_clients()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'assignment_id', a.id,
      'created_at', a.created_at,
      'status', a.status,
      'source', 'assignment',
      'invited_email', a.invited_email,
      'media_sharing_consent', a.media_sharing_consent,
      'client_user_id', a.client_user_id,
      'client_has_plus', COALESCE(public.has_active_plus_subscription(a.client_user_id), false),
      'client_name', COALESCE((SELECT pr.display_name FROM public.profiles pr WHERE pr.user_id = a.client_user_id), a.invited_email, 'Client'),
      'template_title', (SELECT t.title FROM public.treatment_plan_templates t WHERE t.id = a.template_id),
      'plan', (SELECT jsonb_build_object('id', p.id, 'title', p.title, 'start_date', p.start_date,
                 'duration_weeks', p.duration_weeks, 'status', p.status)
               FROM public.treatment_plans p WHERE p.id = a.plan_id),
      'schedule', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.treatment_plan_schedule s WHERE s.plan_id = a.plan_id), '[]'::jsonb),
      'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object('entry_date', e.entry_date, 'status', e.status,
                   'time_of_day', e.time_of_day, 'schedule_id', e.schedule_id))
                 FROM public.treatment_plan_entries e WHERE e.plan_id = a.plan_id), '[]'::jsonb),
      'last_entry_date', (SELECT max(e.entry_date) FROM public.treatment_plan_entries e WHERE e.plan_id = a.plan_id),
      'checkin_weeks', COALESCE((SELECT jsonb_agg(c.week_number) FROM public.treatment_plan_checkins c
                 WHERE c.plan_id = a.plan_id AND c.submitted_at IS NOT NULL), '[]'::jsonb)
    ) AS row
    FROM public.treatment_plan_assignments a
    WHERE auth.uid() IS NOT NULL
      AND (a.professional_id = auth.uid() OR a.assigner_user_id = auth.uid())
      AND a.status <> 'revoked'

    UNION ALL

    SELECT jsonb_build_object(
      'assignment_id', sh.id,
      'created_at', sh.created_at,
      'status', sh.status,
      'source', 'share',
      'invited_email', sh.invited_email,
      'media_sharing_consent', (sh.share_media AND sh.media_revoked_at IS NULL),
      'client_user_id', sh.owner_user_id,
      'client_has_plus', COALESCE(public.has_active_plus_subscription(sh.owner_user_id), false),
      'client_name', COALESCE((SELECT pr.display_name FROM public.profiles pr WHERE pr.user_id = sh.owner_user_id), 'Client'),
      'template_title', NULL,
      'plan', (SELECT jsonb_build_object('id', p.id, 'title', p.title, 'start_date', p.start_date,
                 'duration_weeks', p.duration_weeks, 'status', p.status)
               FROM public.treatment_plans p WHERE p.id = sh.plan_id),
      'schedule', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.treatment_plan_schedule s WHERE s.plan_id = sh.plan_id), '[]'::jsonb),
      'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object('entry_date', e.entry_date, 'status', e.status,
                   'time_of_day', e.time_of_day, 'schedule_id', e.schedule_id))
                 FROM public.treatment_plan_entries e WHERE e.plan_id = sh.plan_id), '[]'::jsonb),
      'last_entry_date', (SELECT max(e.entry_date) FROM public.treatment_plan_entries e WHERE e.plan_id = sh.plan_id),
      'checkin_weeks', COALESCE((SELECT jsonb_agg(c.week_number) FROM public.treatment_plan_checkins c
                 WHERE c.plan_id = sh.plan_id AND c.submitted_at IS NOT NULL), '[]'::jsonb)
    ) AS row
    FROM public.treatment_plan_shares sh
    WHERE auth.uid() IS NOT NULL
      AND sh.professional_user_id = auth.uid()
      AND sh.status = 'accepted'
  ) q;
$$;

REVOKE ALL ON FUNCTION public.pro_treatment_clients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pro_treatment_clients() TO authenticated;