// Brand/Pro campaign — Stripe Checkout Session (mode: payment) for approved offer.
// Creates dynamic per-placement line items and stores session on the offer.
// Owner-agnostic: works for brand offers (owner_type='brand') and pro
// promoted campaigns (owner_type='pro'). Eligibility is enforced via
// has_active_promotion_eligibility so brands need annual access, pros need
// their pro subscription, and admins pass either way.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLOT_LABEL: Record<string, string> = {
  home: "Home banner",
  products: "Products banner",
  wash_day: "Wash day banner",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: authError } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authError || !claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    const userId = claims.claims.sub;

    const { offer_id } = await req.json();
    if (!offer_id) return new Response(JSON.stringify({ error: "offer_id required" }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: offer } = await admin
      .from("brand_offers")
      .select("id, brand_user_id, status, headline, owner_type")
      .eq("id", offer_id)
      .maybeSingle();
    if (!offer) return new Response(JSON.stringify({ error: "Offer not found" }), { status: 404, headers: corsHeaders });
    if (offer.brand_user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not your offer" }), { status: 403, headers: corsHeaders });
    }
    if (offer.status !== "approved_unpaid") {
      return new Response(JSON.stringify({ error: `Offer status is ${offer.status}, not approved_unpaid` }), { status: 400, headers: corsHeaders });
    }

    const ownerType = (offer as { owner_type?: string }).owner_type ?? "brand";

    // Enforce per-owner platform eligibility (brand annual / pro monthly;
    // admins bypass). Uses SECURITY DEFINER helper.
    const { data: eligible, error: eligErr } = await admin.rpc("has_active_promotion_eligibility", {
      _user: userId,
      _owner_type: ownerType,
    });
    if (eligErr) {
      return new Response(JSON.stringify({ error: eligErr.message }), { status: 500, headers: corsHeaders });
    }
    if (!eligible) {
      return new Response(
        JSON.stringify({
          error: ownerType === "pro"
            ? "An active STRAND Pro subscription is required to launch a campaign."
            : "An active STRAND Brand membership is required to launch a campaign.",
        }),
        { status: 402, headers: corsHeaders },
      );
    }

    const { data: placements } = await admin
      .from("brand_offer_placements")
      .select("slot, placement_date, daily_rate_pence")
      .eq("offer_id", offer_id);
    if (!placements || placements.length === 0) {
      return new Response(JSON.stringify({ error: "No placements to charge" }), { status: 400, headers: corsHeaders });
    }

    // Group by slot for cleaner line items
    const bySlot = new Map<string, { count: number; rate: number }>();
    for (const p of placements) {
      const cur = bySlot.get(p.slot) ?? { count: 0, rate: p.daily_rate_pence };
      cur.count += 1;
      bySlot.set(p.slot, cur);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const origin = req.headers.get("origin") ?? "https://mystrand.co.uk";

    const line_items = Array.from(bySlot.entries()).map(([slot, { count, rate }]) => ({
      quantity: count,
      price_data: {
        currency: "gbp",
        unit_amount: rate,
        product_data: {
          name: `${SLOT_LABEL[slot] ?? slot} — ${count} day${count === 1 ? "" : "s"}`,
        },
      },
    }));

    const successBase = ownerType === "pro" ? "/pro/campaigns" : "/brand";
    const cancelPath = ownerType === "pro" ? `/pro/campaigns/${offer_id}` : `/brand/offers/${offer_id}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}${successBase}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
      metadata: { offer_id, brand_user_id: userId, owner_type: ownerType },
    });

    await admin.from("brand_offers").update({ stripe_session_id: session.id }).eq("id", offer_id);

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
