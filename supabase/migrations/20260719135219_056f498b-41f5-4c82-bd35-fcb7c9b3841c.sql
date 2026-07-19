ALTER TABLE public.blood_panels
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'logged',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

ALTER TABLE public.blood_panels
  DROP CONSTRAINT IF EXISTS blood_panels_status_check;
ALTER TABLE public.blood_panels
  ADD CONSTRAINT blood_panels_status_check CHECK (status IN ('logged','scheduled'));

CREATE INDEX IF NOT EXISTS blood_panels_user_status_idx
  ON public.blood_panels(user_id, status);