// Analyses a product's ingredients against a user's hair + health profile.
// Phase 2 Step 2: dual-path — Lovable+Gemini (legacy) and Claude Sonnet 4.6
// (new), gated by STRAND_AI_PROVIDER_INGREDIENT.
//
// Architecture (audit PHASE_2_AUDIT.md §5 Step 2):
//   - Tool schema `return_analysis` ports verbatim from the legacy function,
//     except minItems/maxItems on `ingredients` are set DYNAMICALLY to
//     ingredients.length per request — replaces the brittle "EXACTLY ${n}"
//     prose flagged in AUDIT.md §1.
//   - Curated KB topics: porosity, scalp-conditions, diagnosed-conditions,
//     selectTopicsForContext layers in extras
//     up to the cap of 4.
//   - Conditional RAG via shouldTriggerRag(ingredients, userAvoidList).
//   - ai_summaries cache keyed by `ingredient_analysis:<productKey>`.
//     Cached payload carries `_model_version`; mismatched versions are
//     regenerated rather than served stale.
//   - Logging: usage tokens only, never the analysis body.

import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { checkKillSwitch } from "../_shared/kill-switch.ts";
import { checkDailyCap, checkGlobalCeiling } from "../_shared/usage-cap.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { requireAuthedUser as requireSignedInUser, isServiceRoleCaller } from "../_shared/auth.ts";
import { isEntitled, membershipRequired } from "../_shared/entitlement.ts";
import { resolveAiRequestMode } from "../_shared/impersonation.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude } from "../_shared/anthropic-client.ts";
import { shouldTriggerRag, matchTriggerIngredient } from "../_shared/rag-triggers.ts";
import { loadSensitivities, type LoadedSensitivities } from "../_shared/sensitivities.ts";
import {
  topicalSensitivityBlock,
  matchIngredient,
  scanTopical,
  sensitivityScoreReason,
  enforceIngredientCardSensitivities,
  applySensitivityCeiling,
} from "../_shared/topical-sensitivity.ts";
import { inciKeyCandidates, normaliseInciKey } from "../_shared/ingredient-copy.ts";
import {
  readSharedFacts,
  rebuildCardsFromFacts,
  sharedFactsBlock,
  writeSharedFacts,
} from "../_shared/ingredient-facts-cache.ts";
import { scrapePage } from "../_shared/page-scrape.ts";
import {
  extractDirectionsFromPage,
  scrubUngroundedUsage,
  usageGroundingBlock,
  recentTraitUsage,

  usageSourceLabel,
  validateUsageGrounding,
  type UsageDirections,
  type UsageSource,
} from "../_shared/usage-grounding.ts";
import {
  applyHomemadeSafety,
  buildHomemadeSafety,
  homemadeRecipeBlock,
  parseRecipe,
  type HomemadeSafety,
  type RecipeItem,
} from "../_shared/homemade-safety.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
} from "../_shared/book-chapters.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import {
  SCORE_REASONS_RULES,
  SCORE_REASONS_SCHEMA_PROPERTY,
  rankScoreReasons,
  heroActiveOmissions,
  sanitiseScoreReasons,
  alignScoreWithReasons,
  firstSentence,
  type ScoreReason,
} from "../_shared/score-reasons.ts";
import {
  applyFitFirst,
  FIT_FIRST_SCORE_RULES,
  sanitiseStrandTips,
  STRAND_TIP_SCHEMA_PROPERTY,
  type StrandTipNote,
} from "../_shared/fit-first-score.ts";
import {
  checkContentIntegrity,
  logContentIntegrityRejections,
} from "../_shared/content-integrity.ts";
import {
  buildNameLock,
  ingredientNameLockBlock,
  validateIngredientCardNames,
  validateNameLockFields,
  type NameLockContext,
  type NameLockViolation,
} from "../_shared/ingredient-name-lock.ts";

import {
  PURPOSE_INSIGHT_RULES,
  PURPOSE_INSIGHT_SCHEMA_PROPERTY,
  sanitisePurposeInsight,
  type PurposeInsight,
} from "../_shared/purpose-insight.ts";
import { NON_PRESCRIPTIVE_RULES } from "../_shared/non-prescriptive.ts";
import { STYLE_WEIGHTING_RULES } from "../_shared/style-weighting.ts";
import { FLAGGED_INGREDIENTS_RULES } from "../_shared/flagged-ingredients.ts";
import { perParagraph } from "../_shared/paragraph-rules.ts";
import { coerceTipsLevel, DEFAULT_TIPS_LEVEL, type TipsLevel } from "../_shared/tips-level.ts";
import {
  hasInstructingVerb,
  memberAttributeTokens,
  validateTipAction,
  validateTipReason,
} from "../_shared/tip-action.ts";
import {
  MAX_REJECTION_ATTEMPTS,
  buildRejectionRetryInstruction,
  makeGenerationId,
  retryReasonFromRules,
} from "../_shared/guardrail-retry.ts";
import { applyFieldNulls } from "../_shared/analysis-failsafes.ts";
import { applyConcernFit, parseChallenges, parseConcerns } from "../_shared/concern-fit.ts";
import { describeProfileFields, logScoreDebug, scoreBreakdown } from "../_shared/score-debug.ts";
import {
  GUIDANCE_PASS_MS,
  RETRY_TAIL_MS,
  startTimeBudget,
} from "../_shared/time-budget.ts";


import {
  QUALITY_SCORE_SCHEMA_PROPERTY,
  RELEVANCE_NOTE_SCHEMA_PROPERTY,
  resolveScoreAxes,
} from "../_shared/relevance-axis.ts";
import { validateMechanismSpecificity } from "../_shared/mechanism-specificity.ts";
import { applyBenignFlagPolicy } from "../_shared/benign-flags.ts";

declare const Deno: { env: { get(key: string): string | undefined }; serve: (h: (req: Request) => Promise<Response>) => void };

