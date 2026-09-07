// CPU BUDGET — the post-model checking pipeline must finish fast.
//
// 2026-09-07. A 35-ingredient conditioner killed `ingredient-analysis` with
// "CPU Time exceeded" AFTER the model had already answered: the ingredient
// name-lock check re-derived its haystacks and re-filtered ~1,000 known
// molecule names for EVERY prose field, costing 4.4 seconds of worker CPU. The
// member saw "Could not analyse this product." and every Retry paid for
// another generation.
//
// This test feeds a 40-ingredient synthetic payload through the same checks the
// function runs after the model answers, and fails if it is slow again. The
// RULES are unchanged — `content_integrity` and `name_lock_order` prove the
// verdicts are identical; this file only guards the clock.

import { describe, expect, it } from "vitest";
import { checkContentIntegrity } from "../../supabase/functions/_shared/content-integrity.ts";

const INGREDIENTS = [
  "water (aqua) (eau)", "isopropyl palmitate", "stearyl alcohol", "propanediol",
  "isopentyldiol", "behentrimonium chloride", "tocopherol", "tocopheryl acetate",
  "sh-oligopeptide-78", "alteromonas ferment extract",
  "prunus amygdalus dulcis (sweet almond) oil",
  "simmondsia chinensis (jojoba) seed oil", "phospholipids", "jojoba esters",
  "calcium gluconate", "hydroxypropyl guar hydroxypropyltrimonium chloride",
  "ceramide np", "polyquaternium-16", "stearalkonium chloride",
  "isopropyl alcohol", "butylene glycol", "gluconolactone", "phenoxyethanol",
  "sodium benzoate", "citric acid", "sodium hydroxide", "fragrance (parfum)",
  "hydroxycitronellal", "limonene", "citrus aurantium dulcis flower oil",
  "citrus aurantium peel oil", "citrus limon peel oil", "coumarin",
  "cetearyl alcohol", "glycerin", "panthenol", "hydrolyzed keratin",
  "amodimethicone", "trideceth-12", "cetrimonium chloride",
];

/** A detection vocabulary the size of the real `glossary_terms` molecule set. */
const VOCABULARY = [
  ...INGREDIENTS,
  ...Array.from({ length: 1000 }, (_, i) => `Polyquaternium-${i + 1} Complex`),
];

const cards = INGREDIENTS.map((name) => ({
  name,
  body:
    `${name} binds to the cuticle surface and holds water there, so the strand resists friction damage.`,
  tone: "good",
}));

const reasons = Array.from({ length: 6 }, (_, i) => ({
  direction: i % 2 ? "plus" : "minus",
  factor: `Formulation: ${INGREDIENTS[i]}`,
  reason:
    `${INGREDIENTS[i]} coats the cuticle and slows water loss from the strand, which suits your recorded dryness.`,
}));

const fields = [
  {
    field: "summary",
    text:
      "This conditioner leans on behentrimonium chloride and stearyl alcohol to coat the cuticle and hold water at the surface, which suits your high density strands.",
  },
  ...reasons.flatMap((r, i) => [
    { field: `score_reasons[${i}].factor`, text: r.factor },
    { field: `score_reasons[${i}].reason`, text: r.reason },
  ]),
  ...cards.map((c, i) => ({ field: `ingredients[${i}].body`, text: c.body })),
  ...Array.from({ length: 3 }, (_, i) => ({
    field: `personalised_guidance[${i}].body`,
    text:
      "Work a small amount through your mid-lengths and ends, smoothing in sections so it reaches every strand.",
  })),
];

describe("post-model checking pipeline CPU", () => {
  it("clears a 40-ingredient payload well inside the worker CPU budget", () => {
    const started = performance.now();
    {
      checkContentIntegrity({
        functionName: "ingredient-analysis",
        userId: "test-user",
        subject: "link-1788772884901",
        fields,
        cards,
        allowedIngredients: INGREDIENTS,
        ingredientVocabulary: VOCABULARY,
        attempt: 1,
      });
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1500);
  });

  it("still catches an ingredient that is not in the formula", () => {
    const result = checkContentIntegrity({
      functionName: "ingredient-analysis",
      fields: [
        {
          field: "summary",
          text: "Cocos Nucifera Oil coats the cuticle and smooths the strand.",
        },
      ],
      cards: [{ name: "Cocos Nucifera Oil", body: "Coats the strand." }],
      allowedIngredients: INGREDIENTS,
      ingredientVocabulary: [...VOCABULARY, "Cocos Nucifera Oil"],
    });
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v) => v.check === "ingredient_name_lock"),
    ).toBe(true);
  });
});
