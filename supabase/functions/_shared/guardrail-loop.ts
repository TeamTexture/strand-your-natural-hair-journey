// SHARED GUARDRAIL RETRY LOOP (2026-09-01).
//
// `ingredient-analysis` has always regenerated a rejected field before serving.
// `product-analyse` (the scan path) did not: a field nulled by a guardrail simply
// vanished, which is how a freshly scanned product came back with an empty
// verdict and one lonely minus reason.
//
// This module is the single driver both paths use for that repair: generate →
// deterministically post-process → run the guardrail sanitiser → on rejection,
// re-ask with the rejected rules fed back into the prompt, up to
// MAX_REJECTION_ATTEMPTS. It owns no prompt text, no schema and no network — the
// caller supplies the three callbacks — so it is pure control flow and testable.

import {
  MAX_REJECTION_ATTEMPTS,
  buildRejectionRetryInstruction,
  makeGenerationId,
  retryReasonFromRules,
} from "./guardrail-retry.ts";
import { RETRY_TAIL_MS, type TimeBudget } from "./time-budget.ts";


export interface GuardrailAttemptInfo {
  attemptNumber: number;
  isFinalAttempt: boolean;
  /** Empty on the first attempt; the rejection feedback block afterwards. */
  retryInstruction: string;
  /** Cost-meter grouping value for this attempt, or null on attempt 1. */
  retryReason: string | null;
  generationId: string;
}

export interface GuardrailPostProcess<V> {
  /** Rules that must force a re-ask when attempts remain. */
  retryRules: string[];
  /** Field-level violations to null at the cap if they are still present. */
  violations: V[];
}

export interface GuardrailLoopInput<T, V> {
  functionName: string;
  maxAttempts?: number;
  /**
   * Wall-clock budget for the whole request. When supplied, an attempt is only
   * STARTED if the remaining budget covers the measured cost of the previous
   * attempt plus the post-loop tail; otherwise the current attempt is treated as
   * the final one and the caller's existing degrade path takes over. See
   * _shared/time-budget.ts.
   */
  budget?: TimeBudget;
  /** Milliseconds to reserve for post-loop work (default RETRY_TAIL_MS). */
  retryTailMs?: number;
  /** Called once when the budget — not the attempt cap — stopped the retries. */
  onBudgetStop?: (info: { attemptNumber: number; remainingMs: number }) => void;
  /** Produce a fresh payload for this attempt. */
  generate: (info: GuardrailAttemptInfo) => Promise<T>;
  /**
   * Deterministic checks/normalisation that run before the sanitiser. Return
   * `retryRules` to re-ask; they are fed back into the next attempt's prompt.
   */
  postProcess: (payload: T, info: GuardrailAttemptInfo) => Promise<GuardrailPostProcess<V>>;
  /**
   * The guardrail sanitiser pass (`sanitiseAndLog`). Push any rejected rules
   * through `onRejected` so the loop can re-ask.
   */
  sanitise: (
    payload: T,
    info: GuardrailAttemptInfo & { onRejected: (rules: string[]) => void },
  ) => Promise<T>;
}


export interface GuardrailLoopResult<T, V> {
  payload: T;
  attempts: number;
  generationId: string;
  /** Rules still unresolved after the last attempt (empty = clean serve). */
  unresolvedRules: string[];
  /** Violations from the final attempt, for the terminal field-null fallback. */
  violations: V[];
}

export async function runGuardrailLoop<T, V>(
  input: GuardrailLoopInput<T, V>,
): Promise<GuardrailLoopResult<T, V>> {
  const maxAttempts = input.maxAttempts ?? MAX_REJECTION_ATTEMPTS;
  const generationId = makeGenerationId();
  let retryRules: string[] | null = null;
  let payload: T | null = null;
  let violations: V[] = [];
  let attemptNumber = 1;
  const tailMs = input.retryTailMs ?? RETRY_TAIL_MS;
  // Cost of the previous attempt — the estimate for the next one. Zero on the
  // first attempt, which therefore always runs.
  let lastAttemptMs = 0;

  for (; attemptNumber <= maxAttempts; attemptNumber++) {
    const affordable = !input.budget || input.budget.canAfford(lastAttemptMs + tailMs);
    if (!affordable) {
      console.warn(JSON.stringify({
        function: input.functionName,
        event: "guardrail_budget_exhausted",
        attempt: attemptNumber,
        remaining_ms: input.budget?.remaining() ?? null,
        last_attempt_ms: lastAttemptMs,
      }));
      input.onBudgetStop?.({
        attemptNumber,
        remainingMs: input.budget?.remaining() ?? 0,
      });
    }
    const info: GuardrailAttemptInfo = {
      attemptNumber,
      // A budget stop is treated exactly like the attempt cap: this attempt is
      // sanitised and served (or degraded) rather than re-asked.
      isFinalAttempt: attemptNumber === maxAttempts || !affordable,
      retryInstruction: retryRules?.length
        ? buildRejectionRetryInstruction(retryRules, input.functionName)
        : "",
      retryReason: retryReasonFromRules(retryRules),
      generationId,
    };

    const attemptStartedAt = Date.now();
    payload = await input.generate(info);
    const post = await input.postProcess(payload, info);
    lastAttemptMs = Math.max(lastAttemptMs, Date.now() - attemptStartedAt);

    violations = post.violations;

    if (post.retryRules.length && !info.isFinalAttempt) {
      console.log(JSON.stringify({
        function: input.functionName,
        event: "guardrail_retry",
        attempt: attemptNumber,
        rules: post.retryRules.slice(0, 6),
      }));
      retryRules = [...new Set(post.retryRules)].slice(0, 6);
      continue;
    }

    const rejected: string[] = [];
    payload = await input.sanitise(payload, {
      ...info,
      onRejected: (rules) => rejected.push(...rules),
    });

    const outstanding = [...new Set([...post.retryRules, ...rejected])];
    if (outstanding.length === 0) {
      return {
        payload,
        attempts: attemptNumber,
        generationId,
        unresolvedRules: [],
        violations,
      };
    }
    if (info.isFinalAttempt) {
      return {
        payload,
        attempts: attemptNumber,
        generationId,
        unresolvedRules: outstanding,
        violations,
      };
    }
    retryRules = outstanding.slice(0, 6);
  }

  // Unreachable in practice — the loop returns from inside.
  return {
    payload: payload as T,
    attempts: attemptNumber - 1,
    generationId,
    unresolvedRules: retryRules ?? [],
    violations,
  };
}
