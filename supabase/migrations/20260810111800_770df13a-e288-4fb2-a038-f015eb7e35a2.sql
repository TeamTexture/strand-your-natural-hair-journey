ALTER TABLE public.treatment_plans
  ADD COLUMN IF NOT EXISTS checkin_every_weeks integer NOT NULL DEFAULT 1;

ALTER TABLE public.treatment_plans
  ADD CONSTRAINT treatment_plans_checkin_every_weeks_allowed
  CHECK (checkin_every_weeks IN (1, 2, 4));