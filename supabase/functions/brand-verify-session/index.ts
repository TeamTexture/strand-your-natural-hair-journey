// Brand — verify a completed Stripe Checkout Session and mark the offer paid.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const { session_id } = await req.json();
    if (!session_id) return new Response(JSON.stringify({ error: "session_id required" }), { status: 400, headers: corsHeaders });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const paid = session.payment_status === "paid";

    if (paid) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const offerId = (session.metadata as Record<string, string> | null)?.offer_id;
      if (offerId) {
        const { data: cur } = await admin.from("brand_offers").select("status").eq("id", offerId).maybeSingle();
        if (cur && cur.status !== "paid_scheduled" && cur.status !== "live" && cur.status !== "ended") {
          await admin
            .from("brand_offers")
            .update({
              status: "paid_scheduled",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
            })
            .eq("id", offerId);
        }
      }
    }

    return new Response(JSON.stringify({ paid, status: session.payment_status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
