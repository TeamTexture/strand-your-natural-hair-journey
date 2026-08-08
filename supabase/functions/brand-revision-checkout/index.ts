// Brand — Stripe Checkout for a targeting-uplift revision (mode: payment).
//
// A live campaign moving broad → targeted costs the rate difference for the
// REMAINING days only. That difference is collected BEFORE an admin ever sees
// the revision: the revision sits in `pending_payment` until the
// brand-stripe-webhook confirms the session. Nothing here transitions state.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: authError } = await anon.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const { revision_id } = await req.json().catch(() => ({ revision_id: null }));
    if (!revision_id || typeof revision_id !== "string") {
      return json({ error: "revision_id required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rev } = await admin
      .from("brand_offer_revisions")
      .select("id, offer_id, brand_user_id, status, uplift_pence, remaining_days, tier_before, tier_after")
      .eq("id", revision_id)
      .maybeSingle();
    if (!rev) return json({ error: "Revision not found" }, 404);
    if (rev.brand_user_id !== userId) return json({ error: "Not your revision" }, 403);
    if (rev.status !== "pending_payment") {
      return json({ error: `Revision status is ${rev.status}, not pending_payment` }, 400);
    }
    if (!rev.uplift_pence || rev.uplift_pence <= 0) {
      return json({ error: "No uplift to collect" }, 400);
    }

    const { data: offer } = await admin
      .from("brand_offers")
      .select("id, headline")
      .eq("id", rev.offer_id)
      .maybeSingle();

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const origin = req.headers.get("origin") ?? "https://mystrand.co.uk";
    const days = rev.remaining_days ?? 0;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: rev.uplift_pence,
            product_data: {
              name: `Audience targeting uplift — ${offer?.headline ?? "campaign"}`,
              description: `Difference between the broad and targeted rate for ${days} remaining day${days === 1 ? "" : "s"}.`,
            },
          },
        },
      ],
      success_url: `${origin}/brand/offers/${rev.offer_id}?uplift=paid`,
      cancel_url: `${origin}/brand/offers/${rev.offer_id}?uplift=cancelled`,
      metadata: {
        revision_id: rev.id,
        offer_id: rev.offer_id,
        brand_user_id: userId,
        kind: "revision_uplift",
      },
    });

    // Recorded for traceability only — the webhook is what moves the revision on.
    await admin
      .from("brand_offer_revisions")
      .update({ stripe_session_id: session.id })
      .eq("id", rev.id);

    return json({ url: session.url, id: session.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
