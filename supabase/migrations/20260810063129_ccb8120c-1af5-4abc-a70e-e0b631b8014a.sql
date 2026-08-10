-- Admin oversight of every treatment plan. SECURITY DEFINER because admins
-- deliberately do NOT hold a blanket read policy on treatment_plans: plan
-- content stays behind the client's own policy and the accepted-assignment
-- policy. This function returns plan-level facts only and no media rows.
CREATE OR REPLACE FUNCTION public.admin_treatment_plans()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN COALESCE(
    (SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC) FROM (
      SELECT jsonb_build_object(
        'plan_id', p.id,
        'created_at', p.created_at,
        'title', p.title,
        'start_date', p.start_date,
        'duration_weeks', p.duration_weeks,
        'status', p.status,
        'owner_user_id', p.user_id,
        'owner_name', COALESCE((SELECT pr.display_name FROM public.profiles pr WHERE pr.user_id = p.user_id), 'Member'),
        'source', COALESCE((
          SELECT a.assigner_type::text FROM public.treatment_plan_assignments a
          WHERE a.plan_id = p.id AND a.status = 'accepted' LIMIT 1), 'self'),
        'assigner_name', (
          SELECT COALESCE((SELECT pr.display_name FROM public.profiles pr WHERE pr.user_id = a.assigner_user_id), 'STRAND')
          FROM public.treatment_plan_assignments a WHERE a.plan_id = p.id AND a.status = 'accepted' LIMIT 1),
        'media_sharing_consent', COALESCE((
          SELECT a.media_sharing_consent AND a.media_consent_revoked_at IS NULL
          FROM public.treatment_plan_assignments a
          WHERE a.plan_id = p.id AND a.status = 'accepted' LIMIT 1), false),
        'schedule', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.treatment_plan_schedule s WHERE s.plan_id = p.id), '[]'::jsonb),
        'entries', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.treatment_plan_entries e WHERE e.plan_id = p.id), '[]'::jsonb),
        'pro_tags', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', t.id,
            'professional_id', t.professional_id,
            'label', t.label,
            'professional_name', COALESCE(
              (SELECT pf.display_name FROM public.pro_profiles pf WHERE pf.user_id = t.professional_id),
              (SELECT pr.display_name FROM public.profiles pr WHERE pr.user_id = t.professional_id),
              'Professional')
          ))
          FROM public.treatment_plan_professional_tags t WHERE t.plan_id = p.id), '[]'::jsonb)
      ) AS x
      FROM public.treatment_plans p
      WHERE p.status IN ('active', 'paused')
    ) q), '[]'::jsonb) ELSE '[]'::jsonb END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_treatment_plans() FROM anon;

-- Professionals an admin may credit on a plan.
CREATE OR REPLACE FUNCTION public.admin_professional_options()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
        'user_id', pf.user_id,
        'display_name', COALESCE(pf.display_name, 'Professional'),
        'discipline', pf.discipline::text)
      ORDER BY pf.display_name)
     FROM public.pro_profiles pf WHERE pf.user_id IS NOT NULL), '[]'::jsonb)
  ELSE '[]'::jsonb END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_professional_options() FROM anon;

-- Brand tags on one record, with the brand's public identity attached.
-- Visibility mirrors the brand_tags policies: the record owner, an admin, or a
-- professional with an accepted assignment on that plan. Never exposes anything
-- about the record itself.
CREATE OR REPLACE FUNCTION public.brand_tags_for(_taggable_type text, _taggable_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NOT NULL AND (
      public.has_role(auth.uid(), 'admin')
      OR public.brand_tag_target_owner(_taggable_type, _taggable_id) = auth.uid()
      OR (_taggable_type = 'treatment_plan' AND public.has_accepted_plan_access(_taggable_id))
    ) THEN COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'brand_id', t.brand_id,
        'brand_user_id', b.user_id,
        'brand_name', b.brand_name,
        'logo_path', b.logo_path,
        'tag_type', t.tag_type::text,
        'disclosure_label', t.disclosure_label,
        'promotion_starts_on', t.promotion_starts_on,
        'promotion_ends_on', t.promotion_ends_on)
      ORDER BY b.brand_name)
     FROM public.brand_tags t
     JOIN public.brand_profiles b ON b.id = t.brand_id
     WHERE t.taggable_type = _taggable_type AND t.taggable_id = _taggable_id), '[]'::jsonb)
  ELSE '[]'::jsonb END;
$$;

REVOKE EXECUTE ON FUNCTION public.brand_tags_for(text, uuid) FROM anon;

-- Brands an authenticated user may pick when tagging. Admins see every brand;
-- everyone else sees only brands already visible to them in the directory.
CREATE OR REPLACE FUNCTION public.brand_tag_options()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN '[]'::jsonb ELSE COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('id', b.id, 'brand_name', b.brand_name) ORDER BY b.brand_name)
     FROM public.brand_profiles b
     WHERE NOT b.hidden_from_directory
       AND (public.has_role(auth.uid(), 'admin') OR public.has_active_brand_subscription(b.user_id))
    ), '[]'::jsonb) END;
$$;

REVOKE EXECUTE ON FUNCTION public.brand_tag_options() FROM anon;