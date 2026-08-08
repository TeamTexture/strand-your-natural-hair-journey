CREATE OR REPLACE FUNCTION public.brand_offer_one_product_on_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count int;
BEGIN
  IF NEW.status = 'under_review' AND COALESCE(OLD.status::text, '') <> 'under_review' THEN
    SELECT (
      (SELECT count(*) FROM public.brand_offer_products bop WHERE bop.offer_id = NEW.id)
      + (SELECT count(*) FROM public.brand_products bp WHERE bp.offer_id = NEW.id)
    ) INTO v_count;
    IF v_count > 1 THEN
      RAISE EXCEPTION 'An advert can promote only one product. Remove the extra attached item before submitting.';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS brand_offers_one_product_on_submit ON public.brand_offers;
CREATE TRIGGER brand_offers_one_product_on_submit
BEFORE UPDATE ON public.brand_offers
FOR EACH ROW EXECUTE FUNCTION public.brand_offer_one_product_on_submit();