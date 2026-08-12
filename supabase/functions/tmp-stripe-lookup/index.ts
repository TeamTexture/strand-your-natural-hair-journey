// deno-lint-ignore-file no-explicit-any
// TEMPORARY diagnostic: look up Stripe activity for an email. Guarded by a shared key.
import Stripe from "npm:stripe@17";

Deno.serve(async (req) => {
  const key = req.headers.get("x-diag-key");
  if (key !== Deno.env.get("TREATMENT_CRON_KEY")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const { email } = await req.json().catch(() => ({ email: null }));
  if (!email) return new Response(JSON.stringify({ error: "email required" }), { status: 400 });

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-11-20.acacia" as any,
  });

  const out: any = { email, customers: [], subscriptions: [], sessions: [], charges: [], searched: [] };

  const customers = await stripe.customers.list({ email, limit: 20 });
  for (const c of customers.data) {
    out.customers.push({ id: c.id, created: c.created, email: c.email, name: c.name });
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20 });
    for (const s of subs.data) {
      out.subscriptions.push({
        id: s.id, status: s.status, customer: c.id,
        price: s.items.data[0]?.price?.id ?? null,
        metadata: s.metadata,
      });
    }
    const ch = await stripe.charges.list({ customer: c.id, limit: 10 });
    for (const x of ch.data) {
      out.charges.push({ id: x.id, amount: x.amount, status: x.status, paid: x.paid, created: x.created, desc: x.description });
    }
  }

  try {
    const sr = await stripe.checkout.sessions.list({ limit: 100 });
    out.sessions = sr.data
      .filter((s) => (s.customer_details?.email ?? "").toLowerCase() === String(email).toLowerCase())
      .map((s) => ({ id: s.id, status: s.status, payment_status: s.payment_status, customer: s.customer, sub: s.subscription, created: s.created, metadata: s.metadata }));
  } catch (e) {
    out.sessions_error = String(e);
  }

  try {
    const cs = await stripe.customers.search({ query: `email~'${String(email).split("@")[0]}'`, limit: 20 });
    out.searched = cs.data.map((c) => ({ id: c.id, email: c.email }));
  } catch (e) {
    out.search_error = String(e);
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
});
