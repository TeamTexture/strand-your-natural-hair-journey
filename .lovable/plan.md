# Ingredient analysis server errors — root cause and fix plan

## What the data says

Edge HTTP logs have almost no retention here (only the backfill cron shows), so the evidence comes from `ai_call_log`, `analysis_score_debug` and `ai_content_rejections`.

Per-generation view of `ingredient-analysis` (a generation = one member opening/scanning a product):

| Day | generations | completed | never completed | model calls per generation | model seconds per generation |
|---|---|---|---|---|---|
| 27 Aug | 16 | 16 | 0 | 2.4 | 18s |
| 28 Aug | 164 | 163 | 1 | 2.5 | 24s |
| 31 Aug | 11 | 9 | 2 | 7.5 | 84s |
| 1 Sep | 17 | 14 | 3 | 5.2 | 61s |
| 2 Sep | 43 | 16 | **27** | 4.3 | 60s |
| 3 Sep (to 10:44) | 6 | 1 | **5** | 3.2 | 57s |

Today: 153 `rejected` rows against 41 `completed` for `ingredient-analysis`. Longest observed single generation: 112s of model time, 86s of wall clock before the log went silent.

No provider errors at all: zero rows with `error_text`, zero non-200 `http_status` from either AI provider. So this is **not** a bad request, not a gateway failure, and not a crash in the debug logging.

## Root cause

A **soft failure that becomes a hard timeout**: the guardrail retry loop.

1. Every generation runs up to `MAX_REJECTION_ATTEMPTS = 3` full model passes, plus a separate `guidance_floor_retry` pass (today: 44 generations carried that extra pass), plus per-row re-validation of the verdict bullets.
2. Since 29 Aug the number of things that can reject an attempt has grown steadily — relationship integrity, mechanism specificity, hero-active omissions, ingredient name lock. Today's dominant rejection reasons are `relationship_integrity` (density/porosity ↔ moisture or oil) and name-lock ("names Lavender, which is NOT in this product's ingredient list").
3. Each attempt now costs 30–70s. Three attempts plus the extra passes exceed the edge function's wall-clock/CPU budget, so the worker is killed **mid-loop** — before the code's own graceful fallbacks (stale-serve, field-null, never-hollow summary) are ever reached. The member sees a server error or a spinner that never resolves.

There is **no time budget anywhere** in `ingredient-analysis`, `product-analyse` or `product-analyse-url` — the loop only counts attempts, never elapsed time.

## What today's changes did and did not do

- Decrypt null-masking fix, concern-fit positive cap, `MODEL_VERSION` v29: not the cause. They change scoring inputs and cache keys, not the retry loop. The v29 bump did widen exposure by invalidating cached payloads, so more views became fresh generations.
- `scoreDebug` / `logScoreDebug`: ruled out. It is fully wrapped in `try/catch`, returns early without env/user, is called with `void`, and rows are landing in `analysis_score_debug` normally.
- The real inflection is 2 Sep, tracking the growth of the validation stack (v24 → v28), not one single edit.

## Fix

1. **New `supabase/functions/_shared/time-budget.ts`** — a small deadline helper: total budget, `remaining()`, and `canAfford(estimateMs)`.
2. **`ingredient-analysis`**: start a budget at request entry (~95s). Before each retry attempt, only continue when the remaining budget covers the *measured* duration of the previous attempt plus the post-processing tail; otherwise stop retrying and fall into the existing graceful path (stale-serve under current model version → field-null → never-hollow summary), so the member gets a real, guardrail-clean answer instead of a killed worker.
3. **Same budget check on the extra passes** — the guidance-floor retry and the mechanism/hero-active re-ask only run when affordable.
4. **`product-analyse` and `product-analyse-url`**: the same budget guard on their retry loops.
5. **Observability**: write one `ai_call_log` row with `retry_reason = budget_exhausted` and a console warn when the budget stops a retry, so this degrades visibly instead of silently.
6. **Test**: `src/test/analysis_time_budget.test.ts` asserting the budget helper's arithmetic and that every analysis function's retry loop consults it.

Deploy `ingredient-analysis`, `product-analyse`, `product-analyse-url` and boot-verify each.

## Explicitly not doing

- Not weakening any guardrail, not lowering `MAX_REJECTION_ATTEMPTS` for fast generations, and not touching scoring. When there is time, the loop still retries exactly as it does today; the change only stops it starting an attempt it cannot finish.
