// deno-lint-ignore-file no-explicit-any
// Brand — Stripe webhook. Handles two flows on the same endpoint:
//  1. checkout.session.completed for per-placement offer payments (mode:payment)
//  2. customer.subscription.* and invoice.payment_failed for the annual
//     STRAND Brand Access membership (mode:subscription).
// Both are idempotent.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { dispatchEmail } from "../_shared/app-email/core.ts";
import { recordSubscriptionCancellation } from "../_shared/cancellation-capture.ts";

/**
 * A relaunched campaign has just been paid for. Tell the members who registered
 * interest on the ORIGINAL ended offer that the discount is back.
 *
 * Runs through the shared send path (`dispatchEmail`), so it is already behind
 * the global `email_sending_enabled` flag and the `brand_offers` preference —
 * nothing sends until the platform flag is switched on. Idempotent via
 * `relaunch_notified_at` plus a per-recipient idempotency key.
 */
async function notifyRelaunchInterest(admin: any, offerId: string) {
  try {
    const { data: offer } = await admin
      .from("brand_offers")
      .select("id, headline, brand_user_id, relaunched_from_offer_id, relaunch_notified_at")
      .eq("id", offerId)
      .maybeSingle();
    if (!offer?.relaunched_from_offer_id || offer.relaunch_notified_at) return;

    const { data: interest } = await admin
      .from("brand_offer_interest")
      .select("user_id")
      .eq("offer_id", offer.relaunched_from_offer_id);
    const userIds = [...new Set((interest ?? []).map((r: any) => r.user_id))];
    if (userIds.length === 0) {
      await admin.from("brand_offers")
        .update({ relaunch_notified_at: new Date().toISOString() }).eq("id", offerId);
      return;
    }

    const { data: brand } = await admin
      .from("brand_profiles")
      .select("brand_name")
      .eq("user_id", offer.brand_user_id)
      .maybeSingle();

    for (const uid of userIds) {
      const { data: userRes } = await admin.auth.admin.getUserById(uid);
      const email = userRes?.user?.email;
      if (!email) continue;
      const { data: prof } = await admin
        .from("profiles").select("display_name").eq("user_id", uid).maybeSingle();
      await dispatchEmail({
        templateKey: "offer-relaunch-interest",
        to: email,
        recipientUserId: uid,
        triggerEvent: "brand_offer_relaunched",
        relatedTable: "brand_offers",
        relatedId: offerId,
        idempotencyKey: `offer-relaunch-${offerId}-${uid}`,
        data: {
          name: prof?.display_name ?? null,
          brand_name: brand?.brand_name ?? null,
          headline: offer.headline ?? null,
          offer_id: offerId,
        },
      }, admin);
    }

    await admin.from("brand_offers")
      .update({ relaunch_notified_at: new Date().toISOString() }).eq("id", offerId);
  } catch (e) {
    console.error("relaunch interest notify failed", e);
  }
}


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

        const meta = (session.metadata as Record<string, string> | null) ?? {};

        // ── Targeting-uplift revision ────────────────────────────────────────
        // The ONLY place an approved revision's targeting is applied
        // (approved_pending_payment → approved, cached audience re-resolved).
        // Never driven from the browser. Idempotent: the RPC no-ops when the
        // revision has already been applied.
        if (meta.kind === "revision_uplift" && meta.revision_id) {
          if (session.payment_status === "paid") {
            const { data: moved, error } = await admin.rpc(
              "confirm_brand_offer_revision_payment",
              {
                _revision_id: meta.revision_id,
                _session_id: session.id,
                _payment_intent_id:
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null,
              },
            );
            if (error) console.error("revision uplift confirm failed", error);
            else console.log("revision uplift confirmed", meta.revision_id, "applied:", moved);
          }
          break;
        }

        const offerId = meta.offer_id;
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
            await notifyRelaunchInterest(admin, offerId);
            // Pre-generate this campaign's sponsored wash day tips for its
            // matched audience now, so serving is a cache read (fire and forget).
            try {
              const url = Deno.env.get("SUPABASE_URL");
              const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
              if (url && svc) {
                void fetch(`${url}/functions/v1/brand-tips-pregenerate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${svc}` },
                  body: JSON.stringify({ offer_id: offerId }),
                });
              }
            } catch { /* best-effort */ }
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
