// deno-lint-ignore-file no-explicit-any
// Admin account removal.
//
// Order matters and is deliberate:
//  1. Read who they are and what they pay for (the auth row is about to go).
//  2. Settle Stripe — cancel the subscription and, when asked, refund the last
//     payment. Nothing is deleted until we know what happened to their money.
//  3. Email them the closure notice with the real billing outcome.
//  4. Delete the auth user, then clear subscription rows that do not cascade
//     (consumer_subscriptions / pro_subscriptions have no FK to auth.users, so
//     leaving them behind inflates every "paid members" count).
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { dispatchEmail } from "../_shared/app-email/core.ts";
import { removeSuperchatLists } from "../_shared/superchat-lists.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const money = (amount: number | null | undefined, currency: string | null | undefined) => {
  if (typeof amount !== "number") return "";
  const symbol = (currency ?? "gbp").toLowerCase() === "gbp" ? "£" : "";
  return `${symbol}${(amount / 100).toFixed(2)}${symbol ? "" : ` ${(currency ?? "").toUpperCase()}`}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.user_id ?? "").trim();
    const refundLastPayment = body?.refund_last_payment === true;
    const notify = body?.notify !== false;
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (!targetUserId) return json({ error: "user_id required" }, 400);
    if (targetUserId === callerId) return json({ error: "Cannot delete your own account" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller is admin
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin only" }, 403);

    // ---- 1. Identity, captured before the auth row disappears ----
    const { data: authUser } = await admin.auth.admin.getUserById(targetUserId);
    const email = authUser?.user?.email ?? null;
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, first_name")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const name =
      (profile?.first_name as string | null) ||
      ((profile?.display_name as string | null) ?? "").split(" ")[0] ||
      "there";

    const { data: consumerSub } = await admin
      .from("consumer_subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, status, tier")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const { data: proSub } = await admin
      .from("pro_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("pro_user_id", targetUserId)
      .maybeSingle();

    // ---- 2. Settle Stripe ----
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const cancellations: Array<{ kind: string; id: string; ok: boolean; error?: string }> = [];
    let refund: { amount: string; id: string } | null = null;
    let refundError: string | null = null;
    let periodEndNote = "";

    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

      const cancel = async (kind: string, subId: string) => {
        try {
          const cancelled = await stripe.subscriptions.cancel(subId, { prorate: false });
          cancellations.push({ kind, id: subId, ok: true });
          return cancelled;
        } catch (e) {
          cancellations.push({ kind, id: subId, ok: false, error: (e as Error).message });
          return null;
        }
      };

      if (consumerSub?.stripe_subscription_id) {
        const cancelled = await cancel("consumer", consumerSub.stripe_subscription_id);
        const endsAt = (cancelled as any)?.current_period_end as number | undefined;
        if (endsAt) {
          periodEndNote = new Date(endsAt * 1000).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
        }

        // Optional goodwill refund of the most recent paid invoice.
        if (refundLastPayment) {
          try {
            const invoices = await stripe.invoices.list({
              subscription: consumerSub.stripe_subscription_id,
              status: "paid",
              limit: 1,
            });
            const inv = invoices.data[0];
            const chargeId = (inv as any)?.charge as string | null;
            const paymentIntentId = (inv as any)?.payment_intent as string | null;
            if (chargeId || paymentIntentId) {
              const created = await stripe.refunds.create(
                chargeId ? { charge: chargeId } : { payment_intent: paymentIntentId! },
              );
              refund = {
                id: created.id,
                amount: money(created.amount, created.currency) || "the last payment",
              };
            } else {
              refundError = "No paid invoice found to refund.";
            }
          } catch (e) {
            refundError = (e as Error).message;
          }
        }
      }

      if (proSub?.stripe_subscription_id) {
        await cancel("pro", proSub.stripe_subscription_id);
      }
    }

    const hadSubscription =
      !!consumerSub?.stripe_subscription_id || !!proSub?.stripe_subscription_id;
    const wasPaying =
      hadSubscription && ["active", "trialing", "past_due"].includes(
        (consumerSub?.status ?? proSub?.status ?? "") as string,
      );

    const billingNote = !hadSubscription
      ? "You had no active STRAND membership payment, so there is nothing further to settle."
      : refund
        ? `Your membership has been cancelled in Stripe, so there will be no further charges, and we have refunded ${refund.amount} back to your original payment method. Refunds usually land within 5 to 10 working days.`
        : `Your membership has been cancelled in Stripe, so you will not be charged again.${
            periodEndNote ? ` Your last paid period ran to ${periodEndNote}.` : ""
          } If you believe you are owed a refund for time you have not used, reply to this email and we will sort it out.`;

    // ---- 3. Tell them, before anything is destroyed ----
    let emailed = false;
    let emailError: string | null = null;
    if (notify && email) {
      try {
        const res = await dispatchEmail({
          templateKey: "account-removed-by-admin",
          to: email,
          recipientUserId: targetUserId,
          triggerEvent: "admin_account_removed",
          relatedTable: "profiles",
          relatedId: targetUserId,
          idempotencyKey: `account-removed:${targetUserId}`,
          data: {
            name,
            reason,
            billing_note: billingNote,
            closed_at: new Date().toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            plan_label: consumerSub
              ? consumerSub.tier === "plus"
                ? "STRAND+"
                : "STRAND"
              : proSub
                ? "Professional"
                : "No paid membership",
            billing_status: hadSubscription
              ? "Cancelled — no further charges"
              : "No active payment",
            refund_summary: refund
              ? `${refund.amount} refunded`
              : refundError
                ? "Not refunded — contact us"
                : hadSubscription
                  ? "No refund issued"
                  : "",
          },
        });
        emailed = !!res.sent;
        if (!res.sent) emailError = res.error ?? res.reason ?? "not sent";
      } catch (e) {
        emailError = (e as Error).message;
      }
    } else if (notify && !email) {
      emailError = "No email address on the account";
    }

    // ---- 4. Delete the account ----
    // Off both Superchat lists first: the contact id lives on the profile row,
    // which the auth delete cascades away.
    await removeSuperchatLists(admin, targetUserId, "admin_delete_user");
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) return json({ error: delErr.message }, 400);

    // Tables with no FK cascade to auth.users must be cleared explicitly, or
    // their rows keep counting towards paid-member totals forever.
    await admin.from("consumer_subscriptions").delete().eq("user_id", targetUserId);
    await admin.from("pro_subscriptions").delete().eq("pro_user_id", targetUserId);

    console.log("admin-delete-user", {
      by: callerId,
      target: targetUserId,
      cancellations,
      refunded: !!refund,
      refundError,
      emailed,
      emailError,
      stripeConfigured: !!stripeKey,
    });

    return json({
      ok: true,
      cancellations,
      was_paying: wasPaying,
      refunded: refund?.amount ?? null,
      refund_error: refundError,
      emailed,
      email_error: emailError,
      stripe_configured: !!stripeKey,
    });
  } catch (e) {
    console.error("admin-delete-user error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
