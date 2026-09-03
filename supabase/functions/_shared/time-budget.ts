// WALL-CLOCK BUDGET FOR ANALYSIS RETRY LOOPS (2026-09-03)
// =======================================================
// The guardrail retry loops only ever counted ATTEMPTS, never elapsed time. As
// the validation stack grew (relationship integrity, mechanism specificity,
// hero-active omissions, ingredient name lock) a rejected attempt became
// routine, and each attempt now costs 30-70s. Three attempts plus the guidance
// re-ask ran past the edge worker's wall-clock budget, so the worker was killed
// MID-LOOP — before the code's own graceful fallbacks (stale-serve, field-null,
// never-hollow summary) could run. The member saw a server error or a spinner
// that never resolved.
//
// A budget does not weaken any guardrail: when there is time, the loop retries
// exactly as before. It only refuses to START an attempt it cannot finish, and
// hands control to the existing degrade path instead.

export interface TimeBudget {
  /** Milliseconds since the budget started. */
  elapsed(): number;
  /** Milliseconds left before the budget is spent (never negative). */
  remaining(): number;
  /** Is there room for a piece of work estimated at `estimateMs`? */
  canAfford(estimateMs: number): boolean;
}

/** Total wall clock an analysis request may spend, retries included. */
export const ANALYSIS_TIME_BUDGET_MS = 95_000;

/**
 * Post-loop work that must still fit after the last model call: deterministic
 * scoring, the guardrail sanitiser, cache read/write and the response.
 */
export const RETRY_TAIL_MS = 12_000;

/** Conservative cost of the extra guidance-floor re-ask pass. */
export const GUIDANCE_PASS_MS = 20_000;

export function startTimeBudget(totalMs: number = ANALYSIS_TIME_BUDGET_MS): TimeBudget {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  const remaining = () => Math.max(0, totalMs - elapsed());
  return {
    elapsed,
    remaining,
    canAfford: (estimateMs: number) => remaining() > Math.max(0, estimateMs),
  };
}
