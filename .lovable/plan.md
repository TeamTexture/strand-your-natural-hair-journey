# Streaming the two slow analyses — findings first, then the build

Parts 2 and 3 are answered below from `ai_call_log`, `tip_generation_rejections` and the code. Nothing has been changed yet. Part 1 has one hard architectural constraint that changes the shape of the answer, so it needs a decision from you before I build.

## Part 2 — what `unflushed` actually is

**It is a metering bug, not a member abandoning a wait, and not a timeout.**

`_shared/ai-meter.ts` buffers every stage-2 row in a `Map` keyed **only by function name**, so one function can hold exactly one pending row. When a second stage-2 call for the same function starts before the first has been flushed by the guardrails, the first is force-flushed with `outcome: 'unflushed'`.

`nutrition-plan` fires **three concurrent Claude calls** (`runClaudeSplit` — supplements, diet, avoid). Two of the three always collide on that single map slot. That is exactly what the numbers say:

| | rows | model_called | avg output tokens | avg duration |
|---|---|---|---|---|
| completed | 49 | 27 | 2,845 | 61.8s |
| unflushed | 51 | 51 | 1,528 | 34.0s |

51 unflushed ≈ 2 per generation, at one-part output size (1,528 vs 2,845) and one-part duration (34s vs 62s). Same cause for `wash-day-steps` (8), `ingredient-explainer` (17), `ingredient-analysis` (4), `goal-tip` (2).

Consequence: **`nutrition-plan` cost per plan is understated in reporting and the completed-row duration is the slowest of three parts, not the plan's total.** No member impact.

Fix (small and safe, observation-only): key the pending buffer by a unique call id and let `recordAiOutcome` attach the outcome to **all** rows pending for that function. `unflushed` then means what it was meant to mean — a call that genuinely died before the guardrails ran.

## Part 3 — what each rejection rule checks

First, an important correction to the premise: **a `rejected` row does not mean the output was thrown away.** In `citation-log.ts`, `rejected` is recorded when *any sentence was stripped* or an omission was logged. The member still receives the full analysis minus the offending sentence. The one exception is `hollow_after_guardrail`.

| rule | what it checks | why it fires | verdict |
|---|---|---|---|
| `clarification-cleanse-area-focus` (product-analyse 6, ingredient-analysis 9) | Sentence must not reverse the two-cleanse order (first cleanse = scalp with a cleansing shampoo, second = hair with a moisturising shampoo) | The regex is order-blind inside a long sentence. Real stripped text: *"…massage into soaking-wet hair as your second moisturising cleanse **after washing your scalp**"* — correct sequence, flagged because "scalp" sits within 50 chars of "cleanse". Same for the product-analyse sample, where "first" belongs to the scalp step but a "lengths" mention later in the same sentence trips `firstOnHair`. | **Rule too strict — leave it alone (your call).** The output was right. Prompt-side fix: force one cleanse step per short sentence, never scalp and lengths in one cleansing sentence. That stops the shape without touching the rule. |
| `clarification-ends-own-tip` (product-analyse 5, wash-day-tip 1) | One sentence may not carry both a scalp instruction and an ends instruction — ends protection must stand as its own tip | Genuine breach. Real text: *"apply it only to the scalp and rinse before it runs down the length — the dual-surfactant load will strip moisture from ends…"* | **Rule correct.** Prompt-side fix: never combine a scalp instruction and an ends instruction in one item; ends gets its own item with its own reason. |
| `clarification-scalp-cleanliness-why` (goal-tip 6, wash-day-tip 5, nutrition-plan 1) | Omission check (log-only, nothing removed): when the member is in a protective style and the text mentions the scalp plus clean/oil/build-up, it must name the goal *and* carry a why-connective | Over-broad on non-hair-care surfaces. The nutrition-plan hit is *"take it with … **oily fish**…"* on a member in twists. On wash-day-tip and goal-tip the hits are real omissions. | **Too strict for nutrition-plan/blood surfaces — leave the rule alone.** Prompt-side fix on wash-day-tip and goal-tip only: when in a protective style and mentioning scalp cleanliness, name the goal and use a because/so-that bridge. |
| `hollow_after_guardrail` (wash-day-tip 15 total rejections, most on this) | After the product-name wall and guardrails strip content, `action`/`reason` are empty | This is the **only** genuine full-throwaway. The member is served their last good tip, not an error. | Real, and separate from latency. Report only unless you want it in scope. |

