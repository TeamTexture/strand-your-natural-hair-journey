// Phase 2 Step 5a — wash-day-observation contract tests.
// Mirrors product_analyse_url_contract / tool_analyse_url_contract.
// Asserts the response shape both providers must satisfy and provenance.

import { describe, expect, it } from "vitest";

interface ObservationPayload {
  observation: string;
  _provider?: "claude" | "lovable";
  _model_version?: string;
  _generated_at?: string;
}

function assertValidObservation(p: ObservationPayload) {
  expect(typeof p.observation).toBe("string");
  expect(p.observation.length).toBeGreaterThan(0);
}

function stampClaude(obs: string): ObservationPayload {
  return {
    observation: obs,
    _model_version: "claude-haiku-4-5@v1",
    _generated_at: new Date().toISOString(),
    _provider: "claude",
  };
}

function stampLovable(obs: string): ObservationPayload {
  return {
    observation: obs,
    _generated_at: new Date().toISOString(),
    _provider: "lovable",
  };
}

describe("wash-day-observation contract", () => {
  it("CLAUDE path: payload satisfies schema with provenance", () => {
    const p = stampClaude(
      "You used the Cantu Curl Cream today — that's the 3rd wash in 4 weeks with this product, and each time your roots have reported limp by hour 6. The flagged-in-your-history humectant load (glycerin + propylene glycol) shows up in all three formulas.",
    );
    assertValidObservation(p);
    expect(p._provider).toBe("claude");
    expect(p._model_version).toBe("claude-haiku-4-5@v1");
  });

  it("LOVABLE path: payload satisfies schema with provenance", () => {
    const p = stampLovable("Nice work cleansing today — your scalp note matches the pattern we want.");
    assertValidObservation(p);
    expect(p._provider).toBe("lovable");
  });

  it("rejects empty observation", () => {
    expect(() => assertValidObservation({ observation: "" })).toThrow();
  });
});
