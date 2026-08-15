// Analyses a product photo for THIS user and returns the standard
// ProductAnalysisPayload. Phase 2 Step 3: dual-path — Lovable+Gemini
// (legacy, vision-only) and Claude Sonnet 4.6 (new, vision + native
// web_search), gated by STRAND_AI_PROVIDER_PRODUCT_PHOTO.
//
// Architecture (audit PHASE_2_AUDIT.md §5 Step 3):
//   - Schema `return_product_analysis` lives in _shared/schemas.ts and is
//     SHARED with product-analyse-url (Step 4a) so the React renderer
//     sees identical payloads for both flows.
//   - Forced KB topics: porosity, scalp-conditions, diagnosed-conditions.
//     selectTopicsForContext layers in extras up to a cap of 4.
//   - No RAG (web_search is the per-product fact channel; the manuscript
//     RAG channel remains book-only).
//   - Anthropic native web_search tool with max_uses: 4 — Claude decides
//     per-call whether to search; tight upper bound on cost.
//   - Cache by `ai_summaries.kind = "product_analyse:<productKey>"` when
//     the caller passes a productKey (URL flow / re-analysis). Photo
//     scans don't yet send one, so cache is a no-op for that path —
//     leaving behaviour identical to today, with the wiring in place.
//   - Provenance stamped on every payload: _model_version,
//     _generated_at, _provider, _used_web_search.
//   - Logging: usage tokens + web_search count + sanitised search
//     query strings only. Never the analysis body, never the photo bytes.
//
// CRITICAL: do NOT remove the Lovable+Gemini path. The flag defaults to
// "lovable"; Paige flips to "claude" only after manual verification.

import { json, preflight } from "../_shared/cors.ts";
import {
  fetchAdviceLedger,
  buildAdviceLedgerBlock,
  recordAdvice,
} from "../_shared/advice-ledger.ts";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildTipsLevelBlock, coerceTipsLevel, type TipsLevel } from "../_shared/tips-level.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
} from "../_shared/book-chapters.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import {
  callClaude,
  type ContentBlockInput,
  type ImageBlockSource,
  type ServerTool,
} from "../_shared/anthropic-client.ts";
import {
  RETURN_PRODUCT_ANALYSIS_SCHEMA,
  type ProductAnalysisPayload,
} from "../_shared/schemas.ts";
import { MARKETED_PURPOSE_RULES } from "../_shared/marketed-purpose.ts";
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

import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { currentProfileHash } from "../_shared/profile-snapshot.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-sonnet-4-6@v6-manuscript-2026-08-09";
const LOVABLE_MODEL_VERSION = "lovable-gemini@v5-manuscript-2026-08-09";


/** Level-aware item cap for use_cases/tips: 1 Minimal -> 1, 2 Essential -> 3,
 *  3 Hand-holding -> 4. */
function levelCap(level: TipsLevel): number {
  if (level >= 3) return 4;
  if (level === 2) return 3;
  return 1;
}

interface RequestBody {
  /** Lovable+Gemini path (back-compat): single photo, signed URL OR data URL. */
  image_url?: string;
  /** Claude path (audit §5 Step 3, revised 2026-04-27): dual photo input.
   *  Both required when STRAND_AI_PROVIDER_PRODUCT_PHOTO=claude. Each value
   *  is a signed URL OR a data URL (data:image/...;base64,...). */
  photos?: {
    front?: string;
    back?: string;
  };
  /** Optional product key for cache. When omitted (current photo-scan
   *  flow), cache lookup is skipped. */
  productKey?: string;
  context?: Record<string, unknown> & {
    hairProfile?: Record<string, unknown>;
    healthProfile?: Record<string, unknown>;
    bloodResults?: unknown[];
    avoid_ingredients?: string[];
  };
  force?: boolean;
}

/** User-facing 400 message when the Claude path is invoked without both
 *  photos (audit §5 Step 3 — strict dual-photo contract, no degradation). */
const DUAL_PHOTO_REQUIRED_MESSAGE =
  "STRAND needs both the front and back of the product to give you a full analysis.";

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

