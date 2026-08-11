import { describe, expect, it } from "vitest";
import {
  MARKER_EXPLANATIONS,
  foodsForDiet,
} from "@/data/bloodMarkerExplanations";
import {
  DIET_EXCLUSIONS,
  canonDiet,
  dietConstraintBlock,
  displayDiet,
} from "@/lib/dietaryPattern";

/**
 * Dietary integrity. Pescatarian and "Other" used to collapse into omnivore,
 * so those members were shown meat. These tests lock the four paths.
 */

const BANNED: Record<string, RegExp[]> = {
  vegan: [/\bmeat\b/i, /\bfish\b/i, /shellfish/i, /\beggs?\b/i, /dairy/i, /cheese/i, /milk/i, /salmon/i, /sardines/i, /mackerel/i, /tuna/i, /honey/i, /gelatine/i],
  vegetarian: [/\bmeat\b/i, /\bfish\b/i, /shellfish/i, /salmon/i, /sardines/i, /mackerel/i, /tuna/i, /gelatine/i],
  pescatarian: [/\bmeat\b/i, /poultry/i, /\bchicken\b/i, /\bbeef\b/i, /\bliver\b/i],
  other: [/\bmeat\b/i, /\bfish\b/i, /shellfish/i, /\beggs?\b/i, /dairy/i, /cheese/i],
  unknown: [/\bmeat\b/i, /\bfish\b/i, /shellfish/i, /\beggs?\b/i, /dairy/i, /cheese/i],
};

// Two curated lines name plant stand-ins ("oily-fish alternatives for
// omega-3", "fortified spreads and meat alternatives"). They exclude no food,
// so they are allowed for every pattern.
const ALLOWED_MENTION = /alternatives/i;

describe("canonDiet", () => {
  it("keeps every option in the UI distinct", () => {
    expect(canonDiet("Omnivore")).toBe("omnivore");
    expect(canonDiet("Vegetarian")).toBe("vegetarian");
    expect(canonDiet("Vegan")).toBe("vegan");
    expect(canonDiet("Pescatarian")).toBe("pescatarian");
    expect(canonDiet("Other")).toBe("other");
  });

  it("never collapses an unrecognised value into omnivore", () => {
    for (const v of ["", null, undefined, "flexitarian", "who knows", "raw"]) {
      expect(canonDiet(v as string)).toBe("unknown");
    }
  });

  it("reads a pescatarian back as pescatarian", () => {
    expect(displayDiet("pescatarian")).toBe("Pescatarian");
    expect(displayDiet("Pescatarian")).toBe("Pescatarian");
  });
});

describe("curated food lists are filtered before render", () => {
  for (const diet of ["vegan", "vegetarian", "pescatarian", "other", "unknown"] as const) {
    it(`shows no excluded food to a ${diet} member`, () => {
      for (const [marker, info] of Object.entries(MARKER_EXPLANATIONS)) {
        for (const food of foodsForDiet(info, diet)) {
          if (ALLOWED_MENTION.test(food)) continue;
          for (const rx of BANNED[diet]) {
            expect(rx.test(food), `${diet} / ${marker}: "${food}"`).toBe(false);
          }
        }
      }
    });
  }

  it("surfaces fish sources to a pescatarian that a vegetarian does not see", () => {
    const pesc = foodsForDiet(MARKER_EXPLANATIONS["Ferritin"], "pescatarian").join(" | ");
    const veg = foodsForDiet(MARKER_EXPLANATIONS["Ferritin"], "vegetarian").join(" | ");
    expect(pesc).toMatch(/sardines/i);
    expect(veg).not.toMatch(/sardines/i);
    expect(pesc).not.toMatch(/red meat/i);
  });

  it("substitutes rather than subtracts — every restricted pattern still gets iron sources", () => {
    for (const diet of ["vegan", "vegetarian", "pescatarian", "other", "unknown"] as const) {
      const foods = foodsForDiet(MARKER_EXPLANATIONS["Ferritin"], diet);
      expect(foods.length, diet).toBeGreaterThan(3);
      expect(foods.join(" | ")).toMatch(/lentils/i);
    }
  });

  it("gives an omnivore the unrestricted list", () => {
    const foods = foodsForDiet(MARKER_EXPLANATIONS["Ferritin"], "omnivore").join(" | ");
    expect(foods).toMatch(/red meat/i);
    expect(foods).toMatch(/sardines/i);
    expect(foods).toMatch(/eggs/i);
  });
});

describe("AI prompts carry the exclusions explicitly", () => {
  it("names every excluded food per pattern", () => {
    for (const diet of ["vegan", "vegetarian", "pescatarian"] as const) {
      const block = dietConstraintBlock(diet);
      for (const food of DIET_EXCLUSIONS[diet]) {
        expect(block).toContain(food);
      }
      expect(block).toMatch(/HARD CONSTRAINT/);
      expect(block).toMatch(/SUBSTITUTE, DO NOT SUBTRACT/);
    }
  });

  it("suppresses animal foods for Other until the member says what they avoid", () => {
    expect(dietConstraintBlock("other")).toMatch(/all animal-derived foods/i);
    const told = dietConstraintBlock("other", "no pork, no dairy");
    expect(told).toContain("no pork, no dairy");
  });

  it("places no restriction on an omnivore", () => {
    expect(dietConstraintBlock("omnivore")).toMatch(/No foods are excluded/);
  });
});
