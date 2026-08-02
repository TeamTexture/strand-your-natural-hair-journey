DO $$ BEGIN
  CREATE TYPE public.pro_profile_review_status AS ENUM ('draft','submitted','approved','changes_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS profile_review_status public.pro_profile_review_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

UPDATE public.pro_profiles
  SET profile_review_status = 'approved'
  WHERE is_published = true;

-- Professionals may update their own profile content (existing behaviour relied
-- on an admin-only write policy plus service paths); make it explicit and allow
-- them to move their own profile between draft and submitted only.
DROP POLICY IF EXISTS "Pro updates own profile" ON public.pro_profiles;
CREATE POLICY "Pro updates own profile"
  ON public.pro_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND profile_review_status IN ('draft','submitted','changes_requested')
  );

GRANT SELECT, UPDATE ON public.pro_profiles TO authenticated;
GRANT ALL ON public.pro_profiles TO service_role;