// Analyses a product photo for THIS user and returns the standard
// ProductAnalysisPayload. Phase 2 Step 3: dual-path — Lovable+Gemini
// (legacy, vision-only) and Claude Sonnet 4.6 (new, vision + native
// web_search), gated by STRAND_AI_PROVIDER_PRODUCT_PHOTO.
//
// Architecture (audit PHASE_2_AUDIT.md §5 Step 3):
//   - Schema `return_product_analysis` lives in _shared/schemas.ts and is
//     SHARED with product-analyse-url (Step 4a) so the React renderer
//     sees identical payloads for both flows.
//   - Forced KB topics: porosity, scalp-conditions, diagnosed-conditions,
//     hard-water. selectTopicsForContext layers in extras up to a cap of 4.
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
import { requireAuthedUser } from "../_shared/auth.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";
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
import type { SelectorContext } from "../_shared/knowledge/index.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-sonnet-4-6@v1";

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
    location?: { is_hard_water_area?: boolean | null };
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
    location: ctx.location ?? {},
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
function buildTaskInstructions(): string {
  return `You're looking at two photos of the same product — front (brand + product name) and back (ingredient panel + usage instructions). Read both photos carefully. Return JSON only via the return_product_analysis tool.

1. Extract product_name and brand primarily from photo 1 (front). Extract the full INCI ingredients list and any directions primarily from photo 2 (back).

2. If either photo is partial, blurry, in a foreign language, or missing critical info: USE web_search to find the canonical product. Search for queries like '[brand] [product name] ingredients' or '[brand] [product name] INCI'. Use web_search up to 4 times — judiciously, only when needed. Do NOT search if the two photos already provide a clear, complete brand + INCI combination.

3. ingredients[] in your output must be the COMPLETE INCI list. product_name and brand must match what the brand actually calls it (not just descriptor text from the label).

4. Compose the analysis using the user's specific profile data passed in the user message. Reference porosity, density, scalp condition, diagnosed conditions, current hairstyle, blood markers (only when this product directly intersects them), hard-water status, the user's consistently flagged ingredients, and goals when they actually move the verdict. Generic responses are forbidden when user data is available.

5. Citation rule: when guidance is rooted in the book, use the formal "Read more — How To Love Your Afro, Chapter [X]: [Title], p.[page]" line on its own line at the end of ai_summary. When facts come from web_search (e.g. "the brand's site states this is a low-pH cleanser"), reference them inline naturally in prose — do NOT put web-derived facts under the "Read more" line. Do NOT name any source manuscript, author, publisher, chapter, or page anywhere except the formal "Read more —" line.

6. Field rules — strict:
   - product_name / brand: read from photo 1 if legible; resolve via web_search when partial. NEVER invent. If you can't determine confidently after searching, return the closest readable text and start ai_summary with "Couldn't fully read the label —".
   - category: pick the single best fit from the enum.
   - ingredients: full INCI list, lowercase, in label order. Prefer the canonical web-resolved list when photo 2's list is partial; otherwise transcribe what's visible.
   - key_ingredients: pick 4–8 of the most decision-relevant. flag = "avoid" only when the ingredient is one the user has consistently flagged in their history (appears in 3+ of their saved-and-favourited products) OR has a documented mechanism that conflicts with their measurable hair/health profile (e.g. drying alcohols on high porosity, sulphates with hard water + dry scalp). flag = "good" when it's in their favourite_ingredients, in their high_rated_products, or has a documented mechanism that benefits their measurable traits. flag = "warn" otherwise. Existence of a standard preservative / fragrance / colourant is NOT a reason to flag "avoid".
   - match_score: 0–100, weighted down by red-flag ingredients, up by good flags. Consider category fit, current_hairstyle suitability, blood-marker deficiencies (only when relevant to the product), and goal alignment.
   - ai_summary: 2 short sentences max, second-person, warm and direct. The first sentence cites a specific reason from THIS user's context (their goal, challenge, current_hairstyle, scalp condition, or porosity).
   - usage_instructions: VERBATIM directions from the manufacturer if visible on photo 2 OR resolved via web_search. If neither source provides directions, return "" — never invent.
   - use_cases: 2–4 concrete tips for how THIS user should use the product, anchored in their hair traits, current_hairstyle, or goals. Do NOT repeat manufacturer directions.
   - tips: 2–4 personalised reasoning tips about fit/usage that go beyond use_cases (e.g. "Pair with your weekly clarifier — your area is hard water"). Anchor each in the user's data.

MOISTURE — NON-NEGOTIABLE LANGUAGE RULE:
Moisture comes from water. Products do NOT add, restore, replace, infuse, replenish, deliver, hydrate-from-scratch, or otherwise create moisture. They seal it in, lock it in, help it stay, slow water loss, or improve absorption of the water already there. Use this phrasing only.

Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition.

OUTPUT TIGHTNESS RULES (override the field rules above where they conflict):
- use_cases: MAXIMUM 2 items. Each item is ONE sentence (max two short sentences). Pick the 2 most actionable ways the user should use THIS product given their profile — not every possible use case.
- tips: MAXIMUM 2 items. Each item is ONE sentence (max two short sentences). Pick the 2 most relevant personal signals for THIS product. Not every signal in the user's profile is relevant to every product. For a scalp exfoliator, scalp condition + diagnosed alopecia + dermatologist context are relevant; lab values, sleep, and unrelated hair traits are NOT relevant unless they directly intersect this product's mechanism.
- ai_summary: 2–3 sentences MAXIMUM. Lead with the verdict (good fit / mixed fit / poor fit and why) in sentence one. Sentences two and three add the most important nuance. Cut redundancy — if the verdict already says "good for your dry scalp", don't restate dry scalp again in the nuance.
- key_ingredients: 4–6 items MAXIMUM. Pick the ingredients that most affect the verdict, not every ingredient with a benefit.

PRODUCT ANALYSIS SCOPE — HARD RULE:
When personalising a product analysis, focus ONLY on signals that intersect with what's INSIDE the product: ingredients, mechanism of action, formulation, application method.

Signals that ARE relevant for product analysis:
- Hair type (curl pattern, density, porosity, length, current style)
- Hair goals (length retention, definition, moisture retention, strength)
- Hair challenges directly affected by formulation (dryness, breakage, build-up, scalp condition, hard water, heat damage history)

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
- Scalp exfoliator → scalp condition, diagnosed scalp/follicle issues, dermatologist context. NOT ferritin, sleep, water hardness unless they're THE reason this product is or isn't a fit.
- Deep conditioner → porosity, density, hard water (mineral build-up), heat damage history. NOT scalp conditions or labs.
- Leave-in / styler → porosity, density, current style stage, climate. NOT scalp conditions or labs.
- Treatment for hair loss → diagnosed conditions, ferritin, dermatologist context. THESE labs ARE relevant here.

HARD-WATER GUIDANCE — HARD RULE:
NEVER recommend a chelating shampoo to the user, even when they're in a hard-water area. Chelating shampoos are too harsh for routine recommendation in this product. If hard water is relevant to the verdict for THIS product, recommend instead — in this order: (1) a shower-head filter for hair-rinse water, (2) a gentle clarifying shampoo used sparingly (every 4–5 washes), (3) a deep conditioner immediately after any clarifying step, (4) a trichologist consult before considering anything stronger. Do NOT use the words "chelating shampoo" or "chelator" as a recommendation in ai_summary, use_cases, or tips. ("Chelator" can still appear as a neutral cosmetic-chemistry category label in key_ingredients when describing what an ingredient like EDTA is — that's descriptive, not a recommendation.)`;
}