No guardrail is weakened, loosened or bypassed in any of the above.

## Part 1 — streaming: the constraint, and what I propose

**The constraint:** neither function's output can be streamed raw to the member. Everything the model produces passes through blood guardrail → manuscript fidelity → author clarifications → sensitivity validation → score alignment *before* display, and those gates operate on the assembled payload. Streaming model tokens straight to the UI would put unguarded hair-care claims in front of a member. That is not negotiable, so "stream the model to the screen" is off the table. What *can* stream is **guardrail-validated units, emitted as each one clears.**

### nutrition-plan — SSE, four parts instead of three

- Add a fourth tiny concurrent call for `summary` only (~120 output tokens), splitting it off the supplements call. Same model, same prompt, same rules.
- Convert the function to an SSE response. Each part runs its own guardrail pass and is emitted the moment it clears: `summary` → `supplements` → `diet` → `avoid` (whichever order they land).
- The page already renders the deterministic food-first scaffold at ~0s, so the member is reading immediately; the first AI block lands at ~4-6s (summary), remaining blocks 30-40s.
- Cache write unchanged: the assembled plan is persisted only after all four parts clear, so a dropped stream never leaves a half-saved record.
- Dropped stream: the client keeps whatever parts arrived, shows them, and offers a retry that re-requests only the missing parts.

Honest expectation: **first AI content ~4-6s (from ~62s), full plan ~35-45s.** Not 1-2s — the summary call itself cannot return faster than ~3s. If you want a true 1-2s first paint I can render the deterministic scaffold plus a per-part skeleton, which is what makes the page feel instant.

### product-analyse — SSE, transcription first, guarded prose second

- Enable Anthropic streaming in `_shared/anthropic-client.ts` (`stream: true`, accumulate `input_json_delta`), keeping the existing non-streaming `callClaude` for every other caller.
- Reorder the tool schema so the **transcription** fields come first: `product_name`, `brand`, `category`, `ingredients`, `usage_instructions`. These are verbatim reads off the photos, need no claim guardrail, and can be emitted as soon as they close — roughly **8-12s**, replacing a 52s blank spinner with the product identified and its INCI list on screen.
- The guarded fields (`ai_summary`, `key_ingredients`, `match_score`, `use_cases`, `tips`, `score_reasons`) are held until the single existing guardrail pass completes, then emitted as one block at ~52s. Splitting the guardrail pass per field would multiply the stage-1 verifier calls, which would make it slower and more expensive.
- Nothing is written to `user_products` / `ai_summaries` until the full payload has cleared, so a dropped stream cannot half-save a product.
- Dropped stream: the scanning screen keeps the identified product visible and offers retry; it never lands on a blank screen or a partial record.

Honest expectation: **first visible content ~8-12s (from ~53s), full analysis ~53s unchanged.** A 1-2s first paint here would need a second small extraction call, which adds ~30k input tokens and cost per scan — say the word and I'll add it.

### Telemetry

`ai_call_log` keeps recording `duration_ms` and token counts per call. **Time-to-first-token needs a column** (`ttft_ms`); you said not to add one, so I will log it to the function console (`[stream] ttft_ms=…`) and read it from the edge logs to report numbers. Say the word if you want the column.

## Files touched

- `supabase/functions/_shared/ai-meter.ts` — unique-key pending buffer (Part 2 fix)
- `supabase/functions/_shared/anthropic-client.ts` — add `streamClaude`, existing `callClaude` untouched
- `supabase/functions/nutrition-plan/index.ts` — four-part split + SSE
- `supabase/functions/product-analyse/index.ts` — schema field order + SSE, prompt clarifications
- `supabase/functions/ingredient-analysis/index.ts` — prompt clarification (cleanse sentence shape)
- `src/pages/NutritionPlan.tsx`, `src/pages/ProductScanning.tsx` (+ the scan hooks) — SSE consumption, per-part rendering, retry-on-drop
- Both functions deployed and boot-verified in the same task, per the deployment rule

## Decisions I need

1. Accept the guardrail constraint and the honest first-paint numbers above (4-6s / 8-12s), or add the extra fast call to product-analyse for a ~2s identify?
2. Add the `ttft_ms` column, or console-log only?
3. Leave `clarification-cleanse-area-focus` and `clarification-scalp-cleanliness-why` alone as too-strict (my recommendation), fixing only the prompts?
4. `hollow_after_guardrail` on wash-day-tip — in scope or report only?
