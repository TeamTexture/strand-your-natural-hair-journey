# Product match score disagrees between card and detail page — root cause

## What is actually happening

There are **two different AI functions producing two different match scores for the same product**, and only one of them is ever saved.

For "Absolut Repair Molecular Sulphate Free Shampoo" (your row):

- `user_products.match_score` = **62** (written at scan time, 06:31)
- `ai_summaries` row `ingredient_analysis:link-1785825098684` payload `match_score` = **88** (written 06:36, when you opened the product)

So 62 and 88 are both real stored values, produced by two separate analyses of the same product.

## Root cause — option (e), with (d) as the mechanism

Neither (a), (b) nor (c) is true. The star maths is already shared and correct (`src/lib/matchStars.ts`, `MatchStars.tsx` — score/20 rounded to nearest half; 88 → 4.5, 62 → 3, which is exactly what you saw).

The break is that the two views read two independently-generated scores:

1. **Scan writes score A.** `src/pages/ProductScanning.tsx` (and `useProductUrlScan`) take the `product-analyse` / `product-analyse-url` result, run it through `buildProductSaveFields` (`src/lib/productAnalysisSave.ts:101`) and upsert `match_score` into `user_products`. That is the 62.

2. **The card reads score A.** `src/pages/Products.tsx:296-299` renders `{p.match_score}% match`, and `MatchStars item={p}` reads the same column. Correct behaviour.

3. **The detail page ignores score A and generates score B on every visit.** `/products/profile/:id` redirects to `/products/ingredient` (`ProductProfileRedirect.tsx`), which is `src/pages/IngredientDetail.tsx`. With no fresh-scan payload in route state it calls `runAnalysis(false)` (`IngredientDetail.tsx:443-491`), which invokes the **`ingredient-analysis`** edge function — a completely separate scorer with its own prompt and its own `match_score` (`supabase/functions/ingredient-analysis/index.ts:160, 233, 578`) and its own cache in `ai_summaries` keyed `ingredient_analysis:<product_key>`. The page renders `analysis.match_score` (line 940 hero, line 888 stars) and **never writes it back to `user_products`**. That is the 88.

Two extra contributors in the same file:

- `IngredientDetail.tsx:889-893` has an ad-hoc fallback formula `((good - bad) / total) * 50 + 50` when the AI returns no score — a third scoring path.
- The verdict label at line 896 is computed from `Math.round(...)` of the stars, so "Excellent match" can be shown alongside 4.5 stars.

`ProductProfile.tsx` (the older detail page, still in the tree) does the right thing — it hydrates from `product.match_score` and only calls `ingredient-analysis` when nothing is cached, then persists the result back (line 274). The live route no longer goes through it.

## Tables and columns

- `user_products.match_score` (integer 0-100) — the only durable per-user product score. There is no `hair_profile_match` or `compatibility_score` column.
- `user_products.rating` (smallint 1-5) — the **user's own** star rating, mirrored into `product_ratings.rating`. It is deliberately separate from the AI score and is not what the card shows.
- `ai_summaries` (`kind = 'ingredient_analysis:<product_key>'`, `payload.match_score`) — the second, competing score. Nothing reconciles the two.
- Stars are never stored anywhere; they are always derived from a percentage.

## Where else it shows up

Every surface that renders a saved product reads the `user_products.match_score` column and is therefore internally consistent with the card, and inconsistent with the detail page in the same way:

- `src/pages/Home.tsx:1014` (shelf list), `src/pages/ProductRepository.tsx:118`, `src/pages/OffShelf.tsx:169`, `src/pages/Favourites.tsx` (via the shared row) — all `MatchStars item={p}`.
- `src/components/passport/PassportView.tsx:1801` (what professionals see), `src/lib/professionalSnapshotPdf.ts:491` (products flagged as poor fit) — column-based.
- `src/lib/aiContext.ts:206-224` — the score fed into every other AI call is the column, so the AI reasons from 62 while the user is reading 88.
- `src/lib/fullProfilePdf.ts:488` — separate small bug: prints the 0-100 score as `"62/5"`.

## Existing data

Of 11 products that have both a stored column score and an `ingredient_analysis` cache, **6 disagree**. So a fix to the read path alone leaves those rows stale-looking until the surviving score is chosen; a one-off backfill is needed.

## Proposed fix

1. **One producer per product.** Make the saved `user_products.match_score` the single source of truth for a saved product. In `IngredientDetail.tsx`, when a `user_products` row already carries a score, render that score and do **not** call `ingredient-analysis` for scoring — or, if the call is still wanted for ingredient flags and guidance, persist its `match_score` back to `user_products` in the same commit so the column and the view can never diverge.
2. **Delete the ad-hoc fallback** formula at `IngredientDetail.tsx:889-893`; no score means no stars, as `matchStars.ts` already specifies.
3. **Fix the verdict label** to derive from the same half-star value the renderer uses, so 4.5 stars and the wording always agree.
4. **Backfill.** For the 6 mismatched rows, write the chosen authoritative value into `user_products.match_score` (recommended: the newest analysis, i.e. the `ai_summaries` payload score) so the app and the passport stop showing an out-of-date number.
5. **Fix the PDF unit bug** at `fullProfilePdf.ts:488` (`62/5` → `62%`).
6. **Guardrail:** a small test asserting that the detail page and list row for the same product row resolve to the same score via `matchScoreOf`.

Decision needed before building: for step 1, do you want the detail page to stop re-scoring entirely (fastest, cheapest, score fixed at scan time until profile change), or to keep re-scoring but write the new score back everywhere (score can move over time, one extra AI call per first visit)?