/** Short stable digest, used only for cache identity. */
async function shortHash(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// v15: closed-vocabulary validation, ingredient-naming lockdown, nullable
// descriptive fields and fit-first scoring with the separate Strand Tip.
// The bump forces regeneration so no member keeps reading a caution-first
// score or copy written before the terminology gate existed.
const MODEL_VERSION = "claude-sonnet-4-6@v29-decrypt-status-2026-09-02";



interface IngredientCard {
  name: string;
  tone: "good" | "warn" | "bad";
  /**
   * Cosmetic-chemistry category, drawn from the STRAND manuscript's framework
   * (Preservative, Humectant, Emollient, Occlusive, Surfactant, Conditioning
   * Agent, Protein, Active, Fragrance, Colourant, Solvent, pH Adjuster,
   * Chelator, Emulsifier, Thickener, Antioxidant, Botanical Extract).
   * NULLABLE: "not established" is a valid answer and is preferred over a
   * guess when the ingredient does not slot into a real category.
   */
  category: string | null;
  body: string | null;
  /** Set server-side when this ingredient matches a declared topical
   *  sensitivity — drives the distinct "sensitivity" tag in the UI. */
  sensitivity?: boolean;
}
interface GuidanceTip {
  title: string;
  body: string;
}
interface AnalysisPayload {
  match_score: number;
  /** Formulation quality + safety only — the basis for match_score. */
  quality_score?: number | null;
  /** One sentence when the formula's purpose differs from her recorded focus. */
  relevance_note?: string | null;
  score_reasons?: ScoreReason[];
  insight?: PurposeInsight;
  summary: string;
  /** Mild, non-harmful observations. NEVER part of the score. */
  strand_tip?: StrandTipNote[] | null;

  ingredients: IngredientCard[];
  personalised_guidance?: GuidanceTip[];
  _model_version?: string;
  _generated_at?: string;
  _provider?: "claude" | "lovable";
  /** Standalone concentration-aware caution, homemade products only. */
  homemade_safety?: HomemadeSafety;
}

const FORBIDDEN_GUIDANCE_PATTERNS: RegExp[] = [
  /\b(pair|layer|follow|combine|use)\s+(it\s+)?(with|under|over|after|before)\b/i,
  /\bfollow(ed)?\s+(this\s+\w+\s+)?with\b/i,
  /\bthen\s+(apply|use|add|seal|smooth|comb)\b/i,
  /\b(deep\s+conditioner|deep\s+conditioning|conditioning\s+treatment|leave[-\s]?in|hair\s+mask|protein\s+treatment|clarifying\s+wash|pre[-\s]?poo|styler|styling\s+cream|hair\s+oil|scalp\s+oil|hair\s+butter|serum|mousse|gel|edge\s+control|setting\s+lotion|heat\s+protectant|heat\s+protector)\b/i,
  /\bheat\s+(hat|cap)\b/i,
  /\bshower\s+cap\b/i,
  /\bplastic\s+cap\b/i,
  /\bteamtexture\b/i,
  /\btt\s+heat\b/i,
];

// ACTION + REASON FLOORS (the same shared helpers the goal tip, routine tips
// and the sponsored advert tip use). Usage guidance that never instructs the
// member to do anything is an observation, not a tip; guidance whose "why"
// merely restates the action is a tautology. Both now trigger ONE regeneration
// with the failures echoed back. We still never blank the card — if the retry
// also fails we log and serve, because a weak tip beats an empty product page.
function guidanceFloorProblems(
  analysis: AnalysisPayload,
  attributeTokens: string[],
): string[] {
  const problems: string[] = [];
  for (const tip of analysis.personalised_guidance ?? []) {
    const title = String(tip?.title ?? "").trim();
    const body = String(tip?.body ?? "").trim();
    if (!body) continue;
    // The first sentence carries the instruction; what follows is the why.
    const sentences = body.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    const action = sentences[0] ?? body;
    const reason = sentences.slice(1).join(" ");
    const label = title || action.slice(0, 40);

    const actionCheck = validateTipAction({
      action,
      supporting: [title, reason],
      attributeTokens,
    });
    if (!actionCheck.ok)
      problems.push(
        `the tip "${label}" fails the action floor (${actionCheck.reasons.join(", ")}). Its FIRST sentence must be a direct instruction for using THIS product — the physical action, where on the head, how much, and when — and must name one of this member's recorded details.`,
      );

    if (!reason)
      problems.push(
        `the tip "${label}" gives an instruction with no reason. Add ONE sentence after the instruction explaining why it matters for this member's hair — the mechanism or the consequence.`,
      );
    else {
      const reasonCheck = validateTipReason({ reason, action });
      if (!reasonCheck.ok)
        problems.push(
          `the tip "${label}" fails the reason floor (${reasonCheck.reasons.join(", ")}). The explanation must not restate the instruction in different words.`,
        );
    }
  }
  return problems;
}

function auditGuidanceActionFloor(analysis: AnalysisPayload, productKey: string): void {
  for (const tip of analysis.personalised_guidance ?? []) {
    const text = `${tip?.title ?? ""} ${tip?.body ?? ""}`;
    if (!hasInstructingVerb(text)) {
      console.warn("[ingredient-analysis] guidance tip has no action verb", {
        productKey,
        title: tip?.title ?? "",
      });
    }
  }
}


function guidanceReferencesOtherProduct(analysis: AnalysisPayload): boolean {
  const tips = analysis.personalised_guidance ?? [];
  for (const tip of tips) {
    const text = `${tip?.title ?? ""} ${tip?.body ?? ""}`;
    if (FORBIDDEN_GUIDANCE_PATTERNS.some((re) => re.test(text))) return true;
  }
  return false;
}

// Last-resort scrubber: strips whole sentences containing forbidden
// references so the UI never renders "pair with a deep conditioner" etc.
// If the tip empties out, replace with a minimal technique-only fallback.
function scrubGuidance(analysis: AnalysisPayload): AnalysisPayload {
  const tips = analysis.personalised_guidance;
  if (!Array.isArray(tips) || tips.length === 0) return analysis;
  const cleaned = tips.map((tip) => {
    // Paragraph-safe: filter sentence by sentence WITHIN each paragraph so a
    // blank line the model placed at a reasoning bridge survives the scrub.
    let body = perParagraph(tip?.body ?? "", (paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((s) => !FORBIDDEN_GUIDANCE_PATTERNS.some((re) => re.test(s)))
        .join(" ")
        .trim(),
    ).trim();
    let title = (tip?.title ?? "").trim();
    if (FORBIDDEN_GUIDANCE_PATTERNS.some((re) => re.test(title))) {
      title = "Get the most from this product";
    }
    if (!body) {
      body = "Focus on how you apply this product itself — technique, amount, sectioning, water temperature, dwell time and rinse — rather than reaching for another step.";
    }
    return { title, body };
  });
  return { ...analysis, personalised_guidance: cleaned };
}

// ── USAGE GROUNDING (how-to-use) ────────────────────────────────────────
// A technique specific must come from the real manufacturer directions, or be
// flagged as general guidance. Same discipline as the ingredient claim checks.
function usageGroundingProblems(
  analysis: AnalysisPayload,
  directions: UsageDirections,
): string[] {
  const fields = (analysis.personalised_guidance ?? []).flatMap((t, i) => [
    { field: `personalised_guidance[${i}].title`, text: t?.title },
    { field: `personalised_guidance[${i}].body`, text: t?.body },
  ]);
  return [...new Set(validateUsageGrounding(fields, directions).map((p) => p.rule))];
}

/** Terminal fallback: drop the ungrounded sentences rather than show them. */
function scrubUsageGrounding(
  analysis: AnalysisPayload,
  directions: UsageDirections,
  productKey: string,
): AnalysisPayload {
  const tips = analysis.personalised_guidance;
  if (!Array.isArray(tips) || tips.length === 0) return analysis;
  let removed = 0;
  const cleaned = tips.map((tip) => {
    const bodyOut = scrubUngroundedUsage(tip?.body ?? "", directions);
    const titleBad = validateUsageGrounding([{ field: "title", text: tip?.title }], directions).length > 0;
    removed += bodyOut.removed + (titleBad ? 1 : 0);
    return {
      title: titleBad ? "Get the most from this product" : (tip?.title ?? "").trim(),
      body: bodyOut.text || "Follow the manufacturer's own directions for this product, and focus on covering your hair evenly rather than adding conditions the label does not give.",
    };
  });
  if (removed) {
    console.warn(JSON.stringify({
      function: "ingredient-analysis",
      event: "usage_grounding_scrub",
      productKey,
      removed,
    }));
  }
  return { ...analysis, personalised_guidance: cleaned };
}

interface RequestBody {
  productKey: string;
  dryRun?: boolean;
  impersonatedUserId?: string;
  impersonation?: { targetUserId?: string; impersonatedBy?: string | null };
  productName: string;
  productBrand: string;
  ingredients?: string[];
  /** Stored product metadata — resolved from user_products when omitted. */
  category?: string | null;
  applicationArea?: string | null;
  leaveOn?: boolean | null;
  usageInstructions?: string | null;

  /** Member-made recipe: ingredient + free-text amount pairs. */
  isHomemade?: boolean;
  homemadeRecipe?: Array<
    { ingredient?: unknown; amount?: unknown; qty?: unknown; unit?: unknown }
  >;
  hairProfile?: Record<string, unknown>;
  healthProfile?: Record<string, unknown>;
  heritage?: string[];
  goals?: Array<Record<string, unknown>>;
  currentStyle?: Record<string, unknown> | null;
  challenges?: string[];
  force?: boolean;
  context?: Record<string, unknown> & {
    flagged_ingredients?: string[];
  };
}

// ── Tool schema (shared between providers) ──────────────────────────────
/** How many usage tips each support level wants. Hand-holding always shows the
 *  most; Minimal the single highest-impact one. */
function guidanceCount(level: TipsLevel): number {
  if (level >= 3) return 6;
  if (level === 2) return 3;
  return 1;
}

/** How much prose each tip body gets. Higher levels want a genuinely detailed
 *  explanation, not a single sentence. */
function guidanceDepth(level: TipsLevel): { sentences: string; words: number } {
  if (level >= 3) return { sentences: "4-6 sentences", words: 130 };
  if (level === 2) return { sentences: "2-3 sentences", words: 65 };
  return { sentences: "1-2 sentences", words: 40 };
}


function buildToolSchema(ingredientCount: number, level: TipsLevel = DEFAULT_TIPS_LEVEL) {
  // Dynamic minItems/maxItems is the explicit fix for AUDIT.md §1's
  // "EXACTLY ${ingredientCount}" prose brittleness. When count is 0 we
  // fall back to a permissive shape so the model can infer.
  const itemsConstraint = ingredientCount > 0
    ? { minItems: ingredientCount, maxItems: ingredientCount }
    : { minItems: 1 };
  return {
    type: "object",
    properties: {
      match_score: { type: "integer", minimum: 0, maximum: 100 },
      // TWO AXES (2026-09-01): quality/safety is the basis for match_score; a
      // purpose mismatch lives in relevance_note and never moves the number.
      quality_score: QUALITY_SCORE_SCHEMA_PROPERTY,
      relevance_note: RELEVANCE_NOTE_SCHEMA_PROPERTY,
      score_reasons: SCORE_REASONS_SCHEMA_PROPERTY,
      strand_tip: STRAND_TIP_SCHEMA_PROPERTY,
      insight: PURPOSE_INSIGHT_SCHEMA_PROPERTY,
      summary: {
        type: ["string", "null"],
        description:
          "One-sentence fit verdict for THIS member. Return null rather than writing a verdict you cannot support from the supplied ingredients and her recorded data.",
      },

      ingredients: {
        type: "array",
        ...itemsConstraint,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The ingredient name EXACTLY as supplied in the ingredient list. Never corrected, expanded, merged or made more specific." },
            tone: { type: "string", enum: ["good", "warn", "bad"] },
            category: {
              type: ["string", "null"],
              description: "Cosmetic-chemistry category from the STRAND manuscript: Preservative, Humectant, Emollient, Occlusive, Surfactant, Conditioning Agent, Protein, Active, Fragrance, Colourant, Solvent, pH Adjuster, Chelator, Emulsifier, Thickener, Antioxidant, Botanical Extract. If you cannot place it from real knowledge of the molecule, return null — null is correct and preferred over a guess.",
            },
            body: {
              type: ["string", "null"],
              description: "One sentence on the mechanism and what it means for this member, or null when nothing is established about this ingredient. Null is preferred over speculation.",
            },
          },
          required: ["name", "tone", "category", "body"],
        },
      },

      personalised_guidance: {
        type: "array",
        minItems: guidanceCount(level),
        maxItems: guidanceCount(level),
        description: `EXACTLY ${guidanceCount(level)} tip(s), ordered most important first, on how the user gets maximum benefit FROM THIS PRODUCT ALONE. Each tip covers a DIFFERENT lever — never repeat or rephrase another tip. Each must describe how to USE this exact product — technique, amount, section pattern, water/temperature, dwell time, rinse, frequency, dilution, distribution, where on the head. It must NEVER reference, name, pair with, layer with, follow with, or suggest ANY other product, product type, product category or routine step (no 'deep conditioner', 'leave-in', 'mask', 'oil', 'conditioner', 'styler', 'pre-poo', 'clarifying wash', 'protein treatment', 'heat cap', 'hat', 'towel', etc.). Do NOT mention the TT Heat Hat or any brand accessory here. If you would otherwise recommend another step, replace it with a technique-only lever on THIS product.`,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short imperative label about applying/using THIS product, max 6 words. Must be an action performed on THIS product itself. GOOD examples: 'Emulsify before it touches ends', 'Focus on the scalp only', 'Rinse with cooler water', 'Double-cleanse dense sections', 'Work through soaking-wet hair'. FORBIDDEN examples (never write these or anything similar): 'Pair with deep conditioning', 'Layer under your leave-in', 'Follow with a mask', 'Use with an oil'." },
            body: { type: "string", description: `${guidanceDepth(level).sentences}, up to ${guidanceDepth(level).words} words — a proper detailed explanation, NEVER a single sentence. Cover, in order: (1) exactly what to do with THIS product (amount, where on the head, sectioning, hair state — dry/damp/soaking-wet, water temperature, dwell time, rinse, frequency), (2) why that suits at least one named trait of this user's (porosity, density, hair type, length, a stated challenge or a signal from last_3_wash_days), quoting the mechanism of this product's key ingredient where it helps, (3) what it should look or feel like when done right, and (4) the specific mistake to avoid. Split into short paragraphs with a blank line between them where it aids readability. Do NOT reference any other product, product type, brand, accessory, or wash-day step.` },
          },
          required: ["title", "body"],
        },
      },
    },
    required: ["match_score", "score_reasons", "insight", "summary", "ingredients", "personalised_guidance"],
  } as Record<string, unknown>;
}

/**
 * SHARED FACTS MODE (2026-09-01): the ingredient cards for this exact formula
 * are already written and validated (public.product_ingredient_facts), so the
 * model is asked for the PERSONAL half only and the cards are re-attached
 * deterministically afterwards. Nothing member-specific is reused — only the
 * facts about the formula.
 */
function personalisationOnlySchema(level: TipsLevel = DEFAULT_TIPS_LEVEL) {
  const schema = buildToolSchema(0, level) as {
    properties: Record<string, unknown>;
    required: string[];
  };
  delete schema.properties.ingredients;
  schema.required = schema.required.filter((f) => f !== "ingredients");
  return schema as unknown as Record<string, unknown>;
}

// ── SPEED: known ingredient facts (LAYER 1 reuse) ───────────────────────
//
// A molecule's category and mechanism do not change with who is asking, and
// the shared `glossary_terms` table already holds both. Handing those to the
// model as ESTABLISHED FACTS removes the per-member re-derivation of ~20-30
// ingredient definitions — the bulk of the reasoning and output tokens on this
// call — and leaves the model only the personal half to write. The category is
// then set deterministically from the glossary row, so accuracy improves too:
// it is the same value every other ingredient surface shows.
export interface KnownFact {
  key: string;
  name: string;
  category: string | null;
  what_it_is: string | null;
}

async function loadKnownIngredientFacts(
  reader: { from: (t: string) => any }, // deno supabase client
  names: string[],
): Promise<Map<string, KnownFact>> {
  const out = new Map<string, KnownFact>();
  // Bilingual label forms ("water/eau/aqua") only resolve through their
  // candidate keys, so every alternative is looked up, not just the raw string.
  const keys = [...new Set(names.flatMap((n) => inciKeyCandidates(n)).filter(Boolean))];
  if (keys.length === 0) return out;
  try {
    const { data } = await reader
      .from("glossary_terms")
      .select("inci_key, display_name, category, what_it_is")
      .in("inci_key", keys.slice(0, 120));
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const key = String(row.inci_key ?? "");
      const what = row.what_it_is ? String(row.what_it_is).trim() : "";
      if (!key || !what) continue;
      out.set(key, {
        key,
        name: String(row.display_name ?? key),
        category: row.category ? String(row.category) : null,
        what_it_is: what,
      });
    }
  } catch (e) {
    console.warn("[ingredient-analysis] glossary facts unavailable", e instanceof Error ? e.message : e);
  }
  return out;
}

/** Prompt block: established facts the model must reuse rather than re-derive. */
function knownFactsBlock(facts: Map<string, KnownFact>): string {
  if (facts.size === 0) return "";
  const lines = [...facts.values()]
    .map((f) => `- ${f.name}${f.category ? ` [${f.category}]` : ""}: ${f.what_it_is}`)
    .join("\n");
  return `

ESTABLISHED INGREDIENT FACTS — DO NOT RE-DERIVE:
The category and mechanism below are already verified in STRAND's shared glossary and are shown to every member. For any ingredient listed here, reuse the given category EXACTLY and take the mechanism as given — do not restate it at length and do not contradict it. Spend your words on what it means for THIS member instead.
${lines}`;
}

/** Deterministically aligns each card's category with the shared glossary. */
function applyKnownCategories(
  analysis: AnalysisPayload,
  facts: Map<string, KnownFact>,
): AnalysisPayload {
  if (facts.size === 0 || !Array.isArray(analysis.ingredients)) return analysis;
  for (const card of analysis.ingredients) {
    const fact = facts.get(normaliseInciKey(String(card?.name ?? "")));
    if (fact?.category) card.category = fact.category;
  }
  return analysis;
}

