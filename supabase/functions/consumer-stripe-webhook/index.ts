// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret =
    Deno.env.get("STRIPE_CONSUMER_WEBHOOK_SECRET") ??
    Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("stripe secrets missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret);
  } catch (err) {
    console.error("signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertFromSubscription(admin, stripe, sub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertFromSubscription(admin, stripe, sub);
        }
        break;
      }
      default: break;
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("webhook handler error", e);
    return new Response("Handler error", { status: 500 });
  }
});

function tierForPrice(priceId: string | null): "standard" | "plus" {
  if (!priceId) return "standard";
  const plusId = Deno.env.get("STRIPE_PLUS_PRICE_ID") ?? "";
  if (plusId && priceId === plusId) return "plus";
  return "standard";
}

async function upsertFromSubscription(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  sub: Stripe.Subscription,
) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let userId = (sub.metadata?.consumer_user_id as string | undefined) ?? undefined;
  if (!userId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!(customer as any).deleted) {
      userId = ((customer as Stripe.Customer).metadata?.consumer_user_id as string | undefined) ?? undefined;
    }
  }
  if (!userId) {
    const { data } = await admin
      .from("consumer_subscriptions").select("user_id")
      .eq("stripe_customer_id", customerId).maybeSingle();
    userId = (data as any)?.user_id;
  }
  if (!userId) { console.warn("subscription without consumer_user_id", sub.id); return; }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const periodEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end ?? null;
  const tier = tierForPrice(priceId);

  await admin.from("consumer_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      price_id: priceId,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      tier,
    },
    { onConflict: "user_id" },
  );
}
