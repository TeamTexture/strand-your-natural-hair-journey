-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONSENT — lives on public.profiles (the member preference row that already
--    carries tips_level etc.). Default false, never pre-ticked.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personalised_offers_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.ad_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent_given boolean NOT NULL,
  source text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ad_consent_log TO authenticated;
GRANT ALL ON public.ad_consent_log TO service_role;
ALTER TABLE public.ad_consent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own consent log" ON public.ad_consent_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read consent log" ON public.ad_consent_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS ad_consent_log_user_idx ON public.ad_consent_log(user_id, changed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE ALLOWLIST — the ONLY attributes and values that may ever be targeted.
--    A new profile column cannot leak in: matching joins through this table.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_targeting_attributes (
  attribute_key text NOT NULL,
  value_code text NOT NULL,
  label text NOT NULL,
  attribute_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attribute_key, value_code)
);
GRANT SELECT ON public.ad_targeting_attributes TO authenticated;
GRANT ALL ON public.ad_targeting_attributes TO service_role;
ALTER TABLE public.ad_targeting_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read targeting vocabulary" ON public.ad_targeting_attributes
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.ad_targeting_attributes (attribute_key, value_code, label, attribute_label, sort_order) VALUES
  ('porosity','low','Low porosity','Porosity',1),
  ('porosity','high','High porosity','Porosity',2),
  ('density','low','Low density','Density',1),
  ('density','medium','Medium density','Density',2),
  ('density','high','High density','Density',3),
  ('diameter','fine','Fine strands','Strand diameter',1),
  ('diameter','medium','Medium strands','Strand diameter',2),
  ('diameter','coarse','Coarse strands','Strand diameter',3),
  ('diameter','mixed','Mixed strands','Strand diameter',4),
  ('texture','rough','Rough / crinkly surface','Surface texture',1),
  ('texture','medium','Medium surface','Surface texture',2),
  ('texture','silky','Silky / glassy surface','Surface texture',3),
  ('length','twa','TWA / above the ears','Length',1),
  ('length','ear','Ear length','Length',2),
  ('length','chin','Chin length','Length',3),
  ('length','shoulder','Shoulder length','Length',4),
  ('length','armpit','Armpit length','Length',5),
  ('length','midback','Mid-back length','Length',6),
  ('length','waist','Waist length','Length',7),
  ('length','hip','Hip / tailbone length','Length',8),
  ('wash_freq','weekly','Washes weekly','Wash frequency',1),
  ('wash_freq','fortnightly','Washes fortnightly','Wash frequency',2),
  ('wash_freq','monthly','Washes monthly','Wash frequency',3),
  ('wash_freq','infrequent','Washes less than monthly','Wash frequency',4),
  ('product_category','shampoo','Uses shampoo','Product categories in use',1),
  ('product_category','conditioner','Uses conditioner','Product categories in use',2),
  ('product_category','leave-in','Uses leave-in','Product categories in use',3),
  ('product_category','mask','Uses masks','Product categories in use',4),
  ('product_category','treatment','Uses treatments','Product categories in use',5),
  ('product_category','styler','Uses stylers','Product categories in use',6),
  ('product_category','oil','Uses oils','Product categories in use',7),
  ('product_category','gel','Uses gels','Product categories in use',8),
  ('goal_focus','length_retention','Goal: length retention','Goal focus',1),
  ('goal_focus','moisture','Goal: moisture','Goal focus',2),
  ('goal_focus','strength','Goal: strength','Goal focus',3),
  ('goal_focus','scalp_health','Goal: scalp health','Goal focus',4),
  ('goal_focus','trim','Goal: trims and ends','Goal focus',5)
ON CONFLICT DO NOTHING;

