import { describe, expect, it } from "vitest";
import {
  generateIngredientPersonalization,
  ingredientPersonalizationText,
  selectBenefitIngredients,
  type IngredientBenefitRole,
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
  density: "medium",
  heatFrequency: "weekly",
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

describe("generateIngredientPersonalization — role branching", () => {
  it("hydration card varies by porosity", async () => {
    const highP = await generateIngredientPersonalization(
      { name: "Shea", INCI: "...", role: "hydration", howItWorks: "emollient" },
      { ...profile, porosity: "high", goals: [{ title: "length" }] },
    );
    const lowP = await generateIngredientPersonalization(
      { name: "Shea", INCI: "...", role: "hydration", howItWorks: "emollient" },
      { ...profile, porosity: "low", goals: [{ title: "shine" }] },
    );
    expect(highP).toMatch(/high-porosity|loses water quickly/i);
    expect(lowP).toMatch(/low-porosity|absorb moisture/i);
    expect(highP).not.toBe(lowP);
  });

  it("protection card varies by challenges", async () => {
    const withBreakage = await generateIngredientPersonalization(
      { name: "Rice Protein", INCI: "...", role: "protection", howItWorks: "protein" },
      { ...profile, challenges: ["breakage"] },
    );
    const noBreakage = await generateIngredientPersonalization(
      { name: "Rice Protein", INCI: "...", role: "protection", howItWorks: "protein" },
      { ...profile, challenges: [] },
    );
    expect(withBreakage).toMatch(/breakage|strand strength/i);
    expect(noBreakage).not.toMatch(/breakage/i);
  });

  it("moisture-lock card varies by climate", async () => {
    const humid = await generateIngredientPersonalization(
      { name: "Shea", INCI: "...", role: "moisture-lock", howItWorks: "occlusive" },
      { ...profile, climate: "humid" },
    );
    const heatDaily = await generateIngredientPersonalization(
      { name: "Shea", INCI: "...", role: "moisture-lock", howItWorks: "occlusive" },
      { ...profile, climate: "temperate", heatFrequency: "daily" },
    );
    expect(humid).toMatch(/humid|frizz|moisture imbalance/i);
    expect(heatDaily).toMatch(/heat|daily heat styling/i);
  });

  it("same ingredient + role + user profile always produces same output", async () => {
    const sameProfile = { ...profile, goals: [{ title: "length" }] };
    const result1 = await generateIngredientPersonalization(
      { name: "Shea", INCI: "...", role: "hydration", howItWorks: "emollient" },
      sameProfile,
    );
    const result2 = await generateIngredientPersonalization(
      { name: "Shea", INCI: "...", role: "hydration", howItWorks: "emollient" },
      sameProfile,
    );
    expect(result1).toBe(result2);
  });

  it("no jargon or forbidden phrases in any role", async () => {
    const roles: IngredientBenefitRole[] = ["hydration", "protection", "moisture-lock"];
    const testProfile: IngredientPersonalizationProfile = {
      ...profile,
      goals: [{ title: "test" }],
      challenges: ["breakage"],
      climate: "humid",
      stylingHabits: "weekly braids",
      density: "low",
      heatFrequency: "daily",
    };
    for (const role of roles) {
      const result = await generateIngredientPersonalization(
        { name: "Test", INCI: "...", role, howItWorks: "test" },
        testProfile,
      );
      expect(result).not.toMatch(/emollient|molecular-weight|cuticle|humectant/i);
      expect(result).not.toMatch(/pair with|layer with|follow with/i);
    }
  });
});

// Full-context branching (2026-09-11): the cards must reach past porosity into
// chemical history, style, days-in-style and air-dry share.
describe("full-context branching", () => {
  const base = {
    porosity: "medium",
    goals: [{ title: "length retention" }],
    challenges: [] as string[],
    climate: "",
    stylingHabits: "",
    density: "medium",
    heatFrequency: "never",
  };
  const ing = (role: "hydration" | "protection" | "moisture-lock") => ({
    name: "Shea Butter",
    INCI: "Butyrospermum Parkii",
    role,
    howItWorks: "seals",
  });

  it("hydration names the climate when porosity is medium", () => {
    const text = ingredientPersonalizationText(ing("hydration"), { ...base, climate: "humid" });
    expect(text.toLowerCase()).toContain("humid");
  });

  it("protection names chemical history when there is no breakage challenge", () => {
    const text = ingredientPersonalizationText(ing("protection"), {
      ...base,
      chemicalHistory: ["Relaxer"],
    });
    expect(text.toLowerCase()).toContain("chemically treated");
  });

  it("protection names the style tension when nothing else applies", () => {
    const text = ingredientPersonalizationText(ing("protection"), {
      ...base,
      currentHairstyle: "Box braids",
    });
    expect(text.toLowerCase()).toContain("box braids");
  });

  it("moisture-lock names days in style", () => {
    const text = ingredientPersonalizationText(ing("moisture-lock"), {
      ...base,
      currentHairstyle: "Cornrows",
      daysInStyle: 9,
    });
    expect(text).toContain("day 9");
  });

  it("moisture-lock names air-drying when she mostly air-dries", () => {
    const text = ingredientPersonalizationText(ing("moisture-lock"), {
      ...base,
      airDryPercentage: 90,
    });
    expect(text.toLowerCase()).toContain("air-dry");
  });

  it("stays deterministic with the fuller profile", () => {
    const profile = { ...base, chemicalHistory: ["Colour"], daysInStyle: 12, currentHairstyle: "Twists" };
    expect(ingredientPersonalizationText(ing("moisture-lock"), profile)).toBe(
      ingredientPersonalizationText(ing("moisture-lock"), profile),
    );
  });
});
