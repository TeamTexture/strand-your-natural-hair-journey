ALTER TABLE public.wash_days
  ADD COLUMN IF NOT EXISTS style_extensions boolean,
  ADD COLUMN IF NOT EXISTS style_tension text,
  ADD COLUMN IF NOT EXISTS style_other_note text,
  ADD COLUMN IF NOT EXISTS style_other_voice_url text;

ALTER TABLE public.wash_days
  ADD CONSTRAINT wash_days_style_tension_check
  CHECK (style_tension IS NULL OR style_tension IN ('low','medium','high'));