CREATE TABLE public.curated_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name text NOT NULL,
  title text NOT NULL,
  description text,
  discount_code text,
  external_url text,
  image_path text,
  starts_on date,
  ends_on date,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  hidden_at timestamp with time zone,
  hidden_by uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curated_offers TO authenticated;
GRANT ALL ON public.curated_offers TO service_role;

ALTER TABLE public.curated_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage curated offers"
ON public.curated_offers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members read live curated offers"
ON public.curated_offers FOR SELECT TO authenticated
USING (
  is_active
  AND hidden_at IS NULL
  AND (starts_on IS NULL OR starts_on <= public.strand_today_london())
  AND (ends_on IS NULL OR ends_on >= public.strand_today_london())
);

CREATE INDEX curated_offers_live_idx
  ON public.curated_offers (is_active, sort_order)
  WHERE hidden_at IS NULL;

CREATE TRIGGER curated_offers_set_updated_at
BEFORE UPDATE ON public.curated_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();