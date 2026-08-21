// ── THE GRADUATED SENSITIVITY SCORE CEILING ───────────────────────────────
//
// A member must NEVER see a comfortable-looking match percentage beside a
// sensitivity warning. Once a declared hard topical exclusion ("avoid
// completely") is present in a formula, the displayed match score is capped —
// and the cap gets steeper with every additional matched sensitivity.
//
// CANONICAL CURVE (mirrored verbatim in
// supabase/functions/_shared/sensitivity-ceiling.ts — keep the two in step,
// same convention as sensitivityVocab.ts ⇄ allergen-aliases.ts):
//   0 matched → no cap
//   1 matched → 18
//   2 matched → 8
//   3+ matched → 3
//
// This is a CEILING, never a floor: a product already scoring below the cap
// keeps its (worse) score.

export const SENSITIVITY_CEILINGS = [18, 8, 3] as const;

/** Ceiling for `count` matched hard sensitivities. null = no cap. */
export function sensitivityCeiling(count: number): number | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const i = Math.min(Math.floor(count), SENSITIVITY_CEILINGS.length) - 1;
  return SENSITIVITY_CEILINGS[i];
}

/**
 * Apply the graduated ceiling to a stored score. Returns the score unchanged
 * when nothing matched or the score is absent.
 */
export function applySensitivityCeiling(
  score: number | null | undefined,
  count: number,
): number | null {
  if (score == null || !Number.isFinite(score)) return score ?? null;
  const cap = sensitivityCeiling(count);
  return cap == null ? score : Math.min(score, cap);
}
