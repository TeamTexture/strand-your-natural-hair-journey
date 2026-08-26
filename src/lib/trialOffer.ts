import { supabase } from "@/integrations/supabase/client";
import { rowGrantsAccess } from "@/lib/entitlement";

/**
 * The 3-day free trial paywall — the FIRST screen a brand-new member sees after
 * registration, before the six onboarding steps.
 *
 * WHO SEES IT: only accounts whose `profiles.trial_offer_at` is set, which is
 * written once at registration by the sign-up form. Every member who registered
 * before this funnel existed has NULL there, so they never see the screen and
 * keep their existing route into the app.
 *
 * WHO STOPS SEEING IT: anyone with a `consumer_subscriptions` row that has ever
 * been more than "none" — a member never gets offered a second trial.
 */
export const TRIAL_PAYWALL_PATH = "/start-trial";
export const TRIAL_DAYS = 3;

/** The date the free period ends — computed, never hardcoded. */
export const trialEndsOn = (from: Date = new Date()): Date =>
  new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

/** "28 August 2026" */
export const formatTrialEnd = (d: Date = trialEndsOn()): string =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Stamp this account as one that was registered into the trial funnel.
 * The profile row is created by a database trigger on sign-up, so the update
 * is retried briefly rather than assumed to land first time.
 */
export async function markTrialOffer(userId: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ trial_offer_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("trial_offer_at", null)
      .select("user_id");
    if (!error && (data?.length ?? 0) > 0) return;
    const { data: existing } = await supabase
      .from("profiles")
      .select("trial_offer_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.trial_offer_at) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

export type TrialOfferState = {
  /** True when this account must be held on the paywall. */
  walled: boolean;
  /** True when a 3-day trial may still be offered — mirrors consumer-checkout. */
  trialEligible: boolean;
  /** True when step 1 (goal & challenges) is already answered. */
  goalCaptured: boolean;
};

/**
 * The paywall's single decision.
 *
 * WALLED = stamped into the funnel (`profiles.trial_offer_at`), with no live
 * membership, no complimentary access and no admin/professional role. A paused
 * membership is left alone — `PaidGate` owns that screen.
 *
 * TRIAL ELIGIBLE mirrors the one-trial-per-account rule in `consumer-checkout`
 * exactly, so the screen and the checkout can never disagree: no prior
 * subscription id, no recorded `trial_end`, and a status of `none` (or none at
 * all). A member must never tap "Start my 3 days free" and be charged today.
 */
export async function getTrialOfferState(userId: string): Promise<TrialOfferState> {
  const none: TrialOfferState = { walled: false, trialEligible: false, goalCaptured: false };
  const [{ data: profile }, { data: sub }, { data: roleRows }, goalRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("trial_offer_at, complimentary_access")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("consumer_subscriptions")
      .select("status, current_period_end, paused, stripe_subscription_id, trial_end")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("user_goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  const goalCaptured = (goalRes.count ?? 0) > 0;
  const row = profile as
    | { trial_offer_at?: string | null; complimentary_access?: boolean | null }
    | null;
  if (!row?.trial_offer_at) return none;
  if (row.complimentary_access) return none;

  const roles = new Set(((roleRows ?? []) as { role: string }[]).map((r) => r.role));
  if (roles.has("admin") || roles.has("professional")) return none;

  const s = sub as {
    status?: string | null;
    current_period_end?: string | null;
    paused?: boolean | null;
    stripe_subscription_id?: string | null;
    trial_end?: string | null;
  } | null;
  if (s?.paused) return none;
  if (rowGrantsAccess(s)) return none;

  const trialEligible =
    !s?.stripe_subscription_id && !s?.trial_end && (!s?.status || s.status === "none");
  return { walled: true, trialEligible, goalCaptured };
}

/**
 * True when this account should be held on the trial paywall. Kept as the
 * routing helper used by the sign-in / splash / welcome destination resolvers.
 */
export async function trialOfferPending(userId: string): Promise<boolean> {
  return (await getTrialOfferState(userId)).walled;
}
