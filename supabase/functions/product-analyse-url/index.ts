// Analyses a product URL for THIS user and returns the standard
// ProductAnalysisPayload. Phase 2 Step 4a: dual-path — Lovable+Gemini
// (legacy, Firecrawl-scraped) and Claude Sonnet 4.6 (new, native
// web_fetch + web_search), gated by STRAND_AI_PROVIDER_PRODUCT_URL.
//
// Architecture (audit PHASE_2_AUDIT.md §5 Step 4a, 2026-05-01):
//   - Schema `return_product_analysis` lives in _shared/schemas.ts and is
//     SHARED with product-analyse (Step 3) so the React renderer
//     (IngredientDetail.tsx, useProductUrlScan.ts) sees identical
//     payloads for both flows.
//   - Forced KB topics: porosity, scalp-conditions, diagnosed-conditions.
//     selectTopicsForContext layers in extras up to a cap of 4.
//   - No RAG (web is the per-product fact channel; the manuscript RAG
//     channel remains book-only).
//   - Anthropic native web_fetch tool retrieves the page; web_search
//     fallback when the page is JS-rendered or gated. Combined max_uses
//     across both tools is bounded — tight upper bound on cost.
//   - Cache by `ai_summaries.kind = "product_analyse:<productKey>"`. URL
//     flow always has a productKey because the URL itself is a stable
//     identifier — when the caller doesn't supply one, hash the URL.
//   - Provenance stamped on every payload: _model_version,
//     _generated_at, _provider, _used_web_search, _web_search_count, _used_web_fetch.
//   - Logging: usage tokens + tool counts + sanitised search/fetch URLs
//     only. Never the analysis body.
//
// Provider flag — STRAND_AI_PROVIDER_PRODUCT_URL:
//   default "lovable" (legacy Firecrawl + Gemini path, unchanged).
//   "claude"        (new Sonnet 4.6 + web_fetch path).
//   Independent of STRAND_AI_PROVIDER_PRODUCT_PHOTO so URL and photo
//   paths can be toggled separately. Read at call time so a flag flip
//   in Lovable Cloud Secrets takes effect on the next invocation.
//
// CRITICAL: do NOT remove the Lovable+Gemini path. The flag defaults to
// "lovable"; Paige flips to "claude" only after manual verification.

import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { scanRetrievalQuery } from "../_shared/scan-rag-query.ts";
import { sseResponse, type SseEmit } from "../_shared/sse.ts";
import { checkKillSwitch } from "../_shared/kill-switch.ts";
import { checkDailyCap, checkGlobalCeiling } from "../_shared/usage-cap.ts";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { scanErrorResponse, withScanDiagnostics } from "../_shared/scan-error-log.ts";
import { createPartialEmitter } from "../_shared/partial-emitter.ts";
import { logScanTiming } from "../_shared/scan-timing-log.ts";
import { startCpuMeter } from "../_shared/cpu-meter.ts";
import { saveScanRecovery } from "../_shared/scan-recovery.ts";
import { retrievalStatsSince, retrievalStatsSnapshot } from "../_shared/rag.ts";
import { readAiProvider } from "../_shared/flags.ts";

import { buildTipsLevelBlock, coerceTipsLevel, type TipsLevel } from "../_shared/tips-level.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
} from "../_shared/book-chapters.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import {
  applyFieldNulls,
  enforceAnalysisFailsafes,
  loadIngredientVocabulary,
  productProseFields,
} from "../_shared/analysis-failsafes.ts";
import { logContentIntegrityRejections } from "../_shared/content-integrity.ts";
import { alignFitLanguage } from "../_shared/fit-band.ts";

import {
  callClaude,
  type ContentBlockInput,
  type ServerTool,
} from "../_shared/anthropic-client.ts";
import {
  RETURN_PRODUCT_ANALYSIS_SCHEMA,
  type ProductAnalysisPayload,
} from "../_shared/schemas.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { currentProfileHash } from "../_shared/profile-snapshot.ts";
import {
  runTier1,
  tier1Block,
  tierContext,
  tierRulesBlock,
  type ProductSignals,
} from "../_shared/tiers.ts";
import { SURFACTANT_STRENGTH_RULES } from "../_shared/surfactant-strength.ts";
import {
  SCORE_REASONS_RULES,
  sanitiseScoreReasons,
  alignScoreWithReasons,
  firstSentence,
} from "../_shared/score-reasons.ts";
import {
  PURPOSE_INSIGHT_RULES,
  sanitisePurposeInsight,
} from "../_shared/purpose-insight.ts";
import { NON_PRESCRIPTIVE_RULES } from "../_shared/non-prescriptive.ts";
import { STYLE_WEIGHTING_RULES } from "../_shared/style-weighting.ts";
import { FLAGGED_INGREDIENTS_RULES } from "../_shared/flagged-ingredients.ts";
import { decideUrlSearch } from "../_shared/search-gate.ts";
import { describeProfileFields, logScoreDebug, scoreBreakdown } from "../_shared/score-debug.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

// v5 invalidates scans cached before product-specific hero-image extraction.
const MODEL_VERSION = "claude-sonnet-4-6@v29-decrypt-status-2026-09-02";
const LOVABLE_MODEL_VERSION = "lovable-firecrawl@v29-decrypt-status-2026-09-02";


function levelCap(level: TipsLevel): number {
  if (level >= 3) return 4;
  if (level === 2) return 3;
  return 1;
}

const INVALID_URL_MESSAGE =
  "STRAND needs a valid product page URL to analyse.";

interface RequestBody {
  url?: string;
  /** Optional product cache key. When omitted, the function hashes
   *  `url` so URL-flow calls are still cached deterministically. */
  productKey?: string;
  context?: Record<string, unknown> & {
    hairProfile?: Record<string, unknown>;
    healthProfile?: Record<string, unknown>;
    bloodResults?: unknown[];
    flagged_ingredients?: string[];
  };
  force?: boolean;
  /** RECOVERY (2026-09-04): client-generated UUID; the finished payload is
   *  persisted under it before `complete` is emitted. */
  scan_id?: string;
  /** SPEED (2026-09-03): stream the analysis back as SSE (see _shared/sse.ts)
   *  so the member sees the real product details while the guarded verdict is
   *  still being written. Same pipeline either way. */
  stream?: boolean;
}

