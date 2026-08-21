# STRAND — consolidated current state and bug list

Single source of truth. Supersedes `docs/KNOWN_ISSUES.md` and the loose plan files
`.lovable/plan/product-match-score-disagrees-*`, `.lovable/plan/style-weighting-*`.
Last updated: 21 Aug 2026.

---

## 1. Open bugs — member-facing

| # | Issue | Detail | Priority |
|---|---|---|---|
| 1 | Length goal not populating on Home | Added via hair goals journal, doesn't appear on Home. | Med |
| 2 | Wishlist items don't open a product profile | Should match the shelf product profile screen exactly (ingredient analysis, match score, personalisation). | Med |
| 3 | Two scorers for one product | `user_products.match_score` (from `product-analyse` at scan) vs `ai_summaries.ingredient_analysis:<key>.match_score` (from `ingredient-analysis` on detail view). Two independent scores; the detail page never writes back. Third path: the ad-hoc `((good-bad)/total)*50+50` fallback in `IngredientDetail.tsx`. **Partially mitigated** — the sensitivity ceiling is now shared client+server so sensitivity-driven scores agree; the underlying two-scorer split remains. | High |
| 3b | **Sensitivity ceiling missed the live detail page (fixed 21 Aug)** | The live route for a saved product is `/products/profile/:id` → `ProductProfileRedirect` → `/products/ingredient` → **`IngredientDetail.tsx`**, *not* `ProductProfile.tsx`. The ceiling had only been wired into `ProductProfile`, so the page members actually see showed "VERDICT 85 / 4.5 stars / Excellent match" above the fragrance warning. `IngredientDetail` now applies the shared ceiling + matcher to the score, stars, verdict copy and callout tone, and renders the red strip above the score card. **`ProductProfile.tsx` is dead weight on this route — consolidating the two detail surfaces (and the two scorers, item 3) is the real fix; until then any new detail-page feature must be wired into `IngredientDetail`.** | High |
| 4 | Verdict label vs stars | `IngredientDetail.tsx` computes the verdict from rounded stars, so "Excellent match" can sit next to 4.5 stars. | Low |
| 5 | `paige@paige.com` typo'd email | `info@teamtexure.co.uk` (missing "t"). Cosmetic. | Low |

## 2. Performance (investigated 21 Aug — see §5 for evidence)

| # | Issue | Status |
|---|---|---|
| 6 | Strand tip cost ~20s wall clock (evidence-gather p50 12.9s / avg 14.4s + fidelity audit 4.6s + generation 1.8s) | Card now hidden on Home, so Home no longer waits on it at all |
| 7 | Two `data-decrypt-context` invocations per page (clinical context + sensitivities) | **Fixed** — `useSensitivities` now reads the shared 30s decrypt cache (`loadDecryptedContext`) |
| 8 | `useHomeAlerts` awaits `loadClinicalContext()` before its 13-query `Promise.all` | Open — one avoidable serial round trip (~200-400ms). Fold the clinical read into the same `Promise.all`. |
| 9 | Repeated regex construction per shelf card in `scanSensitivities` | Open, low impact (pure CPU, no I/O). Memoise the compiled alias regexes if shelf pages ever exceed ~50 cards. |
| 10 | Cache invalidation policy | Open — remove the "re-analyse" button; regenerate `ai_summaries` automatically only when hair profile / blood / health / style / heritage / location changes (Postgres trigger). Phase 2.5. |
| 11 | Phase 2 speed sweep | Open — streaming responses (biggest win), step-indicator loading copy, tighter RAG triggers. Do as one sweep, not per function. |

## 3. AI edge functions — audit, 21 Aug

All nine migrated functions error loudly (5xx surfaced to the UI); none returns canned
or fake content on failure.

