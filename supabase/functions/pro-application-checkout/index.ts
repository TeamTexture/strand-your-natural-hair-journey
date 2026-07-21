// deno-lint-ignore-file no-explicit-any
// Creates a Stripe Checkout session for a professional application.
// Ties the checkout session to the pro_applications row via metadata so
// pro-application-finalise can mark it paid on return.
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
    const email = (claimsData.claims.email as string | undefined) ?? undefined;

    const { application_id } = await req.json().catch(() => ({}));
    if (!application_id || typeof application_id !== "string") {
      return json({ error: "application_id required" }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the application belongs to this user and is unpaid.
    const { data: app } = await admin
      .from("pro_applications")
      .select("id, user_id, payment_confirmed_at")
      .eq("id", application_id)
      .maybeSingle();
    if (!app || app.user_id !== userId) return json({ error: "Application not found" }, 404);
    if (app.payment_confirmed_at) return json({ error: "Already paid" }, 400);

    // Resolve price id
    let priceId = Deno.env.get("STRIPE_PRO_PRICE_ID") ?? "";
    if (!priceId) {
      const { data: ps } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "stripe_pro_price_id")
        .maybeSingle();
      priceId = (ps?.value as string | null) ?? "";
    }
    if (!priceId) return json({ error: "Stripe price id not configured" }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    // Reuse customer if one exists
    const { data: existingSub } = await admin
      .from("pro_subscriptions")
      .select("stripe_customer_id")
      .eq("pro_user_id", userId)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { pro_user_id: userId },
      });
      customerId = customer.id;
      await admin.from("pro_subscriptions").upsert(
        {
          pro_user_id: userId,
          stripe_customer_id: customerId,
          status: "none",
        },
        { onConflict: "pro_user_id" },
      );
    }

    const origin = req.headers.get("origin") ?? "https://mystrand.co.uk";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pro/apply/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pro/apply/confirmed?status=cancelled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          pro_user_id: userId,
          pro_application_id: application_id,
        },
      },
      metadata: {
        pro_user_id: userId,
        pro_application_id: application_id,
      },
    });

    // Stash the session id on the application for reference
    await admin
      .from("pro_applications")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", application_id);

    return json({ url: session.url });
  } catch (e) {
    console.error("pro-application-checkout error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
