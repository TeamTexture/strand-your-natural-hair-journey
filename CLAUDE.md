# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

STRAND is a mobile-first hair journal / clinical companion for women on a natural hair care journey, exclusive to TT Collective Pro members. It's a Vite + React + TypeScript SPA with a Supabase backend (auth, Postgres, edge functions). The project was bootstrapped via Lovable — `lovable-tagger` runs as a Vite plugin in dev, and several files in `src/integrations/supabase/` are auto-generated.

## Working on a live app — protect existing flows

Real members are using STRAND right now. Every change — however small or however isolated it looks — must be checked against the rest of the app before it ships: what tables, hooks, edge functions, and UI surfaces does this touch or share, and could this change break, slow, or silently alter behaviour anywhere else that reads the same data or calls the same function? Prefer additive changes (new columns, new optional fields, new components) over rewriting shared logic. If a shared file or table must change, explicitly list every other feature that reads from it and confirm each one still works before considering the task done. This applies to every future change to this repo, not just the one in progress when this rule was added.

## Commands

Package manager is npm (a `bun.lockb` exists but `package-lock.json` is the committed source of truth).

- `npm run dev` — Vite dev server on **port 8080** (`host: "::"`, HMR overlay disabled).
- `npm run build` — production build. `npm run build:dev` produces a development-mode build.
- `npm run lint` — ESLint flat config (`eslint.config.js`). Note: `@typescript-eslint/no-unused-vars` is off.
- `npm run test` — Vitest single run. `npm run test:watch` for watch mode.
- Run a single test file: `npx vitest run src/path/to/file.test.ts`. Test env is `jsdom`, globals enabled, setup at `src/test/setup.ts` (mocks `window.matchMedia`).

There is no separate typecheck script — the build runs `tsc` via Vite.

## Architecture

### Frontend shell — every route lives inside a phone frame
`src/App.tsx` wraps the entire `<Routes>` tree in `<PhoneShell>` (`src/components/PhoneShell.tsx`), a 375px-wide iOS-style frame. On mobile (<640px) the shell takes the full viewport with safe-area insets and overscroll disabled; on desktop it renders a 375×812 device mockup on a tinted backdrop. **Do not break this constraint** — all pages should be designed for a 375px-wide viewport.

### Auth / routing
- `<AuthProvider>` (`src/hooks/useAuth.tsx`) wraps the router and exposes `useAuth()` returning `{ session, user, loading, signOut }`. It subscribes to `onAuthStateChange` **before** calling `getSession()`, per Supabase guidance.
- Protected routes use the `<Protected>` helper in `App.tsx`, which wraps children in `<RequireAuth>` (`src/components/RequireAuth.tsx`). On no-user, it redirects to `/?next=<encoded-pathname>`. While `loading`, it renders `<LoadingDot />` to avoid splash flash.
- `/` is `Index.tsx`: signed-in users go straight to `/home`; everyone else sees the splash screen.
- The route tree has three sections: marketing/auth (`/`, `/auth`, `/walkthrough`, `/setup`), the onboarding flow (`/onboarding/*`, including profile steps and a multi-step blood-results capture), and the main app (`/home`, `/wash-day`, `/products`, `/journal`, `/appointments`, `/directory`, `/profile`, etc.).

