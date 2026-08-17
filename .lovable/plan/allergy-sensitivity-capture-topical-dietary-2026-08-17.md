# Allergy & sensitivity capture (topical + dietary)

One record per member, two surfaces (Products, Nutrition), encrypted at rest, enforced deterministically before display.

## 1. Data model

One row per member per surface — `applies_to` distinguishes them, so a soya entry can be created once and mirrored to both by writing two rows (the UI offers "applies to food too / products too" on entries that exist in both vocabularies).

```text
public.user_sensitivities
  id                uuid pk default gen_random_uuid()
  user_id           uuid not null            -- no FK to auth.users
  applies_to        sensitivity_scope        -- enum: topical | dietary
  entries_enc       bytea                    -- encrypted JSON array (see below)
  created_at        timestamptz default now()
  updated_at        timestamptz default now()
  unique (user_id, applies_to)
```

`entries_enc` decrypts to:
```json
[{ "code": "milk", "label": "Milk / dairy", "severity": "avoid", "custom": false }]
```
`severity` is exactly `avoid` | `limit` | `dislike`. Only `avoid` is a hard exclusion. `custom: true` rows carry free text with `code: null`.

Confirmation timestamps live on `profiles` (same place as the other per-member state):
```text
profiles.topical_sensitivities_confirmed_at  timestamptz null
profiles.dietary_sensitivities_confirmed_at  timestamptz null
```
Null = never asked (the only state that triggers a prompt). Set + zero entries = explicitly "I have none". No backfill — existing members are deliberately left null so they get asked once.

