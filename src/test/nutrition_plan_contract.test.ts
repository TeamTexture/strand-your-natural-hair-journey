// Phase 2 Step 6 — nutrition-plan contract tests.
// Mirrors heat_treatment_rationale_contract / wash_day_observation_contract.
// Validates the cross-provider response shape: { summary, diet[], avoid[] }
// plus provenance stamps.

import { describe, expect, it } from "vitest";

interface NutritionCard {
  emoji: string;
  name: string;
  body: string;
  severity?: "high" | "medium" | "low";
}

interface NutritionPlanPayload {
  summary: string;
  diet: NutritionCard[];
  avoid: NutritionCard[];
  _provider?: "claude" | "lovable";
  _model_version?: string;
  _generated_at?: string;
  _sig?: string;
}

function assertCard(c: NutritionCard) {
  expect(typeof c.emoji).toBe("string");
  expect(c.emoji.length).toBeGreaterThan(0);
  expect(typeof c.name).toBe("string");
  expect(c.name.length).toBeGreaterThan(0);
  expect(typeof c.body).toBe("string");
  expect(c.body.length).toBeGreaterThan(0);
  if (c.severity !== undefined) {
    expect(["high", "medium", "low"]).toContain(c.severity);
  }
}

function assertValid(p: NutritionPlanPayload) {
  expect(typeof p.summary).toBe("string");
  expect(p.summary.length).toBeGreaterThan(0);
  expect(Array.isArray(p.diet)).toBe(true);
  expect(p.diet.length).toBeGreaterThanOrEqual(6);
  expect(p.diet.length).toBeLessThanOrEqual(10);
  for (const c of p.diet) assertCard(c);
  expect(Array.isArray(p.avoid)).toBe(true);
  expect(p.avoid.length).toBeGreaterThanOrEqual(4);
  expect(p.avoid.length).toBeLessThanOrEqual(6);
  for (const c of p.avoid) assertCard(c);
}

const sampleDiet: NutritionCard[] = [
  { emoji: "🐟", name: "Mackerel", body: "Mackerel is rich in omega-3, which is why it supports follicle health for your perimenopausal stage." },
  { emoji: "🥬", name: "Callaloo", body: "Callaloo is dense in folate, so for your low ferritin reading it's a familiar place to start." },
  { emoji: "🥚", name: "Eggs", body: "Eggs deliver biotin (a B-vitamin), which means steady keratin building for length retention." },
  { emoji: "🫘", name: "Black-eyed peas", body: "Plant iron paired with peppers (vitamin C) absorbs better, useful given your anaemia history." },
  { emoji: "🍠", name: "Sweet potato", body: "Beta-carotene converts to vitamin A so your scalp's sebum stays balanced." },
  { emoji: "🍊", name: "Citrus", body: "Vitamin C aids iron uptake from your jollof base, which is why it pairs with the beans." },
];

const sampleAvoid: NutritionCard[] = [
  { emoji: "🍷", name: "Daily wine", body: "Alcohol depletes B-vitamins, which matters more given your weekly intake.", severity: "medium" },
  { emoji: "🍩", name: "Refined sugar spikes", body: "Insulin spikes worsen androgenic thinning when PCOS is in the mix.", severity: "high" },
  { emoji: "☕", name: "Coffee with meals", body: "Tannins block iron uptake, so separate it from your iron-rich plates by an hour." },
  { emoji: "🧂", name: "Ultra-processed snacks", body: "Sodium load raises water retention; with your weekly intake, steady antioxidants matter more." },
];

describe("nutrition-plan contract", () => {
  it("CLAUDE path: payload satisfies schema with provenance", () => {
    const p: NutritionPlanPayload = {
      summary: "Anchored to your low ferritin and perimenopausal stage, this plan leans on iron-rich plant + fish proteins your kitchen already knows.",
      diet: sampleDiet,
      avoid: sampleAvoid,
      _model_version: "claude-opus-4-7@v1",
      _generated_at: new Date().toISOString(),
      _provider: "claude",
      _sig: "deadbeef",
    };
    assertValid(p);
    expect(p._provider).toBe("claude");
    expect(p._model_version).toBe("claude-opus-4-7@v1");
  });

  it("LOVABLE path: payload satisfies schema with provenance", () => {
    const p: NutritionPlanPayload = {
      summary: "Your plan focuses on iron, omega-3 and B-vitamins given your flagged markers.",
      diet: sampleDiet,
      avoid: sampleAvoid,
      _generated_at: new Date().toISOString(),
      _provider: "lovable",
      _sig: "deadbeef",
    };
    assertValid(p);
    expect(p._provider).toBe("lovable");
    expect(p._model_version).toBeUndefined();
  });

  it("rejects empty summary", () => {
    expect(() =>
      assertValid({ summary: "", diet: sampleDiet, avoid: sampleAvoid }),
    ).toThrow();
  });

  it("rejects too few diet cards", () => {
    expect(() =>
      assertValid({ summary: "ok", diet: sampleDiet.slice(0, 3), avoid: sampleAvoid }),
    ).toThrow();
  });

  it("rejects too few avoid cards", () => {
    expect(() =>
      assertValid({ summary: "ok", diet: sampleDiet, avoid: sampleAvoid.slice(0, 2) }),
    ).toThrow();
  });

  it("rejects invalid severity", () => {
    const bad = { ...sampleAvoid[0], severity: "extreme" as unknown as "high" };
    expect(() =>
      assertValid({ summary: "ok", diet: sampleDiet, avoid: [bad, ...sampleAvoid.slice(1)] }),
    ).toThrow();
  });
});
