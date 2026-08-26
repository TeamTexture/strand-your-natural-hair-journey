// TEMPORARY diagnostic: lists the Stripe webhook endpoints and their events.
// Admin/service only. Delete after reporting.
import Stripe from "npm:stripe@17";
import { preflight, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json(500, { error: "no stripe key" });
  // deno-lint-ignore no-explicit-any
  const stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" as any });
  const list = await stripe.webhookEndpoints.list({ limit: 20 });
  return json(200, {
    endpoints: list.data.map((e) => ({
      url: e.url,
      status: e.status,
      events: e.enabled_events,
    })),
  });
});
