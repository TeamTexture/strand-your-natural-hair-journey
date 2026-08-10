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
$$;