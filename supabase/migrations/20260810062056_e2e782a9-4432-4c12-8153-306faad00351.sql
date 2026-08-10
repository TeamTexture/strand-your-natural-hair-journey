-- ============================================================
-- Template steps: a template needs its own routine, independent of any plan.
-- ============================================================
CREATE TABLE public.treatment_plan_template_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.treatment_plan_templates(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  instructions text,
  cadence public.treatment_cadence NOT NULL DEFAULT 'daily',
  days_of_week smallint[] NOT NULL DEFAULT '{}',
  time_of_day public.treatment_time_of_day NOT NULL DEFAULT 'morning',
  step_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treatment_plan_template_steps_template_idx
  ON public.treatment_plan_template_steps(template_id, step_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_template_steps TO authenticated;
GRANT ALL ON public.treatment_plan_template_steps TO service_role;
ALTER TABLE public.treatment_plan_template_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own template steps"
  ON public.treatment_plan_template_steps FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.treatment_plan_templates t
    WHERE t.id = template_id
      AND (t.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.treatment_plan_templates t
    WHERE t.id = template_id
      AND (t.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Clients read assigned template steps"
  ON public.treatment_plan_template_steps FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.treatment_plan_assignments a
    WHERE a.template_id = treatment_plan_template_steps.template_id
      AND a.client_user_id = auth.uid()
  ));

CREATE TRIGGER trg_tpts_updated BEFORE UPDATE ON public.treatment_plan_template_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Which weeks of a template prompt a photo.
ALTER TABLE public.treatment_plan_templates
  ADD COLUMN IF NOT EXISTS milestone_weeks smallint[] NOT NULL DEFAULT '{}';

-- ============================================================
-- Assign a template to a client (existing member or an email invite).
-- ============================================================
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

-- ============================================================
-- Invitation detail for the client.
-- ============================================================
CREATE OR REPLACE FUNCTION public.treatment_invitation(_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _a public.treatment_plan_assignments;
  _sender uuid;
  _out jsonb;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.treatment_plan_assignments WHERE id = _assignment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF _a.client_user_id IS DISTINCT FROM _me THEN RAISE EXCEPTION 'Not your invitation'; END IF;

  _sender := coalesce(_a.assigner_user_id, _a.professional_id);

  SELECT jsonb_build_object(
    'assignment_id', _a.id,
    'status', _a.status,
    'media_sharing_consent', _a.media_sharing_consent,
    'plan_id', _a.plan_id,
    'assigner_type', _a.assigner_type,
    'sender_name', COALESCE(
      (SELECT pp.display_name FROM public.pro_profiles pp WHERE pp.user_id = _sender),
      (SELECT pr.display_name FROM public.profiles pr WHERE pr.user_id = _sender),
      'STRAND'),
    'sender_title', (SELECT pp.discipline::text FROM public.pro_profiles pp WHERE pp.user_id = _sender),
    'template', (SELECT jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description,
        'duration_weeks', t.duration_weeks, 'milestone_weeks', t.milestone_weeks)
      FROM public.treatment_plan_templates t WHERE t.id = _a.template_id),
    'steps', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'task_name', s.task_name, 'instructions', s.instructions,
        'cadence', s.cadence, 'days_of_week', s.days_of_week,
        'time_of_day', s.time_of_day, 'step_order', s.step_order) ORDER BY s.step_order)
      FROM public.treatment_plan_template_steps s WHERE s.template_id = _a.template_id), '[]'::jsonb),
    'product_count', (SELECT count(*) FROM public.treatment_plan_template_steps s
      WHERE s.template_id = _a.template_id AND s.instructions IS NOT NULL)
  ) INTO _out;

  RETURN _out;
END;
$$;
REVOKE ALL ON FUNCTION public.treatment_invitation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.treatment_invitation(uuid) TO authenticated;