// ── SPEED: guidance-only regeneration ───────────────────────────────────
//
// The guidance floor rejects roughly one in five generations. Re-running the
// WHOLE analysis to fix a usage tip re-writes every ingredient card for no
// reason — the single biggest avoidable cost on this function. This regenerates
// ONLY personalised_guidance, with the same rules and the same rejection
// feedback, and splices it back onto the accepted analysis.
async function runGuidanceRetry(args: {
  productName: string;
  productBrand: string;
  ingredients: string[];
  userPayload: Record<string, unknown>;
  selectorContext: SelectorContext;
  level: TipsLevel;
  problems: string[];
  sensitivityBlock?: string;
  usageBlock?: string;
  generationId?: string | null;
  attemptNumber?: number | null;
}): Promise<GuidanceTip[] | null> {
  const fullSchema = buildToolSchema(0, args.level) as {
    properties: Record<string, unknown>;
  };
  const req = await buildClaudeRequest({
    function_kind: "ingredient-analysis",
    task_instructions: `${buildTaskInstructions(args.productBrand, args.productName, args.ingredients.length, args.level, args.ingredients)}${args.sensitivityBlock ?? ""}${args.usageBlock ?? ""}

YOUR ONLY TASK NOW: return personalised_guidance. Every other field of the analysis is already accepted and must not be rewritten. Your previous guidance was REJECTED — fix every problem below. Each tip must be ONE instruction sentence about using THIS product, followed by the reason it matters for this member:
- ${args.problems.join("\n- ")}`,
    user_payload: args.userPayload,
    selector_context: args.selectorContext,
    force_topic_ids: ["wash-day-mechanics", "porosity"],
    tool: {
      name: "return_guidance",
      description: "Return only the personalised usage guidance for this product.",
      input_schema: {
        type: "object",
        properties: { personalised_guidance: fullSchema.properties.personalised_guidance },
        required: ["personalised_guidance"],
      } as Record<string, unknown>,
    },
    toolChoice: { type: "tool", name: "return_guidance" },
    max_tokens: 1400,
    generation_id: args.generationId ?? null,
    attempt_number: args.attemptNumber ?? null,
    retry_reason: "guidance_floor_retry",
  });
  const result = await callClaude<{ personalised_guidance?: GuidanceTip[] }>(req);
  const tips = result.toolInput?.personalised_guidance;
  return Array.isArray(tips) && tips.length > 0 ? tips : null;
}



// ── Task instructions (shared text — minus the brittle EXACTLY prose) ──
function buildTaskInstructions(productBrand: string, productName: string, ingredientCount: number, level: TipsLevel = DEFAULT_TIPS_LEVEL, allowedIngredients: string[] = []): string {
  return `You are analysing a hair product's INCI list against this specific user's profile. Return JSON only via the return_analysis tool, speaking as Paige.

Voice for this task: follow the VOICE PRINCIPLES from the system block. In every body field, lead with the molecule's mechanism in plain English (translate the cosmetic-chemistry term on first use), then bridge with a connective ("which means", "so", "this is why") into what it means for THIS user. Talk to "you", not "your hair". Warm but not saccharine; no hedging stacks.

USER INPUTS to weigh — TWO SEPARATE DOMAINS, never blended:
  • THE HAIR STRAND (hairProfile.porosity, hairProfile.elasticity, strand diameter, surface texture, curl pattern, length). Porosity, elasticity and cuticle describe the STRAND and only the strand. They are NOT properties of skin, scalp, follicles or sebum, and phrases like "porosity scalp", "scalp porosity" or "follicle elasticity" do not exist. Writing one is a hard failure.
  • THE SCALP AND SKIN (hairProfile.scalp_condition, density, hairline/edges, diagnoses in healthProfile). Weigh these with scalp language only — tolerance, irritation, flaking, sebum, comfort.
Also weigh: healthProfile (diagnoses, allergies, medications, blood markers), heritage, goals, challenges, bloodResults, medications, context.flagged_ingredients (a NEUTRAL frequency count of ingredients appearing in 3+ of her saved products — what she already owns and uses; it carries no safety, quality or suitability meaning and must never lower the match score).

CLOSED TERMINOLOGY — validated after you answer:
Use only hair and scalp terms STRAND already teaches: porosity (strand), cuticle, cortex, elasticity, strand diameter, surface texture, curl pattern, length retention, moisture retention, protein balance, build-up, slip, breakage, shrinkage, heat damage — and for the scalp: scalp condition, scalp health, sebum, follicle, flaking, irritation, hairline, edges, partings, shedding, density. Never invent a term, never fuse two terms into a new one, and never attach a strand property to the scalp. If no approved term fits what you want to say, say less or return null for that field.

NULL IS A VALID, PREFERRED ANSWER:
Every descriptive and categorical field in this schema is nullable. When something does not apply, or you do not have real grounded data for it, return null — that is CORRECT and preferred. Never fill a field with a plausible guess, a generic statement, or an inferred value to avoid leaving it empty. "Not established" beats invented detail every time.


PHILOSOPHY — READ THIS BEFORE FLAGGING ANYTHING:
We are NOT a Yuka-style scaremonger app. Cosmetic preservatives (phenoxyethanol, parabens at legal limits, sodium benzoate, potassium sorbate, methylisothiazolinone, etc.), fragrance/parfum, colourants, and standard pH adjusters are used in legally-permitted small quantities and are NOT inherently harmful for the general user. Do NOT mark them "bad" purely because they exist in the formula. Real-world cosmetic safety is regulated; our job is personalised fit, not fear.

MOISTURE — NON-NEGOTIABLE LANGUAGE RULE (the STRAND manuscript, Chapter 14: Moisture Retention):
Moisture comes from water. Period. Products do NOT add, restore, replace, infuse, replenish, deliver, hydrate-from-scratch, or otherwise create moisture. They seal it in, lock it in, help it stay, slow water loss, or improve absorption of the water already there. NEVER write "restores moisture", "adds moisture", "replenishes moisture", "delivers moisture", or "hydrates the strand". Use book-aligned phrasing only: "seals moisture in", "locks moisture in", "helps retain moisture", "slows moisture loss", "supports moisture retention", "softens cuticle so water can absorb during wash day". Conditioners, leave-ins, oils, butters, masks and stylers are sealers / softeners / penetrants / emollients / humectants — never water sources. Apply this rule to ingredient body copy, the summary, and personalised_guidance equally.

WASH-DAY BASELINE — HARD RULE (Chapter 13):
When the product is a shampoo, cleanser, co-wash, conditioner, deep conditioner, mask, or anything used on wash day, the app's core routine logic is: cleanse the scalp first with a cleansing/all-purpose shampoo, cleanse the hair second with a moisturising/conditioning shampoo, then condition. If personalised_guidance is about THIS shampoo/cleanser, the best tip should usually be about which cleanse it belongs to, scalp-first application, emulsifying, sectioning, dwell/contact time, or letting lather run through lengths — without inventing other products. Do not present co-wash as replacing shampoo cleansing.

RULES — STRICT:
1. Flag EVERY ingredient supplied — do NOT skip any (including water, fragrance, colourants, preservatives). The tool schema enforces the count (${ingredientCount > 0 ? ingredientCount : "as supplied"}); preserve the input order.
2. tone — apply this exact decision tree:
   - "bad" ONLY if AT LEAST ONE of the following is true:
     a) the ingredient (or its INCI alias) appears in the member's DECLARED topical sensitivities or a documented allergy (NEVER because it appears in context.flagged_ingredients — that list is only a count of what she already owns), OR
     b) the ingredient appears in the member's DECLARED topical sensitivities (see the ALLERGY AND SENSITIVITY CONSTRAINTS block — these are recorded, structured data and take priority over everything else here: a declared hard exclusion is ALWAYS "bad", and its body must name the sensitivity explicitly), OR the user has a documented allergy / sensitivity / diagnosis in healthProfile that this molecule directly aggravates (e.g. SLS sulphate when scalp_condition flags seborrheic dermatitis or eczema; isopropyl/SD alcohol on a documented "high porosity + breakage" combo; a named allergen the user listed), OR
     c) the molecule directly conflicts with a measurable hair trait the user holds (e.g. heavy mineral oil sealing low-porosity hair the user is trying to moisturise — and even then, only if the formula puts it high in the list).
     NEVER mark a standard preservative, fragrance, colourant, or pH adjuster "bad" without (a), (b) or (c). Existence ≠ harm.
   - "good" = the ingredient has a documented mechanism that benefits THIS user's measurable traits (humectant for low-porosity in humid climate, emollient for high-porosity ends, anti-fungal for diagnosed scalp condition, etc.).
   - "warn" = neutral / context-dependent / patch-test recommended / "fine for most people but watch how your scalp reacts". Use "warn" — NOT "bad" — for routine preservatives and fragrance when the user has no flagged sensitivity.
   - EXPOSURE GATE (product.application_area / product.leave_on in the payload) — apply this BEFORE settling any tone. The same molecule does not carry the same risk at every contact point or contact time:
     • application_area "scalp": weigh scalp tolerance, irritation and the member's scalp condition. Do NOT raise a lengths/porosity concern (sealing, weighing down, protein balance, cuticle build-up) to "bad" for a product that never touches the lengths — "warn" at most, and say the exposure is scalp-only.
     • application_area "lengths_ends": weigh porosity, protein/moisture balance, build-up and slip. Do NOT raise a scalp-irritation concern to "bad" when the directions keep it off the scalp — "warn" at most.
     • application_area "scalp_and_lengths": both sets of concerns apply at full weight.
     • application_area "rinse_out" or leave_on false: contact time is minutes and the formula is washed away, so build-up, occlusion, heaviness and coating concerns drop a step (a "bad" becomes "warn", a "warn" becomes neutral) unless the ingredient is a DECLARED sensitivity. Declared sensitivities and documented allergies are NEVER downgraded by exposure — they stay "bad" at any contact time.
     • leave_on true: contact is hours to days, so occlusion, build-up and drying-alcohol concerns apply at FULL weight.
     • application_area "unknown": weigh it neutrally from the ingredients alone. Do NOT infer an application area from the product name, and never write about where it goes as if you know.
3. body: ONE concise sentence (max 22 words). Lead with the SCIENTIFIC mechanism (what the molecule does chemically), THEN tie to the user's specific data point if relevant. No generic care tips, no usage instructions, no "consider", no "may help your routine". Never imply legal-limit cosmetic ingredients are dangerous.
   GOOD example (bad): "Anionic surfactant — strips sebum and lipids; harsh given your dry scalp diagnosis."
   GOOD example (warn): "Broad-spectrum preservative used at <1% — safe at this level; flag only if your scalp has reacted to it before."
   BAD example: "Avoid — fragrance can irritate." (No, only if the user has flagged it.)
3a. category: assign EVERY ingredient a single category from the STRAND manuscript's ingredient framework — Preservative, Humectant, Emollient, Occlusive, Surfactant, Conditioning Agent (cationic / silicone / quat), Protein, Active, Fragrance, Colourant, Solvent, pH Adjuster, Chelator, Emulsifier, Thickener, Antioxidant, Botanical Extract. Never invent a new category, and where you genuinely cannot place the molecule from real knowledge, return null instead of forcing the closest-sounding one.
${FIT_FIRST_SCORE_RULES}
4a. match_score AND EXPOSURE — the exposure gate above is an explicit scoring factor, not just a tone factor. A concern only counts against the score to the extent the directions actually expose the member to it: a scalp-only, rinse-off product must NOT be docked as hard as a leave-on lengths product carrying the same ingredient, and a rinse-out formula must not be docked for build-up or heaviness the way a leave-in is. Where exposure changed the weighting, say so in the matching score_reasons row (e.g. "rinsed out, so contact time is short"). A DECLARED sensitivity is docked at full weight regardless of exposure. When application_area is "unknown", score from the ingredients alone and never assert where the product goes.
${ingredientNameLockBlock(allowedIngredients)}


5. summary: 1 sentence (max 25 words) — pure factual fit verdict for THIS user. No advice, no tips. 6. personalised_guidance: return EXACTLY ${guidanceCount(level)} tip(s) — the highest-impact, science-rooted guidance for how this user gets the most out of THIS specific product, ordered most important first. Never more, never fewer. Each tip must cover a DIFFERENT lever (e.g. amount, sectioning, water state, dwell time, rinse, frequency, distribution for their density) with no overlap or restatement. Each tip body must be a DETAILED, multi-sentence explanation (${guidanceDepth(level).sentences}, up to ${guidanceDepth(level).words} words) — never a single sentence. Within each tip, give the action in full (amount, placement, sectioning, hair state, temperature, dwell time, rinse, frequency), the reason it fits one NAMED trait of this user, what it should look or feel like when done right, and the mistake to avoid. ${level >= 3 ? "This user is at support level 3 (hand-holding): the fullest, most explanatory version — plain words, reading age 9-10, timings scaled to their hair, everything spelled out." : level === 2 ? "This user is at support level 2 (essential): the action, one sentence of why, and the concrete how. No extended explanatory passage." : "This user is at support level 1 (minimal): the action plus one short sentence of why, and nothing more."}

   ABSOLUTE SCOPE — HARD BAN on referencing anything outside THIS product:
   - Do NOT recommend, name, pair with, "follow with", "layer with", "use alongside", "then apply", or otherwise suggest ANY other product, product type, or step (no "deep conditioner", "leave-in", "oil", "mask", "clarifying wash", "protein treatment", "styler", etc.). Even generic categories are banned.
   - Do NOT suggest a routine, regimen, wash-day structure, or multi-step process. The tip is ONLY about how to apply/use THIS product itself to get maximum benefit.
    - Exception for shampoo/cleanser category only: you may identify whether THIS product belongs as the scalp-focused first cleanse or the hair-focused second cleanse. Keep the tip about THIS product's role and technique; do not recommend a named second product.
   - Allowed levers ONLY: application technique on THIS product (dry vs damp vs soaking-wet hair, sectioning, emulsifying in palms, scalp-only vs lengths, contact/dwell time, water temperature, rinse pressure, frequency of use of THIS product, amount used, whether to double-cleanse with it, whether to dilute it, how to distribute it for this user's density/porosity).

   How to choose the tip — weigh in this order:
   (a) the manufacturer's intended use (shampoo, conditioner, leave-in, mask, oil, pre-poo, styler, etc.),
   (b) the STRAND manuscript guidance for THAT specific product category applied to THIS user's traits (e.g. for shampoos: surfactant strength vs porosity, scalp-first application, frequency for textured hair, avoiding lengths agitation for length retention),
   (c) the mechanism of this product's most important key/active ingredient,
   (d) the user's most relevant hair data point (porosity, density, type, length, key goal or challenge),
   (e) SIGNALS FROM last_3_wash_days in context: recent scalp_feel (itchy/dry/oily/tight), breakage level, hair_feel_note, and how frequently they wash — use these to sharpen the tip (e.g. if breakage is high and this is a shampoo, guide gentler emulsification; if scalp_feel is oily and this is a shampoo, guide focused scalp-only application; if wash frequency is low, adjust dwell/technique accordingly).

   The tip MUST explicitly reference at least ONE of: a named goal/challenge from the user's data, a measurable hair trait, OR a specific signal from their last_3_wash_days. Never generic.

   Never name the source, author, book, chapter or page. Write in your own voice.

   - DO NOT mention: traction alopecia, alopecia of any kind, diagnosed scalp conditions, medical conditions, medications, blood markers, hormones, life stage, or any health diagnosis. Those belong elsewhere in the app, not in product usage tips.
   - DO NOT prescribe styling-tension behaviour (braids too tight, take-down schedules driven by alopecia risk, etc.). Style references are only allowed as neutral context (e.g. "good for refreshing day-3 twist-outs") not as a medical warning.
   Examples (adapt — never copy verbatim, never mention other products):
   - Shampoo, high-porosity, length-retention goal, recent breakage in wash logs: title: "Emulsify before it touches the ends", body: "Work a coin-sized amount into wet palms first, then apply to your scalp only in four parted sections — let the lather run down your high-porosity lengths on the rinse. Your last two wash days flagged breakage, so keep hands off the mid-shafts while cleansing to protect length retention."
   - Leave-in, low-porosity, box braids 3 weeks in: title: "Mist it on soaking-wet partings", body: "Three weeks into your braids, dilute in a spray bottle and mist directly onto damp scalp partings — low-porosity strands only absorb when the cuticle is already softened by water, so applying to dry braids will just sit on top."

7. NEVER INVENT AN INGREDIENT. You may only name, discuss or reason about ingredients that appear in the supplied ingredient list, exactly as supplied. If the list is empty, say plainly that the ingredients could not be read and return no per-ingredient entries — do NOT infer, guess or assume a typical formulation for this brand or product type. Do not rename a supplied ingredient to a more specific chemical than it says (a list saying "Alcohol" is Alcohol, never "Alcohol Denat.").
8. Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition. Cite mechanism (surfactant class, humectant, emollient, occlusive, cationic conditioner, chelator, pH adjuster, etc.) where it adds clarity.

${SCORE_REASONS_RULES}

${PURPOSE_INSIGHT_RULES}

${NON_PRESCRIPTIVE_RULES}

${STYLE_WEIGHTING_RULES}

${FLAGGED_INGREDIENTS_RULES}

NOTE FOR THIS FUNCTION: the one-sentence overall call lives in the "summary" field (not ai_summary) — the SCORE REASONS rules apply to "summary" in exactly the same way. A score reason may NOT restate a personalised_guidance tip or an ingredient body verbatim.`;
}

