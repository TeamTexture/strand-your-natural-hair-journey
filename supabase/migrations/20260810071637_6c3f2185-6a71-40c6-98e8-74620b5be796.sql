ALTER TABLE public.treatment_plans
  ADD COLUMN IF NOT EXISTS reminder_frequency text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS reminder_weekday smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_hour smallint NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS reminder_timezone text NOT NULL DEFAULT 'Europe/London';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_reminder_frequency_chk'
  ) THEN
    ALTER TABLE public.treatment_plans
      ADD CONSTRAINT treatment_plans_reminder_frequency_chk
      CHECK (reminder_frequency IN ('off','daily','weekly'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_reminder_slot_chk'
  ) THEN
    ALTER TABLE public.treatment_plans
      ADD CONSTRAINT treatment_plans_reminder_slot_chk
      CHECK (reminder_weekday BETWEEN 0 AND 6 AND reminder_hour BETWEEN 0 AND 23);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.treatment_reminders_due(_now timestamptz)
RETURNS TABLE (
  plan_id uuid,
  user_id uuid,
  plan_title text,
  frequency text,
  local_date date,
  week_number integer,
  week_start date,
  week_end date,
  steps_logged integer
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
             AND e.entry_date BETWEEN d.ws AND d.we)::int
  FROM d
  WHERE d.wk BETWEEN 1 AND d.duration_weeks;
$$;

REVOKE ALL ON FUNCTION public.treatment_reminders_due(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treatment_reminders_due(timestamptz) TO service_role;