CREATE TABLE public.wash_day_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  scheduled_time text,
  google_calendar_state text NOT NULL DEFAULT 'not_asked'
    CHECK (google_calendar_state IN ('not_asked','confirmed','declined')),
  google_calendar_asked_at timestamptz,
  google_calendar_answered_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled')),
  completed_wash_day_id uuid REFERENCES public.wash_days(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wash_day_schedules TO authenticated;
GRANT ALL ON public.wash_day_schedules TO service_role;

ALTER TABLE public.wash_day_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own wash day schedules"
  ON public.wash_day_schedules FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members insert own wash day schedules"
  ON public.wash_day_schedules FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members update own wash day schedules"
  ON public.wash_day_schedules FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members delete own wash day schedules"
  ON public.wash_day_schedules FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX wash_day_schedules_active_unique
  ON public.wash_day_schedules (user_id, scheduled_date)
  WHERE status = 'scheduled';

CREATE INDEX wash_day_schedules_user_date_idx
  ON public.wash_day_schedules (user_id, scheduled_date);

CREATE TRIGGER wash_day_schedules_set_updated_at
  BEFORE UPDATE ON public.wash_day_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.complete_wash_day_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wash_day_schedules s
     SET status = 'completed',
         completed_wash_day_id = NEW.id
   WHERE s.user_id = NEW.user_id
     AND s.status = 'scheduled'
     AND s.scheduled_date BETWEEN (NEW.wash_date - INTERVAL '2 days')::date
                              AND (NEW.wash_date + INTERVAL '2 days')::date;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_wash_day_schedule() FROM PUBLIC;

CREATE TRIGGER wash_days_complete_schedule
  AFTER INSERT ON public.wash_days
  FOR EACH ROW EXECUTE FUNCTION public.complete_wash_day_schedule();