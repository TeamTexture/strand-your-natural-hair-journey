
ALTER TABLE public.brand_offers
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'brand',
  ADD COLUMN IF NOT EXISTS attached_pro_offer_id uuid,
  ADD COLUMN IF NOT EXISTS attached_booking_url text;

ALTER TABLE public.brand_offers DROP CONSTRAINT IF EXISTS brand_offers_owner_type_check;
ALTER TABLE public.brand_offers
  ADD CONSTRAINT brand_offers_owner_type_check CHECK (owner_type IN ('brand','pro'));

ALTER TABLE public.brand_offers DROP CONSTRAINT IF EXISTS brand_offers_attached_pro_offer_id_fkey;
ALTER TABLE public.brand_offers
  ADD CONSTRAINT brand_offers_attached_pro_offer_id_fkey
    FOREIGN KEY (attached_pro_offer_id) REFERENCES public.pro_offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brand_offers_owner_type ON public.brand_offers (owner_type);

DROP FUNCTION IF EXISTS public.brand_taken_placements();

CREATE OR REPLACE FUNCTION public.brand_taken_placements()
 RETURNS TABLE(
   slot brand_placement_slot,
   placement_date date,
   offer_id uuid,
   status brand_offer_status,
   owner_type text,
   owner_display_name text
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
    END AS owner_display_name
  FROM public.brand_offer_placements p
  JOIN public.brand_offers o ON o.id = p.offer_id
  LEFT JOIN public.brand_profiles bp ON bp.user_id = o.brand_user_id
  LEFT JOIN public.pro_profiles pp   ON pp.user_id = o.brand_user_id
  LEFT JOIN public.profiles pr_prof  ON pr_prof.user_id = o.brand_user_id
  WHERE o.status IN ('under_review','approved_unpaid','paid_scheduled','live')
    AND auth.uid() IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION public.has_active_promotion_eligibility(_user uuid, _owner_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    NOT public.is_access_restricted(_user)
    AND (
      public.has_role(_user, 'admin')
      OR (_owner_type = 'brand' AND public.has_active_brand_subscription(_user))
      OR (_owner_type = 'pro'   AND public.has_active_pro_subscription(_user))
    )
$function$;

UPDATE public.brand_offers SET owner_type = 'brand' WHERE owner_type IS NULL OR owner_type = '';