// ─── Image source parsing ──────────────────────────────────────────────
/** Convert the caller-supplied image URL/data-URL into Anthropic's image
 *  source shape. Data URLs become base64 image blocks; signed URLs become
 *  url blocks. */
function toAnthropicImageSource(image_url: string): ImageBlockSource {
  const dataMatch = image_url.match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i,
  );
  if (dataMatch) {
    const media_type = dataMatch[1].toLowerCase() as
      | "image/jpeg"
      | "image/png"
      | "image/webp"
      | "image/gif";
    return { type: "base64", media_type, data: dataMatch[2] };
  }
  return { type: "url", url: image_url };
}

// ─── Task instructions for Claude ──────────────────────────────────────
function buildTaskInstructions(tipsLevel: TipsLevel): string {
  const cap = levelCap(tipsLevel);
  return `You're looking at two photos of the same product — front (brand + product name) and back (ingredient panel + usage instructions). Read both photos carefully. Return JSON only via the return_product_analysis tool.

Voice for this task: every prose field (ai_summary, key_ingredients[].reason, use_cases, tips) follows the VOICE PRINCIPLES from the system block. In short — explain the mechanism FIRST and land the verdict second; use connectives like "this means", "which is why", "so"; talk to "you" not "your hair"; translate any cosmetic-chemistry term the first time it appears in a field; professional, direct, and never over-familiar.

1. Extract product_name and brand primarily from photo 1 (front). Extract the full INCI ingredients list and any directions primarily from photo 2 (back).

2. If either photo is partial, blurry, in a foreign language, or missing critical info: USE web_search to find the canonical product. Search for queries like '[brand] [product name] ingredients' or '[brand] [product name] INCI'. Use web_search up to 4 times — judiciously, only when needed. Do NOT search if the two photos already provide a clear, complete brand + INCI combination.

3. ingredients[] in your output must be the COMPLETE INCI list. product_name and brand must match what the brand actually calls it (not just descriptor text from the label).

4. Compose the analysis using the user's specific profile data passed in the user message. Reference porosity, density, scalp condition, diagnosed conditions, blood markers (only when this product directly intersects them), the user's consistently flagged ingredients, and goals when they actually move the verdict. Generic responses are forbidden when user data is available.

5. Grounding rule: when your guidance is rooted in the retrieved manuscript passages, reason from them and blend the underlying idea into your prose in STRAND's voice — do NOT name the book, its author, chapters, or page numbers, and do NOT emit any "Read more — …" line. When facts come from web_search (e.g. "the brand's site states this is a low-pH cleanser"), reference them inline naturally in prose. Never claim something "comes from the book" unless the specific point is supported by a retrieved passage.

5a. Wash-day baseline: when THIS product is a shampoo, cleanser, co-wash, conditioner, deep conditioner, mask, or anything that belongs in wash day, apply the Chapter 13 sequence as the default routine logic: cleanse the scalp first with a cleansing/all-purpose shampoo, cleanse the hair second with a moisturising/conditioning shampoo, then condition. Do not present co-wash as a replacement for shampoo cleansing. Adapt for protective styles or scalp sensitivity without abandoning the need to clean both scalp and hair.

6. Field rules — strict:
   - product_name / brand: read from photo 1 if legible; resolve via web_search when partial. NEVER invent. If you can't determine confidently after searching, return the closest readable text and start ai_summary with "Couldn't fully read the label —".
   - category: pick the single best fit from the enum.
   - ingredients: full INCI list, lowercase, in label order. Prefer the canonical web-resolved list when photo 2's list is partial; otherwise transcribe what's visible.
   - key_ingredients: pick 4–8 of the most decision-relevant. flag = "avoid" only when the ingredient is one the user has consistently flagged in their history (appears in 3+ of their saved-and-favourited products) OR has a documented mechanism that conflicts with their measurable hair/health profile (e.g. drying alcohols on high porosity or sulphates with dry scalp). flag = "good" when it's in their favourite_ingredients, in their high_rated_products, or has a documented mechanism that benefits their measurable traits. flag = "warn" otherwise. Existence of a standard preservative / fragrance / colourant is NOT a reason to flag "avoid".
   - match_score: 0–100, weighted down by red-flag ingredients, up by good flags. Consider category fit, the durable style pattern they usually wear (default_style), blood-marker deficiencies (only when relevant to the product), and goal alignment. NEVER let current_hairstyle or days_in_style move the score.
   - ai_summary: 2 short sentences max, second-person, professional and direct. Open with the SPECIFIC reason from THIS user's context (their goal, challenge, scalp condition, or porosity — never the style they're in) and what that means for the formula in front of them — then land the verdict in the second sentence. Use a connective ("which is why", "so", "this means") to bridge the two.
   - usage_instructions: VERBATIM directions from the manufacturer if visible on photo 2 OR resolved via web_search. If neither source provides directions, return "" — never invent.
   - use_cases: up to ${cap} concrete tips for how THIS user gets the MOST out of this product for their hair type specifically. EVERY item must name the actual trait it is written for — their curl type, porosity, density, width, scalp condition, length or a stated goal — in the sentence itself (e.g. "On low-porosity 4C hair, …"). A tip that would read the same for any hair type is INVALID; rewrite it or drop it. Do NOT repeat manufacturer directions.
   - tips: up to ${cap} personalised reasoning tips about fit/usage that go beyond use_cases. Anchor each in the user's data.

${MARKETED_PURPOSE_RULES}

MOISTURE — NON-NEGOTIABLE LANGUAGE RULE:
Moisture comes from water. Products do NOT add, restore, replace, infuse, replenish, deliver, hydrate-from-scratch, or otherwise create moisture. They seal it in, lock it in, help it stay, slow water loss, or improve absorption of the water already there. Use this phrasing only.

Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition.

OUTPUT TIGHTNESS RULES (override the field rules above where they conflict):
- use_cases: MAXIMUM ${cap} items (this user's support level caps it here — never exceed ${cap} even if more signals are relevant). Each item: ONE action sentence up to 30 words that names the hair trait it is for, followed by ONE "why" sentence up to 15 words explaining what that trait means for how they use it. Pick the ${cap} tips that most improve results on THIS user's hair type — never a generic instruction that applies to everyone.
- tips: MAXIMUM ${cap} items. Each item: ONE action sentence up to 30 words, optionally followed by ONE "why" sentence up to 15 words. Pick the ${cap} most relevant personal signals for THIS product. Not every signal in the user's profile is relevant to every product. For a scalp exfoliator, scalp condition + diagnosed alopecia + dermatologist context are relevant; lab values, sleep, and unrelated hair traits are NOT relevant unless they directly intersect this product's mechanism.

PERSONALISED APPLICATION DEPTH — LEVELS 3-4 ONLY:
When this user's support level is 3 or 4, at least one use_cases item (and routine_suggestion, when populated) must go beyond generic marketing language and give real application detail grounded in the retrieved manuscript passages and this user's actual data: how much product to use for their density/length, whether to apply section-by-section, exactly where this product sits in THIS user's wash-day sequence (before/after which other step, per the Chapter 13 two-cleanse-then-condition baseline), where it lands in their 7-day wash rhythm, and what specific item already on their shelf (context.shelf / high_rated_products) to layer it with or deliberately avoid pairing it with and why. At levels 1-2, keep this to the single highest-priority instruction only — still concrete, never generic.

MATCH SCORE — RE-REASON EVERY TIME, NEVER ANCHOR:
match_score must be re-derived from scratch on every generation using ONLY this user's current profile: goals, porosity, hair characteristics (density, texture, elasticity, scalp), and any flagged blood markers relevant to this product, weighed against the product's actual INCI list and key_ingredients flags. Do NOT anchor the score to the product's marketing claims, its brand reputation, review ratings, or a generic judgement of "this is a well-made/premium product" — a well-marketed or high-quality product with a formulation mismatched to THIS user's profile must score LOW, and a plain/inexpensive product that matches THIS user's profile well must score HIGH.
- pair_with: OPTIONAL. Up to 3 items from the user's shelf (context.shelf), high_rated_products, or existing tools/favourites that layer well with THIS product. Reference each by real name and brand. { item, why } — "why" is one sentence tying the pairing to a user hair goal, challenge, hair characteristic, or wash-day step. Empty array if nothing on the shelf pairs meaningfully. NEVER invent products.
- routine_suggestion: OPTIONAL. 1–2 short sentences slotting THIS product into the user's routine — reference recent wash-day steps, cadence, or how long the hair has been worn up (a duration, never a style name) when relevant. Empty string if nothing meaningful.
- ai_summary: 2–3 sentences MAXIMUM. Open by naming the SPECIFIC user signal that's driving the call (their porosity, density, scalp condition, a goal, a challenge, a flagged ingredient pattern, etc. — never the style they're in) and what that means for THIS formula — then land the verdict (good fit / mixed fit / poor fit) in the next sentence. Use a connective ("which is why", "so", "this means") between mechanism and verdict. Don't restate the same signal twice.
- key_ingredients: 4–6 items MAXIMUM. Pick the ingredients that most affect the verdict, not every ingredient with a benefit.

PRODUCT ANALYSIS SCOPE — HARD RULE:
When personalising a product analysis, focus ONLY on signals that intersect with what's INSIDE the product: ingredients, mechanism of action, formulation, application method.

Signals that ARE relevant for product analysis:
- Hair type (curl pattern, density, porosity, length, current style)
- Hair goals (length retention, definition, moisture retention, strength)
- Hair challenges directly affected by formulation (dryness, breakage, build-up, scalp condition, heat damage history)

Signals that are NOT relevant for product analysis (do NOT mention these in product output — not in ai_summary, key_ingredients[].reason, use_cases, or tips):
- Tension or styling-related concerns (traction alopecia, tight braids, weight of styles) — these are HANDLING concerns, not formulation concerns. A leave-in conditioner has no tension implications. Do NOT cite tension or traction alopecia in any product analysis unless the product is specifically a tension-related treatment.
- Lab values (ferritin, vitamin D, thyroid etc.) unless THIS specific product directly addresses them (e.g. a follicle treatment for clinically diagnosed hair loss with ferritin context).
- Sleep, stress, cortisol — systemic concerns, not product-fit concerns.
- Dermatologist consultation context — only relevant if the product directly intersects with what the dermatologist is treating.

Rule of thumb: if you cannot draw a line from one of the product's INGREDIENTS to the user signal, DON'T cite that signal. "This conditioner has X ingredient which addresses Y challenge" is in scope. "Use this carefully because of your traction alopecia" is OUT of scope for ANY product unless the product is specifically a tension-related treatment (rare).

PERSONALISATION PRIORITY (in order):
1. Hair challenges directly affected by THIS product's formulation
2. Hair goals THIS product can help or hinder
3. Hair type traits (curl pattern, porosity, density) that affect how this product will perform on this user's hair

If any of those three are missing from the user's profile, that's fine — silence is better than reaching for unrelated signals to fill space. The output should be SHORTER if the user profile has less to draw from, not padded with irrelevant context.

LANGUAGE RULE — NEVER use the phrase "avoid list", "avoid ingredients", "your avoids", "ingredients on your avoid list", "things to avoid", or imply the user has any list of ingredients they want to avoid. The only ingredient-history signal that exists in STRAND is "consistently flagged ingredients" — ingredients that appear in 3+ of the user's saved-and-favourited products that they're actively using. When you need to refer to this signal in ai_summary, key_ingredients[].reason, use_cases, or tips, use phrasing like "consistently flagged in your history", "ingredients you've flagged across your favourites", or "appears across 3+ products on your shelf and favourites". This applies to EVERY output field, not just the summary.

PERSONAL SIGNAL SELECTION:
When deciding which 1–2 signals to surface in tips/summary, ask: would a clinical hair coach prioritise THIS signal for THIS product? Examples:
- Scalp exfoliator → scalp condition, diagnosed scalp/follicle issues, dermatologist context. NOT ferritin or sleep unless they're THE reason this product is or isn't a fit.
- Deep conditioner → porosity, density, build-up, heat damage history. NOT scalp conditions or labs.
- Leave-in / styler → porosity, density, length, elasticity, climate. NOT scalp conditions or labs.
- Treatment for hair loss → diagnosed conditions, ferritin, dermatologist context. THESE labs ARE relevant here.

CLARIFYING GUIDANCE — HARD RULE:
Never recommend a chelating shampoo as routine advice. If residue or build-up is relevant to THIS product, point to a gentle clarifying shampoo followed by a deep conditioner after any clarifying step, and let the user judge how often they reach for it from how their hair responds. A true chelating treatment should be discussed with a trichologist first. Do NOT use the words "chelating shampoo" or "chelator" as a recommendation in ai_summary, use_cases, or tips. ("Chelator" can still appear as a neutral cosmetic-chemistry category label in key_ingredients when describing what an ingredient like EDTA is — that's descriptive, not a recommendation.)

${SCORE_REASONS_RULES}

${PURPOSE_INSIGHT_RULES}

${NON_PRESCRIPTIVE_RULES}

${STYLE_WEIGHTING_RULES}`;

}

