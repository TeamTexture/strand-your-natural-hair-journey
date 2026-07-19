// Phase 2 Step 3 — product-analyse contract tests.
//
// Mirrors the shape-only approach in ingredient_analysis_contract.test.ts:
// the actual edge function runs in Deno against live LLMs and isn't unit-
// testable in jsdom. These tests assert the SCHEMA contract that BOTH
// provider paths (Claude vision+web_search and Lovable+Gemini vision-only)
// must satisfy, plus the provenance shape the function stamps onto the
// cached payload (audit §5 Step 3).
//
// Three scenarios per audit verification:
//   1. Schema-shape — every required field present, ingredients[] is array,
//      key_ingredients[].flag in enum, match_score 0-100
//   2. Web-search-invoked — Claude returned server_tool_use; cached payload
//      stamps _used_web_search: true
//   3. No-web-search — Claude returned return_product_analysis directly;
//      cached payload stamps _used_web_search: false

import { describe, expect, it } from "vitest";

// ─── Schema mirror ─────────────────────────────────────────────────────
// Mirrors RETURN_PRODUCT_ANALYSIS_SCHEMA in supabase/functions/_shared/schemas.ts.
// Kept as a local type to avoid importing Deno code into jsdom tests.
interface KeyIngredient {
  name: string;
  benefit: string;
  flag: "good" | "warn" | "avoid";
  reason: string;
}
interface ProductAnalysisPayload {
  product_name: string;
  brand: string;
  category:
    | "shampoo"
    | "conditioner"
    | "treatment"
    | "styler"
    | "oil"
    | "mask"
    | "leave-in"
    | "other";
  ingredients: string[];
  key_ingredients: KeyIngredient[];
  match_score: number;
  ai_summary: string;
  usage_instructions: string;
  use_cases: string[];
  tips: string[];
  _model_version?: string;
  _generated_at?: string;
  _provider?: "claude" | "lovable";
  _used_web_search?: boolean;
  _web_search_count?: number;
}

const VALID_CATEGORIES = new Set([
  "shampoo",
  "conditioner",
  "treatment",
  "styler",
  "oil",
  "mask",
  "leave-in",
  "other",
]);
const VALID_FLAGS = new Set(["good", "warn", "avoid"]);

/** Single source of truth for what a valid product-analysis payload looks
 *  like, independent of provider. */
function assertValidProductAnalysis(p: ProductAnalysisPayload) {
  expect(typeof p.product_name).toBe("string");
  expect(p.product_name.length).toBeGreaterThan(0);

  expect(typeof p.brand).toBe("string");

  expect(VALID_CATEGORIES.has(p.category)).toBe(true);

  expect(Array.isArray(p.ingredients)).toBe(true);
  for (const ing of p.ingredients) expect(typeof ing).toBe("string");

  expect(Array.isArray(p.key_ingredients)).toBe(true);
  for (const ki of p.key_ingredients) {
    expect(typeof ki.name).toBe("string");
    expect(ki.name.length).toBeGreaterThan(0);
    expect(typeof ki.benefit).toBe("string");
    expect(VALID_FLAGS.has(ki.flag)).toBe(true);
    expect(typeof ki.reason).toBe("string");
  }

  expect(typeof p.match_score).toBe("number");
  expect(Number.isInteger(p.match_score)).toBe(true);
  expect(p.match_score).toBeGreaterThanOrEqual(0);
  expect(p.match_score).toBeLessThanOrEqual(100);

  expect(typeof p.ai_summary).toBe("string");
  expect(p.ai_summary.length).toBeGreaterThan(0);

  expect(typeof p.usage_instructions).toBe("string");

  expect(Array.isArray(p.use_cases)).toBe(true);
  expect(Array.isArray(p.tips)).toBe(true);
}

// ─── Mock Claude tool_use payload ──────────────────────────────────────
function mockClaudeToolInput(): ProductAnalysisPayload {
  return {
    product_name: "Scalp Rebalancing Exfoliator",
    brand: "Dr Anita Rattan",
    category: "treatment",
    ingredients: [
      "aqua",
      "salicylic acid",
      "glycerin",
      "panthenol",
      "tea tree oil",
      "menthol",
      "phenoxyethanol",
    ],
    key_ingredients: [
      {
        name: "Salicylic acid",
        benefit: "Beta-hydroxy acid; lifts dead skin and product residue from the scalp.",
        flag: "good",
        reason: "Targets your build-up while you're 4 weeks into box braids; supports your scalp goal.",
      },
      {
        name: "Tea tree oil",
        benefit: "Naturally antimicrobial; soothes itchiness on a flaky scalp.",
        flag: "warn",
        reason: "Gentle for most, but patch-test if you've reacted to essential oils before.",
      },
    ],
    match_score: 78,
    ai_summary:
      "Good fit while you're 4 weeks into box braids and trying to clear scalp build-up — the salicylic acid will lift residue without disturbing your low-porosity strands.\nRead more — How To Love Your Afro, Chapter 8: Scalp Care, p.94.",
    usage_instructions: "Apply a small amount directly to the scalp, massage gently for 1-2 minutes, then rinse thoroughly.",
    use_cases: [
      "Use weekly between braid refreshes to lift scalp residue.",
      "Pair with your monthly clarifying wash to keep build-up down.",
    ],
    tips: [
      "Section your braids and apply only to the parted scalp — avoid running it down the lengths.",
      "Follow with a moisturising leave-in to seal water back into your low-porosity strands.",
    ],
  };
}

/** Simulates the provenance stamp the edge function adds to the model's
 *  raw tool_use output before caching/returning. */
