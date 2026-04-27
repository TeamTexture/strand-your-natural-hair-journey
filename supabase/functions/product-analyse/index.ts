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
  image_url?: string; // signed URL OR data URL (data:image/...;base64,...)
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
  return `You are analysing a single product PHOTO for THIS user, in Paige's voice. Return JSON only via the return_product_analysis tool.

When analyzing this product:

1. Look at the photo carefully. Extract product name, brand, and any visible ingredients.

2. If the visible label is partial, folded, obscured, or only shows marketing text without an ingredient list, USE web_search to find the full canonical ingredient list and brand context. Search for queries like '[brand] [product name] ingredients' or '[brand] [product name] INCI'. Use web_search up to 4 times — judiciously, only when needed. Do NOT search if the photo already shows a clear, complete INCI list.

3. Compose the analysis using the user's specific profile data passed in the user message. Reference porosity, density, scalp condition, diagnosed conditions, current hairstyle, blood markers, hard-water status, avoid_ingredients, and goals when they actually move the verdict. Generic responses are forbidden when user data is available.

4. Citation rule:
   - When guidance is rooted in How To Love Your Afro, use the formal line on its own line at the end of the relevant field:
     "Read more — How To Love Your Afro, Chapter [X]: [Title], p.[page]"
   - When facts come from web_search (e.g. "the brand's product page lists this as a low-pH cleanser"), reference them inline naturally in prose. Do NOT put web-derived facts under the formal "Read more" line — that line is reserved for book citations only.

5. Field rules — strict:
   - product_name / brand: read from the photo if legible; resolve via web_search when partial. NEVER invent. If you can't determine confidently after searching, return the closest readable text and start ai_summary with "Couldn't fully read the label —".
   - category: pick the single best fit from the enum.
   - ingredients: full INCI list, lowercase, in label order. Prefer the canonical web-resolved list when the photo's list is partial; otherwise transcribe what's visible.
   - key_ingredients: pick 4–8 of the most decision-relevant. flag = "avoid" only when the ingredient is in the user's avoid_ingredients OR has a documented mechanism that conflicts with their measurable hair/health profile (e.g. drying alcohols on high porosity, sulphates with hard water + dry scalp, an INCI the user has flagged across low-rated products). flag = "good" when it's in their favourite_ingredients, in their high_rated_products, or has a documented mechanism that benefits their measurable traits. flag = "warn" otherwise. Existence of a standard preservative / fragrance / colourant is NOT a reason to flag "avoid".
   - match_score: 0–100, weighted down by avoid flags, up by good flags. Consider category fit, current_hairstyle suitability, blood-marker deficiencies, and goal alignment.
   - ai_summary: 2 short sentences max, second-person, in Paige's voice. The first sentence cites a specific reason from THIS user's context (their goal, challenge, current_hairstyle, scalp condition, or porosity). If guidance is rooted in a specific chapter, append the formal "Read more — …" line on a new line at the end.
   - usage_instructions: VERBATIM directions from the manufacturer if visible on the label OR resolved via web_search. If neither source provides directions, return "" — never invent.
   - use_cases: 2–4 concrete tips for how THIS user should use the product, anchored in their hair traits, current_hairstyle, or goals. Do NOT repeat manufacturer directions.
   - tips: 2–4 personalised reasoning tips about fit/usage that go beyond use_cases (e.g. "Pair with your weekly clarifier — your area is hard water"). Anchor each in the user's data.

MOISTURE — NON-NEGOTIABLE LANGUAGE RULE (How To Love Your Afro, Chapter 14):
Moisture comes from water. Products do NOT add, restore, replace, infuse, replenish, deliver, hydrate-from-scratch, or otherwise create moisture. They seal it in, lock it in, help it stay, slow water loss, or improve absorption of the water already there. Use book-aligned phrasing only.

Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition.`;
}

