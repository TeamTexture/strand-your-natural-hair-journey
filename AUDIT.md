# STRAND Build Audit

**Date:** 2026-04-26
**Scope:** Forensic read of `/Users/paigelewin/Documents/Projects/strand-your-natural-hair-journey` — all migrations, edge functions, hooks, pages, and config. No code changed.

**Headline:** The app is more complete than a typical Lovable scaffold — RLS is real, alerts are wired to live data, the AI surface is broad and personalised. But three things stand out as risks for a clinical product:

1. **Hair characteristics, "colour & style" choices, and the user's chosen professional never reach the database** — they live only in `localStorage` (loss on cache clear, no cross-device, never reaches AI context for non-localStorage callers).
2. **Clinical data is in plaintext `localStorage`** (blood values, medications, scalp conditions) — XSS-exposed.
3. **Every AI feature is locked to Lovable AI Gateway + Gemini**, with the STRAND persona prompt copy-pasted across 9 edge functions. Migration to direct Anthropic is mechanical but touches every function.

The rest of this document is the evidence.

---

## 1. AI Surface Area

All AI calls go from the React client → a Supabase edge function → **Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1/chat/completions`) using `LOVABLE_API_KEY`. There is **no direct Anthropic, OpenAI, or other-provider integration anywhere in the codebase**. Models are Google Gemini 2.5 (flash for most, pro for blood summary).

| # | Edge function (`supabase/functions/<name>/index.ts`) | Feature | Model | Client call site |
|---|---|---|---|---|
| 1 | `blood-ai-summary` | Blood-test results → personalised hair-health summary (deficiencies, urgency, priority actions) | `gemini-2.5-pro` | `src/pages/onboarding/BloodAiSummary.tsx` |
| 2 | `heat-treatment-rationale` | Wash-day step 1 → 1 headline + ≤3 reasons for/against heat | `gemini-2.5-flash` | `src/pages/wash/WashStep1.tsx` |
| 3 | `ingredient-analysis` | Product/ingredient list → match score 0–100, per-ingredient `good/warn/avoid` flag, summary | `gemini-2.5-flash` | `ProductProfile.tsx`, `ProductDetailNew.tsx`, `IngredientDetail.tsx` |
| 4 | `journal-encouragement` | Journal banner copy (headline + subline) from engagement signals | `gemini-2.5-flash` | `src/hooks/useJournalEncouragement.ts` |
| 5 | `nutrition-plan` | Diet + supplements + foods-to-avoid plan from blood results, meds, heritage | `gemini-2.5-flash` | `src/pages/NutritionPlan.tsx` |
| 6 | `product-analyse` | Product photo → brand, ingredients, key flags, match score, use cases | `gemini-2.5-flash` (vision) | `src/pages/ProductScanning.tsx` |
| 7 | `product-analyse-url` | Product page URL → same schema as photo flow (Firecrawl optional, plain fetch fallback) | `gemini-2.5-flash` | `src/hooks/useProductUrlScan.ts` |
| 8 | `tool-analyse-url` | Hair-tool page URL → simpler schema (no ingredients) | `gemini-2.5-flash` | `src/components/MyToolsSection.tsx` |
| 9 | `transcribe-audio` | Voicenote audio → transcript text | `gemini-2.5-flash` (audio) | `src/components/VoiceNoteField.tsx` |
| 10 | `wash-day-observation` | Wash-day log → 2–3 sentence personalised observation | `gemini-2.5-flash` | `src/pages/wash/WashStep4.tsx` |

### Persona / system prompt
The STRAND persona ("you are Paige Lewin… *How To Love Your Afro* is your only source of truth… append `Read more — How To Love Your Afro, Chapter [X]: …`…") is **duplicated verbatim in 9 of 10 functions** (only `transcribe-audio` doesn't carry it). Examples: `product-analyse/index.ts:13–41`, `blood-ai-summary/index.ts:86–114`, `nutrition-plan/index.ts:20–43`. There is no shared module.

### Context payload
`src/lib/aiContext.ts` builds the per-request context: hair profile, current style, health profile, blood results, professional, hard-water postcode, history (recent wash days, avoid/favourite ingredients, low/high-rated products), goals, shelf. Most call sites pass `await buildAiContext()` as the `context` field. Notable exceptions: `tool-analyse-url`, `transcribe-audio`, and `journal-encouragement` do **not** receive the full context object.

### Caching
Three functions persist results to the `ai_summaries` table (`{user_id, kind, payload, updated_at}`) and serve from cache unless `force: true`:
- `blood-ai-summary` — `kind = "blood_summary"` (`blood-ai-summary/index.ts:228–243`).
- `ingredient-analysis` — `kind = "ingredient_analysis:<productKey>"` (`ingredient-analysis/index.ts:301–319`).
- `nutrition-plan` — keyed by SHA-256 of the input (`nutrition-plan/index.ts:278–296`).

Other functions (`heat-treatment-rationale`, `wash-day-observation`, `journal-encouragement`, the product/tool URL scans, `product-analyse`) are computed every call.

### Auth / `verify_jwt`
- `supabase/config.toml` only contains: `[functions.journal-encouragement] verify_jwt = false`. All other functions inherit Supabase's default of `verify_jwt = true`, so the runtime rejects unauthenticated callers before the handler runs.
- `blood-ai-summary` and `nutrition-plan` additionally call `supabase.auth.getUser()` to bind the user to their cached row (`blood-ai-summary/index.ts:40–57`).
- The other functions trust the JWT gate but don't re-derive `user.id` themselves.

### Failure handling
- Standard pattern: 429 → "Try again shortly", 402 → "AI credits exhausted". No retry/backoff.
- `heat-treatment-rationale/index.ts:118–124` returns a **hardcoded fallback** (`headline: "Heat opens the cuticle…"`, two canned reasons) on any failure. This will silently mask AI outages.
- `nutrition-plan` has a 55-second `AbortController` (`nutrition-plan/index.ts:150`).
- `product-analyse-url` and `tool-analyse-url` silently degrade from Firecrawl → plain `fetch` if `FIRECRAWL_API_KEY` is missing — JS-rendered pages will fail in that mode.
- `ingredient-analysis/index.ts:174` enforces `EXACTLY ${ingredientCount}` entries in the response — fragile if the model returns fewer.

### Broken / unfinished
Nothing is outright broken or stubbed. The only "production: …" TODO is **not in an AI function** but in `ProDetails.tsx:36–37` (GMC registry lookup — see §3).

### Provider lock-in
Removing Lovable means rewriting all 10 functions. The Gateway-specific bits are: `Authorization: Bearer ${LOVABLE_API_KEY}`, the URL `ai.gateway.lovable.dev/v1/chat/completions`, the OpenAI-shaped `messages` payload (which Anthropic doesn't accept verbatim — system prompt is a top-level field, image/audio content blocks differ), and `response_format: { type: "json_object" }` / `tools` (Claude uses tool_use blocks with a different schema).

---

## 2. Data Model

### Tables (all in `public`, RLS enabled, all owned by `auth.uid() = user_id` unless noted)

`profiles`, `user_medications`, `blood_results`, `ai_summaries`, `user_products`, `user_product_photos`, `product_ratings`, `product_voicenotes`, `wash_days`, `journal_entries`, `user_goals`, `goal_updates`, `moodboards`, `moodboard_images`, `appointments`, `user_tools`, `ingredient_lists`, `professionals_directory` (publicly readable when `is_active = true`), `contact_messages` (write-only).

Type definitions are auto-generated in `src/integrations/supabase/types.ts` and match the migrations. Migrations live in `supabase/migrations/` and are dated 2026-04-24.

### Domain map

| Domain | Backing table(s) | Hook(s) | UI surface | Read+write status |
|---|---|---|---|---|
| **Auth profile** | `profiles` (display_name, avatar_url) | `useAuth` (`src/hooks/useAuth.tsx`) | Auth, ProfileStep1, Profile | Read+write OK |
| **Health profile** | `user_medications` only | none (page-level inserts) | ProfileStep2, Profile | Meds in DB. **All other health fields (life stage, contraception, conditions, diet, smoke, alcohol, water, exercise, sleep) live only in `localStorage["strand_health_profile"]`** |
| **Hair characteristics** | **none — DB has no hair_profile table or columns** | none | ProfileStep3Hair, Profile, IngredientDetail | **Written only to `localStorage["strand_hair_profile"]` at `ProfileStep3Hair.tsx:79–82`** |
| **Colour & style** | partial: `wash_days.heat_treatment` etc., but the colour/chemical-history/current-hairstyle answers from onboarding step 6… | none | ProfileStep4Colour, Home (banner), SetCurrentStyle | …go only to `localStorage["strand_current_style"]` (`ProfileStep4Colour.tsx:152–168`) |
| **Blood results** | `blood_results` | `useBloodValues` | BloodTiming → BloodIronVitamins / BloodMinerals / BloodThyroid / BloodHormones → BloodAiSummary; NutritionPlan; Profile | Buffered in `localStorage["strand_blood_values"]` during onboarding, then `persistBloodValues()` flushes to DB |
| **Blood AI summary** | `ai_summaries` (kind=`blood_summary`) | written by edge function | BloodAiSummary, NutritionPlan | OK |
| **Products** | `user_products`, `product_ratings`, `product_voicenotes`, `user_product_photos` | `useUserProducts`, `useProductPhotos`, `useIngredientLists` | Products, ProductScanning, ProductDetailNew, ProductProfile, ProductRepository, IngredientDetail | Read+write OK. `use_count` column **never incremented anywhere** (`grep` confirms only type definitions hit it) |
| **Wash days** | `wash_days` (JSONB `steps`, `ai_insight`, voice URL) | `useWashDays` | WashDayHub, WashDayDetail, WashStep1–4 | OK. `ai_insight` written at `WashStep4.tsx:172`. Realtime publication enabled |
| **Journal entries** | `journal_entries` | none (page-level) | Journal, JournalEntry | OK. Drag-drop photo reordering via `@dnd-kit` (`JournalEntry.tsx:838`) |
| **Goals** | `user_goals`, `goal_updates` | `useGoals` (goals); `GoalDetailSheet.tsx:62–132` (updates CRUD) | Profile, GoalDetailSheet, GoalEditorSheet | OK — goal_updates inserts confirmed at `GoalDetailSheet.tsx:102–111` |
| **Moodboards** | `moodboards`, `moodboard_images` | `useMoodboards`, `useMoodboardImages` | MoodboardList, MoodboardBoard | Upload + delete + favourite OK. **No drag/drop pin reordering, no Pinterest-style "save to board" from URLs** |
| **Appointments** | `appointments` | none (page-level) | Appointments, LogAppointment, Home alerts | OK |
| **Professionals directory** | `professionals_directory` (DB) **+** `src/data/professionals.ts` (256-line static seed of ~12 pros) | `useDirectoryProfessionals` | Directory, ProBook, ProDetails, LogAppointment | Hook merges DB rows into static list; richer record wins (`useDirectoryProfessionals.ts:73–92`) |
| **User tools** | `user_tools` | `useUserTools` | MyToolsSection, Tools | OK; `use_count` defined, never incremented |
| **Ingredient lists** | `ingredient_lists` (avoid + favourite) | `useIngredientLists` | Avoidlist, IngredientDetail | Auto-built from `product_ratings` (1–2★ → avoid, 4–5★ → favourite). |
| **Contact messages** | `contact_messages` | none | Contact | INSERT-only by design (`migration 20260424150851 :17–25`) |
| **Heritage / postcode / age** | `profiles`? Not stored as columns | none | ProfileStep1, Profile | Written to `localStorage["strand_profile_step1"]` and `strand_profile_basic`. Display name + avatar reach `profiles`; the rest does not |

### Drift — defined-but-not-stored

Six pieces of onboarding data never reach the database:

| What | Captured at | Persisted only to |
|---|---|---|
| Hair diameter, surface texture, density, porosity, elasticity, scalp condition, diagnosed conditions, areas of concern | `ProfileStep3Hair.tsx` | `localStorage["strand_hair_profile"]` |
| Current colour, chemical history, current hairstyle, days-in-style, plans-to-change, default styles | `ProfileStep4Colour.tsx` | `localStorage["strand_current_style"]` |
| Heritage (e.g. "Caribbean, West African") | `ProfileStep1.tsx` | `localStorage["strand_heritage"]` |
| Age, postcode | `ProfileStep1.tsx` | `localStorage["strand_profile_step1"]` |
| Health profile fields beyond medications (conditions, diet, water source, sleep, exercise, etc.) | `ProfileStep2.tsx` | `localStorage["strand_health_profile"]` |
| Chosen professional (name, type, GMC/IOT, clinic, consultation date, consultation notes + audio) | `ProDetails.tsx:386–399` | `localStorage["strand_professional"]` |

Consequences:
- Cache clear / new device = clinical onboarding data is gone.
- Two AI functions that don't pass `buildAiContext()` (`tool-analyse-url`, `transcribe-audio`, `journal-encouragement`) cannot personalise on these fields anyway. The other functions get them through `buildAiContext()` because that builder reads localStorage.
- The Profile PDF export (`Profile.tsx:323–352`) reads from localStorage too — it works on the device that did the onboarding, but won't work cross-device.

### Drift — defined-but-unused

- `src/data/medications.ts` and `src/data/heritage.ts` exist but are not imported anywhere in `src/`.
- `src/data/journalEntries.ts` is referenced only as a type/re-export — actual journal data is in the DB.

### Drift — referenced-in-UI-but-missing-in-DB

None. Every `supabase.from('…')` call resolves to a real table.

### Static reference data (appropriate to keep client-side)

`src/data/bloodRanges.ts` (clinical reference ranges), `src/data/countries.ts`, `src/data/hardWaterPostcodes.ts` (UK postcode → hard-water lookup). All actively used.

### Storage buckets

`avatars`, `product-photos`, `journal-photos`, `moodboard-images`, `voicenotes`. All private. All scoped by `auth.uid()::text = (storage.foldername(name))[1]`. The `voicenotes` bucket was created public in migration `20260424143018` and patched to private in `20260424143319` (3 minutes later). If that window saw any production traffic, those uploads may have been world-readable; otherwise the patch is fine.

---

## 3. Feature Completeness

| Feature | Status | Notes |
|---|---|---|
| **Verified onboarding** — about you (ProfileStep1) | **Built** | Display name, heritage, country, postcode, age, avatar. Display name + avatar persist to `profiles`; rest is localStorage-only |
| Onboarding — health profile (ProfileStep2) | **Partial** | Medications persist to `user_medications`. Conditions / diet / water source / sleep / exercise / smoke / alcohol etc. are localStorage-only |
| Onboarding — professional gate (ProGate, ProBook, ProDetails) | **Partial** | The professional picker, the 90-day consultation freshness check (`ProDetails.tsx:155–177`), and the format checks for GMC (7 digits) and IOT (4–6 digits) all work. But: **there is no GMC/IOT registry call** — the comment at `ProDetails.tsx:36–37` says "PRODUCTION: call GMC public Doctor Search API" and currently nothing happens beyond regex. The chosen pro is also localStorage-only (see §2 drift) |
| Onboarding — hair characteristics (ProfileStep3Hair, ProfileStep4Colour) | **Partial** | UI complete; data not persisted to DB |
| Onboarding — blood results (BloodTiming + 4 marker pages) | **Built** | Iron/vitamins, minerals, thyroid, hormones — all persist via `useBloodValues.persistBloodValues()` |
| **Blood AI Summary** | **Built** | `gemini-2.5-pro`, cached to `ai_summaries`, force-refresh supported |
| **Home Dashboard with live alerts** | **Built** | `useHomeAlerts.ts` — 12+ alert categories driven by real signals (wash overdue, blood retest due 85d, professional rebook 170d, breakage from wash logs, hard-water + no clarifier on shelf, avoid-list ingredients on shelf, low-rated products on shelf, goals overdue, upcoming appointments). Dismissal persisted with content-hash signatures. Not hardcoded |
| **Wash Day — monthly calendar** | **Built** | `WashDayHub.tsx` calendar with logged-day highlights and month nav |
| Wash Day — 4-step logging | **Built** | WashStep1 (heat-treatment rationale AI) → 2 → 3 (notes + voicenote) → 4 (results, then `wash-day-observation` AI on save) |
| Wash Day — AI observation persisted | **Built** | `WashStep4.tsx:106` invokes the function; `:172` writes `ai_insight` back to `wash_days` |
| **Products — photo capture + AI scan** | **Built** | `ProductScanning.tsx` → `useProductScan` → `product-analyse`. iPhone HEIC handled by `src/lib/imagePrep.ts` |
| Products — URL paste flow | **Built** | `useProductUrlScan` → `product-analyse-url` (Firecrawl optional) |
| Products — personalised match score | **Built** | Per-ingredient `good/warn/avoid` flag rules in `product-analyse/index.ts:52–56`, score combines avoid/good flags + history |
| Products — repository | **Built** | `ProductRepository.tsx` plus `Products.tsx`, `Wishlist`, `OffShelf`, `Avoidlist` |
| Products — frequency / `use_count` tracking | **Missing** | Column exists in `user_products` and `user_tools`. Read by hooks. **Never incremented** anywhere in the codebase |
| **Avoid List + Favourites auto-built** | **Built** | Driven by `product_ratings` thresholds inside `useIngredientLists` |
| **Personalised Nutrition Plan** | **Built** | `gemini-2.5-flash`, signature-cached. Returns summary, diet items (emoji + name + body), avoid items (with severity). Whether "interactions" specifically are surfaced depends on what the model returns inside `avoid` — there is no separate interactions field in the schema |
| **Hair Journal — entries** | **Built** | CRUD + multi-photo galleries with `@dnd-kit` reordering |
| Hair Journal — Goals | **Built** | `useGoals` + `goal_updates` posts (text + voicenote) at `GoalDetailSheet.tsx:102–111` |
| Hair Journal — Moodboards | **Partial** | Create/rename/delete boards, upload images, mark favourite, signed-URL display, share board link. **No URL-pinning, no drag-drop reordering, no Pinterest-style "save to board" extension.** Drag-drop in the codebase is on Journal photos only |
| **Professional Directory + booking** | **Partial** | Directory list reads from `professionals_directory` merged with `src/data/professionals.ts` (256-line static seed). Booking is an outbound link (`bookingUrl`/`website_url`) opened in a new tab — no in-app scheduling. No verification call against GMC/IOT (see ProDetails note above) |
| **Appointments log** | **Built** | `LogAppointment.tsx` insert, `Appointments.tsx` list, surfaced in Home alerts |
| **Profile PDF export** | **Built** | `src/lib/profilePdf.ts` (178 lines, `jspdf`). Wired at `Profile.tsx:323–352` (`handleExportPdf`). Includes display name, age, postcode, water hardness, hair profile, flagged blood markers + summary, medications. Reads source data from localStorage and the `ai_summaries`/`blood_results` tables |
| **Instagram share flow** | **Built** | `src/components/ShareSheet.tsx` opens deep links (`instagram://library?AssetPath=`, TikTok, YouTube), copies caption, downloads photo. Used from journal entries, product photos, etc. |

