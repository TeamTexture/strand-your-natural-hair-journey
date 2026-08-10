ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS treatment_plan_id uuid REFERENCES public.treatment_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_treatment_plan_id_idx
  ON public.appointments (treatment_plan_id) WHERE treatment_plan_id IS NOT NULL;