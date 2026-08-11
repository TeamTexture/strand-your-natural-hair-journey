-- 1. pro_offers: remove anonymous read of discount codes
DROP POLICY IF EXISTS "Public reads active offers of published pros" ON public.pro_offers;
REVOKE SELECT ON public.pro_offers FROM anon;

-- 2. brand_offer_stats_legacy: remove unscoped authenticated writes
DROP POLICY IF EXISTS "Consumers can insert stats for active offers" ON public.brand_offer_stats_legacy;
DROP POLICY IF EXISTS "Consumers can update stats for active offers" ON public.brand_offer_stats_legacy;
REVOKE INSERT, UPDATE, DELETE ON public.brand_offer_stats_legacy FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.brand_offer_stats_legacy FROM anon;
GRANT ALL ON public.brand_offer_stats_legacy TO service_role;

-- 3. Fix mutable search_path
ALTER FUNCTION public.brand_count_min_threshold() SET search_path = public;
ALTER FUNCTION public.ad_audience_floor() SET search_path = public;

-- 4. Revoke anon EXECUTE on SECURITY DEFINER functions (all are signed-in only features)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f.sig);
  END LOOP;
END $$;