// Mid-campaign audience changes are where money leaks: a brand that books at the
// broad rate and then adds targeting must not get the targeted product at the
// broad price — but must also never be charged again for days already delivered.

import { describe, expect, it } from "vitest";
import { buildUpliftQuote, dailyRatePence, type QuotePlacement } from "@/lib/adPricing";

/** 4-day home booking sold at the broad rate; today is day 3 of 4. */
const homeBroad: QuotePlacement[] = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"].map((d) => ({
  slot: "home",
  placement_date: d,
  daily_rate_pence: dailyRatePence("home", false),
}));

const TODAY = "2026-03-03";

describe("buildUpliftQuote", () => {
  it("charges broad → targeted for remaining days only", () => {
    const q = buildUpliftQuote(homeBroad, TODAY, false, true);
    expect(q.remainingDays).toBe(2);
    expect(q.paymentRequired).toBe(true);
    const perDay = dailyRatePence("home", true) - dailyRatePence("home", false);
    expect(q.totalPence).toBe(perDay * 2);
    expect(q.lines[0].oldRatePence).toBe(dailyRatePence("home", false));
    expect(q.lines[0].newRatePence).toBe(dailyRatePence("home", true));
  });

  it("never charges for days already delivered", () => {
    const allDelivered = buildUpliftQuote(homeBroad, "2026-03-05", false, true);
    expect(allDelivered.remainingDays).toBe(0);
    expect(allDelivered.totalPence).toBe(0);
    expect(allDelivered.paymentRequired).toBe(false);
  });

  it("charges nothing when the tier is unchanged (targeted → targeted)", () => {
    const targeted: QuotePlacement[] = homeBroad.map((p) => ({ ...p, daily_rate_pence: dailyRatePence("home", true) }));
    const q = buildUpliftQuote(targeted, TODAY, true, true);
    expect(q.paymentRequired).toBe(false);
    expect(q.totalPence).toBe(0);
    expect(q.tierBefore).toBe("targeted");
    expect(q.tierAfter).toBe("targeted");
  });

  it("charges nothing when a broad campaign stays broad", () => {
    const q = buildUpliftQuote(homeBroad, TODAY, false, false);
    expect(q.paymentRequired).toBe(false);
    expect(q.totalPence).toBe(0);
  });

  it("allows targeted → broad with no refund", () => {
    const targeted: QuotePlacement[] = homeBroad.map((p) => ({ ...p, daily_rate_pence: dailyRatePence("home", true) }));
    const q = buildUpliftQuote(targeted, TODAY, true, false);
    expect(q.isRemoval).toBe(true);
    expect(q.paymentRequired).toBe(false);
    // No negative total anywhere — refunds are explicitly not built.
    expect(q.totalPence).toBe(0);
  });

  it("prices each slot at its own rate across a multi-slot campaign", () => {
    const mixed: QuotePlacement[] = [
      { slot: "home", placement_date: "2026-03-03", daily_rate_pence: dailyRatePence("home", false) },
      { slot: "wash_day", placement_date: "2026-03-03", daily_rate_pence: dailyRatePence("wash_day", false) },
    ];
    const q = buildUpliftQuote(mixed, TODAY, false, true);
    expect(q.remainingDays).toBe(1);
    const expected =
      dailyRatePence("home", true) - dailyRatePence("home", false) +
      (dailyRatePence("wash_day", true) - dailyRatePence("wash_day", false));
    expect(q.totalPence).toBe(expected);
  });
});
