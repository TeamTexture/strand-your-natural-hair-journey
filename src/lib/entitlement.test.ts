import { describe, it, expect } from "vitest";
import { subscriptionGrantsAccess, rowGrantsAccess } from "@/lib/entitlement";

const FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();
const PAST = new Date(Date.now() - 5 * 864e5).toISOString();

describe("subscriptionGrantsAccess", () => {
  it("grants access while active", () => {
    expect(subscriptionGrantsAccess("active", FUTURE)).toBe(true);
    expect(subscriptionGrantsAccess("trialing", FUTURE)).toBe(true);
  });

  it("case 1 — canceled subscription loses access once the paid period ends", () => {
    expect(subscriptionGrantsAccess("canceled", FUTURE)).toBe(true); // paid period honoured
    expect(subscriptionGrantsAccess("canceled", PAST)).toBe(false);
    expect(subscriptionGrantsAccess("canceled", null)).toBe(false);
  });

  it("case 2 — a period end in the past revokes access even when status says active", () => {
    expect(subscriptionGrantsAccess("active", PAST)).toBe(false);
  });

  it("past_due keeps access only inside the paid period", () => {
    expect(subscriptionGrantsAccess("past_due", FUTURE)).toBe(true);
    expect(subscriptionGrantsAccess("past_due", PAST)).toBe(false);
  });

  it("unknown or missing status never grants access", () => {
    expect(subscriptionGrantsAccess(null, FUTURE)).toBe(false);
    expect(subscriptionGrantsAccess("unpaid", FUTURE)).toBe(false);
    expect(subscriptionGrantsAccess("incomplete_expired", FUTURE)).toBe(false);
  });
});

describe("rowGrantsAccess — pause trap", () => {
  it("a paused subscription grants no access even though Stripe says active", () => {
    expect(rowGrantsAccess({ status: "active", current_period_end: FUTURE, paused: true }))
      .toBe(false);
  });

  it("resuming restores access", () => {
    expect(rowGrantsAccess({ status: "active", current_period_end: FUTURE, paused: false }))
      .toBe(true);
  });

  it("pause never rescues a lapsed period", () => {
    expect(rowGrantsAccess({ status: "active", current_period_end: PAST, paused: false }))
      .toBe(false);
  });
});
