
-- brand_profiles
CREATE TABLE public.brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  contact_name text,
  website text,
  logo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_profiles TO authenticated;
GRANT ALL ON public.brand_profiles TO service_role;
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brands manage own profile" ON public.brand_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_brand_profiles_updated
  BEFORE UPDATE ON public.brand_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Offer status + slot enums
CREATE TYPE public.brand_offer_status AS ENUM (
  'draft','under_review','approved_unpaid','paid_scheduled','live','ended','rejected','cancelled'
);
CREATE TYPE public.brand_placement_slot AS ENUM ('home','products','wash_day');

-- brand_offers
CREATE TABLE public.brand_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  headline text NOT NULL,
  body_copy text,
  discount_code text,
  external_url text,
  hero_image_path text,
  status public.brand_offer_status NOT NULL DEFAULT 'draft',
  total_price_pence integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'gbp',
  stripe_session_id text,
  stripe_payment_intent_id text,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  rejection_reason text,
  paid_at timestamptz,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_offers TO authenticated;
GRANT SELECT ON public.brand_offers TO anon;
GRANT ALL ON public.brand_offers TO service_role;
ALTER TABLE public.brand_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand owns offers" ON public.brand_offers
  FOR ALL TO authenticated
  USING (brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Live offers publicly readable" ON public.brand_offers
  FOR SELECT TO authenticated, anon
  USING (
    status = 'live'
    AND starts_on <= CURRENT_DATE
    AND ends_on >= CURRENT_DATE
  );

CREATE TRIGGER trg_brand_offers_updated
  BEFORE UPDATE ON public.brand_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_brand_offers_status ON public.brand_offers(status);
CREATE INDEX idx_brand_offers_brand_user ON public.brand_offers(brand_user_id);

-- brand_offer_placements
CREATE TABLE public.brand_offer_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  slot public.brand_placement_slot NOT NULL,
  placement_date date NOT NULL,
  daily_rate_pence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_offer_placements TO authenticated;
GRANT SELECT ON public.brand_offer_placements TO anon;
GRANT ALL ON public.brand_offer_placements TO service_role;
ALTER TABLE public.brand_offer_placements ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_placements_slot_date ON public.brand_offer_placements(slot, placement_date);
CREATE INDEX idx_placements_offer ON public.brand_offer_placements(offer_id);

CREATE OR REPLACE FUNCTION public.brand_placement_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_status public.brand_offer_status;
BEGIN
  SELECT status INTO new_status FROM public.brand_offers WHERE id = NEW.offer_id;
  IF new_status IN ('approved_unpaid','paid_scheduled','live') THEN
    IF EXISTS (
      SELECT 1 FROM public.brand_offer_placements p
      JOIN public.brand_offers o ON o.id = p.offer_id
      WHERE p.slot = NEW.slot
        AND p.placement_date = NEW.placement_date
        AND p.id <> NEW.id
        AND o.status IN ('approved_unpaid','paid_scheduled','live')
    ) THEN
      RAISE EXCEPTION 'Placement slot % on % is already booked', NEW.slot, NEW.placement_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.brand_placement_no_overlap() FROM PUBLIC, anon;

CREATE TRIGGER trg_brand_placement_no_overlap
  BEFORE INSERT OR UPDATE ON public.brand_offer_placements
  FOR EACH ROW EXECUTE FUNCTION public.brand_placement_no_overlap();

CREATE POLICY "Brand manages own placements" ON public.brand_offer_placements
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = offer_id AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = offer_id AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

CREATE POLICY "Placements of live offers readable" ON public.brand_offer_placements
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (SELECT 1 FROM public.brand_offers o
            WHERE o.id = offer_id AND o.status = 'live'
              AND o.starts_on <= CURRENT_DATE AND o.ends_on >= CURRENT_DATE)
  );

-- brand_products
CREATE TABLE public.brand_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('linked','ai_generated')),
  linked_product_id uuid,
  source_url text,
  name text NOT NULL,
  description text,
  image_urls text[] DEFAULT '{}'::text[],
  ingredients text[] DEFAULT '{}'::text[],
  external_url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_products TO authenticated;
GRANT SELECT ON public.brand_products TO anon;
GRANT ALL ON public.brand_products TO service_role;
ALTER TABLE public.brand_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand manages own products" ON public.brand_products
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = offer_id AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = offer_id AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

CREATE POLICY "Live offer products readable" ON public.brand_products
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (SELECT 1 FROM public.brand_offers o
            WHERE o.id = offer_id AND o.status = 'live'
              AND o.starts_on <= CURRENT_DATE AND o.ends_on >= CURRENT_DATE)
  );

CREATE TRIGGER trg_brand_products_updated
  BEFORE UPDATE ON public.brand_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- brand_offer_stats
CREATE TABLE public.brand_offer_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  slot public.brand_placement_slot,
  stat_date date NOT NULL DEFAULT CURRENT_DATE,
  impressions integer NOT NULL DEFAULT 0,
  taps integer NOT NULL DEFAULT 0,
  wishlist_adds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, slot, stat_date)
);
GRANT SELECT, INSERT, UPDATE ON public.brand_offer_stats TO authenticated;
GRANT ALL ON public.brand_offer_stats TO service_role;
ALTER TABLE public.brand_offer_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand reads own stats" ON public.brand_offer_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = offer_id AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

CREATE POLICY "Anyone signed in can increment stats" ON public.brand_offer_stats
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.brand_offers o
            WHERE o.id = offer_id AND o.status IN ('live','ended'))
  );

CREATE POLICY "Anyone signed in can update stats" ON public.brand_offer_stats
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.brand_offers o
            WHERE o.id = offer_id AND o.status IN ('live','ended'))
  );

CREATE TRIGGER trg_brand_offer_stats_updated
  BEFORE UPDATE ON public.brand_offer_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_brand_offer_stats_offer_date ON public.brand_offer_stats(offer_id, stat_date);

-- Default placement rates (in pence)
INSERT INTO public.platform_settings (key, value)
VALUES
  ('brand_rate_home_pence', to_jsonb(7500)),
  ('brand_rate_products_pence', to_jsonb(5000)),
  ('brand_rate_wash_day_pence', to_jsonb(10000))
ON CONFLICT (key) DO NOTHING;
