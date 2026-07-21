
-- RPC: returns slot/date/offer_id/status for every placement that should
-- block another brand from booking the same slot on the same day. We can't
-- rely on plain SELECT + RLS for this because `under_review` placements are
-- deliberately hidden from other brands' RLS view (they contain competing
-- creative). SECURITY DEFINER lets us expose only the minimal booking-window
-- fields any signed-in brand needs to render the calendar.
CREATE OR REPLACE FUNCTION public.brand_taken_placements()
RETURNS TABLE (
  slot public.brand_placement_slot,
  placement_date date,
  offer_id uuid,
  status public.brand_offer_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.slot, p.placement_date, p.offer_id, o.status
  FROM public.brand_offer_placements p
  JOIN public.brand_offers o ON o.id = p.offer_id
  WHERE o.status IN ('under_review','approved_unpaid','paid_scheduled','live')
    AND auth.uid() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.brand_taken_placements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_taken_placements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_taken_placements() TO service_role;

-- Tighten the no-overlap trigger: include 'under_review' so two brands can't
-- both submit pending offers for the same slot/date.
CREATE OR REPLACE FUNCTION public.brand_placement_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        AND o.status IN ('under_review','approved_unpaid','paid_scheduled','live')
    ) THEN
      RAISE EXCEPTION 'Placement slot % on % is already booked', NEW.slot, NEW.placement_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
