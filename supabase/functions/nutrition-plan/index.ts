// Generates a fully personalised hair-nutrition plan (diet + avoid) using the
// STRAND persona (Paige Lewin) and the user's complete profile + AI context.
// Cached in ai_summaries (kind = "nutrition_plan"). Force-refresh supported.
//
// Phase 2 Step 6: dual-path — Lovable+Gemini (legacy) and Claude Opus (new),
// gated by STRAND_AI_PROVIDER_NUTRITION. Defaults to "lovable".
// Same response shape: { summary, diet[], avoid[] } so the existing
// NutritionPlan.tsx renderer is unchanged.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { checkKillSwitch } from "../_shared/kill-switch.ts";
import { checkDailyCap, checkGlobalCeiling } from "../_shared/usage-cap.ts";
import { json, preflight } from "../_shared/cors.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude, type ContentBlockInput } from "../_shared/anthropic-client.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
} from "../_shared/book-chapters.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { isEntitled, membershipRequired } from "../_shared/entitlement.ts";
import { resolveAiRequestMode } from "../_shared/impersonation.ts";
import { bloodFingerprint, readSurfaceCache,
  nutritionInputFingerprint, sha } from "../_shared/surface-cache.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-opus-4-7@v4-render-safe-copy-2026-09-03";

interface RequestBody {
  dryRun?: boolean;
  impersonatedUserId?: string;
  impersonation?: { targetUserId?: string; impersonatedBy?: string | null };
  force?: boolean;
  context?: Record<string, unknown>;
  diet?: string;
  /** Free text: what an "Other" member avoids. */
  dietOther?: string;
  alcohol?: string;
  flaggedMarkers?: string[];
}

interface NutritionCard {
  emoji: string;
  name: string;
  body: string;
  severity?: "high" | "medium" | "low";
}

interface SupplementCard {
  emoji: string;
  name: string;
  dose?: string;
  body: string;
  priority?: "high" | "medium" | "low";
}

interface NutritionPlanPayload {
  summary: string;
  supplements: SupplementCard[];
  diet: NutritionCard[];
  avoid: NutritionCard[];
}

/**
 * Deterministic stand-in summary. Used only when a generation returns real food
 * rows but no summary line — the rows are the plan, so the request must not
 * fail over a missing intro.
 */
function deriveSummary(p: { diet: NutritionCard[]; avoid: NutritionCard[] }): string {
  const foods = p.diet.slice(0, 3).map((d) => d.name).filter(Boolean).join(", ");
  const watch = p.avoid.slice(0, 2).map((d) => d.name).filter(Boolean).join(" and ");
  const first = foods ? `Food first: build your meals around ${foods}.` : "Food first: build your meals around whole foods you already enjoy.";
  return watch ? `${first} Keep an eye on ${watch}.` : first;
}


const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