// ─── Provider: Claude ──────────────────────────────────────────────────
async function runClaude(args: {
  front_image_url: string;
  back_image_url: string;
  context: Record<string, unknown>;
  selectorContext: SelectorContext;
  ledgerBlock: string;
}): Promise<{ payload: ProductAnalysisPayload; web_search_invocations: number }> {
  const userText = `Two photos of the same product follow. Photo 1 is the FRONT of the product (brand + product name + marketing claims). Photo 2 is the BACK of the product (ingredient panel + usage instructions + regulatory text). Read both. Use web_search if anything is missing or unclear.

User context (use to compute key_ingredients flags, match_score, ai_summary, use_cases, and tips):
${JSON.stringify(args.context ?? {}, null, 2)}

Return JSON only via the return_product_analysis tool.`;

  const userContent: ContentBlockInput[] = [
    { type: "text", text: "Photo 1 — FRONT of product:" },
    { type: "image", source: toAnthropicImageSource(args.front_image_url) },
    { type: "text", text: "Photo 2 — BACK of product (ingredient panel):" },
    { type: "image", source: toAnthropicImageSource(args.back_image_url) },
    { type: "text", text: userText },
  ];

  const webSearchTool: ServerTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 4,
  };

  const tipsLevel = coerceTipsLevel((args.context as Record<string, unknown> | undefined)?.tipsLevel);
  const req = await buildClaudeRequest({
    function_kind: "product-analyse",
    task_instructions: `${buildTaskInstructions(tipsLevel)}${
      args.ledgerBlock ? `\n\n${args.ledgerBlock}` : ""
    }`,
    user_payload: {}, // unused — user_content overrides
    user_content: userContent,
    user_context: args.context,
    selector_context: args.selectorContext,
    force_topic_ids: [
      "wash-day-mechanics",
      "porosity",
      "scalp-conditions",
      "diagnosed-conditions",
    ],
    rag_query: `product ingredients Afro hair porosity scalp moisture protein sulfate silicone oils butters ${
      (args.context as Record<string, unknown> | undefined)?.hairProfile
        ? JSON.stringify((args.context as Record<string, unknown>).hairProfile).slice(0, 200)
        : ""
    }`,
    rag_k: 4,
    tool: {
      name: "return_product_analysis",
      description:
        "Return the structured product analysis. Always invoke this tool exactly once at the end with the final analysis.",
      input_schema: RETURN_PRODUCT_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    },
    server_tools: [webSearchTool],
    // Note: NOT setting toolChoice. With server-side web_search, Anthropic
    // requires the model to remain free to invoke server tools, so we
    // describe the contract in the task instructions instead.
    max_tokens: 4096,
  });

  const result = await callClaude<ProductAnalysisPayload>(req);

  const web_search_invocations = result.server_tool_use_count ?? 0;

  // Usage logging — never log the analysis body or the photo. Web-search
  // queries are safe to log: they contain only product/brand text that
  // the user just held up to their camera.
  console.log(JSON.stringify({
    function: "product-analyse",
    provider: "claude",
    input_tokens: result.usage.input_tokens,
    cache_read_input_tokens: result.usage.cache_read_input_tokens,
    cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
    output_tokens: result.usage.output_tokens,
    web_search_invocations,
    web_search_queries: result.server_tool_use_queries ?? [],
  }));

  if (!result.toolInput) {
    throw new Error("Claude returned no return_product_analysis tool_use block");
  }
  return { payload: result.toolInput, web_search_invocations };
}

