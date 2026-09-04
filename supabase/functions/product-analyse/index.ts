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

import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { checkKillSwitch } from "../_shared/kill-switch.ts";
import { checkDailyCap, checkGlobalCeiling } from "../_shared/usage-cap.ts";
import {
  fetchAdviceLedger,
  buildAdviceLedgerBlock,
  recordAdvice,
} from "../_shared/advice-ledger.ts";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { scanErrorResponse, withScanDiagnostics } from "../_shared/scan-error-log.ts";
import { logScanTiming } from "../_shared/scan-timing-log.ts";
import { startCpuMeter } from "../_shared/cpu-meter.ts";
import { saveScanRecovery } from "../_shared/scan-recovery.ts";
import { logStreamOutcome, traceSse } from "../_shared/sse-log.ts";
import { retrievalStatsSince, retrievalStatsSnapshot } from "../_shared/rag.ts";

import { readAiProvider } from "../_shared/flags.ts";
import { buildTipsLevelBlock, coerceTipsLevel, type TipsLevel } from "../_shared/tips-level.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { scanRetrievalQuery } from "../_shared/scan-rag-query.ts";
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
  type ImageBlockSource,
  type ServerTool,
} from "../_shared/anthropic-client.ts";
import {
  RETURN_PRODUCT_ANALYSIS_SCHEMA,
  type ProductAnalysisPayload,
} from "../_shared/schemas.ts";
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
import { decidePhotoSearch, needsSearchRetry } from "../_shared/search-gate.ts";
import { loadSensitivities, type LoadedSensitivities } from "../_shared/sensitivities.ts";
import {
  topicalSensitivityBlock,
  annotateProductSensitivities,
} from "../_shared/topical-sensitivity.ts";
import { runGuardrailLoop } from "../_shared/guardrail-loop.ts";
import { MAX_REJECTION_ATTEMPTS } from "../_shared/guardrail-retry.ts";
import { RETRY_TAIL_MS, startTimeBudget } from "../_shared/time-budget.ts";
import { createPartialEmitter, startHeartbeat } from "../_shared/partial-emitter.ts";
import { recordAiOutcome } from "../_shared/ai-meter.ts";

import { backfillHollowSummary } from "../_shared/hollow-summary.ts";
import { describeProfileFields, logScoreDebug, scoreBreakdown } from "../_shared/score-debug.ts";
import {
  usageGroundingBlock,
  validateUsageGrounding,
  scrubUngroundedUsage,
  type UsageDirections,
} from "../_shared/usage-grounding.ts";
import type { FailsafeViolation } from "../_shared/analysis-failsafes.ts";

import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { currentProfileHash } from "../_shared/profile-snapshot.ts";
import {
  runTier1,
  tier1Block,
  tierContext,
  tierRulesBlock,
  type ProductSignals,
} from "../_shared/tiers.ts";


declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-sonnet-4-6@v29-decrypt-status-2026-09-02";
const LOVABLE_MODEL_VERSION = "lovable-gemini@v29-decrypt-status-2026-09-02";


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
    flagged_ingredients?: string[];
  };
  force?: boolean;
  /** SPEED: stream the analysis back as SSE so the member sees the product
   *  name, brand and ingredient list within a few seconds. The final
   *  `complete` event carries the same fully guarded payload the plain JSON
   *  response returns. */
  stream?: boolean;
  /** RECOVERY (2026-09-04): client-generated UUID for this scan. The finished
   *  payload is persisted under it before `complete` is emitted, so a dropped
   *  connection cannot discard finished work. */
  scan_id?: string;

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
    bloodResults: (Array.isArray(ctx.bloodResults) ? ctx.bloodResults : []) as SelectorContext["bloodResults"],
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

2. If either photo is partial, blurry, in a foreign language, or missing critical info: USE web_search to find the canonical product. Search for queries like '[brand] [product name] ingredients' or '[brand] [product name] INCI'. Use web_search up to 2 times — judiciously, only when needed. Do NOT search if the two photos already provide a clear, complete brand + INCI combination.

3. ingredients[] in your output must be the COMPLETE INCI list. product_name and brand must match what the brand actually calls it (not just descriptor text from the label).

3a. INGREDIENT NAMING — SELF-CONSISTENCY IS VALIDATED. Whatever you write into ingredients[] becomes the ONLY permitted form of every ingredient name everywhere else in your output (ai_summary, key_ingredients[].name, key_ingredients[].reason, use_cases, tips, score_reasons). Copy each name character-for-character from your own ingredients[] entry. Do NOT translate to a common name, do NOT anglicise, do NOT reorder the parts, do NOT merge two entries into one, do NOT split a slash-joined entry, and do NOT add an ingredient you did not transcribe. Worked examples:
   - ingredients[] holds "Ricinus Communis Seed Oil" → write "Ricinus Communis Seed Oil", never "Castor Oil".
   - ingredients[] holds "Butyrospermum Parkii (Shea) Butter" → write it exactly like that, never "Shea Butter (Butyrospermum Parkii)" and never "Shea Butter".
   - ingredients[] holds "Cocos Nucifera (Coconut) Oil" → write it in full, never "Coconut Oil", never "Cocos Nucifera Oil".
   - ingredients[] holds "Limonene", "Citral" and "Linalool" as separate entries → discuss them separately, never as "Limonene / Citral / Linalool".
   - "Biotin", "Silica" or anything else you did NOT read off the panel must not appear anywhere, even if products like this usually contain it.
   If you want to talk about something you cannot name from ingredients[], describe the ingredient family in general words with no name at all. A name that is not in your own ingredients[] causes the entire generation to be thrown away.

4. Compose the analysis using the user's specific profile data passed in the user message. Reference porosity, density, scalp condition, diagnosed conditions, hairProfile.areas_of_concern (the physical areas she flagged — edges, hairline, crown, nape), blood markers (only when this product directly intersects them), the user's consistently flagged ingredients, and goals when they actually move the verdict. Density, regrowth, shedding and scalp-health support IS relevant to thinning edges or a receding hairline — score it as a plus, never as a mismatch. Never use hair-typing terminology (3C, 4C, "type 4"); say "Afro and textured hair" or name the recorded characteristic. Generic responses are forbidden when user data is available.

5. Grounding rule: when your guidance is rooted in the retrieved manuscript passages, reason from them and blend the underlying idea into your prose in STRAND's voice — do NOT name the book, its author, chapters, or page numbers, and do NOT emit any "Read more — …" line. When facts come from web_search (e.g. "the brand's site states this is a low-pH cleanser"), reference them inline naturally in prose. Never claim something "comes from the book" unless the specific point is supported by a retrieved passage.

