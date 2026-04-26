// Shared CORS helpers. Replaces the 6 distinct cors patterns that existed
// across the 10 legacy edge functions before Phase 2 — inline corsHeaders
// objects, the broken `from "@supabase/supabase-js/cors"` import in
// heat-treatment-rationale, and the working esm.sh import in product-analyse.
// Audit PHASE_2_AUDIT.md §4.4.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Standard CORS preflight response — return from `req.method === "OPTIONS"` branches. */
export const preflight = (): Response =>
  new Response(null, { headers: corsHeaders });

/** JSON response with CORS headers + status. */
export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
