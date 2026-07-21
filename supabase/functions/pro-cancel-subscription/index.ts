// deno-lint-ignore-file no-explicit-any
// Admin-only. Cancels a rejected professional's Stripe subscription
// (at period end) so a declined applicant stops being billed.
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    // Admin gate via has_role RPC
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const { user_id, immediate } = await req.json().catch(() => ({}));
    if (!user_id || typeof user_id !== "string") return json({ error: "user_id required" }, 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sub } = await admin
      .from("pro_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("pro_user_id", user_id)
      .maybeSingle();

    if (!sub?.stripe_subscription_id) {
      // Nothing to cancel — safe no-op
      return json({ ok: true, cancelled: false, reason: "no subscription" });
    }

    if (immediate) {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } else {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    await admin
      .from("pro_subscriptions")
      .update({ cancel_at_period_end: !immediate, status: immediate ? "canceled" : sub.status })
      .eq("pro_user_id", user_id);

    console.log("pro-cancel-subscription", { user_id, immediate: !!immediate });
    return json({ ok: true, cancelled: true });
  } catch (e) {
    console.error("pro-cancel-subscription error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