-- Deterministic slug used for style value codes.
CREATE OR REPLACE FUNCTION public.ad_style_code(_style text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(trim(both '_' from regexp_replace(lower(coalesce(_style,'')), '[^a-z0-9]+', '_', 'g')), '')
$$;

INSERT INTO public.ad_targeting_attributes (attribute_key, value_code, label, attribute_label, sort_order)
SELECT k.key, public.ad_style_code(s.label), s.label, k.attr_label, s.ord
FROM (VALUES
  ('current_style','Current style'),
  ('planned_style','Planned next style')
) AS k(key, attr_label)
CROSS JOIN (VALUES
  ('Loose natural',1),('TWA',2),('Wash and go',3),('Twist-out',4),
  ('Low manipulation natural style',5),('Braid-out',6),('Finger comb coils',7),
  ('Bantu knots',8),('Bantu knot-out',9),('Afro puff',10),
  ('Low natural ponytail',11),('High natural ponytail',12),('Low bun',13),('High bun',14),
  ('Flat twists',15),('Two-strand twists',16),('Mini twists',17),('Passion / rope twists',18),
  ('Twists',19),('Box braids',20),('Knotless braids',21),('Cornrows',22),
  ('Straight back cornrows',23),('Faux locs',24),('Locs',25),
  ('Wig / unit',26),('Weave / sew-in',27),('Crochet braids',28),
  ('Silk press',29),('Relaxed',30),('Texturised',31),('Curly perm',32)
) AS s(label, ord)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AUDIENCE FLOOR
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ad_audience_floor()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CAMPAIGN TARGETING SPEC — selected values only, FK-constrained to the
--    allowlist. Within an attribute: OR. Across attributes: AND.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_offer_targeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  attribute_key text NOT NULL,
  value_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, attribute_key, value_code),
  FOREIGN KEY (attribute_key, value_code)
    REFERENCES public.ad_targeting_attributes(attribute_key, value_code) ON DELETE RESTRICT
);
GRANT SELECT, INSERT, DELETE ON public.brand_offer_targeting TO authenticated;
GRANT ALL ON public.brand_offer_targeting TO service_role;
ALTER TABLE public.brand_offer_targeting ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own targeting" ON public.brand_offer_targeting
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = offer_id AND o.brand_user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
  );
CREATE POLICY "Owners add targeting before launch" ON public.brand_offer_targeting
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = offer_id AND o.brand_user_id = auth.uid()
        AND o.status IN ('draft','under_review')
    )
  );
CREATE POLICY "Owners remove targeting before launch" ON public.brand_offer_targeting
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = offer_id AND o.brand_user_id = auth.uid()
        AND o.status IN ('draft','under_review')
    )
    OR public.has_role(auth.uid(),'admin')
  );
