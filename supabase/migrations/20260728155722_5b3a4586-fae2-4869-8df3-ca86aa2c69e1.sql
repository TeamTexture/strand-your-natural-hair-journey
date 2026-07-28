DROP FUNCTION IF EXISTS public.brand_taken_placements();

CREATE OR REPLACE FUNCTION public.brand_taken_placements()
 RETURNS TABLE(
   slot brand_placement_slot,
   placement_date date,
   offer_id uuid,
   status brand_offer_status,
   owner_type text,
   owner_display_name text,
   starts_on date,
   ends_on date,
   headline text,
   is_mine boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.slot,
    p.placement_date,
    p.offer_id,
    o.status,
    o.owner_type,
    CASE
      WHEN o.owner_type = 'pro' THEN COALESCE(pp.display_name, pr_prof.display_name, 'Pro')
      ELSE COALESCE(bp.brand_name, pr_prof.display_name, 'Brand')
    END AS owner_display_name,
    o.starts_on,
    o.ends_on,
    o.headline,
    (o.brand_user_id = auth.uid()) AS is_mine
  FROM public.brand_offer_placements p
  JOIN public.brand_offers o ON o.id = p.offer_id
  LEFT JOIN public.brand_profiles bp ON bp.user_id = o.brand_user_id
  LEFT JOIN public.pro_profiles pp   ON pp.user_id = o.brand_user_id
  LEFT JOIN public.profiles pr_prof  ON pr_prof.user_id = o.brand_user_id
  WHERE o.status IN ('under_review','approved_unpaid','paid_scheduled','live')
    AND auth.uid() IS NOT NULL
$function$;

REVOKE ALL ON FUNCTION public.brand_taken_placements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_taken_placements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_taken_placements() TO service_role;