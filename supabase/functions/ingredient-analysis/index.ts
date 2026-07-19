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
import { requireAuthedUser } from "../_shared/auth.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude } from "../_shared/anthropic-client.ts";
import { shouldTriggerRag, matchTriggerIngredient } from "../_shared/rag-triggers.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";

declare const Deno: { env: { get(key: string): string | undefined }; serve: (h: (req: Request) => Promise<Response>) => void };

const MODEL_VERSION = "claude-sonnet-4-6@v8-single-tip";

interface IngredientCard {
  name: string;
  tone: "good" | "warn" | "bad";
  /**
   * Cosmetic-chemistry category, drawn from the STRAND manuscript's framework
   * (Preservative, Humectant, Emollient, Occlusive, Surfactant, Conditioning
   * Agent, Protein, Active, Fragrance, Colourant, Solvent, pH Adjuster,
   * Chelator, Emulsifier, Thickener, Antioxidant, Botanical Extract). When
   * the ingredient doesn't slot into a book category, infer from cosmetic
   * science.
   */
  category: string;
  body: string;
}
interface GuidanceTip {
  title: string;
  body: string;
}
interface AnalysisPayload {
  match_score: number;
  summary: string;
  ingredients: IngredientCard[];
  personalised_guidance?: GuidanceTip[];
  _model_version?: string;
  _generated_at?: string;
  _provider?: "claude" | "lovable";
}

interface RequestBody {
  productKey: string;
  productName: string;
  productBrand: string;
  ingredients?: string[];
  hairProfile?: Record<string, unknown>;
  healthProfile?: Record<string, unknown>;
  heritage?: string[];
  goals?: Array<Record<string, unknown>>;
  currentStyle?: Record<string, unknown> | null;
  challenges?: string[];
  force?: boolean;
  context?: Record<string, unknown> & {
    avoid_ingredients?: string[];
  };
}

// ── Tool schema (shared between providers) ──────────────────────────────
function buildToolSchema(ingredientCount: number) {
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
      summary: { type: "string" },
      ingredients: {
        type: "array",
        ...itemsConstraint,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            tone: { type: "string", enum: ["good", "warn", "bad"] },
            category: {
              type: "string",
              description: "Cosmetic-chemistry category from the STRAND manuscript: Preservative, Humectant, Emollient, Occlusive, Surfactant, Conditioning Agent, Protein, Active, Fragrance, Colourant, Solvent, pH Adjuster, Chelator, Emulsifier, Thickener, Antioxidant, Botanical Extract. If the ingredient doesn't slot into a book category, choose the closest cosmetic-science category.",
            },
            body: { type: "string" },
          },
          required: ["name", "tone", "category", "body"],
        },
      },
      personalised_guidance: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        description: "Exactly ONE concrete tip — the single highest-impact, science-rooted way this user can get the most out of THIS product, drawing on the manufacturer's intended use, the actual key ingredients, the STRAND manuscript guidance, and the user's hair data. Pick the one that delivers the clearest benefit; do not pad with a second tip.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short label, max 6 words (e.g. 'Apply on damp hair', 'Layer under your leave-in')." },
            body: { type: "string", description: "1-2 sentences, max 35 words. Reference the product's intended purpose and at least one of the user's hair traits (porosity, density, type, length, surface texture, hair challenge, hair goal). Cite the active/key ingredient mechanism where it helps." },
          },
          required: ["title", "body"],
        },
      },
    },
    required: ["match_score", "summary", "ingredients", "personalised_guidance"],
  } as Record<string, unknown>;
}

