// deno-lint-ignore-file no-explicit-any
// Cleans up membership rows whose account no longer exists.
//
// Deleting an account used to leave its consumer_subscriptions row behind, so
// stale rows both inflated the paid-member count AND could still be billing in
// Stripe. This cancels each orphaned Stripe subscription and removes the row.
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
    const dryRun = (body as any)?.dry_run === true;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs, error } = await admin
      .from("consumer_subscriptions")
      .select("user_id, status, tier, stripe_subscription_id");
    if (error) return json({ error: error.message }, 500);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripe = stripeKey
      ? new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any })
      : null;

    const results: any[] = [];
    for (const sub of subs ?? []) {
      const { data: user } = await admin.auth.admin.getUserById(sub.user_id);
      if (user?.user) continue; // account still exists — leave it alone

      const entry: any = {
        user_id: sub.user_id,
        status: sub.status,
        tier: sub.tier,
        stripe_subscription_id: sub.stripe_subscription_id,
        stripe_status: null as string | null,
        cancelled: false,
        removed: false,
      };

      if (stripe && sub.stripe_subscription_id) {
        try {
          const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
          entry.stripe_status = live.status;
          if (!dryRun && live.status !== "canceled") {
            await stripe.subscriptions.cancel(sub.stripe_subscription_id, { prorate: false });
            entry.cancelled = true;
          }
        } catch (e) {
          entry.stripe_error = (e as Error).message;
        }
      }

      if (!dryRun) {
        const { error: delErr } = await admin
          .from("consumer_subscriptions")
          .delete()
          .eq("user_id", sub.user_id);
        entry.removed = !delErr;
        if (delErr) entry.delete_error = delErr.message;
      }

      results.push(entry);
    }

    return json({ ok: true, dry_run: dryRun, orphans: results.length, results });
  } catch (e) {
    console.error("admin-reconcile-consumer-subs error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
