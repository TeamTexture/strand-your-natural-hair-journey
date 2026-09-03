import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * PAYWALL INTEGRITY REGRESSION.
 *
 * A brand-new account registered with an email address that once belonged to a
 * cancelled Stripe customer used to adopt that old subscription. A `canceled`
 * row with a future period end grants grace access, so the account walked past
 * the trial paywall with no card on file.
 *
 * Ownership must therefore require the already-linked customer, or Stripe
 * metadata naming this user id — never an email match alone.
 */
const src = readFileSync(
  "supabase/functions/consumer-verify-subscription/index.ts",
  "utf8",
);

describe("consumer-verify-subscription ownership", () => {
  it("never adopts an email-matched customer without ownership metadata", () => {
    expect(src).toContain("consumer_user_id");
    // The email lookup must feed an ownership check, not the candidate set.
    expect(src).not.toMatch(/for \(const c of found\.data\) candidates\.add\(c\.id\)/);
    expect(src).toMatch(/tag && tag === userId/);
  });

  it("only lists subscriptions for owned customers", () => {
    expect(src).toMatch(/for \(const customer of owned\)/);
    expect(src).not.toMatch(/for \(const customer of candidates\)/);
  });

  it("refuses a customer already linked to another member", () => {
    expect(src).toMatch(/\.neq\("user_id", userId\)/);
  });

  it("filters the final subscription set by ownership", () => {
    expect(src).toMatch(/tag === userId \|\| \(cust \? owned\.has\(cust\) : false\)/);
  });
});
