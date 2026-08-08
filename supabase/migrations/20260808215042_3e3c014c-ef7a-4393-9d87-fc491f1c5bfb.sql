CREATE OR REPLACE FUNCTION public.brand_offer_one_product_on_submit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  -- ONE OR TWO PRODUCTS PER ADVERT. Both attached products render on the
  -- advert, each with its own personalised tip. Zero is not an advert, and
  -- three or more cannot be rendered readably.
  IF NEW.status = 'under_review' AND COALESCE(OLD.status::text, '') <> 'under_review' THEN
    SELECT count(*) INTO v_count FROM public.brand_offer_products bop WHERE bop.offer_id = NEW.id;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'An advert must promote at least one product. Attach a product before submitting.';
    END IF;
    IF v_count > 2 THEN
      RAISE EXCEPTION 'An advert can promote at most two products. Remove the extra attached items before submitting.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;