### State / data
- `@tanstack/react-query` is the server-state layer. A single `QueryClient` is created in `App.tsx`. Query/mutation logic lives in `src/hooks/use*.ts` (e.g. `useGoals`, `useUserProducts`, `useWashDays`, `useBloodValues`, `useIngredientLists`).
- Supabase client: import from `@/integrations/supabase/client`. It reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env` and persists sessions in `localStorage`.
- `src/integrations/supabase/types.ts` is **auto-generated** — do not hand-edit. Tables include `profiles`, `user_products`, `user_product_photos`, `user_tools`, `wash_days`, `journal_entries`, `moodboards`, `moodboard_images`, `appointments`, `professionals_directory`, `ingredient_lists`, `blood_results`, `ai_summaries`, `user_goals`, `goal_updates`, `user_medications`, `product_ratings`, `product_voicenotes`, `contact_messages`. Migrations live in `supabase/migrations/`.

### AI integration — the STRAND persona
All AI calls go through Supabase edge functions in `supabase/functions/` (e.g. `product-analyse`, `product-analyse-url`, `tool-analyse-url`, `ingredient-analysis`, `blood-ai-summary`, `nutrition-plan`, `journal-encouragement`, `wash-day-observation`, `heat-treatment-rationale`, `transcribe-audio`). They proxy to the **Lovable AI Gateway** (`ai.gateway.lovable.dev/v1/chat/completions`) using `LOVABLE_API_KEY` from Deno env. Most calls use `google/gemini-2.5-flash`; heavier reasoning uses `google/gemini-2.5-pro`.

Every text-generating function embeds the **STRAND persona prompt** — a long system message that frames the assistant as Paige Lewin, author of *How To Love Your Afro*, with strict rules on tone, chapter/page references (`Read more — How To Love Your Afro, Chapter [X]: [Title], p.[page]`), boundaries (no medical diagnoses, no contradicting the book), and personalisation. When editing or adding a function, preserve the persona contract — copy from `product-analyse/index.ts` as the canonical version.

Client-side, **`src/lib/aiContext.ts`** centralises the user-context payload that every AI call should send: hair profile, current style, health profile, blood results, professional, hard-water postcode lookup, history (recent wash days, avoid/favourite ingredients, low/high-rated products), goals, shelf. Always pass the result of `buildAiContext()` as the `context` field when invoking an AI edge function.

In `supabase/config.toml`, only `journal-encouragement` is configured with `verify_jwt = false`. Other functions require an authenticated caller.

### UI / styling
- **shadcn/ui** in `src/components/ui/` (slate base, Tailwind variables). Configured via `components.json`. Path aliases: `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`.
- Tailwind config (`tailwind.config.ts`) extends shadcn defaults with STRAND-specific tokens:
  - Colors: `good`, `warn`, `alert-dark` (HSL via CSS vars in `src/index.css`) — used for product flag chips.
  - Fonts: `font-display` (Playfair Display, serif) and `font-body` (Jost, sans-serif).
  - `rounded-pill` (50px) for the iOS-style pill buttons.
- Design tokens live as HSL CSS variables in `src/index.css` (warm sand background, gold primary, etc.). Always use `hsl(var(--token))` — never hardcoded colors.
- Path alias `@/` → `src/` (Vite + tsconfig). `react`, `react-dom`, and `@tanstack/react-query` are deduped in `vite.config.ts` to prevent multi-instance bugs.

### PDFs and image prep
- `src/lib/ingredientReportPdf.ts` and `src/lib/profilePdf.ts` build client-side PDFs with `jspdf` (sample outputs are checked in at the repo root for design reference).
- `src/lib/imagePrep.ts` handles HEIC→JPEG conversion (`heic-to`) for iPhone product photos before upload to Supabase storage.

## Conventions

- Path imports use `@/...` — don't introduce relative `../../..` chains.
- Components are functional with TypeScript prop interfaces. Default-export single-component files.
- `useAuth` is the only React context — everything else flows through React Query hooks. New server-data features should follow the pattern in existing `src/hooks/use*.ts` (queryKey scoped by user id, mutations invalidate the relevant key).
- Edge functions are Deno (`Deno.serve`, ESM imports from `esm.sh`) — not Node. They share a CORS helper imported from `@supabase/supabase-js@2.95.0/cors`.
- Migrations are added via Lovable tooling and follow the timestamp naming convention already in `supabase/migrations/`. Don't rewrite history.

## STANDING STANDARD — verdict cards and glossary linking (2026-08-29, permanent)

This is the default shape of **every** product/tool analysis card, not a one-off design. Do not regress it.

1. **Ranked verdict rationale.** `score_reasons` renders through `src/components/product/ScoreReasons.tsx` as numbered ranked callouts ("Why it scored this high/low" — `scoreReasonsHeading(score)`), strongest driver first. Each row = the concrete ingredient/formulation property (`factor`) plus a **mechanism-to-profile** reason: what the ingredient physically does, then the member's own named characteristic, goal or flagged marker it lands on. Thin, generic template bullets ("gentle formula — good for your hair") are not acceptable output; the prompt contract lives in `supabase/functions/_shared/score-reasons.ts` and is shared by every analysis function.
2. **Every technical term is bold + tappable, every time, no exceptions.** In all member-facing analysis text — verdict summary, score reasons, guidance prose — ingredient names ("Decyl glucoside"), ingredient families ("surfactants", "humectants") AND hair-science concepts ("cuticle", "high porosity", "elasticity", "sebum") must render bold and open the shared glossary explainer sheet. Render prose with `GlossaryRichText` (`src/components/ingredients/GlossaryRichText.tsx`) or `ProseText`/`useSmartInline`; never emit raw AI prose into a bare `<span>`/`<p>`.
3. **Closed vocabulary still applies.** A term is only emphasised/linked when it resolves to an existing `glossary_terms` row (kinds: `molecule`, `class`, `concept`). Definitions are never invented at render time — the explainer generates them from Paige's manuscript via `ingredient-explainer`. Matching logic is centralised in `src/lib/glossarySpans.ts` (first occurrence only, plural tolerant, longest match wins).
4. When you add a new AI surface that shows hair/scalp/ingredient copy, wire it to `GlossaryRichText` in the same change, and bump the surface's `MODEL_VERSION` when the reasoning contract changes so stale thin copy regenerates.

## STANDING DESIGN RULE — titles are never truncated (2026-08-28, permanent)

Product, tool, brand, offer and content titles are **never** truncated, line-clamped, character-capped or shown with an ellipsis anywhere in the app — on cards, thumbnails, list rows, pickers, sheets, previews or the passport. The full title must always be visible, wrapping onto as many lines as it needs.

- Use `break-words` (plus `[overflow-wrap:anywhere]` for long unbroken strings) on title elements. Never `truncate`, `text-ellipsis`, `line-clamp-*`, `whitespace-nowrap` or `max-w-[Npx]` on a title.
- Titles include the item's own name *and* its brand/attribution line.
- Layout must adapt to the title, not the reverse: keep the text column `min-w-0 flex-1` and let the row grow taller. Do not reintroduce a clamp to "keep cards even height".
- Clamping remains fine for genuine body copy (descriptions, forum post bodies, notes) — never for names.

## STANDING RULE — one content-integrity guardrail for all generated text (2026-08-28, permanent)

Every function that produces text a member reads routes through **`supabase/functions/_shared/content-integrity.ts`**. It is the single place three checks live, and they are identical on every surface:

1. **Closed vocabulary.** Hair/scalp/scientific terminology must come from the approved list built from Paige's manuscript plus established science (`_shared/hair-vocabulary.ts`). Invented compound terms and domain-crossed terms ("high porosity scalp") are rejections, not stylistic quibbles.
2. **Source lockdown.** An ingredient may only be named if it is in the verified list held for that product (`_shared/ingredient-name-lock.ts` — an empty list forbids naming any ingredient). A technique specific (wet/dry, amount, timing, tool, frequency, temperature, rinse) may only be stated if it appears in real manufacturer directions (`_shared/usage-grounding.ts`); otherwise it must be framed explicitly as general guidance with no product-specific claim.
3. **Nullable by default.** Every descriptive field is nullable and **"not established" is a correct, expected answer** — never an error state. When held data does not support a claim, the field is nulled and the rest is served.

Enforcement points:

- `sanitiseAndLog` (`_shared/citation-log.ts`) applies the guardrail on the single path every generation already goes through, so a new surface is covered the moment it uses the standard sanitiser. Pass `allowedIngredients` / `ingredientVocabulary` / `directions` whenever the surface has product source data, or the source-lockdown checks cannot run.
- Analysis surfaces additionally call `enforceAnalysisFailsafes`, which now delegates its vocabulary and name-lock checks to the same module.
- Functions running their own reject-and-retry loop call `checkContentIntegrity` (pure, synchronous) inside the loop, then `logContentIntegrityRejections` on the final attempt.
- Use `contentIntegrityBlock()` in the prompt so the model is told the rules it will be validated against.

Every rejection is written to **`public.ai_content_rejections`** (admin-readable) with the function, surface, check, field, offending phrase, rule and whether the output was re-asked (`rejected`) or served without the field (`field_nulled`) — one place Paige can review what the models tried to say.

`src/test/content_integrity.test.ts` enumerates the generation functions and fails if one bypasses the guardrail or re-implements a check locally. Do not weaken it to make a new function pass.

## STANDING RULE — analysis regeneration goes through ONE gate (2026-08-28, permanent)

Opening a product page must never spend a model call when a valid stored analysis exists for the member's current profile fingerprint. The decision lives in **`src/lib/analysisGate.ts`** (`decideProductAnalysis`), is pure, and can only return `generate` for one of exactly three reasons: `no_stored_analysis`, `profile_changed`, `ingredients_changed`. `member_requested` comes only from a tap on Re-analyse/Retry.

- Every mount-time analysis path calls the gate and passes its `trigger` into the edge function; `assertAnalysisTrigger` throws if a call site reaches an invocation without one.
- Guidance level is NOT part of the invalidation contract: a level change reads another level's stored payload (or lets the function downshift it), never a fresh generation.
- An unknown *current* fingerprint is never treated as a change — only a known-vs-known mismatch invalidates.
- Do not reintroduce a blanket kill switch (the old `DEMO_SAFE_MODE`); it also suppressed the two legitimate generation cases.
- `src/test/analysis_no_reanalyse.test.ts` asserts the invariant and statically checks that no product surface bypasses the gate. Do not weaken it to make a new surface pass.

## STANDING RULE — how-to-use personalisation picks the trait by mechanism (2026-08-28, permanent)

The "How to Use This For Your Hair" copy must select which stored profile trait to reason about from **this** product's real directions and ingredients — never a default trait, and never the trait used on the previous product. Anchoring on one trait (density, after a worked example named it) is a defect, not personalisation.

- The selection instruction, anti-anchoring rule and mechanism→trait routing hints live in `supabase/functions/_shared/usage-grounding.ts` (`usageGroundingBlock`). Any example sentence there must be depth guidance only: keep at least two examples, on different traits, and never one on density alone.
- `ingredient-analysis` passes `recentTraits` — the traits her other products' how-to-use copy already leaned on (`recentTraitUsage`/`detectNamedTraits`) — so the prompt is told what it has already over-used and must justify reusing it.
- Different products should genuinely surface different traits: scalp products reason about scalp access/style, leave-ins about porosity/moisture retention, heat products about heat and elasticity/protein history, oils and butters about strand diameter and weigh-down. These are reasoning prompts, not a lookup table.
- `src/test/usage_trait_anchoring.test.ts` guards the prompt text and trait detection.

## STANDING RULE — relationship validation is the third guardrail (2026-08-29, permanent)

The vocabulary lockdown and the source lockdown police **nouns**. They do not catch an invented **relationship** between two real, approved nouns — the app shipped "high porosity hair loses oil fast", where every term is approved and the mechanism is false and contradicts the manuscript.

- The ground truth lives in **`supabase/functions/_shared/relationships.ts`**: `CONCEPTS` (each tagged `strand` / `scalp` / `substance` / `measure`), `APPROVED_RELATIONSHIPS`, and `FORBIDDEN_RELATIONSHIPS` (each with its own deterministic detector and its manuscript citation). The same rows are mirrored into the queryable reference tables `public.hair_concepts` and `public.hair_relationships`.
- Validation runs inside `checkContentIntegrity` as the `relationship_integrity` check, so **every** surface that already has the closed-vocabulary check gets it with no per-function work, and rejections log to `public.ai_content_rejections` alongside the others. Outcome is the same: reject-and-regenerate inside a retry loop, or null the field.
- Hard invariants: strand properties (porosity, density, elasticity) never connect to oil, sebum or a scalp condition; only water gives moisture (oils/butters/emollients slow its loss); humectants attract from the atmosphere while emollients lock in what is already there; silicones and preservatives are never framed as inherently bad; no topical product stimulates growth or reaches the follicle unless genuinely medicinal.
- Extending the library is a data change, not a code change: add the concept + the approved relationships + the forbidden ones with detectors, re-seed the two tables, and add a case to `src/test/relationship_integrity.test.ts`. Never widen a detector to make a generation pass.

## STANDING RULE — areas of concern are a first-class scoring input (2026-08-30, permanent)

`hairProfile.areas_of_concern` (edges, hairline, temples, crown, nape, parting, thinning) is weighted as strongly as the written goal and challenge. A formula whose mechanism is root anchoring, follicle-level support, shedding reduction, density/regrowth support or scalp condition is directly relevant to those areas and must score as a **plus** — never "targets X rather than her Y", never a warn/avoid ingredient flag.

- Deterministic enforcement lives in `supabase/functions/_shared/concern-fit.ts` (`applyConcernFit`), run inside `enforceAnalysisFailsafes` for every analysis surface and directly in `ingredient-analysis`. Callers must pass `areasOfConcern` and re-assign the returned `cards`.
- The prompt contract is `CONCERN_FIT_RULES`, appended to `ANALYSIS_FAILSAFE_RULES`, so it reaches every analysis prompt at once.
- Relevance framing in any phrasing ("targets … not …", "rather than", "instead of") is never score-worthy — it becomes a Strand Tip (`minusIsScoreWorthy`).
- `src/test/concern_fit.test.ts` guards the K18 regression (score 52 → 88). Do not weaken it.
- `user_products.marketed_purpose` is a dead column — the marketed-purpose feature was removed and nothing writes it. Null is correct.

## STANDING RULE — challenges are always an analysis input, and concern fit is proportional (2026-08-30, permanent)

`user_goals.challenges` (Breakage, Dryness, Shedding, Build-up, Frizz, Heat damage, scalp issues) is a first-class scoring input **alongside** `hairProfile.areas_of_concern` and the written goal. A member can hold both a challenge and a concern; neither cancels the other and a correct analysis addresses both. Every analysis surface passes `challenges` into `enforceAnalysisFailsafes` / `applyConcernFit` — a surface that omits it is a defect.

- The concern/challenge lift is **proportional**, never a flat floor: `concernContribution` (`_shared/concern-fit.ts`) weights it by how central the matching mechanism is to the formula (named headline active 1.0 → unnamed headline active 0.7 → support-cast/trace 0.4) times how many of her recorded signals it serves, then adds supportive pluses and subtracts genuine conflicts. Bonus is capped at 30 and the score never exceeds 95. Do not reintroduce the old 80/85 floor.
- **Hero actives lead the verdict.** `rankScoreReasons` orders pluses so the actives a formula is built around outrank humectants, preservatives, pH adjusters and emulsifiers, and `heroActiveOmissions` re-asks the model when the verified INCI list holds a headline active that no reason names. A verdict built on glycerin while the peptide system goes unmentioned is a failed answer.
- **Ingredient cards must state a mechanism and a site of action.** `_shared/mechanism-specificity.ts` rejects generic category filler ("a peptide-derived conditioning agent") inside the retry loop. Watch the interaction with `relationship_integrity`: a peptide's real root/emerging-strand mechanism is legitimate and must not be phrased as a growth or follicle-penetration claim, or the guardrail rejects it and the model falls back to filler.
- **Routine functional ingredients are not warnings.** `_shared/benign-flags.ts` deterministically downgrades warn/avoid flags on preservatives, pH adjusters, buffers, chelators, emulsifiers, colourants and fragrance unless the member has a declared sensitivity or documented avoid entry. Only a declared sensitivity or a genuine safety issue may read as a caution.
- Tests: `src/test/concern_fit.test.ts` and `src/test/concern_fit_proportional.test.ts`. Do not weaken them to make a generation pass.
