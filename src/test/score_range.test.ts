// SCORE RANGE — the quality/safety axis has a genuine downside path.
//
// Regression guard for the 2026-09-01 clustering fix. Three independent floors
// (alignScoreWithReasons' 65, applyFitFirst's 70/80, and applyConcernFit's
// floor-only bonus) meant 61% of real scans landed at 90+ and almost nothing
// could land below 60. The floors are gone; only evidence-based ceilings and a
// SIGNED fit bonus remain.
import { describe, expect, it } from "vitest";
import { applyFitFirst } from "../../supabase/functions/_shared/fit-first-score.ts";
import { alignScoreWithReasons } from "../../supabase/functions/_shared/score-reasons.ts";
import {
  applyConcernFit,
  concernContribution,
} from "../../supabase/functions/_shared/concern-fit.ts";
import { rotateProfileSignals } from "../../supabase/functions/_shared/tiers.ts";

const plus = (factor: string, reason: string) => ({ direction: "plus" as const, factor, reason });
const conflict = {
  direction: "minus" as const,
  factor: "Denatured alcohol high in the list",
  reason: "It strips water from the strand, which works against moisture retention.",
};

describe("no artificial floors on the quality/safety axis", () => {
  it("a thin-but-harmless formula keeps its mediocre number", () => {
    const out = applyFitFirst(56, [plus("Mild cleansing base", "Decyl glucoside lifts sebum without stripping.")], []);
    expect(out.score).toBe(56);
  });

  it("a low quality number is not lifted into the good-fit band", () => {
    expect(applyFitFirst(48, [plus("Slip", "Behentrimonium methosulfate smooths the cuticle.")], []).score).toBe(48);
  });

  it("alignScoreWithReasons does not lift a conflict-free verdict", () => {
    const reasons = [
      plus("Humectant", "Glycerin draws water from the air into the strand."),
      plus("Emollient", "Shea butter slows water loss from the strand."),
    ];
    expect(alignScoreWithReasons(58, reasons)).toBe(58);
  });

  it("still caps a verdict that shows nothing working and a real conflict", () => {
    expect(alignScoreWithReasons(88, [conflict, { ...conflict, factor: "Sulfate first" }])).toBe(55);
  });
});

describe("the concern/challenge bonus is signed, not floor-only", () => {
  it("conflicts pull the bonus below zero", () => {
    const c = concernContribution({
      reasons: [],
      concerns: ["edges"],
      challenges: ["Breakage"],
      conflicts: 3,
    });
    expect(c.bonus).toBeLessThan(0);
  });

  it("a genuine conflict can lower the final score", () => {
    const out = applyConcernFit({
      score: 70,
      reasons: [conflict],
      cards: [],
      ingredients: ["Alcohol denat."],
      concerns: ["edges"],
      challenges: ["Breakage"],
    });
    expect(out.score).not.toBeNull();
    expect(out.score!).toBeLessThan(70);
  });

  it("never exceeds 95 and never goes negative", () => {
    const high = applyConcernFit({
      score: 92,
      reasons: [plus("Peptide system", "The peptide blend supports the strand at the root.")],
      cards: [],
      ingredients: ["Water", "Oligopeptide-2"],
      concerns: ["edges", "crown", "nape"],
      challenges: ["Shedding"],
    });
    expect(high.score!).toBeLessThanOrEqual(95);
    const low = applyConcernFit({
      score: 4,
      reasons: [conflict, { ...conflict, factor: "Sulfate first" }],
      cards: [],
      ingredients: ["Alcohol denat."],
      concerns: ["edges"],
      challenges: ["Dryness"],
    });
    expect(low.score!).toBeGreaterThanOrEqual(0);
  });
});

describe("no recorded characteristic is structurally first", () => {
  const profile = {
    porosity: "high",
    density: "medium",
    elasticity: "low",
    diameter: "fine",
    areas_of_concern: ["edges"],
    goal_note: "length retention",
  };

  it("puts her own recorded areas of concern first", () => {
    const out = rotateProfileSignals(profile, "brand|product")!;
    expect(Object.keys(out)[0]).toBe("areas_of_concern");
  });

  it("rotates so porosity is not always the leading characteristic", () => {
    const leads = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => {
        const keys = Object.keys(rotateProfileSignals(profile, seed)!);
        return keys.find((k) => k !== "areas_of_concern");
      }),
    );
    expect(leads.size).toBeGreaterThan(1);
  });

  it("is deterministic for the same product and loses no fields", () => {
    const a = rotateProfileSignals(profile, "same");
    const b = rotateProfileSignals(profile, "same");
    expect(Object.keys(a!)).toEqual(Object.keys(b!));
    expect(Object.keys(a!).sort()).toEqual(Object.keys(profile).sort());
    for (const k of Object.keys(profile)) {
      expect(a![k]).toEqual((profile as Record<string, unknown>)[k]);
    }
  });
});
