import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  decideProductAnalysis,
  assertAnalysisTrigger,
  AUTO_ANALYSIS_TRIGGERS,
  type AnalysisGateInput,
} from "@/lib/analysisGate";

/**
 * REGRESSION GUARD — "never re-analyse if an analysis exists".
 *
 * A member reported the same bug four times in one day: opening a product page
 * re-ran the model and the score moved (72 -> 80 -> 88 -> 92). Every previous
 * fix was a different cause (guidance-level cache mismatch, shelf still
 * loading, unstamped provenance). These tests assert the INVARIANT instead of
 * any one cause: on a second open of the same product with an unchanged
 * profile, the gate must never return `generate`.
 */

/** A product that already has a valid stored analysis for the current profile. */
const stored: AnalysisGateInput = {
  hasSavedRow: true,
  capturedIngredientCount: 12,
  isHomemade: false,
  storedScore: 88,
  storedGeneratedAt: "2026-08-29T10:00:00.000Z",
  storedProfileHash: "hash-profile-a",
  currentProfileHash: "hash-profile-a",
  storedIngredientsHash: "hash-inci-a",
  currentIngredientsHash: "hash-inci-a",
  storedPayloadFound: true,
};

describe("analysis gate — a second page load never spends a call", () => {
  it("serves the stored analysis on repeat opens", () => {
    for (let open = 0; open < 5; open += 1) {
      expect(decideProductAnalysis(stored).action).toBe("use_stored");
    }
  });

  it("never generates when a stored analysis exists and nothing changed", () => {
    // Vary every field that is NOT part of the fingerprint contract. None of
    // these may flip the decision — this is what caught the guidance-level bug.
    const irrelevant: Partial<AnalysisGateInput>[] = [
      { storedScore: 0 },
      { storedScore: 100 },
      { capturedIngredientCount: 1 },
      { storedGeneratedAt: "2024-01-01T00:00:00.000Z" },
      { isHomemade: true },
    ];
    for (const patch of irrelevant) {
      expect(decideProductAnalysis({ ...stored, ...patch }).action).toBe("use_stored");
    }
  });

  it("does not treat an unknown current fingerprint as a change", () => {
    expect(
      decideProductAnalysis({ ...stored, currentProfileHash: null, currentIngredientsHash: null })
        .action,
    ).toBe("use_stored");
  });

  it("generates only for no-analysis or a real fingerprint change", () => {
    expect(decideProductAnalysis({ ...stored, storedScore: null })).toEqual({
      action: "generate",
      reason: "no_stored_analysis",
    });
    expect(decideProductAnalysis({ ...stored, storedGeneratedAt: null })).toEqual({
      action: "generate",
      reason: "no_stored_analysis",
    });
    expect(decideProductAnalysis({ ...stored, storedPayloadFound: false })).toEqual({
      action: "generate",
      reason: "no_stored_analysis",
    });
    expect(decideProductAnalysis({ ...stored, currentProfileHash: "hash-profile-b" })).toEqual({
      action: "generate",
      reason: "profile_changed",
    });
    expect(decideProductAnalysis({ ...stored, currentIngredientsHash: "hash-inci-b" })).toEqual({
      action: "generate",
      reason: "ingredients_changed",
    });
  });

  it("blocks any analysis for a commercial product with no captured ingredients", () => {
    expect(
      decideProductAnalysis({ ...stored, capturedIngredientCount: 0 }).action,
    ).toBe("blocked");
  });

  it("exposes exactly three automatic triggers", () => {
    expect([...AUTO_ANALYSIS_TRIGGERS]).toEqual([
      "no_stored_analysis",
      "profile_changed",
      "ingredients_changed",
    ]);
  });

  it("refuses an analysis call with no recognised trigger", () => {
    expect(() => assertAnalysisTrigger(undefined)).toThrow(/refusing to analyse/);
    expect(() => assertAnalysisTrigger("page_mounted" as never)).toThrow(/refusing to analyse/);
    expect(assertAnalysisTrigger("member_requested")).toBe("member_requested");
  });
});

describe("analysis gate — no call site bypasses it", () => {
  const surfaces = ["src/pages/IngredientDetail.tsx", "src/pages/ProductProfile.tsx"];

  it("routes every product-analysis surface through the gate", () => {
    for (const file of surfaces) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must decide via the gate`).toContain("decideProductAnalysis");
      expect(src, `${file} must assert its trigger`).toContain("assertAnalysisTrigger");
      // Every ingredient-analysis invocation must carry a trigger in its body.
      const calls = src.split('aiInvoke<').slice(1).filter((c) => c.includes('"ingredient-analysis"'));
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.slice(0, 2000), `${file} invoke must pass a trigger`).toMatch(/trigger[,:]/);
      }
      // The old blunt kill switch must not come back — it also suppressed the
      // two legitimate generation cases.
      expect(src, `${file} must not reintroduce DEMO_SAFE_MODE`).not.toContain("DEMO_SAFE_MODE");
    }
  });
});
