-- Slot rate lookup, mirroring src/lib/adPricing.ts (single source of truth for UI).
CREATE OR REPLACE FUNCTION public.ad_slot_daily_rate(_slot public.brand_placement_slot, _targeted boolean)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _targeted THEN
      CASE _slot WHEN 'home' THEN 3000 WHEN 'products' THEN 3000 WHEN 'wash_day' THEN 4500 WHEN 'pro_welcome' THEN 4000 END
    ELSE
      CASE _slot WHEN 'home' THEN 2000 WHEN 'products' THEN 2000 WHEN 'wash_day' THEN 3000 WHEN 'pro_welcome' THEN 3000 END
    END
$$;

ALTER TABLE public.brand_offer_revisions
  ADD COLUMN IF NOT EXISTS targeting jsonb,
  ADD COLUMN IF NOT EXISTS targeting_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier_before text,
  ADD COLUMN IF NOT EXISTS tier_after text,
  ADD COLUMN IF NOT EXISTS remaining_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uplift_pence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS reach_before integer,
  ADD COLUMN IF NOT EXISTS reach_after integer;

ALTER TABLE public.brand_offers
  ADD COLUMN IF NOT EXISTS targeting_changed_at timestamptz;

-- Submit: creative + optional proposed audience, priced for remaining days only.
DROP FUNCTION IF EXISTS public.submit_brand_offer_revision(uuid, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.submit_brand_offer_revision(
  _offer_id uuid, _headline text, _body_copy text, _discount_code text,
  _external_url text, _hero_image_path text, _products jsonb,
  _targeting jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand uuid;
  v_status public.brand_offer_status;
  v_ends date;
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_new uuid;
  v_old jsonb;
  v_next jsonb;
  v_changed boolean := false;
  v_tier_before text;
  v_tier_after text;
  v_days integer := 0;
  v_uplift integer := 0;
  v_pay boolean := false;
  v_reach_before integer;
  v_reach_after integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT brand_user_id, status, ends_on INTO v_brand, v_status, v_ends
    FROM public.brand_offers WHERE id = _offer_id;
  IF v_brand IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_brand <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not your offer';
  END IF;
  IF v_status NOT IN ('paid_scheduled','live') THEN
    RAISE EXCEPTION 'Only paid-scheduled or live offers use the revision flow';
  END IF;

  v_old := public.ad_offer_rules(_offer_id);

  IF _targeting IS NOT NULL THEN
    -- A campaign that has finished delivering can never have its audience changed.
    IF v_ends IS NOT NULL AND v_ends < v_today THEN
      RAISE EXCEPTION 'This campaign has ended — its audience can no longer be changed';
    END IF;

    SELECT coalesce(jsonb_object_agg(k, codes), '{}'::jsonb) INTO v_next
    FROM (
      SELECT e.key AS k, jsonb_agg(DISTINCT v.value_code) AS codes
      FROM jsonb_each(_targeting) e
      CROSS JOIN LATERAL (SELECT jsonb_array_elements_text(e.value) AS value_code) v
      JOIN public.ad_targeting_attributes a
        ON a.attribute_key = e.key AND a.value_code = v.value_code
      GROUP BY e.key
    ) s;
    v_next := coalesce(v_next, '{}'::jsonb);

    v_changed := (v_next <> v_old);
    v_tier_before := CASE WHEN v_old = '{}'::jsonb THEN 'broad' ELSE 'targeted' END;
    v_tier_after  := CASE WHEN v_next = '{}'::jsonb THEN 'broad' ELSE 'targeted' END;

    SELECT count(DISTINCT placement_date)::int INTO v_days
    FROM public.brand_offer_placements
    WHERE offer_id = _offer_id AND placement_date >= v_today;

    IF v_tier_before = 'broad' AND v_tier_after = 'targeted' THEN
      SELECT coalesce(sum(GREATEST(public.ad_slot_daily_rate(pl.slot, true) - pl.daily_rate_pence, 0)), 0)::int
        INTO v_uplift
      FROM public.brand_offer_placements pl
      WHERE pl.offer_id = _offer_id AND pl.placement_date >= v_today;
      v_pay := v_uplift > 0;
    END IF;

    IF v_old <> '{}'::jsonb THEN
      SELECT count(*)::int INTO v_reach_before FROM public.ad_match_users(v_old);
    ELSE v_reach_before := NULL; END IF;
    IF v_next <> '{}'::jsonb THEN
      SELECT count(*)::int INTO v_reach_after FROM public.ad_match_users(v_next);
    ELSE v_reach_after := NULL; END IF;
  END IF;

  UPDATE public.brand_offer_revisions
    SET status = 'superseded', reviewed_at = now()
    WHERE offer_id = _offer_id AND status = 'pending';

  INSERT INTO public.brand_offer_revisions (
    offer_id, brand_user_id, headline, body_copy, discount_code,
    external_url, hero_image_path, products, status,
    targeting, targeting_changed, tier_before, tier_after,
    remaining_days, uplift_pence, payment_required, reach_before, reach_after
  ) VALUES (
    _offer_id, v_brand, _headline, _body_copy, _discount_code,
    _external_url, _hero_image_path, COALESCE(_products, '[]'::jsonb), 'pending',
    CASE WHEN _targeting IS NULL THEN NULL ELSE v_next END,
    v_changed, v_tier_before, v_tier_after,
    coalesce(v_days,0), coalesce(v_uplift,0), v_pay, v_reach_before, v_reach_after
  ) RETURNING id INTO v_new;
  RETURN v_new;
END;
$$;

-- Admin marks the targeting uplift as received (Stripe) or waived.
CREATE OR REPLACE FUNCTION public.mark_brand_offer_revision_paid(_revision_id uuid, _waive boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can record a revision payment';
  END IF;
  UPDATE public.brand_offer_revisions
    SET paid_at = coalesce(paid_at, now()),
        payment_waived = _waive,
        updated_at = now()
    WHERE id = _revision_id AND status = 'pending';
END;
$$;

-- Approve: creative as before, plus audience application, immediate re-resolve
-- and forward-only repricing.
CREATE OR REPLACE FUNCTION public.approve_brand_offer_revision(_revision_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.brand_offer_revisions%ROWTYPE;
  prod jsonb;
  i int := 0;
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_targeted boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve revisions';
  END IF;

  SELECT * INTO r FROM public.brand_offer_revisions WHERE id = _revision_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Revision is not pending'; END IF;
  IF r.targeting_changed AND r.payment_required AND r.paid_at IS NULL THEN
    RAISE EXCEPTION 'Audience uplift of % pence has not been paid — record payment or waive it before approving', r.uplift_pence;
  END IF;

  UPDATE public.brand_offers
  SET headline = NULLIF(r.headline, ''),
      body_copy = r.body_copy,
      discount_code = r.discount_code,
      external_url = r.external_url,
      hero_image_path = COALESCE(NULLIF(r.hero_image_path, ''), hero_image_path),
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

  IF r.targeting_changed AND r.targeting IS NOT NULL THEN
    v_targeted := (r.targeting <> '{}'::jsonb);

    DELETE FROM public.brand_offer_targeting WHERE offer_id = r.offer_id;
    INSERT INTO public.brand_offer_targeting (offer_id, attribute_key, value_code)
    SELECT r.offer_id, e.key, v.value_code
    FROM jsonb_each(r.targeting) e
    CROSS JOIN LATERAL (SELECT jsonb_array_elements_text(e.value) AS value_code) v
    JOIN public.ad_targeting_attributes a
      ON a.attribute_key = e.key AND a.value_code = v.value_code
    ON CONFLICT DO NOTHING;

    -- Forward-only repricing: days already delivered keep the snapshotted rate
    -- they were sold at. Rates are never lowered (removing targeting is not
    -- refunded), only raised for days not yet delivered.
    UPDATE public.brand_offer_placements pl
      SET daily_rate_pence = public.ad_slot_daily_rate(pl.slot, v_targeted)
    WHERE pl.offer_id = r.offer_id
      AND pl.placement_date >= v_today
      AND public.ad_slot_daily_rate(pl.slot, v_targeted) > pl.daily_rate_pence;

    UPDATE public.brand_offers o
      SET total_price_pence = (
            SELECT coalesce(sum(daily_rate_pence),0)::int
            FROM public.brand_offer_placements WHERE offer_id = r.offer_id
          ),
          targeting_changed_at = now(),
          updated_at = now()
    WHERE o.id = r.offer_id;

    -- Re-resolve the cached materialised audience immediately; the nightly
    -- refresh_ad_audiences() job continues to run unchanged.
    PERFORM public.resolve_ad_offer_audience(r.offer_id);
  END IF;

  UPDATE public.brand_offer_revisions
  SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = _revision_id;
END;
$$;

-- Performance split at the audience change point.
CREATE OR REPLACE FUNCTION public.brand_offer_split_totals(_offer_id uuid)
RETURNS TABLE(
  phase text, changed_at timestamptz, impressions bigint, raw_views bigint,
  expands bigint, link_clicks bigint, code_copies bigint, wishlist_adds bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changed timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT o.targeting_changed_at INTO v_changed
  FROM public.brand_offers o
  WHERE o.id = _offer_id
    AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF v_changed IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT CASE WHEN e.occurred_at < v_changed THEN 'before' ELSE 'after' END,
         v_changed,
         count(DISTINCT CASE WHEN e.event_type = 'view' THEN coalesce(e.user_id::text, e.session_id) END),
         count(*) FILTER (WHERE e.event_type = 'view'),
         count(*) FILTER (WHERE e.event_type = 'expand'),
         count(*) FILTER (WHERE e.event_type = 'link_click'),
         count(*) FILTER (WHERE e.event_type = 'code_copy'),
         count(*) FILTER (WHERE e.event_type = 'wishlist')
  FROM public.ad_events e
  WHERE e.offer_id = _offer_id
  GROUP BY 1;
END;
$$;