import { dietConstraintBlock } from "../_shared/diet.ts";
import {
  loadSensitivities,
  sensitivityConstraintBlock,
  validateAgainstAvoid,
} from "../_shared/sensitivities.ts";
import {
  buildGroundingBlock,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";
import { gatewayFetch, setAiCallImpersonation, setAiCallUser } from "../_shared/ai-meter.ts";
import {
  MAX_REJECTION_ATTEMPTS,
  buildRejectionRetryInstruction,
  makeGenerationId,
  retryReasonFromRules,
} from "../_shared/guardrail-retry.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "nutrition-plan", stage: 2 } as const;


const TASK_PROMPT_LOVABLE = `TASK
Generate a deeply personalised hair-nutrition plan with two parts: foods to eat ("diet") and what to pair, time or watch for ("avoid"). The "avoid" cards are NOT about eating less — they cover pairing, timing and medication interactions only. Speak in STRAND's professional advisory voice.

Voice for this task: follow the VOICE PRINCIPLES above. In every card body, lead with the mechanism (why this nutrient or food matters at the cellular / follicular level, in plain English), then bridge with a connective ("which is why", "so", "this means") into THIS user's specific data — heritage, life stage, medication, blood marker, goal. Talk to "you", not "your hair". Translate any clinical term on first use in a card. No "queen" / "you've got this" energy, praise, flattery, or conversational preamble.

PERSONALISATION RULES — apply ALL of these together, not in isolation:
1. Heritage: African / Caribbean diets often centre on starches, oily fish, leafy greens, plantain, beans, ground provisions. Reference culturally familiar foods where possible (e.g. callaloo for folate, ackee for protein, sardines, scotch bonnet, jollof base ingredients) — never generic "leafy greens" if you can name one she likely already cooks with.
2. Age: factor in life stage. Perimenopausal/menopausal women (40s+) need more protein, calcium, omega-3 and B-vitamins for hormonal hair changes. Post-natal / breastfeeding women need extra iron, omega-3, choline. Younger women in heavy training or on contraception have different needs.
3. Health profile: medications (e.g. metformin depletes B12; PPIs reduce iron absorption; SSRIs can affect zinc; oral contraceptives lower B6, folate, zinc), conditions (PCOS, thyroid, endometriosis, anaemia history), pregnancy / breastfeeding, smoker, alcohol intake.
4. Lifestyle: stress level, sleep, training load.
5. Diet pattern: vegan / vegetarian / pescatarian / omnivore — never recommend animal foods to a vegan; always offer culturally relevant plant alternatives.
6. Blood markers: every flagged low/high marker must be addressed in the diet section with at least one targeted food explanation.
7. Hair goals: e.g. length retention needs steady protein + iron; thinning recovery needs zinc + biotin + omega-3; postpartum shedding needs ferritin + vitamin D rebuild.
8. The "avoid" cards MUST also be personalised — reference THEIR medications, markers or timing (e.g. "iron and levothyroxine four hours apart"). Never frame them as eating less, cutting back or limiting food.

FORMAT
Return JSON only via the provided tool. Each card has:
- emoji (single emoji, culturally appropriate where possible)
- name (short, specific — name the actual food, not "leafy greens")
- body (THREE or FOUR bold-led paragraphs — see FORMATTING — never a single short paragraph; nutrition is always given at full detail)

OUTPUT REQUIREMENTS:
- supplements: 4–8 cards, each with a dose and timing, each tied to something specific about THIS user.
- diet: 6–10 cards covering protein, iron-support, fat-soluble vitamins, omega-3, antioxidants, B-vitamins. Heavily weighted toward addressing flagged deficiencies first.
- avoid: 4–6 cards, each genuinely personalised, and each about PAIRING, TIMING or a medication/supplement interaction rather than eating less (e.g. "have tea between meals rather than alongside them, because tannins bind the iron in that meal"). No calorie, gram or portion figures. No restriction language.
- summary: TWO ultra-short paragraphs (see SUMMARY FORMATTING). One sentence each, max 22 words. Translate the blood work into plain English — no preamble, no "this plan will…".

CRITICAL: Never produce generic text. If a card could apply to anyone, rewrite it to reference at least one specific data point about THIS user.`;

const RETURN_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "supplements", "diet", "avoid"],
  properties: {
    summary: {
      type: "string",
      description:
        "Exactly two short paragraphs separated by \\n\\n. Each paragraph is ONE sentence, max 22 words. Paragraph 1 opens '**Why it matters:**' and translates a flagged blood marker or key data point into plain English (e.g. 'ferritin (stored iron)'). Paragraph 2 opens '**What to prioritise:**' and names the 1-2 levers this plan pulls, in everyday words. No jargon, no doses, no food names.",
    },
    supplements: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emoji", "name", "dose", "body", "priority"],
        properties: {
          emoji: { type: "string" },
          name: { type: "string", description: "Plain-English supplement name (e.g. 'Iron', 'Vitamin D3')." },
          dose: { type: "string", description: "Required. Plain-English dose guidance with timing (e.g. '1000 IU daily with breakfast')." },
          body: {
            type: "string",
            description:
              "THREE or FOUR paragraphs separated by \\n\\n, each opening with a bold lead phrase: '**Why it matters:**' (required), '**How to use it:**' (required), '**Best paired with:**', '**Watch out for:**' (required). Layman's English — translate any clinical term the first time it appears (e.g. 'ferritin (your body's stored iron)') and tie it to THIS user's blood marker, age, heritage, medication or condition.",
          },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    diet: {
      type: "array",
      minItems: 6,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emoji", "name", "body"],
        properties: {
          emoji: { type: "string" },
          name: { type: "string", description: "Specific food name (e.g. 'Mackerel', not 'oily fish')." },
          body: {
            type: "string",
            description:
              "THREE or FOUR paragraphs separated by \\n\\n, each opening with a bold lead phrase: '**Why it matters:**' (required — the mechanism in everyday words), '**How to use it:**' (required — how often, how to prepare or serve it), '**Best paired with:**' (required — the food that unlocks the nutrient), '**Watch out for:**'. Connect to THIS user's data: life stage, blood marker, goal, medication.",
          },
        },
      },
    },
    avoid: {
      type: "array",
      minItems: 4,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emoji", "name", "body", "severity"],
        properties: {
          emoji: { type: "string" },
          name: { type: "string" },
          body: {
            type: "string",
            description:
              "THREE paragraphs separated by \\n\\n, each opening with a bold lead phrase: '**Why it matters:**' (required), '**Easier swap:**' (required — a pairing or timing change, never eating less), '**Watch out for:**'. Layman's English, tied to this user's medication, condition or alcohol level.",
          },
          severity: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },

  },
} as const;

function buildSelectorContext(ctx: Record<string, unknown>): SelectorContext {
  const hp = (ctx.hairProfile as Record<string, unknown>) ?? {};
  const hl = (ctx.healthProfile as Record<string, unknown>) ?? {};
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
    bloodResults: Array.isArray(ctx.bloodResults)
      ? (ctx.bloodResults as Array<Record<string, unknown>>).map((row) => ({
        marker: typeof row.marker === "string" ? row.marker : undefined,
        status: typeof row.status === "string" ? row.status : null,
      }))
      : [],
  };
}

