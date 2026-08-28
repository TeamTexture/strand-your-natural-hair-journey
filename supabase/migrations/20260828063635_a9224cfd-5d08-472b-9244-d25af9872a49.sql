-- Duration units on treatment plans. Additive only: duration_weeks stays the
-- single value the whole week engine, milestones, check-in cycles and the
-- reminder RPCs read, so nothing existing changes behaviour. These two columns
-- only remember what the member actually typed so the UI can show it back.
ALTER TABLE public.treatment_plans
  ADD COLUMN IF NOT EXISTS duration_value integer,
  ADD COLUMN IF NOT EXISTS duration_unit text NOT NULL DEFAULT 'weeks';

ALTER TABLE public.treatment_plans
  ADD CONSTRAINT treatment_plans_duration_unit_check
  CHECK (duration_unit IN ('days', 'weeks', 'months'));

-- Existing plans were all chosen in weeks.
UPDATE public.treatment_plans
   SET duration_value = duration_weeks
 WHERE duration_value IS NULL;

-- In-app check-in reminder notification.
--
-- The notifications table has no INSERT policy for members (by design), so the
-- client cannot write its own. This definer function lets a member raise ONE
-- notification for a check-in that is genuinely open on HER OWN plan, and is
-- idempotent per (plan, week): calling it on every app open can never stack up
-- rows, which matters because the bell only reads the newest 30.
CREATE OR REPLACE FUNCTION public.ensure_treatment_checkin_notification(
  _plan_id uuid,
  _week integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan record;
  _url text;
  _existing uuid;
BEGIN
  SELECT id, user_id, title INTO _plan
    FROM public.treatment_plans
   WHERE id = _plan_id
     AND user_id = auth.uid()
     AND status = 'active';
  IF _plan.id IS NULL THEN
    RETURN NULL;
  END IF;

  _url := '/treatment/' || _plan_id::text || '/checkin/' || _week::text;

  SELECT id INTO _existing
    FROM public.notifications
   WHERE user_id = _plan.user_id
     AND kind = 'treatment_checkin'
     AND url = _url
   LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  INSERT INTO public.notifications (user_id, kind, entity_type, entity_id, url, title, body)
  VALUES (
    _plan.user_id,
    'treatment_checkin',
    'treatment_plan',
    _plan_id,
    _url,
    CASE WHEN _week = 0 THEN 'Your first check-in is ready'
         ELSE 'Your check-in is ready' END,
    CASE WHEN _week = 0
         THEN 'Day one of ' || COALESCE(_plan.title, 'your plan') || ' — tell us where you are starting from.'
         ELSE 'Week ' || _week::text || ' of ' || COALESCE(_plan.title, 'your plan') || ' — tell us how it has been going.'
    END
  )
  RETURNING id INTO _existing;

  RETURN _existing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_treatment_checkin_notification(uuid, integer) TO authenticated;