// ─── Selector context for KB topic matching ────────────────────────────
function buildSelectorContext(body: RequestBody): SelectorContext {
  const ctx = body.context ?? {};
  const hp = (ctx.hairProfile ?? {}) as Record<string, unknown>;
  const hl = (ctx.healthProfile ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : undefined;
  return {
    hair: {
      porosity: arr(hp.porosity),
      density: arr(hp.density),
      scalp: arr(hp.scalp_condition),
      diagnosed: arr(hp.diagnosed_conditions),
    },
    health: {
      lifeStage: arr(hl.life_stage),
      contraception: arr(hl.contraception),
      conditions: arr(hl.medical_conditions),
    },
    bloodResults: Array.isArray(ctx.bloodResults) ? ctx.bloodResults : [],
  };
}

// ─── URL hashing for cache key (when caller didn't supply productKey) ─
async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Task instructions for Claude (URL flow) ───────────────────────────
function buildTaskInstructions(tipsLevel: TipsLevel): string {
  const cap = levelCap(tipsLevel);
  return `You are receiving a product page URL. Use web_fetch to retrieve the page. Extract: product_name, brand, category, full INCI list (ingredients), usage instructions verbatim if present (usage_instructions). If the page is thin, gated, or in another language, use web_search to fill gaps from secondary sources. The output is identical in shape to the photo flow — return_product_analysis schema.

Voice for this task: every prose field follows the VOICE PRINCIPLES from the system block. Explain mechanism first, land verdict second; use connectives ("this means", "which is why", "so"); talk to "you" not "your hair"; translate any cosmetic-chemistry term on first use in a field; professional, direct, and never over-familiar.

Personalisation rules are identical to the photo flow (focus on hair type, hair goals, hair challenges directly affected by formulation; do NOT introduce tension/styling concerns, lab values, sleep, or dermatologist context unless the product mechanism directly addresses them; use 'consistently flagged ingredients' language never 'avoid list').

Tool budget: web_fetch and web_search share a combined cap of 4 invocations. Prefer ONE web_fetch on the supplied URL first. Only fall back to web_search if web_fetch returned a thin/empty body (page was JS-rendered, gated, or anti-bot-protected). Use web_search up to 3 times to find a cached version, the brand site direct, or a retailer mirror with the full INCI panel. Do NOT search if web_fetch already returned a clear brand + product name + full INCI.

Field rules — strict:
- product_name / brand: extracted from the page title, h1, or breadcrumbs. NEVER invent. If you can't determine confidently after fetch + search, return the closest readable text and start ai_summary with "Couldn't fully read the page —".
- category: pick the single best fit from the enum.
- application_area / leave_on: read STRICTLY off the page's own directions. application_area = "scalp" (scalp/partings only), "lengths_ends" (mid-lengths and ends only), "scalp_and_lengths" (whole head), "rinse_out" (applied then rinsed off during washing). leave_on = true when the directions say it stays on the hair, false when it is rinsed out. If the page does not say, return "unknown" and omit leave_on — NEVER guess from the product name or category.

- ingredients: full INCI list, lowercase, in label order. Prefer the canonical web-resolved list when the fetched page's list is partial or hidden behind tabs; otherwise transcribe what's visible.
- key_ingredients: pick 4–6 of the most decision-relevant. flag = "avoid" ONLY when the ingredient is in the member's DECLARED topical sensitivities / documented allergies, or has a documented mechanism that conflicts with their measurable hair/health profile (e.g. drying alcohols on high porosity or sulphates with dry scalp). flag = "good" when the ingredient appears in their high_rated_products or has a documented mechanism that benefits their measurable traits. flag = "warn" otherwise. Existence of a standard preservative / fragrance / colourant is NOT a reason to flag "avoid". history.flagged_ingredients is a NEUTRAL frequency count of ingredients she already owns (3+ saved products) and is NEVER a reason to flag "avoid".
- match_score: 0–100. Weight it on category fit, documented ingredient mechanisms against their measurable traits, declared sensitivities, the durable style pattern they usually wear (default_style), blood-marker deficiencies (only when relevant to the product), and goal alignment. NEVER let current_hairstyle or days_in_style move the score. NEVER reduce the score because the formula contains ingredients she already owns frequently — ownership frequency is not a fit signal in either direction.
- ai_summary: 2–3 sentences MAXIMUM. Open by naming the SPECIFIC user signal that's driving the call (porosity, density, a goal, scalp condition, a challenge — never the style they're in, and never the fact that ingredients recur across her shelf) and what that means for THIS formula — then land the verdict (good fit / mixed fit / poor fit) in the next sentence, bridged with a connective ("which is why", "so", "this means"). Don't restate the same signal twice.
- usage_instructions: VERBATIM directions from the manufacturer if visible on the page. If no manufacturer directions are available, return "" — never invent or paraphrase.
- use_cases: MAXIMUM ${cap} items (this user's support level caps it here). Each item: ONE action sentence up to 30 words that NAMES the hair trait it is written for — curl type, porosity, density, width, scalp condition, length, goal or listed challenge — plus ONE "why" sentence up to 15 words on what that trait means for how they use it. Pick the ${cap} tips that most improve results on THIS user's hair type; a tip that would read identically for any hair type is INVALID. Do NOT repeat manufacturer directions.
- tips: MAXIMUM ${cap} items, same word budget. Pick the ${cap} most relevant personal signals for THIS product. Not every signal in the user's profile is relevant to every product.

PERSONALISED APPLICATION DEPTH — LEVELS 3-4 ONLY: at this support level, at least one use_cases item (and routine_suggestion, when populated) must give real application detail grounded in the retrieved manuscript passages: how much to use for this user's density/length, sectioning, exactly where this product sits in THIS user's wash-day sequence (Chapter 13 two-cleanse-then-condition baseline) and their 7-day wash rhythm, and what on their shelf to pair with or avoid pairing with. At levels 1-2, give only the single highest-priority instruction, still concrete never generic.

MATCH SCORE — RE-REASON EVERY TIME, NEVER ANCHOR: match_score must be re-derived from scratch on every generation using ONLY this user's current profile — goals, porosity, hair characteristics, and any flagged blood markers relevant to this product — weighed against the product's actual ingredients. NEVER anchor the score to the product's marketing claims, brand reputation, or a generic "good product" judgement.
- pair_with: OPTIONAL. Up to 3 items from the user's shelf (context.shelf), high_rated_products, or existing tools/favourites that would layer well with THIS product for THIS user. Reference each by real name and brand. Each entry: { item, why } where "why" is one sentence tying the pairing to a user hair goal, challenge, hair characteristic, or wash-day step. Return [] if nothing on the shelf pairs meaningfully. NEVER invent products or tools.
- routine_suggestion: OPTIONAL. 1–2 short sentences slotting THIS product into the user's routine — reference their most recent wash-day steps, cadence, or how long the hair has been worn up (a duration, never a style name) when relevant. Empty string if nothing meaningful.

Grounding rule: when your guidance is rooted in the retrieved manuscript passages, reason from them and blend the underlying idea into your prose in STRAND's voice — do NOT name the book, its author, chapters, or page numbers, and do NOT emit any "Read more — …" line. When facts come from the fetched page or web_search (e.g. "the brand's site states this is a low-pH cleanser"), reference them inline naturally in prose. Never claim something "comes from the book" unless the specific point is supported by a retrieved passage.

WASH-DAY BASELINE — HARD RULE:
When THIS product is a shampoo, cleanser, co-wash, conditioner, deep conditioner, mask, or anything that belongs in wash day, apply the Chapter 13 routine as the default logic: cleanse the scalp first with a cleansing/all-purpose shampoo, cleanse the hair second with a moisturising/conditioning shampoo, then condition. Do not present co-wash as a replacement for shampoo cleansing. Adapt for protective styles or scalp sensitivity without abandoning the need to clean both scalp and hair.

${SURFACTANT_STRENGTH_RULES}

MOISTURE — NON-NEGOTIABLE LANGUAGE RULE:
Moisture comes from water. Products do NOT add, restore, replace, infuse, replenish, deliver, hydrate-from-scratch, or otherwise create moisture. They seal it in, lock it in, help it stay, slow water loss, or improve absorption of the water already there. Use this phrasing only.

Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition.

PRODUCT ANALYSIS SCOPE — HARD RULE:
When personalising a product analysis, focus ONLY on signals that intersect with what's INSIDE the product: ingredients, mechanism of action, formulation, application method.

Signals that ARE relevant for product analysis:
- Hair type (curl pattern, density, porosity, length, elasticity, scalp condition)
- Hair goals (length retention, definition, moisture retention, strength)
- Hair challenges directly affected by formulation (dryness, breakage, build-up, scalp condition, heat damage history)

Signals that are NOT relevant for product analysis (do NOT mention these in product output — not in ai_summary, key_ingredients[].reason, use_cases, or tips):
- Tension or styling-related concerns (traction alopecia, tight braids, weight of styles) — these are HANDLING concerns, not formulation concerns. A leave-in conditioner has no tension implications. Do NOT cite tension or traction alopecia in any product analysis unless the product is specifically a tension-related treatment.
- Lab values (ferritin, vitamin D, thyroid etc.) unless THIS specific product directly addresses them.
- Sleep, stress, cortisol — systemic concerns, not product-fit concerns.
- Dermatologist consultation context — only relevant if the product directly intersects with what the dermatologist is treating.

Rule of thumb: if you cannot draw a line from one of the product's INGREDIENTS to the user signal, DON'T cite that signal. The output should be SHORTER if the user profile has less to draw from, not padded with irrelevant context.

LANGUAGE RULE — NEVER use the phrase "avoid list", "avoid ingredients", "your avoids", "ingredients on your avoid list", "things to avoid", or imply the user has any list of ingredients they want to avoid. The only ingredient-history signal that exists in STRAND is "consistently flagged ingredients" — ingredients that appear in 3+ of the user's saved-and-favourited products that they're actively using. Use phrasing like "consistently flagged in your history", "ingredients you've flagged across your favourites", or "appears across 3+ products on your shelf and favourites". This applies to EVERY output field.

CLARIFYING GUIDANCE — HARD RULE:
Never recommend a chelating shampoo as routine advice. If residue or build-up is relevant to THIS product, point to a gentle clarifying shampoo followed by a deep conditioner after any clarifying step, and let the user judge how often they reach for it from how their hair responds. A true chelating treatment should be discussed with a trichologist first. Do NOT use the words "chelating shampoo" or "chelator" as a recommendation in ai_summary, use_cases, or tips. ("Chelator" can still appear as a neutral cosmetic-chemistry category label in key_ingredients when describing what an ingredient like EDTA is.)

${SCORE_REASONS_RULES}

${PURPOSE_INSIGHT_RULES}

${NON_PRESCRIPTIVE_RULES}

${STYLE_WEIGHTING_RULES}

${FLAGGED_INGREDIENTS_RULES}`;

}

// ─── Provider: Claude ──────────────────────────────────────────────────
async function runClaude(args: {
  url: string;
  context: Record<string, unknown>;
  selectorContext: SelectorContext;
  /** Page text we already fetched server-side. When present Claude does not
   *  need an agentic web_fetch round-trip, which halves wall-clock time. */
  pageText?: string | null;
  pageTitle?: string | null;
  /** TIERS (Part 3): deterministic Tier 1 findings + which tiers are visible. */
  tierBlock?: string;
  /** SPEED: when set, the model call streams and this receives the accumulated
   *  tool JSON. Preview only — the caller still gets the fully parsed result. */
  onPartialJson?: (accumulatedJson: string) => void;
}): Promise<{
  payload: ProductAnalysisPayload;
  web_search_invocations: number;
  web_fetch_invocations: number;
}> {
  const preScraped = (args.pageText ?? "").trim();
  const havePage = preScraped.length > 400;

  const pageBlock = havePage
    ? `Page content already fetched for you (title: ${args.pageTitle || "unknown"}). Use THIS as your primary source — do NOT call web_fetch unless the brand or INCI list is genuinely missing below:
"""
${preScraped.slice(0, 18000)}
"""

If the brand name or full ingredient list is missing above, then use web_search (cap 2) to fill only that gap. If no search tool is available to you, work from the page content and the ingredient list exactly as supplied.`
    : `Use web_fetch on this URL first. If the fetched body is thin, gated, or missing the brand/INCI, fall back to web_search (combined cap of 4 across both tools).`;

  const userText = `Product page URL to analyse: ${args.url}

${pageBlock}

Return JSON only via the return_product_analysis tool.

User context (use to compute key_ingredients flags, match_score, ai_summary, use_cases, and tips):
${JSON.stringify(args.context ?? {}, null, 2)}`;

  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const webFetchTool: ServerTool = {
    type: "web_fetch_20250910",
    name: "web_fetch",
    max_uses: havePage ? 1 : 2,
  };
  // CONDITIONAL SEARCH (2026-09-01): when the prefetched page already carries
  // the brand, the name and a real INCI panel, the tool is not attached at all
  // — the page IS the source. A thin/gated page keeps the full budget.
  const searchDecision = decideUrlSearch({ havePage, pageText: preScraped });
  const webSearchTool: ServerTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: searchDecision.maxUses,
  };
  console.log(JSON.stringify({
    function: "product-analyse-url",
    event: "search_gate",
    enabled: searchDecision.enabled,
    max_uses: searchDecision.maxUses,
    reason: searchDecision.reason,
  }));


  const tipsLevel = coerceTipsLevel((args.context as Record<string, unknown> | undefined)?.tipsLevel);
  const req = await buildClaudeRequest({
    function_kind: "product-analyse-url",
    task_instructions: `${buildTaskInstructions(tipsLevel)}${args.tierBlock ?? ""}`,
    user_payload: {},
    user_content: userContent,
    user_context: args.context,
    selector_context: args.selectorContext,
    force_topic_ids: [
      "wash-day-mechanics",
      "porosity",
      "scalp-conditions",
      "diagnosed-conditions",
    ],
    // TARGETED RETRIEVAL (2026-09-04). The prefetched page carries the real
    // INCI panel and claims, so the four retrieved passages are chosen from
    // THIS formula plus THIS member's recorded signals rather than a fixed
    // keyword string plus the raw URL (which was pure embedding noise).
    rag_query: scanRetrievalQuery({
      context: args.context ?? {},
      pageText: preScraped || null,
      productName: args.pageTitle ?? null,
    }),
    rag_k: 4,
    tool: {
      name: "return_product_analysis",
      description:
        "Return the structured product analysis. Always invoke this tool exactly once at the end with the final analysis.",
      input_schema: RETURN_PRODUCT_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    },
    server_tools: searchDecision.enabled ? [webFetchTool, webSearchTool] : [webFetchTool],
    // See product-analyse: long ingredient panels truncated at 4096 and the
    // truncated tool call cost a full retry.
    max_tokens: 8192,
  });

  const result = await callClaude<ProductAnalysisPayload>({
    ...req,
    onPartialJson: args.onPartialJson,
  });

  const byName = result.server_tool_use_by_name ?? {};
  const web_search_invocations = byName["web_search"] ?? 0;
  const web_fetch_invocations = byName["web_fetch"] ?? 0;

  console.log(
    JSON.stringify({
      function: "product-analyse-url",
      provider: "claude",
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
      web_fetch_invocations,
      web_search_invocations,
      web_search_queries: result.server_tool_use_queries ?? [],
      url_host: (() => {
        try {
          return new URL(args.url).host;
        } catch {
          return "invalid";
        }
      })(),
    }),
  );

  if (!result.toolInput) {
    throw new Error("Claude returned no return_product_analysis tool_use block");
  }
  return {
    payload: result.toolInput,
    web_search_invocations,
    web_fetch_invocations,
  };
}

