// deno-lint-ignore-file no-explicit-any
// Brand — Stripe Checkout Session (mode: subscription) for the £99/year
// STRAND Brand Access membership. Uses STRIPE_BRAND_PRICE_ID.
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

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claimsData.claims.sub as string;
    const email = (claimsData.claims.email as string | undefined) ?? undefined;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);
    const priceId = Deno.env.get("STRIPE_BRAND_PRICE_ID");
    if (!priceId) return json({ error: "STRIPE_BRAND_PRICE_ID not configured" }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Reuse existing customer if we have one
    const { data: existing } = await admin
      .from("brand_subscriptions")
      .select("stripe_customer_id")
      .eq("brand_user_id", userId)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { brand_user_id: userId },
      });
      customerId = customer.id;
      await admin.from("brand_subscriptions").upsert(
        {
          brand_user_id: userId,
          stripe_customer_id: customerId,
          status: "none",
        },
        { onConflict: "brand_user_id" },
      );
    }

    let body: { next?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const next = typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/brand/billing";

    const origin = req.headers.get("origin") ?? "https://mystrand.co.uk";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/brand/billing?checkout=success&next=${encodeURIComponent(next)}`,
      cancel_url: `${origin}/brand/subscribe?checkout=cancelled`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { brand_user_id: userId } },
    });

    return json({ url: session.url });
  } catch (e) {
    console.error("brand-subscription-checkout error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