Grants + RLS (migration order: create table → grants → enable RLS → policies):
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sensitivities TO authenticated;
GRANT ALL ON public.user_sensitivities TO service_role;
-- no anon grant
```
Policies, all `to authenticated`, all four verbs, `using (auth.uid() = user_id)` / `with check (auth.uid() = user_id)`. No professional, brand, or admin read path — this is not passport data and is not shared. `updated_at` maintained by the existing trigger helper.

## 2. Alias matching against encrypted values — the answer you asked for

Encrypted columns cannot be matched in SQL, and I will not weaken that by storing allergen codes in plaintext.

- **All matching happens server-side inside edge functions, after decryption in memory.** `nutrition-plan`, `meal-ideas`, `ingredient-analysis`, `ingredient-profile`, `ingredient-explainer`, `product-analyse`, `product-analyse-url` already run authenticated with access to `STRAND_CLINICAL_MASTER_KEY`. They fetch the member's row, decrypt with the same libsodium `nonce||ciphertext` helper used by `data-decrypt-context`, then run the alias map over plaintext in memory. Nothing is written back in the clear and nothing is logged.
- **Alias map is code, not data**: a new `supabase/functions/_shared/allergen-aliases.ts` (whey/casein/ghee → milk, tahini → sesame, semolina/durum/spelt → gluten, edamame/tofu/tempeh → soya, marzipan → tree nuts, and so on) plus a topical alias set that reuses the INCI vocabulary. Because the map is code, it can be extended without touching stored data or re-encrypting anything.
- **Client-side display** (the "avoiding" summary chips) gets plaintext by extending the existing `data-decrypt-context` function with a `sensitivities` slice — the same route `aiContext` already uses. No new decrypt surface.
- **Consequence accepted**: we can never query "all members allergic to soya" in SQL. That query is not a product requirement; if analytics ever needs it, it runs through a service-role function, not a plaintext column.
- Write path uses the existing `data-encrypt-batch` function and its `pg_hex` return value (never a raw `Uint8Array` — that corrupted rows before).

## 3. Vocabularies

- **Dietary**: the 14 UK regulated allergens (cereals containing gluten, crustaceans, eggs, fish, peanuts, soya, milk, tree nuts, celery, mustard, sesame, sulphites, lupin, molluscs) + free text.
- **Topical**: reused from the existing avoid logic rather than invented — `supabase/functions/_shared/ingredient-copy.ts` and the `ingredient-analysis` / `ingredient-explainer` flag rules already name the irritant set (sulphates/SLS, drying alcohols, fragrance/parfum, methylisothiazolinone and related preservatives, parabens, colourants, silicones, protein, essential oils, lanolin, coconut). I will lift that list verbatim into a shared `src/lib/sensitivityVocab.ts` + its function-side twin, so the chips and the analysis speak the same language. No new terms.

## 4. Trigger placement — cannot double-fire, cannot block

New hook `src/hooks/useSensitivityCapture.ts` (deliberately NOT `useFirstRunNudge` — health/safety input, exempt from the 14-day suppression rule):

- Fires only when: session ready, onboarding complete, consumer access granted, and the relevant `*_confirmed_at` is null.
- Reads the profile flag from a single React Query key (`["sensitivity-confirm", userId]`) so both surfaces share one cached read.
- Renders as a **non-modal inline card** at the top of the page (Products, Nutrition) plus a sheet for the full chip picker — the page renders and is usable underneath; nothing is behind a blocking gate.
- Anti-double-fire: an in-module `Set` of `${userId}:${surface}` marks a surface as asked for the session, the timestamp is written **on first display**, and the query key is invalidated on write. Products and Nutrition are separate routes so they cannot render simultaneously.
- Dismissing without answering leaves the timestamp set (asked once, never nagged) but leaves entries empty — the persistent "avoiding" summary then shows a "not set" state, tappable at any time. "I have none" is an explicit button that writes the timestamp with zero entries.

## 5. Enforcement

**Nutrition (`nutrition-plan`, `meal-ideas`)**
1. Pre-generation: hard-`avoid` codes are injected as explicit exclusions in the prompt, alongside the existing diet-pattern mapping (substitute, never subtract).
2. Post-generation, before display: deterministic scan of every returned ingredient/meal/supplement string against codes + aliases. On a hit, regenerate once with the violating items named; a second hit drops the offending items and surfaces an honest partial state. Never rendered then corrected.
3. `limit` and `dislike` are prompt-level preferences only — never hard filters.

**Products / ingredients**
- A topical `avoid` match raises a visible warning chip/banner on the product card, the scan result and the ingredient detail — an explicit named warning, not a silent score deduction. The existing "bad" flag rules already accept "documented allergy/sensitivity" as a valid trigger, so this feeds that branch instead of a parallel one.
- Wishlist items use the same match so a warning shows before purchase.

## 6. Safety copy and nutrient gaps

- A one-line visible caution at the point of generation (nutrition plan header and meal ideas), and on topical warnings — "check packaging and cross-contamination", not buried in Legal. Placement only; wording will come from you.
- Nutrient-gap copy slot: a dedicated block in the Nutrition page's existing `CardSections` renderer, directly under the "avoiding" summary, keyed by excluded group (fish → omega-3, dairy → calcium, etc.). I will build the slot and the trigger logic and leave the educational copy as a supplied-content map — **no nutritional or hair guidance copy written by me**.

## 7. Files touched

New
- `supabase/migrations/<ts>_user_sensitivities.sql`
- `supabase/functions/_shared/allergen-aliases.ts`
- `src/lib/sensitivityVocab.ts`
- `src/hooks/useSensitivities.ts` (read/write via encrypt/decrypt functions)
- `src/hooks/useSensitivityCapture.ts` (trigger gate)
- `src/components/sensitivity/SensitivityCaptureCard.tsx` + `SensitivitySheet.tsx` (chips, severity, free text, "I have none") — styled on `TipsLevelPrompt` / `GoalsChallengesPrompt`
- `src/components/sensitivity/AvoidingSummary.tsx` (persistent, tappable)

Modified
- `src/pages/Products.tsx` — capture card + `AvoidingSummary` (topical)
- `src/pages/NutritionPlan.tsx` — capture card + `AvoidingSummary` (dietary), gap slot, safety line
- `src/pages/Profile.tsx` — both editors reachable
- `src/lib/aiContext.ts` — carry both sets in context
- `supabase/functions/data-decrypt-context/index.ts` — add `sensitivities` slice
- `supabase/functions/nutrition-plan/index.ts`, `meal-ideas/index.ts` — pre-filter + post-validate + regenerate-once
- `supabase/functions/ingredient-analysis/index.ts`, `ingredient-explainer/index.ts`, `ingredient-profile/index.ts`, `product-analyse/index.ts`, `product-analyse-url/index.ts` — topical match feeds the existing flag branch
- `src/components/ProductThumb.tsx` / `product/ShelfProductCard.tsx` / ingredient detail — warning surface

All touched edge functions deployed and boot-verified in the same task, with a per-function deploy status list in the report.
