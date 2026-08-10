-- =====================================================================
-- 1. ADMIN-AUTHORED PLANS
-- =====================================================================

CREATE TYPE public.treatment_assigner_type AS ENUM ('professional', 'admin');

ALTER TABLE public.treatment_plan_assignments
  ADD COLUMN assigner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN assigner_type public.treatment_assigner_type;

-- Backfill: every existing row was professional-authored.
UPDATE public.treatment_plan_assignments
   SET assigner_user_id = professional_id,
       assigner_type    = 'professional'
 WHERE assigner_user_id IS NULL;

ALTER TABLE public.treatment_plan_assignments
  ALTER COLUMN assigner_user_id SET NOT NULL,
  ALTER COLUMN assigner_type SET NOT NULL,
  ALTER COLUMN professional_id DROP NOT NULL;

-- An admin-assigned plan has no professional; a professional-assigned one must
-- name the professional and that professional must be the assigner.
ALTER TABLE public.treatment_plan_assignments
  ADD CONSTRAINT treatment_plan_assignments_assigner_shape CHECK (
    (assigner_type = 'professional' AND professional_id IS NOT NULL AND professional_id = assigner_user_id)
    OR
    (assigner_type = 'admin' AND professional_id IS NULL)
  );

CREATE INDEX treatment_plan_assignments_assigner_idx
  ON public.treatment_plan_assignments (plan_id, assigner_user_id, status);

