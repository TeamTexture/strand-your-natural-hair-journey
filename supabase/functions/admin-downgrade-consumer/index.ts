// deno-lint-ignore-file no-explicit-any
// Admin-only: moves a member from STRAND+ down to STRAND (standard).
// Stripe is the source of truth, so the subscription item is swapped to the
// standard price first; the database row only follows a successful Stripe
// update (or is corrected when there is no live subscription to change).
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { requireAdminOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await requireAdminOrService(req);
    if (caller instanceof Response) return caller;

    const body = await req.json().catch(() => ({}));
    const targetUserId = String((body as any)?.user_id ?? "").trim();
    if (!targetUserId) return json({ error: "user_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sub } = await admin
      .from("consumer_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, tier")
      .eq("user_id", targetUserId)
      .maybeSingle();

    // Resolve the standard consumer price (env first, then platform settings).
    let standardPriceId = Deno.env.get("STRIPE_CONSUMER_PRICE_ID") ?? "";
    if (!standardPriceId) {
      const { data: ps } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "stripe_consumer_price_id")
        .maybeSingle();
      standardPriceId = typeof ps?.value === "string" ? ps.value : "";
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const live =
      !!sub?.stripe_subscription_id && (sub.status === "active" || sub.status === "trialing");

    let stripeUpdated = false;
    if (live) {
      if (!stripeKey) return json({ error: "Stripe is not configured." }, 500);
      if (!standardPriceId) {
        return json({ error: "The standard STRAND price is not configured." }, 500);
      }
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
      const s = await stripe.subscriptions.retrieve(sub!.stripe_subscription_id!);
      const item = s.items.data[0];
      if (!item) return json({ error: "That Stripe subscription has no billable item." }, 400);

      if (item.price?.id !== standardPriceId) {
        await stripe.subscriptions.update(sub!.stripe_subscription_id!, {
          items: [{ id: item.id, price: standardPriceId }],
          proration_behavior: "create_prorations",
          metadata: { tier: "standard" },
        });
      }
      stripeUpdated = true;
    }

    const { error: dbErr } = await admin
      .from("consumer_subscriptions")
      .update({
        tier: "standard",
        ...(stripeUpdated && standardPriceId ? { price_id: standardPriceId } : {}),
      })
      .eq("user_id", targetUserId);
    if (dbErr) return json({ error: dbErr.message }, 500);

    // Complimentary access grants every tier, so it must come off too or the
    // member keeps STRAND+ features regardless of the downgrade.
    await admin
      .from("profiles")
      .update({ complimentary_access: false })
      .eq("user_id", targetUserId)
      .eq("complimentary_access", true);

    return json({ ok: true, stripe_updated: stripeUpdated });
  } catch (e) {
    console.error("admin-downgrade-consumer error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