5a. Wash-day baseline: when THIS product is a shampoo, cleanser, co-wash, conditioner, deep conditioner, mask, or anything that belongs in wash day, apply the Chapter 13 sequence as the default routine logic: cleanse the scalp first with a cleansing/all-purpose shampoo, cleanse the hair second with a moisturising/conditioning shampoo, then condition. Do not present co-wash as a replacement for shampoo cleansing. Adapt for protective styles or scalp sensitivity without abandoning the need to clean both scalp and hair.

6. Field rules — strict:
   - product_name / brand: read from photo 1 if legible; resolve via web_search when partial. NEVER invent. If you can't determine confidently after searching, return the closest readable text and start ai_summary with "Couldn't fully read the label —".
   - category: pick the single best fit from the enum.
   - application_area / leave_on: read STRICTLY off the label's directions. application_area = "scalp" (scalp/partings only), "lengths_ends" (mid-lengths and ends only), "scalp_and_lengths" (whole head), "rinse_out" (applied then rinsed off during washing). leave_on = true when the directions say it stays on the hair, false when it is rinsed out. If the label does not say, return "unknown" and omit leave_on — NEVER guess from the product name or category.

   - ingredients: full INCI list, lowercase, in label order. Prefer the canonical web-resolved list when photo 2's list is partial; otherwise transcribe what's visible.
   - key_ingredients: pick 4–8 of the most decision-relevant. flag = "avoid" ONLY when the ingredient is in the member's DECLARED topical sensitivities / documented allergies, or has a documented mechanism that conflicts with their measurable hair/health profile (e.g. drying alcohols on high porosity or sulphates with dry scalp). flag = "good" when the ingredient appears in their high_rated_products or has a documented mechanism that benefits their measurable traits. flag = "warn" otherwise. Existence of a standard preservative / fragrance / colourant is NOT a reason to flag "avoid". history.flagged_ingredients is a FREQUENCY COUNT of ingredients she already owns (3+ saved products) — it is NEVER a reason to flag "avoid".
   - match_score: 0–100. Weight it on category fit, documented ingredient mechanisms against their measurable hair/health traits, declared sensitivities, the durable style pattern they usually wear (default_style), blood-marker deficiencies (only when relevant to the product), and goal alignment. NEVER let current_hairstyle or days_in_style move the score. NEVER reduce the score because the formula contains ingredients the member already owns frequently (history.flagged_ingredients) — frequency of ownership is not a fit signal in either direction, and must not appear as a negative score factor.
   - ai_summary: 2 short sentences max, second-person, professional and direct. Open with the SPECIFIC reason from THIS user's context (their goal, challenge, scalp condition, or porosity — never the style they're in, and never the fact that ingredients recur across her shelf) and what that means for the formula in front of them — then land the verdict in the second sentence. Use a connective ("which is why", "so", "this means") to bridge the two. A frequently-owned ingredient may only be mentioned neutrally ("cetearyl alcohol appears in four products on your shelf") and never as a risk, concern or reason the product scores lower.
   - usage_instructions: VERBATIM directions from the manufacturer if visible on photo 2 OR resolved via web_search. If neither source provides directions, return "" — never invent.
   - use_cases: up to ${cap} concrete tips for how THIS user gets the MOST out of this product for their own hair characteristics specifically. EVERY item must name the actual trait it is written for — their porosity, density, strand width, scalp condition, length or a stated goal — in the sentence itself (e.g. "On low-porosity strands, …"). A tip that would read the same for any hair type is INVALID; rewrite it or drop it. Do NOT repeat manufacturer directions.
   - tips: up to ${cap} personalised reasoning tips about fit/usage that go beyond use_cases. Anchor each in the user's data.

${SURFACTANT_STRENGTH_RULES}

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

${STYLE_WEIGHTING_RULES}

${FLAGGED_INGREDIENTS_RULES}`;

}

/**
 * SPEED (2026-08). Every token Claude emits costs the member roughly 22ms of
 * waiting, and the scan was spending them on prose the app never renders.
 * These rules cut nothing the UI shows and touch no guardrail — they only
 * forbid padding, and they fix the emission order so the score, reasons and
 * headline stream out before the longer guidance blocks.
 */
const OUTPUT_ECONOMY_RULES = `

