-- Restrict internal ai_citation_violations log to service_role only.
-- RLS is already enabled; adding an explicit deny policy for anon/authenticated
-- documents intent and satisfies the "policies must be defined" check.

REVOKE ALL ON public.ai_citation_violations FROM anon;
REVOKE ALL ON public.ai_citation_violations FROM authenticated;
GRANT ALL ON public.ai_citation_violations TO service_role;

-- Explicit deny for client roles. Service role bypasses RLS entirely, so edge
-- functions using the service key continue to insert logs unaffected.
DROP POLICY IF EXISTS "No client access to citation violations" ON public.ai_citation_violations;
CREATE POLICY "No client access to citation violations"
  ON public.ai_citation_violations
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);