function buildClaudeTaskInstructions(): string {
  return `You're writing a deeply personalised hair-nutrition plan for THIS user. Three parts: "supplements" (4-8 supplements they should consider), "diet" (6-10 foods to eat), "avoid" (4-6 pairing, timing or interaction notes — never "eat less of this"), plus a short "summary". Return JSON only via the return_nutrition_plan tool.

CRITICAL LANGUAGE RULE — PLAIN ENGLISH FOR AMATEURS.
Every card body must read like a knowledgeable friend explaining it, not a science textbook. Assume the reader has no clinical training. Translate every clinical term the FIRST time it appears — "ferritin (your body's stored iron)", "biotin (a B-vitamin your hair uses to build keratin)", "TSH (a thyroid hormone marker)". Prefer everyday words: "shedding" not "telogen effluvium", "hair strength" not "tensile integrity", "regrowth" not "anagen recovery". Short, warm, direct sentences. No jargon dumps.

Voice for this task: follow the VOICE PRINCIPLES from the system block. Every card body should read like a clinician thinking out loud in plain English — start with the MECHANISM in everyday words ("Iron is what new growth draws on"), then bridge with a connective ("which is why", "so", "this means") into ONE specific thing you know about this user (a flagged blood marker, a medication they take, their life stage, a stated goal, their alcohol intake). "You", never "your hair".

FORMATTING — SCANNABLE, AND FULLY DETAILED.
Nutrition is the one place in STRAND that is always given at FULL detail. Never abbreviate a card.
Every "body" field MUST be structured as THREE or FOUR short paragraphs separated by blank lines ("\\n\\n"). Each paragraph is ONE or TWO short sentences. Each paragraph MUST open with a 2-4 word bold lead phrase wrapped in markdown asterisks, followed by a colon, then the sentence — for example: "**Why it matters:** iron is what new hair growth draws on."

Use ONLY these bold lead phrases, in this order, skipping none that apply:
- For SUPPLEMENTS: "**Why it matters:**" (required), "**How to use it:**" (required — when in the day and what to take it with), "**Best paired with:**" (name the foods that help it absorb), "**Watch out for:**" (required — the interaction, medication or timing clash)
- For DIET: "**Why it matters:**" (required), "**How to use it:**" (required — how often and how to prepare or serve it), "**Best paired with:**" (required — the food that unlocks the nutrient), "**Watch out for:**"
- For AVOID: "**Why it matters:**" (required), "**Easier swap:**" (required), "**Watch out for:**"

Never write a wall of prose. Never omit the bold lead. Never return fewer than three paragraphs per body, and never more than four.


SUMMARY FORMATTING — SHORT, EDUCATIONAL, SCANNABLE.
The top-level "summary" field is the "Why this plan" block at the top of the page. It must be BRIEF and read like a friend translating the blood work into plain English — not a preamble to the cards below.
- Exactly TWO short paragraphs separated by "\\n\\n".
- Each paragraph is ONE sentence, max 22 words. No second sentence. No commas stacked into a list.
- Paragraph 1 opens "**Why it matters:**" — name 1-2 specific data points (a flagged marker with its everyday meaning in brackets, a medication, or a life stage) and what it means for hair in the simplest words possible. Example: "**Why it matters:** your ferritin (stored iron) is low, and stored iron is what new hair growth draws on."
- Paragraph 2 opens "**What to prioritise:**" — name the 1-2 levers this plan pulls (e.g. "rebuild iron stores", "steady blood sugar", "top up vitamin D") in everyday language. No jargon, no supplement doses, no food names here — those live in the cards.
- Never repeat the same marker in both paragraphs. Never write "this plan will…" or "we recommend…". Speak directly to her.

RENDER-SAFE WORDING — NON-NEGOTIABLE.
The app strips, at display time, any sentence that (a) describes follicle-level or cellular biology, or (b) joins a named blood marker to a hair statement with a causal connector. A stripped sentence leaves the member with a heading and NO text, so wording that trips this is a failed answer.
- NEVER use these words anywhere: follicle, follicles, follicular, cell division, keratinisation, hair shaft, dermal papilla, anagen, telogen, catagen, sebum production, DHT, protein synthesis.
- NEVER write a marker and a hair outcome in one sentence joined by "so", "because", "which is why", "means", "causes", "leads to", "affects", "drives", "supports", "helps your". State the marker factually in one sentence, then say what the nutrient does for hair in the NEXT sentence.
  BAD: "your ferritin is low, which is why your hair is shedding."
  GOOD: "your ferritin (stored iron) is low. Iron is what new hair growth draws on."
- Plain everyday phrasing instead of biology: "new growth", "hair strength", "your scalp feels", "how quickly hair sheds".

OUTPUT RULES

1. EXPLANATION-FIRST. Never lead a card with "Eat this", "Take that", or "Avoid this". Lead with the plain-English mechanism, then connect to the user, then the food/supplement/limit lands as the obvious conclusion.

2. Ground every card in the user's actual data — age, life_stage, medications, diagnosed conditions, blood markers, goals, diet pattern, alcohol intake, recent wash signals. Never invent data — if a field is missing, don't reference it. If a card could apply to anyone, rewrite it.

3. SUPPLEMENTS — PERSONALISED, NOT GENERIC.
   - Every supplement card must be tied to something SPECIFIC about this user (a flagged marker, their medication depleting a nutrient, their diet pattern, their life stage). Never a generic "everyone should take X".
   - Iron: only recommend if ferritin/iron is flagged low, or the user is menstruating heavily / vegetarian / vegan with known risk. Explain iron in plain English ("iron is what carries oxygen around your body").
   - Vitamin D: recommend if a marker is flagged, if the user has limited sun exposure, or if life stage / diet pattern warrants it. Explain WHY in plain English.
   - B12: mandatory for vegan / vegetarian; also flag for anyone on metformin or long-term PPIs (explain the medication link in one line).
   - Zinc, magnesium, folate, omega-3, biotin, collagen: include only where the data supports it. Explain what each does for hair in one plain-English sentence.
   - Dose field: give a practical everyday dose with timing (e.g. "1000 IU daily with breakfast", "one 200 mg tablet with a glass of orange juice"). Never a range wider than 2x. Never medical prescribing.
   - Priority: "high" if a flagged marker directly drives it; "medium" if lifestyle drives it; "low" if general support.
   - NEVER include disclaimer text. Do not write "not medical advice", "consult your doctor", "check with your GP", or any equivalent safety caveat anywhere in your output — the app renders a single static disclaimer on this screen. Medication interactions may be explained factually, but without a check-with-GP nudge.

4. FOOD NAMES. Use specific everyday food names available in most UK supermarkets (e.g. "mackerel", "spinach", "eggs", "lentils", "pumpkin seeds"). DO NOT tie food recommendations to the user's location, city, region, culture, or heritage — never write "because you're in the UK", "as an African / Caribbean woman", "your heritage foods", "jollof base", "callaloo", "ackee", "plantain", or any other location- or ethnicity-anchored food framing. Recommend food purely based on the NUTRIENT it delivers and how it lands against this user's blood markers, life stage, medications and diet pattern.

5. DIET PATTERN HARD RULE. The DIETARY PATTERN block in this request is binding and overrides every other instruction. Every food you name — in a supplement card, a diet card, an avoid card or the summary — must be permitted for that pattern. Substitute, never subtract: if iron or protein guidance would normally point to red meat or liver, give the equivalent permitted source instead, and never return a shorter or thinner section because of the pattern. A pescatarian gets fish-based iron and omega-3 sources surfaced; a vegan and a vegetarian get plant equivalents. Where the pattern is "other" or "unknown" and no exclusions were given, keep every recommendation plant-based rather than guessing.

6. BLOOD MARKERS. Every flagged low/high marker MUST be addressed by at least one supplement OR diet card with a targeted lever + plain-English mechanism.

7. MEDICATIONS & CONDITIONS. If the user lists medications or diagnosed conditions, at least one card (supplement, diet, or avoid) must reference the interaction explicitly (e.g. "metformin lowers your B12 over time, which is why…", "with your thyroid on levothyroxine, avoid taking iron within 4 hours…").

8. SUPPLEMENTS SHE ALREADY TAKES. context.supplements is what this member has told us she is CURRENTLY taking, with the dose and frequency where she gave them. Treat it as fact.
   - Never present something she already takes as a new recommendation.
   - Where a nutrient is already covered, either leave it out and spend the card on a genuine gap, or keep it and say plainly that she is already covering it and why this card refines it (e.g. "you're already on D3, so this is about the co-factor it needs to work").
   - Where her stated dose or timing clashes with something else in her profile (a medication, another supplement, a flagged marker), the "avoid" cards are where that timing note belongs.
   - Never invent a supplement, dose or frequency she did not give, and never comment on brands.


9. AGE / LIFE STAGE. Reference perimenopause, menopause, postpartum, breastfeeding, or younger training-heavy life stages where relevant — nutrient needs shift materially at each.

10. AVOID CARDS. Each one must be personalised — name the medication, marker or timing it ties to — and each must be additive: what to pair with what, and when. Never tell the member to cut back, limit, reduce or give up a food, and never give a calorie, macro, gram or portion figure. Plain English.

11. SCOPE. Hair-health guidance only. Never diagnose. Never prescribe. Frame everything as "consider" / "worth discussing with your GP" when medication interaction or pregnancy is in play.

12. NO chapter citations. NO "Read more" links. NO textbook phrases like "essential for hair follicle mitosis" — say "what new hair growth draws on" instead. NO location, city, region, culture or heritage framing anywhere in the plan.`;
}