// ─── Provider: Lovable+Gemini (legacy, vision-only) ────────────────────
import { allChallenges, challengeText, challengesOf } from "../_shared/challenges.ts";
import {
  buildGroundingBlock,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";

function buildLovableSystem(tipsLevel: TipsLevel): string {
  const cap = levelCap(tipsLevel);
  return `${STRAND_PERSONA_WITH_RULES}

TASK
You are analysing a single product photo for THIS user.


ABSOLUTE RULES
1. READ the product directly from the image. The brand name and product title are usually the most prominent text on the front of the bottle/box. NEVER invent a name — if you can't read it confidently, set product_name and brand to the closest readable text and set "ai_summary" to start with "Couldn't fully read the label —".
2. If you can see an ingredient list (small print, often labelled "Ingredients" or "INCI"), transcribe ALL of it into "ingredients" (lowercase, comma-separated source split into array). If only some ingredients are visible, return what you see — do not pad.
3. Personalise everything to the user's profile passed in context: hairProfile (porosity, texture, density, scalp), currentStyle (background context only — see the style weighting rules), goals (length retention, breakage, scalp, etc.) and any "challenge" text the user wrote, bloodResults (only when this product directly intersects them), healthProfile (medications, conditions), history.flagged_ingredients (ingredients consistently flagged across 3+ of the user's saved-and-favourited products), history.favourite_ingredients, history.low_rated_products and history.high_rated_products.
4. RED/GREEN FLAG LOGIC for key_ingredients[].flag:
   - "avoid" (red) if the ingredient is consistently flagged in the user's history (appears in 3+ of their saved-and-favourited products), OR appears in any history.low_rated_products[].ingredients, OR is contraindicated by the user's hair/health profile (e.g. drying alcohols on high-porosity hair or sulphates with dry scalp), OR works against a stated goal/challenge (e.g. heavy waxes when the user is trying to retain length in a wash-and-go).
   - "good" (green) if the ingredient appears in history.favourite_ingredients OR in history.high_rated_products[].ingredients OR is well-matched to their porosity/texture/scalp OR directly supports a stated goal/challenge.
   - "warn" (amber) for neutral-but-noteworthy.
5. match_score (0–100): lower it sharply for any red flags; raise it for "good" flags; consider category fit, the durable style pattern they usually wear (default_style), blood-result deficiencies (only when relevant to this product), and goal alignment. current_hairstyle and days_in_style must never move the score.

PRODUCT ANALYSIS SCOPE — HARD RULE:
Focus ONLY on signals that intersect with what's INSIDE this product (ingredients, mechanism, formulation, application). Tension / traction alopecia / styling weight are HANDLING concerns, not formulation concerns — do NOT cite them in any product output. Lab values, sleep, stress, and dermatologist context are ONLY relevant if THIS product directly intersects them.

LANGUAGE RULE — NEVER use the phrase "avoid list", "avoid ingredients", "your avoids", or imply the user has any list of ingredients they want to avoid. The only ingredient-history signal in STRAND is "consistently flagged ingredients" (appears in 3+ of the user's saved-and-favourited products). Use phrasing like "consistently flagged in your history" in ai_summary, key_ingredients[].reason, use_cases, and tips.
6. ai_summary: 2 short sentences MAX, second-person, in Paige's voice. The FIRST sentence cites a specific reason from THIS user's context — prefer their goal, challenge or a durable hair characteristic, never the style they're in (e.g. "High-porosity strands lose water fast, which is why this heavier sealing cream suits your length-retention goal."). 7. usage_instructions: VERBATIM directions from the manufacturer. If the label/page text shows a "Directions", "How to use", "Apply" or "Usage" block, transcribe it word-for-word into this field. If no manufacturer directions are visible, set this to an empty string ("") — do NOT invent or paraphrase usage steps.
8. use_cases: MAXIMUM ${cap} concrete tips for how THIS user gets the MOST out of the product on their hair type specifically (this user's support level caps it at ${cap}). Each item is ONE action sentence up to 30 words that NAMES the trait it is written for — curl type, porosity, density, width, scalp condition, length, goal or listed challenge — plus ONE "why" sentence up to 15 words. A tip that would read identically for any hair type is INVALID. Do NOT repeat the manufacturer's directions here; build on them with personal reasoning.
8b. tips: MAXIMUM ${cap} items, same word budget as use_cases, each anchored in the user's own data.
8c. PERSONALISED APPLICATION DEPTH — LEVELS 3-4 ONLY: at this user's support level, at least one use_cases item must give real application detail grounded in the retrieved manuscript passages: how much to use for their density/length, sectioning, exactly where this product sits in their wash-day sequence (Chapter 13 two-cleanse-then-condition baseline) and their 7-day wash rhythm, and what to pair with or avoid pairing from their shelf. At levels 1-2, give only the single highest-priority instruction, still concrete never generic.
8d. MATCH SCORE — re-derive match_score from scratch every time from THIS user's goals, porosity, hair characteristics and flagged blood markers weighed against the product's actual ingredients. NEVER anchor the score to marketing claims, brand reputation, or a generic "good product" judgement — a mismatched premium product scores LOW, a well-matched plain product scores HIGH.
9. Output STRICT JSON only. No prose, no code fences.

${MARKETED_PURPOSE_RULES}

SCHEMA
{
  "product_name": string,
  "brand": string,
  "category": "shampoo"|"conditioner"|"treatment"|"styler"|"oil"|"mask"|"leave-in"|"other",
  "ingredients": string[],
  "key_ingredients": [{"name": string, "benefit": string, "flag": "good"|"warn"|"avoid", "reason": string, "surfactant_role": "primary"|"secondary"|"none"}],
  "marketed_purpose": "dry_hair"|"damaged_hair"|"colour_treated"|"greasy_oily"|"general_all_hair_types"|"moisture"|"repair"|"clarifying",
  "marketed_purpose_confidence": "high"|"low",
  "marketed_purpose_note": "one or two plain sentences telling the user what this product is sold to do and what that means for THEIR hair",
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

${STYLE_WEIGHTING_RULES}`;

}

async function runLovable(args: {
  image_url: string;
  context: Record<string, unknown>;
  ledgerBlock?: string;
}): Promise<ProductAnalysisPayload> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  // Manuscript grounding parity with the Claude path.
  const grounding = await buildGroundingBlock({
    surface: "product-analyse",
    fn: "product-analyse",
    functionKind: "product-analyse",
    selectorContext: selectorFromAiContext(args.context),
    forceTopics: [
      "wash-day-mechanics",
      "porosity",
      "scalp-conditions",
      "diagnosed-conditions",
    ],
    ragQuery: ragQueryFromAiContext(
      args.context,
      "hair product ingredients suitability moisture protein scalp",
    ),
    ragK: 5,
  });

  const tipsLevel = coerceTipsLevel((args.context as Record<string, unknown> | undefined)?.tipsLevel);
  const tipsBlock = buildTipsLevelBlock(tipsLevel);

  const userMsg = `Analyse this product photo. Read the brand and product title directly from the label.

User context (use to compute flags, match_score, ai_summary, and use_cases):
${JSON.stringify(args.context ?? {}, null, 2)}

Return strict JSON matching the schema in your system prompt.`;

  const aiResp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: `${buildLovableSystem(tipsLevel)}\n\n${tipsBlock}\n\n${CHAPTER_WHITELIST_PROMPT}${grounding.block}${args.ledgerBlock ? `\n\n${args.ledgerBlock}` : ""}` },
          {
            role: "user",
            content: [
              { type: "text", text: userMsg },
              { type: "image_url", image_url: { url: args.image_url } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    },
  );

  if (!aiResp.ok) {
    const status = aiResp.status;
    const t = await aiResp.text();
    console.error(`[product-analyse] lovable gateway ${status}: ${t.slice(0, 120)}`);
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = status;
    throw err;
  }

  const j = await aiResp.json();
  const text: string = j.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as ProductAnalysisPayload;
  return {
    ...parsed,
    _manuscript_grounded: grounding.grounded,
    _rag_passages: grounding.passages,
  } as ProductAnalysisPayload;
}