// ─── Provider: Claude ──────────────────────────────────────────────────
async function runClaude(args: {
  image_url: string;
  context: Record<string, unknown>;
  selectorContext: SelectorContext;
}): Promise<{ payload: ProductAnalysisPayload; web_search_invocations: number }> {
  const userText = `Analyse this product photo for me. Read the brand and product title directly from the label. If the label is partial or obscured, use web_search to resolve the canonical ingredient list and brand context.

User context (use to compute key_ingredients flags, match_score, ai_summary, use_cases, and tips):
${JSON.stringify(args.context ?? {}, null, 2)}

Return JSON only via the return_product_analysis tool.`;

  const userContent: ContentBlockInput[] = [
    { type: "image", source: toAnthropicImageSource(args.image_url) },
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
const LOVABLE_SYSTEM = `IDENTITY
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
- Never contradict anything written in How To Love Your Afro

TASK
You are analysing a single product photo for THIS user, in Paige's voice.

ABSOLUTE RULES
1. READ the product directly from the image. The brand name and product title are usually the most prominent text on the front of the bottle/box. NEVER invent a name — if you can't read it confidently, set product_name and brand to the closest readable text and set "ai_summary" to start with "Couldn't fully read the label —".
2. If you can see an ingredient list (small print, often labelled "Ingredients" or "INCI"), transcribe ALL of it into "ingredients" (lowercase, comma-separated source split into array). If only some ingredients are visible, return what you see — do not pad.
3. Personalise everything to the user's profile passed in context: hairProfile (porosity, texture, density, scalp), currentStyle (current_hairstyle, days_in_style, planned_next_style), goals (length retention, breakage, scalp, etc.) and any "challenge" text the user wrote, location (hard water?), bloodResults, healthProfile (medications, conditions), history.avoid_ingredients, history.favourite_ingredients, history.low_rated_products and history.high_rated_products.
4. RED/GREEN FLAG LOGIC for key_ingredients[].flag:
   - "avoid" (red) if the ingredient appears in history.avoid_ingredients, OR appears in any history.low_rated_products[].ingredients, OR is contraindicated by the user's hair/health profile (e.g. drying alcohols on high-porosity hair, sulphates with hard water, silicones in a curly-girl context if their profile suggests it), OR works against a stated goal/challenge (e.g. heavy waxes when the user is trying to retain length in a wash-and-go).
   - "good" (green) if the ingredient appears in history.favourite_ingredients OR in history.high_rated_products[].ingredients OR is well-matched to their porosity/texture/scalp OR directly supports a stated goal/challenge.
   - "warn" (amber) for neutral-but-noteworthy.
5. match_score (0–100): lower it sharply for any "avoid" flags; raise it for "good" flags; consider category fit, current hairstyle suitability, blood-result deficiencies, and goal alignment.
6. ai_summary: 2 short sentences MAX, second-person, in Paige's voice. The FIRST sentence cites a specific reason from THIS user's context — prefer their goal, challenge, or current hairstyle when relevant (e.g. "Good fit while you're 4 weeks into your knotless braids and trying to retain length."). If the verdict is rooted in a specific chapter of How To Love Your Afro, append the "Read more — …" reference line on a new line at the end of ai_summary.
7. usage_instructions: VERBATIM directions from the manufacturer. If the label/page text shows a "Directions", "How to use", "Apply" or "Usage" block, transcribe it word-for-word into this field. If no manufacturer directions are visible, set this to an empty string ("") — do NOT invent or paraphrase usage steps.
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
    if (!body.image_url) {
      return json(400, { error: "image_url required" });
    }

    const provider = readAiProvider("STRAND_AI_PROVIDER_PRODUCT_PHOTO");
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
          return json(200, cached);
        }
      }
    }

    const ctx = body.context ?? {};
    let analysis: ProductAnalysisPayload;

    if (provider === "claude") {
      const { payload, web_search_invocations } = await runClaude({
        image_url: body.image_url,
        context: ctx,
        selectorContext: buildSelectorContext(body),
      });
      analysis = {
        ...payload,
        _model_version: MODEL_VERSION,
        _generated_at: new Date().toISOString(),
        _provider: "claude",
        _used_web_search: web_search_invocations > 0,
      };
    } else {
      const lovable = await runLovable({ image_url: body.image_url, context: ctx });
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