type PlanPart = "supplements" | "diet" | "avoid";

/**
 * The two halves share one schema definition, so a card generated in the split
 * path is identical in shape and depth to the old single-call path.
 */
function partSchema(part: PlanPart) {
  const props = RETURN_PLAN_SCHEMA.properties as Record<string, unknown>;
  const keys = part === "supplements"
    ? ["summary", "supplements"]
    : part === "diet"
    ? ["diet"]
    : ["avoid"];
  return {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(keys.map((k) => [k, props[k]])),
  };
}

async function runClaude(args: {
  body: RequestBody;
  part: PlanPart;
  recentWashSignals: unknown[];
  sensitivityBlock?: string;
  retryNote?: string;
  generationId?: string | null;
  attemptNumber?: number | null;
  maxAttempts?: number | null;
}): Promise<NutritionPlanPayload> {
  const BRIEFS: Record<PlanPart, string> = {
    supplements: `THIS REQUEST — SUMMARY + SUPPLEMENTS ONLY.
Produce the top-level "summary" and the "supplements" cards. Do not return diet or avoid cards; separate passes cover those, so do not thin out or shorten the supplement cards to make room. Every supplement rule above applies in full.`,
    diet: `THIS REQUEST — DIET CARDS ONLY.
Produce the "diet" cards. Do not return a summary, supplement cards or avoid cards; separate passes cover those, so do not thin out or shorten these cards to make room. Every diet and dietary-pattern rule above applies in full.`,
    avoid: `THIS REQUEST — AVOID CARDS ONLY.
Produce the "avoid" cards — pairing, timing and medication/supplement interactions, never eating less. Do not return a summary, supplement cards or diet cards; separate passes cover those, so do not thin out or shorten these cards to make room. Every avoid and dietary-pattern rule above applies in full.`,
  };
  const partBrief = BRIEFS[args.part];

  const userText = `${dietConstraintBlock(args.body.diet, args.body.dietOther)}${args.sensitivityBlock ?? ""}${args.retryNote ?? ""}

${partBrief}

User-supplied profile:
${JSON.stringify({
  diet: args.body.diet ?? "unknown",
  dietOther: args.body.dietOther ?? "",
  alcohol: args.body.alcohol ?? "unknown",
  flaggedMarkers: args.body.flaggedMarkers ?? [],
}, null, 2)}

Full user context (currentStyle, goals, challenges, hairProfile, healthProfile, bloodResults, location, professional, history.flagged_ingredients):
${JSON.stringify(args.body.context ?? {}, null, 2)}

Recent wash days where the user reported scalp/hair feel issues (pattern context — low ferritin often shows as shedding patterns):
${JSON.stringify(args.recentWashSignals, null, 2)}

Return JSON only via the return_nutrition_plan tool.`;


  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const req = await buildClaudeRequest({
    function_kind: "nutrition-plan",
    task_instructions: buildClaudeTaskInstructions(),
    user_payload: {},
    user_content: userContent,
    user_context: args.body.context ?? null,
    selector_context: buildSelectorContext(args.body.context ?? {}),
    force_topic_ids: [
      "iron-and-shedding",
      "vits-and-minerals",
      "hormones-and-life-stage",
      "thyroid",
      "diagnosed-conditions",
    ],
    rag_query: `nutrition food hair growth iron ferritin vitamin D B12 zinc thyroid ${
      (Array.isArray(args.body.flaggedMarkers)
        ? (args.body.flaggedMarkers as unknown as Array<Record<string, unknown>>)
            .map((m) => m.marker ?? m.name ?? "")
            .filter(Boolean)
            .join(" ")
        : "")
    }`.trim(),
    rag_k: 5,
    tool: {
      name: "return_nutrition_plan",
      description: args.part === "supplements"
        ? "Return the summary and supplement cards of the personalised nutrition plan. Always invoke exactly once."
        : "Return the diet and avoid cards of the personalised nutrition plan. Always invoke exactly once.",
      input_schema: partSchema(args.part) as unknown as Record<string, unknown>,
    },
    toolChoice: { type: "tool", name: "return_nutrition_plan" },
    // Each half of the plan is well inside 4096 output tokens (summary + 4-8
    // supplement cards, or 6-10 diet + 4-6 avoid cards). The full-plan call
    // needed 8192 and truncated at 4096; splitting the work removes that
    // pressure while keeping every card at full depth.
    max_tokens: 6144,
    generation_id: args.generationId ?? null,
    attempt_number: args.attemptNumber ?? null,
    max_attempts: args.maxAttempts ?? null,
    retry_reason: retryReasonFromRules(args.retryNote ? [args.retryNote] : null),

  });

  console.log("[nutrition-debug] before model call");
  const result = await callClaude<NutritionPlanPayload>(req);
  console.log(
    JSON.stringify({
      function: "nutrition-plan",
      provider: "claude",
      stop_reason: result.stop_reason,
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
    }),
  );
  console.log("[nutrition-debug] model call done");

  if (!result.toolInput) {
    throw new Error("Claude returned no return_nutrition_plan tool_use block");
  }
  // Defensive unwrap: Claude (Sonnet/Haiku especially) sometimes wraps tool
  // args under a placeholder envelope key like `$PARAMETER_NAME`,
  // `$PARAMETER_VALUE`, or `input`. The shared anthropic-client also does
  // this, but we re-run it here as a safety net in case of double-nesting or
  // a stale deploy.
  let p: any = result.toolInput;
  for (let depth = 0; depth < 3; depth++) {
    if (!p || typeof p !== "object" || Array.isArray(p)) break;
    const keys = Object.keys(p);
    if (keys.length !== 1) break;
    if (!/^(\$PARAMETER_NAME|\$PARAMETER_VALUE|input|arguments|parameters|plan|result|data|response|output)$/.test(keys[0])) break;
    const inner = p[keys[0]];
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) break;
    p = inner;
  }
  try {
    const raw = JSON.stringify(p);
    console.log(
      "[nutrition-debug] toolInput shape:",
      JSON.stringify({
        type: typeof p,
        keys: p && typeof p === "object" ? Object.keys(p) : [],
        raw_len: raw.length,
        raw_head: raw.slice(0, 400),
      }),
    );
  } catch (e) {
    console.log("[nutrition-debug] toolInput stringify failed", String(e));
  }
  const payload = {
    summary: typeof p.summary === "string" ? p.summary : "",
    supplements: Array.isArray(p.supplements) ? p.supplements : [],
    diet: Array.isArray(p.diet) ? p.diet : [],
    avoid: Array.isArray(p.avoid) ? p.avoid : [],
  };

  // Hard guard: never return (and therefore never cache) an empty part.
  const missing = args.part === "supplements"
    ? (payload.supplements.length === 0 || !payload.summary)
    : args.part === "diet"
    ? payload.diet.length === 0
    : payload.avoid.length === 0;
  if (missing) {
    throw new Error(
      `Claude returned incomplete plan part=${args.part} (stop_reason=${result.stop_reason}, supplements=${payload.supplements.length}, diet=${payload.diet.length}, avoid=${payload.avoid.length}, summary_len=${payload.summary.length})`,
    );
  }
  return payload;
}

