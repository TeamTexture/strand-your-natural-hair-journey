-- 1. Account-level international block flags on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS international_block boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_checked_at timestamptz;

-- Existing accounts are grandfathered: never geo-check a member who is already in.
UPDATE public.profiles SET geo_checked_at = now() WHERE geo_checked_at IS NULL;

-- 2. Reuse country_waitlist for registered-but-blocked accounts
ALTER TABLE public.country_waitlist
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS klaviyo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS klaviyo_error text;

CREATE UNIQUE INDEX IF NOT EXISTS country_waitlist_user_id_key
  ON public.country_waitlist (user_id) WHERE user_id IS NOT NULL;

-- 3. Admin-only reads (matches the pattern used elsewhere)
DROP POLICY IF EXISTS "Admins read country waitlist" ON public.country_waitlist;
CREATE POLICY "Admins read country waitlist"
  ON public.country_waitlist FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE INSERT ON public.country_waitlist FROM anon;
GRANT SELECT ON public.country_waitlist TO authenticated;
GRANT ALL ON public.country_waitlist TO service_role;