-- ============================================================
-- Accept: builds the client's plan from the template. Never touches media consent.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_treatment_assignment(_assignment_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _a public.treatment_plan_assignments;
  _t public.treatment_plan_templates;
  _plan uuid;
  _wk smallint;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.treatment_plan_assignments WHERE id = _assignment_id;
  IF _a.id IS NULL OR _a.client_user_id IS DISTINCT FROM _me THEN
    RAISE EXCEPTION 'Not your invitation';
  END IF;
  IF _a.status = 'accepted' AND _a.plan_id IS NOT NULL THEN RETURN _a.plan_id; END IF;

  _plan := _a.plan_id;

  IF _plan IS NULL THEN
    SELECT * INTO _t FROM public.treatment_plan_templates WHERE id = _a.template_id;
    IF _t.id IS NULL THEN RAISE EXCEPTION 'Template no longer available'; END IF;

    INSERT INTO public.treatment_plans (
      user_id, title, description, duration_weeks, start_date, status, source_template_id
    ) VALUES (
      _me, _t.title, _t.description, _t.duration_weeks, CURRENT_DATE, 'active', _t.id
    ) RETURNING id INTO _plan;

    INSERT INTO public.treatment_plan_schedule (
      plan_id, task_name, instructions, cadence, days_of_week, time_of_day, step_order
    )
    SELECT _plan, s.task_name, s.instructions, s.cadence, s.days_of_week, s.time_of_day, s.step_order
    FROM public.treatment_plan_template_steps s
    WHERE s.template_id = _t.id;

    FOREACH _wk IN ARRAY COALESCE(_t.milestone_weeks, '{}'::smallint[]) LOOP
      INSERT INTO public.treatment_plan_milestones (plan_id, week_number, title, prompt_photo)
      VALUES (_plan, _wk, 'Length check photo', true);
    END LOOP;
  END IF;

  UPDATE public.treatment_plan_assignments
     SET status = 'accepted',
         plan_id = _plan,
         accepted_at = now(),
         plan_consent_granted_at = now(),
         declined_at = NULL
   WHERE id = _assignment_id;

  RETURN _plan;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_treatment_assignment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_treatment_assignment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_treatment_assignment(_assignment_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.treatment_plan_assignments
     SET status = 'declined', declined_at = now()
   WHERE id = _assignment_id AND client_user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.decline_treatment_assignment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.decline_treatment_assignment(uuid) TO authenticated;

-- Media consent: separate decision, reversible, never deletes anything.
CREATE OR REPLACE FUNCTION public.set_treatment_media_consent(_assignment_id uuid, _on boolean)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.treatment_plan_assignments
     SET media_sharing_consent = _on,
         media_consent_granted_at = CASE WHEN _on THEN now() ELSE media_consent_granted_at END,
         media_consent_revoked_at = CASE WHEN _on THEN NULL ELSE now() END
   WHERE id = _assignment_id AND client_user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.set_treatment_media_consent(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_treatment_media_consent(uuid, boolean) TO authenticated;

-- Email invites resolve when the person joins / next signs in.
CREATE OR REPLACE FUNCTION public.claim_my_treatment_invites()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _email text; _n integer := 0;
BEGIN
  IF _me IS NULL THEN RETURN 0; END IF;
  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = _me;
  IF _email IS NULL THEN RETURN 0; END IF;
  UPDATE public.treatment_plan_assignments
     SET client_user_id = _me
   WHERE client_user_id IS NULL
     AND lower(invited_email) = _email;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_my_treatment_invites() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_my_treatment_invites() TO authenticated;

-- ============================================================
-- Professional-side client list. Returns raw schedule/entry data so the
-- existing TypeScript schedule engine does the adherence maths.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pro_treatment_clients()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'assignment_id', a.id,
      'created_at', a.created_at,
      'status', a.status,
      'invited_email', a.invited_email,
      'media_sharing_consent', a.media_sharing_consent,
      'client_user_id', a.client_user_id,
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
  ) q;
$$;
REVOKE ALL ON FUNCTION public.pro_treatment_clients() FROM public;
GRANT EXECUTE ON FUNCTION public.pro_treatment_clients() TO authenticated;

-- Find or create the client_pro chat thread the caller shares with a client.
CREATE OR REPLACE FUNCTION public.treatment_client_thread(_client_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _id uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.treatment_plan_assignments a
    WHERE a.client_user_id = _client_user_id
      AND a.status = 'accepted'
      AND (a.professional_id = _me OR a.assigner_user_id = _me)
  ) THEN
    RAISE EXCEPTION 'No accepted plan with this client';
  END IF;

  SELECT id INTO _id FROM public.chat_threads
   WHERE thread_type = 'client_pro' AND pro_user_id = _me AND consumer_id = _client_user_id
   ORDER BY last_message_at DESC NULLS LAST LIMIT 1;

  IF _id IS NULL THEN
    INSERT INTO public.chat_threads (thread_type, pro_user_id, consumer_id)
    VALUES ('client_pro', _me, _client_user_id)
    RETURNING id INTO _id;
  END IF;

  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.treatment_client_thread(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.treatment_client_thread(uuid) TO authenticated;