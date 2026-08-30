# Product analysis regression — diagnosis

Diagnosis for the K18 Future IQ scan on the new test account. Live evidence from `ai_call_log`, `ai_content_rejections`, `user_products`, `user_hair_profile`, plus the code and git history of the analysis path. No code was changed this turn.

## The actual row that was produced

The scanned product (`user_products` row created 20:45:02 UTC today, account `71cf58ea…`) holds:

- `match_score: 52`, `rating: null`
- `score_reasons`: **exactly one row**, direction `minus`: *"Formula targets aging, graying, shedding — the product's mechanism targets premature hair aging and pigmentation signals — not the breakage and length retention challenge you are actively working on."*
- `ai_summary`: **empty string**
- `analysis_profile_snapshot_hash: e9ba3330:tl3`, `ingredients_source: scan`, `application_area: scalp`

So: no plus reasons, no verdict prose, one relevance-mismatch minus. That single row is the whole regression in miniature.

## A. What changed, and when

The analysis path was rewritten across ~150 automated commits on 26–29 Aug. `MODEL_VERSION` was bumped ten times in `ingredient-analysis` (v14 → v21) and three times in `product-analyse` (v6 → v15 → v20).

The scoring rubric change is the material one. Before (up to 28 Aug 12:56):

```
- reason is ≤18 words and MUST name the user characteristic, goal or flagged marker it
  interacts with … A reason that could be written for any user is INVALID; rewrite it or drop the item.
- Order the strongest driver first. Include at least one minus unless this formula genuinely has
  no downside for this user, and at least one plus unless nothing in it helps them.
```

After (`659ab048`, 28 Aug 15:02, current):

```
- reason is ≤28 words and MUST do BOTH: state the MECHANISM … AND name the user
  characteristic, goal or flagged marker it lands on …
- RANKED: the rows are displayed as a numbered ranking, strongest driver first. Row 1 must be
  the single biggest reason the score is what it is.
```

Plus a new shared block (`_shared/analysis-failsafes.ts`, 28 Aug 12:56) that adds the closed vocabulary check, the nullability rule ("return null — that is the correct and preferred answer"), and the fit-band language rule. And `_shared/fit-first-score.ts`, whose deterministic pass rewrites the model's score.

**Version skew found:** `ingredient-analysis` is on `v21-usage-grounding-2026-08-29`; `product-analyse` was never bumped past `v20-ranked-verdict-2026-08-29` and never had the usage-grounding gate wired in. The last matched pair is `659ab048`.

## B. Why it is slow — measured

From `ai_call_log` for that account, in order:

| time | function | model | duration |
|---|---|---|---|
| 20:45:01 | `product-analyse` (stage 2) | claude-sonnet-4-6 | **54.3 s** |
| 20:45:20 | `evidence-gather` (stage 1) | gemini-3.6-flash | 15.4 s |
| 20:45:39 | `evidence-gather` (stage 1) | gemini-3.6-flash | 15.6 s |

~85 s wall clock, and the three calls are **sequential, not parallel** — the two evidence-gather calls fire *after* the analysis completes, one after the other. The 54 s analysis call is a single Claude call with Anthropic server-side `web_search` (`max_uses: 2`) plus manuscript RAG at `rag_k: 4`, `max_tokens: 4096`. There is no timeout and no network retry beyond a single 529 retry, so this is not a timeout/retry loop — it is genuinely one long call followed by two more.

## C. Why sections are missing

Two separate causes, both confirmed:

1. **`ingredient-analysis` never ran for this product.** There is no `ingredient-analysis` row in `ai_call_log` for this account at all, and no `ai_summaries` row. That function is what produces the ingredient cards, the how-to-use / personalised guidance, and the never-hollow summary backfill. The scan path (`product-analyse`) alone produced score + reasons, and nothing filled the rest in.
2. **The prose that was produced got nulled by the guardrail.** `ai_content_rejections` at 20:45:01 logs one `field_nulled` on `use_cases[0]` from the `relationship_integrity` check, against the rule that a topical serum cannot be described as stimulating growth or reaching the follicle. The offending sentence was the product's own core how-to-use text. Nothing regenerated it — `product-analyse` has no retry loop, it nulls and serves. `ai_summary` came back empty and stayed empty for the same reason: the never-hollow-summary backfill lives in `ingredient-analysis`, which did not run.

So it is not truncation and not a frontend rendering bug — it is a silent degrade to a partial payload.

## D. Why the new account differs

Not profile emptiness. The account is fully populated: curl pattern Coily (Afro-textured), porosity High, density High, elasticity Strong, diameter Medium, length TWA, `areas_of_concern: ["Edges / hairline"]`, goal Length, challenge Breakage.

The real difference is **path, not data**:

