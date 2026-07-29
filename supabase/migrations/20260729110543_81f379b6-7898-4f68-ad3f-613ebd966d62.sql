-- 1. Product marketed purpose
DO $$ BEGIN
  CREATE TYPE public.product_marketed_purpose AS ENUM (
    'dry_hair','damaged_hair','colour_treated','greasy_oily',
    'general_all_hair_types','moisture','repair','clarifying'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS marketed_purpose public.product_marketed_purpose;

-- 2. Tips density preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tips_level text NOT NULL DEFAULT 'detailed',
  ADD COLUMN IF NOT EXISTS tips_level_prompted_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_tips_level_check CHECK (tips_level IN ('essential','detailed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Listing tiers
DO $$ BEGIN
  CREATE TYPE public.pro_listing_tier AS ENUM ('full','listed_enquiry','external_link');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS listing_tier public.pro_listing_tier NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS referral_fee_percent numeric(5,2);

ALTER TABLE public.professionals_directory
  ADD COLUMN IF NOT EXISTS listing_tier public.pro_listing_tier NOT NULL DEFAULT 'external_link',
  ADD COLUMN IF NOT EXISTS referral_fee_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS contact_email text;

-- 4. Referral click log
CREATE TABLE IF NOT EXISTS public.pro_referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pro_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  directory_id uuid REFERENCES public.professionals_directory(id) ON DELETE CASCADE,
  target_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pro_referral_clicks TO authenticated;
GRANT ALL ON public.pro_referral_clicks TO service_role;
ALTER TABLE public.pro_referral_clicks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users log own referral clicks" ON public.pro_referral_clicks
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read referral clicks" ON public.pro_referral_clicks
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_pro_referral_clicks_pro ON public.pro_referral_clicks(pro_user_id);
CREATE INDEX IF NOT EXISTS idx_pro_referral_clicks_dir ON public.pro_referral_clicks(directory_id);

-- 5. Referral attributions
CREATE TABLE IF NOT EXISTS public.pro_referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pro_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  directory_id uuid REFERENCES public.professionals_directory(id) ON DELETE CASCADE,
  enquiry_id uuid REFERENCES public.pro_enquiries(id) ON DELETE SET NULL,
  appointment_id uuid,
  event_type text NOT NULL DEFAULT 'booking',
  booking_value numeric(10,2),
  amount_owed numeric(10,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pro_referral_attributions TO authenticated;
GRANT ALL ON public.pro_referral_attributions TO service_role;
ALTER TABLE public.pro_referral_attributions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.pro_referral_attributions
    ADD CONSTRAINT pro_referral_attributions_event_type_check
    CHECK (event_type IN ('enquiry','booking','click'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users log own attribution events" ON public.pro_referral_attributions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = consumer_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read attributions" ON public.pro_referral_attributions
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins update attributions" ON public.pro_referral_attributions
    FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins insert attributions" ON public.pro_referral_attributions
    FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_pro_referral_attr_pro ON public.pro_referral_attributions(pro_user_id);
CREATE INDEX IF NOT EXISTS idx_pro_referral_attr_dir ON public.pro_referral_attributions(directory_id);

DO $$ BEGIN
  CREATE TRIGGER set_pro_referral_attributions_updated_at
    BEFORE UPDATE ON public.pro_referral_attributions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;