---

## 4. Auth and Security

### Auth flow
- Supabase email + password only (`src/pages/Auth.tsx`). **No** magic link, **no** OAuth, **no** email-verification gate (the user can sign in immediately after signup), **no** password reset UI, **no** in-app account/data deletion.
- Session persisted in `localStorage`, auto-refresh on (`src/integrations/supabase/client.ts:11–17`).
- `<RequireAuth>` (`src/components/RequireAuth.tsx`) gates all protected routes; while loading it renders `<LoadingDot />` not the splash; on no-user it redirects to `/?next=<encoded-path>`.
- `safeNext()` in `Auth.tsx:15–20` blocks open-redirect via `//evil.com` style URLs.
- `Index.tsx` short-circuits authed users to `/home`.
- Routing review against `src/App.tsx`: every authenticated route is wrapped in `<Protected>`. `/`, `/auth`, and `*` (NotFound) are public — correct.

### Row-Level Security
Every clinical and user-owned table has RLS enabled with the standard `auth.uid() = user_id` policy for all four CRUD verbs:
`profiles`, `user_medications`, `blood_results`, `ai_summaries`, `user_products`, `user_product_photos`, `product_ratings`, `product_voicenotes`, `wash_days`, `journal_entries`, `user_goals`, `goal_updates`, `moodboards`, `moodboard_images`, `appointments`, `user_tools`, `ingredient_lists`.

