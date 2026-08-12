// deno-lint-ignore-file no-explicit-any
// Consumer membership verification.
//
// Stripe redirects the member back the instant payment succeeds, which is
// often BEFORE the webhook has written `consumer_subscriptions`. Rather than
// waiting to be told, this function asks Stripe directly for the caller's own
// subscriptions and writes the true state. It only ever reads and writes the
// authenticated caller's row.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";
import { priceIsStrandPlus } from "../_shared/stripe-prices.ts";

const ACTIVE = new Set(["active", "trialing"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;
  const email = auth.user.email ?? undefined;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json(500, { error: "Stripe not configured" });
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Find this caller's Stripe customer — never anybody else's.
    const { data: existing } = await admin
      .from("consumer_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = (existing as any)?.stripe_customer_id as string | null ?? null;

    if (!customerId && email) {
      const found = await stripe.customers.list({ email, limit: 10 });
      const match = found.data.find(
        (c) => (c.metadata?.consumer_user_id ?? "") === userId,
      ) ?? found.data[0];
      customerId = match?.id ?? null;
    }

    if (!customerId) return json(200, { active: false, reason: "no_customer" });

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
      expand: ["data.items.data.price"],
    });

    const live = subs.data.find((s) => ACTIVE.has(s.status));
    const chosen = live ?? subs.data[0] ?? null;

    if (!chosen) {
      await admin.from("consumer_subscriptions").upsert(
        { user_id: userId, stripe_customer_id: customerId, status: "none" },
        { onConflict: "user_id" },
      );
      return json(200, { active: false, reason: "no_subscription" });
    }

    const item = chosen.items.data[0];
    const priceId = item?.price?.id ?? null;
    const periodEnd = (item as any)?.current_period_end ??
      (chosen as any).current_period_end ?? null;

    const plusId = Deno.env.get("STRIPE_PLUS_PRICE_ID") ?? "";
    const tier: "standard" | "plus" =
      (plusId && priceId === plusId) || (priceId && await priceIsStrandPlus(stripe, priceId))
        ? "plus"
        : "standard";

    await admin.from("consumer_subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: chosen.id,
        status: chosen.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        price_id: priceId,
        cancel_at_period_end: chosen.cancel_at_period_end ?? false,
        tier,
      },
      { onConflict: "user_id" },
    );

    return json(200, {
      active: ACTIVE.has(chosen.status),
      status: chosen.status,
      tier,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    });
  } catch (e) {
    console.error("consumer-verify-subscription error", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
