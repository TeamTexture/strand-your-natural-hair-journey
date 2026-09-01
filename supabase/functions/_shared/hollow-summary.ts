// NEVER-HOLLOW SUMMARY (shared, 2026-09-01).
//
// A guardrail can blank the verdict prose while the ranked reasons survive. When
// that happens the member used to read "still preparing the write-up" — or on the
// scan path, nothing at all. Lead with the strongest surviving reason instead.
//
// Extracted from ingredient-analysis so the scan path (`product-analyse`) runs
// the identical repair rather than a second copy of it.

import { sanitiseScoreReasons } from "./score-reasons.ts";

/**
 * Fill an empty/nulled summary field from the strongest surviving score reason.
 * Mutates and returns the payload. A no-op when the summary already has prose,
 * or when no reason survived either (nothing to lead with).
 */
export function backfillHollowSummary(
  payload: Record<string, unknown>,
  summaryField: "summary" | "ai_summary",
): { backfilled: boolean } {
  const current = payload[summaryField];
  if (typeof current === "string" && current.trim()) return { backfilled: false };
  const reasons = sanitiseScoreReasons(payload.score_reasons);
  const lead = reasons.find((r) => r.direction === "plus") ?? reasons[0];
  if (!lead?.reason) return { backfilled: false };
  payload[summaryField] = lead.reason;
  return { backfilled: true };
}
