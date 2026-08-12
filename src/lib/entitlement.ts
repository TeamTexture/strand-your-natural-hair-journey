/**
 * Membership entitlement — the single rule for "is this paid period still good?".
 *
 * Shared by the client paywall and mirrored by the server-side helper in
 * `supabase/functions/_shared/entitlement.ts`, so the app and the AI budget
 * agree on who has access.
 *
 * The paid period is always honoured. A member who paid to the 30th and
 * cancels on the 12th keeps access to the 30th — Stripe leaves the
 * subscription `active` with `cancel_at_period_end: true` until then, and even
 * if it lands as `canceled` early we still respect a future period end.
 *
 * `past_due` is Stripe mid-dunning: the invoice failed but Stripe is still
 * retrying, so access continues to the end of the period already paid for.
 * Once that date passes (or the status becomes `unpaid`/`incomplete_expired`),
 * access ends.
 */

/** Statuses that grant access outright. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/** Statuses that grant access only while the paid period has not run out. */
const GRACE_STATUSES = new Set(["past_due", "canceled", "cancelled"]);

export function subscriptionGrantsAccess(
  status: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!status) return false;
  const periodLive = !!currentPeriodEnd && new Date(currentPeriodEnd) > now;

  if (ACTIVE_STATUSES.has(status)) {
    // An active subscription with a period end in the past has lapsed.
    return !currentPeriodEnd || periodLive;
  }
  if (GRACE_STATUSES.has(status)) return periodLive;
  return false;
}