// ── Selector context for KB topic matching ──────────────────────────────
function buildSelectorContext(body: RequestBody): SelectorContext {
  const hp = (body.hairProfile ?? {}) as Record<string, unknown>;
  const hl = (body.healthProfile ?? {}) as Record<string, unknown>;
  const ctx = body.context ?? {};
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
    bloodResults: [],
  };
}

// ── RAG query construction ──────────────────────────────────────────────
function buildRagQuery(
  productName: string,
  ingredients: string[],
  hairProfile: Record<string, unknown>,
): string {
  const triggers: string[] = [];
  for (const ing of ingredients) {
    const m = matchTriggerIngredient(ing);
    if (m && !triggers.includes(m)) triggers.push(m);
  }
  const hp = hairProfile;
  const hairBits = [
    hp.porosity ? `${hp.porosity} porosity` : null,
    hp.density ? `${hp.density} density` : null,
    hp.scalp_condition ? `${hp.scalp_condition} scalp` : null,
  ].filter(Boolean).join(", ");
  return `ingredient analysis for ${productName} with ${triggers.join(", ") || "actives"}, user has ${hairBits || "natural hair"}`;
}

// ── Provider: Claude (new path) ─────────────────────────────────────────
async function runClaude(args: {
  productName: string;
  productBrand: string;
  ingredients: string[];
  hairProfile: Record<string, unknown>;
  userPayload: Record<string, unknown>;
  selectorContext: SelectorContext;
  avoidList: string[];
  level: TipsLevel;
  sensitivityBlock?: string;
  factsBlock?: string;
  usageBlock?: string;
  generationId?: string | null;
  attemptNumber?: number | null;
  maxAttempts?: number | null;
  retryReason?: string | null;
  /** TIERS (Part 3): deterministic Tier 1 findings + which tiers are visible. */
  tierBlock?: string;
  /** Shared-facts mode: ask for the personalisation only (see
   *  personalisationOnlySchema / _shared/ingredient-facts-cache.ts). */
  personalisationOnly?: boolean;
}): Promise<AnalysisPayload> {
  const { productName, productBrand, ingredients, hairProfile, userPayload, selectorContext, avoidList, level } = args;
  const ingredientCount = ingredients.length;

  const ragOn = shouldTriggerRag(ingredients, avoidList);
  const ragQuery = ragOn ? buildRagQuery(productName, ingredients, hairProfile) : undefined;

  const req = await buildClaudeRequest({
    function_kind: "ingredient-analysis",
    task_instructions: `${buildTaskInstructions(productBrand, productName, ingredientCount, level, ingredients)}${args.sensitivityBlock ?? ""}${args.usageBlock ?? ""}${args.factsBlock ?? ""}${args.tierBlock ?? ""}`,
    user_payload: userPayload,
    selector_context: selectorContext,
    force_topic_ids: ["wash-day-mechanics", "porosity", "scalp-conditions", "diagnosed-conditions"],
    rag_query: ragQuery,
    rag_k: 4,
    tool: {
      name: "return_analysis",
      description: "Return the structured ingredient analysis.",
      input_schema: args.personalisationOnly
        ? personalisationOnlySchema(level)
        : buildToolSchema(ingredientCount, level),
    },
    toolChoice: { type: "tool", name: "return_analysis" },
    max_tokens: 2400,
    generation_id: args.generationId ?? null,
    attempt_number: args.attemptNumber ?? null,
    max_attempts: args.maxAttempts ?? null,
    retry_reason: args.retryReason ?? null,
  });

  const result = await callClaude<AnalysisPayload>(req);

  // Usage logging — never log the analysis body.
  console.log(JSON.stringify({
    function: "ingredient-analysis",
    provider: "claude",
    rag: ragOn,
    input_tokens: result.usage.input_tokens,
    cache_read_input_tokens: result.usage.cache_read_input_tokens,
    cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
    output_tokens: result.usage.output_tokens,
  }));

  if (!result.toolInput) {
    throw new Error("Claude returned no tool_use block");
  }
  return result.toolInput;
}

import { allChallenges } from "../_shared/challenges.ts";
import {
  compactHealthTier,
  rotateProfileSignals,
  runTier1,

  shouldIncludeHealthTier,
  tier1Block,
  tierRulesBlock,
  TIER_4_KEYS,
  type ProductSignals,
} from "../_shared/tiers.ts";
import {
  buildGroundingBlock,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";
import { gatewayFetch, recordAiOutcome, setAiCallImpersonation, setAiCallUser } from "../_shared/ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "ingredient-analysis", stage: 2 } as const;


// ── Provider: Lovable+Gemini (legacy path, preserved verbatim) ─────────
async function runLovable(args: {
  systemPrompt: string;
  userPayload: Record<string, unknown>;
  ingredientCount: number;
  level: TipsLevel;
  generationId?: string | null;
  attemptNumber?: number | null;
  maxAttempts?: number | null;
  retryReason?: string | null;
  /** Shared-facts mode — personalisation only, cards re-attached after. */
  personalisationOnly?: boolean;
}): Promise<AnalysisPayload> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const groundingCtx = ((args.userPayload.context ?? args.userPayload) as Record<string, unknown>) as Record<string, unknown> | null;
  const grounding = await buildGroundingBlock({
    surface: "ingredient-analysis",
    fn: "ingredient-analysis",
    functionKind: "ingredient-analysis",
    selectorContext: selectorFromAiContext(groundingCtx),
    forceTopics: ["wash-day-mechanics","porosity","scalp-conditions","diagnosed-conditions"],
    ragQuery: ragQueryFromAiContext(groundingCtx, "hair product ingredients surfactants proteins oils suitability scalp"),
    ragK: 4,
  });

  const aiResp = await gatewayFetch({
    ...AI_METER_META,
    generation_id: args.generationId ?? null,
    attempt_number: args.attemptNumber ?? null,
    max_attempts: args.maxAttempts ?? null,
    retry_reason: args.retryReason ?? null,
  }, "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: `${args.systemPrompt}${grounding.block}` },
          { role: "user", content: JSON.stringify(args.userPayload) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis",
              description: "Return the structured ingredient analysis.",
              parameters: args.personalisationOnly
                ? personalisationOnlySchema(args.level)
                : buildToolSchema(args.ingredientCount, args.level),
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_analysis" } },
      }),
    },
  );

  if (!aiResp.ok) {
    const status = aiResp.status;
    const t = await aiResp.text();
    console.error(`[ingredient-analysis] lovable gateway ${status}: ${t.slice(0, 120)}`);
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = status;
    throw err;
  }

  const aiJson = await aiResp.json();
  const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("Lovable returned no tool call");
  }
  return JSON.parse(toolCall.function.arguments) as AnalysisPayload;
}

