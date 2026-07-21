// Brand — Stripe webhook. Handles checkout.session.completed with an
// idempotent transition on brand_offers.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const sig = req.headers.get("stripe-signature");
    const secret = Deno.env.get("STRIPE_BRAND_WEBHOOK_SECRET") ?? Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!sig || !secret) return new Response("Missing signature or secret", { status: 400 });
    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, sig, secret);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const offerId = (session.metadata as Record<string, string> | null)?.offer_id;
      if (offerId && session.payment_status === "paid") {
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

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 400 });
  }
});
