// deno-lint-ignore-file no-explicit-any
//
// RETENTION OFFER — "keep my discount": 50% off for 3 months, once per member.
//
// Two actions, both authenticated as the signed-in member:
//   { action: "check" } → server-side eligibility for the offer
//   { action: "claim" } → applies the Stripe coupon, then burns the offer
//
// The eligibility decision is ALWAYS made here from a service-role read of the
// member's own subscription row — never from anything the client sends. `claim`
// re-runs the same check, so a stale UI cannot claim twice.
//
// The `retention_offer_used` flag is written strictly AFTER Stripe confirms the
// update, so a failed apply never burns the offer.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

/** 50% off, repeating for 3 months. Created in Stripe. */
const RETENTION_COUPON = "0ajj1XVm";
const RETENTION_MONTHS = 3;
const PLUS_PRICE = 14.99;
const STANDARD_FALLBACK = 9.99;

type Row = {
  status: string | null;
  trial_end: string | null;
  tier: string | null;
  paused: boolean | null;
  cancel_at_period_end: boolean | null;
  stripe_subscription_id: string | null;
  retention_offer_used: boolean | null;
};

/**
 * FAILURE CONTRACT (2026-09-04): every non-2xx response from this function
 * carries a member-safe `message` and a machine-readable `code`. `error` is
 * kept as a mirror of `message` so older clients keep working. Technical
 * detail (Stripe/Postgres strings) is logged, NEVER returned — the member was
 * previously shown the raw SDK sentence or a Postgres error.
 */
function fail(status: number, code: string, message: string, detail?: unknown) {
  if (detail) {
    console.error(`[consumer-retention-offer] ${code}`, detail);
  }
  return json(status, { message, code, error: message });
}

function ineligible(reason: string) {
  return { eligible: false as const, reason };
}

function assess(row: Row | null) {
  if (!row || !row.stripe_subscription_id) return ineligible("no_subscription");
  if (row.retention_offer_used) return ineligible("already_used");
  if (row.paused) return ineligible("paused");
  if (row.cancel_at_period_end) return ineligible("already_cancelling");
  const status = (row.status ?? "").toLowerCase();
  // TRIALING IS ELIGIBLE (2026-09-03). The original build excluded it on the
  // reasoning that "nothing has been paid yet, so there is no price to halve" —
  // which silently made the retention offer unreachable for exactly the members
  // most likely to cancel. The Stripe coupon attaches to the subscription and
  // applies to the first three invoices AFTER the trial converts, so the
  // discount is real and correctly timed. Copy is trial-aware in the dialog.
  if (status !== "active" && status !== "past_due" && status !== "trialing") {
    return ineligible(`status_${status || "none"}`);
  }
  return { eligible: true as const, reason: "eligible" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return fail(405, "method_not_allowed", "That request could not be handled.");
  }

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;

  const body = await req.json().catch(() => ({}));
  const action = String((body as any)?.action ?? "check").trim();
  if (action !== "check" && action !== "claim") {
    return fail(400, "bad_action", "That request could not be handled.");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data, error } = await admin
      .from("consumer_subscriptions")
      .select(
        "status, trial_end, tier, paused, cancel_at_period_end, stripe_subscription_id, retention_offer_used",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const row = (data as Row | null) ?? null;

    const verdict = assess(row);
    const tier = row?.tier === "plus" ? "plus" : "standard";

    // Standard tier price is admin-managed; Plus is fixed in code, as elsewhere.
    let price = PLUS_PRICE;
    if (tier === "standard") {
      const { data: setting } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "consumer_monthly_price_gbp")
        .maybeSingle();
      const raw = (setting?.value as number | string | null) ?? STANDARD_FALLBACK;
      const n = typeof raw === "string" ? parseFloat(raw) : raw;
      price = Number.isFinite(n) ? Number(n) : STANDARD_FALLBACK;
    }
    const discountedPrice = Math.round(price * 50) / 100; // half price, 2dp
    // The dialog needs to say WHEN the half price starts: now for a paying
    // member, at trial conversion for a trialing one.
    const trialing = (row?.status ?? "").toLowerCase() === "trialing";
    const trialEnd = trialing ? (row?.trial_end ?? null) : null;

    if (action === "check") {
      return json(200, {
        eligible: verdict.eligible,
        reason: verdict.reason,
        already_used: row?.retention_offer_used ?? false,
        tier,
        trialing,
        trial_end: trialEnd,
        price,
        discounted_price: discountedPrice,
        months: RETENTION_MONTHS,
      });
    }

    if (!verdict.eligible) {
      const message = verdict.reason === "already_used"
        ? "This offer has already been used on your membership, so nothing has changed."
        : "This offer is not available on your membership, so nothing has changed.";
      return json(400, {
        message,
        code: verdict.reason,
        error: message,
        reason: verdict.reason,
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return fail(
        500,
        "billing_unavailable",
        "We couldn't reach billing just now, so your discount has not been applied and your membership is unchanged. Please try again shortly.",
      );
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    try {
      await stripe.subscriptions.update(row!.stripe_subscription_id!, {
        discounts: [{ coupon: RETENTION_COUPON }],
      } as any);
    } catch (stripeErr) {
      // The offer is NOT burned here — the flag write only happens after a
      // confirmed Stripe update, so she can try again.
      const raw = (stripeErr as Error)?.message ?? "";
      const invalidPromo = /coupon|promotion|no such/i.test(raw);
      return fail(
        502,
        invalidPromo ? "promotion_invalid" : "billing_unreachable",
        invalidPromo
          ? "We couldn't apply that discount to your membership. Nothing has changed and you have not been charged differently — please contact us at info@teamtexture.co.uk and we'll sort it."
          : "We couldn't reach billing just now, so your discount has not been applied and your membership is unchanged. Please try again in a moment.",
        stripeErr,
      );
    }

    const { error: flagError } = await admin
      .from("consumer_subscriptions")
      .update({
        retention_offer_used: true,
        retention_offer_claimed_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    // The discount is live in Stripe at this point; log loudly but still
    // confirm to the member rather than telling them it failed.
    if (flagError) console.error("[consumer-retention-offer] flag write failed", flagError);

    return json(200, {
      ok: true,
      tier,
      trialing,
      trial_end: trialEnd,
      price,
      discounted_price: discountedPrice,
      months: RETENTION_MONTHS,
    });
  } catch (e) {
    return fail(
      500,
      "unexpected",
      "Something went wrong on our side, so your membership has not been changed. Please try again — if it keeps happening, email info@teamtexture.co.uk.",
      e,
    );
  }
});
