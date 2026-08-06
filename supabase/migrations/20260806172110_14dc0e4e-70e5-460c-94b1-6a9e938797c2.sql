-- Read-only index of approved + published brand products, with the brand name
-- attached, for the deterministic add-time resolver. No member data whatsoever.
CREATE OR REPLACE FUNCTION public.brand_product_match_index()
RETURNS TABLE(
  id uuid,
  name text,
  brand_name text,
  kind text,
  brand_user_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, bp.brand_name, p.kind, p.brand_user_id
  FROM public.brand_products p
  JOIN public.brand_profiles bp ON bp.user_id = p.brand_user_id
  WHERE p.approval_status = 'approved'
    AND p.is_published
    AND auth.uid() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.brand_product_match_index() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_product_match_index() TO authenticated, service_role;