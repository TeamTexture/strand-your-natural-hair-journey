/**
 * THE ONE GATE for product analysis regeneration.
 *
 * Standing guarantee (2026-08-28, permanent): opening a product page must NEVER
 * cause a fresh model call when a valid stored analysis already exists for the
 * member's current profile fingerprint. Fresh generation is reachable from
 * exactly three places:
 *
 *   1. `no_stored_analysis`   — nothing has ever been generated for this row
 *   2. `profile_changed`      — the profile snapshot hash actually differs
 *   3. `ingredients_changed`  — the stored INCI fingerprint actually differs
 *
 * plus `member_requested`, which only ever comes from a tap on "Re-analyse".
 *
 * This module is PURE (no network, no Supabase, no React) so the guarantee is
 * unit-testable: `src/test/analysis_no_reanalyse.test.ts` asserts a second page
 * load of the same product on the same profile can never return `generate`.
 * Every mount-time analysis path must route its decision through here.
 */

export const AUTO_ANALYSIS_TRIGGERS = [
  "no_stored_analysis",
  "profile_changed",
  "ingredients_changed",
] as const;

export type AutoAnalysisTrigger = (typeof AUTO_ANALYSIS_TRIGGERS)[number];
export type AnalysisTrigger = AutoAnalysisTrigger | "member_requested";

export interface AnalysisGateInput {
  /** The member's saved `user_products` row, when the product is on their shelf. */
  hasSavedRow: boolean;
  /** Count of non-empty captured INCI names held for this product. */
  capturedIngredientCount: number;
  isHomemade: boolean;
  /** `user_products.match_score` — null means nothing was ever scored. */
  storedScore: number | null;
  /** `user_products.analysis_generated_at`. */
  storedGeneratedAt: string | null;
  storedProfileHash: string | null;
  currentProfileHash: string | null;
  storedIngredientsHash: string | null;
  currentIngredientsHash: string | null;
  /** True when a payload row exists in `ai_summaries` for this product (any level). */
  storedPayloadFound: boolean;
}

export type AnalysisGateDecision =
  | { action: "use_stored"; reason: string }
  /** Render nothing and explain — never reason over a formula we do not hold. */
  | { action: "blocked"; reason: string }
  | { action: "generate"; reason: AutoAnalysisTrigger };

/**
 * Decide what opening a product page may do. The only `generate` reasons it can
 * ever return are the three auto triggers above.
 */
export function decideProductAnalysis(input: AnalysisGateInput): AnalysisGateDecision {
  // Zero captured ingredients on a commercial product: no analysis at all,
  // fresh or stored. Fabrication block, not a cache decision.
  if (!input.isHomemade && input.hasSavedRow && input.capturedIngredientCount === 0) {
    return { action: "blocked", reason: "ingredients_unreadable" };
  }

  if (!input.hasSavedRow) return { action: "generate", reason: "no_stored_analysis" };
  if (input.storedScore == null || !input.storedGeneratedAt) {
    return { action: "generate", reason: "no_stored_analysis" };
  }

  // Fingerprints only invalidate when BOTH sides are known and differ. An
  // unknown current hash is never treated as a change — that asymmetry is how
  // "re-analyses on every open" bugs got in.
  if (
    input.storedIngredientsHash &&
    input.currentIngredientsHash &&
    input.storedIngredientsHash !== input.currentIngredientsHash
  ) {
    return { action: "generate", reason: "ingredients_changed" };
  }
  if (
    input.storedProfileHash &&
    input.currentProfileHash &&
    input.storedProfileHash !== input.currentProfileHash
  ) {
    return { action: "generate", reason: "profile_changed" };
  }

  if (!input.storedPayloadFound) return { action: "generate", reason: "no_stored_analysis" };

  return { action: "use_stored", reason: "valid_stored_analysis" };
}

/**
 * Runtime tripwire. Any code path that is about to invoke an analysis function
 * calls this first; an unrecognised or absent trigger is a programming error,
 * because it means a call site bypassed the gate.
 */
export function assertAnalysisTrigger(trigger: AnalysisTrigger | undefined | null): AnalysisTrigger {
  if (
    trigger === "member_requested" ||
    (trigger && (AUTO_ANALYSIS_TRIGGERS as readonly string[]).includes(trigger))
  ) {
    return trigger as AnalysisTrigger;
  }
  throw new Error(
    `[analysisGate] refusing to analyse: trigger "${String(trigger)}" is not one of ` +
      `${AUTO_ANALYSIS_TRIGGERS.join(", ")}, member_requested. ` +
      "Mount-time analysis must go through decideProductAnalysis().",
  );
}
