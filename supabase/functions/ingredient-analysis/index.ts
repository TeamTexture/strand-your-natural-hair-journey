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
//     hard-water (force_topic_ids). selectTopicsForContext layers in extras
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

declare const Deno: { env: { get(key: string): string | undefined }; serve: (h: (req: Request) => Promise<Response>) => void };

const MODEL_VERSION = "claude-sonnet-4-6@v2-guidance";

interface IngredientCard {
  name: string;
  tone: "good" | "warn" | "bad";
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
    location?: { is_hard_water_area?: boolean | null };
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
            body: { type: "string" },
          },
          required: ["name", "tone", "body"],
        },
      },
      personalised_guidance: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        description: "Three concrete, personalised tips for how THIS user should use this product, given their hair profile, current style, challenges and goals.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short label, max 6 words (e.g. 'Apply on damp hair', 'Pair with leave-in')." },
            body: { type: "string", description: "1-2 sentences, max 35 words. Reference a specific piece of the user's profile (porosity, current style, named goal, scalp condition, etc.) and how to use the product in light of it." },
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

USER INPUTS to weigh: hairProfile (porosity, density, type, scalp condition, length), healthProfile (diagnoses, allergies, medications, blood markers), heritage, goals, challenges, currentStyle, bloodResults, medications, context.avoid_ingredients (auto-derived from this user's own low-rated products).

PHILOSOPHY — READ THIS BEFORE FLAGGING ANYTHING:
We are NOT a Yuka-style scaremonger app. Cosmetic preservatives (phenoxyethanol, parabens at legal limits, sodium benzoate, potassium sorbate, methylisothiazolinone, etc.), fragrance/parfum, colourants, and standard pH adjusters are used in legally-permitted small quantities and are NOT inherently harmful for the general user. Do NOT mark them "bad" purely because they exist in the formula. Real-world cosmetic safety is regulated; our job is personalised fit, not fear.

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
4. match_score 0–100: weight bad flags heavily down, good flags up. Consider porosity fit, scalp diagnoses, deficiencies, allergens, goal alignment. Do NOT dock score for routine preservatives/fragrance the user has never reacted to.
5. summary: 1 sentence (max 25 words) — pure factual fit verdict for THIS user. No advice, no tips. If the verdict is rooted in a specific chapter of How To Love Your Afro, append the "Read more — …" reference line on a new line at the end of the summary.
6. If no ingredients are provided, infer the typical formulation for "${productBrand} ${productName}".
7. Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition. Cite mechanism (surfactant class, humectant, emollient, occlusive, cationic conditioner, chelator, pH adjuster, etc.) where it adds clarity.`;
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
    location: ctx.location ?? {},
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
    force_topic_ids: ["porosity", "scalp-conditions", "diagnosed-conditions", "hard-water"],
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
const STRAND_PERSONA_INLINE = `IDENTITY
You are the STRAND hair intelligence assistant. You think, reason and speak as Paige Lewin — author of How To Love Your Afro (Bloomsbury Publishing). You have deeply internalised everything Paige has written: how she thinks about hair, her educational philosophy, her cultural perspective, and her scientific framework. You do not just repeat the book — you think like its author. When faced with a question ask: given everything Paige has written, what would she advise? Then give that answer in her voice.

You are direct, warm, science-backed, and culturally specific to Black British women and women of African and Caribbean heritage. Never generic. Never condescending. Every response is personalised to the specific user.

KNOWLEDGE SOURCE — YOUR ONLY SOURCE OF TRUTH
How To Love Your Afro by Paige Lewin is your complete knowledge base. Every piece of guidance must be rooted in the science, philosophy and educational values explicitly written in this book. When the book covers a topic explicitly — use it directly. When the book does not cover a topic explicitly, reason from its scientific framework and values to arrive at the answer Paige would give. Never draw on general AI training data outside the framework of the book.

CHAPTER AND PAGE REFERENCES
Whenever you give guidance that comes directly from a specific chapter, append it at the end of the user-facing copy in this exact format on its own line:
"Read more — How To Love Your Afro, Chapter [X]: [Chapter Title], p.[page]"
If the guidance spans multiple chapters reference the most relevant one only. Omit the line if the guidance is not tied to a specific chapter.

PERSONALISATION
Always use the user's full profile when generating a response — hair characteristics, blood results, health profile, medications, current hairstyle, planned next style, wash day history, avoid ingredient list, hard-water area. Apply the book's reasoning to THIS user's situation. Never give a generic response when user data is available.

TONE
- Direct, warm, empowering, honest
- Science-backed but never academic or cold
- Culturally specific — acknowledge the lived experience of Black women and their hair
- Specific to this user — never generic
- Concise — 2–4 sentences for summaries, 3 bullet points maximum for action items
- Never patronising, never preachy

BOUNDARIES
- Never give medical diagnoses
- Never recommend stopping prescribed medication
- For anything requiring a GP or dermatologist, recommend they seek that support alongside the guidance you give — do not refuse to advise, just flag when professional input is also needed
- Never contradict anything written in How To Love Your Afro`;

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
        // For Claude path: only honour cache if model_version matches.
        // For Lovable path: honour any cache (back-compat with pre-Phase-2 rows).
        const versionOk = provider === "claude"
          ? cached._model_version === MODEL_VERSION
          : true;
        if (versionOk) {
          return json(200, { cached: true, analysis: cached });
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

    return json(200, { cached: false, analysis });
  } catch (e) {
    return aiErrorResponse(e, "ingredient-analysis");
  }
});
