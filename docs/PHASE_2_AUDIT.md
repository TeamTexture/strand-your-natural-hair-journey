# Phase 2 Audit — Anthropic Claude migration

**Date:** 2026-04-26
**Scope:** Move the 10 AI edge functions off Lovable AI Gateway (Gemini 2.5 flash/pro) onto direct Anthropic Claude API. Architecture: hybrid retrieval — hand-curated structured knowledge base for high-frequency topics + RAG over the full *How To Love Your Afro* manuscript for the long tail. Both feed Claude alongside the per-user clinical context already produced by Phase 1.

**Source:** `AUDIT.md` (forensic read), `docs/PHASE_1_PLAN.md` (foundation), `docs/KNOWN_ISSUES.md`, all 10 `supabase/functions/*/index.ts` files, `src/lib/aiContext.ts`, `src/lib/clinicalContext.ts`. Read first-hand, not from memory.

**Persona note:** the canonical Paige system prompt is locked and will be provided at build time. This audit refers to it as `STRAND_PERSONA` and proposes its destination (`_shared/strand-persona.ts`); it does not improvise the text.

---

## 1. AI surface — per-function inventory

For each edge function: current model, schema, call sites, personalisation depth, and what changes in a Claude rewrite.

### 1.1 `blood-ai-summary` *(heaviest reasoning)*
- **Model:** `google/gemini-2.5-pro` — only function on Pro.
- **Input:** `{ bloodResults: BloodMarker[], hairProfile, healthProfile, heritage, force, context }`
- **Output (tool_use → `return_summary`):** `{ deficiencies: { marker, value, status: low|high|borderline, hair_impact, urgency }[], overall_summary: string, priority_actions: string[3] }`
- **Caching:** `ai_summaries` row, `kind = "blood_summary"`. Force-refresh via `force: true`.
- **Auth:** JWT-gated (default) + explicit `getUser()` for `user_id` binding.
- **Call site:** `src/pages/onboarding/BloodAiSummary.tsx`. Receives `buildAiContext()`. Client also stores a fingerprint in `localStorage["strand_blood_summary_fp"]` to detect input changes and force regeneration.
- **Personalisation depth:** **full** — bloodResults + hair + health + heritage + meds + flagged-marker picture. Critical-coverage rule in the prompt forces every flagged marker into `deficiencies`.
- **Claude rewrite:**
  - Model: `claude-opus-4-7` (matches Pro-tier reasoning load).
  - Structured output: keep tool_use shape, port `return_summary` schema verbatim.
  - **High-value RAG target.** The summary should retrieve manuscript passages on iron / ferritin / shedding / vitamin D / thyroid / hormones based on which markers flagged.
  - **Curated KB:** topics 5–8 from §2 below.
  - Prompt caching: persona + KB topics ephemeral-cached (warm hits during a session).

### 1.2 `ingredient-analysis` *(highest call frequency)*
- **Model:** `google/gemini-2.5-flash`. Tool calling.
- **Input:** `{ productKey, productName, productBrand, ingredients?, hairProfile, healthProfile, heritage, goals?, currentStyle?, challenges?, force, context }`
- **Output (tool_use → `return_analysis`):** `{ match_score: 0–100, summary: string, ingredients: { name, tone: good|warn|bad, body }[] }`
- **Server-side personalisation pulls:** `blood_results`, `user_medications`, `user_goals` (incomplete only).
- **Caching:** `ai_summaries`, `kind = "ingredient_analysis:<productKey>"`.
- **Call sites:** `IngredientDetail.tsx`, `ProductProfile.tsx`, `ProductDetailNew.tsx`. Receives `buildAiContext()`.
- **Fragility:** prompt enforces `EXACTLY ${ingredientCount}` entries — Claude should respect this via the tool schema's `minItems`/`maxItems` set to the same value at request time.
- **Claude rewrite:**
  - Model: `claude-sonnet-4-6` (text-only, structured output, high volume — Sonnet is the right tier).
  - Tool schema: port directly. Add `minItems: ingredientCount, maxItems: ingredientCount` so Claude is guided to the exact length without a brittle prompt.
  - **RAG:** yes when `ingredients[]` includes uncommon items; skip when the list is plain water/glycerin/etc. Heuristic: do RAG if any ingredient appears in the user's avoid list OR matches a known active (peptides, exotic surfactants, etc.).
  - **Curated KB:** topics 1, 3, 4, 9 (porosity, scalp, conditions, hard water).

### 1.3 `nutrition-plan` *(deepest personalisation, longest output)*
- **Model:** `google/gemini-2.5-flash`. Tool calling. 55-second `AbortController` timeout.
- **Input:** `{ force, context, diet, alcohol, flaggedMarkers }`
- **Output (tool_use → `return_nutrition_plan`):** `{ summary, diet: Card[6..10], avoid: Card[4..6] }` where `Card = { emoji, name, body, severity? }`.
- **Caching:** `ai_summaries`, `kind = "nutrition_plan"`. Signature-based — SHA-256 of `{diet, alcohol, flaggedMarkers, blood, hair, health, goals}`. Cache hit only if signature unchanged.
- **Call site:** `src/pages/NutritionPlan.tsx`. Receives `buildAiContext()`.
- **Personalisation depth:** **the deepest** — heritage-aware foods, life-stage adjustments, medication interactions (metformin/B12, PPIs/iron, OCP/B6/folate/zinc), blood-marker-driven supplement targeting, dietary-pattern adaptation. Any generic output is a regression.
- **Claude rewrite:**
  - Model: `claude-opus-4-7` (matches breadth + clinical reasoning).
  - Tool schema: port. Keep the `_sig` and `_generated_at` decoration on the cached payload.
  - Drop the AbortController workaround — Anthropic's standard request timeout is sufficient for Opus's reasoning budget.
  - **High-value RAG target.** Build the embedding query from flagged markers + diet pattern + heritage + life stage. Top-K = 6 (richer than other functions because the output is longer).
  - **Curated KB:** topics 5, 6, 7, 8, 12 (iron / vits-mins / thyroid / hormones / heritage).

