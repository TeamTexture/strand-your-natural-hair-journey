-- 1) platform_settings: admin-only, except an allowlist of public price keys.
REVOKE SELECT ON public.platform_settings FROM anon;

DROP POLICY IF EXISTS "Authenticated read platform settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Anyone reads platform settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Authenticated reads platform settings" ON public.platform_settings;

CREATE POLICY "Admins read all settings; members read public prices"
ON public.platform_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR key IN ('consumer_monthly_price_gbp', 'pro_monthly_price_gbp')
);

-- 2) professionals_directory: verification credentials are admin/server only.
REVOKE SELECT ON public.professionals_directory FROM anon, authenticated;

GRANT SELECT (
  id, name, title, type, clinic_name, address, postcode,
  instagram_handle, website_url, booking_url, bio, specialisms,
  discount_code, discount_description, is_active, created_at,
  listing_tier, referral_fee_percent
) ON public.professionals_directory TO anon, authenticated;

GRANT ALL ON public.professionals_directory TO service_role;
GRANT ALL ON public.platform_settings TO service_role;