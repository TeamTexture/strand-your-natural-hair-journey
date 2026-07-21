// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // Cancel Stripe subscriptions first (best-effort).
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const cancellations: Array<{ kind: string; id: string; ok: boolean; error?: string }> = [];
    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

      const { data: consumerSub } = await admin
        .from("consumer_subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (consumerSub?.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(consumerSub.stripe_subscription_id);
          cancellations.push({ kind: "consumer", id: consumerSub.stripe_subscription_id, ok: true });
        } catch (e) {
          cancellations.push({
            kind: "consumer",
            id: consumerSub.stripe_subscription_id,
            ok: false,
            error: (e as Error).message,
          });
        }
      }

      const { data: proSub } = await admin
        .from("pro_subscriptions")
        .select("stripe_subscription_id")
        .eq("pro_user_id", targetUserId)
        .maybeSingle();
      if (proSub?.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(proSub.stripe_subscription_id);
          cancellations.push({ kind: "pro", id: proSub.stripe_subscription_id, ok: true });
        } catch (e) {
          cancellations.push({
            kind: "pro",
            id: proSub.stripe_subscription_id,
            ok: false,
            error: (e as Error).message,
          });
        }
      }
    }

    // Delete the auth user. Public schema tables that reference auth.users
    // with ON DELETE CASCADE will be cleaned up automatically.
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) return json({ error: delErr.message }, 400);

    console.log("admin-delete-user", {
      by: callerId,
      target: targetUserId,
      cancellations,
      stripeConfigured: !!stripeKey,
    });

    return json({ ok: true, cancellations, stripe_configured: !!stripeKey });
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
