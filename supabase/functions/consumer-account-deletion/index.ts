// deno-lint-ignore-file no-explicit-any
//
// MEMBER-INITIATED ACCOUNT DELETION — request and cancel.
//
// This is a member acting on their own account, under their statutory right to
// erasure. It is deliberately two-stage and NEVER destroys anything:
//
//   request → stamp profiles.deletion_requested_at, cancel the Stripe
//             subscription, close app access, email the exact erasure date
//   cancel  → clear the stamp, everything comes straight back
//
// The actual erasure is done 30 days later by `scheduled-account-erasure`.
// Bulk or admin-initiated deletion is out of scope here and stays forbidden:
// this function can only ever touch the caller's own row.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

const GRACE_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;

  const body = await req.json().catch(() => ({}));
  const action = String((body as any)?.action ?? "").trim();
  if (action !== "request" && action !== "cancel") {
    return json(400, { error: "action must be 'request' or 'cancel'" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (action === "cancel") {
      const { error } = await admin
        .from("profiles")
        .update({ deletion_requested_at: null })
        .eq("user_id", userId);
      if (error) return json(400, { error: error.message });
      try {
        await admin.functions.invoke("send-app-email", {
          body: {
            templateKey: "account-deletion-cancelled",
            to: auth.user.email,
            recipientUserId: userId,
            triggerEvent: "account_deletion_cancelled",
            relatedTable: "profiles",
            relatedId: userId,
            data: {},
          },
        });
      } catch (e) {
        console.error("deletion cancelled email failed", (e as Error).message);
      }
      console.log("account-deletion cancelled", { userId });
      return json(200, { ok: true });
    }


    // ---- request ----
    const { data: existing } = await admin
      .from("profiles")
      .select("deletion_requested_at, display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const requestedAt =
      (existing as any)?.deletion_requested_at ?? new Date().toISOString();

    if (!(existing as any)?.deletion_requested_at) {
      const { error } = await admin
        .from("profiles")
        .update({ deletion_requested_at: requestedAt })
        .eq("user_id", userId);
      if (error) return json(400, { error: error.message });
    }

    const eraseOn = new Date(requestedAt);
    eraseOn.setDate(eraseOn.getDate() + GRACE_DAYS);

    // Stop billing. Best-effort — a Stripe failure must not block the right to
    // erasure, and the pending request already removes app access.
    let stripeCancelled = false;
    let stripeError: string | null = null;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const { data: sub } = await admin
      .from("consumer_subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (stripeKey && (sub as any)?.stripe_subscription_id) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
        await stripe.subscriptions.cancel((sub as any).stripe_subscription_id);
        stripeCancelled = true;
      } catch (e) {
        stripeError = (e as Error).message;
      }
    }

    const eraseOnLabel = eraseOn.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Confirmation email: the exact erasure date and how to stop it.
    try {
      await admin.functions.invoke("send-app-email", {
        body: {
          templateKey: "account-deletion-requested",
          to: auth.user.email,
          recipientUserId: userId,
          triggerEvent: "account_deletion_requested",
          relatedTable: "profiles",
          relatedId: userId,
          idempotencyKey: `account-deletion:${userId}:${requestedAt}`,
          data: {
            name: (existing as any)?.display_name ?? "",
            erase_on: eraseOnLabel,
          },
        },
      });
    } catch (e) {
      console.error("deletion confirmation email failed", (e as Error).message);
    }

    console.log("account-deletion requested", {
      userId,
      requestedAt,
      eraseOn: eraseOn.toISOString(),
      stripeCancelled,
      stripeError,
    });

    return json(200, {
      ok: true,
      requested_at: requestedAt,
      erase_on: eraseOn.toISOString(),
      stripe_cancelled: stripeCancelled,
    });
  } catch (e) {
    console.error("consumer-account-deletion error", e);
    return json(500, { error: (e as Error).message });
  }
});
