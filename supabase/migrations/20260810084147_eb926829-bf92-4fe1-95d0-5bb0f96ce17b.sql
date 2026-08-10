ALTER TABLE public.treatment_plan_schedule
  ADD COLUMN IF NOT EXISTS start_week integer,
  ADD COLUMN IF NOT EXISTS end_week integer;

CREATE OR REPLACE FUNCTION public.treatment_schedule_week_window_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.start_week IS NOT NULL AND NEW.start_week < 1 THEN
    NEW.start_week := 1;
  END IF;
  IF NEW.end_week IS NOT NULL AND NEW.end_week < 1 THEN
    NEW.end_week := 1;
  END IF;
  IF NEW.start_week IS NOT NULL AND NEW.end_week IS NOT NULL
     AND NEW.end_week < NEW.start_week THEN
    RAISE EXCEPTION 'end_week cannot be before start_week';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS treatment_schedule_week_window ON public.treatment_plan_schedule;
CREATE TRIGGER treatment_schedule_week_window
  BEFORE INSERT OR UPDATE ON public.treatment_plan_schedule
  FOR EACH ROW EXECUTE FUNCTION public.treatment_schedule_week_window_guard();