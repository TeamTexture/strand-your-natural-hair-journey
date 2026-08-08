-- A. Repair dangling member shelf references left behind by deleted brand product rows
UPDATE public.user_products up
SET linked_brand_product_id = bp.id
FROM public.brand_products bp
WHERE up.linked_brand_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.brand_products x WHERE x.id = up.linked_brand_product_id)
  AND lower(trim(bp.name)) = lower(trim(up.name));

UPDATE public.user_products up SET linked_brand_product_id = NULL
WHERE up.linked_brand_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.brand_products x WHERE x.id = up.linked_brand_product_id);

UPDATE public.user_products up SET linked_brand_offer_id = NULL
WHERE up.linked_brand_offer_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = up.linked_brand_offer_id);

-- B. Backfill the canonical join table from the legacy column, then backfill ownership
INSERT INTO public.brand_offer_products (offer_id, brand_product_id, position)
SELECT bp.offer_id, bp.id, COALESCE(bp.position, 0)
FROM public.brand_products bp
WHERE bp.offer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.brand_offer_products x
    WHERE x.offer_id = bp.offer_id AND x.brand_product_id = bp.id
  );

UPDATE public.brand_products bp
SET brand_user_id = o.brand_user_id
FROM public.brand_offers o
WHERE o.id = bp.offer_id AND bp.brand_user_id IS NULL;

-- C. Rewrite every policy that depended on brand_products.offer_id
DROP POLICY IF EXISTS "Products of ended offers readable by authenticated" ON public.brand_products;
CREATE POLICY "Products of ended offers readable by authenticated"
ON public.brand_products FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.brand_offer_products bop
  JOIN public.brand_offers o ON o.id = bop.offer_id
  WHERE bop.brand_product_id = brand_products.id AND o.status = 'ended'
));

DROP POLICY IF EXISTS "Products of paid or live offers readable in window" ON public.brand_products;
CREATE POLICY "Products of paid or live offers readable in window"
ON public.brand_products FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.brand_offer_products bop
  JOIN public.brand_offers o ON o.id = bop.offer_id
  WHERE bop.brand_product_id = brand_products.id
    AND o.status = ANY (ARRAY['paid_scheduled'::brand_offer_status, 'live'::brand_offer_status])
    AND o.starts_on IS NOT NULL AND o.ends_on IS NOT NULL
    AND o.starts_on <= public.strand_today_london()
    AND o.ends_on >= public.strand_today_london()
));

DROP POLICY IF EXISTS "Brand manages own products" ON public.brand_products;
CREATE POLICY "Brand manages own products"
ON public.brand_products FOR ALL TO authenticated
USING (brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Brand offer assets readable to members" ON storage.objects;
CREATE POLICY "Brand offer assets readable to members"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'brand-assets' AND (
    public.has_role(auth.uid(), 'admin')
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.status = ANY (ARRAY['paid_scheduled'::brand_offer_status, 'live'::brand_offer_status, 'ended'::brand_offer_status])
        AND ((o.brand_user_id)::text = (storage.foldername(objects.name))[1] OR o.hero_image_path = objects.name)
    )
    OR EXISTS (
      SELECT 1 FROM public.brand_products p
      JOIN public.brand_offer_products bop ON bop.brand_product_id = p.id
      JOIN public.brand_offers o2 ON o2.id = bop.offer_id
      WHERE o2.status = ANY (ARRAY['paid_scheduled'::brand_offer_status, 'live'::brand_offer_status, 'ended'::brand_offer_status])
        AND objects.name = ANY (p.image_urls)
    )
  )
);

-- D. Drop the legacy ownership column
ALTER TABLE public.brand_products DROP COLUMN offer_id;

-- E. One canonical product row per brand
CREATE UNIQUE INDEX IF NOT EXISTS brand_products_one_per_brand_uniq
ON public.brand_products (brand_user_id, lower(trim(name)), COALESCE(NULLIF(kind, ''), 'product'))
WHERE brand_user_id IS NOT NULL;

-- F. Never dangle again
ALTER TABLE public.user_products
  ADD CONSTRAINT user_products_linked_brand_product_fk
  FOREIGN KEY (linked_brand_product_id) REFERENCES public.brand_products(id) ON DELETE SET NULL;

ALTER TABLE public.user_products
  ADD CONSTRAINT user_products_linked_brand_offer_fk
  FOREIGN KEY (linked_brand_offer_id) REFERENCES public.brand_offers(id) ON DELETE SET NULL;

-- G. Functions: reference, never own
CREATE OR REPLACE FUNCTION public.brand_offer_one_product_on_submit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  IF NEW.status = 'under_review' AND COALESCE(OLD.status::text, '') <> 'under_review' THEN
    SELECT count(*) INTO v_count FROM public.brand_offer_products bop WHERE bop.offer_id = NEW.id;
    IF v_count > 1 THEN
      RAISE EXCEPTION 'An advert can promote only one product. Remove the extra attached item before submitting.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relaunch_brand_offer(_offer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  src public.brand_offers;
  new_id uuid;
