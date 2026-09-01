# Product scan: personalisation + speed fix (4 sequenced parts)

Confirmed sequencing: Part 1 → Part 2 → Part 3 → Part 4, each landing as a working, testable state with its own tests before the next starts.

## What I verified in the code first (so the plan matches reality, not the diagnosis snapshot)

Some of the diagnosis has already been fixed by the 30 Aug concern-fit work:

- `product-analyse` is now on `v24-mechanism-substance-2026-08-30` — the v20/v21 skew named in the diagnosis is closed.
- `areas_of_concern` and `challenges` DO now reach `enforceAnalysisFailsafes` (product-analyse/index.ts:747-750) and the fit-first prompt block already carries the "relevance is not a penalty" and "areas of concern are first-class" rules.
- `minusIsScoreWorthy` already routes relevance framing to `strand_tip` (`_shared/fit-first-score.ts:136-146`), and the zero-plus 55 cap now only fires when a genuine minus exists.
- The scan flow already streams (`ProductScanning.tsx` → `streamProductAnalyse`).

Still genuinely broken, and what this build fixes:

- `product-analyse` has **no guardrail retry loop and no hollow-summary backfill** — it nulls a field and serves. `ingredient-analysis` has both (its 3-attempt loop at index.ts:1373).
- `product-analyse` does **not** run the usage-grounding gate (`usageGroundingBlock` / `usageGroundingProblems` exist only in `ingredient-analysis`).
- Nothing triggers `ingredient-analysis` after a scan, so a freshly scanned product has no ingredient cards, no how-to-use guidance, no RAG personalisation on first view.
- Score is a single axis; relevance has no line of its own in the payload.
- Context is one flat blob: blood/supplements/hormonal data is passed on every scan whether or not the product could interact with it.
- Evidence gathering is sequential around the writer call, not overlapped.

## Part 1 — Stop the silent partial serve

1. Extract the repair machinery from `ingredient-analysis` into shared modules so both functions run identical logic (no second copy):
   - `_shared/guardrail-loop.ts` — the attempt loop already parameterised by `MAX_REJECTION_ATTEMPTS`, rejection-rule feedback into the retry prompt, and `logContentIntegrityRejections` on the final attempt only.
   - `_shared/hollow-summary.ts` — the never-empty `ai_summary` backfill.
2. Wrap the `product-analyse` generation in that loop: a field nulled by `relationship_integrity`, `content_integrity` or the substance check regenerates once (up to 3 attempts) before anything is nulled and served. `action: "rejected"` on retried attempts, `field_nulled` only at the cap.
3. Wire `usageGroundingBlock` + `usageGroundingProblems` into `product-analyse` (same directions source it already reads off the pack), so how-to-use copy on the scan path is grounded exactly as on the shelf path.
4. Auto-trigger `ingredient-analysis` for the newly scanned product once the scan payload is saved — fired from the client after the product row exists, non-blocking, with `trigger: "no_stored_analysis"` through `assertAnalysisTrigger` (no gate bypass).
5. Bump `MODEL_VERSION` on `product-analyse` so partial rows regenerate. Deploy both functions and verify boot.

Tests: a new `src/test/product_analyse_repair.test.ts` asserting the scan path uses the shared loop and the summary backfill, and that a nulled field triggers a retry rather than an immediate serve.

## Part 2 — Split the score into two axes

1. Add two new nullable fields to the analysis payload: `quality_score` (formulation quality + safety) and `relevance_note` (one plain sentence: "aimed at density and regrowth rather than your breakage focus"). `match_score` stays the field the UI reads, and is derived from the quality/safety axis only — so stars and `fit-band` phrasing follow quality, never relevance.
2. Keep `minusIsScoreWorthy` as the single gate, and extend its relevance detection so a purpose mismatch can never be score-worthy even when phrased without the current giveaway wording (e.g. "built for X, your concern is Y").
3. Guarantee at least one plus whenever the formula holds anything goal-, challenge- or concern-relevant: extend `_shared/concern-fit.ts` to synthesise a plus from the matched mechanism when the model returned none, so the zero-plus path stops producing verdicts with no positive rationale.
4. Render the relevance line as its own row under the verdict (never inside "Why it scored this high/low"), using `GlossaryRichText` per the standing verdict-card rule.

Tests: extend `relevance_axis.test.ts` and `concern_fit_proportional.test.ts` — a well-formulated product aimed at a different concern scores on quality, carries a relevance note, and holds at least one plus.

## Part 3 — Tiered personalisation data

Restructure the scan context into four tiers, in `src/lib/aiContext.ts` (additive: existing `AiContext` consumers keep working) plus a new `_shared/tiers.ts` on the server.

- **Tier 1 — deterministic, in code, before any AI call:** sensitivity/allergy match (reuse `_shared/topical-sensitivity.ts`), hard-water flag (already in `location`), and ingredient conflicts against her existing shelf. Output feeds the safety/quality axis and can auto-flag or auto-exclude with zero model latency.
- **Tier 2 — always sent:** curl pattern, porosity, density, elasticity, diameter, goal, challenges, areas_of_concern, application_area. Small, cheap, every scan.
- **Tier 3 — conditional:** blood panels, supplements, hormonal status, nutrition. A fast keyword/category pre-check (`shouldIncludeHealthTier`) decides from the product's category, claims and ingredient classes whether health data could plausibly interact (scalp treatments, growth claims, hormone-adjacent actives). Most scans skip it entirely — both the fetch and the tokens.
- **Tier 4 — guidance only, never the score:** journal entries, wash-day observations, heat-tool logs. Fetched separately, after the score renders, and used only to shape guidance tone/content.

Tests: `src/test/context_tiers.test.ts` — Tier 2 always present; Tier 3 included for a scalp/growth product and excluded for a plain conditioner; Tier 4 never reaches the scoring prompt.

## Part 4 — Latency

1. Start the evidence gather concurrently with the writer call's setup and share one evidence set between grounding and the post-generation citation verification, so the same passages are not re-gathered — this is where two of the three sequential calls in the diagnosis came from.
2. Run the two gathers in parallel with `Promise.all` rather than one after the other.
3. Keep streaming on the scan flow and move the deterministic Tier 1 result into the first streamed chunk, so safety flags appear before the model finishes.
4. Measure before/after from `ai_call_log` for a real scan and report the wall-clock numbers.

## Constraints held throughout

- All educational content stays sourced from the indexed *How to Love Your Afro* manuscript; extended only where it aligns with the book, never fabricated.
- No hair typing terminology anywhere — "Afro and textured hair", or the recorded characteristic.
- No change to RLS, pricing, or any shared table shape beyond additive nullable payload fields.
- Every edge function touched is deployed in the same part and its boot verified; each part reports deploy status.