-- Assigners (professional or admin) manage their own assignment rows.
DROP POLICY IF EXISTS "Pros manage own assignments" ON public.treatment_plan_assignments;
CREATE POLICY "Assigners manage own assignments"
  ON public.treatment_plan_assignments
  TO authenticated
  USING (auth.uid() = assigner_user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = assigner_user_id OR public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- Templates may be owned by a professional or by an admin.
-- ---------------------------------------------------------------------
ALTER TABLE public.treatment_plan_templates
  ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN owner_type public.treatment_assigner_type;

UPDATE public.treatment_plan_templates
   SET owner_user_id = professional_id,
       owner_type    = 'professional'
 WHERE owner_user_id IS NULL;

ALTER TABLE public.treatment_plan_templates
  ALTER COLUMN owner_user_id SET NOT NULL,
  ALTER COLUMN owner_type SET NOT NULL,
  ALTER COLUMN professional_id DROP NOT NULL;

ALTER TABLE public.treatment_plan_templates
  ADD CONSTRAINT treatment_plan_templates_owner_shape CHECK (
    (owner_type = 'professional' AND professional_id IS NOT NULL AND professional_id = owner_user_id)
    OR
    (owner_type = 'admin' AND professional_id IS NULL)
  );

DROP POLICY IF EXISTS "Pros manage own templates" ON public.treatment_plan_templates;
CREATE POLICY "Owners manage own templates"
  ON public.treatment_plan_templates
  TO authenticated
  USING (auth.uid() = owner_user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = owner_user_id OR public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- has_accepted_plan_access — an admin assigner gets the same accepted
-- assignment read path a professional does.
--
-- The ONLY door to a client's plan data is an accepted assignment naming
-- the caller. Tags (professional tags, brand tags) are references and are
-- deliberately absent from this function. Do not add them.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_accepted_plan_access(_plan_id uuid, _pro uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _pro IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.treatment_plan_assignments a
      WHERE a.plan_id = _plan_id
        AND a.status = 'accepted'
        AND (
          (a.assigner_type = 'professional' AND a.professional_id = _pro)
          OR
          (a.assigner_type = 'admin' AND a.assigner_user_id = _pro AND public.has_role(_pro, 'admin'))
        )
    )
    AND (public.has_role(_pro, 'admin') OR public.has_professional_undertaking(_pro))
$function$;

-- ---------------------------------------------------------------------
-- has_media_access — DELIBERATE DESIGN NOTE, DO NOT "TIDY" THIS AWAY.
--
-- Admin access to treatment plan media is intentional. STRAND admins may
-- reach media for support and safety purposes, and that access is
-- INDEPENDENT of the client's media_sharing_consent flag: revoking media
-- consent removes PROFESSIONAL read access, never admin read access.
-- The user-facing consent copy must disclose this to the client.
--
-- Media consent is a second, separate gate on top of plan access for
-- professionals. Brand tags and professional tags confer nothing here and
-- must never be referenced in this function.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_media_access(_plan_id uuid, _pro uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _pro IS NOT NULL
    AND (
      -- Admins: by design, consent-independent (see note above).
      public.has_role(_pro, 'admin')
      OR
      EXISTS (
        SELECT 1 FROM public.treatment_plan_assignments a
        WHERE a.plan_id = _plan_id
          AND a.professional_id = _pro
          AND a.status = 'accepted'
          AND a.media_sharing_consent = true
          AND a.media_consent_revoked_at IS NULL
      )
    )
    AND (public.has_role(_pro, 'admin') OR public.has_professional_undertaking(_pro))
$function$;

-- =====================================================================
-- 2. TAGGING PROFESSIONALS ON A PLAN
--
-- A TAG IS A REFERENCE, NOT A PERMISSION.
-- Being tagged here grants the professional NO read access to the plan,
-- its schedule, products, entries, check-ins or media. Access requires an
-- accepted assignment (public.has_accepted_plan_access). This table is
-- deliberately NOT referenced by has_accepted_plan_access or
-- has_media_access, and must never be added to them.
-- =====================================================================

CREATE TABLE public.treatment_plan_professional_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  tagged_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, professional_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_professional_tags TO authenticated;
GRANT ALL ON public.treatment_plan_professional_tags TO service_role;

ALTER TABLE public.treatment_plan_professional_tags ENABLE ROW LEVEL SECURITY;

-- The plan owner manages tags on their own plan.
CREATE POLICY "Clients manage tags on own plans"
  ON public.treatment_plan_professional_tags
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.treatment_plans p
    WHERE p.id = plan_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.treatment_plans p
    WHERE p.id = plan_id AND p.user_id = auth.uid()
  ));

-- Anyone who already has legitimate plan access may read and manage tags.
-- Note the direction: plan access grants tag visibility. A tag NEVER grants
-- plan access.
CREATE POLICY "Assigned readers manage plan tags"
  ON public.treatment_plan_professional_tags
  TO authenticated
  USING (public.has_accepted_plan_access(plan_id))
  WITH CHECK (public.has_accepted_plan_access(plan_id));

-- A tagged professional may see that they have been tagged, and nothing more.
-- There is intentionally no policy anywhere that lets this row widen their
-- access to the plan itself.
CREATE POLICY "Tagged pro sees own tag only"
  ON public.treatment_plan_professional_tags
  FOR SELECT
  TO authenticated
  USING (auth.uid() = professional_id);

CREATE POLICY "Admins manage plan professional tags"
  ON public.treatment_plan_professional_tags
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 3. BRAND TAGGING, APP-WIDE (polymorphic)
--
-- The brands table in this project is public.brand_profiles.
--
-- A BRAND TAG CONFERS ZERO READ ACCESS ON THE TAGGED RECORD.
-- A brand may read brand_tags rows naming its own brand. It can never read
-- through to the target: not the treatment plan, its owner, schedule,
-- entries, check-ins or media, and not a wash day, style entry or product.
-- This table is deliberately NOT referenced by has_accepted_plan_access,
-- has_media_access or any other access helper, and must never be.
-- =====================================================================

CREATE TYPE public.brand_tag_type AS ENUM ('editorial', 'promoted');

CREATE TABLE public.brand_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  -- Polymorphic target. taggable_type is constrained to a known allow-list
  -- mapping onto real tables:
  --   treatment_plan         -> public.treatment_plans
  --   treatment_plan_product -> public.treatment_plan_products
  --   wash_day               -> public.wash_days
  --   style_entry            -> public.journal_entries
  --   glossary_term          -> public.glossary_terms
  taggable_type text NOT NULL,
  taggable_id uuid NOT NULL,
  tag_type public.brand_tag_type NOT NULL,
  disclosure_label text,
  promotion_starts_on date,
  promotion_ends_on date,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_tags_taggable_type_allowed CHECK (
    taggable_type IN ('treatment_plan', 'treatment_plan_product', 'wash_day', 'style_entry', 'glossary_term')
  ),
  -- A paid placement can never exist without a disclosure string attached.
  CONSTRAINT brand_tags_promoted_requires_disclosure CHECK (
    tag_type <> 'promoted'
    OR (disclosure_label IS NOT NULL AND btrim(disclosure_label) <> '')
  ),
  UNIQUE (brand_id, taggable_type, taggable_id, tag_type)
);

