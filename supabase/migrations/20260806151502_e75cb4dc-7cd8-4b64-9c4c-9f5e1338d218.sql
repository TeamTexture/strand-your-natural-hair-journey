DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.user_style_profile'::regclass
     AND contype = 'f'
     AND pg_get_constraintdef(oid) ILIKE '%user_milestone_photos%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_style_profile DROP CONSTRAINT %I', c);
  END IF;
END $$;

COMMENT ON COLUMN public.user_style_profile.main_photo_id IS
  'Optional override for the Current style card image. Points at either user_milestone_photos.id or user_before_photos.id. NULL = auto mode: newest progress photo across both sets.';