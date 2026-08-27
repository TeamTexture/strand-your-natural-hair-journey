// Accuracy in BOTH directions on the homemade spoilage warning:
// - a genuine unpreserved water-based DIY mix still gets the full warning
// - a preserved formula (e.g. a real leave-in ingredient list) never does
import { describe, it, expect } from "vitest";
import {
  buildHomemadeSafety,
  findPreservatives,
  type RecipeItem,
} from "../../supabase/functions/_shared/homemade-safety.ts";

const item = (ingredient: string): RecipeItem => ({ ingredient, amount: "" });

describe("homemade preservation check", () => {
  it("still warns hard on a real unpreserved DIY mix", () => {
    const recipe = ["aloe vera juice", "rice water", "shea butter"].map(item);
    const safety = buildHomemadeSafety(recipe, []);
    const warning = safety.hazards.find((h) => h.id === "no-preservative");
    expect(warning?.title).toBe("Nothing in this recipe preserves it");
    expect(warning?.severity).toBe("caution");
    expect(safety.preservation).toBeUndefined();
  });

  it("does not warn when the list carries a preservative (Amika-style leave-in)", () => {
    const recipe = [
      "water",
      "glycerin",
      "cetearyl alcohol",
      "phenoxyethanol",
      "sodium benzoate",
      "citric acid",
    ].map(item);
    const safety = buildHomemadeSafety(recipe, [], ["Phenoxyethanol", "Sodium Benzoate"]);
    expect(safety.hazards.find((h) => h.id === "no-preservative")).toBeUndefined();
    expect(safety.preservation?.status).toBe("preserved");
    expect(safety.preservation?.note).toMatch(/normal shelf life/i);
  });

  it("honours the glossary category even for a preservative not in the fallback list", () => {
    const recipe = ["aloe vera juice", "sodium metabisulfite"].map(item);
    expect(findPreservatives(recipe)).toEqual([]);
    expect(findPreservatives(recipe, ["sodium metabisulfite"])).toEqual(["sodium metabisulfite"]);
  });

  it("citric acid alone is not treated as a preservative system", () => {
    const safety = buildHomemadeSafety(["aloe vera juice", "citric acid"].map(item), []);
    expect(safety.hazards.some((h) => h.id === "no-preservative")).toBe(true);
  });
});
