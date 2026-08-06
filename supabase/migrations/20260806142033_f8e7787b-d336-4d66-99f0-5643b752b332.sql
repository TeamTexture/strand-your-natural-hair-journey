ALTER TABLE public.brand_blood_panels
  ALTER COLUMN brand_user_id DROP NOT NULL,
  ALTER COLUMN panel_name DROP NOT NULL,
  ALTER COLUMN purchase_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS vendor_website text,
  ADD COLUMN IF NOT EXISTS vendor_logo_path text,
  ADD COLUMN IF NOT EXISTS is_at_home_kit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_details text;

ALTER TABLE public.brand_blood_panels DROP CONSTRAINT IF EXISTS brand_blood_panels_purchase_https;
ALTER TABLE public.brand_blood_panels
  ADD CONSTRAINT brand_blood_panels_purchase_https
  CHECK (purchase_url IS NULL OR purchase_url ~ '^https://');

ALTER TABLE public.brand_blood_panels
  ADD CONSTRAINT brand_blood_panels_owner_present
  CHECK (brand_user_id IS NOT NULL OR nullif(btrim(vendor_name), '') IS NOT NULL);

ALTER TABLE public.brand_blood_panels
  ADD CONSTRAINT brand_blood_panels_vendor_website_https
  CHECK (vendor_website IS NULL OR vendor_website ~ '^https://');

GRANT SELECT ON public.brand_blood_panels TO anon;

DROP POLICY IF EXISTS "Curated vendor panels are publicly readable" ON public.brand_blood_panels;
CREATE POLICY "Curated vendor panels are publicly readable"
  ON public.brand_blood_panels FOR SELECT
  TO anon, authenticated
  USING (is_active AND brand_user_id IS NULL);