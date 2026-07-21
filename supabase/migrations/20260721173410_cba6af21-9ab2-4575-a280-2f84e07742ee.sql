-- Brand offer revisions: pending creative-only edits for already live/scheduled offers.
-- The ORIGINAL offer keeps running to consumers until admin approves the revision,
-- at which point the revision's creative fields replace the live content in place.
-- No Stripe / placements / dates are touched here — that's out of scope for edits.

CREATE TABLE public.brand_offer_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  brand_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','withdrawn','superseded')),
  headline text,
  body_copy text,
  discount_code text,
  external_url text,
  hero_image_path text,
  -- Snapshot of the offer's attached products/tools at revision time; each element
  -- shape matches a brand_products row (name, description, external_url, image_urls,
  -- ingredients, kind, tool_kind, key_features, materials, source_type, source_url,
  -- linked_product_id).
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX brand_offer_revisions_one_pending
  ON public.brand_offer_revisions(offer_id) WHERE status = 'pending';
CREATE INDEX brand_offer_revisions_offer_id_idx ON public.brand_offer_revisions(offer_id);
CREATE INDEX brand_offer_revisions_brand_user_id_idx ON public.brand_offer_revisions(brand_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_offer_revisions TO authenticated;
GRANT ALL ON public.brand_offer_revisions TO service_role;

ALTER TABLE public.brand_offer_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brands read own revisions, admins read all"
  ON public.brand_offer_revisions FOR SELECT
  USING (brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Brands manage own revisions, admins manage all"
  ON public.brand_offer_revisions FOR ALL
  USING (brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_brand_offer_revisions_updated
  BEFORE UPDATE ON public.brand_offer_revisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Submit a new revision for a live/paid_scheduled offer. Supersedes any existing
-- pending revision (latest edit wins). No Stripe involvement.
CREATE OR REPLACE FUNCTION public.submit_brand_offer_revision(
  _offer_id uuid,
  _headline text,
  _body_copy text,
  _discount_code text,
  _external_url text,
  _hero_image_path text,
  _products jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand uuid;
  v_status public.brand_offer_status;
  v_new uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT brand_user_id, status INTO v_brand, v_status
    FROM public.brand_offers WHERE id = _offer_id;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;
  IF v_brand <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not your offer';
  END IF;
  IF v_status NOT IN ('paid_scheduled','live') THEN
    RAISE EXCEPTION 'Only paid-scheduled or live offers use the revision flow';
  END IF;

  -- Latest edit supersedes any earlier pending revision.
  UPDATE public.brand_offer_revisions
    SET status = 'superseded', reviewed_at = now()
    WHERE offer_id = _offer_id AND status = 'pending';

  INSERT INTO public.brand_offer_revisions (
    offer_id, brand_user_id, headline, body_copy, discount_code,
    external_url, hero_image_path, products, status
  ) VALUES (
    _offer_id, v_brand, _headline, _body_copy, _discount_code,
    _external_url, _hero_image_path, COALESCE(_products, '[]'::jsonb), 'pending'
  ) RETURNING id INTO v_new;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_brand_offer_revision(_revision_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_brand uuid; v_status text;
BEGIN
  SELECT brand_user_id, status INTO v_brand, v_status
    FROM public.brand_offer_revisions WHERE id = _revision_id;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'Revision not found';
  END IF;
  IF v_brand <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending revisions can be withdrawn';
  END IF;
  UPDATE public.brand_offer_revisions
    SET status = 'withdrawn', reviewed_at = now()
    WHERE id = _revision_id;
END;
$$;

-- Admin approves: the revision's creative replaces the live content immediately.
-- Placements, dates, stats and Stripe records are untouched.
CREATE OR REPLACE FUNCTION public.approve_brand_offer_revision(_revision_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.brand_offer_revisions%ROWTYPE;
  prod jsonb;
  i int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve revisions';
  END IF;
  SELECT * INTO r FROM public.brand_offer_revisions
    WHERE id = _revision_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Revision not found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Revision is not pending';
  END IF;

  UPDATE public.brand_offers
    SET headline = r.headline,
        body_copy = r.body_copy,
        discount_code = r.discount_code,
        external_url = r.external_url,
        hero_image_path = COALESCE(r.hero_image_path, hero_image_path),
        updated_at = now()
    WHERE id = r.offer_id;

  DELETE FROM public.brand_products WHERE offer_id = r.offer_id;

  FOR prod IN SELECT * FROM jsonb_array_elements(COALESCE(r.products, '[]'::jsonb)) LOOP
    INSERT INTO public.brand_products (
      offer_id, name, description, external_url, image_urls, ingredients,
      kind, tool_kind, key_features, materials, source_type, source_url,
      linked_product_id, position
    ) VALUES (
      r.offer_id,
      COALESCE(NULLIF(prod->>'name',''), 'Untitled'),
      NULLIF(prod->>'description',''),
      NULLIF(prod->>'external_url',''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(prod->'image_urls')), '{}'::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(prod->'ingredients')), '{}'::text[]),
      COALESCE(NULLIF(prod->>'kind',''), 'product'),
      NULLIF(prod->>'tool_kind',''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(prod->'key_features')), '{}'::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(prod->'materials')), '{}'::text[]),
      COALESCE(NULLIF(prod->>'source_type',''), 'manual'),
      NULLIF(prod->>'source_url',''),
      NULLIF(prod->>'linked_product_id','')::uuid,
      i
    );
    i := i + 1;
  END LOOP;

  UPDATE public.brand_offer_revisions
    SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    WHERE id = _revision_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_brand_offer_revision(_revision_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject revisions';
  END IF;
  UPDATE public.brand_offer_revisions
    SET status = 'rejected',
        rejection_reason = NULLIF(_reason,''),
        reviewed_at = now(),
        reviewed_by = auth.uid()
    WHERE id = _revision_id AND status = 'pending';
END;
$$;