// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { isStrandPlusPrice, retrievePrice } from "../_shared/stripe-prices.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const plusPriceId = Deno.env.get("STRIPE_PLUS_PRICE_ID") ?? "";
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);
    if (!plusPriceId) return json({ error: "STRAND+ price not configured" }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    const plusPrice = await retrievePrice(stripe, plusPriceId);
    if (!plusPrice) {
      return json({ error: "The configured STRIPE_PLUS_PRICE_ID is invalid — it could not be retrieved from Stripe." }, 500);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await admin
      .from("consumer_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status")
      .eq("user_id", userId)
      .maybeSingle();

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

    // CASE A — active/trialing subscription: upgrade in place.
    if (existing?.stripe_subscription_id && (existing.status === "active" || existing.status === "trialing")) {
      const sub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
      const item = sub.items.data[0];
      if (item) {
        const currentPriceId = item.price?.id ?? null;
        const alreadyPlus = currentPriceId === plusPriceId || isStrandPlusPrice(item.price ?? null);

        if (alreadyPlus) {
          await saveSub(admin, userId, customerId, sub, currentPriceId ?? plusPriceId);
          return json({ already_plus: true });
        }

        const updated = await stripe.subscriptions.update(existing.stripe_subscription_id, {
          items: [{ id: item.id, price: plusPriceId }],
          proration_behavior: "create_prorations",
        });
        await saveSub(admin, userId, customerId, updated, plusPriceId);
        return json({ upgraded: true });
      }
    }

    // CASE B — no active subscription: fresh checkout.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plusPriceId, quantity: 1 }],
      success_url: `${origin}/plus/welcome?checkout=success`,
      cancel_url: `${origin}/plus/upgrade?checkout=cancelled`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { consumer_user_id: userId, tier: "plus" } },
      metadata: { consumer_user_id: userId, tier: "plus" },
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("create-consumer-upgrade error", e);
    const status = (e as any)?.type ? 400 : 500;
    return json({ error: (e as Error).message }, status);
  }
});

async function saveSub(
  admin: any,
  userId: string,
  customerId: string | null,
  sub: Stripe.Subscription,
  priceId: string,
) {
  const periodEnd = (sub as any).current_period_end
    ? new Date(((sub as any).current_period_end as number) * 1000).toISOString()
    : null;
  await admin.from("consumer_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: priceId,
      tier: "plus",
      current_period_end: periodEnd,
      cancel_at_period_end: !!sub.cancel_at_period_end,
    },
    { onConflict: "user_id" },
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