/**
 * SPEED (2026-08-24). The plan used to come back from ONE Opus call with up to
 * 8192 output tokens (summary + 4-8 supplement cards + 6-10 diet cards + 4-6
 * avoid cards), which is what made a cold generation take ~100s: latency here
 * is dominated by output tokens, not by reasoning.
 *
 * It now runs three Opus calls CONCURRENTLY over the identical context, prompt
 * and rules — one returns summary + supplements, one the
 * diet cards, one the avoid cards — and the parts are merged. Same model, same instructions, same schema shape per
 * card, so the depth of each card is unchanged; wall-clock roughly halves
 * because the token streams run side by side.
 */
async function runClaudeSplit(args: {
  body: RequestBody;
  recentWashSignals: unknown[];
  sensitivityBlock?: string;
  retryNote?: string;
  generationId?: string | null;
  attemptNumber?: number | null;
  maxAttempts?: number | null;
}): Promise<NutritionPlanPayload> {
  const [head, diet, avoid] = await Promise.all([
    runClaude({ ...args, part: "supplements" }),
    runClaude({ ...args, part: "diet" }),
    runClaude({ ...args, part: "avoid" }),
  ]);
  return {
    summary: head.summary,
    supplements: head.supplements,
    diet: diet.diet,
    avoid: avoid.avoid,
  };
}


