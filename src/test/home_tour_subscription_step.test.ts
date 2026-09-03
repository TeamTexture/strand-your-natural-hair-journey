import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * The Home tour's final Profile step ("Manage your membership here") kept being
 * dropped mid-run: Profile's subscription card rendered nothing while its query
 * loaded, so the tour found no target and removed the step. These are the two
 * halves of the fix.
 */
describe("Home tour — manage subscription step", () => {
  const tour = read("src/components/HomeTour.tsx");
  const section = read("src/components/profile/ManageSubscriptionSection.tsx");

  it("keeps a step whose target is merely late, retrying before dropping it", () => {
    expect(tour).toContain("MAX_TRIES");
    expect(tour).toMatch(/tries\s*<\s*MAX_TRIES/);
    // The drop must never rewind to an earlier step.
    expect(tour).toContain("Math.max(0, Math.min(s, remaining.length - 1))");
    expect(tour).not.toContain("Math.min(s, Math.max(0, steps.length - 2))");
  });

  it("still defines the subscription step against the Profile anchor", () => {
    expect(tour).toContain('target: "manage-subscription"');
    expect(section).toContain('data-tour="manage-subscription"');
  });

  it("keeps the tour anchor mounted while the subscription is loading", () => {
    const loading = section.slice(section.indexOf("if (isLoading)"));
    const anchor = loading.indexOf('data-tour="manage-subscription"');
    expect(anchor).toBeGreaterThan(-1);
    // The anchor appears inside the loading branch, before the main return.
    expect(anchor).toBeLessThan(loading.indexOf("Current state"));
    expect(section).not.toContain("if (isLoading) return null;");
  });
});