// ─── Provider: Lovable+Gemini (legacy, Firecrawl scrape) ───────────────
const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

import { allChallenges, challengeText, challengesOf } from "../_shared/challenges.ts";
import {
  buildGroundingBlock,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";
import { gatewayFetch } from "../_shared/ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "product-analyse-url", stage: 2 } as const;


function buildLovableSystem(tipsLevel: TipsLevel): string {
  const cap = levelCap(tipsLevel);
  return `${STRAND_PERSONA_WITH_RULES}

TASK
You are analysing a product page that the user has pasted as a URL, in Paige's voice.

ABSOLUTE RULES
1. READ the product directly from the page text. The brand and product title
   are usually in the page <title>, h1, or breadcrumbs. NEVER invent a name —
   if you can't determine it confidently, set "ai_summary" to start with
   "Couldn't fully read the page —".
2. If the page lists ingredients (often labelled "Ingredients", "INCI", or
   "Full ingredients"), transcribe ALL of them into "ingredients" (lowercase,
   comma-separated source split into array). If only some are visible, return
   what you see — do not pad.
3. Personalise everything to the user's profile passed in context: hairProfile
   (porosity, texture, density, scalp), currentStyle (background context only —
   see the style weighting rules), goals (each with a "challenge" the user
   wrote and an optional "target_text"), bloodResults,
   healthProfile (medications, conditions), history.flagged_ingredients (a
   NEUTRAL frequency count of ingredients appearing in 3+ of her saved
   products — no safety or suitability meaning), history.low_rated_products
   and history.high_rated_products.
4. RED/GREEN FLAG LOGIC for key_ingredients[].flag:
   - "avoid" if in the member's declared topical sensitivities / documented
     allergies OR appears in any history.low_rated_products[].ingredients OR is
     contraindicated by their hair/health profile OR works against a stated
     goal/challenge. NEVER because of history.flagged_ingredients.
   - "good" if in
     history.high_rated_products[].ingredients OR well-matched to their
     porosity/texture/scalp OR directly supports a stated goal/challenge.
   - "warn" for neutral-but-noteworthy.
5. match_score (0–100): lower sharply for "avoid" flags; raise for "good";
   consider category fit, the durable style pattern they usually wear
   (default_style), blood-result deficiencies, and goal alignment. Ownership
   frequency (history.flagged_ingredients) must NEVER reduce the score.
   current_hairstyle and days_in_style must never move the score.
6. ai_summary: 2 short sentences MAX, second-person, in Paige's voice. The FIRST sentence cites
   a specific reason from THIS user's context — prefer their goal, challenge
   or a durable hair characteristic, never the style they're in. 7. usage_instructions: VERBATIM manufacturer directions. If the page contains
   a "Directions", "How to use", "Apply" or "Usage" block, transcribe it
   word-for-word into this field. If no manufacturer directions are visible
   on the page, set this to an empty string ("") — do NOT invent or
   paraphrase. This is the manufacturer's voice; keep it untouched.
 8. use_cases: MAXIMUM ${cap} concrete tips for how THIS user gets the MOST out of the
    product on their hair type specifically (their support level caps it at ${cap}).
    Each item is ONE action sentence up to 30 words that NAMES the trait it is written
    for — curl type, porosity, density, width, scalp condition, length, a
    goal or a listed challenge — plus ONE "why" sentence up to 15 words. A tip that
    would read identically for any hair type is INVALID.
    Do NOT repeat the manufacturer's directions verbatim here; build on them
   with personal reasoning.
8b. tips: MAXIMUM ${cap} items, same word budget, anchored in the user's own data.
8c. PERSONALISED APPLICATION DEPTH — LEVELS 3-4 ONLY: at this support level, at
   least one use_cases item must give real application detail grounded in the
   retrieved manuscript passages: how much to use for their density/length,
   sectioning, where this product sits in their wash-day sequence (Chapter 13
   two-cleanse-then-condition baseline) and their 7-day wash rhythm, and what on
   their shelf to pair with or avoid. At levels 1-2, give only the single
   highest-priority instruction, still concrete never generic.
8d. MATCH SCORE — re-derive match_score from scratch every time from THIS user's
   goals, porosity, hair characteristics and flagged blood markers weighed against
   the product's actual ingredients. NEVER anchor it to marketing claims, brand
   reputation, or a generic "good product" judgement.
9. Output STRICT JSON only. No prose, no code fences.

${SURFACTANT_STRENGTH_RULES}

SCHEMA
{
  "product_name": string,
  "brand": string,
  "category": "shampoo"|"conditioner"|"treatment"|"styler"|"oil"|"mask"|"leave-in"|"other",
  "application_area": "scalp"|"lengths_ends"|"scalp_and_lengths"|"rinse_out"|"unknown",
  "leave_on": boolean|null,
  "ingredients": string[],

  "key_ingredients": [{"name": string, "benefit": string, "flag": "good"|"warn"|"avoid", "reason": string, "surfactant_role": "primary"|"secondary"|"none"}],
  "match_score": number,
  "score_reasons": [{"direction": "plus"|"minus", "factor": string, "reason": string}],
  "ai_summary": string,
  "usage_instructions": string,
  "use_cases": string[],
  "tips": string[]
}

${SCORE_REASONS_RULES}

${PURPOSE_INSIGHT_RULES}

${NON_PRESCRIPTIVE_RULES}

${STYLE_WEIGHTING_RULES}

${FLAGGED_INGREDIENTS_RULES}`;

}

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface ScrapeResult {
  title: string;
  text: string;
  imageUrl: string | null;
  source: "firecrawl" | "fetch";
}

/** Page chrome — flags, payment badges, logos, social icons, sprites — is
 * never the hero product shot. When we fall back to "first image on the
 * page" we must skip these or we end up prefilling a union jack.
 *
 * Tested against the FILENAME only: retailer CDN directory names routinely
 * contain words like logo, icon, badge, secure, search, menu, cart, support
 * and help, and matching the whole URL discarded real product shots. */
const CHROME_RE =
  /(union[-_]?jack|\bicon\b|^icons?[-_.]|[-_]icon[-_.]|logo|sprite|payment|visa|mastercard|amex|paypal|klarna|applepay|gpay|trustpilot|placeholder|spinner|loader|1x1|blank|transparent|burger|chevron)/i;

function imageFilename(u: string): string {
  const withoutQuery = u.split("?")[0].split("#")[0];
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function isLikelyProductImage(u: string | null | undefined): boolean {
  if (!u) return false;
  if (/^data:/i.test(u)) return false;
  const file = imageFilename(u);
  if (/\.(svg|gif)$/i.test(file)) return false;
  if (CHROME_RE.test(file)) return false;
  // A small declared size means a list-size variant, not junk — the client
  // requests a larger variant, so keep it.
  return true;
}

function firstMarkdownImage(md: string): string | null {
  const re = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (isLikelyProductImage(m[1])) return m[1];
  }
  return null;
}

function firstUsableImage(...candidates: Array<string | null | undefined>): string | null {
  return candidates.find((candidate) => isLikelyProductImage(candidate)) ?? null;
}


async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<ScrapeResult | null> {
  try {
    const resp = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 400,
      }),
      signal: AbortSignal.timeout(18_000),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("Firecrawl scrape failed", resp.status, errBody);
      return null;
    }
    const j = await resp.json();
    const data = (j?.data ?? j) as Record<string, unknown> | undefined;
    const markdown =
      (data?.markdown as string | undefined) ??
      ((data?.data as { markdown?: string } | undefined)?.markdown);
    const metadata =
      (data?.metadata as { title?: string; ogImage?: string; "og:image"?: string; image?: string } | undefined) ??
      ((data?.data as { metadata?: { title?: string; ogImage?: string; "og:image"?: string; image?: string } } | undefined)?.metadata);
    if (!markdown) {
      console.error("Firecrawl returned no markdown", JSON.stringify(j).slice(0, 500));
      return null;
    }
    // Firecrawl metadata can describe page chrome rather than the product
    // (the Cantu UK page reports its location-picker flag). Apply the same
    // chrome filter used by the HTML path before accepting metadata, then
    // fall back to the first usable image from the main product content.
    const imageUrl = firstUsableImage(
      metadata?.ogImage,
      metadata?.["og:image"],
      metadata?.image,
      firstMarkdownImage(markdown),
    );
    return {
      title: metadata?.title ?? "",
      text: markdown,
      imageUrl: imageUrl ?? null,
      source: "firecrawl",
    };
  } catch (e) {
    console.error("Firecrawl error", e);
    return null;
  }
}

