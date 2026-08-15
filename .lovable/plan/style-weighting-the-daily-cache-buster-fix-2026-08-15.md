# Style weighting + the daily cache-buster fix

The manuscript teaches general hair care, not styles. So the current style may only ever supply a quantity (how long hair has been up, how reachable the scalp is, how much of the hair is covered) — never a technique, a verdict, or a teaching point. Durable characteristics (porosity, density, texture, diameter, elasticity, scalp, length, diagnosed conditions) plus goals and challenges carry the advice.

Alongside that, one bug is quietly making every product analysis regenerate every day. Fixing it is the priority.

## A. New shared rule block

Create `supabase/functions/_shared/style-weighting.ts`, exporting `STYLE_WEIGHTING_RULES`, written in the same structure and tone as `_shared/non-prescriptive.ts` (header comment explaining scope, one exported template string, banned list, then a safety carve-out and a length note so it cannot be read as licence to write more).

Contents:
- The strip-the-style test, with the three worked examples supplied (one valid, two invalid).
- The manuscript has no style-specific teaching; never invent style technique in STRAND's voice.
- Style may appear at most once in an output, and never opens `ai_summary`.
- Express it as duration / scalp access / coverage, not as a style name where a quantity will do.
- Banned: preference-based style advice ("great while you're wearing X", "perfect for your twists"), style-derived verdicts, per-style application technique.
- Safety carve-out mirroring `non-prescriptive.ts`: genuine safety issues (tension/traction concerns on a tension treatment, scalp infection, allergen, blood-panel flags) stay direct.

Appended at the **same stable tail position** as `SCORE_REASONS_RULES`, `PURPOSE_INSIGHT_RULES` and `NON_PRESCRIPTIVE_RULES` — immediately after `NON_PRESCRIPTIVE_RULES` at the end of each prompt. Nothing is inserted mid-prompt, so the cached prompt prefix is untouched.

## B. The daily cache-buster (highest priority)

`supabase/functions/_shared/profile-snapshot.ts` hashes `currentStyle` wholesale. Confirmed in `src/lib/aiContext.ts` (lines 448-455) that `currentStyle` carries `days_in_style: daysSince(style_set_at)`, which increases every day. Confirmed the hash is compared in three functions: `product-analyse` (line 544), `product-analyse-url` (859), `tool-analyse-url` (724) — each falls through to a full fresh generation when `hashOk` is false. So anyone in a style gets a full regeneration daily, including the Claude call with web search, and the match score can drift on every re-scan.

Fix: replace `currentStyle: c.currentStyle ?? null` with a narrowed slice containing **only** `default_style` and `planned_next_style`. Dropped from the hash: `current_hairstyle`, `days_in_style`, `style_set_on`, `planned_change_date`. Nothing is removed from the AI context — the functions still receive the live `days_in_style`.

**Sync confirmation:** both files have been read. `src/lib/profileSnapshot.ts` is the client mirror and computes the identical `snap` object with the same `canonicalStringify` + `djb2Hex` + `:tl{level}` suffix. The same narrowed slice will be written into both, with identical key names and identical key order in the literal (order is irrelevant to the output because `canonicalStringify` sorts keys, but they will be kept byte-identical anyway). Both therefore produce identical hashes.

## C. `product-analyse`

Both prompt builders — `buildTaskInstructions()` (Claude) and `buildLovableSystem()` (Gemini):
1. Drop `current_hairstyle` from the `ai_summary` preferred-opener signals (Claude line 181, Gemini line 368).
2. Drop "current_hairstyle suitability" from the `match_score` factors (Claude 180, Gemini 362).
3. Drop `current_hairstyle` from the `use_cases` anchorable traits (Claude 183, Gemini 369).
4. Append `STYLE_WEIGHTING_RULES` after `NON_PRESCRIPTIVE_RULES` in both (lines 246 and 399).

