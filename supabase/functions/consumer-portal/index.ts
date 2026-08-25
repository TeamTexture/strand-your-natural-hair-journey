// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

type PortalFlow = "portal" | "subscription_update" | "subscription_cancel";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json(500, { error: "Stripe not configured" });
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: sub } = await admin
      .from("consumer_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!sub?.stripe_customer_id) return json(400, { error: "No Stripe customer on file" });

    const body = await req.json().catch(() => ({}));
    const rawPath = String((body as any)?.return_path ?? "/subscribe");
    const returnPath = rawPath.startsWith("/") ? rawPath : "/subscribe";
    const origin = req.headers.get("origin") ?? "https://mystrand.co.uk";
    const returnUrl = `${origin}${returnPath}`;
    const flow = normalizeFlow((body as any)?.flow);

    if (flow !== "portal" && !sub.stripe_subscription_id) {
      return json(400, { error: "No active membership on file" });
    }

    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer: sub.stripe_customer_id,
      return_url: returnUrl,
    };

    if (flow === "subscription_update") {
      params.flow_data = {
        type: "subscription_update",
        subscription_update: { subscription: sub.stripe_subscription_id },
        after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
      } as any;
    }

    if (flow === "subscription_cancel") {
      params.flow_data = {
        type: "subscription_cancel",
        subscription_cancel: { subscription: sub.stripe_subscription_id },
        after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
      } as any;
    }

    const portal = await stripe.billingPortal.sessions.create(params);


    return json(200, { url: portal.url });
  } catch (e) {
    console.error("consumer-portal error", e);
    return json(500, { error: (e as Error).message });
  }
});

function normalizeFlow(raw: unknown): PortalFlow {
  if (raw === "subscription_update" || raw === "subscription_cancel") return raw;
  return "portal";
}
