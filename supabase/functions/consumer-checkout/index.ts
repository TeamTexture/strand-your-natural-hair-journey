// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { resolveStrandPlusPriceId } from "../_shared/stripe-prices.ts";
import {
  addToAbandonedList,
  removeFromPaywallList,
} from "../_shared/klaviyo-nurture.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Tier = "standard" | "plus";

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

    const user = claimsData.claims;
    const userId = user.sub as string;
    const email = (user.email as string | undefined) ?? undefined;

    const body = await req.json().catch(() => ({})) as {
      next?: string; tier?: Tier; trial?: boolean; returnTo?: string;
    };
    const nextPath = isSafeInternalPath(body.next) ? body.next : "/home";
    const tier: Tier = body.tier === "plus" ? "plus" : "standard";
    const wantsTrial = body.trial === true;
    const returnTo = isSafeInternalPath(body.returnTo) ? body.returnTo : "/subscribe";

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
    let priceId = "";
    if (tier === "plus") {
      const configuredPlusPriceId = Deno.env.get("STRIPE_PLUS_PRICE_ID") ?? "";
      if (!configuredPlusPriceId) return json({ error: "STRAND+ price not yet configured. Please try again shortly." }, 500);
      priceId = await resolveStrandPlusPriceId(stripe, configuredPlusPriceId);
    } else {
      priceId = Deno.env.get("STRIPE_CONSUMER_PRICE_ID") ?? "";
      if (!priceId) {
        const { data: ps } = await admin
          .from("platform_settings").select("value")
          .eq("key", "stripe_consumer_price_id").maybeSingle();
        priceId = (ps?.value as string | null) ?? "";
      }
      if (!priceId) return json({ error: "Stripe price id not configured" }, 500);
    }

    const { data: existing } = await admin
      .from("consumer_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, trial_end")
      .eq("user_id", userId)
      .maybeSingle();

    // ONE TRIAL PER ACCOUNT. Anyone who has already held a subscription (or has
    // already had a trial recorded) checks out at full price immediately.
    const trialAllowed = wantsTrial &&
      !existing?.stripe_subscription_id &&
      !existing?.trial_end &&
      (!existing?.status || existing.status === "none");

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { consumer_user_id: userId } });
      customerId = customer.id;
      await admin.from("consumer_subscriptions").upsert(
        { user_id: userId, stripe_customer_id: customerId, status: "none" },
        { onConflict: "user_id" },
      );
    }

    const origin = req.headers.get("origin") ?? "https://mystrand.co.uk";
    const nextParam = encodeURIComponent(nextPath);
    const successUrl = trialAllowed
      ? `${origin}${returnTo}?checkout=success&next=${nextParam}`
      : tier === "plus"
        ? `${origin}/plus/welcome?checkout=success&next=${nextParam}`
        : `${origin}/subscribe?checkout=success&next=${nextParam}`;
    const cancelUrl = trialAllowed
      ? `${origin}${returnTo}?checkout=cancelled&next=${nextParam}`
      : `${origin}/subscribe?checkout=cancelled&next=${nextParam}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      // Card details are always collected up front. `trial_settings.end_behavior`
      // is deliberately NOT set — that is only for trials without a payment
      // method, which is not what this is.
      ...(trialAllowed ? { payment_method_collection: "always" as const } : {}),
      subscription_data: {
        metadata: { consumer_user_id: userId, tier },
        ...(trialAllowed ? { trial_period_days: 3 } : {}),
      },
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
