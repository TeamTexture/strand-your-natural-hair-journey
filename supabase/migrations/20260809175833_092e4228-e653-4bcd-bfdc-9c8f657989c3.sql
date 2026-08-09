DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_offers','brand_offer_placements','brand_products','brand_offer_products','ad_events','ad_stats_daily','brand_product_stats_daily','brand_offer_revisions']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;