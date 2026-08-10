
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
