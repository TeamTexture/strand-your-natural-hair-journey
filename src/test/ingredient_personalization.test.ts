import { describe, expect, it } from "vitest";
import {
  generateIngredientPersonalization,
  ingredientPersonalizationText,
  selectBenefitIngredients,
  type IngredientPersonalizationInput,
  type IngredientPersonalizationProfile,
} from "@/lib/ingredientPersonalization";

const ingredient: IngredientPersonalizationInput = {
  name: "Shea Butter",
  INCI: "Butyrospermum Parkii Butter",
  role: "hydration",
  howItWorks: "emollient",
};

const profile: IngredientPersonalizationProfile = {
  porosity: "high",
  goals: [{ title: "length retention" }],
  challenges: [],
  climate: "humid",
  stylingHabits: "daily",
};

describe("generateIngredientPersonalization", () => {
  it("includes the member's porosity without forbidden jargon", async () => {
    const result = await generateIngredientPersonalization(ingredient, profile);
    expect(result).toMatch(/porosity|water loss|high/i);
    expect(result).not.toMatch(/emollient|humectant|molecular[- ]weight|cuticle/i);
  });

  it("is no more than two sentences and stays concise", async () => {
    const result = await generateIngredientPersonalization(ingredient, profile);
    const sentences = result.match(/[^.!?]+[.!?]+/g) ?? [];
    expect(sentences.length).toBeLessThanOrEqual(2);
    expect(result.length).toBeLessThan(150);
  });

  it("names a recorded goal or challenge", async () => {
    const result = await generateIngredientPersonalization(ingredient, {
      ...profile,
      goals: [{ title: "length goal" }],
      challenges: ["breakage"],
    });
    expect(result.toLowerCase()).toMatch(/length|breakage/);
  });

  it("returns deterministic output for identical inputs", async () => {
    const first = await generateIngredientPersonalization(ingredient, profile);
    const second = await generateIngredientPersonalization(ingredient, profile);
    expect(first).toBe(second);
    expect(first).toBe(ingredientPersonalizationText(ingredient, profile));
  });

  it("never names another product or makes unsupported moisture claims", async () => {
    const result = await generateIngredientPersonalization(ingredient, profile);
    expect(result).not.toMatch(/restores? moisture|adds? moisture|hydrates?|pair with|follow with|layer with|use with/i);
  });

  it("selects only positive ingredients with a mechanism for the requested role", () => {
    const ingredients = [
      { name: "Fragrance", tone: "bad" as const, category: "Fragrance", body: "Adds scent" },
      { name: "Hydrolyzed Wheat Protein", tone: "good" as const, category: "Protein", body: "Reduces breakage" },
      { name: "Shea Butter", tone: "good" as const, category: "Occlusive", body: "Slows water loss" },
    ];
    expect(selectBenefitIngredients(ingredients, "protection").map((item) => item.name)).toEqual([
      "Hydrolyzed Wheat Protein",
    ]);
    expect(selectBenefitIngredients(ingredients, "moisture-lock").map((item) => item.name)).toEqual([
      "Shea Butter",
    ]);
  });
});
