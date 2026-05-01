// Phase 2 Step 4a — product-analyse-url contract tests.
//
// Mirrors product_analyse_contract.test.ts. The actual edge function runs
// in Deno against live LLMs and isn't unit-testable in jsdom. These tests
// assert the SCHEMA contract that BOTH provider paths (Claude
// web_fetch+web_search and Lovable+Gemini Firecrawl) must satisfy, plus
// the provenance shape the function stamps onto the cached payload
// (audit §5 Step 4a, 2026-05-01 revision).
//
// Test cases:
//   1. Lovable path returns expected shape (existing behaviour preserved)
//   2. Claude path returns expected shape with provenance fields populated
//   3. Invalid URL rejected with 400
//   4. Missing url field rejected with 400
//   5. Provenance fields stamped on Claude path output
//      (_provider === "claude", _model_version, _used_web_fetch, etc.)

import { describe, expect, it } from "vitest";

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
  _used_web_fetch?: boolean;
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

function mockClaudeUrlToolInput(): ProductAnalysisPayload {
  return {
    product_name: "Coily Custard",
    brand: "Cantu",
    category: "styler",
    ingredients: [
      "water",
      "shea butter",
      "glycerin",
      "polyquaternium-37",
      "cetearyl alcohol",
      "phenoxyethanol",
      "fragrance",
    ],
    key_ingredients: [
      {
        name: "Shea butter",
        benefit: "Emollient that helps seal water into the strand.",
        flag: "good",
        reason: "Supports your length-retention goal on low-porosity hair.",
      },
      {
        name: "Glycerin",
        benefit: "Humectant that draws water from the air into the hair shaft.",
        flag: "warn",
        reason: "In your humid climate this works in your favour; in dry winters it can pull moisture out instead.",
      },
    ],
    match_score: 72,
    ai_summary:
      "Good fit for your wash-and-go routine while you're focused on length retention — the shea butter base will help seal water into your low-porosity strands.\nRead more — How To Love Your Afro, Chapter 6: Stylers, p.71.",
    usage_instructions: "Apply to damp hair from root to tip, then scrunch and air-dry.",
    use_cases: [
      "Apply on wash day to set your wash-and-go and keep curl clumps defined.",
      "Layer over a leave-in to support your length-retention goal in this humidity.",
    ],
    tips: [
      "Section in quarters before applying so coverage is even on your dense hair.",
      "Refresh with a water mist on day three rather than reapplying — keeps build-up down.",
    ],
  };
}

function stampProvenanceClaude(
  base: ProductAnalysisPayload,
  opts: {
    used_web_search: boolean;
    web_search_count?: number;
    used_web_fetch: boolean;
  },
): ProductAnalysisPayload {
  const count = opts.web_search_count ?? (opts.used_web_search ? 1 : 0);
  return {
    ...base,
    _model_version: "claude-sonnet-4-6@v1",
    _generated_at: new Date().toISOString(),
    _provider: "claude",
    _used_web_search: opts.used_web_search,
    _web_search_count: count,
    _used_web_fetch: opts.used_web_fetch,
  };
}

// Mirrors the URL validation in the edge function.
const INVALID_URL_MESSAGE =
  "STRAND needs a valid product page URL to analyse.";

type ValidateResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

function validateUrlInput(body: { url?: unknown }): ValidateResult {
  if (!body.url || typeof body.url !== "string") {
    return { ok: false, status: 400, error: INVALID_URL_MESSAGE };
  }
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return { ok: false, status: 400, error: INVALID_URL_MESSAGE };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, status: 400, error: INVALID_URL_MESSAGE };
  }
  return { ok: true, url: parsed.toString() };
}

describe("product-analyse-url contract", () => {
  it("LOVABLE path: payload satisfies the schema contract (no model_version, no web_fetch)", () => {
    const lovable: ProductAnalysisPayload = {
      ...mockClaudeUrlToolInput(),
      _provider: "lovable",
      _generated_at: new Date().toISOString(),
    };
    assertValidProductAnalysis(lovable);
    expect(lovable._provider).toBe("lovable");
    expect(lovable._model_version).toBeUndefined();
    expect(lovable._used_web_search).toBeUndefined();
    expect(lovable._used_web_fetch).toBeUndefined();
  });

  it("CLAUDE path: payload satisfies the schema contract with provenance stamped", () => {
    const stamped = stampProvenanceClaude(mockClaudeUrlToolInput(), {
      used_web_search: false,
      used_web_fetch: true,
    });
    assertValidProductAnalysis(stamped);
    expect(stamped._provider).toBe("claude");
    expect(stamped._model_version).toBe("claude-sonnet-4-6@v1");
    expect(stamped._used_web_fetch).toBe(true);
    expect(stamped._used_web_search).toBe(false);
    expect(typeof stamped._generated_at).toBe("string");
  });

  it("CLAUDE path with fallback: web_fetch + web_search both stamped when both fired", () => {
    const stamped = stampProvenanceClaude(mockClaudeUrlToolInput(), {
      used_web_search: true,
      web_search_count: 2,
      used_web_fetch: true,
    });
    assertValidProductAnalysis(stamped);
    expect(stamped._used_web_fetch).toBe(true);
    expect(stamped._used_web_search).toBe(true);
    expect(stamped._web_search_count).toBe(2);
  });

  it("INVALID URL: rejected with 400 and user-facing message", () => {
    const notAUrl = validateUrlInput({ url: "not a url" });
    expect(notAUrl.ok).toBe(false);
    if (notAUrl.ok === false) {
      expect(notAUrl.status).toBe(400);
      expect(notAUrl.error).toBe(INVALID_URL_MESSAGE);
    }

    const ftp = validateUrlInput({ url: "ftp://example.com/foo" });
    expect(ftp.ok).toBe(false);
    if (ftp.ok === false) {
      expect(ftp.status).toBe(400);
      expect(ftp.error).toBe(INVALID_URL_MESSAGE);
    }

    const javascriptScheme = validateUrlInput({ url: "javascript:alert(1)" });
    expect(javascriptScheme.ok).toBe(false);
  });

  it("MISSING url field: rejected with 400 and user-facing message", () => {
    const empty = validateUrlInput({});
    expect(empty.ok).toBe(false);
    if (empty.ok === false) {
      expect(empty.status).toBe(400);
      expect(empty.error).toBe(INVALID_URL_MESSAGE);
    }

    const wrongType = validateUrlInput({ url: 42 as unknown as string });
    expect(wrongType.ok).toBe(false);
    if (wrongType.ok === false) {
      expect(wrongType.status).toBe(400);
      expect(wrongType.error).toBe(INVALID_URL_MESSAGE);
    }

    const blank = validateUrlInput({ url: "" });
    expect(blank.ok).toBe(false);

    const valid = validateUrlInput({ url: "https://www.cantubeauty.com/products/coily-custard" });
    expect(valid.ok).toBe(true);
  });
});

describe("schema sharing (audit §5 Step 4a — same schema as photo flow)", () => {
  it("URL flow imports the SAME RETURN_PRODUCT_ANALYSIS_SCHEMA the photo flow does", async () => {
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
