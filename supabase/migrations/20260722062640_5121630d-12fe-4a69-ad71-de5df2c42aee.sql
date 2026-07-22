-- Add pro_welcome placement slot for professional dashboard banner
ALTER TYPE public.brand_placement_slot ADD VALUE IF NOT EXISTS 'pro_welcome';

-- Register the placeholder rate (£50/day = 5000 pence) alongside existing rates
INSERT INTO public.platform_settings (key, value)
VALUES ('brand_rate_pro_welcome_pence', to_jsonb(5000))
ON CONFLICT (key) DO NOTHING;

-- Extend the aggregated rate map used by the campaign designer
UPDATE public.platform_settings
   SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object('pro_welcome', 5000)
 WHERE key = 'brand_placement_rates';