begin
  select * into src from public.brand_offers where id = _offer_id;
  if src.id is null then
    raise exception 'Offer not found';
  end if;
  if src.brand_user_id <> auth.uid() and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Not permitted';
  end if;

  insert into public.brand_offers (
    brand_user_id, owner_type, headline, body_copy, hero_image_path, external_url,
    discount_code, attached_pro_offer_id, attached_booking_url, currency,
    status, starts_on, ends_on, total_price_pence, relaunched_from_offer_id
  )
  values (
    src.brand_user_id, src.owner_type, src.headline, src.body_copy, src.hero_image_path,
    src.external_url, src.discount_code, src.attached_pro_offer_id, src.attached_booking_url,
    src.currency, 'draft', null, null, 0, coalesce(src.relaunched_from_offer_id, src.id)
  )
  returning id into new_id;

  -- re-link the SAME brand product rows; never copy them
  insert into public.brand_offer_products (offer_id, brand_product_id, position)
  select new_id, bop.brand_product_id, bop.position
  from public.brand_offer_products bop
  where bop.offer_id = _offer_id
  on conflict do nothing;

  insert into public.brand_offer_targeting (offer_id, attribute_key, value_code)
  select new_id, attribute_key, value_code
  from public.brand_offer_targeting
  where offer_id = _offer_id;

  return new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_brand_offer_revision(_revision_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r public.brand_offer_revisions%ROWTYPE;
  prod jsonb;
  i int := 0;
  v_owes boolean;
  v_linked uuid;
  v_brand uuid;
  v_name text;
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

  SELECT brand_user_id INTO v_brand FROM public.brand_offers WHERE id = r.offer_id;

  -- only unlink; brand product rows are owned by the brand and are never deleted here
  DELETE FROM public.brand_offer_products WHERE offer_id = r.offer_id;

  FOR prod IN SELECT * FROM jsonb_array_elements(COALESCE(r.products, '[]'::jsonb)) LOOP
    v_linked := NULLIF(prod->>'linked_product_id','')::uuid;

    IF v_linked IS NULL OR NOT EXISTS (SELECT 1 FROM public.brand_products bp WHERE bp.id = v_linked) THEN
      v_name := COALESCE(NULLIF(prod->>'name',''), 'Untitled');
      SELECT bp.id INTO v_linked
      FROM public.brand_products bp
      WHERE bp.brand_user_id = v_brand
        AND lower(trim(bp.name)) = lower(trim(v_name))
        AND COALESCE(NULLIF(bp.kind,''), 'product') = COALESCE(NULLIF(prod->>'kind',''), 'product')
      LIMIT 1;

      IF v_linked IS NULL THEN
        INSERT INTO public.brand_products (
          brand_user_id, name, description, external_url, image_urls, ingredients,
          kind, tool_kind, key_features, materials, source_type, source_url, position,
          is_published, approval_status
        ) VALUES (
          v_brand,
          v_name,
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
          COALESCE(NULLIF(prod->>'position','')::integer, i),
          false, 'pending'
        )
        RETURNING id INTO v_linked;
      END IF;
    END IF;

    INSERT INTO public.brand_offer_products (offer_id, brand_product_id, position)
    VALUES (r.offer_id, v_linked, COALESCE(NULLIF(prod->>'position','')::integer, i))
    ON CONFLICT DO NOTHING;

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
$function$;

CREATE OR REPLACE FUNCTION public.brand_public_catalogue(_brand_user_id uuid)
 RETURNS TABLE(kind text, name text, brand text, category text, image_url text, storage_path text, source_url text, member_count bigint, offer_id uuid, brand_product_id uuid, viewer_on_shelf boolean, viewer_on_wishlist boolean, viewer_on_favourite boolean, viewer_previously_on_shelf boolean, viewer_item_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_name text;
  v_viewer uuid := auth.uid();
BEGIN
  SELECT lower(trim(bp.brand_name)) INTO v_brand_name
  FROM public.brand_profiles bp
  WHERE bp.user_id = _brand_user_id;

  IF v_brand_name IS NULL OR v_brand_name = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  user_prod AS (
    SELECT
      'product'::text AS kind,
      lower(trim(up.name)) AS key,
      MIN(up.name) AS name,
      MIN(up.brand) AS brand,
      NULLIF(MIN(NULLIF(up.category, '')), '') AS category,
      MAX(NULLIF(up.image_url, '')) AS image_url,
      MAX(NULLIF(up.storage_path, '')) AS storage_path,
      MAX(NULLIF(up.source_url, '')) AS source_url,
      COUNT(DISTINCT up.user_id)::bigint AS member_count,
      NULL::uuid AS offer_id,
      NULL::uuid AS brand_product_id
    FROM public.user_products up
    WHERE lower(trim(coalesce(up.brand,''))) = v_brand_name
      AND NULLIF(trim(up.name), '') IS NOT NULL
    GROUP BY lower(trim(up.name))
  ),
  user_tool AS (
    SELECT
      'tool'::text AS kind,
      lower(trim(ut.name)) AS key,
      MIN(ut.name) AS name,
      MIN(ut.brand) AS brand,
      NULLIF(MIN(NULLIF(ut.category, '')), '') AS category,
      MAX(NULLIF(ut.image_url, '')) AS image_url,
      MAX(NULLIF(ut.storage_path, '')) AS storage_path,
      MAX(NULLIF(ut.source_url, '')) AS source_url,
      COUNT(DISTINCT ut.user_id)::bigint AS member_count,
      NULL::uuid AS offer_id,
      NULL::uuid AS brand_product_id
    FROM public.user_tools ut
    WHERE lower(trim(coalesce(ut.brand,''))) = v_brand_name
      AND NULLIF(trim(ut.name), '') IS NOT NULL
    GROUP BY lower(trim(ut.name))
  ),
  brand_prod AS (
    SELECT
      COALESCE(NULLIF(bpr.kind,''), 'product') AS kind,
      lower(trim(bpr.name)) AS key,
      MIN(bpr.name) AS name,
      v_brand_name AS brand,
      NULL::text AS category,
      MAX(NULLIF((bpr.image_urls)[1], '')) AS image_url,
      NULL::text AS storage_path,
      MAX(NULLIF(bpr.external_url, '')) AS source_url,
      0::bigint AS member_count,
      (array_agg(lo.offer_id ORDER BY lo.created_at DESC NULLS LAST))[1] AS offer_id,
      (array_agg(bpr.id ORDER BY bpr.created_at DESC))[1] AS brand_product_id
    FROM public.brand_products bpr
    LEFT JOIN LATERAL (
      SELECT bop.offer_id, bo.created_at
      FROM public.brand_offer_products bop
      JOIN public.brand_offers bo ON bo.id = bop.offer_id
      WHERE bop.brand_product_id = bpr.id
      ORDER BY bo.created_at DESC
      LIMIT 1
    ) lo ON true
    WHERE bpr.brand_user_id = _brand_user_id
      AND NULLIF(trim(bpr.name), '') IS NOT NULL
    GROUP BY COALESCE(NULLIF(bpr.kind,''), 'product'), lower(trim(bpr.name))
  ),
  merged AS (
    SELECT * FROM user_prod
    UNION ALL SELECT * FROM user_tool
    UNION ALL SELECT * FROM brand_prod
  ),
  dedup AS (
    SELECT
      kind,
      key,
      MIN(name) AS name,
      MIN(brand) AS brand,
      MIN(category) AS category,
      MAX(image_url) AS image_url,
      MAX(storage_path) AS storage_path,
      MAX(source_url) AS source_url,
      SUM(member_count)::bigint AS member_count,
      MAX(offer_id) AS offer_id,
      MAX(brand_product_id) AS brand_product_id
    FROM merged
    GROUP BY kind, key
  )
  SELECT
    d.kind,
    d.name,
    d.brand,
    d.category,
    d.image_url,
    d.storage_path,
    d.source_url,
    d.member_count,
    d.offer_id,
    d.brand_product_id,
    COALESCE(vp.on_shelf, vt.on_shelf, false) AS viewer_on_shelf,
    COALESCE(vp.on_wishlist, false) AS viewer_on_wishlist,
    COALESCE(vp.on_favourite, vt.on_favourite, false) AS viewer_on_favourite,
    COALESCE(vp.previously_on_shelf, false) AS viewer_previously_on_shelf,
    COALESCE(vp.id, vt.id) AS viewer_item_id
  FROM dedup d
  LEFT JOIN LATERAL (
    SELECT up.id, up.on_shelf, up.on_wishlist, up.on_favourite, up.previously_on_shelf,
           COALESCE(up.image_url, '') AS image_url, COALESCE(up.storage_path,'') AS storage_path
    FROM public.user_products up
    WHERE up.user_id = v_viewer
      AND lower(trim(up.name)) = d.key
      AND lower(trim(coalesce(up.brand,''))) = v_brand_name
    ORDER BY up.updated_at DESC
    LIMIT 1
  ) vp ON d.kind = 'product'
  LEFT JOIN LATERAL (
    SELECT ut.id, ut.on_shelf, ut.on_favourite,
           COALESCE(ut.image_url,'') AS image_url, COALESCE(ut.storage_path,'') AS storage_path
    FROM public.user_tools ut
    WHERE ut.user_id = v_viewer
      AND lower(trim(ut.name)) = d.key
      AND lower(trim(coalesce(ut.brand,''))) = v_brand_name
    ORDER BY ut.updated_at DESC
    LIMIT 1
  ) vt ON d.kind = 'tool'
  ORDER BY d.member_count DESC NULLS LAST, d.name ASC;
END;
$function$;