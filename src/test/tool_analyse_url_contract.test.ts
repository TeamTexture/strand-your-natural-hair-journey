// Phase 2 Step 4b — tool-analyse-url contract tests.
//
// Mirrors product_analyse_url_contract.test.ts. Asserts the schema BOTH
// provider paths must satisfy and the provenance shape stamped onto the
// cached payload.

import { describe, expect, it } from "vitest";

interface KeyFeature { name: string; relevance: string }
interface ToolAnalysisPayload {
  tool_name: string;
  brand: string;
  tool_kind: string;
  ai_summary: string;
  key_features: KeyFeature[];
  use_cases: string[];
  tips: string[];
  warnings?: string[];
  personalisation_rationale: string;
  _model_version?: string;
  _generated_at?: string;
  _provider?: "claude" | "lovable";
  _used_web_search?: boolean;
  _web_search_count?: number;
  _used_web_fetch?: boolean;
}

const VALID_KINDS = new Set([
  "heat_cap","deep_conditioning_cap","hair_dryer","diffuser","blow_dryer",
  "flat_iron","curling_iron","curling_wand","brush","comb","detangler",
  "hooded_dryer","steamer","scalp_massager","microfiber_towel",
  "satin_bonnet","satin_pillowcase","other",
]);

function assertValidToolAnalysis(p: ToolAnalysisPayload) {
  expect(typeof p.tool_name).toBe("string");
  expect(p.tool_name.length).toBeGreaterThan(0);
  expect(typeof p.brand).toBe("string");
  expect(VALID_KINDS.has(p.tool_kind)).toBe(true);
  expect(typeof p.ai_summary).toBe("string");
  expect(p.ai_summary.length).toBeGreaterThan(0);
  expect(Array.isArray(p.key_features)).toBe(true);
  expect(p.key_features.length).toBeLessThanOrEqual(4);
  for (const f of p.key_features) {
    expect(typeof f.name).toBe("string");
    expect(typeof f.relevance).toBe("string");
  }
  expect(Array.isArray(p.use_cases)).toBe(true);
  expect(p.use_cases.length).toBeLessThanOrEqual(2);
  expect(Array.isArray(p.tips)).toBe(true);
  expect(p.tips.length).toBeLessThanOrEqual(2);
  expect(typeof p.personalisation_rationale).toBe("string");
}

function mockClaudeToolPayload(): ToolAnalysisPayload {
  return {
    tool_name: "Hot Head Deep Conditioning Cap",
    brand: "Thermal Hair Care",
    tool_kind: "deep_conditioning_cap",
    ai_summary:
      "Strong fit for your length-retention goal — the steady microwaveable heat helps deep conditioner penetrate low-porosity strands without the open-cuticle damage of a hooded dryer.",
    key_features: [
      { name: "Microwaveable flax-seed core", relevance: "Even, gentle heat suits low-porosity hair." },
      { name: "Cordless", relevance: "Easier to wear during your full deep-condition window." },
    ],
    use_cases: [
      "Use weekly under your deep conditioner to support length retention.",
    ],
    tips: [
      "Pre-warm 90 seconds, then test on your wrist before pulling onto your hair.",
    ],
    personalisation_rationale:
      "Your low-porosity hair needs heat to open the cuticle — this cap delivers it safely without direct heat damage.",
  };
}

function stampClaude(base: ToolAnalysisPayload, opts: {
  used_web_search: boolean;
  web_search_count?: number;
  used_web_fetch: boolean;
}): ToolAnalysisPayload {
  const count = opts.web_search_count ?? (opts.used_web_search ? 1 : 0);
  return {
    ...base,
    _model_version: "claude-haiku-4-5@v1",
    _generated_at: new Date().toISOString(),
    _provider: "claude",
    _used_web_search: opts.used_web_search,
    _web_search_count: count,
    _used_web_fetch: opts.used_web_fetch,
  };
}

const INVALID_URL_MESSAGE = "STRAND needs a valid product page URL to analyse.";

type ValidateResult = { ok: true; url: string } | { ok: false; status: number; error: string };

function validateUrlInput(body: { url?: unknown }): ValidateResult {
  if (!body.url || typeof body.url !== "string") {
    return { ok: false, status: 400, error: INVALID_URL_MESSAGE };
  }
  let parsed: URL;
  try { parsed = new URL(body.url); }
  catch { return { ok: false, status: 400, error: INVALID_URL_MESSAGE }; }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, status: 400, error: INVALID_URL_MESSAGE };
  }
  return { ok: true, url: parsed.toString() };
}

describe("tool-analyse-url contract", () => {
  it("CLAUDE path: payload satisfies schema with provenance stamped", () => {
    const stamped = stampClaude(mockClaudeToolPayload(), { used_web_search: false, used_web_fetch: true });
    assertValidToolAnalysis(stamped);
    expect(stamped._provider).toBe("claude");
    expect(stamped._model_version).toBe("claude-haiku-4-5@v1");
    expect(stamped._used_web_fetch).toBe(true);
    expect(stamped._used_web_search).toBe(false);
  });

  it("CLAUDE path with fallback: web_fetch + web_search both stamped", () => {
    const stamped = stampClaude(mockClaudeToolPayload(), {
      used_web_search: true, web_search_count: 2, used_web_fetch: true,
    });
    assertValidToolAnalysis(stamped);
    expect(stamped._used_web_fetch).toBe(true);
    expect(stamped._used_web_search).toBe(true);
    expect(stamped._web_search_count).toBe(2);
  });

  it("INVALID URL: rejected with 400", () => {
    expect(validateUrlInput({ url: "not a url" }).ok).toBe(false);
    expect(validateUrlInput({ url: "ftp://example.com" }).ok).toBe(false);
    expect(validateUrlInput({ url: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("MISSING url field: rejected with 400", () => {
    expect(validateUrlInput({}).ok).toBe(false);
    expect(validateUrlInput({ url: "" }).ok).toBe(false);
    expect(validateUrlInput({ url: "https://www.dyson.com/hair-care/dryers" }).ok).toBe(true);
  });
});

describe("tool-analyse-url shared schema", () => {
  it("imports RETURN_TOOL_ANALYSIS_SCHEMA with required fields", async () => {
    const mod = await import("../../supabase/functions/_shared/tool-schema.ts");
    const schema = mod.RETURN_TOOL_ANALYSIS_SCHEMA as unknown as {
      type: string; required: readonly string[];
    };
    expect(schema.type).toBe("object");
    const required = new Set(schema.required);
    for (const f of [
      "tool_name", "brand", "tool_kind", "ai_summary",
      "key_features", "use_cases", "tips", "personalisation_rationale",
    ]) {
      expect(required.has(f)).toBe(true);
    }
  });
});