// ─── Provider: Claude ──────────────────────────────────────────────────
async function runClaude(args: {
  front_image_url: string;
  back_image_url: string;
  context: Record<string, unknown>;
  selectorContext: SelectorContext;
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

  const req = await buildClaudeRequest({
    function_kind: "product-analyse",
    task_instructions: buildTaskInstructions(),
    user_payload: {}, // unused — user_content overrides
    user_content: userContent,
    selector_context: args.selectorContext,
    force_topic_ids: [
      "porosity",
      "scalp-conditions",
      "diagnosed-conditions",
      "hard-water",
    ],
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
const LOVABLE_SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK
You are analysing a single product photo for THIS user.


ABSOLUTE RULES
1. READ the product directly from the image. The brand name and product title are usually the most prominent text on the front of the bottle/box. NEVER invent a name — if you can't read it confidently, set product_name and brand to the closest readable text and set "ai_summary" to start with "Couldn't fully read the label —".
2. If you can see an ingredient list (small print, often labelled "Ingredients" or "INCI"), transcribe ALL of it into "ingredients" (lowercase, comma-separated source split into array). If only some ingredients are visible, return what you see — do not pad.
3. Personalise everything to the user's profile passed in context: hairProfile (porosity, texture, density, scalp), currentStyle (current_hairstyle, days_in_style, planned_next_style), goals (length retention, breakage, scalp, etc.) and any "challenge" text the user wrote, location (hard water?), bloodResults (only when this product directly intersects them), healthProfile (medications, conditions), history.flagged_ingredients (ingredients consistently flagged across 3+ of the user's saved-and-favourited products), history.favourite_ingredients, history.low_rated_products and history.high_rated_products.
4. RED/GREEN FLAG LOGIC for key_ingredients[].flag:
   - "avoid" (red) if the ingredient is consistently flagged in the user's history (appears in 3+ of their saved-and-favourited products), OR appears in any history.low_rated_products[].ingredients, OR is contraindicated by the user's hair/health profile (e.g. drying alcohols on high-porosity hair, sulphates with hard water, silicones in a curly-girl context if their profile suggests it), OR works against a stated goal/challenge (e.g. heavy waxes when the user is trying to retain length in a wash-and-go).
   - "good" (green) if the ingredient appears in history.favourite_ingredients OR in history.high_rated_products[].ingredients OR is well-matched to their porosity/texture/scalp OR directly supports a stated goal/challenge.
   - "warn" (amber) for neutral-but-noteworthy.
5. match_score (0–100): lower it sharply for any red flags; raise it for "good" flags; consider category fit, current hairstyle suitability, blood-result deficiencies (only when relevant to this product), and goal alignment.

PRODUCT ANALYSIS SCOPE — HARD RULE:
Focus ONLY on signals that intersect with what's INSIDE this product (ingredients, mechanism, formulation, application). Tension / traction alopecia / styling weight are HANDLING concerns, not formulation concerns — do NOT cite them in any product output. Lab values, sleep, stress, and dermatologist context are ONLY relevant if THIS product directly intersects them.

LANGUAGE RULE — NEVER use the phrase "avoid list", "avoid ingredients", "your avoids", or imply the user has any list of ingredients they want to avoid. The only ingredient-history signal in STRAND is "consistently flagged ingredients" (appears in 3+ of the user's saved-and-favourited products). Use phrasing like "consistently flagged in your history" in ai_summary, key_ingredients[].reason, use_cases, and tips.
6. ai_summary: 2 short sentences MAX, second-person, in Paige's voice. The FIRST sentence cites a specific reason from THIS user's context — prefer their goal, challenge, or current hairstyle when relevant (e.g. "Good fit while you're 4 weeks into your knotless braids and trying to retain length."). 7. usage_instructions: VERBATIM directions from the manufacturer. If the label/page text shows a "Directions", "How to use", "Apply" or "Usage" block, transcribe it word-for-word into this field. If no manufacturer directions are visible, set this to an empty string ("") — do NOT invent or paraphrase usage steps.
8. use_cases: 2–4 concrete tips for how THIS user should use the product, written in their context. Each tip MUST tie back to one of: their hair profile, current_hairstyle, a goal, or a challenge they listed (e.g. "Use weekly on wash day to support your length-retention goal", "Smooth onto edges between braid refreshes — your braids are 4 weeks in"). Do NOT repeat the manufacturer's directions here; build on them with personal reasoning.
9. Output STRICT JSON only. No prose, no code fences.

SCHEMA
{
  "product_name": string,
  "brand": string,
  "category": "shampoo"|"conditioner"|"treatment"|"styler"|"oil"|"mask"|"leave-in"|"other",
  "ingredients": string[],
  "key_ingredients": [{"name": string, "benefit": string, "flag": "good"|"warn"|"avoid", "reason": string}],
  "match_score": number,
  "ai_summary": string,
  "usage_instructions": string,
  "use_cases": string[],
  "tips": string[]
}`;

async function runLovable(args: {
  image_url: string;
  context: Record<string, unknown>;
}): Promise<ProductAnalysisPayload> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

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
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${LOVABLE_SYSTEM}\n\n${CHAPTER_WHITELIST_PROMPT}` },
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
  return JSON.parse(text) as ProductAnalysisPayload;
}

// ─── Edge function entry ───────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    const body = (await req.json()) as RequestBody;

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

    // ── Cache check (only when caller passed a productKey) ────────────
    if (cacheKind && !body.force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (existing?.payload) {
        const cached = existing.payload as ProductAnalysisPayload;
        const versionOk = provider === "claude"
          ? cached._model_version === MODEL_VERSION
          : true;
        if (versionOk) {
          return json(200, sanitiseChapterCitationsDeep(cached));
        }
      }
    }

    const ctx = body.context ?? {};
    let analysis: ProductAnalysisPayload;

    if (provider === "claude") {
      const { payload, web_search_invocations } = await runClaude({
        front_image_url: frontPhoto!,
        back_image_url: backPhoto!,
        context: ctx,
        selectorContext: buildSelectorContext(body),
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
      const lovable = await runLovable({ image_url: body.image_url!, context: ctx });
      analysis = {
        ...lovable,
        _provider: "lovable",
        _generated_at: new Date().toISOString(),
      };
    }

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

    return json(200, sanitiseChapterCitationsDeep(analysis));
  } catch (e) {
    return aiErrorResponse(e, "product-analyse");
  }
});