// Kept inline for the lovable path — persona must travel verbatim.
const STRAND_PERSONA_INLINE = STRAND_PERSONA_WITH_RULES;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const kill = checkKillSwitch();
  if (kill) return kill;

  // Wall-clock budget for this whole request, retries included.
  const timeBudget = startTimeBudget();




  try {
    // ── Caller resolution ─────────────────────────────────────────────
    // Two entry points:
    //   1. a signed-in member (normal), optionally an admin dry-run;
    //   2. a trusted service-role caller running the paced re-analysis
    //      backfill on a named member's behalf (`backfillUserId`). That path
    //      is exempt from the PER-MEMBER daily cap — the backfill is our
    //      spend, not hers, and it must not fail loudly in her face — but it
    //      still respects the kill switch and the workspace-wide ceiling.
    const preBody = await req.json().catch(() => ({})) as RequestBody & {
      backfillUserId?: string;
    };
    const backfillFor = isServiceRoleCaller(req) && typeof preBody.backfillUserId === "string"
      ? preBody.backfillUserId
      : null;

    let memberId: string;
    let dataClient: ReturnType<typeof createClient>;
    let mode: { userId: string; dryRun: boolean; isImpersonated: boolean; impersonatedBy: string | null };
    const serviceBackfill = backfillFor !== null;

    if (serviceBackfill) {
      memberId = backfillFor!;
      dataClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      mode = { userId: memberId, dryRun: false, isImpersonated: false, impersonatedBy: null };
      setAiCallUser(memberId);
      setAiCallImpersonation({ isImpersonated: false, impersonatedBy: null });
    } else {
      const auth = await requireSignedInUser(req);
      if (auth instanceof Response) return auth;
      const { user: authUser, supabase } = auth;
      const resolved = await resolveAiRequestMode(authUser.id, preBody as Record<string, unknown>, supabase as never);
      if (resolved instanceof Response) return resolved;
      mode = resolved;
      memberId = resolved.userId;
      dataClient = (resolved.dryRun
        ? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
        : supabase) as ReturnType<typeof createClient>;
      setAiCallUser(memberId);
      setAiCallImpersonation({ isImpersonated: resolved.isImpersonated, impersonatedBy: resolved.impersonatedBy });
      if (!(await isEntitled(memberId))) return membershipRequired();
    }
    const body: RequestBody = preBody;


    // Declared topical (skin/scalp) sensitivities — structured, encrypted
    // data that outranks free-text healthProfile mentions.
    const sens: LoadedSensitivities = await loadSensitivities(dataClient, memberId, "topical");
    const sensitivityBlock = topicalSensitivityBlock(sens);

    const {
      productKey, productName, productBrand,
      ingredients, hairProfile, healthProfile, heritage,
      goals, currentStyle, challenges, force,
    } = body;

    if (!productKey || !productName) {
      return json(400, { error: "Missing product info" });
    }

    // THE ingredient list. `user_products.ingredients` is the stored source of
    // truth every other surface reads (shelf card, passport, aiContext), so it
    // is what the model is given AND what the deterministic sensitivity scan
    // runs against. Without this the caller sent nothing for a saved product
    // and the model inferred a plausible formulation instead — which is how a
    // declared sulphate sensitivity stayed invisible on the detail page while
    // the shelf card flagged it correctly from the same stored row.
    let rawIngredients: string[] = Array.isArray(ingredients)
      ? ingredients.filter((x) => typeof x === "string" && x.trim().length > 0)
      : [];
    if (rawIngredients.length === 0) {
      const { data: storedRow } = await dataClient
        .from("user_products")
        .select("ingredients")
        .eq("user_id", memberId)
        .eq("product_key", productKey)
        .maybeSingle();
      const stored = storedRow?.ingredients;
      if (Array.isArray(stored)) {
        rawIngredients = stored.filter(
          (x: unknown): x is string => typeof x === "string" && x.trim().length > 0,
        );
      }
    }

    // ── Homemade (DIY) recipe ─────────────────────────────────────────
    // Amounts matter here in a way they never do for a commercial product, so
    // the recipe is resolved the same defensive way the ingredient list is:
    // caller first, stored row second. `ingredients` stays the flat name list
    // every other surface reads.
    let isHomemade = body.isHomemade === true;
    let recipe: RecipeItem[] = parseRecipe(body.homemadeRecipe);
    if (!isHomemade || recipe.length === 0) {
      const { data: hmRow } = await dataClient
        .from("user_products")
        .select("is_homemade, homemade_recipe")
        .eq("user_id", memberId)
        .eq("product_key", productKey)
        .maybeSingle();
      if (hmRow?.is_homemade) isHomemade = true;
      if (recipe.length === 0) recipe = parseRecipe(hmRow?.homemade_recipe);
    }
    if (isHomemade && recipe.length === 0) {
      // No amounts on file (older row): still route it as homemade, with the
      // amount explicitly unknown rather than silently assumed safe.
      recipe = rawIngredients.map((n) => ({ ingredient: n, amount: "" }));
    }

    // ── HARD BLOCK: no captured ingredients, no generation ─────────────
    // (2026-08-28) A product whose ingredient list could not be read must never
    // be scored, described or reasoned about. This is enforced in code, BEFORE
    // the cache lookup and before any model call, so neither a prompt rule nor
    // an older fabricated cache row can put invented ingredient names in front
    // of a member. The only valid response is "we couldn't read the
    // ingredients".
    if (rawIngredients.length === 0 && recipe.length === 0) {
      console.log("[ingredient-analysis] blocked: no ingredients captured", {
        product_key: productKey,
      });
      return new Response(
        JSON.stringify({
          error: "ingredients_unreadable",
          ingredients_unreadable: true,
          analysis: null,
          message:
            "We couldn't read the ingredients for this product. Add them manually or try rescanning the label.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }



    // Safety is resolved BEFORE the cache check, because a cached payload must
    // never be served to a homemade product without its caution attached.
    // Kitchen language ("shea butter") is matched through the SAME glossary the
    // scan pipeline uses; anything it cannot verify is marked lower-confidence.
    const homemadeSafety: HomemadeSafety | null = isHomemade
      ? await (async () => {
        const facts = await loadKnownIngredientFacts(
          dataClient as never,
          recipe.map((r) => r.ingredient),
        );
        const factFor = (n: string) =>
          inciKeyCandidates(n).map((k) => facts.get(k)).find(Boolean) ?? null;
        const unverified = recipe
          .map((r) => r.ingredient)
          .filter((n) => !factFor(n));
        // Preservation is judged from the ingredients themselves: the shared
        // glossary's own `category` decides, so a recipe that really does carry
        // a preservative system is never told it has none.
        const glossaryPreservatives = recipe
          .map((r) => r.ingredient)
          .filter((n) =>
            (factFor(n)?.category ?? "").toLowerCase() === "preservative"
          );
        return buildHomemadeSafety(recipe, unverified, glossaryPreservatives);
      })()
      : null;

    // ── APPLICATION AREA (exposure) ───────────────────────────────────
    // Where the product goes and whether it stays on decide how much a given
    // ingredient concern can actually cost. Read from the caller first, then
    // from the stored row, so a saved product always scores on its own label
    // rather than on a guess from its name. Never inferred here.
    const APPLICATION_AREAS = ["scalp", "lengths_ends", "scalp_and_lengths", "rinse_out", "unknown"];
    const normaliseArea = (v: unknown): string => {
      const raw = typeof v === "string" ? v.trim().toLowerCase() : "";
      return APPLICATION_AREAS.includes(raw) ? raw : "unknown";
    };
    let applicationArea = normaliseArea(body.applicationArea);
    let leaveOn = typeof body.leaveOn === "boolean" ? body.leaveOn : null;
    let productCategory = typeof body.category === "string" && body.category.trim()
      ? body.category.trim()
      : null;
    let usageInstructions = typeof body.usageInstructions === "string" && body.usageInstructions.trim()
      ? body.usageInstructions.trim()
      : null;
    // ── HOW-TO-USE SOURCE HIERARCHY ───────────────────────────────────
    // 1. directions captured from a photographed label (primary),
    // 2. directions published on the brand's official product page,
    // 3. nothing — general guidance only, and flagged as general.
    let usageSource: UsageSource = usageInstructions ? "label_photo" : "none";
    let productSourceUrl: string | null = null;
    {
      const { data: metaRow } = await dataClient
        .from("user_products")
        .select("category, application_area, leave_on, usage_instructions, usage_instructions_source, source_url")
        .eq("user_id", memberId)
        .eq("product_key", productKey)
        .maybeSingle();
      if (metaRow) {
        if (applicationArea === "unknown") applicationArea = normaliseArea(metaRow.application_area);
        if (leaveOn === null && typeof metaRow.leave_on === "boolean") leaveOn = metaRow.leave_on;
        if (!productCategory && metaRow.category) productCategory = String(metaRow.category);
        productSourceUrl = metaRow.source_url ? String(metaRow.source_url) : null;
        if (!usageInstructions && metaRow.usage_instructions) {
          usageInstructions = String(metaRow.usage_instructions);
          const stored = metaRow.usage_instructions_source
            ? String(metaRow.usage_instructions_source)
            : null;
          usageSource = stored === "label_photo" || stored === "brand_page"
            ? stored
            // Legacy rows carry no provenance: a product added from a link had
            // its directions read off that page, everything else off the label.
            : (productSourceUrl ? "brand_page" : "label_photo");
        }
      }
    }
    // Step 2 of the hierarchy: no captured directions, but we know the
    // product's official page — read the published directions off it rather
    // than letting the model invent generic advice.
    if (!usageInstructions && productSourceUrl) {
      try {
        const page = await scrapePage(productSourceUrl);
        const found = page.text ? extractDirectionsFromPage(page.text) : null;
        if (found) {
          usageInstructions = found;
          usageSource = "brand_page";
          await dataClient
            .from("user_products")
            .update({ usage_instructions: found, usage_instructions_source: "brand_page" })
            .eq("user_id", memberId)
            .eq("product_key", productKey);
        }
      } catch (e) {
        console.warn("[ingredient-analysis] directions scrape failed", e instanceof Error ? e.message : e);
      }
    }
    if (!usageInstructions) usageSource = "none";
    const usageDirections: UsageDirections = { text: usageInstructions, source: usageSource };
    // Anti-anchoring: which profile traits her OTHER products' how-to-use copy
    // already leaned on. Fed into the prompt so it cannot silently repeat one
    // trait (density) across every product.
    let recentTraits: string[] = [];
    try {
      const { data: others } = await dataClient
        .from("ai_summaries")
        .select("payload, updated_at, kind")
        .eq("user_id", memberId)
        .like("kind", "ingredient_analysis:%")
        .not("kind", "like", `ingredient_analysis:${productKey}:%`)
        .order("updated_at", { ascending: false })
        .limit(8);

      recentTraits = recentTraitUsage(
        (others ?? []).map((r) => {
          const p = r.payload as { usage_instructions?: string | null } | null;
          return p?.usage_instructions ?? null;
        }),
      );
    } catch (e) {
      console.warn("[ingredient-analysis] recent trait scan failed", e instanceof Error ? e.message : e);
    }
    const usageBlock = usageGroundingBlock(usageDirections, { recentTraits });

    console.log(JSON.stringify({
      function: "ingredient-analysis",
      usage_source: usageSource,
      usage_chars: usageInstructions?.length ?? 0,
    }));



    const tipsLevel = coerceTipsLevel(
      (body.context as Record<string, unknown> | null | undefined)?.tipsLevel,
    );
    // Level is part of the key: guidance depth differs per support level, so a
    // level-3 payload must never be served to a level-4 reader.
    // Homemade payloads carry the concentration reasoning for a SPECIFIC set
    // of amounts — editing "10 drops" to "2 drops" is a different product, so
    // the recipe is part of the cache identity.
    const recipeSig = isHomemade
      ? `:hm${await shortHash(recipe.map((r) =>
          `${r.ingredient.toLowerCase()}=${r.amount.toLowerCase()}|${r.qty ?? ""}${r.unit ?? ""}`
        ).sort().join("|"))}`
      : "";
    const cacheKind = `ingredient_analysis:${productKey}:L${tipsLevel}${recipeSig}`;
    const provider = readAiProvider("STRAND_AI_PROVIDER_INGREDIENT");

    // ── Cache check (model_version-aware) ─────────────────────────────
    // Kept outside the `force`/version gates so that when we cannot spend on a
    // fresh generation (daily cap) we can still serve her last good write-up
    // instead of an error card on an empty screen.
    let stalePayload: AnalysisPayload | null = null;
    {
      const { data: existing } = await dataClient
        .from("ai_summaries")
        .select("payload, updated_at")
        .eq("user_id", memberId)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (existing?.payload) {
        const cached = existing.payload as AnalysisPayload;
        // Only honour cache if it includes the separate personalised guidance
        // section. Older rows predate this field and must be regenerated.
        const hasGuidance = Array.isArray(cached.personalised_guidance) && cached.personalised_guidance.length >= 1;
        const depthOk = cached.personalised_guidance!.length >= guidanceCount(tipsLevel);
        const versionOk = provider === "claude"
          ? cached._model_version === MODEL_VERSION
          : true;
        if (hasGuidance) stalePayload = cached;
        if (!force && versionOk && hasGuidance && depthOk) {
          // SAFETY: a payload cached before the member declared a sensitivity
          // (or before this enforcement existed) must never be served raw.
          // Re-run the deterministic pass against the stored INCI list on every
          // cache hit — it is text matching, so it costs nothing.
          const guarded = enforceIngredientCardSensitivities(
            cached as unknown as { match_score?: number; summary?: string; ingredients?: unknown },
            sens,
            rawIngredients,
            "ingredient-analysis",
          ) as unknown as AnalysisPayload;
          const served = await sanitiseAndLog(guarded, "ingredient-analysis") as AnalysisPayload;
          // Deterministic and free — re-derived on every hit so a cached row can
          // never serve a homemade recipe without its safety caution.
          if (homemadeSafety) applyHomemadeSafety(served, homemadeSafety);
          return json(200, { cached: true, analysis: served });
        }
      }

      // A service backfill used to omit `context.tipsLevel`, so it generated a
      // perfectly usable default-L2 payload even for members whose stored level
      // was L1. The client then looked for L1, missed on every page open, and
      // invoked this function again. Reuse a CURRENT higher-detail payload by
      // trimming its ranked guidance to the requested count, and persist that
      // exact level key. This is deterministic and makes no model call.
      if (!force && !existing?.payload && tipsLevel < 3) {
        const higherKinds: string[] = [];
        for (let level = tipsLevel + 1; level <= 3; level += 1) {
          higherKinds.push(`ingredient_analysis:${productKey}:L${level}${recipeSig}`);
        }
        const { data: higherRows } = await dataClient
          .from("ai_summaries")
          .select("payload, updated_at")
          .eq("user_id", memberId)
          .in("kind", higherKinds)
          .order("updated_at", { ascending: false })
          .limit(1);
        const higher = higherRows?.[0]?.payload as AnalysisPayload | null | undefined;
        const higherGuidance = Array.isArray(higher?.personalised_guidance)
          ? higher.personalised_guidance
          : [];
        if (higher?._model_version === MODEL_VERSION && higherGuidance.length >= guidanceCount(tipsLevel)) {
          const derived = structuredClone(higher);
          derived.personalised_guidance = higherGuidance.slice(0, guidanceCount(tipsLevel));
          const guarded = enforceIngredientCardSensitivities(
            derived as unknown as { match_score?: number; summary?: string; ingredients?: unknown },
            sens,
            rawIngredients,
            "ingredient-analysis",
          ) as unknown as AnalysisPayload;
          const served = await sanitiseAndLog(guarded, "ingredient-analysis") as AnalysisPayload;
          if (homemadeSafety) applyHomemadeSafety(served, homemadeSafety);
          await dataClient.from("ai_summaries").insert({
            user_id: memberId,
            kind: cacheKind,
            payload: served as object,
          });
          console.log(JSON.stringify({
            function: "ingredient-analysis",
            event: "cache_level_downshift",
            product_key: productKey,
            requested_level: tipsLevel,
          }));
          return json(200, { cached: true, derived_level: true, analysis: served });
        }
      }
    }

    // Spend protection: per-user daily cap (model-spend paths only).
    // Workspace-wide automatic brake (see _shared/usage-cap.ts).
    const ceiling = await checkGlobalCeiling("ingredient-analysis");
    if (ceiling) return ceiling;

    // The paced backfill is our own spend, not hers: it must never consume her
    // 60-a-day allowance nor fail loudly against it. The global ceiling above
    // is what throttles it.
    if (!serviceBackfill) {
      const capped = await checkDailyCap(memberId, "ingredient-analysis", 60);
      if (capped) {
        // Capped, but we hold a previous write-up for this exact product: serve
        // it (guardrails re-applied) rather than an error card. Only when there
        // is nothing on file does she see the limit message.
        if (stalePayload) {
          const guarded = enforceIngredientCardSensitivities(
            stalePayload as unknown as { match_score?: number; summary?: string; ingredients?: unknown },
            sens,
            rawIngredients,
            "ingredient-analysis",
          ) as unknown as AnalysisPayload;
          const served = await sanitiseAndLog(guarded, "ingredient-analysis") as AnalysisPayload;
          if (homemadeSafety) applyHomemadeSafety(served, homemadeSafety);
          return json(200, { cached: true, stale: true, analysis: served });
        }
        return capped;
      }
    }

    // ── Pull personalisation server-side ─────────────────────────────
    // The glossary lookup runs alongside these reads: it is one indexed query
    // and it removes work from the model call that follows.
    const [bloodRowsRes, medRowsRes, goalRowsRes, knownFacts, glossaryRes, sharedFacts] = await Promise.all([
      dataClient.from("blood_results").select("marker, value, unit, status, category").eq("user_id", memberId),
      dataClient.from("user_medications").select("name, category").eq("user_id", memberId),
      dataClient.from("user_goals")
        .select("kind, title, target_text, target_value, unit, current_value, target_date, challenges, challenge, notes, status")
        .eq("user_id", memberId).neq("status", "complete"),
      loadKnownIngredientFacts(dataClient as never, rawIngredients),
      // Detection vocabulary for the ingredient-naming lockdown: STRAND's own
      // known ingredient names. MOLECULES ONLY — the glossary also holds
      // concept/class rows ("Porosity", "Density", "Occlusives", "Humectants")
      // and searching for those in prose falsely flagged ordinary sentences as
      // naming an off-formula ingredient, exhausting the retries and nulling
      // the write-up (2026-08-28 regression).
      dataClient.from("glossary_terms").select("display_name").eq("kind", "molecule").limit(2000),
      // SHARED PRODUCT FACTS (2026-09-01): the ingredient cards for this exact
      // formula may already have been written for another member. They are
      // facts about the product, not about her, so they are reused verbatim
      // and only the personalisation is generated. A homemade recipe is a
      // one-off formula and is never shared.
      isHomemade ? Promise.resolve(null) : readSharedFacts({
        productName,
        productBrand,
        ingredients: rawIngredients,
        modelVersion: MODEL_VERSION,
      }),
    ]);
    const bloodRows = bloodRowsRes.data ?? [];
    const medRows = medRowsRes.data ?? [];
    const dbGoals = goalRowsRes.data ?? [];
    const nameLock = buildNameLock(
      rawIngredients,
      ((glossaryRes.data ?? []) as Array<{ display_name?: string | null }>)
        .map((r) => (r.display_name ?? "").trim())
        .filter(Boolean),
    );

    // Shared-facts mode: the whole INCI panel is already written and validated
    // for this exact formula, so the model writes the personal half only.
    const sharedCards = sharedFacts?.complete ? sharedFacts.facts : null;
    let factsBlock = sharedCards
      ? sharedFactsBlock(sharedCards)
      : knownFactsBlock(knownFacts);
    console.log(JSON.stringify({
      function: "ingredient-analysis",
      event: "shared_facts_gate",
      hit: !!sharedFacts,
      complete: !!sharedCards,
      product_key: productKey,
    }));
    if (isHomemade && homemadeSafety) {
      factsBlock += homemadeRecipeBlock(
        recipe,
        homemadeSafety.hazards,
        homemadeSafety.unverified,
        homemadeSafety.preservation,
      );
      console.log(JSON.stringify({
        function: "ingredient-analysis",
        homemade: true,
        recipe_items: recipe.length,
        unverified: homemadeSafety.unverified.length,
        safety: homemadeSafety.severity,
        hazards: homemadeSafety.hazards.map((h) => h.id),
      }));
    }
    console.log(JSON.stringify({
      function: "ingredient-analysis",
      known_facts: knownFacts.size,
      ingredients: rawIngredients.length,
    }));


    // ── TIERED PERSONALISATION DATA (Part 3, 2026-09-01) ──────────────
    const productSignals: ProductSignals = {
      productName,
      brand: productBrand,
      category: productCategory,
      applicationArea,
      ingredients: rawIngredients,
    };
    const healthTier = shouldIncludeHealthTier(productSignals);
    const tier1 = runTier1(
      (body.context ?? {}) as Record<string, unknown>,
      productSignals,
    );
    const healthTierPayload: Record<string, unknown> = healthTier.mode === "full"
      ? {
        healthProfile: healthProfile ?? {},
        bloodResults: bloodRows,
        medications: medRows,
      }
      : healthTier.mode === "compact"
      ? {
        medications: medRows,
        ...compactHealthTier(
          { healthProfile, bloodResults: bloodRows } as Record<string, unknown>,
        ),
      }
      : {};
    const tierBlock = `${tier1Block(tier1)}${
      tierRulesBlock({
        context: {},
        guidance: {},
        health: healthTier,
        included: Object.keys(healthTierPayload),
        withheld: healthTier.mode === "full" ? [] : [...TIER_4_KEYS],
      })
    }`;
    console.log("[tiers] ingredient-analysis", {
      health_mode: healthTier.mode,
      health_reason: healthTier.reason,
      matched: healthTier.matched ?? null,
      water_hardness: tier1.waterHardness,
    });

    // Rotated ONCE, then reused for both the prompt and the QA debug trail, so
    // the debug view records the exact order the model saw (2026-09-02).
    const promptHairProfile = rotateProfileSignals(
      hairProfile ?? {},
      [productBrand, productName, productCategory].filter(Boolean).join("|"),
    ) ?? {};

    const userPayload: Record<string, unknown> = {
      product: {
        key: productKey,
        name: productName,
        brand: productBrand,
        category: productCategory,
        application_area: applicationArea,
        leave_on: leaveOn,
        usage_instructions: usageInstructions,
        usage_instructions_source: usageSourceLabel(usageSource),
      },

      ingredients: rawIngredients,
      // Rotated so porosity is not structurally first on every single call
      // (2026-09-01) — values unchanged, order seeded on the product.
      hairProfile: promptHairProfile,

      // ── TIER 3 (Part 3, 2026-09-01) — conditional health data ───────
      // This surface knows the product's real INCI list, category and
      // application area, so the gate runs on genuine signals: the full
      // health tier travels only when the formula could plausibly interact
      // with it. Otherwise she gets the compact slice — conditions,
      // medications, life stage and the hair-relevant markers that are out
      // of range — and panel history stays on the blood surfaces.
      ...healthTierPayload,
      heritage: heritage ?? [],
      goals: goals && goals.length ? goals : dbGoals,
      currentStyle: currentStyle ?? null,
      // Never empty when the member has any: fall back to flattening the
      // goals we just read so challenges always reach the prompt.
      challenges: (challenges && challenges.length)
        ? challenges
        : allChallenges((goals && goals.length ? goals : dbGoals) as Array<Record<string, unknown>>),
      context: body.context ?? null,
    };

    // Tokens for the shared action floor — the member's own recorded details.
    const guidanceTokens = memberAttributeTokens({
      hairProfile: (hairProfile ?? null) as Record<string, unknown> | null,
      currentStyle: (currentStyle ?? null) as Record<string, unknown> | null,
      goals: (goals && goals.length ? goals : dbGoals) as Array<{ title?: string }>,
      challenges: (challenges ?? []) as string[],
      recentWashDay: null,
    });



    const ingredientCount = rawIngredients.length;
    // Frequency list only — used purely as a RAG retrieval trigger, never as
    // a negative signal. See _shared/flagged-ingredients.ts.
    const avoidList = Array.isArray(body.context?.flagged_ingredients)
      ? body.context!.flagged_ingredients as string[]
      : [];

    const generationId = makeGenerationId();
    let analysis: AnalysisPayload | null = null;
    let retryRules: string[] | null = null;
    // Violations from the final attempt, so the terminal fallback can null just
    // the offending fields rather than failing the whole generation.
    let retryViolations: NameLockViolation[] = [];
    // WALL-CLOCK BUDGET (2026-09-03). Each attempt now costs 30-70s, and three
    // attempts plus the guidance re-ask ran past the edge worker's limit — the
    // worker was killed MID-LOOP, before the graceful fallbacks below could
    // run, so the member got a server error or an endless spinner. A retry is
    // only started when the remaining budget covers the measured cost of the
    // previous attempt plus the post-loop tail; otherwise the loop stops here
    // and the existing degrade path (stale-serve → field-null → never-hollow
    // summary) serves what already passed. No guardrail is weakened.
    let lastAttemptMs = 0;
    let budgetStopped = false;
    const canRetry = (attemptNumber: number): boolean => {
      if (attemptNumber >= MAX_REJECTION_ATTEMPTS) return false;
      if (timeBudget.canAfford(lastAttemptMs + RETRY_TAIL_MS)) return true;
      if (!budgetStopped) {
        budgetStopped = true;
        console.warn(JSON.stringify({
          function: "ingredient-analysis",
          event: "guardrail_budget_exhausted",
          attempt: attemptNumber,
          remaining_ms: timeBudget.remaining(),
          last_attempt_ms: lastAttemptMs,
        }));
        recordAiOutcome({
          function_name: "ingredient-analysis",
          surface: "ingredient-analysis",
          user_id: memberId,
          outcome: "rejected",
          rejection_rule: "budget_exhausted",
          retry_reason: "budget_exhausted",
          generation_id: generationId,
          attempt_number: attemptNumber,
          max_attempts: MAX_REJECTION_ATTEMPTS,
        });
      }
      return false;
    };
    for (let attemptNumber = 1; attemptNumber <= MAX_REJECTION_ATTEMPTS; attemptNumber++) {
      const attemptStartedAt = Date.now();

      const baseRetryPayload = retryRules?.length
        ? {
          ...userPayload,
          _guardrail_retry:
            buildRejectionRetryInstruction(retryRules, "ingredient analysis"),
        }
        : userPayload;
      const retryReason = retryReasonFromRules(retryRules);

      if (provider === "claude") {
        analysis = await runClaude({
          productName,
          productBrand,
          ingredients: rawIngredients,
          hairProfile: (hairProfile ?? {}) as Record<string, unknown>,
          userPayload: baseRetryPayload,
          selectorContext: buildSelectorContext(body),
          avoidList,
          level: tipsLevel,
          sensitivityBlock,
          usageBlock,
          factsBlock,
          tierBlock,
          generationId,
          attemptNumber,
          maxAttempts: MAX_REJECTION_ATTEMPTS,
          retryReason,
          personalisationOnly: !!sharedCards,
        });
        if (sharedCards) {
          analysis.ingredients = rebuildCardsFromFacts(
            rawIngredients,
            sharedCards,
            analysis.ingredients,
          );
        }
        analysis = applyKnownCategories(analysis, knownFacts);
        const claudeProblems = [
          ...(guidanceReferencesOtherProduct(analysis)
            ? [
              "the tip referenced another product, product type, brand, accessory, or wash-day step. Describe ONLY how to use THIS product itself (technique, amount, sectioning, water temperature, dwell time, rinse, frequency, distribution).",
            ]
            : []),
          ...guidanceFloorProblems(analysis, guidanceTokens),
          ...usageGroundingProblems(analysis, usageDirections),
        ];
        // The guidance-only re-ask is an EXTRA model call on top of this
        // attempt; skip it when the budget can't cover it and serve the
        // guidance that already passed the other checks.
        if (claudeProblems.length && timeBudget.canAfford(GUIDANCE_PASS_MS + RETRY_TAIL_MS)) {

          console.log(JSON.stringify({
            function: "ingredient-analysis",
            violation: "guidance_floor",
            problems: claudeProblems,
            retry: "guidance_only",
          }));
          // Regenerate ONLY the guidance — the ingredient cards, score and
          // summary already passed and re-writing them costs seconds for nothing.
          const fixedTips = await runGuidanceRetry({
            productName,
            productBrand,
            ingredients: rawIngredients,
            userPayload: baseRetryPayload,
            selectorContext: buildSelectorContext(body),
            level: tipsLevel,
            problems: claudeProblems,
            sensitivityBlock,
            usageBlock,
            generationId,
            attemptNumber,
          });
          if (fixedTips) analysis = { ...analysis, personalised_guidance: fixedTips };
        }
        analysis = scrubGuidance(analysis);
        analysis = scrubUsageGrounding(analysis, usageDirections, productKey);
        auditGuidanceActionFloor(analysis, productKey);
        const remaining = guidanceFloorProblems(analysis, guidanceTokens);
        if (remaining.length)
          console.warn("[ingredient-analysis] guidance served below floor after retry", { productKey, remaining });
        analysis._model_version = MODEL_VERSION;
        analysis._generated_at = new Date().toISOString();
        analysis._provider = "claude";
      } else {
        const systemPrompt = `${STRAND_PERSONA_INLINE}

TASK
${buildTaskInstructions(productBrand, productName, ingredientCount, tipsLevel, rawIngredients)}${sensitivityBlock}${usageBlock}${factsBlock}${tierBlock}`;
        analysis = await runLovable({
          systemPrompt,
          userPayload: baseRetryPayload,
          ingredientCount,
          level: tipsLevel,
          generationId,
          attemptNumber,
          maxAttempts: MAX_REJECTION_ATTEMPTS,
          retryReason,
          personalisationOnly: !!sharedCards,
        });
        if (sharedCards) {
          analysis.ingredients = rebuildCardsFromFacts(
            rawIngredients,
            sharedCards,
            analysis.ingredients,
          );
        }
        analysis = applyKnownCategories(analysis, knownFacts);
        analysis = scrubGuidance(analysis);
        const lovableProblems = [
          ...guidanceFloorProblems(analysis, guidanceTokens),
          ...usageGroundingProblems(analysis, usageDirections),
        ];
        if (lovableProblems.length) {
          console.log(JSON.stringify({
            function: "ingredient-analysis",
            violation: "guidance_floor",
            problems: lovableProblems,
            retry: true,
          }));
          analysis = await runLovable({
            systemPrompt,
            userPayload: {
              ...baseRetryPayload,
              _retry_reason:
                `Your personalised_guidance was REJECTED. Regenerate it fixing every problem below. Each tip must be ONE instruction sentence followed by ONE sentence saying why it matters for this member:\n- ${lovableProblems.join("\n- ")}`,
            },
            ingredientCount,
            level: tipsLevel,
            generationId,
            attemptNumber,
            maxAttempts: MAX_REJECTION_ATTEMPTS,
            retryReason: retryReason ?? "guidance_floor_retry",
            personalisationOnly: !!sharedCards,
          });
          if (sharedCards) {
            analysis.ingredients = rebuildCardsFromFacts(
              rawIngredients,
              sharedCards,
              analysis.ingredients,
            );
          }
          analysis = scrubGuidance(analysis);
        }
        analysis = scrubUsageGrounding(analysis, usageDirections, productKey);
        auditGuidanceActionFloor(analysis, productKey);
        analysis._provider = "lovable";
        analysis._generated_at = new Date().toISOString();
      }

      // Measured cost of this attempt — the estimate for the next one.
      lastAttemptMs = Math.max(lastAttemptMs, Date.now() - attemptStartedAt);

      analysis.insight = sanitisePurposeInsight(analysis.insight) ?? undefined;

      // Nullable schema: a null descriptive field is a legitimate "not
      // established" answer, so it must never render as the string "null".
      if (analysis.summary == null) analysis.summary = "";
      let reasons = sanitiseScoreReasons(analysis.score_reasons);

      // ── Closed vocabulary + ingredient-naming validation ───────────────
      // Both are structural: a violation is rejected and re-asked rather than
      // shown, so no member reads an invented term or an ingredient that is
      // not in the formula she owns.
      const termFields = [
        { field: "summary", text: analysis.summary },
        ...reasons.flatMap((r, i) => [
          { field: `score_reasons[${i}].factor`, text: r.factor },
          { field: `score_reasons[${i}].reason`, text: r.reason },
        ]),
        ...(analysis.ingredients ?? []).flatMap((c, i) => [
          { field: `ingredients[${i}].body`, text: c?.body },
        ]),
        ...(analysis.personalised_guidance ?? []).flatMap((t, i) => [
          { field: `personalised_guidance[${i}].title`, text: t?.title },
          { field: `personalised_guidance[${i}].body`, text: t?.body },
        ]),
      ];
      // ONE shared guardrail — closed vocabulary + ingredient-name lockdown,
      // identical to every other member-facing surface. See
      // _shared/content-integrity.ts.
      const structuralViolations = checkContentIntegrity({
        functionName: "ingredient-analysis",
        userId: memberId,
        subject: productKey ?? null,
        fields: termFields,
        cards: analysis.ingredients,
        allowedIngredients: nameLock.allowed,
        ingredientVocabulary: nameLock.vocabulary,
        attempt: attemptNumber,
      }).violations;
      retryViolations = structuralViolations;
      const structuralProblems = structuralViolations.map((v) => v.rule);
      if (structuralProblems.length) {
        console.log(JSON.stringify({
          function: "ingredient-analysis",
          violation: "vocabulary_or_name_lock",
          attempt: attemptNumber,
          problems: structuralProblems.slice(0, 8),
        }));
        recordAiOutcome({
          function_name: "ingredient-analysis",
          surface: "ingredient-analysis",
          user_id: memberId,
          outcome: "rejected",
          rejection_rule: "vocabulary_or_name_lock",
          generation_id: generationId,
          attempt_number: attemptNumber,
          max_attempts: MAX_REJECTION_ATTEMPTS,
        });
        retryRules = [...new Set(structuralProblems)].slice(0, 8);
        await logContentIntegrityRejections(structuralViolations, {
          functionName: "ingredient-analysis",
          userId: memberId,
          subject: productKey ?? null,
          attempt: attemptNumber,
          action: canRetry(attemptNumber) ? "rejected" : "field_nulled",
        });
        if (canRetry(attemptNumber)) continue;


        // A third otherwise-valid generation must not become a total 503 just
        // because one prose field still used rejected wording. The schemas are
        // intentionally nullable: remove only the offending field/row, then
        // serve and cache the safe remainder.
        const cleared = applyFieldNulls(
          analysis as unknown as Record<string, unknown>,
          structuralViolations,
        );
        console.warn(JSON.stringify({
          function: "ingredient-analysis",
          event: "terminal_field_null_fallback",
          cleared,
        }));
        reasons = sanitiseScoreReasons(analysis.score_reasons);
        retryRules = null;
      }

      // ── Fit-first scoring ──────────────────────────────────────────────
      // Only a real conflict or a real harm may lower the score. Mild,
      // non-harmful observations move to the Strand Tip, which the UI renders
      // separately and never describes as score rationale.
      // TWO AXES (2026-09-01): resolve quality/safety vs relevance BEFORE any
      // scoring, so a purpose mismatch never drags the rating down.
      const axes = resolveScoreAxes({
        matchScore: analysis.match_score,
        qualityScore: analysis.quality_score,
        relevanceNote: analysis.relevance_note,
        reasons,
        strandTips: sanitiseStrandTips(analysis.strand_tip),
      });
      const fitFirst = applyFitFirst(
        axes.score != null ? alignScoreWithReasons(axes.score, reasons) : null,
        reasons,
        sanitiseStrandTips(analysis.strand_tip),
      );
      // Areas of concern are scored as goals, never as a mismatch: a root,
      // shedding, density or scalp-condition mechanism serving her recorded
      // edges/hairline/crown/nape is a plus (see _shared/concern-fit.ts).
      const concernFit = applyConcernFit({
        score: fitFirst.score,
        reasons: fitFirst.reasons,
        cards: analysis.ingredients,
        concerns: parseConcerns(
          ((hairProfile ?? {}) as Record<string, unknown>).areas_of_concern,
        ),
        // STANDING RULE (2026-08-30): recorded challenges are always an
        // analysis input, weighted alongside goal and areas of concern.
        challenges: parseChallenges(
          (challenges && challenges.length)
            ? challenges
            : allChallenges(
              (goals && goals.length ? goals : dbGoals) as Array<Record<string, unknown>>,
            ),
        ),
        ingredients: rawIngredients,
      });
      // Routine preservatives, pH adjusters, colourants, emulsifiers and
      // fragrance may not carry a caution flag on class grounds alone — only a
      // declared sensitivity or a real safety issue does.
      const benign = applyBenignFlagPolicy({
        cards: concernFit.cards,
        declaredSensitivities: sens,
      });
      // Hero actives lead the verdict; humectants and preservatives never do.
      analysis.score_reasons = rankScoreReasons(concernFit.reasons);
      analysis.strand_tip = fitFirst.strandTips.length ? fitFirst.strandTips : null;
      if (concernFit.score != null) analysis.match_score = concernFit.score;
      analysis.quality_score = axes.qualityScore;
      analysis.relevance_note = axes.relevanceNote;
      if (Array.isArray(benign.cards)) {
        (analysis as Record<string, unknown>).ingredients = benign.cards;
      }

      // INTERNAL QA TRAIL — admin-only. Records which tiers travelled, the
      // profile fields in the exact order they were serialised into the prompt,
      // and how the number was arrived at. Never member-facing, never awaited
      // in a way that can fail the scan.
      void logScoreDebug({
        decryptStatus: ((body.context as Record<string, unknown> | null | undefined)?.decryptStatus as string | undefined) ?? null,
        userId: memberId,
        functionName: "ingredient-analysis",
        subject: productName,
        brand: productBrand,
        healthTierMode: healthTier.mode,
        tierIncluded: [
          "tier1:water_hardness",
          "tier1:shelf_overlap",
          "tier2:hairProfile",
          "tier2:goal",
          "tier2:challenges",
          "tier2:areas_of_concern",
          "tier2:sensitivities",
          `tier3:health_${healthTier.mode}`,
        ],
        tierWithheld: [...TIER_4_KEYS],
        profileFields: describeProfileFields(promptHairProfile, {
          goal_count: (goals ?? dbGoals ?? []).length,
          challenges: challenges ?? [],
          sensitivities_declared: Array.isArray(sens) ? sens.length : 0,
          ingredient_count: rawIngredients.length,
        }),
        scoreBreakdown: scoreBreakdown({
          modelMatchScore: analysis.match_score,
          modelQualityScore: axes.qualityScore,
          baseScore: fitFirst.score,
          finalScore: concernFit.score,
          bonus: concernFit.contribution.bonus,
          centrality: concernFit.contribution.centrality,
          breadth: concernFit.contribution.breadth,
          conflicts: concernFit.contribution.conflicts,
          supportivePluses: concernFit.contribution.supportivePluses,
          relevanceNote: axes.relevanceNote,
          reasons: sanitiseScoreReasons(analysis.score_reasons) as Array<
            { direction: string; factor: string }
          >,
        }),
      });


      // SUBSTANCE CHECK — an ingredient card must state what the ingredient
      // physically does and where, and the verdict must name the actives that
      // actually drive the fit. Generic category filler ("a conditioning
      // agent") and a verdict built on glycerin are re-asked, not served.
      const substanceProblems = [
        ...validateMechanismSpecificity(benign.cards).map((v) => v.rule),
        ...heroActiveOmissions(
          sanitiseScoreReasons(analysis.score_reasons),
          rawIngredients,
        ),
      ];
      if (substanceProblems.length && canRetry(attemptNumber)) {
        console.log(JSON.stringify({
          function: "ingredient-analysis",
          violation: "mechanism_substance",
          attempt: attemptNumber,
          problems: substanceProblems.slice(0, 4),
        }));
        retryRules = [...new Set(substanceProblems)].slice(0, 6);
        continue;
      }

      if (concernFit.reasons.length >= 2) {
        const one = firstSentence(analysis.summary);
        if (one) analysis.summary = one;
      }


      enforceIngredientCardSensitivities(
        analysis as unknown as { match_score?: number; summary?: string; ingredients?: unknown },
        sens,
        rawIngredients,
        "ingredient-analysis",
      );

      const rejected: string[] = [];
      // Snapshot the verdict bullets BEFORE the guardrail pipeline. The blood
      // guardrail, clarification pass and fidelity audit each blank prose in
      // place, and the structural prune then drops the hollow row — so a single
      // stripped sentence could empty the whole array and leave the member with
      // a verdict card carrying no reasoning at all. Row-level rescue below.
      const preReasons = sanitiseScoreReasons(analysis.score_reasons);
      analysis = await sanitiseAndLog(analysis, "ingredient-analysis", {
        surface: "ingredient-analysis",
        userId: memberId,
        generationId,
        attemptNumber,
        maxAttempts: MAX_REJECTION_ATTEMPTS,
        retryReason,
        dryRun: mode.dryRun,
        onRejected: (rules) => rejected.push(...rules),
      }) as AnalysisPayload;
      const postReasons = sanitiseScoreReasons(analysis.score_reasons);
      if (postReasons.length < preReasons.length && preReasons.length > 0) {
        // Re-run the bullets one row at a time so only the row that actually
        // breached a rule is dropped and every clean row still renders. Runs
        // on ANY shrinkage, not just a total wipe: the ranked verdict card is
        // the standing design, and losing a row silently thins it.
        const survivors: ScoreReason[] = [];
        for (const row of preReasons) {
          const checked = sanitiseScoreReasons(
            (await sanitiseAndLog([row], "ingredient-analysis", {
              surface: "ingredient-analysis",
              userId: memberId,
              generationId,
              dryRun: true,
            })) as unknown,
          );
          if (checked.length === 1) survivors.push(checked[0]);
        }
        console.warn(JSON.stringify({
          function: "ingredient-analysis",
          event: "score_reasons_row_rescue",
          before: preReasons.length,
          after: postReasons.length,
          rescued: survivors.length,
        }));
        if (survivors.length > postReasons.length) analysis.score_reasons = survivors;
      }

      console.log(JSON.stringify({
        function: "ingredient-analysis",
        event: "score_reasons_stage",
        attempt: attemptNumber,
        pre: preReasons.length,
        post: sanitiseScoreReasons(analysis.score_reasons).length,
      }));

      if (rejected.length === 0) {
        // Clear problems from an earlier attempt. Previously this stale value
        // survived a successful retry and incorrectly forced the 503 branch.
        retryRules = null;
        break;
      }
      retryRules = [...new Set(rejected)];
    }

    if (!analysis) throw new Error("Ingredient analysis generation returned no payload");

    // The safety floor is applied AFTER the model, never delegated to it: a
    // hard DIY hazard caps the score and shows as its own caution whatever the
    // model wrote about the rest of the recipe.
    if (analysis && homemadeSafety) applyHomemadeSafety(analysis, homemadeSafety);

    if (retryRules?.length) {
      recordAiOutcome({
        function_name: "ingredient-analysis",
        surface: "ingredient-analysis",
        user_id: memberId,
        outcome: "rejected",
        rejection_rule: retryReasonFromRules(retryRules) ?? "guardrail_rejection",
        generation_id: generationId,
        max_attempts: MAX_REJECTION_ATTEMPTS,
      });
      const { data: lastGood } = await dataClient
        .from("ai_summaries")
        .select("payload")
        .eq("user_id", memberId)
        .eq("kind", cacheKind)
        .maybeSingle();
      const priorPayload = lastGood?.payload as AnalysisPayload | null | undefined;
      // STALE-SERVE GUARD (2026-08-29). Falling back to the previous payload
      // whatever its provenance is how one product stayed stuck for a day: the
      // stored payload predated the current guardrails (it named an ingredient
      // that is not in the formula), every fresh generation was rejected, and
      // the rejection branch served that same poisoned payload straight back —
      // and never cached anything, so the loop repeated on every view. Only a
      // payload generated under the CURRENT model version may be served stale;
      // anything older is treated as absent and the terminal field-null
      // fallback below carries the fresh generation instead.
      const priorIsCurrent = priorPayload?._model_version === MODEL_VERSION;
      if (priorPayload && priorIsCurrent) {
        const guarded = enforceIngredientCardSensitivities(
          priorPayload as unknown as { match_score?: number; summary?: string; ingredients?: unknown },
          sens,
          rawIngredients,
          "ingredient-analysis",
        ) as unknown as AnalysisPayload;
        if (homemadeSafety) applyHomemadeSafety(guarded, homemadeSafety);
        return json(200, { cached: true, stale: true, analysis: guarded });
      }
      // No usable current-version fallback: drop only the fields the guardrails
      // objected to and carry on with the fresh generation, so the member gets
      // the parts that passed instead of an error or day-old poisoned copy.
      const clearedTerminal = applyFieldNulls(
        analysis as unknown as Record<string, unknown>,
        retryViolations,
      );
      console.warn(JSON.stringify({
        function: "ingredient-analysis",
        event: "terminal_stale_guard_fallback",
        cleared: clearedTerminal,
      }));
      retryRules = null;
    }

    // NEVER-HOLLOW SUMMARY. A nulled summary rendered as "still preparing the
    // write-up", which is what a member saw for a full day. When the prose is
    // gone but the reasoning survived, lead with the strongest reason instead.
    if (!(typeof analysis.summary === "string" && analysis.summary.trim())) {
      const reasonsNow = sanitiseScoreReasons(analysis.score_reasons);
      const lead = reasonsNow.find((r) => r.direction === "plus") ?? reasonsNow[0];
      if (lead?.reason) analysis.summary = lead.reason;
    }

    // SHARED PRODUCT FACTS: publish the user-independent half so the next
    // member who owns this exact formula pays for the personalisation only.
    // Only cards that came through the guardrails intact are written, and a
    // homemade one-off recipe is never shared.
    if (!sharedCards && !isHomemade && Array.isArray(analysis.ingredients)) {
      await writeSharedFacts({
        productName,
        productBrand,
        ingredients: rawIngredients,
        modelVersion: MODEL_VERSION,
        cards: analysis.ingredients as Array<Record<string, unknown>>,
        sourceFunction: "ingredient-analysis",
      });
    }

    if (mode.dryRun) return json(200, { cached: false, analysis });

    // ── Upsert cache ────────────────────────────────────────────────
    // VERSION STAMP (2026-08-29). The stamp set at generation time was being
    // lost before it reached the row (cached rows came back with a null
    // `_model_version`), so the version gate above could never invalidate a
    // poisoned payload and stale write-ups — including ones naming ingredients
    // that are not in the formula — kept rendering forever. Stamp immediately
    // before the write so what is stored always carries its version.
    (analysis as AnalysisPayload)._model_version = MODEL_VERSION;
    if (!(analysis as AnalysisPayload)._generated_at) {
      (analysis as AnalysisPayload)._generated_at = new Date().toISOString();
    }
    const { data: prior } = await dataClient
      .from("ai_summaries")
      .select("id")
      .eq("user_id", memberId)
      .eq("kind", cacheKind)
      .maybeSingle();
    if (prior?.id) {
      await dataClient.from("ai_summaries")
        .update({ payload: analysis as object, updated_at: new Date().toISOString() })
        .eq("id", prior.id);
    } else {
      await dataClient.from("ai_summaries").insert({
        user_id: memberId,
        kind: cacheKind,
        payload: analysis as object,
      });
    }

    // ── Backfill: also write the verdict onto the product row ─────────
    // In the app the client persists score/summary/flags after it receives the
    // analysis. The backfill has no client, so it does that write itself —
    // otherwise the shelf card and passport would keep showing the old score
    // while the cached analysis was already correct.
    if (serviceBackfill) {
      const flagToneToSeverity = (t: unknown): "good" | "warn" | "avoid" =>
        t === "bad" ? "avoid" : t === "good" ? "good" : "warn";
      const flags = Array.isArray(analysis.ingredients) ? analysis.ingredients : [];
      const keyIngredients = flags
        .filter((f) => f && typeof (f as { name?: unknown }).name === "string")
        .map((f) => {
          const row = f as { name: string; body?: string; tone?: string };
          return { name: row.name, benefit: row.body, flag: flagToneToSeverity(row.tone) };
        });
      const patch: Record<string, unknown> = {
        ai_summary: typeof analysis.summary === "string" ? analysis.summary : null,
        score_reasons: analysis.score_reasons ?? [],
      };
      if (typeof analysis.match_score === "number") {
        patch.match_score = analysis.match_score;
        patch.match_score_computed_at = new Date().toISOString();
      }
      if (keyIngredients.length > 0) patch.key_ingredients = keyIngredients;
      const { error: rowErr } = await dataClient
        .from("user_products")
        .update(patch)
        .eq("user_id", memberId)
        .eq("product_key", productKey);
      if (rowErr) console.error("[ingredient-analysis] backfill row write failed", rowErr.message);
    }

    return json(200, { cached: false, analysis });
  } catch (e) {
    return aiErrorResponse(e, "ingredient-analysis");
  }
});
