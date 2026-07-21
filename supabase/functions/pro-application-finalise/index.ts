// deno-lint-ignore-file no-explicit-any
// Verifies a Stripe checkout session succeeded and flips the linked
// pro_applications row to payment_confirmed_at = now(). Idempotent.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const { session_id } = await req.json().catch(() => ({}));
    if (!session_id || typeof session_id !== "string") {
      return json({ error: "session_id required" }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) return json({ error: "Session not found" }, 404);

    const sessUser = session.metadata?.pro_user_id as string | undefined;
    const appId = session.metadata?.pro_application_id as string | undefined;
    if (!sessUser || sessUser !== userId || !appId) {
      return json({ error: "Session does not belong to this user" }, 403);
    }

    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) return json({ ok: false, error: "Payment not completed yet" }, 200);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Flip payment_confirmed_at (idempotent — only when null)
    await admin
      .from("pro_applications")
      .update({
        payment_confirmed_at: new Date().toISOString(),
        status: "pending",
        stripe_checkout_session_id: session.id,
      })
      .eq("id", appId)
      .is("payment_confirmed_at", null);

    return json({ ok: true, application_id: appId });
  } catch (e) {
    console.error("pro-application-finalise error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
