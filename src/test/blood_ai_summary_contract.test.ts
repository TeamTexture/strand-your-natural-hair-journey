// Phase 2 Step 7 — blood-ai-summary contract tests.
// Validates the response shape that BOTH providers (Lovable+Gemini and
// Claude Opus, in parallel mode) must satisfy. The client renderer
// (src/pages/onboarding/BloodAiSummary.tsx) reads exactly these fields.

import { describe, expect, it } from "vitest";

interface Deficiency {
  marker: string;
  value?: string;
  status: "low" | "high" | "borderline";
  hair_impact: string;
  urgency: "low" | "medium" | "high";
}
interface BloodSummaryPayload {
  deficiencies: Deficiency[];
  overall_summary: string;
  priority_actions: string[];
  _provider?: "claude" | "lovable";
  _model_version?: string;
  _generated_at?: string;
  _shadow?: boolean;
}

function assertValidSummary(p: BloodSummaryPayload) {
  expect(Array.isArray(p.deficiencies)).toBe(true);
  for (const d of p.deficiencies) {
    expect(typeof d.marker).toBe("string");
    expect(d.marker.length).toBeGreaterThan(0);
    expect(["low", "high", "borderline"]).toContain(d.status);
    expect(["low", "medium", "high"]).toContain(d.urgency);
    expect(typeof d.hair_impact).toBe("string");
    expect(d.hair_impact.length).toBeGreaterThan(0);
  }
  expect(typeof p.overall_summary).toBe("string");
  expect(p.overall_summary.length).toBeGreaterThan(0);
  expect(Array.isArray(p.priority_actions)).toBe(true);
  expect(p.priority_actions.length).toBe(3);
  for (const a of p.priority_actions) {
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
  }
}

const sampleClaude: BloodSummaryPayload = {
  deficiencies: [
    {
      marker: "Ferritin",
      value: "18 ng/mL",
      status: "low",
      urgency: "high",
      hair_impact:
        "Ferritin is your iron storage tank — the reservoir your follicles draw from to build new strands, which is why a low reading often shows up as diffuse shedding before anything else.",
    },
    {
      marker: "Vitamin D",
      value: "42 nmol/L",
      status: "low",
      urgency: "medium",
      hair_impact:
        "Vitamin D helps regulate the follicle's growth cycle, so when it sits low the cycle stalls earlier — which is why you might be noticing slower regrowth alongside the shedding.",
    },
  ],
  overall_summary:
    "Low ferritin sitting next to low vitamin D is the classic iron-and-cycle pairing — one starves new growth of raw material, the other slows the cycle that produces it. That combination is why you're likely seeing diffuse shedding rather than patchy loss.",
  priority_actions: [
    "Pair an iron-rich meal with vitamin C twice this week — sardines on toast with tomato counts.",
    "Get 15 minutes of midday daylight on bare arms when you can; supplement vitamin D otherwise.",
    "Book a recheck with your GP in 8-12 weeks — give the levers time to register.",
  ],
  _provider: "claude",
  _model_version: "claude-opus-4-7@v1",
  _generated_at: new Date().toISOString(),
};

const sampleLovable: BloodSummaryPayload = {
  ...sampleClaude,
  _provider: "lovable",
  _model_version: undefined,
};

describe("blood-ai-summary contract", () => {
  it("CLAUDE path: payload satisfies schema with provenance", () => {
    assertValidSummary(sampleClaude);
    expect(sampleClaude._provider).toBe("claude");
    expect(sampleClaude._model_version).toBe("claude-opus-4-7@v1");
  });

  it("LOVABLE path: payload satisfies schema (no model_version required)", () => {
    assertValidSummary(sampleLovable);
    expect(sampleLovable._provider).toBe("lovable");
  });

  it("PARALLEL mode: both shapes are interchangeable for the client renderer", () => {
    // The client only knows about deficiencies / overall_summary /
    // priority_actions — the provenance fields are ignored. Therefore
    // both shapes MUST be drop-in replaceable.
    for (const p of [sampleClaude, sampleLovable]) {
      assertValidSummary(p);
    }
  });

  it("rejects empty overall_summary", () => {
    expect(() =>
      assertValidSummary({ ...sampleClaude, overall_summary: "" }),
    ).toThrow();
  });

  it("rejects priority_actions of wrong length", () => {
    expect(() =>
      assertValidSummary({
        ...sampleClaude,
        priority_actions: ["only one"],
      }),
    ).toThrow();
  });

  it("rejects invalid deficiency status/urgency enums", () => {
    expect(() =>
      assertValidSummary({
        ...sampleClaude,
        deficiencies: [
          {
            marker: "Zinc",
            status: "weird" as unknown as "low",
            urgency: "high",
            hair_impact: "x",
          },
        ],
      }),
    ).toThrow();
  });
});
