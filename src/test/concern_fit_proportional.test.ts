import { describe, expect, it } from "vitest";
import {
  applyConcernFit,
  parseChallenges,
  parseConcerns,
} from "../../supabase/functions/_shared/concern-fit.ts";
import {
  heroActiveOmissions,
  rankScoreReasons,
} from "../../supabase/functions/_shared/score-reasons.ts";
import { applyBenignFlagPolicy } from "../../supabase/functions/_shared/benign-flags.ts";
import { validateMechanismSpecificity } from "../../supabase/functions/_shared/mechanism-specificity.ts";

const concerns = parseConcerns(["edges_hairline", "thinning"]);
const challenges = parseChallenges(["Breakage", "Dryness"]);

describe("concern fit is proportional, not a flat floor", () => {
  it("lifts a formula whose named hero active serves her concerns", () => {
    const out = applyConcernFit({
      score: 62,
      reasons: [
        {
          direction: "plus",
          factor: "Tetrapeptide-cysteinate",
          reason:
            "Binds to keratin at the emerging strand, supporting root anchoring where you recorded thinning at your edges.",
        },
      ],
      cards: [],
      concerns,
      challenges,
      ingredients: ["Water", "Tetrapeptide-cysteinate", "Glycerin"],
    });
    expect(out.contribution.centrality).toBe(1);
    expect(out.score!).toBeGreaterThan(62);
    expect(out.score!).toBeLessThanOrEqual(95);
  });

  it("gives a much smaller lift when only a trace support component matches", () => {
    const central = applyConcernFit({
      score: 60,
      reasons: [{ direction: "plus", factor: "Hydrolysed keratin", reason: "Rebuilds root anchoring at your edges." }],
      cards: [],
      concerns,
      challenges,
      ingredients: ["Hydrolysed keratin"],
    });
    const trace = applyConcernFit({
      score: 60,
      reasons: [{ direction: "plus", factor: "Formula", reason: "Supports scalp health." }],
      cards: [{ name: "Glycerin", body: "Supports scalp condition." }],
      concerns,
      challenges,
      ingredients: ["Water", "Glycerin"],
    });
    expect(central.contribution.bonus).toBeGreaterThan(trace.contribution.bonus);
    expect(trace.contribution.bonus).toBeLessThan(12);
  });

  it("does not floor an unrelated formula", () => {
    const out = applyConcernFit({
      score: 45,
      reasons: [{ direction: "minus", factor: "Denatured alcohol", reason: "Dries the cuticle." }],
      cards: [],
      concerns,
      challenges,
      ingredients: ["Alcohol denat."],
    });
    expect(out.score).toBe(45);
  });
});

describe("hero actives lead the verdict", () => {
  const glycerinLed = [
    { direction: "plus" as const, factor: "Glycerin", reason: "Draws water from the air into the cuticle." },
    { direction: "plus" as const, factor: "Tetrapeptide-cysteinate", reason: "Binds to keratin at the root." },
  ];

  it("re-orders headline actives above the supporting cast", () => {
    expect(rankScoreReasons(glycerinLed)[0].factor).toBe("Tetrapeptide-cysteinate");
  });

  it("asks for a rewrite when the hero active is never named", () => {
    const problems = heroActiveOmissions(
      [{ direction: "plus", factor: "Glycerin", reason: "Humectant." }],
      ["Water", "Tetrapeptide-cysteinate", "Glycerin"],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("headline actives");
  });
});

describe("routine functional ingredients are not warnings", () => {
  it("downgrades a preservative flagged warn on class grounds", () => {
    const out = applyBenignFlagPolicy({
      cards: [{ name: "Sodium benzoate", flag: "warn", body: "A preservative." }],
      declaredSensitivities: [],
    });
    expect((out.cards as Array<Record<string, unknown>>)[0].flag).toBe("good");
  });

  it("keeps the caution when she has declared that sensitivity", () => {
    const out = applyBenignFlagPolicy({
      cards: [{ name: "Fragrance", flag: "warn", body: "Perfume blend." }],
      declaredSensitivities: ["fragrance"],
    });
    expect((out.cards as Array<Record<string, unknown>>)[0].flag).toBe("warn");
  });
});

describe("ingredient cards must state a mechanism", () => {
  it("rejects generic category filler", () => {
    expect(
      validateMechanismSpecificity([
        { name: "Tetrapeptide-cysteinate", body: "A peptide-derived conditioning agent." },
      ]).length,
    ).toBeGreaterThan(0);
  });

  it("accepts a real mechanism with a site of action", () => {
    expect(
      validateMechanismSpecificity([
        {
          name: "Tetrapeptide-cysteinate",
          body: "Binds to keratin in the cuticle of the emerging strand at the scalp surface.",
        },
      ]),
    ).toHaveLength(0);
  });
});