CREATE INDEX IF NOT EXISTS brand_offer_targeting_offer_idx ON public.brand_offer_targeting(offer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CACHED AUDIENCE — resolved at approval, refreshed nightly. Brands can
--    NEVER select from this table: no policy grants them access.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_offer_audience (
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  match_reason text[] NOT NULL DEFAULT '{}',
  resolved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, user_id)
);
GRANT ALL ON public.ad_offer_audience TO service_role;
ALTER TABLE public.ad_offer_audience ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read only their own membership" ON public.ad_offer_audience
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT SELECT ON public.ad_offer_audience TO authenticated;
CREATE INDEX IF NOT EXISTS ad_offer_audience_user_idx ON public.ad_offer_audience(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PERMANENT "not relevant to my hair" DISMISSALS (offer + member)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_offer_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, offer_id)
);
GRANT SELECT, INSERT ON public.ad_offer_dismissals TO authenticated;
GRANT ALL ON public.ad_offer_dismissals TO service_role;
ALTER TABLE public.ad_offer_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own ad dismissals" ON public.ad_offer_dismissals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members create own ad dismissals" ON public.ad_offer_dismissals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. MEMBER ATTRIBUTE EXTRACTION — allowlisted columns only.
--    Reads ONLY: user_hair_profile.porosity/density/diameter/surface_texture/
--    length_bucket, wash_days.wash_date, user_products.category,
--    user_style_profile.current_hairstyle/planned_next_style, user_goals.kind.
--    Every emitted pair must exist in ad_targeting_attributes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ad_goal_focus_code(_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _kind IS NULL THEN NULL
    WHEN lower(_kind) LIKE '%length%' OR lower(_kind) LIKE '%retention%' THEN 'length_retention'
    WHEN lower(_kind) LIKE '%moist%' OR lower(_kind) LIKE '%hydrat%' THEN 'moisture'
    WHEN lower(_kind) LIKE '%strength%' OR lower(_kind) LIKE '%breakage%' THEN 'strength'
    WHEN lower(_kind) LIKE '%scalp%' THEN 'scalp_health'
    WHEN lower(_kind) LIKE '%trim%' THEN 'trim'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.ad_member_attribute_codes(_user_id uuid)
RETURNS TABLE(attribute_key text, value_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hp AS (
    SELECT porosity, density, diameter, surface_texture, length_bucket
    FROM public.user_hair_profile WHERE user_id = _user_id LIMIT 1
  ),
  sp AS (
    SELECT current_hairstyle, planned_next_style
    FROM public.user_style_profile WHERE user_id = _user_id LIMIT 1
  ),
  wd AS (
    SELECT count(*)::int AS cnt,
           CASE WHEN count(*) > 1
                THEN (max(wash_date) - min(wash_date))::numeric / (count(*) - 1)
                ELSE NULL END AS gap
    FROM public.wash_days
    WHERE user_id = _user_id AND wash_date >= current_date - interval '180 days'
  ),
  raw AS (
    SELECT 'porosity'::text AS k,
           CASE WHEN porosity ILIKE 'low%' THEN 'low' WHEN porosity ILIKE 'high%' THEN 'high' END AS v FROM hp
    UNION ALL SELECT 'density', lower(nullif(density,'')) FROM hp
    UNION ALL SELECT 'diameter', lower(nullif(diameter,'')) FROM hp
    UNION ALL SELECT 'texture',
      CASE WHEN surface_texture ILIKE 'rough%' THEN 'rough'
           WHEN surface_texture ILIKE 'silky%' THEN 'silky'
           WHEN surface_texture ILIKE 'medium%' THEN 'medium' END FROM hp
    UNION ALL SELECT 'length',
      CASE WHEN length_bucket ILIKE 'TWA%' THEN 'twa'
           WHEN length_bucket ILIKE 'Ear%' THEN 'ear'
           WHEN length_bucket ILIKE 'Chin%' THEN 'chin'
           WHEN length_bucket ILIKE 'Shoulder%' THEN 'shoulder'
           WHEN length_bucket ILIKE 'Armpit%' THEN 'armpit'
           WHEN length_bucket ILIKE 'Mid-back%' THEN 'midback'
           WHEN length_bucket ILIKE 'Waist%' THEN 'waist'
           WHEN length_bucket ILIKE 'Hip%' THEN 'hip' END FROM hp
    UNION ALL SELECT 'wash_freq',
      CASE WHEN gap IS NULL THEN NULL
           WHEN gap <= 8 THEN 'weekly'
           WHEN gap <= 17 THEN 'fortnightly'
           WHEN gap <= 35 THEN 'monthly'
           ELSE 'infrequent' END FROM wd
    UNION ALL SELECT 'current_style', public.ad_style_code(current_hairstyle) FROM sp
    UNION ALL SELECT 'planned_style', public.ad_style_code(planned_next_style) FROM sp
    UNION ALL SELECT DISTINCT 'product_category', lower(up.category)
      FROM public.user_products up
      WHERE up.user_id = _user_id AND up.on_shelf AND up.category IS NOT NULL
    UNION ALL SELECT DISTINCT 'goal_focus', public.ad_goal_focus_code(g.kind)
      FROM public.user_goals g
      WHERE g.user_id = _user_id AND coalesce(g.status,'active') = 'active'
  )
  SELECT r.k, r.v
  FROM raw r
  JOIN public.ad_targeting_attributes a
    ON a.attribute_key = r.k AND a.value_code = r.v
  WHERE r.v IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.ad_member_attribute_codes(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. MATCHING — hard filters only, consenting members only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ad_match_users(_rules jsonb)
RETURNS TABLE(user_id uuid, match_reason text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_keys text[];
BEGIN
  SELECT array_agg(k) INTO v_keys
  FROM (
    SELECT key AS k FROM jsonb_each(coalesce(_rules,'{}'::jsonb))
    WHERE jsonb_array_length(value) > 0
      AND EXISTS (SELECT 1 FROM public.ad_targeting_attributes a WHERE a.attribute_key = key)
  ) s;

  IF v_keys IS NULL OR array_length(v_keys,1) = 0 THEN
    RETURN;  -- no targeting = broad placement, nobody is "matched"
  END IF;

  RETURN QUERY
  WITH consenting AS (
    SELECT p.user_id FROM public.profiles p
    WHERE p.personalised_offers_consent = true
      AND coalesce(p.access_restricted,false) = false
  ),
  spec AS (
    SELECT e.key AS attribute_key, v.value_code
    FROM jsonb_each(_rules) e
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(e.value) AS value_code
    ) v
    JOIN public.ad_targeting_attributes a
      ON a.attribute_key = e.key AND a.value_code = v.value_code
  ),
  hits AS (
    SELECT c.user_id, m.attribute_key, m.value_code
    FROM consenting c
    CROSS JOIN LATERAL public.ad_member_attribute_codes(c.user_id) m
    JOIN spec s ON s.attribute_key = m.attribute_key AND s.value_code = m.value_code
  )
  SELECT h.user_id,
         array_agg(DISTINCT h.attribute_key || '_' || h.value_code ORDER BY h.attribute_key || '_' || h.value_code)
  FROM hits h
  GROUP BY h.user_id
  HAVING count(DISTINCT h.attribute_key) = array_length(v_keys,1);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ad_match_users(jsonb) FROM PUBLIC, anon, authenticated;

-- Rules for a stored offer, as jsonb {attribute_key: [codes]}
CREATE OR REPLACE FUNCTION public.ad_offer_rules(_offer_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(attribute_key, codes), '{}'::jsonb)
  FROM (
    SELECT attribute_key, jsonb_agg(value_code ORDER BY value_code) AS codes
    FROM public.brand_offer_targeting WHERE offer_id = _offer_id
    GROUP BY attribute_key
  ) s;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. REACH ESTIMATE — suppressed below the floor, at the data layer.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ad_estimate_reach(_rules jsonb)
RETURNS TABLE(reach integer, meets_floor boolean, audience_floor integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_min integer := public.ad_audience_floor();
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT count(*)::int INTO v_n FROM public.ad_match_users(_rules);
  RETURN QUERY SELECT
    CASE WHEN v_n >= v_min THEN v_n ELSE NULL END,
    v_n >= v_min,
    v_min;
END;
$$;

CREATE OR REPLACE FUNCTION public.ad_offer_reach(_offer_id uuid)
RETURNS TABLE(reach integer, meets_floor boolean, audience_floor integer, is_targeted boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_min integer := public.ad_audience_floor();
  v_rules jsonb;
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = _offer_id AND (o.brand_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  v_rules := public.ad_offer_rules(_offer_id);
  IF v_rules = '{}'::jsonb THEN
    RETURN QUERY SELECT NULL::integer, true, v_min, false;
    RETURN;
  END IF;
  SELECT count(*)::int INTO v_n FROM public.ad_match_users(v_rules);
  RETURN QUERY SELECT
    CASE WHEN v_n >= v_min THEN v_n ELSE NULL END,
    v_n >= v_min,
    v_min,
    true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. SEGMENT RESOLUTION — once at approval, refreshed nightly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_ad_offer_audience(_offer_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rules jsonb := public.ad_offer_rules(_offer_id);
  v_n integer;
BEGIN
  DELETE FROM public.ad_offer_audience WHERE offer_id = _offer_id;
  IF v_rules = '{}'::jsonb THEN RETURN 0; END IF;

  INSERT INTO public.ad_offer_audience (offer_id, user_id, match_reason, resolved_at)
  SELECT _offer_id, m.user_id, m.match_reason, now()
  FROM public.ad_match_users(v_rules) m;

  SELECT count(*)::int INTO v_n FROM public.ad_offer_audience WHERE offer_id = _offer_id;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_ad_offer_audience(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_ad_audiences()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_offers integer := 0;
BEGIN
  -- Withdrawn consent is removed from every cached segment on refresh; the
  -- delivery path already suppresses it immediately.
  DELETE FROM public.ad_offer_audience a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = a.user_id AND p.personalised_offers_consent = true
  );

  FOR r IN
    SELECT DISTINCT o.id FROM public.brand_offers o
    JOIN public.brand_offer_targeting t ON t.offer_id = o.id
    WHERE o.status IN ('approved_unpaid','paid_scheduled','live')
  LOOP
    PERFORM public.resolve_ad_offer_audience(r.id);
    v_offers := v_offers + 1;
  END LOOP;
  RETURN v_offers;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_ad_audiences() FROM PUBLIC, anon, authenticated;

-- Floor enforcement + resolution on status change.
CREATE OR REPLACE FUNCTION public.brand_offer_targeting_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rules jsonb;
  v_n integer;
  v_min integer := public.ad_audience_floor();
BEGIN
  v_rules := public.ad_offer_rules(NEW.id);
  IF v_rules = '{}'::jsonb THEN RETURN NEW; END IF;  -- broad placement

  IF NEW.status IN ('under_review','approved_unpaid','paid_scheduled','live')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT count(*)::int INTO v_n FROM public.ad_match_users(v_rules);
    IF v_n < v_min THEN
      RAISE EXCEPTION 'Targeted audience too small: a targeted campaign needs at least % matching members.', v_min;
    END IF;
    IF NEW.status IN ('approved_unpaid','paid_scheduled','live') THEN
      PERFORM public.resolve_ad_offer_audience(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brand_offers_targeting_guard ON public.brand_offers;
CREATE TRIGGER brand_offers_targeting_guard
  AFTER INSERT OR UPDATE OF status ON public.brand_offers
  FOR EACH ROW EXECUTE FUNCTION public.brand_offer_targeting_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. CONSENT WRITE PATH — logs every change; withdrawal purges cached segments
--     immediately rather than waiting for the nightly refresh.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_personalised_offers_consent(_on boolean, _source text DEFAULT 'settings')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  UPDATE public.profiles
  SET personalised_offers_consent = coalesce(_on,false),
      consent_updated_at = now()
  WHERE user_id = v_user;

  INSERT INTO public.ad_consent_log (user_id, consent_given, source)
  VALUES (v_user, coalesce(_on,false), coalesce(_source,'settings'));

  IF coalesce(_on,false) = false THEN
    DELETE FROM public.ad_offer_audience WHERE user_id = v_user;
  END IF;

  RETURN coalesce(_on,false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_personalised_offers_consent(boolean, text) FROM PUBLIC, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. DELIVERY — deterministic query against the cached segment. No LLM, no
--     re-resolution. Consent is re-checked live so withdrawal takes effect now.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ad_delivery_for_slot(_slot text)
RETURNS TABLE(offer_id uuid, was_matched boolean, match_reason text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_consent boolean := false;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  SELECT coalesce(p.personalised_offers_consent,false) INTO v_consent
  FROM public.profiles p WHERE p.user_id = v_user;

  RETURN QUERY
  WITH candidates AS (
    SELECT DISTINCT o.id,
           EXISTS (SELECT 1 FROM public.brand_offer_targeting t WHERE t.offer_id = o.id) AS targeted
    FROM public.brand_offer_placements pl
    JOIN public.brand_offers o ON o.id = pl.offer_id
    WHERE pl.slot = _slot
      AND pl.placement_date = v_today
      AND o.status IN ('paid_scheduled','live')
      AND o.starts_on <= v_today
      AND o.ends_on >= v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.ad_offer_dismissals d
        WHERE d.offer_id = o.id AND d.user_id = v_user
      )
  ),
  eligible AS (
    SELECT c.id, true AS matched, aud.match_reason
    FROM candidates c
    JOIN public.ad_offer_audience aud ON aud.offer_id = c.id AND aud.user_id = v_user
    WHERE c.targeted AND v_consent
    UNION ALL
    SELECT c.id, false, NULL::text[]
    FROM candidates c
    WHERE NOT c.targeted
  )
  SELECT e.id,
         CASE WHEN e.matched THEN true ELSE NULL END,
         CASE WHEN e.matched THEN e.match_reason ELSE NULL END
  FROM eligible e
  ORDER BY e.matched DESC, e.id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.ad_dismiss_offer(_offer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.ad_offer_dismissals (user_id, offer_id)
  VALUES (v_user, _offer_id)
  ON CONFLICT (user_id, offer_id) DO NOTHING;
  DELETE FROM public.ad_offer_audience WHERE user_id = v_user AND offer_id = _offer_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ad_delivery_for_slot(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ad_dismiss_offer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ad_estimate_reach(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ad_offer_reach(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ad_offer_rules(uuid) FROM PUBLIC, anon;