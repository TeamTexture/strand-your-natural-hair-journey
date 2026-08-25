import { supabase } from "@/integrations/supabase/client";

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
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * True when this account should be routed to the trial paywall: it was
 * registered into the trial funnel and has never held a subscription.
 */
export async function trialOfferPending(userId: string): Promise<boolean> {
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from("profiles")
      .select("trial_offer_at, complimentary_access")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("consumer_subscriptions")
      .select("status, stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const row = profile as
    | { trial_offer_at?: string | null; complimentary_access?: boolean | null }
    | null;
  if (!row?.trial_offer_at) return false;
  if (row.complimentary_access) return false;
  const s = sub as { status?: string | null; stripe_subscription_id?: string | null } | null;
  if (s?.stripe_subscription_id) return false;
  if (s?.status && s.status !== "none") return false;
  return true;
}