// ─── Provider: Lovable+Gemini (legacy) ────────────────────────────────
async function runLovable(
  body: RequestBody,
  sensitivityBlock = "",
  retryNote = "",
  retryMeta?: { generationId?: string | null; attemptNumber?: number | null; maxAttempts?: number | null },
): Promise<NutritionPlanPayload> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const userPayload = {
    dietaryConstraint: dietConstraintBlock(body.diet, body.dietOther),
    diet: body.diet ?? "unknown",
    alcohol: body.alcohol ?? "unknown",
    flaggedMarkers: body.flaggedMarkers ?? [],
    context: body.context ?? null,
  };

  const groundingCtx = (body.context ?? null) as Record<string, unknown> | null;
  const grounding = await buildGroundingBlock({
    surface: "nutrition-plan",
    fn: "nutrition-plan",
    functionKind: "nutrition-plan",
    selectorContext: selectorFromAiContext(groundingCtx),
    forceTopics: ["iron-and-shedding","vits-and-minerals","hormones-and-life-stage","thyroid","diagnosed-conditions"],
    ragQuery: ragQueryFromAiContext(groundingCtx, "nutrition diet iron ferritin vitamins minerals hair growth shedding"),
    ragK: 4,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55_000);
  let aiResp: Response;
  try {
    aiResp = await gatewayFetch({
      ...AI_METER_META,
      generation_id: retryMeta?.generationId ?? null,
      attempt_number: retryMeta?.attemptNumber ?? null,
      max_attempts: retryMeta?.maxAttempts ?? null,
      retry_reason: retryReasonFromRules(retryNote ? [retryNote] : null),
    }, "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: `${STRAND_PERSONA}\n\n${CHAPTER_WHITELIST_PROMPT}\n\n${TASK_PROMPT_LOVABLE}\n\n${dietConstraintBlock(body.diet, body.dietOther)}${sensitivityBlock}${retryNote}${grounding.block}\n\n${buildTipsLevelBlock(3)}\n\nNUTRITION IS EXEMPT FROM THE SUPPORT-LEVEL SCALE. Always answer at full detail regardless of the member's guidance level: the complete personalised supplement list (no dosing figures), the full list of meal ideas, the full list of pairing and timing notes, and the full dietary reasoning. Never abbreviate, never defer detail to a higher level, and never mention guidance levels.` },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_nutrition_plan",
                description: "Return the personalised hair nutrition plan.",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    supplements: {
                      type: "array",
                      minItems: 3,
                      maxItems: 8,
                      items: {
                        type: "object",
                        properties: {
                          emoji: { type: "string" },
                          name: { type: "string" },
                          dose: { type: "string" },
                          body: { type: "string" },
                          priority: { type: "string", enum: ["high", "medium", "low"] },
                        },
                        required: ["emoji", "name", "body"],
                      },
                    },
                    diet: {
                      type: "array",
                      minItems: 6,
                      maxItems: 10,
                      items: {
                        type: "object",
                        properties: {
                          emoji: { type: "string" },
                          name: { type: "string" },
                          body: { type: "string" },
                        },
                        required: ["emoji", "name", "body"],
                      },
                    },
                    avoid: {
                      type: "array",
                      minItems: 4,
                      maxItems: 6,
                      items: {
                        type: "object",
                        properties: {
                          emoji: { type: "string" },
                          name: { type: "string" },
                          body: { type: "string" },
                          severity: {
                            type: "string",
                            enum: ["high", "medium", "low"],
                          },
                        },
                        required: ["emoji", "name", "body"],
                      },
                    },
                  },
                  required: ["summary", "supplements", "diet", "avoid"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_nutrition_plan" },
          },
        }),
      },
    );
  } catch (err) {
    clearTimeout(timeoutId);
    const e: Error & { status?: number } = err instanceof Error ? err : new Error(String(err));
    e.status = 504;
    throw e;
  }
  clearTimeout(timeoutId);

  if (!aiResp.ok) {
    const status = aiResp.status;
    const t = await aiResp.text();
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = status;
    throw err;
  }

  const aiJson = await aiResp.json();
  const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("Malformed AI output");
  }
  const parsed = JSON.parse(toolCall.function.arguments) as Partial<NutritionPlanPayload>;
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    supplements: Array.isArray(parsed.supplements) ? parsed.supplements : [],
    diet: Array.isArray(parsed.diet) ? parsed.diet : [],
    avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const kill = checkKillSwitch();
  if (kill) return kill;


  const t0 = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "missing auth" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const authUser = userData?.user;
    if (!authUser) return json(401, { error: "Unauthorized" });

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const mode = await resolveAiRequestMode(authUser.id, body as Record<string, unknown>, supabase as never);
    if (mode instanceof Response) return mode;
    const memberId = mode.userId;
    const dataClient = mode.dryRun
      ? createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
      : supabase;
    // Attribute every ai_call_log row from this request to this member, so a
    // guardrail rejection is traceable to the person it broke (2026-08-26).
    setAiCallUser(memberId);
    setAiCallImpersonation({ isImpersonated: mode.isImpersonated, impersonatedBy: mode.impersonatedBy });
    // Paid feature: a lapsed membership loses AI guidance.
    if (!(await isEntitled(memberId))) return membershipRequired();
    const { force, context, diet, dietOther, alcohol, flaggedMarkers } = body;

    // Allergies and intolerances are a hard pre-generation filter. Decrypted
    // in memory here — never matched in SQL.
    const sens = await loadSensitivities(dataClient, memberId, "dietary");
    const sensitivityBlock = sensitivityConstraintBlock(sens, "dietary");

    const provider = readAiProvider("STRAND_AI_PROVIDER_NUTRITION");
    console.log("[nutrition-debug] start", {
      user_id: memberId,
      provider,
      hasBloodResults: Array.isArray((context as { bloodResults?: unknown[] } | undefined)?.bloodResults)
        && ((context as { bloodResults?: unknown[] }).bloodResults?.length ?? 0) > 0,
      currentStyle: (context as { currentStyle?: unknown } | undefined)?.currentStyle ?? null,
    });

    // REGENERATION TRIGGER (2026-08-26). The signature is built ONLY from
    // things that legitimately change the plan:
    //   • her blood data (read from the database, never from the request body)
    //   • her dietary pattern and alcohol answer
    //   • her hard dietary exclusions (a safety guardrail, not a preference)
    //   • the schema / model / provider stamp
    // Everything else that used to be in here — whole hairProfile, healthProfile
    // and goals objects, plus the raw blood array off the client context — moved
    // with every render and made each page view pay for a cold generation.
    // An explicit `force` (the member tapped "Generate a new plan") still
    // regenerates once.
    const bloodFp = await bloodFingerprint(dataClient, memberId);
    // Supplements, hair profile, goal/challenges/concerns and the health & diet
    // answers all change the plan too (2026-09-05). Read from the database so
    // the signature only moves when one of them genuinely changed.
    const inputsFp = await nutritionInputFingerprint(dataClient, memberId);
    const sig = await sha(JSON.stringify({
      schema_version: "v7-full-detail-2026-08-15",
      model_version: MODEL_VERSION,
      provider,
      diet: diet ?? null,
      dietOther: dietOther ?? null,
      alcohol: alcohol ?? null,
      flaggedMarkers: (flaggedMarkers ?? []).slice().sort(),
      sensitivities: sens.all
        .map((e) => `${e.label}:${e.severity}`)
        .slice()
        .sort(),
      blood: bloodFp,
      inputs: inputsFp,
      // Nutrition always renders at full detail, so the support level is
      // deliberately excluded from the cache signature.
      tipsLevel: "full",
    }));

    if (!force) {
      const cached = await readSurfaceCache(dataClient, memberId, "nutrition_plan", sig);
      if (cached) {
        console.log("[nutrition-debug] cache hit", { total_ms: Date.now() - t0 });
        return json(200, {
          cached: true,
          plan: await sanitiseAndLog(cached, "nutrition-plan", { context: body.context }),
        });
      }
      // Cache MISS diagnostics — logs which signature the stored plan carries so
      // a signature that keeps moving for an unchanged member is visible instead
      // of silently paying for a generation.
      const { data: storedRow } = await dataClient
        .from("ai_summaries")
        .select("payload")
        .eq("user_id", memberId)
        .eq("kind", "nutrition_plan")
        .maybeSingle();
      console.log("[nutrition-debug] cache miss", {
        sig,
        stored_sig: (storedRow?.payload as Record<string, unknown> | null)?._sig ?? null,
        blood_fp: bloodFp,
      });
    }



    // Spend protection: per-user daily cap (model-spend paths only).
    // Workspace-wide automatic brake (see _shared/usage-cap.ts).
    const ceiling = await checkGlobalCeiling("nutrition-plan");
    if (ceiling) return ceiling;

    const capped = await checkDailyCap(memberId, "nutrition-plan", 8);
    if (capped) return capped;

    let payload: NutritionPlanPayload | null = null;
    let providerStamp: "claude" | "lovable" = provider === "claude" ? "claude" : "lovable";
    const generationId = makeGenerationId();
    const collect = (p: NutritionPlanPayload): string[] => [
      p.summary,
      ...p.supplements.flatMap((x) => Object.values(x ?? {}).map(String)),
      ...p.diet.flatMap((x) => Object.values(x ?? {}).map(String)),
      ...p.avoid.flatMap((x) => Object.values(x ?? {}).map(String)),
    ];
    const lastGoodPlan = async () => {
      const { data: prior } = await dataClient
        .from("ai_summaries")
        .select("payload")
        .eq("user_id", memberId)
        .eq("kind", "nutrition_plan")
        .maybeSingle();
      const priorPayload = prior?.payload as Record<string, unknown> | null;
      return priorPayload && Array.isArray(priorPayload.diet) && priorPayload.diet.length > 0
        ? priorPayload
        : null;
    };

    let retryRules: string[] | null = null;
    for (let attemptNumber = 1; attemptNumber <= MAX_REJECTION_ATTEMPTS; attemptNumber++) {
      const guardrailRetry = retryRules?.length
        ? `\n\n${buildRejectionRetryInstruction(retryRules, "nutrition plan")}`
        : "";
      if (provider === "claude") {
        // Pull last 5 wash days where the user reported a hair-feel signal.
        const { data: recentRaw } = await dataClient
          .from("wash_days")
          .select("wash_date, scalp_feel, breakage, hair_feel_note")
          .eq("user_id", memberId)
          .order("wash_date", { ascending: false })
          .limit(15);
        const recentSignals = (recentRaw ?? [])
          .filter((r) => {
            const note = (r as { hair_feel_note?: string | null }).hair_feel_note;
            const sf = (r as { scalp_feel?: string | null }).scalp_feel;
            const br = (r as { breakage?: string | null }).breakage;
            return (note && note.trim().length > 0) || sf || br;
          })
          .slice(0, 5);

        payload = await runClaudeSplit({
          body,
          recentWashSignals: recentSignals,
          sensitivityBlock,
          retryNote: guardrailRetry,
          generationId,
          attemptNumber,
          maxAttempts: MAX_REJECTION_ATTEMPTS,
        });
        providerStamp = "claude";
      } else {
        payload = await runLovable(body, sensitivityBlock, guardrailRetry, {
          generationId,
          attemptNumber,
          maxAttempts: MAX_REJECTION_ATTEMPTS,
        });
        providerStamp = "lovable";
      }

      // Deterministic post-generation check. The prompt is a filter, not a
      // guarantee — so every string is scanned against the member's hard
      // exclusions and their aliases. One retry, then drop the offending items.
      let hits = validateAgainstAvoid(collect(payload), sens, "dietary");
      if (hits.length > 0) {
        const retryNote = `\n\nRETRY — your previous answer broke a hard exclusion. It referenced: ${
          hits.map((h) => `${h.label} (as "${h.term}")`).join("; ")
        }. Rebuild the plan without these in any form, keeping the same number of items by substituting permitted foods that do the same job.`;
        console.log("[nutrition-debug] sensitivity retry", { hits: hits.length });
        payload = provider === "claude"
          ? await runClaudeSplit({
            body,
            recentWashSignals: [],
            sensitivityBlock,
            retryNote,
            generationId,
            attemptNumber,
            maxAttempts: MAX_REJECTION_ATTEMPTS,
          })
          : await runLovable(body, sensitivityBlock, retryNote, {
            generationId,
            attemptNumber,
            maxAttempts: MAX_REJECTION_ATTEMPTS,
          });
        hits = validateAgainstAvoid(collect(payload), sens, "dietary");
        if (hits.length > 0) {
          const bad = (x: unknown) =>
            validateAgainstAvoid(Object.values(x ?? {}).map(String), sens, "dietary").length > 0;
          payload = {
            summary: validateAgainstAvoid([payload.summary], sens, "dietary").length > 0
              ? ""
              : payload.summary,
            supplements: payload.supplements.filter((x) => !bad(x)),
            diet: payload.diet.filter((x) => !bad(x)),
            avoid: payload.avoid.filter((x) => !bad(x)),
          };
          console.log("[nutrition-debug] sensitivity items dropped");
        }
      }

      // A missing summary is a formatting gap, not an empty plan: the food rows
      // are the plan, so derive a neutral one-liner rather than fail the whole
      // request (members with many exclusions were getting a 500 here).
      if (!payload.summary && payload.diet.length > 0) {
        payload = { ...payload, summary: deriveSummary(payload) };
      }
      if (payload.diet.length === 0 || payload.avoid.length === 0) {
        throw new Error(
          `Refusing to cache empty nutrition plan (provider=${providerStamp}, diet=${payload.diet.length}, avoid=${payload.avoid.length})`,
        );
      }


      const rejected: string[] = [];
      payload = await sanitiseAndLog(payload, "nutrition-plan", {
        context: body.context,
        surface: "nutrition-plan",
        userId: memberId,
        generationId,
        attemptNumber,
        maxAttempts: MAX_REJECTION_ATTEMPTS,
        retryReason: retryReasonFromRules(retryRules),
        dryRun: mode.dryRun,
        onRejected: (rules) => rejected.push(...rules),
      }) as NutritionPlanPayload;
      if (rejected.length === 0) break;
      retryRules = [...new Set(rejected)];
    }

    if (!payload) throw new Error("Nutrition plan generation returned no payload");
    if (!payload.summary && payload.diet.length > 0) {
      payload = { ...payload, summary: deriveSummary(payload) };
    }
    if (payload.diet.length === 0 || payload.avoid.length === 0 || !payload.summary) {
      const priorPayload = await lastGoodPlan();
      if (priorPayload) return json(200, { cached: true, stale: true, plan: priorPayload });
      // Nothing survivable came back and she has no stored plan. Never a 500:
      // the screen falls back to its own deterministic food-first guidance when
      // `plan` is null, which is far better than a broken section.
      console.error(
        `[nutrition-plan] empty plan, serving deterministic fallback (provider=${providerStamp}, diet=${payload.diet.length}, avoid=${payload.avoid.length})`,
      );
      return json(200, { plan: null, unavailable: true });
    }


    const stamped = {
      ...payload,
      _sig: sig,
      _generated_at: new Date().toISOString(),
      _provider: providerStamp,
      ...(providerStamp === "claude" ? { _model_version: MODEL_VERSION } : {}),
    } as Record<string, unknown>;

    if (!mode.dryRun) {
      const { data: prior } = await dataClient
        .from("ai_summaries")
        .select("id")
        .eq("user_id", memberId)
        .eq("kind", "nutrition_plan")
        .maybeSingle();

      if (prior?.id) {
        await dataClient
          .from("ai_summaries")
          .update({ payload: stamped, updated_at: new Date().toISOString() })
          .eq("id", prior.id);
      } else {
        await dataClient
          .from("ai_summaries")
          .insert({ user_id: memberId, kind: "nutrition_plan", payload: stamped });
      }
    }

    console.log("[nutrition-debug] all done", {
      total_ms: Date.now() - t0,
      provider: providerStamp,
    });
    return json(200, {
      cached: false,
      plan: stamped,
    });
  } catch (e) {
    console.log("[nutrition-debug] failed", { total_ms: Date.now() - t0 });
    return aiErrorResponse(e, "nutrition-plan");
  }
});
