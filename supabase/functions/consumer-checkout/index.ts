// deno-lint-ignore-file no-explicit-any
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
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const user = claimsData.claims;
    const userId = user.sub as string;
    const email = (user.email as string | undefined) ?? undefined;

    const body = await req.json().catch(() => ({})) as { next?: string };
    const nextPath = isSafeInternalPath(body.next) ? body.next : "/home";

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);

    // Resolve price id: prefer secret STRIPE_CONSUMER_PRICE_ID, fall back to platform_settings
    let priceId = Deno.env.get("STRIPE_CONSUMER_PRICE_ID") ?? "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (!priceId) {
      const { data: ps } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "stripe_consumer_price_id")
        .maybeSingle();
      priceId = (ps?.value as string | null) ?? "";
    }
    if (!priceId) return json({ error: "Stripe price id not configured" }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    // Reuse existing customer if we have one
    const { data: existing } = await admin
      .from("consumer_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { consumer_user_id: userId },
      });
      customerId = customer.id;
      await admin.from("consumer_subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          status: "none",
        },
        { onConflict: "user_id" },
      );
    }

    const origin = req.headers.get("origin") ?? "https://mystrand.co.uk";
    const nextParam = encodeURIComponent(nextPath);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/subscribe?checkout=success&next=${nextParam}`,
      cancel_url: `${origin}/subscribe?checkout=cancelled&next=${nextParam}`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { consumer_user_id: userId } },
    });

    return json({ url: session.url });
  } catch (e) {
    console.error("consumer-checkout error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSafeInternalPath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}
