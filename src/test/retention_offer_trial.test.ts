import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The retention offer was unreachable for TRIALING members: the server-side
 * eligibility check only allowed `active` / `past_due`, so "Continue to cancel"
 * went straight to Stripe for anyone still on the free trial. Guard both the
 * eligibility set and the trial-aware copy signal.
 */
const fn = readFileSync(
  "supabase/functions/consumer-retention-offer/index.ts",
  "utf8",
);
const dialog = readFileSync(
  "src/components/profile/RetentionOfferDialog.tsx",
  "utf8",
);

describe("retention offer — trialing members", () => {
  it("treats trialing as an eligible status", () => {
    expect(fn).toContain('status !== "trialing"');
  });

  it("still refuses paused, cancelling and already-used memberships", () => {
    expect(fn).toContain('if (row.paused) return ineligible("paused")');
    expect(fn).toContain('if (row.cancel_at_period_end)');
    expect(fn).toContain('if (row.retention_offer_used)');
  });

  it("tells the client the member is trialing so the copy can differ", () => {
    expect(fn).toContain("trialing,");
    expect(fn).toContain("trial_end: trialEnd,");
    expect(dialog).toContain("offer.trialing");
  });

  it("prices from the member's own tier, never a generic default", () => {
    expect(fn).toContain('const tier = row?.tier === "plus" ? "plus" : "standard"');
    expect(fn).toContain('if (tier === "standard")');
    expect(fn).toContain("consumer_monthly_price_gbp");
  });
});