function stampProvenance(
  base: ProductAnalysisPayload,
  opts: { used_web_search: boolean; web_search_count?: number },
): ProductAnalysisPayload {
  const count = opts.web_search_count ?? (opts.used_web_search ? 2 : 0);
  return {
    ...base,
    _model_version: "claude-sonnet-4-6@v1",
    _generated_at: new Date().toISOString(),
    _provider: "claude",
    _used_web_search: opts.used_web_search,
    _web_search_count: count,
  };
}

describe("product-analyse contract", () => {
  it("CLAUDE path: payload satisfies the schema contract", () => {
    const stamped = stampProvenance(mockClaudeToolInput(), { used_web_search: false });
    assertValidProductAnalysis(stamped);
    expect(stamped._provider).toBe("claude");
    expect(stamped._model_version).toBe("claude-sonnet-4-6@v1");
  });

  it("LOVABLE path: payload satisfies the schema contract (no model_version, no web_search)", () => {
    const lovable: ProductAnalysisPayload = {
      ...mockClaudeToolInput(),
      _provider: "lovable",
      _generated_at: new Date().toISOString(),
    };
    assertValidProductAnalysis(lovable);
    expect(lovable._provider).toBe("lovable");
    expect(lovable._model_version).toBeUndefined();
    expect(lovable._used_web_search).toBeUndefined();
  });

  it("WEB-SEARCH-INVOKED: cached payload stamps _used_web_search: true when server_tool_use_count > 0", () => {
    // Simulates the function's behaviour after Claude returned 2
    // server_tool_use blocks (web_search) followed by the final
    // return_product_analysis tool_use.
    const server_tool_use_count = 2;
    const stamped = stampProvenance(mockClaudeToolInput(), {
      used_web_search: server_tool_use_count > 0,
    });
    assertValidProductAnalysis(stamped);
    expect(stamped._used_web_search).toBe(true);
  });

  it("NO-WEB-SEARCH: cached payload stamps _used_web_search: false + _web_search_count: 0", () => {
    const server_tool_use_count = 0;
    const stamped = stampProvenance(mockClaudeToolInput(), {
      used_web_search: server_tool_use_count > 0,
    });
    assertValidProductAnalysis(stamped);
    expect(stamped._used_web_search).toBe(false);
    expect(stamped._web_search_count).toBe(0);
  });

  it("DUAL-PHOTO REJECTION: Claude path rejects single-photo input with the user-facing 400 message", () => {
    // Mirrors the server validation in supabase/functions/product-analyse/index.ts.
    // Claude path requires { photos: { front, back } } — both required.
    const DUAL_PHOTO_REQUIRED_MESSAGE =
      "STRAND needs both the front and back of the product to give you a full analysis.";

    type ValidateResult =
      | { ok: true }
      | { ok: false; status: number; error: string };
    function validateClaudeInput(body: {
      photos?: { front?: string; back?: string };
    }): ValidateResult {
      const front = body.photos?.front;
      const back = body.photos?.back;
      if (!front || !back) {
        return { ok: false, status: 400, error: DUAL_PHOTO_REQUIRED_MESSAGE };
      }
      return { ok: true };
    }

    const missingBack = validateClaudeInput({ photos: { front: "data:image/jpeg;base64,AAA" } });
    expect(missingBack.ok).toBe(false);
    if (missingBack.ok === false) {
      expect(missingBack.status).toBe(400);
      expect(missingBack.error).toBe(DUAL_PHOTO_REQUIRED_MESSAGE);
    }

    const missingFront = validateClaudeInput({ photos: { back: "data:image/jpeg;base64,BBB" } });
    expect(missingFront.ok).toBe(false);

    const noPhotos = validateClaudeInput({});
    expect(noPhotos.ok).toBe(false);

    const both = validateClaudeInput({
      photos: {
        front: "data:image/jpeg;base64,AAA",
        back: "data:image/jpeg;base64,BBB",
      },
    });
    expect(both.ok).toBe(true);
  });

  it("rejects payloads outside the schema (defensive — proves the validator works)", () => {
    const badScore = stampProvenance(
      { ...mockClaudeToolInput(), match_score: 150 },
      { used_web_search: false },
    );
    expect(() => assertValidProductAnalysis(badScore)).toThrow();

    const badCategory = stampProvenance(
      // @ts-expect-error — deliberately invalid category
      { ...mockClaudeToolInput(), category: "serum" },
      { used_web_search: false },
    );
    expect(() => assertValidProductAnalysis(badCategory)).toThrow();

    const badFlag = stampProvenance(
      {
        ...mockClaudeToolInput(),
        key_ingredients: [
          // @ts-expect-error — deliberately invalid flag
          { name: "Aqua", benefit: "Solvent", flag: "neutral", reason: "x" },
        ],
      },
      { used_web_search: false },
    );
    expect(() => assertValidProductAnalysis(badFlag)).toThrow();
  });
});

// ─── Schema export check ───────────────────────────────────────────────
// Confirms the Deno schema file exists and exports the symbol Step 4a will
// import. Schema is read as a plain JSON-shape — we only check the
// top-level required[] for the contract Step 4a inherits.

describe("schema extraction (audit §5 Step 4a — share schema)", () => {
  it("exports RETURN_PRODUCT_ANALYSIS_SCHEMA with the expected required fields", async () => {
    const mod = await import(
      "../../supabase/functions/_shared/schemas.ts"
    );
    const schema = mod.RETURN_PRODUCT_ANALYSIS_SCHEMA as unknown as {
      type: string;
      required: readonly string[];
      properties: Record<string, unknown>;
    };
    expect(schema.type).toBe("object");
    const required = new Set(schema.required);
    for (const field of [
      "product_name",
      "brand",
      "category",
      "ingredients",
      "key_ingredients",
      "match_score",
      "ai_summary",
      "usage_instructions",
      "use_cases",
      "tips",
    ]) {
      expect(required.has(field)).toBe(true);
    }
  });
});