CREATE INDEX brand_tags_taggable_idx ON public.brand_tags (taggable_type, taggable_id);
CREATE INDEX brand_tags_brand_idx ON public.brand_tags (brand_id);

CREATE TRIGGER trg_brand_tags_updated
  BEFORE UPDATE ON public.brand_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_tags TO authenticated;
GRANT ALL ON public.brand_tags TO service_role;

ALTER TABLE public.brand_tags ENABLE ROW LEVEL SECURITY;

-- Resolves the owning member of a polymorphic target. Used only to decide who
-- may create an EDITORIAL tag on their own record. It never grants anyone read
-- access to the target itself.
CREATE OR REPLACE FUNCTION public.brand_tag_target_owner(_taggable_type text, _taggable_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE _taggable_type
    WHEN 'treatment_plan' THEN (SELECT p.user_id FROM public.treatment_plans p WHERE p.id = _taggable_id)
    WHEN 'treatment_plan_product' THEN (
      SELECT p.user_id FROM public.treatment_plans p
      JOIN public.treatment_plan_products pp ON pp.plan_id = p.id
      WHERE pp.id = _taggable_id
    )
    WHEN 'wash_day' THEN (SELECT w.user_id FROM public.wash_days w WHERE w.id = _taggable_id)
    WHEN 'style_entry' THEN (SELECT j.user_id FROM public.journal_entries j WHERE j.id = _taggable_id)
    ELSE NULL  -- glossary_term and anything else: platform-owned, admin only
  END
$function$;

-- Admins: full control, and the ONLY role that may create or change a
-- 'promoted' (paid placement) tag. A brand must not be able to promote itself
-- into a clinical protocol, and a professional must not be able to sell
-- placement inside one.
CREATE POLICY "Admins manage all brand tags"
  ON public.brand_tags
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Record owners may create an EDITORIAL tag on their own record. The
-- tag_type = 'editorial' condition is what keeps paid placement admin-only.
CREATE POLICY "Owners create editorial brand tags"
  ON public.brand_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tag_type = 'editorial'
    AND auth.uid() = created_by_user_id
    AND public.brand_tag_target_owner(taggable_type, taggable_id) = auth.uid()
  );

CREATE POLICY "Owners update own editorial brand tags"
  ON public.brand_tags
  FOR UPDATE
  TO authenticated
  USING (
    tag_type = 'editorial'
    AND public.brand_tag_target_owner(taggable_type, taggable_id) = auth.uid()
  )
  WITH CHECK (
    tag_type = 'editorial'
    AND public.brand_tag_target_owner(taggable_type, taggable_id) = auth.uid()
  );

CREATE POLICY "Owners delete own editorial brand tags"
  ON public.brand_tags
  FOR DELETE
  TO authenticated
  USING (
    tag_type = 'editorial'
    AND public.brand_tag_target_owner(taggable_type, taggable_id) = auth.uid()
  );

CREATE POLICY "Owners read brand tags on own records"
  ON public.brand_tags
  FOR SELECT
  TO authenticated
  USING (public.brand_tag_target_owner(taggable_type, taggable_id) = auth.uid());

-- A brand may see WHERE it has been tagged — this row and nothing else. There
-- is deliberately no accompanying policy on treatment_plans, wash_days,
-- journal_entries or any media table keyed off brand_tags.
CREATE POLICY "Brands read own brand tags"
  ON public.brand_tags
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.brand_profiles b
    WHERE b.id = brand_id AND b.user_id = auth.uid()
  ));