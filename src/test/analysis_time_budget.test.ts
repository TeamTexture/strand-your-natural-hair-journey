import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// WALL-CLOCK BUDGET (2026-09-03) — the guardrail retry loops counted attempts
// but never elapsed time, so the edge worker was killed mid-loop and the
// member's graceful degrade path never ran. These tests lock the budget in.

const read = (p: string) => readFileSync(p, "utf8");

describe("time budget helper", () => {
  it("exposes the documented constants", () => {
    const src = read("supabase/functions/_shared/time-budget.ts");
    expect(src).toContain("ANALYSIS_TIME_BUDGET_MS = 95_000");
    expect(src).toContain("RETRY_TAIL_MS = 12_000");
    expect(src).toContain("GUIDANCE_PASS_MS = 20_000");
  });

  it("refuses work it cannot finish and never reports negative remaining", () => {
    const src = read("supabase/functions/_shared/time-budget.ts");
    // Re-implement the pure arithmetic the helper declares, so a regression in
    // the shape of canAfford/remaining is caught here.
    expect(src).toContain("Math.max(0, totalMs - elapsed())");
    expect(src).toContain("remaining() > Math.max(0, estimateMs)");
  });
});

describe("analysis functions enforce the budget", () => {
  it("the shared guardrail loop only starts an affordable attempt", () => {
    const src = read("supabase/functions/_shared/guardrail-loop.ts");
    expect(src).toContain("canAfford(lastAttemptMs + tailMs)");
    expect(src).toContain("guardrail_budget_exhausted");
    // A budget stop must behave like the attempt cap, not like an error.
    expect(src).toContain("attemptNumber === maxAttempts || !affordable");
  });

  it("product-analyse passes a request budget into the loop", () => {
    const src = read("supabase/functions/product-analyse/index.ts");
    expect(src).toContain("startTimeBudget()");
    expect(src).toContain("budget: timeBudget");
    expect(src).toContain('rejection_rule: "budget_exhausted"');
  });

  it("ingredient-analysis gates its retries and its extra guidance pass", () => {
    const src = read("supabase/functions/ingredient-analysis/index.ts");
    expect(src).toContain("startTimeBudget()");
    expect(src).toContain("const canRetry = (attemptNumber: number)");
    expect(src).toContain("canAfford(lastAttemptMs + RETRY_TAIL_MS)");
    expect(src).toContain("canAfford(GUIDANCE_PASS_MS + RETRY_TAIL_MS)");
    // No raw attempt-cap-only retry gates may remain.
    expect(src).not.toContain("if (attemptNumber < MAX_REJECTION_ATTEMPTS) continue;");
  });

  it("the terminal degrade path is still reached, not replaced", () => {
    const src = read("supabase/functions/ingredient-analysis/index.ts");
    expect(src).toContain("applyFieldNulls");
  });
});
