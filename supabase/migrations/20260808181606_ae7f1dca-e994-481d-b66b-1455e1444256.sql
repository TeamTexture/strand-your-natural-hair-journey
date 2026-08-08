-- Existing states become: pending → rejected | approved | approved_pending_payment → approved
ALTER TABLE public.brand_offer_revisions DROP CONSTRAINT IF EXISTS brand_offer_revisions_status_check;

UPDATE public.brand_offer_revisions SET status = 'pending' WHERE status = 'pending_payment';

ALTER TABLE public.brand_offer_revisions
  ADD CONSTRAINT brand_offer_revisions_status_check
  CHECK (status IN ('pending','approved_pending_payment','approved','rejected','withdrawn','superseded','expired'));

DROP INDEX IF EXISTS brand_offer_revisions_one_pending_payment;
CREATE UNIQUE INDEX brand_offer_revisions_one_awaiting_payment
  ON public.brand_offer_revisions(offer_id) WHERE status = 'approved_pending_payment';

-- ── Apply a revision's targeting to the live campaign ────────────────────────
-- Called on approval when nothing more is owed, and from the webhook once the
-- uplift is paid. Never called from a client.
CREATE OR REPLACE FUNCTION public.apply_brand_offer_revision_targeting(_revision_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.brand_offer_revisions%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_targeted boolean;
BEGIN
  SELECT * INTO r FROM public.brand_offer_revisions WHERE id = _revision_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  IF NOT r.targeting_changed OR r.targeting IS NULL THEN RETURN; END IF;

  v_targeted := (r.targeting <> '{}'::jsonb);

  DELETE FROM public.brand_offer_targeting WHERE offer_id = r.offer_id;
  INSERT INTO public.brand_offer_targeting (offer_id, attribute_key, value_code)
  SELECT r.offer_id, e.key, v.value_code
  FROM jsonb_each(r.targeting) e
  CROSS JOIN LATERAL (SELECT jsonb_array_elements_text(e.value) AS value_code) v
  JOIN public.ad_targeting_attributes a
    ON a.attribute_key = e.key AND a.value_code = v.value_code
  ON CONFLICT DO NOTHING;

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
        targeting_changed_at = now()
  WHERE o.id = r.offer_id;

  -- Re-resolve the cached audience immediately so delivery matches the new rules.
  PERFORM public.resolve_ad_offer_audience(r.offer_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_brand_offer_revision_targeting(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_brand_offer_revision_targeting(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.apply_brand_offer_revision_targeting(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_brand_offer_revision_targeting(uuid) TO service_role;

-- ── Submit: always lands in admin review. Nothing is charged here. ───────────
CREATE OR REPLACE FUNCTION public.submit_brand_offer_revision(
  _offer_id uuid, _headline text, _body_copy text, _discount_code text,
  _external_url text, _hero_image_path text, _products jsonb,
  _targeting jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
    WHERE offer_id = _offer_id AND status IN ('pending','approved_pending_payment');

  INSERT INTO public.brand_offer_revisions (
    offer_id, brand_user_id, headline, body_copy, discount_code,
    external_url, hero_image_path, products, status,
    targeting, targeting_changed, tier_before, tier_after,
    remaining_days, uplift_pence, payment_required, reach_before, reach_after
  ) VALUES (
    _offer_id, v_brand, _headline, _body_copy, _discount_code,
    _external_url, _hero_image_path, COALESCE(_products, '[]'::jsonb),
    'pending',
    CASE WHEN _targeting IS NULL THEN NULL ELSE v_next END,
    v_changed, v_tier_before, v_tier_after,
    coalesce(v_days,0), coalesce(v_uplift,0), v_pay, v_reach_before, v_reach_after
  ) RETURNING id INTO v_new;
  RETURN v_new;
END;
$fn$;

-- ── Approve: creative applies now. Targeting applies now only when nothing
-- more is owed; otherwise the revision parks in approved_pending_payment. ────
CREATE OR REPLACE FUNCTION public.approve_brand_offer_revision(_revision_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.brand_offer_revisions%ROWTYPE;
  prod jsonb;
  i int := 0;
  v_owes boolean;
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

-- ── Webhook-only: payment confirmed → apply targeting. Idempotent. ──────────
CREATE OR REPLACE FUNCTION public.confirm_brand_offer_revision_payment(
  _revision_id uuid, _session_id text, _payment_intent_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status
    FROM public.brand_offer_revisions WHERE id = _revision_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  -- Replayed event, or a revision that never needed paying: no-op.
  IF v_status <> 'approved_pending_payment' THEN RETURN false; END IF;

  UPDATE public.brand_offer_revisions
    SET paid_at = coalesce(paid_at, now()),
        stripe_session_id = coalesce(_session_id, stripe_session_id),
        stripe_payment_intent_id = coalesce(_payment_intent_id, stripe_payment_intent_id),
        updated_at = now()
  WHERE id = _revision_id;

  PERFORM public.apply_brand_offer_revision_targeting(_revision_id);

  UPDATE public.brand_offer_revisions
    SET status = 'approved', updated_at = now()
  WHERE id = _revision_id;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.confirm_brand_offer_revision_payment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_brand_offer_revision_payment(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_brand_offer_revision_payment(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_brand_offer_revision_payment(uuid, text, text) TO service_role;

-- ── Withdraw: brand can drop an in-flight or approved-unpaid revision ───────
CREATE OR REPLACE FUNCTION public.withdraw_brand_offer_revision(_revision_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_brand uuid; v_status text;
BEGIN
  SELECT brand_user_id, status INTO v_brand, v_status
    FROM public.brand_offer_revisions WHERE id = _revision_id;
  IF v_brand IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  IF v_brand <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_status NOT IN ('pending','approved_pending_payment') THEN
    RAISE EXCEPTION 'Only in-flight revisions can be withdrawn';
  END IF;
  UPDATE public.brand_offer_revisions
    SET status = 'withdrawn', reviewed_at = now()
    WHERE id = _revision_id;
END;
$fn$;

-- ── Unpaid approved revisions die with the campaign ─────────────────────────
CREATE OR REPLACE FUNCTION public.expire_unpaid_brand_offer_revisions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_n integer;
BEGIN
  WITH gone AS (
    UPDATE public.brand_offer_revisions r
      SET status = 'expired', updated_at = now()
    WHERE r.status = 'approved_pending_payment'
      AND EXISTS (
        SELECT 1 FROM public.brand_offers o
        WHERE o.id = r.offer_id
          AND o.ends_on IS NOT NULL
          AND o.ends_on < (now() AT TIME ZONE 'Europe/London')::date
      )
    RETURNING 1
  )
  SELECT count(*)::int INTO v_n FROM gone;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.expire_unpaid_brand_offer_revisions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_unpaid_brand_offer_revisions() FROM anon;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_brand_offer_revisions() TO service_role;

SELECT cron.unschedule('expire-unpaid-ad-revisions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-unpaid-ad-revisions');

SELECT cron.schedule(
  'expire-unpaid-ad-revisions',
  '35 3 * * *',
  $cron$select public.expire_unpaid_brand_offer_revisions();$cron$
);

GRANT EXECUTE ON FUNCTION public.submit_brand_offer_revision(uuid, text, text, text, text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_brand_offer_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_brand_offer_revision(uuid) TO authenticated;