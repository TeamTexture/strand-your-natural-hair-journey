CREATE OR REPLACE FUNCTION public.approve_brand_offer_revision(_revision_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.brand_offer_revisions%ROWTYPE;
  prod jsonb;
  i int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve revisions';
  END IF;

  SELECT * INTO r
  FROM public.brand_offer_revisions
  WHERE id = _revision_id
  FOR UPDATE;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Revision not found';
  END IF;

  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Revision is not pending';
  END IF;

  UPDATE public.brand_offers
  SET headline = COALESCE(NULLIF(r.headline, ''), headline),
      body_copy = r.body_copy,
      discount_code = r.discount_code,
      external_url = r.external_url,
      hero_image_path = COALESCE(NULLIF(r.hero_image_path, ''), hero_image_path),
      updated_at = now()
  WHERE id = r.offer_id;

  DELETE FROM public.brand_products
  WHERE offer_id = r.offer_id;

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
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(prod->'image_urls', '[]'::jsonb))), '{}'::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(prod->'ingredients', '[]'::jsonb))), '{}'::text[]),
      COALESCE(NULLIF(prod->>'kind',''), 'product'),
      NULLIF(prod->>'tool_kind',''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(prod->'key_features', '[]'::jsonb))), '{}'::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(prod->'materials', '[]'::jsonb))), '{}'::text[]),
      COALESCE(NULLIF(prod->>'source_type',''), 'manual'),
      NULLIF(prod->>'source_url',''),
      NULLIF(prod->>'linked_product_id','')::uuid,
      COALESCE(NULLIF(prod->>'position','')::integer, i)
    );
    i := i + 1;
  END LOOP;

  UPDATE public.brand_offer_revisions
  SET status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE id = _revision_id;
END;
$$;