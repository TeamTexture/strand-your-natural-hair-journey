// ── THE GRADUATED SENSITIVITY SCORE CEILING (server mirror) ───────────────
//
// Verbatim mirror of src/lib/sensitivityCeiling.ts. The shelf card overrides
// the DISPLAYED score client-side; the analysis functions persist the same
// number, so a card and its detail page can never disagree.
//
//   1 matched → 18   2 matched → 8   3+ matched → 3

export const SENSITIVITY_CEILINGS = [18, 8, 3] as const;

/** Ceiling for `count` matched hard sensitivities. null = no cap. */
export function sensitivityCeiling(count: number): number | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const i = Math.min(Math.floor(count), SENSITIVITY_CEILINGS.length) - 1;
  return SENSITIVITY_CEILINGS[i];
}

/** Apply the graduated ceiling to a score. Never raises a score. */
export function applySensitivityCeiling(
  score: number | null | undefined,
  count: number,
): number | null {
  if (score == null || !Number.isFinite(score)) return score ?? null;
  const cap = sensitivityCeiling(count);
  return cap == null ? score : Math.min(score, cap);
}