Also in this file:
- Gemini rule 6 contains the anti-pattern verbatim ("Good fit while you're 4 weeks into your knotless braids…"). Replaced with a characteristic-anchored example.
- Line 169 ("Reference … current hairstyle …"), line 202 (`pair_with` "current style"), line 203 (`routine_suggestion` "reference current_style") and line 357 (personalise to `currentStyle (current_hairstyle, days_in_style, planned_next_style)`) are softened to the quantity framing rather than the style name; `routine_suggestion` keeps a duration/access reference since that is a genuine quantity.
- `match_score` becomes current-style-blind: it may read `default_style`; `current_hairstyle` and `days_in_style` must never move it. Line 236 ("Leave-in / styler → … current style stage") changes to durable traits.
- Noted, not changed: the prompt's own PERSONALISATION PRIORITY block already lists only challenges, goals and hair traits, so this removes a self-contradiction.

## D. Findings in the other three functions (audited individually, they do not match)

**`product-analyse-url`** — the heaviest. Claude block: line 152 `match_score` "current_hairstyle suitability"; 153 `ai_summary` opener signal; 155 `use_cases` anchorable trait; 161 `pair_with` "current style"; 162 `routine_suggestion` "reference their current_style"; 180 hair-type list includes "current style". Gemini block: 344-345 personalise-to `currentStyle (current_hairstyle, days_in_style, planned_next_style)`; 359 match-score factor; 363 `ai_summary` opener; 371 `use_cases` trait. Same four edits as C, plus append `STYLE_WEIGHTING_RULES` at the existing tail (after `NON_PRESCRIPTIVE_RULES`, line 297).

**`tool-analyse-url`** — four references, all in one prompt: 131 `ai_summary` opener includes "current style"; 132 `key_features` relevance ties to "current style"; 137 `match_score` explicitly scores fit against "current style"; 143 `pair_with` "why" may cite current style. Remove style from the opener, from `key_features` relevance and from `match_score`; keep the tension/safety reference where the tool is a tension-related tool (carve-out). Append the block after `NON_PRESCRIPTIVE_RULES` (line 159).

**`ingredient-analysis`** — three prompt references: 279 `body` may justify against "current style"; 328 allowed levers include "how to work it through their current style safely"; 334/337 the tip MUST reference one of a list that includes "the user's current hairstyle (and time in it if relevant)". 337 is the strongest offender — it can force a style-anchored tip. Change to durable traits/goals/challenges/wash-day signals only, drop style from 279 and 334, and reframe 328's lever as scalp access / coverage rather than the style name. Append the block after `NON_PRESCRIPTIVE_RULES` (line 354). `currentStyle` stays in the context payload (lines 603/615) — unchanged.

## E. `wash-day-observation` and `heat-treatment-rationale`

May name the style as **recorded fact** only. No style-specific teaching, since the book's wash-day teaching is general. Neither function receives `STYLE_WEIGHTING_RULES` — no prompt change beyond one clarifying clause each (`wash-day-observation` line 178 context list; `heat-treatment-rationale` lines 96 and 178, "current style" → recorded fact, not a teaching source). Their prompt tails are unchanged.

## F. Latency and tokens

- B should measurably **speed things up**: cache hits are restored for anyone in a style, so the common path stops doing a full Claude + web-search generation.
- A and C/D are substitutions in already-appended tail blocks. `STYLE_WEIGHTING_RULES` is a genuine addition of roughly 200-250 tokens per prompt, placed at the very end alongside the other shared blocks so the cached prefix boundary does not move and `cache_read_input_tokens` is preserved. Net token change is close to flat because style clauses are removed from four field rules.
- Nothing here adds a model call, a retry, or a second pass.

## Risks

- **Cached `ai_summaries` / `user_products` rows go stale on the hash change.** Every stored `analysis_profile_snapshot_hash` was computed under the old definition, so the first read after deploy misses and regenerates once per product. That is a one-off warm-up cost, then hit rates improve permanently. No rows are orphaned — the hash column is overwritten on the next save; there is no cleanup job depending on the old value.
- Old rows never re-validate if a product is never opened again; they simply sit there, harmless.
- **Drift risk if the two snapshot files diverge.** Both are edited in the same change with identical literals; the header comments in both already state the sync requirement.
- Style-anchored copy already stored in older analyses stays until that product is re-analysed. Optional (not proposed here): bump the analysis revision constant to force a sweep — that would cost a full regeneration for every product at once, which contradicts F.
- Removing style from `match_score` will shift some scores on the next regeneration. That is the intended correction, but members may notice a score move.
