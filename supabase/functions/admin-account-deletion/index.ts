// deno-lint-ignore-file no-explicit-any
//
// ADMIN-INITIATED ACCOUNT DELETION — request only.
//
// Deliberately a SEPARATE function from `consumer-account-deletion`, which is
// the member acting on their own account and must stay closed to admins.
//
// Effect here is identical to the member's own "request" action, on someone
// else's account: stamp `profiles.deletion_requested_at` (only if not already
// set), best-effort cancel their Stripe subscription, email that member the
// exact erasure date and how to stop it. Nothing is destroyed now — the actual
// erasure happens 30 days later in `scheduled-account-erasure`, and cancelling
// inside the window restores everything.
//
// Every call is written to `public.admin_account_deletion_log` with the admin
// who performed it, same audit convention as the account-type role history.
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

  // Admin role check against the caller's own roles — never an email check.
  const { data: isAdmin, error: roleErr } = await auth.supabase.rpc("has_role", {
    _user_id: auth.user.id,
    _role: "admin",
  });
  if (roleErr || isAdmin !== true) return json(403, { error: "forbidden" });

  const body = await req.json().catch(() => ({}));
  const userId = String((body as any)?.userId ?? "").trim();
  const reason = String((body as any)?.reason ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return json(400, { error: "userId must be a valid account id" });
  }
  if (userId === auth.user.id) {
    return json(400, {
      error: "Use your own account settings to delete your own account.",
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: existing, error: readErr } = await admin
      .from("profiles")
      .select("deletion_requested_at, display_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) return json(400, { error: readErr.message });
    if (!existing) return json(404, { error: "account not found" });

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

    // Audit trail first — an admin acting on someone else's account is always
    // recorded, even if Stripe or email later fail.
    const { error: logErr } = await admin.from("admin_account_deletion_log").insert({
      user_id: userId,
      action: "requested",
      performed_by: auth.user.id,
      erase_on: eraseOn.toISOString(),
      reason: reason || null,
    });
    if (logErr) console.error("admin deletion audit insert failed", logErr.message);

    // Stop billing. Best-effort — a Stripe failure must not block the request,
    // and the pending stamp already removes app access.
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

    // Same confirmation email the member gets when she asks herself.
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      const to = authUser?.user?.email;
      if (to) {
        await admin.functions.invoke("send-app-email", {
          body: {
            templateKey: "account-deletion-requested",
            to,
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
      }
    } catch (e) {
      console.error("deletion confirmation email failed", (e as Error).message);
    }

    console.log("admin-account-deletion requested", {
      userId,
      byAdmin: auth.user.id,
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
    console.error("admin-account-deletion error", e);
    return json(500, { error: (e as Error).message });
  }
});