Two intentional exceptions:
- `professionals_directory` — `SELECT ... USING (is_active = true)` (`migration 20260424141005:108`). Public-readable directory of vetted professionals; reasonable.
- `contact_messages` — INSERT-only with `WITH CHECK (true)`, no SELECT/UPDATE/DELETE policies (`migration 20260424150851:17–25`). Anyone (signed-in or not) can post; nobody can read from the app. Comment says "remain visible only via the Lovable Cloud database view." If the user includes clinical detail in a contact message, this is now exposed only to whoever has Lovable dashboard access.

### Storage
All five buckets (`avatars`, `product-photos`, `journal-photos`, `moodboard-images`, `voicenotes`) are private and folder-scoped to `auth.uid()`. The `voicenotes` bucket was briefly public during a 3-minute window between two migrations on 2026-04-24 — see §2.

### Encryption
- Postgres-at-rest is on by default in Supabase. Transport is TLS.
- **No application-layer encryption** of sensitive columns (blood values, medication list, scalp conditions). Defensible if you have a Supabase BAA/DPA covering clinical data; not defensible without one.
- **Plaintext clinical data in `localStorage`** is the bigger issue (see §2 drift). Anything in `strand_blood_values`, `strand_health_profile`, `strand_hair_profile`, `strand_heritage`, `strand_professional`, `strand_current_style` is readable by any script that lands in the same origin (XSS, malicious browser extension, shared device).

