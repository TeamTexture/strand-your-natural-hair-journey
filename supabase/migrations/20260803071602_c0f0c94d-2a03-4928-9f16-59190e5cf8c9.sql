ALTER TABLE public.user_style_profile
  ADD COLUMN IF NOT EXISTS current_style_tension text,
  ADD COLUMN IF NOT EXISTS current_style_extensions boolean,
  ADD COLUMN IF NOT EXISTS planned_style_tension text,
  ADD COLUMN IF NOT EXISTS planned_style_extensions boolean;

ALTER TABLE public.user_style_profile
  DROP CONSTRAINT IF EXISTS user_style_profile_current_style_tension_check;
ALTER TABLE public.user_style_profile
  ADD CONSTRAINT user_style_profile_current_style_tension_check
  CHECK (current_style_tension IS NULL OR current_style_tension IN ('low','high'));

ALTER TABLE public.user_style_profile
  DROP CONSTRAINT IF EXISTS user_style_profile_planned_style_tension_check;
ALTER TABLE public.user_style_profile
  ADD CONSTRAINT user_style_profile_planned_style_tension_check
  CHECK (planned_style_tension IS NULL OR planned_style_tension IN ('low','high'));