OUTPUT ECONOMY — HARD RULES (latency: the member is watching a spinner):
- Emit NOTHING outside the return_product_analysis tool call. No preamble, no commentary, no "I'll analyse this", no closing summary.
- Fill the tool's fields in the order the schema lists them. Do not reorder.
- key_ingredients: 4–6 entries only, the ones that actually decide the score. benefit ≤12 words. reason ≤20 words, one sentence.
- score_reasons: at most 4 entries, each reason one sentence ≤25 words.
- ai_summary: exactly ONE sentence.
- routine_suggestion: at most 2 short sentences.
- Never restate the same point in two fields, and never re-list the full ingredient panel in prose.
- Brevity is a formatting rule only: it must NEVER reduce the number of ingredients you transcribe into "ingredients", change a flag, or soften a warning.`;

// ─── Usage grounding on the scan path (2026-09-01) ─────────────────────
// The directions aren't known before the call — the model reads them off photo 2
// in the same generation — so the prompt anchors every technique specific to what
// it transcribes into `usage_instructions`, and we validate against that after.
const SCAN_USAGE_GROUNDING_BLOCK = usageGroundingBlock(
  { text: null, source: "label_photo" },
  { selfTranscribed: true },
);

/** The directions this generation actually claims to have read off the pack. */
function scanDirections(payload: Record<string, unknown>): UsageDirections {
  const text = typeof payload.usage_instructions === "string"
    ? payload.usage_instructions.trim()
    : "";
  return { text: text || null, source: text ? "label_photo" : "none" };
}

function usageGroundedFields(
  payload: Record<string, unknown>,
): Array<{ field: string; text?: string | null }> {
  const list = (key: string) =>
    (Array.isArray(payload[key]) ? payload[key] as unknown[] : []).map((v, i) => ({
      field: `${key}[${i}]`,
      text: typeof v === "string" ? v : null,
    }));
  return [
    ...list("use_cases"),
    ...list("tips"),
    {
      field: "routine_suggestion",
      text: typeof payload.routine_suggestion === "string" ? payload.routine_suggestion : null,
    },
  ];
}

/** Rules that force a re-ask when the copy invents an application condition. */
function scanUsageProblems(payload: Record<string, unknown>): string[] {
  const directions = scanDirections(payload);
  return [
    ...new Set(
      validateUsageGrounding(usageGroundedFields(payload), directions).map((p) => p.rule),
    ),
  ];
}

/** Terminal fallback at the attempt cap: strip the ungrounded sentences. */
function scrubScanUsage(payload: Record<string, unknown>): number {
  const directions = scanDirections(payload);
  let removed = 0;
  for (const key of ["use_cases", "tips"]) {
    if (!Array.isArray(payload[key])) continue;
    payload[key] = (payload[key] as unknown[])
      .map((v) => {
        if (typeof v !== "string") return v;
        const out = scrubUngroundedUsage(v, directions);
        removed += out.removed;
        return out.text;
      })
      .filter((v) => typeof v !== "string" || v.trim().length > 0);
  }
  if (typeof payload.routine_suggestion === "string") {
    const out = scrubUngroundedUsage(payload.routine_suggestion, directions);
    removed += out.removed;
    payload.routine_suggestion = out.text;
  }
  return removed;
}

// ─── Manuscript evidence: one gather, started early, shared everywhere ──
// LATENCY (2026-09-01, Part 4). Stage 1 (whole-chapter read → evidence set) is
// the second-largest wait on a scan, and it depends ONLY on the member's own
// facts — never on the product being photographed. It is therefore kicked off
// as soon as the scan is known to need a model call, runs alongside the
// vocabulary load and the workspace ceiling check, and the SAME resolved set
// is reused by every retry attempt and by the stage 3 citation verification
// (via noteEvidence). Nothing about the prompt content changes.
export function scanRagQuery(context: Record<string, unknown> | undefined): string {
  // TARGETED RETRIEVAL (2026-09-04). Same number of passages, chosen for THIS
  // member instead of by a fixed keyword string. A photo scan reads the label
  // inside the model call, so no ingredient list exists yet at retrieval time —
  // the query is built from her recorded signals. See _shared/scan-rag-query.ts.
  return scanRetrievalQuery({ context: context ?? {} });
}

// ─── Provider: Claude ──────────────────────────────────────────────────


async function runClaude(args: {
  front_image_url: string;
  back_image_url: string;
  context: Record<string, unknown>;
  selectorContext: SelectorContext;
  ledgerBlock: string;
  sensitivityBlock?: string;
  /** TIERS (Part 3): the deterministic Tier 1 findings plus the rules telling
   *  the model which tiers it can actually see. */
  tierBlock?: string;
  /** Guardrail rejection feedback for a re-ask (empty on the first attempt). */
  retryInstruction?: string;
  /** Pre-resolved stage 1 evidence (see scanRagQuery). */
  prefetchedEvidence?: { block: string; grounded: boolean };
  /** SPEED: when set, the model call streams and this receives the
   *  accumulated tool JSON so the caller can push partial results to the
   *  member while the verdict is still being written. */
  onPartialJson?: (accumulatedJson: string) => void;
  /** Search is only granted on a re-ask after an unreadable pack (search-gate). */
  allowSearch?: boolean;
}): Promise<{ payload: ProductAnalysisPayload; web_search_invocations: number }> {
  const userText = `Two photos of the same product follow. Photo 1 is the FRONT of the product (brand + product name + marketing claims). Photo 2 is the BACK of the product (ingredient panel + usage instructions + regulatory text). Read both. ${args.allowSearch ? "The first read could not resolve the product from the photos, so you may now use web_search to resolve the brand, product name and INCI list." : "No search tool is available: read the product from these two photos alone."}

User context (use to compute key_ingredients flags, match_score, ai_summary, use_cases, and tips):
${JSON.stringify(args.context ?? {}, null, 2)}
${args.retryInstruction ? `\n${args.retryInstruction}\n` : ""}
Return JSON only via the return_product_analysis tool.`;



  const userContent: ContentBlockInput[] = [
    { type: "text", text: "Photo 1 — FRONT of product:" },
    { type: "image", source: toAnthropicImageSource(args.front_image_url) },
    { type: "text", text: "Photo 2 — BACK of product (ingredient panel):" },
    { type: "image", source: toAnthropicImageSource(args.back_image_url) },
    { type: "text", text: userText },
  ];

  // CONDITIONAL SEARCH (2026-09-01): the pack in her hand IS the source of
  // truth, so the first read runs with NO search tool attached. Only when the
  // returned payload shows the label could not be read (no brand, no name, no
  // panel, or the model's own "couldn't fully read" admission) does the caller
  // re-ask with the search budget it always had. Each search round costs
  // ~8-12s of wall clock, and on a legible pack it buys nothing.
  const searchDecision = decidePhotoSearch(args.allowSearch ? 2 : 1, !!args.allowSearch);
  const webSearchTool: ServerTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: searchDecision.maxUses,
  };


  const tipsLevel = coerceTipsLevel((args.context as Record<string, unknown> | undefined)?.tipsLevel);
  const req = await buildClaudeRequest({
    function_kind: "product-analyse",
    task_instructions: `${buildTaskInstructions(tipsLevel)}${
      args.sensitivityBlock ?? ""
    }${SCAN_USAGE_GROUNDING_BLOCK}${args.tierBlock ?? ""}${args.ledgerBlock ? `\n\n${args.ledgerBlock}` : ""}${OUTPUT_ECONOMY_RULES}${
      searchDecision.enabled
        ? ""
        : `

NO SEARCH TOOL IS AVAILABLE ON THIS CALL. Ignore every instruction above that offers web_search. Read the brand, product name, INCI list and directions from the two photos ONLY. Invent nothing: if the panel is not legible, return what you can read, leave the rest empty or null, and begin ai_summary with "Couldn't fully read the label —" so the pack can be resolved on a second pass.`
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
    rag_query: scanRagQuery(args.context as Record<string, unknown> | undefined),
    prefetched_evidence: args.prefetchedEvidence,
    rag_k: 4,
    tool: {
      name: "return_product_analysis",
      description:
        "Return the structured product analysis. Always invoke this tool exactly once at the end with the final analysis.",
      input_schema: RETURN_PRODUCT_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    },
    server_tools: searchDecision.enabled ? [webSearchTool] : [],
    // Note: NOT setting toolChoice. With server-side web_search, Anthropic
    // requires the model to remain free to invoke server tools, so we
    // describe the contract in the task instructions instead.
    // 4096 truncated the tool call on long INCI panels: the JSON arrived
    // incomplete, parsing failed, and a whole retry (plus its model time)
    // was spent re-writing an answer that was already correct.
    max_tokens: 8192,
  });

  const result = await callClaude<ProductAnalysisPayload>({
    ...req,
    onPartialJson: args.onPartialJson,
  });


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
    search_allowed: searchDecision.enabled,
    search_gate_reason: searchDecision.reason,
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
  type GroundingResult,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";