### Public endpoints / leaked secrets
- `.env` contains only the Supabase URL, project ID, and anon (publishable) JWT. All `VITE_*`-prefixed and safe to ship. Verified.
- `grep` for `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` across `src/` and `supabase/`: no matches. ✓
- Edge functions read `LOVABLE_API_KEY` from Deno env only — not exposed to client.
- `index.html` contains Lovable telemetry: `<meta name="author" content="Lovable">`, `<meta name="twitter:site" content="@Lovable">`, and an `og:image` URL on `pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/.../id-preview-c29107b4--…lovable.app-…`. Not a security leak, but it leaks "this app was built in Lovable" to anyone scraping social cards.

### CORS
All edge functions return `Access-Control-Allow-Origin: *`. They are POST-only and don't accept credentials cross-origin, so this is acceptable but lax. Locking to `https://strand.lovable.app` (or whatever the production origin will be) is cheap defense-in-depth.

### `verify_jwt = false` on `journal-encouragement`
The function only takes engagement signals (entry counts, days since last entry, lifecycle stage) and returns generic encouragement copy. It does not read or write the database. Reasonable to leave open, **but** an unauthenticated caller can drive the LOVABLE_API_KEY usage meter — i.e. a free DoS/cost-amplification vector. Add basic rate limiting before launch.

