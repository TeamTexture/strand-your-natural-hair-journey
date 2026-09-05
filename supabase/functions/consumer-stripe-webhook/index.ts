// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { priceIsStrandPlus } from "../_shared/stripe-prices.ts";
import { recordSubscriptionCancellation } from "../_shared/cancellation-capture.ts";
import {
  addToKlaviyoList,
  removeFromKlaviyoList,
  logKlaviyoSync,
  KLAVIYO_PAID_MEMBER_LIST_ID,
} from "../_shared/klaviyo.ts";
import { removeFromNurtureLists } from "../_shared/klaviyo-nurture.ts";
import { sendWelcomeVoicenote } from "../_shared/welcome-dm.ts";
import {
  PAYWALL_STATUSES,
  syncPaywallStatusMember,
} from "../_shared/klaviyo-status-lists.ts";

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
      // Fires ~3 days before the trial ends, which on a 3-day trial is almost
      // immediately. Logged only — it must never drive a "your trial ends
      // tomorrow" message, because that would be wrong.
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        console.log("trial_will_end", sub.id, "trial_end", sub.trial_end);
        break;
      }
      // Checkout abandoned. She is ALREADY on the abandoned-checkout Klaviyo
      // list (added when the session was created), so there is nothing to push
      // here — Klaviyo owns the timing. Logged so the event is visible.
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("checkout.session.expired", session.id, session.customer);
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
      // Persisted so the app can say when the free period ends and so a second
      // trial is never granted to the same account.
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      tier,
      paused: !!pause,
      pause_resumes_at: pause?.resumes_at
        ? new Date(pause.resumes_at * 1000).toISOString()
        : null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;

  // Cancellation audit (admin-only table). Always captures the timing data,
  // with reason/comment null when Stripe supplies none.
  await recordSubscriptionCancellation(admin, {
    userId: userId,
    accountType: "consumer",
    sub,
    eventType: sub.status === "canceled"
      ? "customer.subscription.deleted"
      : "customer.subscription.updated",
  });

  // STRAND_PAYWALL_LIST: she started checkout but the subscription is not
  // paying. Marketing-consent gated inside the helper, and never blocks the
  // webhook. Outcome logged to klaviyo_sync_log as paywall_list_webhook.
  if ((PAYWALL_STATUSES as readonly string[]).includes(sub.status) && sub.id) {
    await syncPaywallStatusMember(admin as any, userId, "paywall_list_webhook", sub.status);
  }

  // Superchat PAID / NON-PAID routing, recomputed from the row we just wrote.
  // A trial is NON-PAID here (unlike the Klaviyo paid list below, which
  // deliberately includes trialing members). WhatsApp-consent gated inside the
  // helper and never throws, so a Superchat outage cannot cause Stripe retries.
  await syncSuperchatLists(admin as any, userId, `stripe_${sub.status}`);





  // Paying AND trialing members are mirrored onto the Klaviyo paid-members list.
  // Marketing consent is NOT set here — only list membership — unless the member
  // has explicitly said yes on her profile. Never blocks the webhook: a Klaviyo
  // outage must not cause Stripe retries, but the failure is logged to
  // klaviyo_sync_log so it is queryable.
  if (sub.status === "active" || sub.status === "trialing") {
    // One-off welcome voice note from STRAND Team. Self-guarding and never
    // throws — same defensive style as the Klaviyo calls below.
    await sendWelcomeVoicenote(admin as any, userId);
    try {
      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, phone_number, personalised_offers_consent")
        .eq("user_id", userId)
        .maybeSingle();
      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      const email = (authUser?.user?.email ?? "").toLowerCase();
      if (email) {
        const err = await addToKlaviyoList({
          listId: KLAVIYO_PAID_MEMBER_LIST_ID,
          email,
          name: (prof as any)?.display_name ?? null,
          phone: (prof as any)?.phone_number ? String((prof as any).phone_number) : null,
          marketingConsent: (prof as any)?.personalised_offers_consent === true,
          properties: {
            strand_account_type: "member",
            strand_paid: "true",
            strand_tier: tier,
            strand_status: sub.status,
            ...(sub.trial_end
              ? { strand_trial_end: new Date(sub.trial_end * 1000).toISOString() }
              : {}),
          },
        });
        if (err) console.error("[consumer-stripe-webhook] klaviyo paid push failed", err);
        await logKlaviyoSync(admin as any, {
          email,
          user_id: userId,
          list_id: KLAVIYO_PAID_MEMBER_LIST_ID,
          action: "paid_list_webhook",
          ok: !err,
          error: err,
          context: { status: sub.status, tier },
        });
        // CONVERSION: she is off both nurture lists the moment she reaches
        // trialing or active. Failures are logged loudly — a paying member
        // receiving "you never subscribed" emails is the worst outcome here.
        await removeFromNurtureLists(admin as any, {
          userId,
          email,
          reason: `subscription_${sub.status}`,
        });
      }
    } catch (e) {
      console.error("[consumer-stripe-webhook] klaviyo paid push threw", e);
      await logKlaviyoSync(admin as any, {
        user_id: userId,
        list_id: KLAVIYO_PAID_MEMBER_LIST_ID,
        action: "paid_list_webhook",
        ok: false,
        error: e instanceof Error ? e.message : "threw",
      });
    }
  } else {
    // Subscription is no longer paying/trialing (canceled, past_due,
    // incomplete, incomplete_expired, unpaid) — mirror that off the Klaviyo
    // paid-members list. Membership only; marketing consent is never touched
    // here. Never blocks the webhook: a Klaviyo outage must not cause Stripe
    // retries, but the failure is logged to klaviyo_sync_log so it is queryable.
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      const email = (authUser?.user?.email ?? "").toLowerCase();
      if (email) {
        const err = await removeFromKlaviyoList({
          listId: KLAVIYO_PAID_MEMBER_LIST_ID,
          email,
        });
        if (err) console.error("[consumer-stripe-webhook] klaviyo paid removal failed", err);
        await logKlaviyoSync(admin as any, {
          email,
          user_id: userId,
          list_id: KLAVIYO_PAID_MEMBER_LIST_ID,
          action: "paid_list_removal_webhook",
          ok: !err,
          error: err,
          context: { status: sub.status, tier },
        });
      }
    } catch (e) {
      console.error("[consumer-stripe-webhook] klaviyo paid removal threw", e);
      await logKlaviyoSync(admin as any, {
        user_id: userId,
        list_id: KLAVIYO_PAID_MEMBER_LIST_ID,
        action: "paid_list_removal_webhook",
        ok: false,
        error: e instanceof Error ? e.message : "threw",
      });
    }
  }
}