function extractOgImageFromHtml(html: string): string | null {
  const toHttps = (u: string | null | undefined): string | null => {
    if (!u) return null;
    return u.startsWith("http://") ? "https://" + u.slice("http://".length) : u;
  };

  // Product-specific structured data outranks social metadata. Many commerce
  // pages use a generic og:image (or, in Cantu UK's case, a country flag) but
  // expose the true primary pack shot through Product JSON/catalog data.
  const catalogImage = html.match(/["']productImageURL["']\s*:\s*["']([^"']+)["']/i)?.[1];
  if (isLikelyProductImage(catalogImage)) return toHttps(catalogImage);

  const productContainer = html.match(
    /<div[^>]+class=["'][^"']*\bproduct-image\b[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i,
  )?.[1];
  if (isLikelyProductImage(productContainer)) return toHttps(productContainer);

  // Capture every og:image / og:image:secure_url / twitter:image meta tag,
  // handling BOTH attribute orders (property-then-content and
  // content-then-property). Then prefer secure_url > og:image > twitter:image
  // and prefer https over http when an equivalent pair exists.
  const found: Array<{ kind: "secure" | "og" | "twitter"; url: string }> = [];
  const patterns: Array<{ re: RegExp; kindIdx: number; urlIdx: number }> = [
    { re: /<meta\s+(?:property|name)=["'](og:image:secure_url|og:image|twitter:image)["']\s+content=["']([^"']+)["']/gi, kindIdx: 1, urlIdx: 2 },
    { re: /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](og:image:secure_url|og:image|twitter:image)["']/gi, kindIdx: 2, urlIdx: 1 },
  ];
  for (const { re, kindIdx, urlIdx } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const tag = m[kindIdx];
      const url = m[urlIdx];
      if (!url) continue;
      const kind = tag === "og:image:secure_url" ? "secure" : tag === "og:image" ? "og" : "twitter";
      found.push({ kind, url });
    }
  }
  // Prefer https; if only http available, rewrite to https. iOS Safari
  // blocks http images on https pages (mixed content) more aggressively
  // than desktop, so we enforce https before returning.
  const pickHttps = (list: typeof found): string | null => {
    const usable = list.filter((f) => isLikelyProductImage(f.url));
    const https = usable.find((f) => f.url.startsWith("https://"))?.url;
    if (https) return https;
    return toHttps(usable[0]?.url ?? null);
  };
  const secure = pickHttps(found.filter((f) => f.kind === "secure"));
  if (secure) return secure;
  const og = pickHttps(found.filter((f) => f.kind === "og"));
  if (og) return og;
  const tw = pickHttps(found.filter((f) => f.kind === "twitter"));
  if (tw) return tw;

  const container = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  const scope = container ? container[1] : html;
  // Explicit product-image markers first, then the first inline image that
  // isn't obvious page chrome (flags, payment badges, logos, icons).
  const marked = scope.match(/<img[^>]+(?:data-product-image|itemprop=["']image["'])[^>]*src=["']([^"']+)["']/i);
  if (marked && isLikelyProductImage(marked[1])) return toHttps(marked[1]);
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(scope)) !== null) {
    if (/^https?:\/\//i.test(m[1]) && isLikelyProductImage(m[1])) return toHttps(m[1]);
  }
  return null;
}


async function scrapeWithFetch(url: string): Promise<ScrapeResult | null> {
  try {
    const pageResp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!pageResp.ok) return null;
    const html = await pageResp.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return {
      title: titleMatch ? titleMatch[1].trim() : "",
      text: htmlToText(html),
      imageUrl: extractOgImageFromHtml(html),
      source: "fetch",
    };
  } catch (e) {
    console.error("plain fetch failed", e);
    return null;
  }
}

/** Follow retailer short links (amzn.eu/d/..., amzn.to, a.co, bit.ly) to the
 *  canonical product URL so scrapers and the model see a real product page. */
async function resolveShortLink(url: string): Promise<string> {
  let host = "";
  try { host = new URL(url).host.toLowerCase(); } catch { return url; }
  const isShort = /^(amzn\.(eu|to|asia|com))$|^a\.co$|^bit\.ly$|^t\.co$|^tinyurl\.com$|^s\.click\.aliexpress\.com$/.test(host);
  if (!isShort) return url;
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8_000),
    });
    const finalUrl = resp.url && resp.url !== url ? resp.url : url;
    try { await resp.body?.cancel(); } catch { /* ignore */ }
    console.log(JSON.stringify({ tag: "url-debug", phase: "shortlink resolved", from: url, to: finalUrl }));
    return finalUrl;
  } catch {
    return url;
  }
}

/** Page retrieval for the Claude path. Plain fetch first (fast), then Firecrawl
 *  when the retailer blocks or JS-renders the page (Amazon, Boots, Sephora) so
 *  the model still gets real product text instead of an anti-bot wall. */
async function prefetchPage(
  url: string,
): Promise<{ imageUrl: string | null; title: string; text: string }> {
  const empty = { imageUrl: null, title: "", text: "" };
  let result = empty as { imageUrl: string | null; title: string; text: string };
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      console.log(JSON.stringify({ tag: "url-debug", phase: "prefetch non-ok", status: resp.status }));
    } else {
      const html = await resp.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      result = {
        imageUrl: extractOgImageFromHtml(html),
        title: titleMatch ? titleMatch[1].trim() : "",
        text: htmlToText(html),
      };
    }
  } catch (e) {
    console.error("[url-debug] prefetch failed", e);
  }

  const blocked = result.text.length < 600 ||
    /automated access|to discuss automated|enter the characters you see|robot check|access denied|are you a human/i
      .test(result.text.slice(0, 4000));
  if (blocked) {
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (firecrawlKey) {
      const scraped = await scrapeWithFirecrawl(url, firecrawlKey);
      if (scraped && scraped.text.length > result.text.length) {
        result = {
          imageUrl: scraped.imageUrl ?? result.imageUrl,
          title: scraped.title || result.title,
          text: scraped.text,
        };
      }
    }
  }

  console.log(JSON.stringify({
    tag: "url-debug", phase: "prefetch done",
    image_url: result.imageUrl, text_len: result.text.length, used_firecrawl: blocked,
  }));
  return result;
}



async function runLovable(args: {
  url: string;
  context: Record<string, unknown>;
}): Promise<{ payload: ProductAnalysisPayload; image_url: string | null }> {
  const aiApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!aiApiKey) throw new Error("LOVABLE_API_KEY not configured");

  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

  let scraped: ScrapeResult | null = null;
  if (firecrawlKey) {
    scraped = await scrapeWithFirecrawl(args.url, firecrawlKey);
  }
  if (!scraped) {
    scraped = await scrapeWithFetch(args.url);
  }
  if (!scraped) {
    const e: Error & { status?: number } = new Error(
      "Couldn't reach that page. The retailer may be blocking automated access — try a different link or upload a screenshot of the ingredients label instead.",
    );
    e.status = 502;
    throw e;
  }

  const TRIM = 9_000;
  const trimmed = scraped.text.length > TRIM ? scraped.text.slice(0, TRIM) : scraped.text;

  const userMsg = `Analyse this product page and return strict JSON matching the schema.

URL: ${args.url}
Page title: ${scraped.title}
Scrape source: ${scraped.source}

Page content (markdown / text, truncated):
"""
${trimmed}
"""

User context (use to compute flags, match_score, ai_summary, and use_cases):
${JSON.stringify(args.context ?? {}, null, 2)}`;

  const tipsLevel = coerceTipsLevel((args.context as Record<string, unknown> | undefined)?.tipsLevel);
  const tipsBlock = buildTipsLevelBlock(tipsLevel);
  const groundingCtx = (args.context ?? null) as Record<string, unknown> | null;
  const grounding = await buildGroundingBlock({
    surface: "product-analyse-url",
    fn: "product-analyse-url",
    functionKind: "product-analyse-url",
    selectorContext: selectorFromAiContext(groundingCtx),
    forceTopics: ["wash-day-mechanics","porosity","scalp-conditions","diagnosed-conditions"],
    ragQuery: ragQueryFromAiContext(groundingCtx, "hair product ingredients suitability moisture protein scalp"),
    ragK: 4,
  });

  const aiResp = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${aiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: `${buildLovableSystem(tipsLevel)}\n\n${tipsBlock}\n\n${CHAPTER_WHITELIST_PROMPT}${grounding.block}` },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(35_000),
  });

  if (!aiResp.ok) {
    const status = aiResp.status;
    const t = await aiResp.text();
    console.error(`[product-analyse-url] lovable gateway ${status}: ${t.slice(0, 120)}`);
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = status;
    throw err;
  }

  const j = await aiResp.json();
  const txt: string = j.choices?.[0]?.message?.content ?? "{}";
  let out: ProductAnalysisPayload;
  try {
    out = JSON.parse(txt) as ProductAnalysisPayload;
  } catch {
    out = { raw: txt } as unknown as ProductAnalysisPayload;
  }
  return { payload: out, image_url: scraped.imageUrl };
}