### Logging that touches clinical data
`blood-ai-summary/index.ts:198–249` uses `console.error("...", JSON.stringify(aiJson).slice(0, 500))` and similar. Supabase function logs land in the Lovable/Supabase dashboard; whoever has dashboard access can see truncated AI responses describing user blood markers and deficiencies. For a clinical product, this should be redacted to error class only.

### Input validation
Journal photo uploads validate type (`image/*` or `video/*` or HEIC) and size (≤8 MB images, ≤100 MB video) at `JournalEntry.tsx:516–591`. HEIC → JPEG conversion. Path uses UUIDs so traversal is not possible. `voicenotes` and `product-photos` flows do not appear to enforce a max-size check.

---

## 5. Tech Debt and Risks

**Lovable scaffolding still present.**
- `vite.config.ts:4,15` imports and activates `lovable-tagger` (dev-only).
- `index.html` carries Lovable og/twitter metadata and an r2.dev preview image (see §4).
- Generated-file banners on `src/integrations/supabase/client.ts:1` and `types.ts` — expected, fine.
- `package.json:2` is still `"name": "vite_react_shadcn_ts"` (Lovable's default scaffold name).
- README is `# Welcome to your Lovable project / TODO: Document your project here`.

**Persona prompt copy-pasted across 9 edge functions.** ~110 lines, repeated. Any voice change requires editing and redeploying 9 functions. There's no shared module under `supabase/functions/_shared/` (it doesn't exist).

