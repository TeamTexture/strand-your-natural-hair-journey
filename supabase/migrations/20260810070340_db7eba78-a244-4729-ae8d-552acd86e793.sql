-- 1. Treatment plans: read always, write requires Plus
DROP POLICY IF EXISTS "Clients manage own plans" ON public.treatment_plans;
CREATE POLICY "Clients read own plans" ON public.treatment_plans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Plus clients create own plans" ON public.treatment_plans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Plus clients update own plans" ON public.treatment_plans
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Clients delete own plans" ON public.treatment_plans
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. Entries
DROP POLICY IF EXISTS "Clients manage own plan entries" ON public.treatment_plan_entries;
CREATE POLICY "Clients read own plan entries" ON public.treatment_plan_entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Plus clients write own plan entries" ON public.treatment_plan_entries
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Plus clients update own plan entries" ON public.treatment_plan_entries
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Plus clients delete own plan entries" ON public.treatment_plan_entries
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));

-- 3. Check-ins
DROP POLICY IF EXISTS "Clients manage own checkins" ON public.treatment_plan_checkins;
CREATE POLICY "Clients read own checkins" ON public.treatment_plan_checkins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Plus clients write own checkins" ON public.treatment_plan_checkins
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Plus clients update own checkins" ON public.treatment_plan_checkins
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Plus clients delete own checkins" ON public.treatment_plan_checkins
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));

-- 4. Media — reading and playback survive a lapse; new uploads do not
DROP POLICY IF EXISTS "Clients manage own plan media" ON public.treatment_plan_media;
CREATE POLICY "Clients read own plan media" ON public.treatment_plan_media
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Plus clients upload own plan media" ON public.treatment_plan_media
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Plus clients update own plan media" ON public.treatment_plan_media
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Clients delete own plan media" ON public.treatment_plan_media
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. Pause bookkeeping
ALTER TABLE public.treatment_plans
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text;

-- 6. Accepting an assignment requires active Plus
CREATE OR REPLACE FUNCTION public.accept_treatment_assignment(_assignment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.has_active_plus_subscription(_me) THEN
    RAISE EXCEPTION 'STRAND+ required to accept a treatment plan';
  END IF;

  _plan := _a.plan_id;

  IF _plan IS NULL THEN
    SELECT * INTO _t FROM public.treatment_plan_templates WHERE id = _a.template_id;
    IF _t.id IS NULL THEN RAISE EXCEPTION 'Template no longer available'; END IF;

    INSERT INTO public.treatment_plans (
      user_id, title, goal, duration_weeks, start_date, status,
      source_template_id, professional_id, created_by_user_id
    ) VALUES (
      _me, _t.title, _t.description, _t.duration_weeks, CURRENT_DATE, 'active',
      _t.id, _a.professional_id, COALESCE(_a.assigner_user_id, _a.professional_id)
    ) RETURNING id INTO _plan;

    INSERT INTO public.treatment_plan_schedule (
      plan_id, task_name, instructions, cadence, days_of_week, time_of_day, step_order
    )
    SELECT _plan, s.task_name, s.instructions, s.cadence, s.days_of_week, s.time_of_day, s.step_order
    FROM public.treatment_plan_template_steps s
    WHERE s.template_id = _t.id;

    FOREACH _wk IN ARRAY COALESCE(_t.milestone_weeks, '{}'::smallint[]) LOOP
      IF _wk >= 1 AND _wk <= _t.duration_weeks THEN
        INSERT INTO public.treatment_plan_milestones (plan_id, week_number, label, prompt)
        VALUES (_plan, _wk, 'Length check photo', 'A photo this week so you can see the change later.');
      END IF;
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
$function$;

-- 7. Lapse sweep — pause, never delete
CREATE OR REPLACE FUNCTION public.pause_lapsed_treatment_plans()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  UPDATE public.treatment_plans p
     SET status = 'paused',
         paused_at = now(),
         paused_reason = 'plus_lapsed'
   WHERE p.status = 'active'
     AND NOT public.has_active_plus_subscription(p.user_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

REVOKE ALL ON FUNCTION public.pause_lapsed_treatment_plans() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_lapsed_treatment_plans() TO service_role;

-- 8. Does the signed-in member hold Plus? (self only)
CREATE OR REPLACE FUNCTION public.my_plus_status()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.has_active_plus_subscription(auth.uid()) $function$;
GRANT EXECUTE ON FUNCTION public.my_plus_status() TO authenticated;

-- 9. Expose client Plus status to the professional / admin lists
CREATE OR REPLACE FUNCTION public.pro_treatment_clients()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'assignment_id', a.id,
      'created_at', a.created_at,
      'status', a.status,
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
  ) q;
$function$;