// ─── Edge function entry ───────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

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

    const provider = readAiProvider("STRAND_AI_PROVIDER_PRODUCT_PHOTO");

    // ── Input validation: provider-specific contracts (audit §5 Step 3) ──
    // Claude path: dual-photo strict — both front + back required, no
    // silent degradation, no escape hatch.
    // Lovable+Gemini path: single-photo back-compat unchanged.
    let frontPhoto: string | undefined;
    let backPhoto: string | undefined;
    if (provider === "claude") {
      frontPhoto = body.photos?.front;
      backPhoto = body.photos?.back;
      if (!frontPhoto || !backPhoto) {
        return json(400, { error: DUAL_PHOTO_REQUIRED_MESSAGE });
      }
    } else {
      if (!body.image_url) {
        return json(400, { error: "image_url required" });
      }
    }

    const cacheKind = body.productKey ? `product_analyse:${body.productKey}` : null;
    const ctx = body.context ?? {};
    const tipsLevelForHash = coerceTipsLevel((ctx as Record<string, unknown>).tipsLevel);
    // Cache key includes tipsLevel (goals are already part of currentProfileHash)
    // so a support-level change or a goals change both force a fresh analysis.
    const profileHash = currentProfileHash(ctx as Record<string, unknown>);

    // ── Cache check (only when caller passed a productKey) ────────────
    if (cacheKind && !body.force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (existing?.payload) {
        const cached = existing.payload as ProductAnalysisPayload & { _profile_snapshot_hash?: string };
        const versionOk = provider === "claude"
          ? cached._model_version === MODEL_VERSION
          : cached._model_version === LOVABLE_MODEL_VERSION;
        const hashOk = cached._profile_snapshot_hash === profileHash;
        if (versionOk && hashOk) {
          return json(200, await sanitiseAndLog(cached, "product-analyse"));
        }
      }
    }

    const ledgerBlock = buildAdviceLedgerBlock(await fetchAdviceLedger(user.id));

    let analysis: ProductAnalysisPayload;

    if (provider === "claude") {
      const { payload, web_search_invocations } = await runClaude({
        front_image_url: frontPhoto!,
        back_image_url: backPhoto!,
        context: ctx,
        selectorContext: buildSelectorContext(body),
        ledgerBlock,
      });
      analysis = {
        ...payload,
        _model_version: MODEL_VERSION,
        _generated_at: new Date().toISOString(),
        _provider: "claude",
        _used_web_search: web_search_invocations > 0,
        _web_search_count: web_search_invocations,
      };
    } else {
      const lovable = await runLovable({ image_url: body.image_url!, context: ctx, ledgerBlock });
      analysis = {
        ...lovable,
        _provider: "lovable",
        _model_version: LOVABLE_MODEL_VERSION,
        _generated_at: new Date().toISOString(),
      };
    }
    // ── Level-aware server-side truncation — belt-and-braces on top of the
    // prompt instructions (models occasionally over-produce).
    {
      const cap = levelCap(tipsLevelForHash);
      const a = analysis as Record<string, unknown>;
      if (Array.isArray(a.use_cases)) a.use_cases = (a.use_cases as unknown[]).slice(0, cap);
      if (Array.isArray(a.tips)) a.tips = (a.tips as unknown[]).slice(0, cap);
    }
    // ── Score reasons: normalise, keep the number honest, and reduce
    // ai_summary to the single overall-call sentence.
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

    (analysis as Record<string, unknown>)._profile_snapshot_hash = profileHash;

    // ── Upsert cache (only when keyed) ────────────────────────────────
    if (cacheKind) {
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
    }

    await recordAdvice(
      user.id,
      "product-analyse",
      Array.isArray((analysis as { tips?: unknown }).tips)
        ? ((analysis as { tips: unknown[] }).tips.map(String))
        : [],
    );

    return json(200, await sanitiseAndLog(analysis, "product-analyse"));
  } catch (e) {
    return aiErrorResponse(e, "product-analyse");
  }
});