import { evidencePromptBlock } from "../_shared/evidence.ts";

/** The Lovable/Gemini path's grounding gather, extracted so the pipeline can
 *  start it before the model call rather than inside it (Part 4, 2026-09-01). */
function buildLovableGrounding(
  context: Record<string, unknown> | undefined,
): Promise<GroundingResult> {
  return buildGroundingBlock({
    surface: "product-analyse",
    fn: "product-analyse",
    functionKind: "product-analyse",
    selectorContext: selectorFromAiContext(context ?? {}),
    forceTopics: [
      "wash-day-mechanics",
      "porosity",
      "scalp-conditions",
      "diagnosed-conditions",
    ],
    ragQuery: ragQueryFromAiContext(
      context ?? {},
      "hair product ingredients suitability moisture protein scalp",
    ),
    ragK: 5,
  });
}
import { gatewayFetch } from "../_shared/ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "product-analyse", stage: 2 } as const;


function buildLovableSystem(tipsLevel: TipsLevel): string {
  const cap = levelCap(tipsLevel);
  return `${STRAND_PERSONA_WITH_RULES}

TASK
You are analysing a single product photo for THIS user.


ABSOLUTE RULES
1. READ the product directly from the image. The brand name and product title are usually the most prominent text on the front of the bottle/box. NEVER invent a name — if you can't read it confidently, set product_name and brand to the closest readable text and set "ai_summary" to start with "Couldn't fully read the label —".
2. If you can see an ingredient list (small print, often labelled "Ingredients" or "INCI"), transcribe ALL of it into "ingredients" (lowercase, comma-separated source split into array). If only some ingredients are visible, return what you see — do not pad.
3. Personalise everything to the user's profile passed in context: hairProfile (porosity, texture, density, scalp), currentStyle (background context only — see the style weighting rules), goals (length retention, breakage, scalp, etc.) and any "challenge" text the user wrote, bloodResults (only when this product directly intersects them), healthProfile (medications, conditions), history.flagged_ingredients (a NEUTRAL frequency count — ingredients that appear in 3+ of the user's saved products, i.e. things she already owns and uses; no safety or suitability meaning whatsoever), history.low_rated_products and history.high_rated_products.
4. RED/GREEN FLAG LOGIC for key_ingredients[].flag:
   - "avoid" (red) if the ingredient is in the member's declared topical sensitivities or documented allergies, OR appears in any history.low_rated_products[].ingredients, OR is contraindicated by the user's hair/health profile (e.g. drying alcohols on high-porosity hair or sulphates with dry scalp), OR works against a stated goal/challenge (e.g. heavy waxes when the user is trying to retain length in a wash-and-go).
   - "good" (green) if the ingredient appears in history.high_rated_products[].ingredients OR is well-matched to their porosity/texture/scalp OR directly supports a stated goal/challenge.
   - "warn" (amber) for neutral-but-noteworthy.
5. match_score (0–100): lower it sharply for any red flags; raise it for "good" flags; consider category fit, the durable style pattern they usually wear (default_style), blood-result deficiencies (only when relevant to this product), and goal alignment. current_hairstyle and days_in_style must never move the score. Ingredients the member already owns frequently (history.flagged_ingredients) must NEVER reduce the score — ownership frequency is not a fit signal in either direction.
5b. application_area / leave_on: read STRICTLY off the label's own directions. application_area = "scalp" (scalp/partings only), "lengths_ends" (mid-lengths and ends only), "scalp_and_lengths" (whole head), "rinse_out" (applied then rinsed off during washing). leave_on = true when the directions say it stays on the hair, false when it is rinsed out. If the label does not say, return "unknown" and null — NEVER guess from the product name or category.


PRODUCT ANALYSIS SCOPE — HARD RULE:
Focus ONLY on signals that intersect with what's INSIDE this product (ingredients, mechanism, formulation, application). Tension / traction alopecia / styling weight are HANDLING concerns, not formulation concerns — do NOT cite them in any product output. Lab values, sleep, stress, and dermatologist context are ONLY relevant if THIS product directly intersects them.

LANGUAGE RULE — NEVER use the phrase "avoid list", "avoid ingredients", "your avoids", or imply the user has any list of ingredients they want to avoid. The only ingredient-history signal in STRAND is ownership frequency (an ingredient appears in 3+ of her saved products). Describe it plainly — "cetearyl alcohol appears in four of the products on your shelf" — and never as flagged, risky or a concern, in ai_summary, key_ingredients[].reason, use_cases, or tips.
6. ai_summary: 2 short sentences MAX, second-person, in Paige's voice. The FIRST sentence cites a specific reason from THIS user's context — prefer their goal, challenge or a durable hair characteristic, never the style they're in (e.g. "High-porosity strands lose water fast, which is why this heavier sealing cream suits your length-retention goal."). 7. usage_instructions: VERBATIM directions from the manufacturer. If the label/page text shows a "Directions", "How to use", "Apply" or "Usage" block, transcribe it word-for-word into this field. If no manufacturer directions are visible, set this to an empty string ("") — do NOT invent or paraphrase usage steps.
8. use_cases: MAXIMUM ${cap} concrete tips for how THIS user gets the MOST out of the product on their own hair characteristics specifically (this user's support level caps it at ${cap}). Each item is ONE action sentence up to 30 words that NAMES the trait it is written for — porosity, density, width, scalp condition, length, goal or listed challenge — plus ONE "why" sentence up to 15 words. A tip that would read identically for any hair type is INVALID. Do NOT repeat the manufacturer's directions here; build on them with personal reasoning.
8b. tips: MAXIMUM ${cap} items, same word budget as use_cases, each anchored in the user's own data.
8c. PERSONALISED APPLICATION DEPTH — LEVELS 3-4 ONLY: at this user's support level, at least one use_cases item must give real application detail grounded in the retrieved manuscript passages: how much to use for their density/length, sectioning, exactly where this product sits in their wash-day sequence (Chapter 13 two-cleanse-then-condition baseline) and their 7-day wash rhythm, and what to pair with or avoid pairing from their shelf. At levels 1-2, give only the single highest-priority instruction, still concrete never generic.
8d. MATCH SCORE — re-derive match_score from scratch every time from THIS user's goals, porosity, hair characteristics and flagged blood markers weighed against the product's actual ingredients. NEVER anchor the score to marketing claims, brand reputation, or a generic "good product" judgement — a mismatched premium product scores LOW, a well-matched plain product scores HIGH.
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

async function runLovable(args: {
  image_url: string;
  context: Record<string, unknown>;
  ledgerBlock?: string;
  sensitivityBlock?: string;
  /** TIERS (Part 3) — see runClaude. */
  tierBlock?: string;
  /** Guardrail rejection feedback for a re-ask (empty on the first attempt). */
  retryInstruction?: string;
  /** Pre-resolved grounding block, gathered early and shared across attempts. */
  prefetchedGrounding?: GroundingResult;
}): Promise<ProductAnalysisPayload> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  // Manuscript grounding parity with the Claude path. Reuses the set the
  // pipeline already gathered when one was passed in (Part 4).
  const grounding = args.prefetchedGrounding ?? await buildLovableGrounding(args.context);


  const tipsLevel = coerceTipsLevel((args.context as Record<string, unknown> | undefined)?.tipsLevel);
  const tipsBlock = buildTipsLevelBlock(tipsLevel);

  const userMsg = `Analyse this product photo. Read the brand and product title directly from the label.

User context (use to compute flags, match_score, ai_summary, and use_cases):
${JSON.stringify(args.context ?? {}, null, 2)}
${args.retryInstruction ? `\n${args.retryInstruction}\n` : ""}
Return strict JSON matching the schema in your system prompt.`;

  const aiResp = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: `${buildLovableSystem(tipsLevel)}\n\n${tipsBlock}\n\n${CHAPTER_WHITELIST_PROMPT}${grounding.block}${args.sensitivityBlock ?? ""}${SCAN_USAGE_GROUNDING_BLOCK}${args.tierBlock ?? ""}${args.ledgerBlock ? `\n\n${args.ledgerBlock}` : ""}` },
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
Deno.serve(withScanDiagnostics("product-analyse", async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const kill = checkKillSwitch();
  if (kill) return kill;

  // Wall-clock budget for this whole request, retries included.
  const timeBudget = startTimeBudget();

  // STEP 1 (2026-09-04) — real failure diagnostics. These three travel with
  // the request so a failure can say WHAT failed, WHERE, after how long, and
  // with how many ingredients read. No member content is captured.
  const startedAt = Date.now();
  // CPU HEADROOM (2026-09-04): wall time alone hid how close we ran to the
  // worker CPU limit. Measured for every scan, reported in scan_timings.
  const cpuMeter = startCpuMeter();
  const diag = {
    phase: "start" as string,
    ingredientCount: null as number | null,
    userId: null as string | null,
    provider: null as string | null,
    attempt: null as number | null,
  };




  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;
    diag.userId = user.id;
    diag.phase = "parse_request";

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

    // SPEED (2026-08): when the caller asks for a stream, the same pipeline
    // runs unchanged — every gate, cache check, guardrail and cache write —
    // but partial model output is pushed to the member as it arrives. The
    // pipeline is a closure so the code below is identical in both modes.
    const wantsStream = body.stream === true;
    const pipeline = async (
      emit: ((event: string, data: unknown) => void) | null,
    ): Promise<Record<string, unknown> | Response> => {
    // STEP 2 (2026-09-04) — per-phase timings for SUCCESSFUL scans. Counters
    // only: nothing below changes what is generated or how it is grounded.
    const retrievalAtStart = retrievalStatsSnapshot();
    let labelReadAt: number | null = null;
    let analysisStartedAt: number | null = null;
    const provider = readAiProvider("STRAND_AI_PROVIDER_PRODUCT_PHOTO");

    diag.provider = provider;


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

    // ── Prep round-trips, concurrently ────────────────────────────────
    // PERFORMANCE: these four are independent of each other and all sit on
    // the critical path before the model call — sensitivity decrypt, the
    // cache read, the spend cap count and the advice ledger. Running them
    // sequentially added their full latency to every scan for no reason.
    // Nothing here changes WHAT the model receives, only when we wait.
    const [sens, cachedRow, capped, ledgerRows] = await Promise.all([
      loadSensitivities(supabase, user.id, "topical") as Promise<LoadedSensitivities>,
      cacheKind && !body.force
        ? supabase
          .from("ai_summaries")
          .select("payload")
          .eq("user_id", user.id)
          .eq("kind", cacheKind)
          .maybeSingle()
          .then((r: { data: { payload?: unknown } | null }) => r.data)
        : Promise.resolve(null),
      // Spend protection: per-user daily cap (model-spend paths only). A
      // cache hit returns before this result is used, exactly as before.
      checkDailyCap(user.id, "product-analyse", 25),
      fetchAdviceLedger(user.id),
    ]);

    const sensitivityBlock = topicalSensitivityBlock(sens);

    // ── Cache check (only when caller passed a productKey) ────────────
    if (cachedRow?.payload) {
      const cached = cachedRow.payload as ProductAnalysisPayload & { _profile_snapshot_hash?: string };
      const versionOk = provider === "claude"
        ? cached._model_version === MODEL_VERSION
        : cached._model_version === LOVABLE_MODEL_VERSION;
      const hashOk = cached._profile_snapshot_hash === profileHash;
      if (versionOk && hashOk) {
        void logScanTiming({
          function_name: "product-analyse",
          surface: "product-analyse",
          user_id: user.id,
          total_ms: Date.now() - startedAt,
          cpu_ms: cpuMeter.cpuMs(),
          cpu_pct_of_limit: cpuMeter.cpuPctOfLimit(),
          cache_hit: true,
          retrieval_call_count: 0,
          retrieval_ms: 0,
          meta: { provider },
        });
        return await sanitiseAndLog(
          annotateProductSensitivities(
            cached as unknown as Record<string, unknown>,
            sens,
            "product-analyse",
          ) as unknown as ProductAnalysisPayload,
          "product-analyse",
        ) as unknown as Record<string, unknown>;
      }


    }

    if (capped) return capped;

    // Workspace-wide automatic brake (see _shared/usage-cap.ts). Checked after
    // the cache return above, so cache hits are never refused.
    const ceiling = await checkGlobalCeiling("product-analyse");
    if (ceiling) return ceiling;

    const ledgerBlock = buildAdviceLedgerBlock(ledgerRows);

    // ── TIERED PERSONALISATION DATA (Part 3, 2026-09-01) ──────────────
    // A photo scan reads the pack INSIDE the model call, so at this point we
    // genuinely know nothing about the product: no name, no category, no INCI
    // list. The health tier therefore resolves to "compact" — her recorded
    // conditions, medications, life stage and the hair-relevant markers that
    // are out of range — rather than the full panel history, supplement list
    // and professional notes that used to travel on every single scan. The
    // URL and shelf surfaces DO know the product and get the full gate.
    // Tier 4 (wash-day / journal behaviour) never reaches the scoring prompt.
    const scanSignals: ProductSignals = {};
    const tiered = tierContext(ctx as Record<string, unknown>, scanSignals);
    const tier1 = runTier1(ctx as Record<string, unknown>, scanSignals);
    const tierBlock = `${tier1Block(tier1)}${tierRulesBlock(tiered)}`;
    console.log("[tiers] product-analyse", {
      health_mode: tiered.health.mode,
      health_reason: tiered.health.reason,
      withheld: tiered.withheld,
      water_hardness: tier1.waterHardness,
      shelf_overlap: tier1.shelfOverlap.length,
    });
    // SPEED (Part 4): the deterministic Tier 1 findings are known before the
    // model is even called, so they go out on the stream immediately rather
    // than waiting for the verdict. Unknown events are ignored by older
    // clients, so this is safe for members mid-session.
    emit?.("tier1", {
      water_hardness: tier1.waterHardness ?? null,
      shelf_overlap: tier1.shelfOverlap.length,
    });


    // ── LATENCY (Part 4, 2026-09-01) ──────────────────────────────────
    // The manuscript evidence gather (stage 1) depends only on her recorded
    // facts, so it starts HERE — the moment the scan is known to need a model
    // call — instead of inside the writer call, and runs alongside the
    // ingredient-vocabulary load. One resolved set then serves every retry
    // attempt AND the stage 3 citation verification, so the same passages are
    // never gathered twice. It is deliberately started AFTER the cache and cap
    // checks above so a cache hit still spends nothing.
    const evidencePromise = provider === "claude"
      ? evidencePromptBlock({
        fn: "product-analyse",
        surface: "product-analyse",
        memberContext: scanRagQuery(tiered.context as Record<string, unknown>).slice(0, 4000),
      }).catch((e) => {
        console.error("[product-analyse] evidence prefetch failed", e);
        return null;
      })
      : Promise.resolve(null);
    const lovableGroundingPromise = provider === "claude"
      ? Promise.resolve(null)
      : buildLovableGrounding(tiered.context as Record<string, unknown>).catch((e) => {
        console.error("[product-analyse] grounding prefetch failed", e);
        return null;
      });

    const [vocabulary, prefetchedEvidence, prefetchedGrounding] = await Promise.all([
      loadIngredientVocabulary(supabase as never),
      evidencePromise,
      lovableGroundingPromise,
    ]);

    // ── GENERATE + REPAIR (2026-09-01) ────────────────────────────────
    // The scan path used to generate once, null whatever a guardrail objected
    // to, and serve the remains — which is how a member got an empty verdict
    // with a single minus reason. It now runs the SAME bounded repair loop the
    // shelf path has always had (_shared/guardrail-loop.ts): a rejected field is
    // re-asked with the rejection fed back into the prompt, and only at the
    // attempt cap is anything nulled.
    // INTERNAL QA TRAIL (2026-09-02) — the scoring summary of the LAST attempt,
    // captured inside the loop and written once after it settles so photo scans
    // appear in /admin/score-debug alongside the shelf path.
    let scoreDebug: Record<string, unknown> | null = null;

    const loop = await runGuardrailLoop<ProductAnalysisPayload, FailsafeViolation>({
      functionName: "product-analyse",
      // WALL-CLOCK BUDGET (2026-09-03) — a retry is only started if it can
      // finish. Without this the worker was killed mid-loop and the member saw
      // a server error instead of the degraded-but-valid payload below.
      budget: timeBudget,
      onBudgetStop: ({ attemptNumber, remainingMs }) => {
        recordAiOutcome({
          function_name: "product-analyse",
          surface: "product-analyse",
          user_id: user.id,
          outcome: "rejected",
          rejection_rule: "budget_exhausted",
          retry_reason: "budget_exhausted",
          attempt_number: attemptNumber,
          max_attempts: MAX_REJECTION_ATTEMPTS,
        });
        console.warn(JSON.stringify({
          function: "product-analyse",
          event: "budget_exhausted",
          attempt: attemptNumber,
          remaining_ms: remainingMs,
        }));
      },
      generate: async (info) => {
        diag.attempt = info.attemptNumber;
        diag.phase = `model_call_attempt_${info.attemptNumber}`;
        if (analysisStartedAt === null) analysisStartedAt = Date.now();


        if (provider === "claude") {
          let { payload, web_search_invocations } = await runClaude({
            front_image_url: frontPhoto!,
            back_image_url: backPhoto!,
            context: tiered.context,
            selectorContext: buildSelectorContext(body),
            ledgerBlock,
            sensitivityBlock,
            tierBlock,
            retryInstruction: info.retryInstruction,
            prefetchedEvidence: prefetchedEvidence
              ? { block: prefetchedEvidence.block, grounded: prefetchedEvidence.grounded }
              : undefined,
            // Only the first attempt streams: a retry would otherwise rewrite
            // the preview the member is already reading. Emission is throttled
            // and stops once the ingredient array closes — per-delta emission
            // spent the worker's 2s CPU allowance and killed the isolate.
            onPartialJson: info.attemptNumber === 1 && emit
              ? createPartialEmitter(emit, {
                onCount: (n) => {
                  diag.ingredientCount = n;
                  // First moment the label had been read off the photos.
                  if (labelReadAt === null) labelReadAt = Date.now();
                },
              })
              : undefined,

          });
          const firstReadMs = Date.now() - (analysisStartedAt ?? Date.now());
          // CONDITIONAL SEARCH (2026-09-01): the read above had no search tool.
          // Grant one searching pass ONLY when the pack could not be resolved
          // from the photos — the majority of scans never pay for it.
          const searchRetry = needsSearchRetry(payload);
          console.log(JSON.stringify({
            function: "product-analyse",
            event: "search_retry_gate",
            needed: searchRetry.needed,
            reason: searchRetry.reason,
          }));
          // A searching pass is a SECOND full model call inside one attempt.
          // Only start it if the budget can still finish the tail afterwards.
          const canAffordSearch = timeBudget.canAfford(firstReadMs + RETRY_TAIL_MS);
          if (searchRetry.needed && !canAffordSearch) {
            console.warn(JSON.stringify({
              function: "product-analyse",
              event: "search_retry_skipped_budget",
              first_read_ms: firstReadMs,
              remaining_ms: timeBudget.remaining(),
            }));
          }
          if (searchRetry.needed && canAffordSearch) {
            const searched = await runClaude({
              front_image_url: frontPhoto!,
              back_image_url: backPhoto!,
              context: tiered.context,
              selectorContext: buildSelectorContext(body),
              ledgerBlock,
              sensitivityBlock,
              tierBlock,
              retryInstruction: info.retryInstruction,
              prefetchedEvidence: prefetchedEvidence
                ? { block: prefetchedEvidence.block, grounded: prefetchedEvidence.grounded }
                : undefined,
              allowSearch: true,
            });
            payload = searched.payload;
            web_search_invocations = searched.web_search_invocations;
          }
          return {
            ...payload,
            _model_version: MODEL_VERSION,
            _generated_at: new Date().toISOString(),
            _provider: "claude",
            _used_web_search: web_search_invocations > 0,
            _web_search_count: web_search_invocations,
          };
        }
        const lovable = await runLovable({
          image_url: body.image_url!,
          context: tiered.context,
          ledgerBlock,
          sensitivityBlock,
          tierBlock,
          retryInstruction: info.retryInstruction,
          prefetchedGrounding: prefetchedGrounding ?? undefined,
        });
        return {
          ...lovable,
          _provider: "lovable",
          _model_version: LOVABLE_MODEL_VERSION,
          _generated_at: new Date().toISOString(),
        };
      },
      postProcess: async (analysis, info) => {
        const a = analysis as unknown as Record<string, unknown>;
        // ── Level-aware server-side truncation — belt-and-braces on top of the
        // prompt instructions (models occasionally over-produce).
        {
          const cap = levelCap(tipsLevelForHash);
          if (Array.isArray(a.use_cases)) a.use_cases = (a.use_cases as unknown[]).slice(0, cap);
          if (Array.isArray(a.tips)) a.tips = (a.tips as unknown[]).slice(0, cap);
        }
        // ── Score reasons: normalise, keep the number honest, and reduce
        // ai_summary to the single overall-call sentence.
        {
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
        // vocabulary, ingredient-name lockdown). Identical module, identical
        // behaviour, in every analysis function — see _shared/analysis-failsafes.ts.
        const failsafe = enforceAnalysisFailsafes({
          functionName: "product-analyse",
          userId: user.id,
          fields: productProseFields(a),
          cards: a.key_ingredients,
          cardsField: "key_ingredients",
          allowedIngredients: Array.isArray(a.ingredients)
            ? (a.ingredients as unknown[]).map((i) => String(i))
            : [],
          vocabulary,
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
        scoreDebug = {
          subject: typeof a.product_name === "string" ? a.product_name : null,
          brand: typeof a.brand === "string" ? a.brand : null,
          generationId: info.generationId,
          breakdown: scoreBreakdown({
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
        };
        if (Array.isArray(failsafe.cards)) a.key_ingredients = failsafe.cards;
        if (failsafe.concernCorrections.reframed || failsafe.concernCorrections.reflagged) {
          console.log(JSON.stringify({
            function: "product-analyse",
            event: "concern_fit_applied",
            ...failsafe.concernCorrections,
          }));
        }
        a.strand_tip = failsafe.strandTips.length ? failsafe.strandTips : null;
        if (failsafe.score != null) a.match_score = failsafe.score;
        (a as unknown as Record<string, unknown>).quality_score = failsafe.qualityScore;
        (a as unknown as Record<string, unknown>).relevance_note = failsafe.relevanceNote;

        // USAGE GROUNDING GATE (2026-09-01) — parity with ingredient-analysis:
        // a technique specific must appear in the directions read off the pack.
        const usageProblems = scanUsageProblems(a);

        const retryRules = [
          ...failsafe.violations.map((v) => v.rule),
          ...usageProblems,
        ].filter(Boolean) as string[];

        if (retryRules.length && !info.isFinalAttempt) {
          // Nothing is nulled yet — the next attempt regenerates it.
          await logContentIntegrityRejections(failsafe.violations, {
            functionName: "product-analyse",
            userId: user.id,
            action: "rejected",
          });
          return { retryRules, violations: failsafe.violations };
        }

        if (failsafe.violations.length) {
          const cleared = applyFieldNulls(a, failsafe.violations);
          console.log(JSON.stringify({
            function: "product-analyse",
            violation: "vocabulary_or_name_lock",
            cleared,
            problems: failsafe.problems,
          }));
          // Author review: every rejection lands in ai_content_rejections.
          await logContentIntegrityRejections(failsafe.violations, {
            functionName: "product-analyse",
            userId: user.id,
            action: "field_nulled",
          });
        }
        if (usageProblems.length) {
          const removed = scrubScanUsage(a);
          console.warn(JSON.stringify({
            function: "product-analyse",
            event: "usage_grounding_scrub",
            removed,
          }));
        }

        // The label the member reads is derived from the score; the prose must
        // not contradict it.
        a.ai_summary = alignFitLanguage(
          a.ai_summary,
          typeof a.match_score === "number" ? a.match_score : null,
        );

        // ── Topical sensitivity warnings (deterministic, post-generation).
        // Runs AFTER score-reason normalisation so the named warning and its
        // score reason survive into the payload the member sees.
        annotateProductSensitivities(a, sens, "product-analyse");

        return { retryRules: [], violations: failsafe.violations };
      },
      // ── Sanitise BEFORE caching (2026-08-28) ──────────────────────────
      // The citation/fidelity sanitiser can DROP a whole score reason whose
      // prose it strips (an emptied `reason` makes the item hollow). Caching the
      // pre-sanitise payload and returning the post-sanitise one is what made
      // `ai_summaries` hold four reasons while the member read three. One
      // payload now: what we store is exactly what we deliver.
      sanitise: async (payload, info) =>
        await sanitiseAndLog(payload, "product-analyse", {
          surface: "product-analyse",
          userId: user.id,
          generationId: info.generationId,
          attemptNumber: info.attemptNumber,
          maxAttempts: MAX_REJECTION_ATTEMPTS,
          retryReason: info.retryReason,
          onRejected: info.onRejected,
        }) as unknown as ProductAnalysisPayload,
    });

    diag.phase = "post_model_guardrails";
    let analysis = loop.payload;
    if (loop.unresolvedRules.length) {
      console.warn(JSON.stringify({
        function: "product-analyse",
        event: "served_after_guardrail_cap",
        attempts: loop.attempts,
        rules: loop.unresolvedRules.slice(0, 6),
      }));
    }

    // NEVER-HOLLOW SUMMARY (shared with ingredient-analysis). A summary the
    // guardrails blanked leads with the strongest surviving reason instead of
    // reaching the member empty.
    backfillHollowSummary(analysis as unknown as Record<string, unknown>, "ai_summary");

    (analysis as unknown as Record<string, unknown>)._profile_snapshot_hash = profileHash;

    // ── NEVER LOSE FINISHED WORK (2026-09-04, moved 2026-09-04 pm) ─────
    // The guarded analysis is FINISHED at this point. It is persisted HERE,
    // before the QA trail, the cache upsert, the advice ledger and the timing
    // write — every one of which used to run first, and one of which the worker
    // was killed inside ("CPU Time exceeded" one second after the guardrail
    // stage settled), discarding a complete analysis. Nothing but the payload
    // itself is needed for the member to see her result, so nothing else runs
    // before it is safe on the server.
    await saveScanRecovery({
      supabase,
      userId: user.id,
      scanId: body.scan_id,
      functionName: "product-analyse",
      payload: analysis as unknown as Record<string, unknown>,
    });

    // INTERNAL QA TRAIL — admin-only, never member-facing, never awaited in a

    // way that can fail a scan. Profile fields are read off tiered.context, so
    // the order recorded is the order the model was actually given.
    if (scoreDebug) {
      const dbg = scoreDebug as Record<string, unknown>;
      void logScoreDebug({
        decryptStatus: ((ctx as Record<string, unknown>).decryptStatus as string | undefined) ?? null,
        userId: user.id,
        functionName: "product-analyse",
        subject: (dbg.subject as string | null) ?? null,
        brand: (dbg.brand as string | null) ?? null,
        generationId: (dbg.generationId as string | null) ?? null,
        healthTierMode: tiered.health.mode,
        tierIncluded: tiered.included,
        tierWithheld: tiered.withheld,
        profileFields: describeProfileFields(
          (tiered.context as Record<string, unknown>).hairProfile,
          { challenges: (tiered.context as Record<string, unknown>).challenges ?? [] },
        ),
        scoreBreakdown: dbg.breakdown as Record<string, unknown>,
      });
    }

    (analysis as unknown as Record<string, unknown>)._profile_snapshot_hash = profileHash;


    // ── Upsert cache (only when keyed) ────────────────────────────────
    diag.phase = "cache_write";
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

      // SUCCESS TIMINGS (2026-09-04) — fire-and-forget, admin-only.
      {
        const finishedAt = Date.now();
        const retrieval = retrievalStatsSince(retrievalAtStart);
        const ingredientCount = Array.isArray(
          (analysis as { ingredients?: unknown }).ingredients,
        )
          ? ((analysis as { ingredients: unknown[] }).ingredients.length)
          : diag.ingredientCount;
        void logScanTiming({
          function_name: "product-analyse",
          surface: "product-analyse",
          user_id: user.id,
          ocr_ms: labelReadAt ? labelReadAt - startedAt : null,
          retrieval_ms: retrieval.ms,
          retrieval_call_count: retrieval.calls,
          analysis_ms: analysisStartedAt ? finishedAt - analysisStartedAt : null,
          total_ms: finishedAt - startedAt,
          ingredient_count: ingredientCount,
          attempts: loop.attempts,
          cpu_ms: cpuMeter.cpuMs(),
          cpu_pct_of_limit: cpuMeter.cpuPctOfLimit(),
          cache_hit: false,
          meta: { provider, streamed: wantsStream },
        });
      }

      // NEVER LOSE FINISHED WORK (2026-09-04) — the guarded payload is
      // persisted under the client's scan id BEFORE it is streamed, so a
      // dropped connection cannot discard a finished analysis.
      await saveScanRecovery({
        supabase,
        userId: user.id,
        scanId: body.scan_id,
        functionName: "product-analyse",
        payload: analysis as unknown as Record<string, unknown>,
      });

      return analysis as unknown as Record<string, unknown>;

    };

    if (!wantsStream) {
      const result = await pipeline(null);
      return result instanceof Response ? result : json(200, result);
    }

    // ── SSE mode ──────────────────────────────────────────────────────
    // Events: `partial` (accumulated tool JSON, best-effort), `complete`
    // (the final, fully guarded payload — the ONLY payload the client
    // saves) and `error`. The client renders partials as a preview only.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const rawSend = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            // Client went away mid-scan; the pipeline still finishes and
            // writes its cache row so the next open is free.
          }
        };
        // EVENT TRACE (2026-09-04): every emitted event is logged with a
        // sequence number and a wall-clock offset, so "complete was never
        // emitted" and "complete never arrived" are distinguishable.
        const trace = traceSse(rawSend, "product-analyse", startedAt);
        const send = trace.send;
        // Flush immediately so the browser opens the stream (and the member
        // sees the "reading the label" state) without waiting on the model.
        send("open", { ok: true });
        // Keep the stream alive through the silent stretches (guardrail
        // retries, post-processing, cache writes) so mobile proxies don't drop it.
        const stopHeartbeat = startHeartbeat(send);
        try {
          const result = await pipeline(send);
          if (result instanceof Response) {
            const text = await result.text();
            let parsed: unknown = { error: "request_failed" };
            try {
              parsed = JSON.parse(text);
            } catch { /* non-JSON body */ }
            send("error", { status: result.status, body: parsed });
            logStreamOutcome("product-analyse", "error", trace, startedAt);
          } else {
            // `complete` is emitted directly on the stream — it never travels
            // the throttled/deduplicated partial path and is never gated by it.
            send("complete", result);
            logStreamOutcome("product-analyse", "complete", trace, startedAt);
          }
        } catch (e) {
          // STEP 1: the real error travels to the client and to scan_errors.
          const resp = await scanErrorResponse(e, {
            function_name: "product-analyse",
            phase: diag.phase,
            user_id: diag.userId,
            elapsed_ms: Date.now() - startedAt,
            ingredient_count: diag.ingredientCount,
            meta: { provider: diag.provider, attempt: diag.attempt, mode: "stream" },
          });
          let parsed: unknown = { error: "analysis_failed" };
          try {
            parsed = JSON.parse(await resp.text());
          } catch { /* non-JSON body */ }
          send("error", { status: resp.status, body: parsed });
          logStreamOutcome("product-analyse", "error", trace, startedAt);
        } finally {
          // Heartbeat interval always cleared, on every exit path.
          stopHeartbeat();
          try {
            controller.close();
          } catch { /* already closed */ }
        }
      },
    });
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });

  } catch (e) {
    return await scanErrorResponse(e, {
      function_name: "product-analyse",
      phase: diag.phase,
      user_id: diag.userId,
      elapsed_ms: Date.now() - startedAt,
      ingredient_count: diag.ingredientCount,
      meta: { provider: diag.provider, attempt: diag.attempt, mode: "json" },
    });
  }
}));
