// deno-lint-ignore-file no-explicit-any
// Consumer membership verification.
//
// Stripe redirects the member back the instant payment succeeds, which is
// often BEFORE the webhook has written `consumer_subscriptions`. Rather than
// waiting to be told, this function asks Stripe directly for the caller's own
// subscriptions and writes the true state.
//
// Lookup is deliberately broad, because a member can end up with more than one
// Stripe customer (guest checkout, email typo, an old cancelled customer). We
// gather every candidate customer plus any subscription tagged with the user id
// and pick the live one — a single stale customer must never mask a real,
// paid-for subscription.
//
// Admins may pass `{ user_id }` to run the same repair for a member who is
// stuck; everyone else can only ever verify themselves.
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

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json(500, { error: "Stripe not configured" });
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let userId = auth.user.id;
  let email = auth.user.email ?? undefined;

  // Admin-only support path: repair another member's entitlement.
  try {
    const body = await req.json().catch(() => ({}));
    const requested = (body as any)?.user_id as string | undefined;
    if (requested && requested !== userId) {
      const { data: isAdmin } = await auth.supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (isAdmin !== true) return json(403, { error: "forbidden" });
      const { data: target, error } = await admin.auth.admin.getUserById(requested);
      if (error || !target?.user) return json(404, { error: "user not found" });
      userId = target.user.id;
      email = target.user.email ?? undefined;
    }
  } catch {
    /* no body — verify the caller */
  }

  try {
    // 1. Collect every plausible Stripe customer for this member.
    const candidates = new Set<string>();
    const { data: existing } = await admin
      .from("consumer_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    const known = (existing as any)?.stripe_customer_id as string | null ?? null;
    if (known) candidates.add(known);

    if (email) {
      const found = await stripe.customers.list({ email, limit: 20 });
      for (const c of found.data) candidates.add(c.id);
    }

    // 2. Collect subscriptions: any tagged with the user id, plus every
    //    subscription belonging to a candidate customer.
    const subs: Stripe.Subscription[] = [];
    try {
      const tagged = await stripe.subscriptions.search({
        query: `metadata['consumer_user_id']:'${userId}'`,
        limit: 20,
      });
      subs.push(...tagged.data);
    } catch (e) {
      console.warn("subscription search unavailable", e);
    }
    for (const customer of candidates) {
      const list = await stripe.subscriptions.list({
        customer,
        status: "all",
        limit: 20,
        expand: ["data.items.data.price"],
      });
      subs.push(...list.data);
    }

    const unique = new Map(subs.map((s) => [s.id, s]));
    const all = [...unique.values()];
    const chosen = all.find((s) => ACTIVE.has(s.status)) ?? all[0] ?? null;

    if (!chosen) {
      if (known) {
        await admin
          .from("consumer_subscriptions")
          .update({ status: "none" })
          .eq("user_id", userId);
      }
      return json(200, {
        active: false,
        reason: candidates.size ? "no_subscription" : "no_customer",
        customers_checked: candidates.size,
      });
    }

    const customerId = typeof chosen.customer === "string"
      ? chosen.customer
      : chosen.customer.id;
    const item = chosen.items.data[0];
    const priceId = item?.price?.id ?? null;
    const periodEnd = (item as any)?.current_period_end ??
      (chosen as any).current_period_end ?? null;

    const plusId = Deno.env.get("STRIPE_PLUS_PRICE_ID") ?? "";
    const tier: "standard" | "plus" =
      (plusId && priceId === plusId) ||
        (priceId && await priceIsStrandPlus(stripe, priceId))
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
