CREATE OR REPLACE FUNCTION public.brand_placement_no_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_status public.brand_offer_status;
BEGIN
  SELECT status INTO new_status FROM public.brand_offers WHERE id = NEW.offer_id;
  IF new_status IN ('under_review','approved_unpaid','paid_scheduled','live') THEN
    IF EXISTS (
      SELECT 1 FROM public.brand_offer_placements p
      JOIN public.brand_offers o ON o.id = p.offer_id
      WHERE p.slot = NEW.slot
        AND p.placement_date = NEW.placement_date
        AND p.id <> NEW.id
        AND p.offer_id <> NEW.offer_id
        AND o.status IN ('under_review','approved_unpaid','paid_scheduled','live')
    ) THEN
      RAISE EXCEPTION 'Placement slot % on % is already booked', NEW.slot, NEW.placement_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;