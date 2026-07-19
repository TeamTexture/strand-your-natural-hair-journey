
CREATE TABLE public.blood_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  panel_date date NOT NULL DEFAULT current_date,
  label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blood_panels TO authenticated;
GRANT ALL ON public.blood_panels TO service_role;

ALTER TABLE public.blood_panels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own blood panels"
  ON public.blood_panels FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER blood_panels_set_updated_at
  BEFORE UPDATE ON public.blood_panels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX blood_panels_user_date_idx
  ON public.blood_panels(user_id, panel_date DESC);

-- Link results to panels
ALTER TABLE public.blood_results
  ADD COLUMN panel_id uuid REFERENCES public.blood_panels(id) ON DELETE CASCADE;

CREATE INDEX blood_results_panel_id_idx ON public.blood_results(panel_id);

-- Backfill: one "Initial panel" per user for existing results
DO $$
DECLARE
  u RECORD;
  new_panel_id uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.blood_results WHERE panel_id IS NULL LOOP
    INSERT INTO public.blood_panels(user_id, panel_date, label)
    VALUES (u.user_id, current_date, 'Initial panel')
    RETURNING id INTO new_panel_id;

    UPDATE public.blood_results
      SET panel_id = new_panel_id
      WHERE user_id = u.user_id AND panel_id IS NULL;
  END LOOP;
END $$;
