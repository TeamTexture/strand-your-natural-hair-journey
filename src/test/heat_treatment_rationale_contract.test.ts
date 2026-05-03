// Phase 2 Step 5b — heat-treatment-rationale contract tests.
// Mirrors wash_day_observation_contract / product_analyse_url_contract.

import { describe, expect, it } from "vitest";

interface RationalePayload {
  headline: string;
  reasons: string[];
  _provider?: "claude" | "lovable";
  _model_version?: string;
  _generated_at?: string;
}

function assertValid(p: RationalePayload) {
  expect(typeof p.headline).toBe("string");
  expect(p.headline.length).toBeGreaterThan(0);
  expect(Array.isArray(p.reasons)).toBe(true);
  expect(p.reasons.length).toBeGreaterThanOrEqual(1);
  expect(p.reasons.length).toBeLessThanOrEqual(3);
  for (const r of p.reasons) expect(typeof r).toBe("string");
}

describe("heat-treatment-rationale contract", () => {
  it("CLAUDE path: payload satisfies schema with provenance", () => {
    const p: RationalePayload = {
      headline: "Heat could open your low-porosity cuticle today",
      reasons: [
        "Your low-porosity strands resist absorption — gentle heat lifts the cuticle so conditioner penetrates.",
        "You've reported limp roots in 3 of your last 5 washes, which often signals shallow product penetration.",
      ],
      _model_version: "claude-haiku-4-5@v1",
      _generated_at: new Date().toISOString(),
      _provider: "claude",
    };
    assertValid(p);
    expect(p._provider).toBe("claude");
    expect(p._model_version).toBe("claude-haiku-4-5@v1");
  });

  it("LOVABLE path: payload satisfies schema with provenance", () => {
    const p: RationalePayload = {
      headline: "Heat helps your conditioner work harder",
      reasons: [
        "Gentle heat lifts the cuticle so deep conditioner absorbs further.",
        "Useful when chasing length retention or fighting dryness.",
      ],
      _generated_at: new Date().toISOString(),
      _provider: "lovable",
    };
    assertValid(p);
    expect(p._provider).toBe("lovable");
  });

  it("rejects empty headline", () => {
    expect(() => assertValid({ headline: "", reasons: ["x"] })).toThrow();
  });

  it("rejects too many reasons", () => {
    expect(() =>
      assertValid({ headline: "h", reasons: ["a", "b", "c", "d"] }),
    ).toThrow();
  });
});
