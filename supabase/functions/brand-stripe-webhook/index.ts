// deno-lint-ignore-file no-explicit-any
// Brand — Stripe webhook. Handles two flows on the same endpoint:
//  1. checkout.session.completed for per-placement offer payments (mode:payment)
//  2. customer.subscription.* and invoice.payment_failed for the annual
//     STRAND Brand Access membership (mode:subscription).
// Both are idempotent.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret =
    Deno.env.get("STRIPE_BRAND_WEBHOOK_SECRET") ?? Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("brand webhook: stripe secrets missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
  } catch (err) {
    console.error("brand webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Subscription checkouts have mode:subscription — let subscription.*
        // events handle them so we don't double-write.
        if (session.mode === "subscription") break;

        const offerId = (session.metadata as Record<string, string> | null)?.offer_id;
        if (offerId && session.payment_status === "paid") {
          const { data: cur } = await admin
            .from("brand_offers")
            .select("status")
            .eq("id", offerId)
            .maybeSingle();
          if (cur && cur.status !== "paid_scheduled" && cur.status !== "live" && cur.status !== "ended") {
            await admin
              .from("brand_offers")
              .update({
                status: "paid_scheduled",
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id:
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null,
              })
              .eq("id", offerId);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertBrandSubscription(admin, stripe, sub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertBrandSubscription(admin, stripe, sub);
        }
        break;
      }
      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brand webhook handler error", e);
    return new Response("Handler error", { status: 500 });
  }
});

async function upsertBrandSubscription(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  sub: Stripe.Subscription,
) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Only touch subscriptions that are ours: subscription metadata OR customer
  // metadata OR an existing DB row keyed to this customer. Skip otherwise so
  // this endpoint can safely coexist with pro / consumer subscriptions.
  let brandUserId = (sub.metadata?.brand_user_id as string | undefined) ?? undefined;
  if (!brandUserId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!(customer as any).deleted) {
      brandUserId = ((customer as Stripe.Customer).metadata?.brand_user_id as string | undefined) ?? undefined;
    }
  }
  if (!brandUserId) {
    const { data } = await admin
      .from("brand_subscriptions")
      .select("brand_user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    brandUserId = (data as any)?.brand_user_id;
  }
  if (!brandUserId) return; // not a brand subscription — ignore silently

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const periodEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end ?? null;

  await admin.from("brand_subscriptions").upsert(
    {
      brand_user_id: brandUserId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      price_id: priceId,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    },
    { onConflict: "brand_user_id" },
  );
}
