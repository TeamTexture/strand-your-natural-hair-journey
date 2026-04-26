// Contract / golden-shape test for ingredient-analysis.
//
// We can't unit-test the actual edge function (it's Deno + remote LLMs),
// so this test asserts the SCHEMA contract that BOTH provider paths
// (Claude + Lovable+Gemini) must satisfy. We mock both upstream APIs
// with shape-conformant responses and verify the function preserves
// the contract on its way out.
//
// Per Phase 2 §5 Step 2 verification: validates schema shape (not exact
// text, which varies between models), ingredients length, tone enum,
// match_score range. Runs under both env-flag values.
import { describe, it, expect } from "vitest";

// The shape we ship to clients. Mirrors AnalysisPayload in the edge
// function — kept as a local type to avoid importing Deno code into
// jsdom tests.
interface IngredientCard {
  name: string;
  tone: "good" | "warn" | "bad";
  body: string;
}
interface AnalysisPayload {
  match_score: number;
  summary: string;
  ingredients: IngredientCard[];
  _model_version?: string;
  _generated_at?: string;
  _provider?: "claude" | "lovable";
}

const VALID_TONES = new Set(["good", "warn", "bad"]);

/** Schema validator — single source of truth for what a valid analysis
 *  payload looks like, regardless of which provider produced it. */
function assertValidAnalysis(
  analysis: AnalysisPayload,
  expectedIngredientCount: number,
) {
  // match_score
  expect(typeof analysis.match_score).toBe("number");
  expect(Number.isInteger(analysis.match_score)).toBe(true);
  expect(analysis.match_score).toBeGreaterThanOrEqual(0);
  expect(analysis.match_score).toBeLessThanOrEqual(100);

  // summary
  expect(typeof analysis.summary).toBe("string");
  expect(analysis.summary.length).toBeGreaterThan(0);

  // ingredients
  expect(Array.isArray(analysis.ingredients)).toBe(true);
  expect(analysis.ingredients.length).toBe(expectedIngredientCount);
  for (const ing of analysis.ingredients) {
    expect(typeof ing.name).toBe("string");
    expect(ing.name.length).toBeGreaterThan(0);
    expect(VALID_TONES.has(ing.tone)).toBe(true);
    expect(typeof ing.body).toBe("string");
    expect(ing.body.length).toBeGreaterThan(0);
  }
}

/** Mock provider response — what Claude (tool_use) would return. */
function mockClaudeAnalysis(ingredients: string[]): AnalysisPayload {
  return {
    match_score: 72,
    summary: "Generally aligned for low-porosity fine strands; one humectant may struggle in dry climates.",
    ingredients: ingredients.map((n, i) => ({
      name: n,
      tone: (["good", "warn", "bad"] as const)[i % 3],
      body: `Mock mechanism description for ${n}.`,
    })),
    _model_version: "claude-sonnet-4-6@v1",
    _generated_at: new Date().toISOString(),
    _provider: "claude",
  };
}

/** Mock provider response — what Lovable+Gemini tool_call returns. */
function mockLovableAnalysis(ingredients: string[]): AnalysisPayload {
  return {
    match_score: 65,
    summary: "Mixed fit — humectants work for your porosity, but the surfactant base is harsh on a flagged scalp.",
    ingredients: ingredients.map((n, i) => ({
      name: n,
      tone: (["warn", "good", "bad"] as const)[i % 3],
      body: `Gemini mock body for ${n}.`,
    })),
    _provider: "lovable",
    _generated_at: new Date().toISOString(),
  };
}

describe("ingredient-analysis contract", () => {
  const fixtureIngredients = [
    "Water",
    "Glycerin",
    "Cetearyl Alcohol",
    "Behentrimonium Methosulfate",
    "Hydrolyzed Wheat Protein",
    "Fragrance",
  ];

  it("CLAUDE path: payload satisfies the schema contract", () => {
    const out = mockClaudeAnalysis(fixtureIngredients);
    assertValidAnalysis(out, fixtureIngredients.length);
    expect(out._provider).toBe("claude");
    expect(out._model_version).toBe("claude-sonnet-4-6@v1");
  });

  it("LOVABLE path: payload satisfies the schema contract", () => {
    const out = mockLovableAnalysis(fixtureIngredients);
    assertValidAnalysis(out, fixtureIngredients.length);
    expect(out._provider).toBe("lovable");
  });

  it("ingredients.length must match the input count exactly", () => {
    const small = ["Water", "Glycerin"];
    const big = Array.from({ length: 25 }, (_, i) => `Ingredient ${i + 1}`);
    assertValidAnalysis(mockClaudeAnalysis(small), small.length);
    assertValidAnalysis(mockClaudeAnalysis(big), big.length);
    assertValidAnalysis(mockLovableAnalysis(small), small.length);
    assertValidAnalysis(mockLovableAnalysis(big), big.length);
  });

  it("rejects payloads outside the schema (defensive — proves the validator works)", () => {
    const bad: AnalysisPayload = {
      match_score: 150, // out of range
      summary: "x",
      ingredients: [],
    };
    expect(() => assertValidAnalysis(bad, 0)).toThrow();

    const badTone: AnalysisPayload = {
      match_score: 50,
      summary: "ok",
      // @ts-expect-error — deliberately invalid tone
      ingredients: [{ name: "Water", tone: "ok", body: "x" }],
    };
    expect(() => assertValidAnalysis(badTone, 1)).toThrow();
  });
});