| Function | Provider flag wired | Loud failure | `STYLE_WEIGHTING_RULES` |
|---|---|---|---|
| blood-ai-summary | `STRAND_AI_PROVIDER_BLOOD` | `aiErrorResponse` | n/a (no style surface) |
| ingredient-analysis | `_INGREDIENT` | `aiErrorResponse` | yes |
| nutrition-plan | `_NUTRITION` | `aiErrorResponse` | n/a |
| product-analyse | `_PRODUCT_PHOTO` | `aiErrorResponse` | yes (both paths) |
| product-analyse-url | `_PRODUCT_URL` | `aiErrorResponse` | yes (both paths) |
| tool-analyse-url | `_TOOL_URL` | `aiErrorResponse` | yes (both paths) |
| wash-day-observation | `_WASH_OBSERVATION` | `aiErrorResponse` | yes (both paths) — Aug 15 item now closed |
| heat-treatment-rationale | `_HEAT_RATIONALE` | `aiErrorResponse` | yes (both paths) — Aug 15 item now closed |
| journal-encouragement | **not wired** — `STRAND_AI_PROVIDER_JOURNAL` is declared in `_shared/flags.ts` but never read; the function is Gemini-only | explicit 500s at every branch | n/a (banner copy) |

Open items:
- 12. `journal-encouragement` has no Claude path and ignores its declared flag. Either wire it or delete the unused flag name.
- 13. `heat-treatment-rationale` old hardcoded fallback rationale: **confirmed gone** (file now ends at `aiErrorResponse`). No action.
- 14. Flag values are case-sensitive: `readAiProvider` only accepts lowercase `claude` / `parallel`. A secret set to `Claude` silently falls back to Gemini. Consider lower-casing on read.
- 15. `nutrition-plan` stamps an Opus 4.7 model label while actually calling Sonnet 4.6. Cosmetic but misleading in `ai_call_log`.

## 4. RLS / auth — everything built this week (verified 21 Aug)

| Object | Verdict |
|---|---|
| `user_sensitivities` | Correct. Owner-only for all four verbs (`auth.uid() = user_id`), `authenticated` only. Encrypted at rest; decrypt is JWT-gated. |
| `user_supplements` | Correct. Owner-only writes + reads; plus admin read and "professional with active subscription **and** accepted `pro_client_access`" read. |
| `meal_cook_logs` | Correct, and insert additionally verifies the `meal_id` belongs to the caller — no cross-account log injection. Same admin/consented-pro read pattern. |
| `pro_passport_visibility` | Correct. Owner-managed; admin + consented-pro read. |
| `chat_messages` (policy change) | Correct. Send requires `sender_id = auth.uid()` and (thread pro **or** `can_send_chat_message`), and `booking_request` is restricted to the pro side. `can_send_chat_message` now has `SET search_path = public`. |
| `sensitivity-ceiling` / `topical-sensitivity` | No new data access — pure functions over data the caller already holds. Client copy mirrors the server copy. |

Fixed in this pass: all four new tables had blanket `anon` grants (harmless in practice
because every policy requires `auth.uid()`, but wider than intended). `anon` revoked;
`authenticated` + `service_role` granted explicitly.

Pre-existing linter noise, unchanged by this week's work: 140 `SECURITY DEFINER`
functions executable by signed-in users (by design — `has_role`, passport RPCs etc.),
and one RLS-enabled table with no policy (`manuscript_evidence_cache`, service-role only).

## 5. Evidence behind §2 (`ai_call_log`, last 7 days)

```
function              stage  n   avg_ms  p50_ms  max_ms
evidence-gather         1    19  14360   12933   23055
wash-day-tip            2     4   9514    8550   15611
supplement-extract      2     2   8147    8146    8814
meal-ideas              2     5   7617    7976    8333
ingredient-analysis     2     1   5632    5632    5632
fidelity-audit          1    11   4981    4641    8236
blood-change-analysis   2     1   2350    2350    2350
goal-tip                2     3   1840    1632    2541
```

Read: generation itself is fast. The cost is the stage-1 pipeline in front of it
(evidence gather + fidelity audit ≈ 18s combined), which is why any surface that
blocks on an AI tip reads as "very slow" while the rest of the page is already
painted.

Shelf pages: the new `useSensitivityAdjustedScore` does **not** decrypt per card.
`useTopicalAlert` → `useSensitivities` → one React Query key per user, so N cards
share one fetch, and that fetch now shares the clinical-context decrypt cache too.

## 6. Backlog / not bugs

- Programmes feature (time-boxed named plans, ~2-3 week build). Phase 3.
- Heat Hat prompt when AI suggests heat/steam — never a hooded dryer or non-TT alternative. Phase 2+.
- Strand tip card is hidden behind `SHOW_STRAND_TIP` in `src/lib/featureFlags.ts`. Engine untouched; flip the flag to restore.
