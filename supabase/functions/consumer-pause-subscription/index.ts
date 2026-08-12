// deno-lint-ignore-file no-explicit-any
//
// PAUSE / RESUME a member's own consumer membership.
//
// Stripe's `pause_collection` leaves the subscription `status` as `active`, so
// the paused state is persisted on `consumer_subscriptions.paused` and read by
// the entitlement check. A paused member has NO app access.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;

  const body = await req.json().catch(() => ({}));
  const action = String((body as any)?.action ?? "").trim();
  if (action !== "pause" && action !== "resume") {
    return json(400, { error: "action must be 'pause' or 'resume'" });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json(500, { error: "Stripe not configured" });
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: row } = await admin
      .from("consumer_subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    const subId = (row as any)?.stripe_subscription_id as string | undefined;
    if (!subId) return json(400, { error: "No membership on file to pause" });

    const updated = await stripe.subscriptions.update(subId, {
      pause_collection: action === "pause" ? { behavior: "void" } : null,
    } as any);

    const pause = (updated as any).pause_collection as
      | { behavior?: string; resumes_at?: number | null }
      | null;

    const { error } = await admin
      .from("consumer_subscriptions")
      .update({
        paused: !!pause,
        pause_resumes_at: pause?.resumes_at
          ? new Date(pause.resumes_at * 1000).toISOString()
          : null,
        status: updated.status,
      })
      .eq("user_id", userId);
    if (error) return json(400, { error: error.message });

    console.log("consumer-pause-subscription", {
      userId,
      action,
      stripeStatus: updated.status,
      paused: !!pause,
    });

    return json(200, { ok: true, paused: !!pause, status: updated.status });
  } catch (e) {
    console.error("consumer-pause-subscription error", e);
    return json(500, { error: (e as Error).message });
  }
});
