
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS treatment_weekly_digest boolean NOT NULL DEFAULT true;

-- Which plans are due a weekly check-in nudge today.
CREATE OR REPLACE FUNCTION public.treatment_checkin_nudge_due(_today date)
RETURNS TABLE (
  plan_id uuid,
  user_id uuid,
  plan_title text,
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
  WITH w AS (
    SELECT p.id,
           p.user_id,
           p.title,
           (floor((_today - p.start_date) / 7) + 1)::int AS wk,
           (p.start_date + ((floor((_today - p.start_date) / 7)) * 7)::int)::date AS ws,
           (p.start_date + ((floor((_today - p.start_date) / 7)) * 7 + 6)::int)::date AS we,
           p.duration_weeks
    FROM public.treatment_plans p
    WHERE p.status = 'active'
      AND p.start_date <= _today
  )
  SELECT w.id,
         w.user_id,
         w.title,
         w.wk,
         w.ws,
         w.we,
         (SELECT count(*) FROM public.treatment_plan_entries e
           WHERE e.plan_id = w.id
             AND e.status = 'completed'
             AND e.entry_date BETWEEN w.ws AND w.we)::int
  FROM w
  JOIN public.email_preferences ep
    ON ep.user_id = w.user_id AND ep.treatment_checkin_reminders = true
  WHERE w.we = _today
    AND w.wk >= 1
    AND w.wk <= w.duration_weeks
    AND NOT EXISTS (
      SELECT 1 FROM public.treatment_plan_checkins c
      WHERE c.plan_id = w.id AND c.week_number = w.wk AND c.submitted_at IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.treatment_checkin_nudge_due(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treatment_checkin_nudge_due(date) TO service_role;

-- Recipients of the weekly professional/admin digest.
CREATE OR REPLACE FUNCTION public.treatment_digest_recipients()
RETURNS TABLE (user_id uuid, is_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.user_id, u.is_admin
  FROM (
    SELECT pp.user_id AS user_id, false AS is_admin
    FROM public.treatment_plan_assignments a
    JOIN public.pro_profiles pp ON pp.id = a.professional_id
    WHERE a.status = 'accepted' AND pp.user_id IS NOT NULL
    UNION
    SELECT a.assigner_user_id AS user_id, true AS is_admin
    FROM public.treatment_plan_assignments a
    WHERE a.status = 'accepted'
      AND a.assigner_type = 'admin'
      AND a.assigner_user_id IS NOT NULL
      AND public.has_role(a.assigner_user_id, 'admin')
  ) u
  JOIN public.email_preferences ep
    ON ep.user_id = u.user_id AND ep.treatment_weekly_digest = true;
$$;

REVOKE ALL ON FUNCTION public.treatment_digest_recipients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treatment_digest_recipients() TO service_role;

-- Per-recipient digest. Only clients this recipient has accepted-assignment
-- access to. Counts and names only, never check-in content.
CREATE OR REPLACE FUNCTION public.treatment_digest_for_recipient(
  _recipient uuid,
  _week_start date,
  _week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clients int;
  _checked jsonb;
  _quiet jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _noop() ON COMMIT DROP;

  WITH scope AS (
    SELECT DISTINCT a.plan_id, a.client_user_id
    FROM public.treatment_plan_assignments a
    LEFT JOIN public.pro_profiles pp ON pp.id = a.professional_id
    JOIN public.treatment_plans p ON p.id = a.plan_id
    WHERE a.status = 'accepted'
      AND a.client_user_id IS NOT NULL
      AND p.status = 'active'
      AND (
        pp.user_id = _recipient
        OR (a.assigner_type = 'admin' AND a.assigner_user_id = _recipient
            AND public.has_role(_recipient, 'admin'))
      )
  ), named AS (
    SELECT s.plan_id,
           s.client_user_id,
           COALESCE(pr.display_name, 'A member') AS name,
           EXISTS (
             SELECT 1 FROM public.treatment_plan_checkins c
             WHERE c.plan_id = s.plan_id
               AND c.submitted_at IS NOT NULL
               AND c.submitted_at::date BETWEEN _week_start AND _week_end
           ) AS checked_in,
           (SELECT max(e.entry_date) FROM public.treatment_plan_entries e
              WHERE e.plan_id = s.plan_id AND e.status = 'completed') AS last_entry
    FROM scope s
    LEFT JOIN public.profiles pr ON pr.user_id = s.client_user_id
  )
  SELECT count(DISTINCT client_user_id)::int,
         COALESCE(jsonb_agg(DISTINCT jsonb_build_object('name', name))
                  FILTER (WHERE checked_in), '[]'::jsonb),
         COALESCE(jsonb_agg(jsonb_build_object(
                    'name', name,
                    'days', CASE WHEN last_entry IS NULL THEN NULL
                                 ELSE (_week_end - last_entry) END))
                  FILTER (WHERE NOT checked_in), '[]'::jsonb)
  INTO _clients, _checked, _quiet
  FROM named;

  RETURN jsonb_build_object(
    'clients_total', COALESCE(_clients, 0),
    'checked_in', COALESCE(_checked, '[]'::jsonb),
    'quiet', COALESCE(_quiet, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.treatment_digest_for_recipient(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treatment_digest_for_recipient(uuid, date, date) TO service_role;
