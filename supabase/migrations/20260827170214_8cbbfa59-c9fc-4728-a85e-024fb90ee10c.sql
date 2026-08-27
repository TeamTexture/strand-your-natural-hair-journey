-- ── 1. email_log: durable retry ──────────────────────────────────────────────
ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 4;

CREATE INDEX IF NOT EXISTS email_log_retry_due_idx
  ON public.email_log (next_attempt_at)
  WHERE status = 'failed' AND next_attempt_at IS NOT NULL;

-- ── 2. brand revisions: track the in-flight checkout ─────────────────────────
ALTER TABLE public.brand_offer_revisions
  ADD COLUMN IF NOT EXISTS checkout_started_at timestamptz;

-- Refuse to supersede a revision the brand is already paying for.
CREATE OR REPLACE FUNCTION public.submit_brand_offer_revision(_offer_id uuid, _headline text, _body_copy text, _discount_code text, _external_url text, _hero_image_path text, _products jsonb, _targeting jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_inflight timestamptz;
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

  -- A Stripe Checkout session opened for an approved revision must be settled
  -- before that revision can be replaced. Superseding it mid-checkout took the
  -- brand's money for a change that was then discarded.
  SELECT checkout_started_at INTO v_inflight
    FROM public.brand_offer_revisions
   WHERE offer_id = _offer_id
     AND status = 'approved_pending_payment'
     AND paid_at IS NULL
     AND checkout_started_at IS NOT NULL
     AND checkout_started_at > now() - interval '24 hours'
   LIMIT 1;
  IF v_inflight IS NOT NULL THEN
    RAISE EXCEPTION 'A payment for your approved audience change is still open. Finish or cancel that checkout before submitting another change.';
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
$function$;

-- Never swallow a payment: an unpayable revision keeps the Stripe references
-- and raises an admin alert so it can be refunded.
CREATE OR REPLACE FUNCTION public.confirm_brand_offer_revision_payment(_revision_id uuid, _session_id text, _payment_intent_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_paid timestamptz;
  v_offer uuid;
BEGIN
  SELECT status, paid_at, offer_id INTO v_status, v_paid, v_offer
    FROM public.brand_offer_revisions WHERE id = _revision_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;

  IF v_status <> 'approved_pending_payment' THEN
    -- Already applied (a replayed webhook) is fine and needs no alert.
    IF v_status = 'approved' AND v_paid IS NOT NULL THEN RETURN false; END IF;

    -- Anything else means money arrived for a revision that will never be
    -- applied. Record it against the revision and flag it for a refund.
    UPDATE public.brand_offer_revisions
      SET stripe_session_id = coalesce(_session_id, stripe_session_id),
          stripe_payment_intent_id = coalesce(_payment_intent_id, stripe_payment_intent_id),
          paid_at = coalesce(paid_at, now()),
          updated_at = now()
    WHERE id = _revision_id;

    INSERT INTO public.admin_notifications (type, title, body, entity_type, entity_id, url)
    VALUES (
      'revision_payment_orphaned',
      'Refund needed: paid audience change was not applied',
      'A brand paid the targeting uplift for a revision that is now "' || v_status ||
      '", so the change was never applied. Refund this payment in Stripe.'
      || coalesce(' Payment intent: ' || _payment_intent_id, ''),
      'brand_offer_revision',
      _revision_id,
      '/admin/brands'
    )
    ON CONFLICT (type, entity_id) WHERE entity_id IS NOT NULL DO NOTHING;

    RETURN false;
  END IF;

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
$function$;