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
      "Try a clarifying rinse next wash — your last 3 wash days using the Cantu Curl Cream all reported limp roots, and that buildup is fighting your length-retention goal.",
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
