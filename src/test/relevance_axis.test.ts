// Relevance is not a penalty (2026-08-30 regression).
// A well-formulated product that targets a different concern than the member's
// stated goal must not be scored as a conflict, and must not be capped at 55.
import { describe, expect, it } from "vitest";
import {
  applyFitFirst,
  minusIsScoreWorthy,
} from "../../supabase/functions/_shared/fit-first-score.ts";
import { alignScoreWithReasons } from "../../supabase/functions/_shared/score-reasons.ts";

const k18Minus = {
  direction: "minus" as const,
  factor: "Targets ageing, greying and shedding",
  reason:
    "The peptide blend is built for ageing and shedding rather than your stated breakage and length-retention concern.",
};

const realConflict = {
  direction: "minus" as const,
  factor: "Denatured alcohol high in the list",
  reason: "It strips water from high porosity strands, which works against moisture retention.",
};

describe("relevance mismatches are not score-worthy minuses", () => {
  it("treats a purpose mismatch as a Strand Tip, not a conflict", () => {
    expect(minusIsScoreWorthy(k18Minus)).toBe(false);
  });

  it("still counts a real conflict mechanism against the score", () => {
    expect(minusIsScoreWorthy(realConflict)).toBe(true);
  });

  it("does not cap a relevance-only verdict at 55", () => {
    const out = applyFitFirst(52, [k18Minus], []);
    expect(out.reasons.some((r) => r.direction === "minus")).toBe(false);
    expect(out.strandTips.length).toBe(1);
    expect(out.score).toBeGreaterThanOrEqual(70);
  });

  it("alignScoreWithReasons ignores relevance minuses", () => {
    expect(alignScoreWithReasons(88, [k18Minus, { ...k18Minus }])).toBe(88);
    // Two real conflicts with no plus still reads as a caution.
    expect(alignScoreWithReasons(88, [realConflict, { ...realConflict }])).toBe(55);

  });
});
