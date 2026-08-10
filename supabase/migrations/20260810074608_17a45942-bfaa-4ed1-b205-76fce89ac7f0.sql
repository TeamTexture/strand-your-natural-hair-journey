DROP FUNCTION IF EXISTS public.treatment_reminders_due(timestamptz);

CREATE FUNCTION public.treatment_reminders_due(_now timestamptz)
RETURNS TABLE (
  plan_id uuid,
  user_id uuid,
  plan_title text,
  frequency text,
  local_date date,
  week_number integer,
  week_start date,
  week_end date,
  steps_logged integer,
  due_tasks text[],
  due_outstanding integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (
    SELECT t.id,
           t.user_id,
           t.title,
           t.reminder_frequency AS freq,
           (_now AT TIME ZONE COALESCE(NULLIF(t.reminder_timezone,''), 'Europe/London')) AS local_ts,
           t.reminder_weekday AS wd,
           t.reminder_hour AS hr,
           t.start_date,
           t.duration_weeks
    FROM public.treatment_plans t
    JOIN public.email_preferences ep
      ON ep.user_id = t.user_id AND ep.treatment_checkin_reminders = true
    WHERE t.status = 'active'
      AND t.reminder_frequency <> 'off'
  ), d AS (
    SELECT p.*,
           p.local_ts::date AS ld,
           (floor((p.local_ts::date - p.start_date) / 7) + 1)::int AS wk,
           (p.start_date + ((floor((p.local_ts::date - p.start_date)/7)) * 7)::int)::date AS ws,
           (p.start_date + ((floor((p.local_ts::date - p.start_date)/7)) * 7 + 6)::int)::date AS we
    FROM p
    WHERE extract(hour FROM p.local_ts)::int = p.hr
      AND p.local_ts::date >= p.start_date
      AND (p.freq = 'daily' OR extract(dow FROM p.local_ts)::int = p.wd)
  ), due AS (
    -- Steps due on the reminder's own local day, in the member's chosen order.
    SELECT d.id AS plan_id,
           s.id AS schedule_id,
           s.task_name,
           s.step_order,
           s.time_of_day
    FROM d
    JOIN public.treatment_plan_schedule s ON s.plan_id = d.id
    WHERE (
      s.cadence = 'daily'
      OR (s.cadence = 'specific_days'
          AND s.days_of_week IS NOT NULL
          AND extract(dow FROM d.ld)::int = ANY (s.days_of_week))
      OR (s.cadence = 'weekly'
          AND extract(dow FROM d.ld)::int = extract(dow FROM d.start_date)::int)
    )
  ), agg AS (
    SELECT due.plan_id,
           array_agg(DISTINCT due.task_name) AS tasks
    FROM due
    GROUP BY due.plan_id
  ), outstanding AS (
    SELECT d.id AS plan_id,
           count(*) FILTER (
             WHERE NOT EXISTS (
               SELECT 1 FROM public.treatment_plan_entries e
               WHERE e.schedule_id = due.schedule_id
                 AND e.entry_date = d.ld
             )
           )::int AS remaining
    FROM d
    LEFT JOIN due ON due.plan_id = d.id
    GROUP BY d.id
  )
  SELECT d.id,
         d.user_id,
         d.title,
         d.freq,
         d.ld,
         d.wk,
         d.ws,
         d.we,
         (SELECT count(*) FROM public.treatment_plan_entries e
           WHERE e.plan_id = d.id
             AND e.status = 'completed'
             AND e.entry_date BETWEEN d.ws AND d.we)::int,
         COALESCE(agg.tasks, ARRAY[]::text[]),
         COALESCE(outstanding.remaining, 0)
  FROM d
  LEFT JOIN agg ON agg.plan_id = d.id
  LEFT JOIN outstanding ON outstanding.plan_id = d.id
  WHERE d.wk BETWEEN 1 AND d.duration_weeks;
$$;

REVOKE ALL ON FUNCTION public.treatment_reminders_due(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treatment_reminders_due(timestamptz) TO service_role;