// ── Task instructions (shared text — minus the brittle EXACTLY prose) ──
function buildTaskInstructions(productBrand: string, productName: string, ingredientCount: number): string {
  return `You are analysing a hair product's INCI list against this specific user's profile. Return JSON only via the return_analysis tool, speaking as Paige.

Voice for this task: follow the VOICE PRINCIPLES from the system block. In every body field, lead with the molecule's mechanism in plain English (translate the cosmetic-chemistry term on first use), then bridge with a connective ("which means", "so", "this is why") into what it means for THIS user. Talk to "you", not "your hair". Warm but not saccharine; no hedging stacks.

USER INPUTS to weigh: hairProfile (porosity, density, type, scalp condition, length), healthProfile (diagnoses, allergies, medications, blood markers), heritage, goals, challenges, currentStyle, bloodResults, medications, context.avoid_ingredients (auto-derived from this user's own low-rated products).

PHILOSOPHY — READ THIS BEFORE FLAGGING ANYTHING:
We are NOT a Yuka-style scaremonger app. Cosmetic preservatives (phenoxyethanol, parabens at legal limits, sodium benzoate, potassium sorbate, methylisothiazolinone, etc.), fragrance/parfum, colourants, and standard pH adjusters are used in legally-permitted small quantities and are NOT inherently harmful for the general user. Do NOT mark them "bad" purely because they exist in the formula. Real-world cosmetic safety is regulated; our job is personalised fit, not fear.

MOISTURE — NON-NEGOTIABLE LANGUAGE RULE (the STRAND manuscript, Chapter 14: Moisture Retention):
Moisture comes from water. Period. Products do NOT add, restore, replace, infuse, replenish, deliver, hydrate-from-scratch, or otherwise create moisture. They seal it in, lock it in, help it stay, slow water loss, or improve absorption of the water already there. NEVER write "restores moisture", "adds moisture", "replenishes moisture", "delivers moisture", or "hydrates the strand". Use book-aligned phrasing only: "seals moisture in", "locks moisture in", "helps retain moisture", "slows moisture loss", "supports moisture retention", "softens cuticle so water can absorb during wash day". Conditioners, leave-ins, oils, butters, masks and stylers are sealers / softeners / penetrants / emollients / humectants — never water sources. Apply this rule to ingredient body copy, the summary, and personalised_guidance equally.

RULES — STRICT:
1. Flag EVERY ingredient supplied — do NOT skip any (including water, fragrance, colourants, preservatives). The tool schema enforces the count (${ingredientCount > 0 ? ingredientCount : "as supplied"}); preserve the input order.
2. tone — apply this exact decision tree:
   - "bad" ONLY if AT LEAST ONE of the following is true:
     a) the ingredient (or its INCI alias) appears in context.avoid_ingredients (the user's own data has flagged it across multiple low-rated products), OR
     b) the user has a documented allergy / sensitivity / diagnosis in healthProfile that this molecule directly aggravates (e.g. SLS sulphate when scalp_condition flags seborrheic dermatitis or eczema; isopropyl/SD alcohol on a documented "high porosity + breakage" combo; a named allergen the user listed), OR
     c) the molecule directly conflicts with a measurable hair trait the user holds (e.g. heavy mineral oil sealing low-porosity hair the user is trying to moisturise — and even then, only if the formula puts it high in the list).
     NEVER mark a standard preservative, fragrance, colourant, or pH adjuster "bad" without (a), (b) or (c). Existence ≠ harm.
   - "good" = the ingredient has a documented mechanism that benefits THIS user's measurable traits (humectant for low-porosity in humid climate, emollient for high-porosity ends, anti-fungal for diagnosed scalp condition, etc.).
   - "warn" = neutral / context-dependent / patch-test recommended / "fine for most people but watch how your scalp reacts". Use "warn" — NOT "bad" — for routine preservatives and fragrance when the user has no flagged sensitivity.
3. body: ONE concise sentence (max 22 words). Lead with the SCIENTIFIC mechanism (what the molecule does chemically), THEN tie to the user's specific data point if relevant. No generic care tips, no usage instructions, no "consider", no "may help your routine". Never imply legal-limit cosmetic ingredients are dangerous.
   GOOD example (bad): "Anionic surfactant — strips sebum and lipids; harsh given your dry scalp diagnosis."
   GOOD example (warn): "Broad-spectrum preservative used at <1% — safe at this level; flag only if your scalp has reacted to it before."
   BAD example: "Avoid — fragrance can irritate." (No, only if the user has flagged it.)
3a. category: assign EVERY ingredient a single category from the STRAND manuscript's ingredient framework — Preservative, Humectant, Emollient, Occlusive, Surfactant, Conditioning Agent (cationic / silicone / quat), Protein, Active, Fragrance, Colourant, Solvent, pH Adjuster, Chelator, Emulsifier, Thickener, Antioxidant, Botanical Extract. If an ingredient does not slot into the manuscript's categories, choose the closest cosmetic-science category from the same list (do not invent new ones).
4. match_score 0–100: weight bad flags heavily down, good flags up. Consider porosity fit, scalp diagnoses, deficiencies, allergens, goal alignment. Do NOT dock score for routine preservatives/fragrance the user has never reacted to.
5. summary: 1 sentence (max 25 words) — pure factual fit verdict for THIS user. No advice, no tips. 6. personalised_guidance: return EXACTLY ONE tip — the single highest-impact, science-rooted piece of guidance for how this user can get the most out of THIS specific product. Do NOT return two tips. To choose it, weigh: (a) the manufacturer's intended use, (b) the mechanism of the product's most important key/active ingredient, (c) the STRAND manuscript guidance that applies, and (d) the user's most relevant hair data point (porosity, density, type, current style, key goal, or hair challenge). Pick the angle that produces the clearest, most defensible benefit for this user; discard weaker or generic tips. Strict scope:
   - ONLY draw on: hair type, hair characteristics (porosity, density, diameter, surface texture, elasticity, length), the user's CURRENT HAIRSTYLE, how long that style has been in (if known from currentStyle.style_set_at), the user's KEY GOALS (e.g. length retention, definition, less breakage, edge regrowth, moisture retention) and HAIR CHALLENGES from goals/challenges, the product's actual key/active ingredients, and the manufacturer's intended use of the product (pre-shampoo, shampoo, conditioner, leave-in, mask, oil, styler, etc.).
   - The tip MUST explicitly reference at least one of: a named goal/challenge from the user's data, OR the user's current hairstyle (and length of time in that style if relevant), OR a measurable hair trait (porosity, density, etc.). Do not write a tip that is generic to all users.
   - Anchor the tip in (a) the manufacturer's intent for the product, (b) the science of one of its key ingredients (humectant / emollient / occlusive / cationic conditioner / protein / surfactant class / etc.), and (c) at least one of the user's hair traits, challenges, goals, OR current style.
   - Where the STRAND manuscript covers the relevant technique (e.g. pre-poo on dry hair before washing, sectioning for detangling, applying leave-in to soaking-wet hair for low porosity, refresh routines for braids/twists), use that guidance directly in your own voice — never name the source, the author, a chapter or a page.
   - DO NOT mention: traction alopecia, alopecia of any kind, diagnosed scalp conditions, medical conditions, medications, blood markers, hormones, life stage, or any health diagnosis. Those belong elsewhere in the app, not in product usage tips.
   - DO NOT prescribe styling-tension behaviour (braids too tight, take-down schedules driven by alopecia risk, etc.). Style references are only allowed as neutral context (e.g. "good for refreshing day-3 twist-outs") not as a medical warning.
   Examples (adapt — never copy verbatim):
   - title: "Pre-poo on dry hair", body: "As a pre-shampoo, work this through dry, sectioned strands 20-30 min before washing — the oils coat your high-porosity cuticle so shampoo doesn't strip it further, supporting your length-retention goal."
   - title: "Refresh week-3 braids", body: "Three weeks into your box braids, dilute 1:3 with water in a spray bottle and mist the parted scalp only — the humectants pull moisture in for your low-porosity strands without weighing the install down or disturbing your length-retention goal."
7. If no ingredients are provided, infer the typical formulation for "${productBrand} ${productName}".
8. Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition. Cite mechanism (surfactant class, humectant, emollient, occlusive, cationic conditioner, chelator, pH adjuster, etc.) where it adds clarity.`;
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
}): Promise<AnalysisPayload> {
  const { productName, productBrand, ingredients, hairProfile, userPayload, selectorContext, avoidList } = args;
  const ingredientCount = ingredients.length;

  const ragOn = shouldTriggerRag(ingredients, avoidList);
  const ragQuery = ragOn ? buildRagQuery(productName, ingredients, hairProfile) : undefined;

  const req = await buildClaudeRequest({
    function_kind: "ingredient-analysis",
    task_instructions: buildTaskInstructions(productBrand, productName, ingredientCount),
    user_payload: userPayload,
    selector_context: selectorContext,
    force_topic_ids: ["porosity", "scalp-conditions", "diagnosed-conditions"],
    rag_query: ragQuery,
    rag_k: 4,
    tool: {
      name: "return_analysis",
      description: "Return the structured ingredient analysis.",
      input_schema: buildToolSchema(ingredientCount),
    },
    toolChoice: { type: "tool", name: "return_analysis" },
    max_tokens: 4096,
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

// ── Provider: Lovable+Gemini (legacy path, preserved verbatim) ─────────
async function runLovable(args: {
  systemPrompt: string;
  userPayload: Record<string, unknown>;
  ingredientCount: number;
}): Promise<AnalysisPayload> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const aiResp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: JSON.stringify(args.userPayload) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis",
              description: "Return the structured ingredient analysis.",
              parameters: buildToolSchema(args.ingredientCount),
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

  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    const body: RequestBody = await req.json();
    const {
      productKey, productName, productBrand,
      ingredients, hairProfile, healthProfile, heritage,
      goals, currentStyle, challenges, force,
    } = body;

    if (!productKey || !productName) {
      return json(400, { error: "Missing product info" });
    }

    const cacheKind = `ingredient_analysis:${productKey}`;
    const provider = readAiProvider("STRAND_AI_PROVIDER_INGREDIENT");

    // ── Cache check (model_version-aware) ─────────────────────────────
    if (!force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload, updated_at")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (existing?.payload) {
        const cached = existing.payload as AnalysisPayload;
        // Only honour cache if it includes the separate personalised guidance
        // section. Older rows predate this field and must be regenerated.
        const hasGuidance = Array.isArray(cached.personalised_guidance) && cached.personalised_guidance.length >= 1;
        const versionOk = provider === "claude"
          ? cached._model_version === MODEL_VERSION
          : true;
        if (versionOk && hasGuidance) {
          return json(200, { cached: true, analysis: await sanitiseAndLog(cached, "ingredient-analysis") });
        }
      }
    }

    // ── Pull personalisation server-side ─────────────────────────────
    const [bloodRowsRes, medRowsRes, goalRowsRes] = await Promise.all([
      supabase.from("blood_results").select("marker, value, unit, status, category").eq("user_id", user.id),
      supabase.from("user_medications").select("name, category").eq("user_id", user.id),
      supabase.from("user_goals")
        .select("kind, title, target_text, target_value, unit, current_value, target_date, challenge, notes, status")
        .eq("user_id", user.id).neq("status", "complete"),
    ]);
    const bloodRows = bloodRowsRes.data ?? [];
    const medRows = medRowsRes.data ?? [];
    const dbGoals = goalRowsRes.data ?? [];

    const userPayload: Record<string, unknown> = {
      product: { key: productKey, name: productName, brand: productBrand },
      ingredients: ingredients ?? [],
      hairProfile: hairProfile ?? {},
      healthProfile: healthProfile ?? {},
      heritage: heritage ?? [],
      bloodResults: bloodRows,
      medications: medRows,
      goals: goals && goals.length ? goals : dbGoals,
      currentStyle: currentStyle ?? null,
      challenges: challenges ?? [],
      context: body.context ?? null,
    };

    const ingredientCount = (ingredients ?? []).length;
    const avoidList = Array.isArray(body.context?.avoid_ingredients)
      ? body.context!.avoid_ingredients as string[]
      : [];

    let analysis: AnalysisPayload;
    if (provider === "claude") {
      analysis = await runClaude({
        productName,
        productBrand,
        ingredients: ingredients ?? [],
        hairProfile: (hairProfile ?? {}) as Record<string, unknown>,
        userPayload,
        selectorContext: buildSelectorContext(body),
        avoidList,
      });
      // Stamp provenance — required for cache_version invalidation.
      analysis._model_version = MODEL_VERSION;
      analysis._generated_at = new Date().toISOString();
      analysis._provider = "claude";
    } else {
      const systemPrompt = `${STRAND_PERSONA_INLINE}

TASK
${buildTaskInstructions(productBrand, productName, ingredientCount)}`;
      analysis = await runLovable({
        systemPrompt,
        userPayload,
        ingredientCount,
      });
      analysis._provider = "lovable";
      analysis._generated_at = new Date().toISOString();
      // Note: no _model_version stamp on Lovable path — back-compat.
    }

    // ── Upsert cache ────────────────────────────────────────────────
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

    return json(200, { cached: false, analysis: await sanitiseAndLog(analysis, "ingredient-analysis") });
  } catch (e) {
    return aiErrorResponse(e, "ingredient-analysis");
  }
});
