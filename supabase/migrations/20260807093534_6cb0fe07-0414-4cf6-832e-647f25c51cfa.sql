-- 1. Visibility is never default-off. A product is visible when it is approved
--    and the brand has not deliberately hidden it.
ALTER TABLE public.brand_products ALTER COLUMN is_published SET DEFAULT true;

-- 2. Backfill: anything already approved but invisible because of the old
--    separate publish flag becomes visible now.
UPDATE public.brand_products
SET is_published = true
WHERE approval_status = 'approved' AND is_published IS NOT TRUE;

-- 3. Guard: approval publishes in the same action. Review state no longer
--    touches is_published at all, so it only ever reflects a deliberate
--    brand-side Hide.
CREATE OR REPLACE FUNCTION public.brand_products_guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean := public.has_role(auth.uid(), 'admin');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin THEN
      NEW.approval_status := 'pending';
      NEW.rejection_reason := NULL;
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
    END IF;
    -- Never default-off: visibility is gated by approval, not by a flag.
    IF NEW.is_published IS NULL THEN
      NEW.is_published := true;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT is_admin THEN
    -- A brand may never move its own product through review.
    NEW.approval_status := OLD.approval_status;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;

    -- Editing the substance of an approved product sends it back to review.
    -- The approval gate alone hides it; the brand's Hide choice is untouched.
    IF OLD.approval_status = 'approved' AND (
         NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.ingredients IS DISTINCT FROM OLD.ingredients
      OR NEW.key_features IS DISTINCT FROM OLD.key_features
      OR NEW.materials IS DISTINCT FROM OLD.materials
      OR NEW.image_urls IS DISTINCT FROM OLD.image_urls
      OR NEW.external_url IS DISTINCT FROM OLD.external_url
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.tool_kind IS DISTINCT FROM OLD.tool_kind
      OR NEW.ingredients_source IS DISTINCT FROM OLD.ingredients_source
    ) THEN
      NEW.approval_status := 'pending';
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
    END IF;
  ELSE
    IF NEW.approval_status = 'approved' AND OLD.approval_status <> 'approved' THEN
      NEW.approved_at := now();
      NEW.approved_by := auth.uid();
      NEW.rejection_reason := NULL;
      -- Approval is the single step. It publishes immediately.
      NEW.is_published := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;