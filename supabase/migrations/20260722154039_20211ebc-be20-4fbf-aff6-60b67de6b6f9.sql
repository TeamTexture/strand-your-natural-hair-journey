-- 1. Narrow brand_profiles read policy: drop the blanket "authenticated can read"
--    policy; the existing "Brand profile of active offer readable" policy still
--    exposes brands that have a live/paid offer, and brands + admins keep full
--    access via their own policies.
DROP POLICY IF EXISTS "Authenticated can read brand profiles" ON public.brand_profiles;

-- 2. Revoke anon EXECUTE on every SECURITY DEFINER function in the public
--    schema. Each function already validates auth.uid()/roles internally, so
--    keeping them callable only by authenticated + service_role removes the
--    anonymous attack surface flagged by the linter.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;