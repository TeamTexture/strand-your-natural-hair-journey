ALTER TABLE public.user_style_profile
  ADD COLUMN IF NOT EXISTS main_photo_id uuid
  REFERENCES public.user_milestone_photos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.user_style_profile.main_photo_id IS
  'Optional override for the Current style card image. NULL = auto mode: use the newest user_milestone_photos row (taken_on desc nulls last, created_at desc).';