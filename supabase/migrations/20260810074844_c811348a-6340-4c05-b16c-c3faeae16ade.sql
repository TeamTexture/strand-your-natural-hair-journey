ALTER TABLE public.brand_tags
  ADD COLUMN IF NOT EXISTS custom_brand_name text;

ALTER TABLE public.brand_tags ALTER COLUMN brand_id DROP NOT NULL;

ALTER TABLE public.brand_tags
  ADD CONSTRAINT brand_tags_brand_identity CHECK (
    brand_id IS NOT NULL
    OR (custom_brand_name IS NOT NULL AND btrim(custom_brand_name) <> '')
  );

-- A paid placement must always name a brand that exists on the platform.
ALTER TABLE public.brand_tags
  ADD CONSTRAINT brand_tags_promoted_requires_brand CHECK (
    tag_type <> 'promoted' OR brand_id IS NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS brand_tags_custom_unique
  ON public.brand_tags (taggable_type, taggable_id, lower(btrim(custom_brand_name)))
  WHERE brand_id IS NULL;

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
        'brand_name', COALESCE(b.brand_name, btrim(t.custom_brand_name)),
        'logo_path', b.logo_path,
        'tag_type', t.tag_type::text,
        'disclosure_label', t.disclosure_label,
        'promotion_starts_on', t.promotion_starts_on,
        'promotion_ends_on', t.promotion_ends_on)
      ORDER BY COALESCE(b.brand_name, btrim(t.custom_brand_name)))
     FROM public.brand_tags t
     LEFT JOIN public.brand_profiles b ON b.id = t.brand_id
     WHERE t.taggable_type = _taggable_type AND t.taggable_id = _taggable_id), '[]'::jsonb)
  ELSE '[]'::jsonb END;
$$;

REVOKE EXECUTE ON FUNCTION public.brand_tags_for(text, uuid) FROM anon;