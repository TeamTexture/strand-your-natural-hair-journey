CREATE OR REPLACE FUNCTION public.approve_brand_offer_revision(_revision_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r public.brand_offer_revisions%ROWTYPE;
  prod jsonb;
  i int := 0;
  v_owes boolean;
  v_linked uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve revisions';
  END IF;

  SELECT * INTO r FROM public.brand_offer_revisions WHERE id = _revision_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Revision is not pending'; END IF;

  UPDATE public.brand_offers
  SET headline = NULLIF(r.headline, ''),
      body_copy = r.body_copy,
      discount_code = r.discount_code,
      external_url = r.external_url,
      hero_image_path = COALESCE(NULLIF(r.hero_image_path, ''), hero_image_path),
      updated_at = now()
  WHERE id = r.offer_id;

  -- clear both the legacy inline rows and the join-table links for this offer
  DELETE FROM public.brand_products WHERE offer_id = r.offer_id;
  DELETE FROM public.brand_offer_products WHERE offer_id = r.offer_id;

  FOR prod IN SELECT * FROM jsonb_array_elements(COALESCE(r.products, '[]'::jsonb)) LOOP
    v_linked := NULLIF(prod->>'linked_product_id','')::uuid;

    IF v_linked IS NOT NULL AND EXISTS (SELECT 1 FROM public.brand_products bp WHERE bp.id = v_linked) THEN
      -- shelf product: attach via the join table so all surfaces resolve it
      INSERT INTO public.brand_offer_products (offer_id, brand_product_id, position)
      VALUES (r.offer_id, v_linked, COALESCE(NULLIF(prod->>'position','')::integer, i))
      ON CONFLICT DO NOTHING;
    ELSE
      -- legacy/manual entry with no shelf product behind it
      INSERT INTO public.brand_products (
        offer_id, name, description, external_url, image_urls, ingredients,
        kind, tool_kind, key_features, materials, source_type, source_url,
        linked_product_id, position
      ) VALUES (
        r.offer_id,
        COALESCE(NULLIF(prod->>'name',''), 'Untitled'),
        NULLIF(prod->>'description',''),
        NULLIF(prod->>'external_url',''),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(prod->'image_urls', '[]'::jsonb))), '{}'::text[]),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(prod->'ingredients', '[]'::jsonb))), '{}'::text[]),
        COALESCE(NULLIF(prod->>'kind',''), 'product'),
        NULLIF(prod->>'tool_kind',''),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(prod->'key_features', '[]'::jsonb))), '{}'::text[]),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(prod->'materials', '[]'::jsonb))), '{}'::text[]),
        COALESCE(NULLIF(prod->>'source_type',''), 'manual'),
        NULLIF(prod->>'source_url',''),
        v_linked,
        COALESCE(NULLIF(prod->>'position','')::integer, i)
      );
    END IF;

    i := i + 1;
  END LOOP;

  v_owes := r.targeting_changed
        AND r.targeting IS NOT NULL
        AND coalesce(r.uplift_pence, 0) > 0
        AND r.paid_at IS NULL;

  IF v_owes THEN
    UPDATE public.brand_offer_revisions
      SET status = 'approved_pending_payment',
          reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
      WHERE id = _revision_id;
    RETURN;
  END IF;

  PERFORM public.apply_brand_offer_revision_targeting(_revision_id);

  UPDATE public.brand_offer_revisions
    SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    WHERE id = _revision_id;
END;
$fn$;

-- Backfill: attach shelf products for already-approved revisions
INSERT INTO public.brand_offer_products (offer_id, brand_product_id, position)
SELECT DISTINCT r.offer_id,
       (p->>'linked_product_id')::uuid,
       COALESCE(NULLIF(p->>'position','')::integer, 0)
FROM public.brand_offer_revisions r
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.products, '[]'::jsonb)) AS p
WHERE r.status IN ('approved','approved_pending_payment')
  AND NULLIF(p->>'linked_product_id','') IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.brand_products bp WHERE bp.id = (p->>'linked_product_id')::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM public.brand_offer_products bop
    WHERE bop.offer_id = r.offer_id
      AND bop.brand_product_id = (p->>'linked_product_id')::uuid
  );

-- Clean up the orphan placeholder rows the old approval path created
DELETE FROM public.brand_products bp
WHERE bp.offer_id IS NOT NULL
  AND bp.brand_user_id IS NULL
  AND bp.linked_product_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.brand_offer_products bop
    WHERE bop.offer_id = bp.offer_id AND bop.brand_product_id = bp.linked_product_id
  );