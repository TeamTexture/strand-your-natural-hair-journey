// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { priceIsStrandPlus } from "../_shared/stripe-prices.ts";
import { pushToKlaviyoList, KLAVIYO_PAID_MEMBER_LIST_ID } from "../_shared/klaviyo.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  // The endpoint may have been created in Stripe with either signing secret —
  // try every one we hold rather than failing the delivery on a mismatch.
  const secrets = [
    Deno.env.get("STRIPE_CONSUMER_WEBHOOK_SECRET"),
    Deno.env.get("STRIPE_WEBHOOK_SECRET"),
  ].filter((s): s is string => !!s);
  if (!stripeKey || secrets.length === 0) {
    console.error("stripe secrets missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
      break;
    } catch {
      // try the next candidate secret
    }
  }
  if (!event) {
    console.error("signature verification failed for all configured secrets");
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
      // Dunning outcomes: a failed invoice moves the subscription to past_due
      // and eventually unpaid/canceled; a successful one restores it. Either
      // way we re-read the subscription and write the true state.
      case "invoice.payment_failed":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertFromSubscription(admin, stripe, sub);
        }
        break;
      }
      // Belt and braces on first payment — the subscription events normally
      // arrive first, but a completed checkout must never be missed.
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;
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
    console.error("webhook handler error", event?.type, e);
    return new Response(JSON.stringify({ received: false, error: "webhook handler failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

});

async function tierForPrice(stripe: Stripe, priceId: string | null): Promise<"standard" | "plus"> {
  if (!priceId) return "standard";
  const plusId = Deno.env.get("STRIPE_PLUS_PRICE_ID") ?? "";
  if (plusId && priceId === plusId) return "plus";
  if (await priceIsStrandPlus(stripe, priceId)) return "plus";
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
  const tier = await tierForPrice(stripe, priceId);

  // PAUSE TRAP — Stripe leaves `status` as `active` while collection is paused,
  // so the pause is persisted separately and entitlement reads that flag.
  const pause = (sub as any).pause_collection as
    | { behavior?: string; resumes_at?: number | null }
    | null
    | undefined;

  const { error } = await admin.from("consumer_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      price_id: priceId,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      tier,
      paused: !!pause,
      pause_resumes_at: pause?.resumes_at
        ? new Date(pause.resumes_at * 1000).toISOString()
        : null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;

  // Paying members are mirrored onto the Klaviyo paid-members list. Never blocks
  // the webhook — a Klaviyo outage must not cause Stripe retries.
  if (sub.status === "active" || sub.status === "trialing") {
    try {
      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, phone_number")
        .eq("user_id", userId)
        .maybeSingle();
      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      const email = (authUser?.user?.email ?? "").toLowerCase();
      if (email) {
        const err = await pushToKlaviyoList({
          listId: KLAVIYO_PAID_MEMBER_LIST_ID,
          email,
          name: (prof as any)?.display_name ?? null,
          phone: (prof as any)?.phone_number ? String((prof as any).phone_number) : null,
          properties: {
            strand_account_type: "member",
            strand_paid: "true",
            strand_tier: tier,
          },
        });
        if (err) console.error("[consumer-stripe-webhook] klaviyo paid push failed", err);
      }
    } catch (e) {
      console.error("[consumer-stripe-webhook] klaviyo paid push threw", e);
    }
  }
}