**localStorage as a primary store for onboarding data.** §2 lists the six fields written only client-side. Beyond the data-loss and cross-device problems, this also means the AI gets a partial context object on a fresh device until the user re-does onboarding. The fix is: real columns/JSONB on `profiles` (or new tables) plus a one-time migration that flushes localStorage on first authed render.

**Duplicate product detail pages.** `src/pages/ProductDetailNew.tsx` (391 lines) and `src/pages/ProductProfile.tsx` (404 lines) both exist and are both routed (`App.tsx:112,114`). The first is the "scan/paste, not yet saved" flow; the second is the "view existing record" flow. Substantial logic overlap (ingredient panel, rating, save). Worth consolidating before adding more product features.

**No real test suite.** `src/test/example.test.ts` is `expect(true).toBe(true)`. Vitest is wired up; nothing uses it. For a clinical app, untested AI code paths and untested RLS-dependent CRUD is a serious gap.

**No request-level loading/error UX consistency.** The `useHomeAlerts` hook does silent error swallowing (per-query try/catch returns empty arrays — alerts just don't appear). Several pages use `toast.error` only. None of the AI calls have a retry button surfaced — failures show a toast and the user has to navigate away and back.

**`heat-treatment-rationale` hardcoded fallback.** Real-looking output that won't trigger any error UI when AI is down (`heat-treatment-rationale/index.ts:118–124`). Production users will silently see canned advice tagged as personalised.

**Static professionals list of ~12 entries** in `src/data/professionals.ts` (256 lines) is the source of truth, merged into the DB rows by `useDirectoryProfessionals.ts:73–92`. Every directory edit currently requires a code deploy. Should be DB-only.

**`use_count` defined, never written.** `user_products.use_count` and `user_tools.use_count` are read by the UI but no code path increments them. Either delete the column or wire it (e.g. on wash-day completion / from voicenote events).

**Magic numbers.** Alert thresholds in `useHomeAlerts.ts` (7 days wash, 42 days style, 85 days blood retest, 170 days pro rebook, 30-day wash consistency, etc.) are scattered as inline literals. They're commented at the top of the file, but a `lib/alertThresholds.ts` constants module would be a low-risk consolidation.

**Realtime subscription on `wash_days` only** (`migration 20260424180317`). Either extend or remove — current state suggests it's leftover from a planned but unimplemented feature.

**Dependencies.** `@dnd-kit` (3 packages) is only used in `JournalEntry.tsx`. `lovable-tagger` is dev-only. `next-themes` is installed but the app doesn't expose dark mode (verified by absence of `useTheme` calls outside ui kit). Worth a clean-up pass after the AI migration settles.

---

## 6. Recommended Order for Migrating Off Lovable AI → Anthropic Claude

The migration is mechanical (every function does the same shape: build payload → POST → parse JSON → return), but each function has its own quirks. Sequence by **user impact** (visibility of failure) and **technical risk** (image/audio, tool-calling, cache logic), not alphabetically.

### Step 0 — One-time foundation (do before any function migration)
1. **Create `supabase/functions/_shared/`** with: (a) `strand-persona.ts` exporting the system prompt as a single constant, (b) `claude.ts` with a typed Anthropic client wrapper (request, response, image/audio content-block construction, JSON-mode via tool_use), (c) `cors.ts`, (d) `errors.ts` mapping Anthropic 429/529/overloaded → user-friendly messages.
2. **Add `ANTHROPIC_API_KEY`** to Supabase function secrets. Keep `LOVABLE_API_KEY` set during the cutover so we can A/B.
3. **Add an env flag** like `STRAND_AI_PROVIDER=claude|lovable` read at the top of each function. Default `lovable` until each function's migration PR ships; flip per-function.
4. **Decide on a Claude model per call.** Suggested: `claude-opus-4-7` for the heavy reasoning calls (blood summary, nutrition plan), `claude-sonnet-4-6` for everything else, `claude-haiku-4-5` for the lightweight banner (`journal-encouragement`). Keep these in `_shared/strand-persona.ts` so they're swappable.
5. **Anthropic prompt caching** — the persona is ~3 KB and identical per request, so cache it. Put it in the `system` array with `cache_control: { type: "ephemeral" }`. This is a 5-minute TTL but in practice any active user will see cache hits across calls within a session, which is significant cost savings given the persona dominates the prompt.

Now the actual sequence:

### Step 1 — `ingredient-analysis` (highest impact, lowest risk)
Why first: it is the **most-called AI feature** (every ingredient drilldown, every saved product). It is text-only (no image/audio), uses tool-calling for structured output (clean to express in Claude), and already has cache infrastructure (`ai_summaries`) so a slow first call doesn't repeat. A regression here is also visually obvious — match score and per-ingredient flags are right there on the screen. Best place to learn the migration pattern.

### Step 2 — `product-analyse` (highest user-visible value, vision)
Why second: this is the **wow moment** for the app — point camera at bottle, get personalised feedback. It's image-input, JSON-output, and Anthropic vision is well-trodden. Do it after step 1 because (a) you'll have the shared client + persona module, and (b) the analysis schema is similar to ingredient-analysis. Validate against `STRAND-ingredient-report-Maya.pdf` and the other sample reports already checked in at the repo root.

### Step 3 — `product-analyse-url` and `tool-analyse-url` together
Why: shared structure (Firecrawl scrape → AI analyse), one is a strict subset of the other. Test plan is identical. While we're in here, fix the silent Firecrawl-missing fallback.

### Step 4 — `wash-day-observation` and `heat-treatment-rationale` together
Why: both fire from the wash-day flow, both small JSON outputs, both consumed inline. While migrating, kill the hardcoded fallback in `heat-treatment-rationale` — surface the real failure to the UI instead of fake personalised advice.

### Step 5 — `nutrition-plan`
Why later: it's heavy (multi-card output), uses signature-based caching, and has a 55-second timeout. Worth migrating once we're confident in the streaming/timeout patterns of the shared client.

### Step 6 — `blood-ai-summary`
Why last among the heavy calls: it's on `gemini-2.5-pro` today, so it's the most reasoning-intensive. It writes the canonical clinical summary that gets reused across Home alerts and the Profile PDF. We want our Claude prompt + tool schema to be solid before touching it. Plan a parallel-output A/B (run both, store both, eyeball diffs against ~10 real user blood profiles) before flipping the flag.

### Step 7 — `journal-encouragement`
Why low priority: small, low-stakes copy generation. It's also the only `verify_jwt = false` function — the migration PR is a good moment to add basic rate limiting (per IP / per anonymous-token) so an open endpoint can't run up the Anthropic bill.

### Step 8 — `transcribe-audio`
Why separate: **Anthropic does not currently offer first-party audio transcription** in the messages API. Options are (a) keep this on Gemini even after migrating everything else (acceptable — it's a transcription utility, not a place where the STRAND voice matters), (b) move it to OpenAI Whisper or Deepgram, (c) move it to AssemblyAI. I'd recommend (a) short-term and (b) long-term once the rest of the migration ships and the `LOVABLE_API_KEY` is otherwise unused.

### Cross-cutting cleanup that should happen during the migration (not after)
- **Pass `buildAiContext()` everywhere.** `tool-analyse-url` and `journal-encouragement` currently don't get it. While we're rewriting payloads, fix that — anchoring the Claude system prompt in *How To Love Your Afro* without per-user clinical context defeats the point.
- **Persist hair characteristics, colour & style, full health profile, and chosen professional to the database** as part of the migration foundation. Right now the AI gets these via localStorage-reading `aiContext.ts`, which is the only reason migration produces sensible results on the *current* device. As soon as a user opens STRAND on a second device, the AI loses everything. Fix this before migration so the "Claude-powered" launch isn't built on the same fragile foundation.
- **Centralise the persona** in `_shared/strand-persona.ts` (step 0). Every subsequent migration touches one fewer file.
- **Add 1–2 integration tests per migrated function** under `supabase/functions/<name>/__tests__/`. They don't need to call live Claude — fixture in/out is fine. This is the cheapest place in the codebase to start fixing the test gap.

### What NOT to do during this migration
- Don't refactor `ProductDetailNew` vs `ProductProfile` at the same time — orthogonal work, separate PR.
- Don't try to fix the localStorage→DB drift atomically in one big migration. Do it as a sequenced series: schema first, dual-write, then read from DB, then delete localStorage writes.
- Don't add new AI features mid-migration. Finish the cutover, then build.
