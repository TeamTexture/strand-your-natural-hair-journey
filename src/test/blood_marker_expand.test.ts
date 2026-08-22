import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression guard: blood-marker rows must stay expandable, and the marker
 * explanation ("What it is" / "Why it matters") must render at EVERY tips
 * level. Nutrition/diet education is exempt from the tips-level density scale.
 */
describe("blood panel marker expansion", () => {
  const src = readFileSync("src/pages/BloodPanelReview.tsx", "utf8");

  it("does not gate the marker row click on tips level", () => {
    expect(src).toContain("onClick={() => toggle(r.marker)}");
    expect(src).not.toMatch(/level\s*>\s*1\s*&&\s*toggle/);
  });

  it("renders both explanation blocks unconditionally", () => {
    expect(src).toContain("What it is");
    expect(src).toContain("Why it matters");
    expect(src).not.toMatch(/wantsWhy\(level\)/);
    expect(src).not.toMatch(/wantsDetail\(level\)/);
  });
});
