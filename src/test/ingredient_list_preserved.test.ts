import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyFieldNulls,
  type FailsafeViolation,
} from "../../supabase/functions/_shared/analysis-failsafes.ts";
import { validateIngredientCardNames } from "../../supabase/functions/_shared/ingredient-name-lock.ts";

/**
 * REGRESSION (2026-09-01). A card naming an ingredient outside the supplied
 * list reported itself as `ingredients[].name`, which the repair pass read as
 * "null the field `ingredients`" — wiping the verified INCI list read off the
 * pack. The scan then saved a product with no ingredients, the page showed
 * "we couldn't read the ingredients", and the follow-up ingredient pass
 * refused to run at all.
 */
describe("verified ingredient list survives a card-name rejection", () => {
  it("names the offending CARD, indexed, under the array it lives in", () => {
    const lock = { allowed: ["Aqua", "Glycerin"], vocabulary: [] } as never;
    const v = validateIngredientCardNames(
      [{ name: "Glycerin", body: "x" }, { name: "C15-19 Alkane & Undecane", body: "y" }],
      lock,
      "key_ingredients",
    );
    expect(v).toHaveLength(1);
    expect(v[0].field).toBe("key_ingredients[1].name");
  });

  it("drops the card and never nulls the ingredient list", () => {
    const payload: Record<string, unknown> = {
      product_name: "Omega Leave-In",
      brand: "Dyson",
      ingredients: ["Aqua", "Glycerin"],
      key_ingredients: [{ name: "Glycerin" }, { name: "C15-19 Alkane" }],
      ai_summary: "…",
      match_score: 74,
    };
    const violations: FailsafeViolation[] = [
      { field: "key_ingredients[1].name", phrase: "C15-19 Alkane", rule: "not supplied" },
      { field: "ai_summary", phrase: "…", rule: "vocabulary" },
    ];
    applyFieldNulls(payload, violations);
    expect(payload.ingredients).toEqual(["Aqua", "Glycerin"]);
    expect((payload.key_ingredients as unknown[]).length).toBe(1);
    expect(payload.product_name).toBe("Omega Leave-In");
    expect(payload.match_score).toBe(74);
    expect(payload.ai_summary).toBeNull();
  });

  it("still refuses to null the list even if a violation names it directly", () => {
    const payload: Record<string, unknown> = { ingredients: ["Aqua"] };
    applyFieldNulls(payload, [{ field: "ingredients", phrase: "x", rule: "y" }]);
    expect(payload.ingredients).toEqual(["Aqua"]);
  });

  it("product surfaces declare their cards live in key_ingredients", () => {
    for (const fn of ["product-analyse", "product-analyse-url"]) {
      const src = readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
      expect(src).toContain('cardsField: "key_ingredients"');
    }
  });
});
