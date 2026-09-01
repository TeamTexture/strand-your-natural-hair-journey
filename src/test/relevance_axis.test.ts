// Relevance is not a penalty (2026-08-30 regression).
// A well-formulated product that targets a different concern than the member's
// stated goal must not be scored as a conflict, and must not be capped at 55.
import { describe, expect, it } from "vitest";
import {
  applyFitFirst,
  minusIsScoreWorthy,
} from "../../supabase/functions/_shared/fit-first-score.ts";
import { alignScoreWithReasons } from "../../supabase/functions/_shared/score-reasons.ts";
import { resolveScoreAxes } from "../../supabase/functions/_shared/relevance-axis.ts";

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

  it("neither penalises nor lifts a relevance-only verdict", () => {
    const out = applyFitFirst(52, [k18Minus], []);
    expect(out.reasons.some((r) => r.direction === "minus")).toBe(false);
    expect(out.strandTips.length).toBe(1);
    // 2026-09-01: relevance is not a penalty, but it is not a licence to lift
    // either. The old 70 floor is gone — the quality axis keeps its own number.
    expect(out.score).toBe(52);
  });


  it("alignScoreWithReasons ignores relevance minuses", () => {
    expect(alignScoreWithReasons(88, [k18Minus, { ...k18Minus }])).toBe(88);
    // Two real conflicts with no plus still reads as a caution.
    expect(alignScoreWithReasons(88, [realConflict, { ...realConflict }])).toBe(55);

  });
});

// ── PART 2 (2026-09-01): quality/safety and relevance are SEPARATE axes ────
describe("two axes: quality/safety vs relevance", () => {
  it("derives the score from the quality axis, not the contaminated match_score", () => {
    const axes = resolveScoreAxes({ matchScore: 52, qualityScore: 88, reasons: [k18Minus] });
    expect(axes.score).toBe(88);
    expect(axes.qualityScore).toBe(88);
  });

  it("keeps the single number when the model gave no quality axis", () => {
    expect(resolveScoreAxes({ matchScore: 74 }).score).toBe(74);
  });

  it("uses the model's relevance_note when supplied", () => {
    const axes = resolveScoreAxes({
      matchScore: 80,
      relevanceNote: "This is built around density and regrowth rather than the breakage you recorded.",
    });
    expect(axes.relevanceNote).toMatch(/density and regrowth/);
  });

  it("recovers a relevance note from a mismatch the model filed as a minus", () => {
    const axes = resolveScoreAxes({ matchScore: 52, qualityScore: 88, reasons: [k18Minus] });
    expect(axes.relevanceNote).toMatch(/ageing and shedding/);
  });

  it("never turns a real conflict into a relevance note", () => {
    expect(resolveScoreAxes({ matchScore: 55, reasons: [realConflict] }).relevanceNote).toBeNull();
  });

  it("catches a purpose mismatch phrased without the old giveaway wording", () => {
    expect(
      minusIsScoreWorthy({
        direction: "minus",
        factor: "Built for scalp fullness",
        reason: "The formula is built for crown fullness; your goal is length retention.",
      }),
    ).toBe(false);
  });
});
