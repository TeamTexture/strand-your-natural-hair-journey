// Part 3 — tiered personalisation data.
//
// The point of the tiers is that the SCORING prompt only ever sees data that
// can actually move the answer: strand characteristics, goal, challenges and
// areas of concern always; health data only when the formula could plausibly
// interact with it; behavioural history never. These tests hold that line —
// they are the reason a shampoo scan no longer ships her full blood panel.
import { describe, expect, it } from "vitest";
import {
  compactHealthTier,
  runTier1,
  shouldIncludeHealthTier,
  tier1Block,
  tierContext,
  tierRulesBlock,
  waterHardnessFor,
} from "../../supabase/functions/_shared/tiers.ts";

describe("Tier 3 health gate", () => {
  it("omits health data for a plain conditioner", () => {
    const d = shouldIncludeHealthTier({
      productName: "Moisture Conditioner",
      category: "Conditioner",
      ingredients: ["Aqua", "Cetearyl alcohol", "Behentrimonium chloride", "Glycerin"],
    });
    expect(d.mode).toBe("omitted");
    expect(d.reason).toBe("no_plausible_interaction");
  });

  it("includes the full tier for a scalp/growth product", () => {
    const d = shouldIncludeHealthTier({
      productName: "Scalp Density Serum",
      claims: "supports thicker, fuller hair",
      ingredients: ["Aqua", "Caffeine", "Rosemary leaf oil"],
    });
    expect(d.mode).toBe("full");
    expect(d.reason).toBe("product_signals_match");
  });

  it("falls back to compact — never omitted — when the product is unknown", () => {
    // The photo scan reads the pack inside the model call, so at request time
    // we genuinely know nothing. Withholding here would be the wrong default.
    const d = shouldIncludeHealthTier({});
    expect(d.mode).toBe("compact");
    expect(d.reason).toBe("signals_unknown");
  });
});

describe("compact health tier", () => {
  const context = {
    healthProfile: { lifeStage: "postpartum", conditions: ["PCOS"], diet: "omnivore" },
    bloodResults: [
      { marker: "Ferritin", value: 14, status: "low" },
      { marker: "Vitamin D", value: 80, status: "normal" },
      { marker: "Cholesterol", value: 6.1, status: "high" },
    ],
    supplements: [{ name: "Iron bisglycinate", dose: "20mg" }],
  };

  it("keeps only hair-relevant markers that are out of range", () => {
    const out = compactHealthTier(context) as Record<string, unknown>;
    const markers = (out.bloodResults as Array<{ marker: string }>).map((r) => r.marker);
    expect(markers).toEqual(["Ferritin"]);
  });

  it("keeps conditions and life stage, and reduces supplements to names", () => {
    const out = compactHealthTier(context) as Record<string, unknown>;
    expect((out.healthProfile as Record<string, unknown>).lifeStage).toBe("postpartum");
    expect(out.supplements).toEqual(["Iron bisglycinate"]);
  });
});

describe("Tier 4 never reaches the scoring prompt", () => {
  it("moves behavioural history out of the scoring context", () => {
    const t = tierContext({
      hairProfile: { porosity: "high" },
      goals: [{ title: "Length retention" }],
      challenges: ["Breakage"],
      history: { recentWashDays: [{ date: "2026-08-30" }] },
      bloodResults: [{ marker: "Ferritin", status: "low" }],
    }, { productName: "Curl Cream", category: "Styler" });

    expect(t.context.history).toBeUndefined();
    expect(t.guidance.history).toBeDefined();
    // Tier 2 always survives.
    expect(t.context.hairProfile).toBeDefined();
    expect(t.context.challenges).toBeDefined();
    // Tier 3 withheld for a styler with no health-relevant signal.
    expect(t.context.bloodResults).toBeUndefined();
    expect(t.withheld).toContain("history");
  });

  it("tells the model absent data is not a finding", () => {
    const block = tierRulesBlock({
      context: {},
      guidance: {},
      health: { mode: "omitted", reason: "no_plausible_interaction" },
      included: [],
      withheld: ["history"],
    });
    expect(block).toMatch(/Absent data is never a finding/i);
    expect(block).toMatch(/deliberately NOT included/i);
  });
});

describe("Tier 1 deterministic answers", () => {
  it("resolves water hardness from a postcode without a model call", () => {
    expect(waterHardnessFor("SW1A 1AA")).toBe("very-hard");
    expect(waterHardnessFor("")).toBeNull();
  });

  it("frames shelf overlap as neutral ownership, never a risk", () => {
    const t = runTier1({
      profile: { postcode: "M1 1AE" },
      shelf: [
        { name: "Curl Cream", brand: "A", category: "Styler", ingredients: ["Aqua", "Glycerin", "Shea butter"] },
        { name: "Leave-in", brand: "B", category: "Leave-in", ingredients: ["Aqua", "Glycerin", "Shea butter"] },
        { name: "Milk", brand: "C", category: "Leave-in", ingredients: ["Aqua", "Glycerin", "Shea butter"] },
      ],
    }, { category: "Leave-in" });
    const block = tier1Block(t);
    if (t.shelfOverlap.length > 0) {
      expect(block).toMatch(/NEUTRAL ownership count/i);
      expect(block).toMatch(/never a reason to score lower/i);
    }
    expect(block).toMatch(/not a fault of this product/i);
  });
});
