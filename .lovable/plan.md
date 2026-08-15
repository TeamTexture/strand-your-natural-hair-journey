# Style weighting and the daily cache-miss bug — verification and remaining work

I read every file named in the brief before writing this. Sections A, B, C, D and E are already implemented in the codebase and the six affected functions are deployed. Below is what is on disk today, section by section, followed by the only work I would still do and the risks.

## A. Shared module — DONE

`supabase/functions/_shared/style-weighting.ts` exists and exports `STYLE_WEIGHTING_RULES`. It encodes:

- the manuscript-supplies-teaching / style-supplies-quantity principle
- the strip-the-style test with the exact VALID and both INVALID examples from the brief
- style referenced at most once per output, never as the opener of `ai_summary`
- express style as duration / scalp access / coverage rather than a style name
- preference-based style advice banned ("perfect for your twists" etc.)
- per-style application technique banned; no cadence attached to a style
- `default_style` and `planned_next_style` allowed as durable planning signals; `current_hairstyle` and `days_in_style` may never move a score or verdict
- a safety carve-out mirroring `non-prescriptive.ts` (tension/traction, scalp infection signs, known allergens, blood-panel flags stay direct)
- a length note so the rule does not inflate output

It is appended in the stable tail position alongside the other shared rule blocks in every consuming function (verified: it is the last interpolation in each prompt template it appears in).

## B. Daily cache-miss bug — DONE, and both files are in sync

Both `supabase/functions/_shared/profile-snapshot.ts` and `src/lib/profileSnapshot.ts` now hash only the durable style slice:

```text
currentStyle: { default_style, planned_next_style }   // or null
```

`current_hairstyle`, `days_in_style`, `style_set_on` and `planned_change_date` are all excluded, with an explanatory comment in both files.

Sync confirmation: I diffed the two `currentProfileHash` bodies. They are identical in field selection, field order, null handling, the inlined `goalChallenges` fallback, `canonicalStringify`, `djb2Hex` and the `:tl{n}` suffix. The only differences are comments and the client-only `SnapshotInput` interface, neither of which affects the hashed string — so both produce byte-identical hashes for the same context.

Nothing was removed from the AI context: `days_in_style` still reaches every function live in `context`.

## C. product-analyse prompts — DONE

Both paths carry the change:

- Claude `buildTaskInstructions()` — `ai_summary` opener signals no longer list `current_hairstyle`; `match_score` reads category fit, `default_style`, relevant blood markers and goal alignment with the explicit line "current_hairstyle and days_in_style must never move the score"; `use_cases` anchors on durable traits; `STYLE_WEIGHTING_RULES` appended at the tail.
- Gemini `buildLovableSystem()` — same four changes. The "4 weeks into your knotless braids" worked anti-pattern is gone; no occurrence of `knotless`, `4 weeks` or `passion twist` remains in any of the four analysis functions.

The old self-contradiction (PERSONALISATION PRIORITY excluding style while field rules promoted it) is resolved.

## D. What I found in the other three functions

- `product-analyse-url` — two prompt paths (Claude task instructions and the Gemini system). Both had style in the `match_score` factors and the opener signals; both now name `default_style` only and carry the explicit never-move line plus `STYLE_WEIGHTING_RULES`.
- `tool-analyse-url` — two prompt blocks, both carry `STYLE_WEIGHTING_RULES`; style removed from openers and fit reasoning.
- `ingredient-analysis` — one prompt block carrying `STYLE_WEIGHTING_RULES`. It never scored on style; `currentStyle` here is only a context field passed through, which is correct and stays.

The only remaining `current_hairstyle` / `days_in_style` strings anywhere in the four functions are the four prohibition lines themselves.

## E. Narrowed carve-out — DONE

`wash-day-observation` and `heat-treatment-rationale` each carry a "STYLE — RECORDED FACT ONLY (carve-out for this task)" block in both of their prompt paths: the style may be named as what she did or what is on her head, never as the mechanism and never as style-specific teaching. Both still import `STYLE_WEIGHTING_RULES` so the general ban on invented style teaching holds.

## Remaining work I would do

1. Nothing in A–E. Re-shipping identical text would only churn the prompt cache.
2. One optional hygiene step: a read-only audit of `ai_summaries` payloads to count rows whose `_profile_snapshot_hash` is 8-hex + `:tl{n}` but predates the narrowing, so we can see how many will regenerate lazily. Read-only — no backfill, no deletes.

## Risks

- Stale or orphaned cached rows: rows written before the narrowing hold the old hash, so their first read after the change is one cache miss and one regeneration, then they settle on the new hash. No row is orphaned — the hash is a payload field compared on read, never a foreign key, and a mismatch simply triggers a fresh analysis. `user_products.analysis_profile_snapshot_hash` behaves the same way on the client path.
- Match-score drift: scores that previously leaned on the current style will move once for each product on its next regeneration. This is the intended correction, but a member may notice a number changing.
- Perceived under-personalisation: guidance no longer opens with the current style, so it can read as less tailored even though it is better grounded. The durable-characteristic opener is what mitigates this.

## Performance

- B restores cache hits and is the material speed-up; the daily invalidation is gone.
- A and C are substitutions, so input tokens are roughly flat; shared blocks sit in the stable tail position, preserving `cache_read_input_tokens` hit rates.
- Output is slightly shorter (fewer style-anchored sentences).
- One expected one-off cost: the first read of every previously cached analysis regenerates. After that, steady-state latency and token use are lower than before.