### 1.4 `product-analyse` *(image input)*
- **Model:** `google/gemini-2.5-flash` with `image_url` content block. `response_format: { type: "json_object" }`.
- **Input:** `{ image_url: string, context }` (data URL or signed storage URL).
- **Output (JSON):** `{ product_name, brand, category, ingredients: string[], key_ingredients: { name, benefit, flag, reason }[], match_score, ai_summary, usage_instructions, use_cases: string[], tips: string[] }`.
- **Caching:** none (every photo gets a fresh analysis).
- **Call site:** `src/pages/ProductScanning.tsx` via `useProductScan`. Receives `buildAiContext()`.
- **Claude rewrite:**
  - Model: `claude-sonnet-4-6` (vision-capable, structured output, Sonnet's vision quality is on par with Opus for label reading).
  - **Vision content blocks:** Anthropic uses `{ type: "image", source: { type: "base64"|"url", ... } }`. Convert.
  - **JSON-mode → tool_use.** Anthropic has no `response_format: json_object`; use a `return_product_analysis` tool with the schema above.
  - **No RAG** — image-driven, label-bound. Curated KB: topics 1, 3, 4 (porosity, scalp, diagnosed conditions) is enough.
  - Validate against the four sample reports already checked in at the repo root (`STRAND-ingredient-report-Maya.pdf` etc.) before flipping the call site.

### 1.5 `product-analyse-url` *(URL input)*
- **Model:** `google/gemini-2.5-flash`. `response_format: json_object`.
- **Input:** `{ url, context }`. Scraping: Firecrawl v2 preferred; plain-fetch fallback.
- **Output:** same schema as `product-analyse`.
- **Caching:** none.
- **Call site:** `src/hooks/useProductUrlScan.ts`. Receives `buildAiContext()`.
- **Claude rewrite:**
  - Model: `claude-sonnet-4-6`. Same justification.
  - JSON-mode → tool_use, same `return_product_analysis` tool. **Share the schema with `product-analyse`** in `_shared/schemas.ts`.
  - **Trim** the 18 KB scraped page text to ~10 KB before sending — Sonnet handles it but cost matters when many users paste links.
  - Keep Firecrawl + fetch fallback. Note: AUDIT.md flagged that the silent Firecrawl-missing fallback leads to JS-rendered pages failing — surface that to the UI as part of this migration step.
  - **No RAG** for the URL flow. Same KB topics as `product-analyse`.

### 1.6 `tool-analyse-url` *(simpler URL input)*
- **Model:** `google/gemini-2.5-flash`. `response_format: json_object`.
- **Input:** `{ url }`. Same Firecrawl flow as `product-analyse-url`.
- **Output:** `{ is_tool, name, brand, category: enum of ~14 hair-tool kinds, summary }`.
- **Call site:** `src/components/MyToolsSection.tsx`. **Does NOT receive `buildAiContext()` today** — schema is intentionally limited but the audit flagged this. Phase 2 fixes during this function's migration step.
- **Claude rewrite:**
  - Model: `claude-haiku-4-5-20251001` (cheapest tier — schema is tiny, no reasoning load).
  - JSON-mode → tool_use.
  - Add `context` to input. Use it minimally — current style + hair profile influence the `summary` ("good for your low-porosity routine") rather than the classification. Don't break the binary `is_tool` decision by over-personalising.
  - **No RAG.** **No curated KB** — the function is a categoriser.

### 1.7 `wash-day-observation`
- **Model:** `google/gemini-2.5-flash`. Tool calling.
- **Input:** `{ steps?, results?, hairFeelNote, hairProfile, healthProfile, context }`
- **Output (tool_use → `return_observation`):** `{ observation: string }` (2–3 sentences).
- **Server-side personalisation pulls:** `blood_results`, `user_medications`.
- **Caching:** none.
- **Call site:** `src/pages/wash/WashStep4.tsx`. Receives `buildAiContext()`. Result is written back to `wash_days.ai_insight` for archival.
- **Claude rewrite:**
  - Model: `claude-haiku-4-5-20251001` (short, fast, narrow output).
  - Tool: port `return_observation` schema.
  - **No RAG.** Curated KB: topics 1, 3, 10, 11 (porosity, scalp, wash-day mechanics, heat & moisture).

### 1.8 `heat-treatment-rationale`
- **Model:** `google/gemini-2.5-flash`. `response_format: json_object`.
- **Input:** `{ context }`. Just the context object.
- **Output:** `{ headline, reasons: string[≤3] }`.
- **Caching:** none.
- **Call site:** `src/pages/wash/WashStep1.tsx`. Receives `buildAiContext()`.
- **Status:** **CURRENTLY BROKEN.** `import { corsHeaders } from "@supabase/supabase-js/cors"` (line 5) — invalid module specifier. The function does not deploy. Tracked in `KNOWN_ISSUES.md` as a Phase 2-bound fix.
- **Hardcoded fake fallback:** lines 116–126 return `{ headline: "Heat could help your conditioner work harder", reasons: [generic-canned-text] }` on any error path with HTTP 200 — silently masks AI outages. AUDIT.md §1 flagged this.
- **Claude rewrite:**
  - Model: `claude-haiku-4-5-20251001`.
  - JSON-mode → tool_use (`return_heat_rationale`).
  - **Fix the cors import** — use `_shared/cors.ts`.
  - **Kill the hardcoded fallback.** On error: surface the real failure to the UI as a 5xx, let the wash-step UI show a retry button. The current behaviour is the wash-day-fallback bug pattern AUDIT.md called out and Phase 1 explicitly avoided in `data-decrypt-context`.
  - **No RAG.** Curated KB: topic 11 (heat & moisture).

### 1.9 `journal-encouragement` *(low-stakes copy)*
- **Model:** `google/gemini-2.5-flash`. Tool calling.
- **Input:** engagement signals only — `{ daysSinceSignup, entryCount, daysSinceLastEntry, washCount, daysSinceLastWash, activeGoalCount, recentGoalTitle, daysSinceGoalUpdate, daysSinceLastAppointment, lifecycleStage, engagementState, milestoneLabel? }`
- **Output (tool_use → `return_banner`):** `{ headline: ≤7 words, subline: ≤16 words }`.
- **Auth:** **`verify_jwt = false`** (the only public function). AUDIT.md §4 flagged the cost-amplification risk.
- **Call site:** `src/hooks/useJournalEncouragement.ts`. **Does NOT receive `buildAiContext()` today.** Phase 2 fixes during this step.
- **Claude rewrite:**
  - Model: `claude-haiku-4-5-20251001`.
  - Tool: port `return_banner`.
  - **Add `buildAiContext()`** so the banner can reference real personalisation (life stage, current style, latest goal). Keep the banner short — context informs voice, doesn't fill the copy.
  - **Add basic rate limiting** during this step (per IP / per anonymous-token, modest threshold) since `verify_jwt = false` exposes the open endpoint to drain the Anthropic key.
  - **No RAG.** **No curated KB** — too lightweight.

### 1.10 `transcribe-audio` *(NOT a Claude target)*
- **Model:** `google/gemini-2.5-flash` with `input_audio` content block.
- **Input:** `{ audioBase64, mimeType }`.
- **Output:** `{ text: string }`.
- **Call site:** `src/components/VoiceNoteField.tsx`.
- **Personalisation:** none — pure transcription.
- **Phase 2 decision:** **Anthropic does not currently offer first-party audio transcription.** Keep this function on Lovable AI Gateway + Gemini for Phase 2. We'll revisit only if/when we cut Lovable entirely (Whisper or Deepgram is the obvious replacement). Flag this explicitly in §7 out-of-scope.

### Persona-prompt duplication audit
The `STRAND_PERSONA` block (~28 lines) appears verbatim in **9 of 10** functions (everything except `transcribe-audio`). I diffed each occurrence — they are byte-identical. Eliminating this is the single biggest scaffolding win.

### `buildAiContext()` reach (current state)
| Function | Receives `context`? |
|---|---|
| blood-ai-summary | ✓ |
| ingredient-analysis | ✓ |
| nutrition-plan | ✓ |
| product-analyse | ✓ |
| product-analyse-url | ✓ |
| wash-day-observation | ✓ |
| heat-treatment-rationale | ✓ |
| **tool-analyse-url** | ✗ → fix during step 6 |
| **journal-encouragement** | ✗ → fix during step 9 |
| transcribe-audio | n/a (no personalisation needed) |

---

## 2. Knowledge base structure

### Decision: `supabase/functions/_shared/knowledge/` with TypeScript modules per topic, not JSON or YAML

Reasons:
1. **Type safety end-to-end.** Topic shape is enforced by a TS interface; misshaped content fails at edge-function deploy time, not at runtime.
2. **No YAML parser dependency in Deno.** YAML is nice for hand-editing but adds an esm.sh import for every cold start. JSON via `import x from "./x.json" with { type: "json" }` works but has fewer ergonomics for tagged unions.
3. **Tree-shakable imports.** Each function imports only the topics it needs — no parsing the whole bundle.
4. **Markdown bodies as template literals.** Authors get multi-line strings without escape hell.

### File layout

```
supabase/functions/_shared/
  knowledge/
    index.ts                        # registry + selector
    types.ts                        # Topic, TopicId, AppliesTo
    topics/
      porosity.ts
      hair-architecture.ts          # density / diameter / surface texture
      scalp-conditions.ts
      diagnosed-conditions.ts       # alopecia family + dermatitis family
      iron-and-shedding.ts
      vits-and-minerals.ts          # D, B12, zinc, magnesium — UK Black-British context
      thyroid.ts
      hormones-and-life-stage.ts    # pregnancy, postpartum, perimeno, meno, contraception
      hard-water.ts
      wash-day-mechanics.ts
      heat-and-moisture.ts          # deep conditioning, steam, heat-treatment
      protective-styling.ts         # box braids, locs, faux locs, takedown timing
```

### Topic shape (`types.ts`)

```ts
export type TopicId =
  | "porosity" | "hair-architecture" | "scalp-conditions"
  | "diagnosed-conditions" | "iron-and-shedding" | "vits-and-minerals"
  | "thyroid" | "hormones-and-life-stage" | "hard-water"
  | "wash-day-mechanics" | "heat-and-moisture" | "protective-styling";

export interface BookRef {
  chapter: number;
  chapter_title: string;
  page_start?: number;
  page_end?: number;
}

export interface Topic {
  id: TopicId;
  title: string;
  body: string;          // Paige-voice markdown, ~200–600 words
  applies_to: {          // selector triggers
    hair?: Partial<{ porosity: string[]; density: string[]; scalp: string[] }>;
    health?: Partial<{ life_stage: string[]; conditions: string[] }>;
    blood_markers?: string[];
    location?: { hard_water?: boolean };
    function_kinds?: string[];   // e.g. "wash-day-observation"
  };
  book_refs: BookRef[];          // for "Read more — …" footers
  tags: string[];
}
```

### Selector

`index.ts` exports:

```ts
export function selectTopicsForContext(
  ctx: AiContext,
  intent: { function_kind: string; force?: TopicId[] },
): Topic[];
```

Logic: union of (a) topics whose `applies_to` matches the user's clinical signals, (b) topics with `function_kinds` including the calling function, (c) any explicit `force` from the function. Cap at 4 topics per call to keep token budget bounded.

### The 12 topics — opinionated and justified

I propose 12, not the user's 8–15 range floor. Each justified by the functions and clinical signals it serves.

| # | Topic | Why curate (vs. let RAG handle it) |
|---|---|---|
| 1 | **porosity** | Touched by ingredient-analysis, product-analyse, wash-day, heat-rationale. The mechanism (cuticle openness ↔ moisture uptake) is referenced almost every call. RAG would retrieve repeatedly; curating saves token+latency on >80% of calls. |
| 2 | **hair-architecture** *(density, strand diameter, surface texture)* | Same surface as porosity but a different axis. Combine because the three travel together in the prompts. |
| 3 | **scalp-conditions** *(dry, oily, sensitive, normal, combination)* | Drives ingredient flag rules (sulphates on dry scalp etc). Clean enum, deterministic content — perfect for curation. |
| 4 | **diagnosed-conditions** *(traction alopecia, androgenetic, alopecia areata, CCCA, telogen effluvium, seborrheic dermatitis, folliculitis, scalp psoriasis, scalp eczema)* | Clinically high-stakes. Curating ensures every one of these gets the exact framing Paige uses in the book — no model-improvised diagnoses. **Most important topic for safety.** |
| 5 | **iron-and-shedding** | Canonical chapter content. Blood-ai-summary and nutrition-plan hit this every flagged-ferritin run. Curate so the book's framing always shows up; let RAG enrich for unusual cases. |
| 6 | **vits-and-minerals** *(D, B12, zinc, magnesium)* | UK-specific context (latitude → vitamin D → melanin). The book has a focused chapter — curate. |
| 7 | **thyroid** | TSH/T3/T4 → hair shedding loop. Distinct mechanism from iron; warrants its own topic. |
| 8 | **hormones-and-life-stage** *(pregnancy, postpartum, perimenopause, menopause, hormonal contraception)* | Drives nutrition-plan recommendations. GDPR Article 9 sensitive — encrypted in Phase 1. Curating ensures the model receives the same framing every time without re-retrieving from a manuscript that's been read into RAG chunks. |
| 9 | **hard-water** | UK-specific. Already a structured signal in `aiContext.location.is_hard_water_area`. Pairs with chelation/EDTA/citrate ingredient guidance. Curate. |
| 10 | **wash-day-mechanics** *(pre-poo → cleanse → condition → treatment → style; clarifying cadence; protein/moisture balance)* | Wash-day-observation hits this every call. Heat-rationale crosses into it. Curate. |
| 11 | **heat-and-moisture** *(deep conditioning + heat treatment + steam mechanics)* | Heat-rationale's primary content. Curate generic mechanics; flag in the topic body that we *don't* recommend a specific tool (the Heat Hat upsell is a Phase 2+ runtime overlay, not a knowledge-base statement). |
| 12 | **protective-styling** *(box braids, locs, faux locs, knotless, cornrows; takedown timing; scalp care during)* | Drives `style_after` references in wash-day-observation; informs ingredient match scores ("good while you're 4 weeks into braids"). Curate. |

**What I am deliberately NOT curating:**
- Anything in the long tail (specific ingredient mechanisms beyond the top ~50, niche heritage cuisine, edge-case medication interactions). Those go to RAG over the manuscript.
- Anything that contradicts the book or is opinion-only (no styling-trend takes, no aesthetics).

---

## 3. RAG subsystem

### 3.1 Manuscript storage

- **Bucket:** new private Supabase Storage bucket `manuscript`. Folder-scoped to a single object key; only service-role keys can read.
- **Source format:** prefer markdown (one file per chapter). If the source is PDF, run a one-shot extraction (`pdf-parse` or similar) → markdown before chunking. Keep both — the markdown is what's chunked and indexed.
- **Bucket access:** **no public access**, no RLS-based read for `authenticated` (book is licensed; raw text must not leak through the app). Only the indexing edge function (service-role) reads it.
- **Re-indexing:** truncate + re-insert. Manuscript updates are rare (book editions); we just rebuild.

### 3.2 Chunking

- **Boundaries:** chapter → section → paragraph. Never split mid-sentence. Where a section is shorter than the target size, emit it as a single chunk (don't pad).
- **Target size:** ~500 tokens per chunk (~1500 chars), with ~50-token overlap between adjacent chunks within the same section. (Tokens estimated via `gpt-3.5-turbo` style ratio at indexing time — cheap and predictable.)
- **Why these numbers:** Claude's effective attention on retrieved passages drops when single chunks exceed ~700 tokens or when the total RAG payload exceeds ~3000 tokens. 500 × top-K=4 fits well inside that envelope.
- **Metadata:** every chunk carries `chapter`, `chapter_title`, `section_heading`, `page_start`, `page_end`, `body`, `embedding`, `token_count`. The `chapter` and page numbers feed the "Read more — …" reference line that the persona prompt requires.

### 3.3 Embedding model and vector storage

- **Embedding model:** **OpenAI `text-embedding-3-small`** (1536 dims).
  - Why: stable, cheap (~$0.02 per 1M tokens), well-understood retrieval quality.
  - Anthropic does NOT currently offer a first-party embedding model. We'd need a third-party regardless.
  - Alternative considered: Voyage `voyage-3-lite` (cheaper, comparable). Defer until cost actually matters — manuscript-sized corpus indexes for cents, query embeddings are similarly negligible.
  - **New secret:** `OPENAI_API_KEY` in Lovable Cloud Secrets.
- **Vector storage:** new Postgres table `manuscript_chunks` using the `vector` extension.
  ```sql
  create extension if not exists vector;
  create table public.manuscript_chunks (
    id              uuid primary key default gen_random_uuid(),
    chapter         int not null,
    chapter_title   text not null,
    section_heading text,
    page_start      int,
    page_end        int,
    body            text not null,
    embedding       vector(1536) not null,
    token_count     int,
    created_at      timestamptz not null default now()
  );
  create index manuscript_chunks_embedding_idx
    on public.manuscript_chunks
    using ivfflat (embedding vector_cosine_ops) with (lists = 50);
  ```
- **Access model:**
  - RLS **enabled**. **No** SELECT policy granted to `authenticated` or `anon`. Service-role bypasses RLS — that's the only path.
  - Edge functions read via the service-role client (same pattern as `phase1-backfill-existing-rows`).
  - Clients cannot `supabase.from('manuscript_chunks').select()` even with a valid JWT. By design.

### 3.4 Retrieval triggers

- **Per-call decision:** each function decides whether to invoke RAG. Default is OFF; opt in where the function declares `useRag: true` in its config.
- **Phase 2 functions that DO RAG:** `nutrition-plan`, `blood-ai-summary`, `ingredient-analysis` (conditional — only when ingredients include uncommon items).
- **Phase 2 functions that DO NOT RAG:** `product-analyse`, `product-analyse-url`, `tool-analyse-url`, `wash-day-observation`, `heat-treatment-rationale`, `journal-encouragement`. Either narrow domains or cost-sensitive enough that the curated KB is sufficient.
- **Query construction:** each function builds an "intent string" describing what it's about to ask Claude, in plain English. Example for nutrition-plan: `"hair nutrition plan: low ferritin, low vitamin D, vegan diet, perimenopausal woman, African heritage"`. Embed once per call.
- **Top-K:** 4 by default. nutrition-plan uses 6 (longer output justifies more grounding).
- **Result shape:** retrieved chunks are joined into a single block in the system prompt with one reference line per chunk for citation.

### 3.5 Implementation surface

New edge function: `embed-and-index-manuscript` (admin-only, one-shot, deleted after indexing — same shape as `phase1-backfill-existing-rows`). Invoked once per manuscript revision.

New shared helper: `_shared/rag.ts` exports:
```ts
export async function retrievePassages(
  query: string,
  k: number = 4,
): Promise<Passage[]>;

export interface Passage {
  body: string;
  chapter: number;
  chapter_title: string;
  section_heading?: string;
  page_start?: number;
  page_end?: number;
  similarity: number;
}
```

### 3.6 New dependencies summary

- **pgvector extension** — enable on the database. One-line migration.
- **`OPENAI_API_KEY`** — Lovable Cloud Secrets entry. Used only by the indexer and the runtime query embedder.
- **`https://esm.sh/openai@4.x`** in edge function imports — for embedding API.
- **PDF→markdown extractor** — only at indexing time, only if the source is PDF. Can be done locally before upload to the bucket; no edge-function dep needed.

---

## 4. Shared scaffolding

`supabase/functions/_shared/` does not exist today. Phase 2 creates it.

### 4.1 `_shared/strand-persona.ts`
```ts
export const STRAND_PERSONA = `<<the locked Paige system prompt — provided at build time>>`;
```
Every function that previously inlined the persona imports `STRAND_PERSONA`. Eliminates ~252 lines of duplication.

### 4.2 `_shared/anthropic-client.ts`
Typed wrapper around `https://esm.sh/@anthropic-ai/sdk@<latest>` (Anthropic's Deno-compatible SDK).
```ts
export interface ClaudeCallInput {
  model: "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5-20251001";
  systemBlocks: SystemBlock[];     // ordered: persona → KB → task instructions
  messages: Message[];
  tools?: Tool[];
  toolChoice?: { type: "tool"; name: string };
  max_tokens?: number;
}

export interface ClaudeCallResult<T = unknown> {
  toolInput?: T;                    // parsed tool_use input, when toolChoice was set
  text?: string;                    // free-text response, when no tool
  usage: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; output_tokens: number };
  stop_reason: string;
}

export async function callClaude<T = unknown>(input: ClaudeCallInput): Promise<ClaudeCallResult<T>>;
```
- Reads `ANTHROPIC_API_KEY` from `Deno.env`.
- Builds the `system: SystemBlock[]` array with `cache_control: { type: "ephemeral" }` on the persona and KB blocks (the long, stable prefix). Per-call instructions and user data go in the user-message turn (no cache).
- Maps errors:
  - 401 → `"AI auth failed (server-side configuration issue)"` + 5xx upstream
  - 429 → `"Rate limit exceeded. Try again shortly."` (preserves current Lovable mapping)
  - 529 → `"AI is overloaded right now. Try again shortly."` (Anthropic's overloaded code)
  - 400 → propagate the message — it's a schema/format problem we want to see in logs
- Single retry on 529 only. No retry on 429 (we want the user to see backoff).

### 4.3 `_shared/build-prompt.ts`
The composer.
```ts
export interface BuildPromptInput {
  function_kind: string;            // "ingredient-analysis", etc.
  task_instructions: string;        // the function-specific TASK block
  user_context?: AiContext | null;  // from the client
  user_payload: Record<string, unknown>; // function-specific input (product, blood, etc.)
  knowledge_topic_ids?: TopicId[];  // explicit KB picks; selector adds context-driven ones
  rag_query?: string;               // when set, retrievePassages is invoked
  rag_k?: number;
  tool?: Tool;                      // tool definition for structured output
}

export async function buildClaudeRequest(input: BuildPromptInput): Promise<ClaudeCallInput>;
```
- Builds a `system: SystemBlock[]` array:
  - `[0]` STRAND_PERSONA (cache_control ephemeral)
  - `[1]` selected knowledge topics, joined (cache_control ephemeral)
  - `[2]` retrieved RAG passages, if any (no cache — per-query)
  - `[3]` task_instructions (no cache — per-call)
- Builds `messages`: a single user turn with `{ user_payload, user_context }` JSON-serialised.
- Sets `tools` and `toolChoice` when a tool is provided.
- Centralises the model selection per function: a small map `FUNCTION_MODEL_MAP[function_kind] = "claude-..."`.

### 4.4 `_shared/cors.ts`
```ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const preflight = () => new Response(null, { headers: corsHeaders });

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
```
Replaces 6 different cors patterns currently in use across the 10 functions (inline definitions, Lovable's broken `@supabase/supabase-js/cors` import, esm.sh URL import, etc.).

### 4.5 `_shared/auth.ts`
```ts
export async function requireAuthedUser(req: Request): Promise<{ user: User; supabase: SupabaseClient } | Response>;
```
Returns either the user + a Supabase client bound to their JWT, or a `Response` (401) the caller can return directly. Eliminates the 9 copies of the auth-header → createClient → getUser → 401 block.

### 4.6 `_shared/errors.ts`
```ts
export function aiErrorResponse(e: unknown): Response;
```
Maps the standard error classes to user-friendly JSON + correct HTTP status. Eliminates 10 different error-handling blocks.

### 4.7 `_shared/rag.ts` *(introduced in Phase 2 step 2)*
See §3.5.

### 4.8 `_shared/knowledge/` *(see §2)*

### Duplication eliminated (rough)
| Source | Before | After |
|---|---|---|
| STRAND_PERSONA (~28 lines × 9 functions) | ~252 lines | 1 file |
| corsHeaders (6 distinct definitions) | 6 places | 1 file |
| Lovable AI Gateway fetch boilerplate (~30 lines × 10 functions) | ~300 lines | 1 wrapper |
| Auth block (~15 lines × 9 functions) | ~135 lines | 1 helper |
| Error mapping (~25 lines × 10 functions) | ~250 lines | 1 helper |

**Net:** ~950 lines of duplication → ~6 shared files. Each subsequent voice tweak or model swap touches one place.

---

## 5. Per-function migration order

Sequenced by user-impact-on-failure × risk × what each step teaches. Step 0 is foundation; steps 1–9 ship one PR each. Steps 4 and 5 are split into letter-suffixed sub-steps (4a / 4b, 5a / 5b) so each function migrates in its own PR.

### Step 0 — Foundation (one PR)
- Create `_shared/` with: `strand-persona.ts` (canonical text from user), `cors.ts`, `errors.ts`, `auth.ts`, `anthropic-client.ts`, `build-prompt.ts`. **No KB topics, no RAG, no migrations** — just the scaffolding.
- Add `ANTHROPIC_API_KEY` to Lovable Cloud Secrets.
- **Per-function rollout flags — strictly per-function, no global flag.** Each migrated function reads its own env entry: `STRAND_AI_PROVIDER_INGREDIENT`, `STRAND_AI_PROVIDER_PRODUCT_PHOTO`, `STRAND_AI_PROVIDER_PRODUCT_URL`, `STRAND_AI_PROVIDER_TOOL_URL`, `STRAND_AI_PROVIDER_WASH_OBSERVATION`, `STRAND_AI_PROVIDER_HEAT_RATIONALE`, `STRAND_AI_PROVIDER_NUTRITION`, `STRAND_AI_PROVIDER_BLOOD`, `STRAND_AI_PROVIDER_JOURNAL`. Each is `claude` | `lovable`, default `lovable` until that function's migration step ships and Paige flips the flag. **There is NO global `STRAND_AI_PROVIDER`** — rollback is surgical, one function at a time.
- Smoke test: a one-shot edge function `claude-smoke` that does a tiny Sonnet call ("say hi as Paige in 5 words"). Deletable after Phase 2 closes.

### Step 1 — Knowledge base + RAG indexing (one PR)
- Add the `manuscript_chunks` migration (pgvector + table + index, no SELECT policy).
- Add the 12 curated KB topics under `_shared/knowledge/topics/` plus `index.ts` selector.
- Add `OPENAI_API_KEY` to Secrets.
- Add `_shared/rag.ts`.
- Add admin-only `embed-and-index-manuscript` edge function.
- Manual: upload manuscript markdown to the `manuscript` bucket. Invoke the indexer once.
- Verify: `select count(*) from manuscript_chunks` returns the expected chunk count; spot-check a few rows.

### Step 2 — `ingredient-analysis` *(highest call frequency, lowest risk)*
- **Model:** `claude-sonnet-4-6`
- **JSON-mode:** tool_use, port `return_analysis` schema. Set `minItems`/`maxItems` to `ingredients.length` per request.
- **RAG:** conditional (only when ingredients include uncommon items). KB topics: 1, 3, 4, 9.
- **Token cost (estimate):** persona+KB cached after first hit ≈ 2.2K input tokens + ~600 output. Sonnet 4.6 at ~$3/$15 per 1M → ~$0.003 cold call, ~$0.0008 warm cache.
- **Caching pattern:** keep `ai_summaries` row by `kind = "ingredient_analysis:<key>"`. Add a `model_version` field to the cached payload so a future persona/KB bump auto-invalidates without manual cache nuke.
- **Risk:** low. Existing schema, existing call sites, existing cache.

### Step 3 — `product-analyse` *(vision + web research, "wow moment")*
- **Model:** `claude-sonnet-4-6` (vision-capable, native web_search support).
- **Tools provided to Claude:**
  1. **Vision content block** — Anthropic shape: `{ type: "image", source: { type: "base64", media_type, data } }` for data URLs; `{ type: "image", source: { type: "url", url } }` for signed URLs.
  2. **`web_search` tool** — Anthropic's native web search tool definition with `max_uses: 4` (one to identify brand+product from partial label, optional cross-check for full INCI when label is folded/obscured, optional brand/formulation context, optional retailer fact). Tight upper bound; Claude decides per call whether to invoke.
  3. **`return_product_analysis` tool_use** — schema in `_shared/schemas.ts`. **Shared with Step 4a** so photo and URL flows produce identical client-side payloads.
- **Autonomous reasoning loop:** single API call. Claude looks at the photo, identifies brand+product from the most prominent text, decides whether to search the web (typically when the visible ingredient panel is partial, the label is folded, or marketing claims need verification), runs the search itself, then composes the analysis. No client-side orchestration; Anthropic returns the final `tool_use` once Claude has enough context.
- **No RAG.** KB topics: 1, 3, 4. (RAG remains a separate retrieval channel — book corpus only. Web search is product-fact retrieval only, never used to substitute for the book.)
- **Token cost (revised estimate):** image ~1500 tokens + ~2.2K text input + ~800 output base + ~2–3 web_search invocations at Anthropic's per-search price (~$0.01/search, late-2025 pricing) + additional output tokens from synthesised research → **~$0.03–0.05 per call** (was ~$0.014 vision-only). Vision+research is now the most expensive Phase 2 per-call op; budget accordingly in §6 cost projections.
- **Persona impact:** the persona's "Read more — How To Love Your Afro, Chapter X: [Title], p.[page]" footer continues to render whenever guidance is rooted in a specific chapter. Web-derived product facts (e.g. "the brand's site states the formulation uses cold-process saponification") are referenced inline naturally in `ai_summary` / `tips` — they do NOT use the formal "Read more" line, which is reserved for book citations only. **Add to `task_instructions` in the system prompt:** *"When citing facts, distinguish book-derived guidance from web-derived product facts. Web sources can be referenced inline naturally in prose; book citations get the formal 'Read more — How To Love Your Afro, Chapter X: [Title], p.[page]' line on its own line at the end."*
- **Schema unchanged.** The `return_product_analysis` tool definition is identical to the vision-only spec — what changes is how Claude *fills* the schema (vision-only vs. vision+research). Existing client-side rendering in `useProductScan.ts` and `ProductDetailNew.tsx` continues to work without modification.
- **Verification:** match outputs against the four sample reports at the repo root before flipping the call site (`STRAND-ingredient-report-Maya.pdf`, etc.). **Plus** the new partial-label smoke test in §8 (a TT product whose ingredient list is on a foldable insert / obscured side panel must produce a full INCI list via web search, not just OCR).
- **Rollout flag:** `STRAND_AI_PROVIDER_PRODUCT_PHOTO=claude`.

### Step 4a — `product-analyse-url` *(server-only, no client change)*
- **Model:** `claude-sonnet-4-6`. Shares the `return_product_analysis` tool with step 3 — schema lives in `_shared/schemas.ts`.
- **JSON-mode → tool_use.**
- **Extract scraping into `_shared/scrape.ts`** during this step (Firecrawl-preferred + plain-fetch fallback). Step 4b imports the same helper — eliminates the current source-level duplication of the `scrapeWithFirecrawl` / `scrapeWithFetch` pair.
- **Surface "no Firecrawl key + JS-rendered page failed" as a real error to the UI** — kills the AUDIT.md §1 silent-degradation finding.
- **Page-text trim:** shrink from 18 KB to 10 KB before sending — sufficient for product pages, cuts token cost significantly.
- **No client change.** Call site `src/hooks/useProductUrlScan.ts` already passes `buildAiContext()`. **No Publish click required.**
- **Rollout flag:** `STRAND_AI_PROVIDER_PRODUCT_URL=claude`.

### Step 4b — `tool-analyse-url` *(server migration + client change)*
- **Model:** `claude-haiku-4-5-20251001` (cheapest tier — schema is tiny, no reasoning load).
- **JSON-mode → tool_use.** New `return_tool_analysis` tool.
- **Imports `_shared/scrape.ts`** introduced in 4a — no scraping duplication.
- **Add `buildAiContext()` to `src/components/MyToolsSection.tsx`** call site. The `summary` field becomes lightly personalised (current style, hair profile). Do NOT break the binary `is_tool` decision by over-personalising.
- **Client change required → Publish click in §8 / §9.**
- **Rollout flag:** `STRAND_AI_PROVIDER_TOOL_URL=claude`.

### Step 5a — `wash-day-observation` *(clean port)*
- **Model:** `claude-haiku-4-5-20251001`.
- **JSON-mode:** tool_use, port `return_observation` schema directly.
- **No RAG.** KB topics: 1, 3, 10, 11.
- **No fallback gymnastics** — Haiku JSON output is reliable; failures surface as 5xx to the UI (the wash-step UI already handles failure for the existing Gemini calls).
- **No client change.** Result writes back to `wash_days.ai_insight` server-side, same as today.
- **Rollout flag:** `STRAND_AI_PROVIDER_WASH_OBSERVATION=claude`.

### Step 5b — `heat-treatment-rationale` *(fix-and-migrate, separate PR from 5a)*
- **Model:** `claude-haiku-4-5-20251001`.
- **Fix the broken `corsHeaders` import.** Replace `from "@supabase/supabase-js/cors"` (line 5) with `import { corsHeaders } from "../_shared/cors.ts"`. The function does not deploy today; this fix unblocks it. Tracked in `KNOWN_ISSUES.md`.
- **Kill the hardcoded fake fallback** (lines 116–126). On error, return a 5xx and let the wash-step UI render a retry. No more silently masked AI outages tagged as personalised — same anti-pattern Phase 1 explicitly avoided in `data-decrypt-context`.
- **JSON-mode → tool_use** (`return_heat_rationale`).
- **KB topic 11.** No RAG.
- **No client change beyond what wash-step UI already does** for the retry case.
- **Rollout flag:** `STRAND_AI_PROVIDER_HEAT_RATIONALE=claude`.

### Step 6 — `nutrition-plan` *(deepest personalisation)*
- **Model:** `claude-opus-4-7`.
- **Tool schema:** port `return_nutrition_plan` directly.
- **Drop the 55s `AbortController`** workaround — Anthropic's standard timeout handles Opus's reasoning load.
- **RAG:** top-K=6. Embedding query built from flagged markers + diet pattern + heritage + life stage.
- **KB topics:** 5, 6, 7, 8, 12.
- **Caching:** keep signature-based `ai_summaries` row by `kind = "nutrition_plan"`. Add `model_version` for automatic invalidation on persona/KB bumps.
- **Token cost (estimate):** ~12K input cached + ~1500 output. Opus at ~$15/$75 per 1M → ~$0.21 cold, ~$0.10 warm cache. Justified by output value (the plan is the highest-value AI surface in the app).

### Step 7 — `blood-ai-summary` *(clinical safety-critical)*
- **Model:** `claude-opus-4-7`.
- **Tool schema:** port `return_summary`. Keep the critical-coverage rule (every flagged marker gets its own deficiency entry) — express it both in `task_instructions` AND in the tool schema's `deficiencies.minItems` set dynamically to flagged-marker count.
- **RAG:** top-K=4. Embedding query built from the flagged-marker list.
- **KB topics:** 5, 6, 7, 8.
- **Verification:** **A/B parallel-output run** before flipping the flag. Run both Lovable+Gemini and Anthropic+Claude on ~10 real beta-user blood profiles, store both, eyeball diffs. Don't flip the call site until the diffs look right.
- **Caching:** keep `ai_summaries` row by `kind = "blood_summary"`. Add `model_version`.
- **Logging audit:** AUDIT.md flagged that `blood-ai-summary` does `console.error("...", JSON.stringify(aiJson).slice(0, 500))` — the truncated AI response can include user marker names and statuses. **Replace with error class only, never the payload body.** Fix during this step.

### Step 8 — `journal-encouragement`
- **Model:** `claude-haiku-4-5-20251001`.
- **Tool:** port `return_banner`.
- **Add `buildAiContext()`** to the call site (`useJournalEncouragement.ts`) — small client change.
- **Add basic rate limiting**: per-IP token bucket, 10 calls/hour anonymous; bypass for authed users (for whom the JWT proves identity). Implement in the function itself or via a Postgres rate-limit table — defer to build-time decision.
- **Open-endpoint cost guard:** consider adding a simple captcha-style barrier *if* rate limiting alone proves insufficient post-launch. Not for Phase 2 MVP — note it.

### Step 9 — `transcribe-audio` *(stays on Gemini)*
- **No migration in Phase 2.** Anthropic has no audio API.
- Keep `LOVABLE_API_KEY` set after Phase 2 ships specifically for this function.
- **Long-term plan:** if/when we cut Lovable entirely, replace with OpenAI Whisper or Deepgram in a follow-up phase. Not Phase 2's problem.

---

## 6. Known issues to address during migration

Not separate work — each gets fixed inline during the function's own migration step. Listed for visibility.

| Issue | Source | Fix during step |
|---|---|---|
| `heat-treatment-rationale` broken `corsHeaders` import | `KNOWN_ISSUES.md`, function source line 5 | Step 5b |
| `heat-treatment-rationale` hardcoded fake fallback (lines 116–126) | `AUDIT.md` §1, source | Step 5b |
| `tool-analyse-url` does not receive `buildAiContext()` | `AUDIT.md` §1 | Step 4b |
| `journal-encouragement` does not receive `buildAiContext()` | `AUDIT.md` §1 | Step 8 |
| `journal-encouragement` open-endpoint cost amplification | `AUDIT.md` §4 | Step 8 (rate limiting via Postgres `rate_limits` table — see decision §6) |
| `blood-ai-summary` logs truncated payload bodies (clinical data into Lovable Cloud Logs) | `AUDIT.md` §4 | Step 7 |
| `product-analyse-url` silent Firecrawl-missing degradation | `AUDIT.md` §1 | Step 4a (extracted to `_shared/scrape.ts`; Step 4b inherits the fix automatically) |
| `ingredient-analysis` `EXACTLY ${ingredientCount}` brittleness | `AUDIT.md` §1, function source line 174 | Step 2 (express via tool schema, not prose) |
| Persona prompt duplicated across 9 functions | `AUDIT.md` §1, §5 | Step 0 (eliminated by `_shared/strand-persona.ts`) |
| Per-function `STRAND_AI_PROVIDER_<FN>` flags not implemented | n/a | Step 0 (added with foundation; **no global flag**) |

### Bonus opportunity (not blocking)
Add a `model_version` field to all cached `ai_summaries.payload` blobs so a future persona / KB / model bump auto-invalidates the cache without manual SQL. Implemented at each step where the function writes to `ai_summaries` (steps 2, 6, 7).

---

## 7. What NOT to do in Phase 2

Strict out-of-scope — every item below is real but belongs elsewhere.

- **No schema changes.** Phase 1.5 owns: dropping `user_medications.name` / `.category`, `blood_results.value` / `.unit` plaintext columns; deleting `phase1-backfill-existing-rows`; deleting legacy `strand_*` localStorage keys after the soak-window. Phase 2 only touches schema for: (a) `manuscript_chunks` table + pgvector enable (step 1); (b) optional `ai_summaries.payload._model_version` marker (no schema change, just payload convention).
- **No client code changes beyond what each function strictly requires.** Allowed: passing `buildAiContext()` to `tool-analyse-url` and `journal-encouragement` (small additions to two call sites). Disallowed: refactoring `aiContext.ts`, `clinicalContext.ts`, the 9 page swaps from Phase 1, the dual-write onboarding pages, `RequireAuth.tsx`. The Phase 1 hotfix on top of `1c97c85` (cross-account leak guard via `localStorageIsForUser`) is already shipping; do not edit it.
- **No `ProductDetailNew` vs `ProductProfile` consolidation.** Orthogonal cleanup — Phase 3 backlog.
- **No new product features.** The Heat Hat upsell flagged in `KNOWN_ISSUES.md` is **Phase 2+ backlog**.
- **Heat Hat carve-out (decision-confirmed 2026-04-26):** KB topic 11 (`heat-and-moisture`) stays **generic**. **No placeholder hook**, no commented-out reference, no `is_tt_product` field, no specific tool brand mentioned, no "TODO: Heat Hat" marker. The topic discusses generic mechanics of cap / steamer / hood and the science of heat-assisted deep conditioning, full stop. The eventual Heat Hat upsell is a runtime UI overlay layered on top of the heat-rationale output, written when that backlog item is picked up — not now, not partially.
- **No `transcribe-audio` migration.** Anthropic has no audio API in this model generation. Keep on Lovable+Gemini. Decision flagged per the user's explicit ask. If we ever cut Lovable entirely, follow-up phase routes to Whisper or Deepgram.
- **No length-goal home-page bug fix.** Item 1 of `KNOWN_ISSUES.md` ("length goal not populating on home page") is unrelated to AI migration — Phase 1.5 or a separate session.
- **No GMC/IOT registry verification.** AUDIT.md §3 flagged the `ProDetails.tsx:36-37` TODO. Not AI work.
- **No `use_count` increment fix.** AUDIT.md §5 cleanup item — orthogonal.
- **No `ai_summaries` schema redesign.** Use the existing JSONB `payload` shape; the `_model_version` convention is forward-compatible.
- **No persona rewriting.** The user is providing the canonical Paige system prompt at build time. Do not improvise. Do not lift from any of the 9 inlined copies and call it canonical — wait for the user.

---

## 8. Execution runbook

Same shape as `PHASE_1_PLAN.md` §13. Numbered, actor-tagged, `*Verify:*` per step. Hand-off moments are explicit.

**Step 1. [Paige]** — Approve this audit (or request edits). Provide the locked `STRAND_PERSONA` text. Provide the manuscript **PDF** location (decision §6 row 2 — Claude Code does PDF→markdown locally before indexing).
*Verify:* the persona is in your hands as a single string, no edits expected post-approval; the manuscript PDF is uploaded to a place Claude Code can fetch from in runbook Step 6.

**Step 2. [Paige → Claude Code] HAND-OFF #1** — *"Audit approved. Persona is in <location>. Manuscript PDF is at <bucket-key>. Proceed with Step 0 (foundation)."*
*Verify:* you've shared the persona text and the manuscript PDF path; you haven't proceeded if either is missing.

**Step 3. [Claude Code]** — Step 0 foundation. Add `_shared/strand-persona.ts`, `_shared/cors.ts`, `_shared/auth.ts`, `_shared/errors.ts`, `_shared/anthropic-client.ts`, `_shared/build-prompt.ts`. Read each function's `STRAND_AI_PROVIDER_<FN>` env entry (default `lovable` for every function). Ship `claude-smoke` one-shot test function. **Do not add `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — Paige does that in Step 4.**
*Verify:* `npm run build` clean; new files compile; the per-function flags are read from `Deno.env.get(...)` at call time (not at module init); no global `STRAND_AI_PROVIDER` reference anywhere in the codebase.

**Step 4. [Paige]** — Set `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in Lovable Cloud Secrets. Invoke `claude-smoke` from the Edge Functions panel.
*Verify:* response is a 5-word Paige-voice string. If 5xx with key-not-found: re-add the secret. If 5xx with model-not-found: ping me (model ID drift).

**Step 5. [Claude Code]** — Step 1 (KB + RAG indexing). Add `manuscript_chunks` migration (`create extension vector`, table, index, no SELECT policy). Write the 12 KB topics in `_shared/knowledge/topics/`. Write the indexer edge function `embed-and-index-manuscript` (admin-only, same auth pattern as `phase1-backfill-existing-rows`).
*Verify:* migration deploys; topics compile; indexer deploys.

**Step 6. [Paige]** — Confirm Claude Code's local PDF→markdown extraction looks clean (chapter boundaries preserved, no OCR garbage). Upload the converted markdown to the `manuscript` private bucket. Invoke `embed-and-index-manuscript` once.
*Verify:* response shows `{ chunks_indexed: <expected count>, errors: 0 }`. Run `select count(*), min(chapter), max(chapter) from manuscript_chunks` in SQL editor — chapter range matches the book's TOC.

**Step 7. [Paige → Claude Code] HAND-OFF #2** — *"Foundation deployed. KB topics in source. Manuscript indexed (<N> chunks). Proceed with per-function migrations."*

**Step 8. [Claude Code]** — Step 2: migrate `ingredient-analysis`. PR includes: function rewrite, A/B flag flipped to `claude` for this function only, regression test for the schema-port (golden-file comparison against current Gemini output for a known product).
*Verify:* `npm run build` + `npm run test` green; deployed function returns valid analyses for a curated test set; cost-per-call within ~$0.01.

**Step 9. [Paige]** — Smoke test `ingredient-analysis` on a real product in production. Compare match score and per-ingredient flags to the prior Gemini outputs (cached or remembered).
*Verify:* output looks recognisably "Paige's voice", flags are coherent. Soak for 24h on production traffic, then green-light step 10.

**Step 10. [Claude Code]** — Step 3 (`product-analyse`). Same shape: PR + golden tests + smoke.

**Step 11. [Paige]** — Smoke test `product-analyse` on 3 photos covering: a clear English label, an iPhone HEIC, and a partially-obscured ingredient panel. Validate against the four sample report PDFs at repo root.
*Verify:* product name and brand read correctly; ingredient list transcribed completely (no padding); match score and flags coherent.

**Step 11b. [Paige]** — *(Added 2026-04-26 with the vision+web_search revision.)* Partial-label web-search smoke. Photograph a TT product whose ingredient list is on a foldable insert / hidden side panel — i.e. the visible label shows brand + product name but only a fragment of the INCI.
*Verify:* `ingredients[]` returns the **full** INCI list (resolved via `web_search`, not just OCR of the visible fragment); `ai_summary` and `tips` may reference brand/formulation facts inline; the formal "Read more — How To Love Your Afro, Chapter X: …, p.[page]" footer still appears whenever guidance is rooted in the book; web-derived facts do NOT appear under the "Read more" line. **No Publish click — server-only.**

**Step 12. [Claude Code]** — Step 4a: migrate `product-analyse-url` (server-only). Extract `_shared/scrape.ts`. Surface Firecrawl-missing failures as real errors. Trim page text to 10 KB. PR + golden test.
*Verify:* `npm run build` + `npm run test` green; `STRAND_AI_PROVIDER_PRODUCT_URL=claude` in Lovable Cloud Secrets.

**Step 13. [Paige]** — Smoke test `product-analyse-url`. One page that Firecrawl handles cleanly (e.g. a Sephora product), one that forces the plain-fetch fallback (force by temporarily unsetting `FIRECRAWL_API_KEY`, then restore).
*Verify:* product schema returned for both; the fallback case surfaces a real error (not silently empty) when the page is JS-rendered. **No Publish click — server-only.**

**Step 14. [Claude Code]** — Step 4b: migrate `tool-analyse-url` (server) + add `buildAiContext()` to `MyToolsSection.tsx` (client). Imports `_shared/scrape.ts` from 4a. PR + golden test.
*Verify:* `npm run build` + `npm run test` green; `STRAND_AI_PROVIDER_TOOL_URL=claude` in Lovable Cloud Secrets.

**Step 15. [Paige]** — **Click Publish → Update in Lovable** (client change shipped). Then smoke test the tool URL flow. Use a Heat Hat product page.
*Verify:* tool categorises as `Deep conditioning cap / heat hat` (not `Bonnet`); summary references your hair profile lightly; `is_tool` decision is correct.

**Step 16. [Claude Code]** — Step 5a: migrate `wash-day-observation` (clean port). PR + golden test.
*Verify:* `npm run build` + `npm run test` green; `STRAND_AI_PROVIDER_WASH_OBSERVATION=claude` in Lovable Cloud Secrets.

**Step 17. [Paige]** — Log a wash day end-to-end. Check that step 4 (observation) writes a non-generic note to `wash_days.ai_insight`.
*Verify:* observation references at least one real signal from your profile (porosity, scalp, breakage note, flagged marker, medication). **No Publish click — server-only.**

**Step 18. [Claude Code]** — Step 5b: fix-and-migrate `heat-treatment-rationale`. Replace broken corsHeaders import. Remove hardcoded fake fallback. JSON-mode → tool_use. PR + golden test. **Separate from Step 16's PR** so the corsHeaders/fallback fixes can be reverted independently of the wash-observation port.
*Verify:* `npm run build` + `npm run test` green; the function deploys (it does not deploy today); `STRAND_AI_PROVIDER_HEAT_RATIONALE=claude` in Lovable Cloud Secrets.

**Step 19. [Paige]** — Smoke test the heat-rationale step of the wash flow. Pick "did NOT use heat" on step 1 of a wash log.
*Verify:* headline + reasons reference real personalisation (not the old canned `"Heat could help your conditioner work harder"` fallback). On a forced error (e.g. invalid context), the UI shows a retry button — **no canned advice rendered as if personalised**. **No Publish click — server-only.**

**Step 20. [Claude Code]** — Step 6: migrate `nutrition-plan`. Drop the 55s AbortController. Top-K=6 RAG. Five KB topics. PR + golden test.
*Verify:* `npm run build` + `npm run test` green; `STRAND_AI_PROVIDER_NUTRITION=claude` in Lovable Cloud Secrets.

**Step 21. [Paige]** — Smoke test nutrition-plan with `force: true` (signature-cache busted). Verify diet/avoid cards reference your actual flagged markers, your heritage, your medications. Time the response — if Opus + RAG exceeds 60s, ping me.
*Verify:* every card cites at least one specific data point; no generic "leafy greens" without naming the actual food. **No Publish click — server-only.**

**Step 22. [Claude Code]** — Step 7: migrate `blood-ai-summary` — runs in **A/B mode first**. New code path is gated behind `STRAND_AI_PROVIDER_BLOOD=parallel`, which makes the function run BOTH the Lovable+Gemini call and the Anthropic+Claude call, log both outputs, return Lovable to the user. No user-facing flip.
*Verify:* logs from a few real invocations show both outputs side-by-side; user-facing summary is unchanged from the Gemini result.

**Step 23. [Paige]** — Eyeball the parallel logs across 5–10 real beta blood profiles. Confirm the Claude output covers every flagged marker, hair_impact reads in Paige's voice, priority_actions are equally specific or better.
*Verify:* zero "missed flagged markers" across the sample. Any miss = stop, ping me.

**Step 24. [Claude Code]** — Flip `STRAND_AI_PROVIDER_BLOOD=claude`. Single-line PR (env-only change).

**Step 25. [Paige]** — User-facing test: open BloodAiSummary on your account. Force regenerate.
*Verify:* output is recognisably equivalent or better than what you saw under Gemini. **No Publish click — server-only.**

**Step 26. [Claude Code]** — Step 8: migrate `journal-encouragement`. Add `buildAiContext()` to `useJournalEncouragement.ts`. Add Postgres `rate_limits` table + RLS policy + per-IP rate-limit logic in the function. PR + golden test.
*Verify:* `npm run build` + `npm run test` green; `STRAND_AI_PROVIDER_JOURNAL=claude` in Lovable Cloud Secrets.

**Step 27. [Paige]** — **Click Publish → Update in Lovable** (client change shipped). Hit `/journal` from a fresh session. Banner copy should reference at least one specific signal (entry count, recent goal title, days-since-last-wash). Try ~12 reloads from the same IP — at the rate-limit threshold, banner should fall back to a static encouragement string with HTTP 429.
*Verify:* personalised when allowed; rate-limited gracefully when not.

**Step 28. [Paige → Claude Code] HAND-OFF #3** — *"All 9 migrated functions verified. transcribe-audio stays on Gemini. Proceed to Phase 2 close-out."*

**Step 29. [Claude Code]** — Close-out PR: delete `claude-smoke`. Update `AUDIT.md` to reflect Phase 2 state. Update `KNOWN_ISSUES.md` (clear heat-treatment item).
*Verify:* git log shows the close-out commit; no orphaned admin-only edge functions remain.

**Step 30. [Paige]** — 1-week production soak. Monitor `ai_summaries` write rate, observed Claude latency, error rate.
*Verify:* error rate ≤ baseline Gemini rate; p95 latency within 1.5× of pre-migration baseline.

**Step 31. [Paige]** — Mark Phase 2 closed in `PHASE_2_AUDIT.md` (this file) when the soak completes clean.

### Done criteria
- ✅ All 9 Claude-targeted functions deployed and exercised on real production traffic.
- ✅ All KB topics + manuscript chunks indexed and queried from at least one production call each.
- ✅ Persona deduplicated to one file.
- ✅ Cors deduplicated to one file.
- ✅ Per-function `STRAND_AI_PROVIDER_<FN>=claude` for every migrated function; **no global flag exists**.
- ✅ All known issues from §6 resolved.
- ✅ `transcribe-audio` decision (stays on Gemini) explicitly recorded.
- ✅ AUDIT.md updated; KNOWN_ISSUES.md updated.
- ✅ 1-week soak window error rate ≤ pre-migration baseline.

### Hand-off summary

| Hand-off | After step | Paige says |
|---|---|---|
| H1 | Step 2 | "Audit approved. Persona at <location>. Manuscript PDF at <bucket-key>. Proceed with Step 0." |
| H2 | Step 7 | "Foundation deployed. KB and manuscript indexed (<N> chunks). Proceed with per-function migrations." |
| H3 | Step 28 | "All 9 migrated functions verified. transcribe-audio stays on Gemini. Proceed to Phase 2 close-out." |
| (final) | Step 31 | "Phase 2 closed." |

Between hand-offs: Claude Code does not deploy production-side changes that aren't gated behind a `STRAND_AI_PROVIDER_<FN>` env flag. Every cutover is Paige flipping the per-function flag. No silent re-pointing of user-facing functions, no global flag flip.

---

## 9. Deploy mechanics reminder

Lovable Cloud auto-deploys edge functions and migrations on git push. Frontend changes require a manual Publish → Update click in the Lovable panel.

**Phase 2 is overwhelmingly edge-function work, so most steps deploy on push.** Exactly two client-side touches require a manual Publish click:

| Client change | Step | Requires Publish click |
|---|---|---|
| `src/components/MyToolsSection.tsx` — pass `buildAiContext()` to `tool-analyse-url` | **Step 4b** (verified at runbook Step 15) | **Yes** |
| `src/hooks/useJournalEncouragement.ts` — pass `buildAiContext()` to `journal-encouragement` | **Step 8** (verified at runbook Step 27) | **Yes** |

Everything else (the 9 edge functions including `_shared/`, the `manuscript_chunks` migration, the indexer, the `rate_limits` table) auto-deploys on push. The runbook calls out the two Publish clicks explicitly at runbook Steps 15 and 27.

---

## Decisions log (confirmed by user, 2026-04-26)

| # | Question | Decision |
|---|---|---|
| 1 | Embedding model | OpenAI `text-embedding-3-small` (1536 dims). Confirmed. |
| 2 | Manuscript source format | **PDF.** Claude Code does PDF→markdown locally before invoking the indexer — no runtime PDF dependency in any edge function. |
| 3 | `STRAND_AI_PROVIDER` granularity | **Strictly per-function.** Each migrated function gets its own env entry (`STRAND_AI_PROVIDER_INGREDIENT`, `_PRODUCT_PHOTO`, `_PRODUCT_URL`, `_TOOL_URL`, `_WASH_OBSERVATION`, `_HEAT_RATIONALE`, `_NUTRITION`, `_BLOOD`, `_JOURNAL`). **There is no global flag.** Rollback is surgical, one function at a time. |
| 4 | Smoke tests in CI | ~10 contract tests, one per migrated function (9 migrations + 1 foundation persona/cors test). |
| 5 | `journal-encouragement` rate-limit storage | **Postgres `rate_limits` table** (Phase-1-style RLS, durable across edge-function cold starts). Not in-memory, not Redis. |
| 6 | A/B parallel-output scope | **`blood-ai-summary` only.** `nutrition-plan`'s signature-cache makes parallel-output awkward; the output is also more visible to the user (each card cites real data) so quality regressions show up in normal smoke testing. |
| 7 | Heat Hat carve-out | KB topic 11 stays **generic**. **No placeholder hook**, no commented reference, no `is_tt_product` field, no specific tool brand mentioned. Phase 2+ backlog (runtime overlay only). |

**Additional asks attached to the approval (2026-04-26):**
- **§5 Step 4 split** into Step 4a (`product-analyse-url`, server-only, no Publish click) + Step 4b (`tool-analyse-url`, server migration + `MyToolsSection.tsx` client change → Publish click).
- **§5 Step 5 split** into Step 5a (`wash-day-observation`, clean port, no fallback gymnastics) + Step 5b (`heat-treatment-rationale`, fix-and-migrate in one PR, separate PR from 5a so corsHeaders/fallback fixes can be reverted independently).
- Per-function `STRAND_AI_PROVIDER_<FN>` flags strengthened — strictly no global flag (already reflected throughout §5, §6, §8, the hand-off summary).

---

**Approved 2026-04-26 with the decisions above and the §5 splits. Awaiting the canonical `STRAND_PERSONA` text and the manuscript PDF location before Hand-off #1. After Hand-off #1 I begin Step 0 (foundation) — no per-function migrations until Hand-off #2.**

---

## Audit revisions

### 2026-04-26 — Step 3 gains autonomous web research (Paige's request)

Stage-2 Claude smoke testing of `ingredient-analysis` passed cleanly. While reviewing the upcoming Step 3 spec ahead of implementation, Paige decided that **`product-analyse` should not stay vision-only**. The user goal — "take a photo of a product and get the same depth of analysis you'd get if you'd handed me the URL" — cannot be met from a single photo when the ingredient list is folded, partially printed, or hidden behind brand text. Step 3 must therefore close the gap to Step 4a's URL flow by **searching the web itself** for canonical product details whenever the visible label is insufficient.

**What changed in §5 Step 3:**
1. **Tool list:** vision content block + new **`web_search` tool** (Anthropic native, Sonnet 4.6 supports it) + existing `return_product_analysis` tool_use. `max_uses: 4` per call — enough to identify the product, optionally cross-check INCI, optionally pull brand/formulation context, optionally check a retailer fact. Tight upper bound, autonomous within it.
2. **Token cost:** revised from ~$0.014/call to **~$0.03–0.05/call** to account for ~2–3 `web_search` invocations at ~$0.01/search plus additional output tokens from synthesised research. Vision+research is now the most expensive Phase 2 per-call op; §6 cost model needs to absorb this when projections are recomputed pre-launch.
3. **Schema:** **unchanged.** `return_product_analysis` is identical. What changes is *how* Claude fills it (vision-only → vision+research). Existing client rendering in `useProductScan.ts` and `ProductDetailNew.tsx` is untouched.
4. **Persona:** the formal `Read more — How To Love Your Afro, Chapter X: [Title], p.[page]` footer remains **reserved for book-derived guidance**. Web-derived product facts (brand site, retailer page, INCI database) are referenced inline in `ai_summary` / `tips` in natural prose. New explicit instruction added to `task_instructions`: *"When citing facts, distinguish book-derived guidance from web-derived product facts. Web sources can be referenced inline naturally in prose; book citations get the formal 'Read more — …' line on its own line at the end."*
5. **New verification step (§8 Step 11b):** before declaring Step 3 green, Paige photographs a TT product whose ingredient list is on a foldable insert / hidden side panel and confirms `ingredients[]` returns the **full** INCI via web_search (not just OCR of the visible fragment), with persona footers and inline web citations behaving per the rule above.
6. **Rollout flag:** unchanged — `STRAND_AI_PROVIDER_PRODUCT_PHOTO=claude`, per-function only, no global flag.

**What did NOT change:**
- **Step 4a (`product-analyse-url`)** scope is unchanged. URL flow continues to start from a known URL, scrape via Firecrawl/fallback, and call `return_product_analysis`. The schema unification with Step 3 is preserved (`_shared/schemas.ts`).
- **The boundary between Steps 3 and 4a** is now: Step 3 starts from a **photo with partial info** and resolves to canonical via autonomous web search; Step 4a starts from a **URL the user provides** and scrapes that page directly. Both produce the same payload.
- **Steps 4b, 5a, 5b** structure and per-function flags are untouched.
- **Per-function `STRAND_AI_PROVIDER_<FN>` flags** remain strictly per-function. No global flag introduced.