- New account → product freshly scanned → served entirely by `product-analyse`, which has no retry loop, no usage-grounding gate, no summary backfill, and is a version behind.
- paige.lewin's shelf → products already analysed → served by `ingredient-analysis` (v21) with its 3-attempt guardrail retry, guidance-only retry, and hollow-summary backfill.

Established shelves look good because the *other* function repairs what the guardrail nulls. The scan path has none of that repair machinery.

Symptom 2 (shelf products appearing to populate mid-load) is consistent with the shelf list rendering from cache while the new row's analysis is still in flight — not yet confirmed, and worth a browser reproduction rather than a guess.

## E. The scoring model, and how the axes are entangled

`match_score` is one number, 0–100. `_shared/fit-band.ts` derives everything the member sees from it: `stars = round((score/20)*2)/2`, and the band phrases 90+ "a strong fit", 70–89 "a good fit", 50–69 "a mixed fit", 30–49 "not an ideal fit", <30 "a poor fit". 52 → 2.5 stars → "mixed fit" / use with care. That part is arithmetic and behaved correctly.

The problem is what feeds the number. The rubric in `_shared/fit-first-score.ts` states verbatim:

```
The score answers ONE question: how well does this product serve THIS member's stated goal
and challenge?
ONLY TWO THINGS MAY LOWER THE SCORE: 1. a genuine CONFLICT — an ingredient or property that
works against her stated goal, challenge or recorded profile … or 2. a genuine HARM risk …
```

Two structural consequences:

1. **Relevance and quality/safety are the same axis.** There is no separate safety score and no separate relevance score anywhere in the schema. A product that is well formulated and simply aimed at a different concern lands in exactly the same numeric territory as one that is a poor formulation. That is what happened here.
2. **"Does not target her stated challenge" was accepted as a conflict.** `minusIsScoreWorthy` only requires a mechanism marker plus a named profile signal; "targets aging/graying rather than your breakage concern" satisfies both, so it counted against the score instead of being moved to non-scoring `strand_tip` commentary. And because zero plus reasons survived, `alignScoreWithReasons` capped the score at 55 — the model's 52 stood.

Compounding it: her `areas_of_concern: ["Edges / hairline"]` is the field that makes density and regrowth work directly relevant, and there is no evidence it reached the scoring prompt as a goal signal. The model reasoned only against the coarse `challenges: ["Breakage"]` / goal `Length`.

## Proposed fix — options

### Option 1 — revert the scan path prompt to last known good (fastest, lowest risk)
Pin `product-analyse` back to the `659ab048` (v20) rubric state and bump its `MODEL_VERSION` so poisoned rows regenerate. Honest assessment: this **will not fix the reported symptoms**. The single-axis score, the relevance-as-conflict classification and the missing repair machinery all predate v20. Reverting buys nothing here, and I would not recommend it as the immediate move.

### Option 2 — stop the silent partial serve (recommended first, small and contained)
1. Give `product-analyse` the repair machinery `ingredient-analysis` already has: the guardrail retry loop and the never-hollow-summary backfill, so a nulled field regenerates once instead of vanishing.
2. After a scan, trigger `ingredient-analysis` for the new product so the ingredient cards and how-to-use guidance exist on first view, instead of only appearing on established shelves.
3. Wire the usage-grounding gate into `product-analyse` and close the v20/v21 skew.

### Option 3 — separate the two axes (the real fix for the score)
1. Score formulation quality/safety and goal-relevance separately, and derive stars and the band from quality/safety. Show relevance as its own line ("aimed at density and regrowth rather than your breakage focus") rather than as a deduction.
2. Tighten `minusIsScoreWorthy` so "targets a different concern" is never score-worthy — it belongs in `strand_tip`, which is exactly what that field exists for.
3. Pass `areas_of_concern` into the scoring context so edges/hairline is a first-class goal signal, and treat density/regrowth relevance to edges as a plus.
4. Guarantee at least one plus reason whenever the formula contains anything goal-relevant, so the zero-plus cap of 55 stops firing on well-formulated products.

### Option 4 — the latency work (separate, can follow)
Fire the two `evidence-gather` calls in parallel with each other and overlap them with the analysis call rather than chaining after it; that alone removes ~30 s of the ~85 s. Streaming first content is already supported on this path and should be enabled for the scan flow.

Content constraints for whatever is built: all educational content stays sourced from the indexed *How to Love Your Afro* manuscript and is only extended where it aligns with the book, never fabricated; no hair typing terminology (no 3C/4C/type 4) — "Afro and textured hair" throughout.

## Recommendation

Option 2 then Option 3, in that order. Option 2 restores the missing sections within hours and is additive. Option 3 fixes the wrong-in-kind score and is the change that stops well-formulated products being marked "use with care" for being aimed at a different concern. Option 1 is not worth doing. Option 4 after both.
