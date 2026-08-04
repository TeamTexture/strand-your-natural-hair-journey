-- The vendor registry was the wrong model: at-home blood test providers are
-- brands and belong in the existing brand directory. Remove it entirely.
DROP TABLE IF EXISTS public.blood_test_vendors CASCADE;

-- Capability flags on the existing brand listing table, mirroring the
-- professional claim-vs-verified split exactly.
ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS offers_at_home_blood_tests_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_at_home_blood_tests_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blood_tests_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS blood_tests_verified_by uuid;

-- A brand may never write its own verification columns.
CREATE OR REPLACE FUNCTION public.brand_profiles_lock_blood_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.offers_at_home_blood_tests_verified := OLD.offers_at_home_blood_tests_verified;
  NEW.blood_tests_verified_at := OLD.blood_tests_verified_at;
  NEW.blood_tests_verified_by := OLD.blood_tests_verified_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brand_profiles_lock_blood_verification ON public.brand_profiles;
CREATE TRIGGER trg_brand_profiles_lock_blood_verification
  BEFORE UPDATE ON public.brand_profiles
  FOR EACH ROW EXECUTE FUNCTION public.brand_profiles_lock_blood_verification();

-- Repeating panels get their own child table rather than being crammed into
-- the brand row.
CREATE TABLE IF NOT EXISTS public.brand_blood_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  panel_name text NOT NULL,
  markers_covered text[] NOT NULL DEFAULT '{}',
  price_from numeric(10,2),
  currency text NOT NULL DEFAULT 'GBP',
  purchase_url text NOT NULL,
  affiliate_url text,
  regions_served text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_blood_panels_purchase_https CHECK (purchase_url ~ '^https://'),
  CONSTRAINT brand_blood_panels_affiliate_https CHECK (affiliate_url IS NULL OR affiliate_url ~ '^https://')
);

CREATE INDEX IF NOT EXISTS brand_blood_panels_brand_idx
  ON public.brand_blood_panels (brand_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_blood_panels TO authenticated;
GRANT ALL ON public.brand_blood_panels TO service_role;

ALTER TABLE public.brand_blood_panels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brands manage own blood panels"
  ON public.brand_blood_panels
  FOR ALL
  TO authenticated
  USING (brand_user_id = auth.uid())
  WITH CHECK (brand_user_id = auth.uid());

CREATE POLICY "Admins manage blood panels"
  ON public.brand_blood_panels
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Members read panels ONLY from verified brands whose listing is live.
CREATE POLICY "Members read verified live blood panels"
  ON public.brand_blood_panels
  FOR SELECT
  TO authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.brand_profiles b
      WHERE b.user_id = brand_blood_panels.brand_user_id
        AND b.offers_at_home_blood_tests_verified
        AND public.has_active_brand_subscription(b.user_id)
    )
  );

CREATE TRIGGER trg_brand_blood_panels_updated
  BEFORE UPDATE ON public.brand_blood_panels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Members must also be able to read the brand's name and logo for a verified
-- blood-capable brand even when it has no live advert running.
CREATE POLICY "Verified blood test brands readable"
  ON public.brand_profiles
  FOR SELECT
  TO authenticated
  USING (
    offers_at_home_blood_tests_verified
    AND public.has_active_brand_subscription(user_id)
  );

-- Admin-only verification switch.
CREATE OR REPLACE FUNCTION public.set_brand_blood_verification(
  _brand_user_id uuid,
  _verified boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin may verify blood test capability';
  END IF;

  UPDATE public.brand_profiles
     SET offers_at_home_blood_tests_verified = _verified,
         blood_tests_verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
         blood_tests_verified_by = CASE WHEN _verified THEN auth.uid() ELSE NULL END,
         updated_at = now()
   WHERE user_id = _brand_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_brand_blood_verification(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_brand_blood_verification(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_brand_blood_verification(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.brand_profiles_lock_blood_verification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.brand_profiles_lock_blood_verification() FROM anon;