// deploy: trial save flow
// deno-lint-ignore-file no-explicit-any
//
// TRIAL SAVE OFFER — "7 more days, free" (2026-09-08).
//
// The FIRST save screen a member sees when she starts to cancel while still on
// her initial free trial, before any payment has been taken. It extends the
// Stripe trial by 7 days using exactly the mechanism the complimentary-access
// grant already uses (`subscriptions.update({ trial_end })`) — no new billing
// primitive, no coupon.
//
// One time only, permanently: `trial_save_offer_used` is never reset, so the
// screen can never appear again on any later cancel attempt, after the extra
// days end, or after a resubscribe.
//
// Two actions, both authenticated as the signed-in member:
//   { action: "check" } → server-side eligibility + personalisation
//   { action: "claim" } → extends the trial, then burns the offer
//
// The flag is written strictly AFTER Stripe confirms, so a failed extension
// never burns the offer.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";
import { decryptText } from "../_shared/scalp-decrypt.ts";
import {
  chooseTrialSavePersonalisation,
  loadTrialSaveSignals,
  type TrialFactCategory,
} from "../_shared/trial-save-personalisation.ts";

const EXTRA_DAYS = 7;

type Row = {
  status: string | null;
  trial_end: string | null;
  tier: string | null;
  paused: boolean | null;
  cancel_at_period_end: boolean | null;
  stripe_subscription_id: string | null;
  trial_save_offer_used: boolean | null;
  trial_save_offer_fact: string | null;
};

function fail(status: number, code: string, message: string, detail?: unknown) {
  if (detail) console.error(`[consumer-trial-save-offer] ${code}`, detail);
  return json(status, { message, code, error: message });
}

function ineligible(reason: string) {
  return { eligible: false as const, reason };
}

/** Local eligibility. The "never charged" check needs Stripe and runs after. */
export function assessRow(row: Row | null) {
  if (!row || !row.stripe_subscription_id) return ineligible("no_subscription");
  if (row.trial_save_offer_used) return ineligible("already_used");
  if (row.paused) return ineligible("paused");
  if (row.cancel_at_period_end) return ineligible("already_cancelling");
  if ((row.status ?? "").toLowerCase() !== "trialing") {
    return ineligible(`status_${(row.status ?? "none").toLowerCase()}`);
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
  // "decline" burns the one-time record WITHOUT touching billing: the screen is
  // one time whether she takes the days or turns them down, and the recorded
  // fact is what the second save screen must exclude.
  if (action !== "check" && action !== "claim" && action !== "decline") {
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
        "status, trial_end, tier, paused, cancel_at_period_end, stripe_subscription_id, trial_save_offer_used, trial_save_offer_fact",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const row = (data as Row | null) ?? null;

    const local = assessRow(row);
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripe = stripeKey
      ? new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any })
      : null;

    // NEVER CHARGED is verified against Stripe, not the local row: a member who
    // has already paid once must never see a trial save screen.
    let charged = false;
    if (local.eligible && stripe && row?.stripe_subscription_id) {
      try {
        const invoices = await stripe.invoices.list({
          subscription: row.stripe_subscription_id,
          limit: 20,
        });
        charged = invoices.data.some(
          (inv) => (inv.amount_paid ?? 0) > 0 || inv.status === "paid" && (inv.total ?? 0) > 0,
        );
      } catch (e) {
        // Can't confirm → treat as charged so we never extend a paid member's trial.
        console.error("[consumer-trial-save-offer] invoice check failed", e);
        charged = true;
      }
    }

    const verdict = charged ? ineligible("already_charged") : local;

    const signals = await loadTrialSaveSignals(admin as any, userId, decryptText);
    const personalisation = chooseTrialSavePersonalisation(signals, { screen: 1 });

    if (action === "check") {
      const newTrialEnd = row?.trial_end
        ? new Date(new Date(row.trial_end).getTime() + EXTRA_DAYS * 86_400_000).toISOString()
        : null;
      return json(200, {
        eligible: verdict.eligible,
        reason: verdict.reason,
        already_used: row?.trial_save_offer_used ?? false,
        tier: row?.tier === "plus" ? "plus" : "standard",
        trial_end: row?.trial_end ?? null,
        new_trial_end: newTrialEnd,
        extra_days: EXTRA_DAYS,
        personalisation,
      });
    }

    if (action === "decline") {
      // Never fails the member's cancel: if this write is refused she still
      // proceeds, she just may see the screen once more.
      if (!row?.trial_save_offer_used) {
        const { error: declineErr } = await admin
          .from("consumer_subscriptions")
          .update({
            trial_save_offer_used: true,
            trial_save_offer_claimed_at: null,
            trial_save_offer_fact: (personalisation.category as TrialFactCategory | null) ?? null,
          })
          .eq("user_id", userId);
        if (declineErr) console.error("[consumer-trial-save-offer] decline write failed", declineErr);
      }
      return json(200, { ok: true, declined: true });
    }

    if (!verdict.eligible) {
      const message = verdict.reason === "already_used"
        ? "You've already had the extra free days on your membership, so nothing has changed."
        : "That offer isn't available on your membership, so nothing has changed.";
      return json(400, { message, code: verdict.reason, error: message, reason: verdict.reason });
    }

    if (!stripe) {
      return fail(
        500,
        "billing_unavailable",
        "We couldn't reach billing just now, so your extra days have not been added and your membership is unchanged. Please try again shortly.",
      );
    }

    let newTrialEndIso: string | null = null;
    try {
      const sub = await stripe.subscriptions.retrieve(row!.stripe_subscription_id!);
      const baseUnix = sub.trial_end ?? Math.floor(Date.now() / 1000);
      const targetUnix = baseUnix + EXTRA_DAYS * 86_400;
      const updated = await stripe.subscriptions.update(row!.stripe_subscription_id!, {
        trial_end: targetUnix,
        proration_behavior: "none",
        cancel_at_period_end: false,
      } as any);
      newTrialEndIso = updated.trial_end
        ? new Date(updated.trial_end * 1000).toISOString()
        : new Date(targetUnix * 1000).toISOString();
      const item = (updated as any).items?.data?.[0];
      const periodEnd = item?.current_period_end ?? (updated as any).current_period_end ?? null;
      await admin
        .from("consumer_subscriptions")
        .update({
          status: updated.status,
          trial_end: newTrialEndIso,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          cancel_at_period_end: updated.cancel_at_period_end ?? false,
        })
        .eq("user_id", userId);
    } catch (stripeErr) {
      // The offer is NOT burned — she can try again.
      return fail(
        502,
        "billing_unreachable",
        "We couldn't reach billing just now, so your extra days have not been added and your membership is unchanged. Please try again in a moment.",
        stripeErr,
      );
    }

    const { error: flagError } = await admin
      .from("consumer_subscriptions")
      .update({
        trial_save_offer_used: true,
        trial_save_offer_claimed_at: new Date().toISOString(),
        trial_save_offer_fact: (personalisation.category as TrialFactCategory | null) ?? null,
      })
      .eq("user_id", userId);
    if (flagError) console.error("[consumer-trial-save-offer] flag write failed", flagError);

    return json(200, {
      ok: true,
      extra_days: EXTRA_DAYS,
      trial_end: newTrialEndIso,
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