// ─── Edge function entry ───────────────────────────────────────────────
Deno.serve(withScanDiagnostics("product-analyse-url", async (req: Request) => {
  const requestStartedAt = Date.now();
  if (req.method === "OPTIONS") return preflight();

  const kill = checkKillSwitch();
  if (kill) return kill;


  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    const body = (await req.json()) as RequestBody;
    {
      const ac = (body.context ?? {}) as Record<string, unknown>;
      const goalsArr = Array.isArray(ac.goals) ? ac.goals as Array<Record<string, unknown>> : [];
      console.log("[ai-context-server] received", {
        currentStyle: ac.currentStyle ?? null,
        currentGoals: goalsArr.map((g) => g.title).filter(Boolean),
        currentChallenges: allChallenges(goalsArr),
      });
    }

    // SPEED (2026-09-03): when the caller asks for a stream, the same pipeline
    // runs unchanged — every gate, cache check, guardrail and cache write —
    // but the deterministic Tier 1 findings and the partial model output are
    // pushed to the member as they land. Same wrapper product-analyse uses.
    const wantsStream = body.stream === true;
    const pipeline = async (
      emit: SseEmit | null,
    ): Promise<Record<string, unknown> | Response> => {
    // STEP 2 (2026-09-04) — per-phase timings for SUCCESSFUL scans. Counters
    // only: nothing below changes what is generated or how it is grounded.
    const requestStartedAt = Date.now();
    const cpuMeter = startCpuMeter();
    const retrievalAtStart = retrievalStatsSnapshot();
    let labelReadAt: number | null = null;
    let analysisStartedAt: number | null = null;


    // ── Input validation ────────────────────────────────────────────
    if (!body.url || typeof body.url !== "string") {
      return json(400, { error: INVALID_URL_MESSAGE });
    }
    let parsed: URL;
    try {
      parsed = new URL(body.url);
    } catch {
      return json(400, { error: INVALID_URL_MESSAGE });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return json(400, { error: INVALID_URL_MESSAGE });
    }
    const url = parsed.toString();

    const provider = readAiProvider("STRAND_AI_PROVIDER_PRODUCT_URL");

    // Cache key — URL is a stable identifier, so always cache. Use the
    // caller-supplied productKey when available; otherwise hash the URL.
    const productKey = body.productKey ?? (await sha256Hex(url));
    const cacheKind = `product_analyse:${productKey}`;

    // Compute profile hash up-front so we can use it for cache invalidation.
    const ctxEarly = body.context ?? {};
    const profileHashEarly = currentProfileHash(ctxEarly as Record<string, unknown>);

    // ── Cache check ────────────────────────────────────────────────
    if (!body.force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (existing?.payload) {
        const cached = existing.payload as ProductAnalysisPayload & { _profile_snapshot_hash?: string };
        const versionOk = provider === "claude"
          ? cached._model_version === MODEL_VERSION && cached._provider === "claude"
          : cached._provider !== "claude" && cached._model_version === LOVABLE_MODEL_VERSION;
        const hashOk = cached._profile_snapshot_hash === profileHashEarly;
        if (versionOk && hashOk) {
          return json(200, await sanitiseAndLog(cached, "product-analyse-url"));
        }
      }
    }

    // Spend protection: per-user daily cap (model-spend paths only).
    // Workspace-wide automatic brake (see _shared/usage-cap.ts).
    const ceiling = await checkGlobalCeiling("product-analyse-url");
    if (ceiling) return ceiling;

    const capped = await checkDailyCap(user.id, "product-analyse-url", 25);
    if (capped) return capped;

    const ctx = ctxEarly;
    const profileHash = profileHashEarly;
    let analysis: ProductAnalysisPayload;
    // Hoisted so the admin score-debug trail below can record which tiers
    // travelled and the profile order the model was actually given (2026-09-02).
    let tieredForDebug: ReturnType<typeof tierContext> | null = null;
    const t0 = Date.now();
    console.log(JSON.stringify({ tag: "url-debug", phase: "start", url, provider, profileHash }));

    if (provider === "claude") {
      // Fetch the page ourselves first (~1-2s) and hand the text to Claude so
      // it can answer in a single pass instead of an agentic web_fetch loop.
      console.log(JSON.stringify({ tag: "url-debug", phase: "before prefetch", ms: Date.now() - t0 }));
      const resolvedUrl = await resolveShortLink(url);
      const pre = await prefetchPage(resolvedUrl);
      labelReadAt = Date.now();
      const ogImage = pre.imageUrl;
      analysisStartedAt = Date.now();
      console.log(JSON.stringify({ tag: "url-debug", phase: "before model", ms: Date.now() - t0 }));

      // ── TIERED PERSONALISATION DATA (Part 3, 2026-09-01) ──────────
      // The page is already fetched here, so this surface knows the product
      // before the writer call and gets the FULL health gate: her blood
      // panels, supplements, medications and professional notes travel only
      // when the page's own text plausibly interacts with them. Tier 4
      // (wash-day / journal behaviour) never reaches the scoring prompt.
      const urlSignals: ProductSignals = {
        productName: pre.title || null,
        claims: pre.text ? pre.text.slice(0, 6000) : null,
      };
      const tiered = tierContext(ctx as Record<string, unknown>, urlSignals);
      tieredForDebug = tiered;
      const tier1 = runTier1(ctx as Record<string, unknown>, urlSignals);
      // Known before the model is called, so it goes out immediately.
      emit?.("tier1", {
        water_hardness: tier1.waterHardness ?? null,
        shelf_overlap: tier1.shelfOverlap.length,
        product_name: pre.title || null,
      });
      console.log("[tiers] product-analyse-url", {
        health_mode: tiered.health.mode,
        health_reason: tiered.health.reason,
        matched: tiered.health.matched ?? null,
        withheld: tiered.withheld,
      });
      const claudeRes = await runClaude({
        url: resolvedUrl,
        context: tiered.context,
        selectorContext: buildSelectorContext(body),
        pageText: pre.text,
        pageTitle: pre.title,
        tierBlock: `${tier1Block(tier1)}${tierRulesBlock(tiered)}`,
        // Throttled + preview-change gated: per-delta emission of the whole
        // buffer spent the worker's CPU allowance and killed the isolate.
        onPartialJson: emit ? createPartialEmitter(emit) : undefined,
      });
      const { payload, web_search_invocations, web_fetch_invocations } = claudeRes;
      console.log(JSON.stringify({
        tag: "url-debug", phase: "model done", ms: Date.now() - t0,
        used_web_fetch: web_fetch_invocations > 0, used_web_search: web_search_invocations > 0,
        og_image: ogImage ? "yes" : "no",
      }));

      analysis = {
        ...payload,
        _model_version: MODEL_VERSION,
        _generated_at: new Date().toISOString(),
        _provider: "claude",
        _used_web_search: web_search_invocations > 0,
        _web_search_count: web_search_invocations,
        _used_web_fetch: web_fetch_invocations > 0,
      };
      if (ogImage) {
        const safeImg = ogImage.startsWith("http://")
          ? "https://" + ogImage.slice("http://".length)
          : ogImage;
        (analysis as Record<string, unknown>)._source_image_url = safeImg;
        (analysis as Record<string, unknown>).image_url = safeImg;
      }
    } else {
      console.log(JSON.stringify({ tag: "url-debug", phase: "before lovable", ms: Date.now() - t0 }));
      const { payload, image_url } = await runLovable({ url, context: ctx });
      console.log(JSON.stringify({
        tag: "url-debug", phase: "lovable done", ms: Date.now() - t0,
        og_image: image_url ? "yes" : "no",
      }));
      analysis = {
        ...payload,
        _provider: "lovable",
        _model_version: LOVABLE_MODEL_VERSION,
        _generated_at: new Date().toISOString(),
      };
      if (image_url) {
        const safeImg = image_url.startsWith("http://")
          ? "https://" + image_url.slice("http://".length)
          : image_url;
        (analysis as Record<string, unknown>)._source_image_url = safeImg;
        if (!(analysis as Record<string, unknown>).image_url) {
          (analysis as Record<string, unknown>).image_url = safeImg;
        }
      }
    }
    {
      // Level-aware caps: 1-2 -> 2 items, 3 -> 3, 4 -> 4.
      const cap = levelCap(coerceTipsLevel((ctx as Record<string, unknown>).tipsLevel));
      const a = analysis as Record<string, unknown>;
      if (Array.isArray(a.use_cases)) a.use_cases = (a.use_cases as unknown[]).slice(0, cap);
      if (Array.isArray(a.tips)) a.tips = (a.tips as unknown[]).slice(0, cap);
    }
    {
      const a = analysis as Record<string, unknown>;
      a.insight = sanitisePurposeInsight(a.insight) ?? undefined;
      const reasons = sanitiseScoreReasons(a.score_reasons);
      a.score_reasons = reasons;
      if (typeof a.match_score === "number") {
        a.match_score = alignScoreWithReasons(a.match_score, reasons);
      }
      if (reasons.length >= 2) {
        const one = firstSentence(a.ai_summary);
        if (one) a.ai_summary = one;
      }
    }


    // ── Shared analysis failsafes (fit-first score, Strand Tip, closed
    // vocabulary, ingredient-name lockdown) — the same module every analysis
    // function uses. See _shared/analysis-failsafes.ts.
    {
      const a = analysis as Record<string, unknown>;
      const failsafe = enforceAnalysisFailsafes({
        functionName: "product-analyse-url",
        userId: user.id,
        fields: productProseFields(a),
        cards: a.key_ingredients,
          cardsField: "key_ingredients",
        allowedIngredients: Array.isArray(a.ingredients)
          ? (a.ingredients as unknown[]).map((i) => String(i))
          : [],
        vocabulary: await loadIngredientVocabulary(supabase as never),
        score: typeof a.match_score === "number" ? a.match_score : null,
        // TWO AXES (2026-09-01): the quality/safety number is the basis for
        // match_score; a purpose mismatch becomes relevance_note instead.
        qualityScore: (a as unknown as Record<string, unknown>).quality_score,
        relevanceNote: (a as unknown as Record<string, unknown>).relevance_note,
        reasons: (a.score_reasons ?? []) as never,
        modelTips: a.strand_tip,
        areasOfConcern: (ctx?.hairProfile as Record<string, unknown> | undefined)?.areas_of_concern,
        // STANDING RULE (2026-08-30): recorded challenges are always an
        // analysis input, weighted alongside the goal and areas of concern.
        challenges: (ctx as Record<string, unknown> | undefined)?.challenges,
        declaredSensitivities:
          (ctx as Record<string, unknown> | undefined)?.sensitivities ??
          (ctx as Record<string, unknown> | undefined)?.topicalSensitivities,
      });
      a.score_reasons = failsafe.reasons;
      // INTERNAL QA TRAIL (2026-09-02) — admin-only; URL scans now appear in
      // /admin/score-debug alongside the shelf and photo paths.
      void logScoreDebug({
        decryptStatus: ((ctxEarly as Record<string, unknown>).decryptStatus as string | undefined) ?? null,
        userId: user.id,
        functionName: "product-analyse-url",
        subject: typeof a.product_name === "string" ? a.product_name : null,
        brand: typeof a.brand === "string" ? a.brand : null,
        healthTierMode: tieredForDebug?.health.mode ?? null,
        tierIncluded: tieredForDebug?.included ?? [],
        tierWithheld: tieredForDebug?.withheld ?? [],
        profileFields: describeProfileFields(
          ((tieredForDebug?.context ?? {}) as Record<string, unknown>).hairProfile,
          { challenges: ((tieredForDebug?.context ?? {}) as Record<string, unknown>).challenges ?? [] },
        ),
        scoreBreakdown: scoreBreakdown({
          modelMatchScore: a.match_score,
          modelQualityScore: failsafe.qualityScore,
          baseScore: failsafe.baseScore,
          finalScore: failsafe.score,
          bonus: failsafe.concernContribution.bonus,
          centrality: failsafe.concernContribution.centrality,
          breadth: failsafe.concernContribution.breadth,
          conflicts: failsafe.concernContribution.conflicts,
          supportivePluses: failsafe.concernContribution.supportivePluses,
          relevanceNote: failsafe.relevanceNote,
          reasons: failsafe.reasons as Array<{ direction: string; factor: string }>,
        }),
      });
      if (Array.isArray(failsafe.cards)) a.key_ingredients = failsafe.cards;
      a.strand_tip = failsafe.strandTips.length ? failsafe.strandTips : null;
      if (failsafe.score != null) a.match_score = failsafe.score;
        (a as unknown as Record<string, unknown>).quality_score = failsafe.qualityScore;
        (a as unknown as Record<string, unknown>).relevance_note = failsafe.relevanceNote;
      if (failsafe.violations.length) {
        const cleared = applyFieldNulls(a, failsafe.violations);
        console.log(JSON.stringify({
          function: "product-analyse-url",
          violation: "vocabulary_or_name_lock",
          cleared,
          problems: failsafe.problems,
        }));
        // Author review: every rejection lands in ai_content_rejections.
        await logContentIntegrityRejections(failsafe.violations, {
          functionName: "product-analyse-url",
          userId: user.id,
          action: "field_nulled",
        });
      }
      a.ai_summary = alignFitLanguage(
        a.ai_summary,
        typeof a.match_score === "number" ? a.match_score : null,
      );
    }

    (analysis as Record<string, unknown>)._profile_snapshot_hash = profileHash;
    console.log(JSON.stringify({ tag: "url-debug", phase: "all done", total_ms: Date.now() - t0 }));

    // Sanitise BEFORE caching so the stored payload is byte-identical to the
    // one delivered — the fidelity sanitiser can drop a whole score reason,
    // which is what made the cache and the rendered card disagree.
    analysis = await sanitiseAndLog(analysis, "product-analyse-url") as typeof analysis;

    // ── Upsert cache ───────────────────────────────────────────────
    const { data: prior } = await supabase
      .from("ai_summaries")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", cacheKind)
      .maybeSingle();
    if (prior?.id) {
      await supabase.from("ai_summaries")
        .update({ payload: analysis as object, updated_at: new Date().toISOString() })
        .eq("id", prior.id);
    } else {
      await supabase.from("ai_summaries").insert({
        user_id: user.id,
        kind: cacheKind,
        payload: analysis as object,
      });
    }

    // SUCCESS TIMINGS (2026-09-04) — fire-and-forget, admin-only.
    {
      const finishedAt = Date.now();
      const retrieval = retrievalStatsSince(retrievalAtStart);
      const a = analysis as Record<string, unknown>;
      void logScanTiming({
        function_name: "product-analyse-url",
        surface: "product-analyse-url",
        user_id: user.id,
        ocr_ms: labelReadAt ? labelReadAt - requestStartedAt : null,
        retrieval_ms: retrieval.ms,
        retrieval_call_count: retrieval.calls,
        analysis_ms: analysisStartedAt ? finishedAt - analysisStartedAt : null,
        total_ms: finishedAt - requestStartedAt,
        ingredient_count: Array.isArray(a.ingredients)
          ? (a.ingredients as unknown[]).length
          : null,
        cpu_ms: cpuMeter.cpuMs(),
        cpu_pct_of_limit: cpuMeter.cpuPctOfLimit(),
        cache_hit: false,
        meta: { provider, streamed: wantsStream },
      });
    }

    // NEVER LOSE FINISHED WORK (2026-09-04) — persisted before streaming.
    await saveScanRecovery({
      supabase,
      userId: user.id,
      scanId: body.scan_id,
      functionName: "product-analyse-url",
      payload: analysis as unknown as Record<string, unknown>,
    });

    return analysis as unknown as Record<string, unknown>;

    };

    if (!wantsStream) {
      const result = await pipeline(null);
      return result instanceof Response
        ? result
        : new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    return sseResponse({
      functionName: "product-analyse-url",
      pipeline: (emit) => pipeline(emit),
      onError: (e) =>
        scanErrorResponse(e, {
          function_name: "product-analyse-url",
          phase: "stream",
          elapsed_ms: Date.now() - requestStartedAt,
        }),
    });
  } catch (e) {
    return await scanErrorResponse(e, {
      function_name: "product-analyse-url",
      phase: "analysis",
      elapsed_ms: Date.now() - requestStartedAt,
    });
  }
}));
