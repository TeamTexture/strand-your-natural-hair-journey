# Style weighting — status and remaining work

Most of this brief was already shipped in the previous turn (commit deployed: `product-analyse`, `product-analyse-url`, `tool-analyse-url`, `ingredient-analysis`). This plan confirms what is already in place, and proposes the one section that is not yet done (E) plus the cache-staleness handling you asked about.

## Already in place — verified

**A. `supabase/functions/_shared/style-weighting.ts`** — exists, exports `STYLE_WEIGHTING_RULES`, modelled on `non-prescriptive.ts`. Encodes the governing principle, the strip-the-style test with your three worked examples, once-per-output limit, never opening `ai_summary`, duration-over-style-name, an explicit ban on preference-based style advice, and a safety carve-out. Appended at the same tail position as `NON_PRESCRIPTIVE_RULES` in all four analysis functions (never mid-prompt), so the cached prompt suffix is preserved.

**B. Daily cache-miss bug — fixed.** `currentProfileHash()` now hashes only `default_style` and `planned_next_style`. `current_hairstyle`, `days_in_style`, `style_set_on` and `planned_change_date` are excluded.

Confirmed in sync: both `supabase/functions/_shared/profile-snapshot.ts` and the client mirror `src/lib/profileSnapshot.ts` received the identical edit, and the hashed `snap` object literal was diffed line-by-line across the two files afterwards — the only difference is a pre-existing comment line inside `hairProfile`, which does not enter the hash. The two produce byte-identical hashes. `days_in_style` still reaches every function live in `context`.

**C. `product-analyse`** — both paths edited. Claude `buildTaskInstructions()`: style removed from the `ai_summary` opener signals, from `match_score` factors (replaced with `default_style` plus an explicit "current_hairstyle and days_in_style must never move the score"), and from the `use_cases` trait list (replaced with `length`). Gemini `buildLovableSystem()`: same four changes, and the "4 weeks into your knotless braids" worked example replaced with a porosity-anchored one. `pair_with`, `routine_suggestion` and the personal-signal-selection block were also de-styled.

**D. What was found in the other three functions** (they were not identical):
- `product-analyse-url` — 10 style references: `match_score` factors, `ai_summary` opener, `use_cases` trait list, `pair_with` why-clause, `routine_suggestion`, the "signals that ARE relevant" list, and in the Gemini prompt a personalisation line naming `current_hairstyle`/`days_in_style`, a match_score rule, an `ai_summary` opener rule and a `use_cases` trait list. All de-styled.
- `tool-analyse-url` — 5 references: `ai_summary` opener, `key_features` relevance, `match_score` fit factors, `pair_with` why-clause, `routine_suggestion`. All de-styled; `STYLE_WEIGHTING_RULES` appended to both prompt tails.
- `ingredient-analysis` — 5 references: the `body` field spec, the USER INPUTS list, the "allowed levers" list (which explicitly permitted "how to work it through their current style" — the exact banned style technique), the hair-data-point list, and a tip rule that *required* naming the current hairstyle. All de-styled.

## Remaining work — Section E carve-out

Two functions were left untouched last turn and still promote style-specific teaching:

**`supabase/functions/heat-treatment-rationale/index.ts`** — two prompt lines list "current style" as a grounding source for the bullets (lines 96 and 178). Change: keep the style as a permitted factual reference (what is on her head), and state that the teaching itself stays general — no style-specific technique, verdict or cadence. Append `STYLE_WEIGHTING_RULES` at the shared-block tail with a one-line preamble noting the factual-reference carve-out.

**`supabase/functions/wash-day-observation/index.ts`** — no prompt rule promotes style as a teaching source; the style only arrives as recorded context. Change: append `STYLE_WEIGHTING_RULES` at the tail with the same factual-reference preamble, so the observation may name what she did without generating style teaching.

Both functions get redeployed and verified booting.

## Risks

**Stale cached `ai_summaries` rows (the one you flagged).** The hash definition changed, so every existing row's stored `profile_snapshot_hash` was computed under the old definition. Two consequences, both benign but worth stating:
- Rows whose old hash happened to encode a style now read as mismatched, so the next view regenerates once and re-caches under the new definition. A single one-off regeneration per product, then hits from then on.
- No rows are orphaned — the hash is only ever compared, never used as a key or a foreign reference, so a mismatch degrades to "regenerate", never to a broken read.
- Cached copy generated under the *old* prompts will still contain style-anchored sentences until it regenerates. If you want that cleared immediately rather than lazily, the existing `AI_COPY_REVISION` constant can be bumped in the same change to force a one-pass purge — that costs a burst of regeneration on first view across the member base. Say the word and I will include it; the default in this plan is to let it age out lazily so there is no cost spike.

**Latency and tokens.** Nothing here should slow generation. Section B restores daily cache hits, which is the material speed-up. A and C were substitutions plus one appended block of roughly 380 words at the stable tail — it sits inside the cached prompt suffix, so after the first call per prompt version it is read from cache rather than re-billed. Output should shorten slightly. The one honest caveat: the very first call after each deploy pays a prompt-cache write, a one-off.

**Behaviour change to expect.** Match scores will shift once for products whose previous score leaned on the current style, and will then stop drifting day to day. That is the intended outcome, but it is a visible change to any member who noted a score.
