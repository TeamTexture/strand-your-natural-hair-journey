// ingredient-profile — short, science-backed profile for a single ingredient,
// surfaced inside the dropdown row on the Ingredient Analysis page. Returns
// three fields:
//   - what_it_is: 1–2 plain-English sentences explaining the ingredient
//   - benefits: 2–4 bullet points on what it does for hair (with mechanism)
//   - personal_notes: 2–4 bullet points anchored in THIS user's own data
//     (porosity, density, scalp condition, current style,
//     goals, challenges) explaining how the ingredient is likely to behave
//     for THEIR hair specifically. Educational, never a diagnosis, never
//     framed as good/bad.
//
// Cached per user in ai_summaries (kind = `ingredient_profile:<name>`) so
// re-opening a row is instant. Cache is invalidated when MODEL_VERSION
// bumps. Personal notes are user-specific so the cache cannot be shared.
//
// Lovable AI Gateway, structured output via tool calling.

import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { VOICE_PRINCIPLES } from "../_shared/voice.ts";
import { retrievePassages, renderPassageBlock } from "../_shared/rag.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

// Flash is ~3–5× faster than Pro and plenty for this short, structured payload.
const MODEL = "google/gemini-2.5-flash";
const MODEL_VERSION = "ingredient-profile@v5-succinct";

interface RequestBody {
  ingredient: string;
  /** Why the ingredient was flagged (e.g. "Appears in 3 of your products"). */
  reason?: string;
  /** The full AI context payload built by buildAiContext() on the client. */
  context?: Record<string, unknown>;
  /** Stable key for the product this ingredient lives in — used to scope
   * the cache because the personalised guidance depends on co-formulants. */
  productKey?: string;
  /** Optional: the product this ingredient sits inside, so the model can
   * weigh the rest of the formulation when explaining what it means
   * for the user's hair. */
  productName?: string;
  productBrand?: string;
  /** Other ingredient names in the same formulation (the full INCI list
   * minus this ingredient). Used so the model can consider co-formulants
   * — e.g. a humectant balanced by an occlusive — before guiding. */
  formulationIngredients?: string[];
  /** Bypass cache and regenerate. */
  force?: boolean;
}

interface ProfilePayload {
  what_it_is: string;
  /** Rich consumer-facing science deep dive — bullets surfacing things a
   * shopper would never read on a label or in marketing copy. */
  deep_dive: string[];
  benefits: string[];
  personal_notes: string[];
  /** Multi-sentence personalised guidance shown under
   * "What this means for your hair type" on the ingredient dialog.
   * Considers the rest of the formulation and the user's profile. */
  what_it_means_for_you?: string;
  _model_version?: string;
  _generated_at?: string;
}

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    what_it_is: {
      type: "string",
      description:
        "1–2 plain-English sentences (max 40 words) explaining what this ingredient is. Name the cosmetic-chemistry family in everyday words (e.g. 'a humectant — it pulls water from the air', 'a gentle cleansing surfactant derived from coconut'). No marketing language, no good/bad framing, no jargon left unexplained.",
    },
    benefits: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" },
      description:
        "2–3 very short bullets (each ≤14 words) on what this ingredient practically does in a hair formula. Plain English, mechanism in one phrase. Never claim products 'add', 'restore', 'replenish' or 'deliver' moisture — only seal/lock/retain it.",
    },
    what_it_means_for_you: {
      type: "string",
      description:
        "1–2 sentences (max 45 words) of calm, personalised guidance for THIS user's hair, framed as 'what this means for your hair type'. Reference at least one concrete data point (porosity, density, scalp data, a goal, current style) and keep impact framing proportionate — most cosmetic ingredients sit at fractions of a percent. Never alarmist, never good/bad, never prescribe avoidance, never diagnose.",
    },
  },
  required: ["what_it_is", "benefits", "what_it_means_for_you"],
} as const;

function buildSystemPrompt(): string {
  return `${STRAND_PERSONA}

${VOICE_PRINCIPLES}

TASK
Return a SHORT, clear, science-backed ingredient profile for ONE ingredient via the return_profile tool. Three fields: what_it_is, benefits, what_it_means_for_you. Audience: a curious shopper who wants a quick, honest explanation — not a deep dive, not a sales pitch, not a warning.

Voice for this task: follow the VOICE PRINCIPLES above. In what_it_is, name the cosmetic-chemistry family AND translate it in the same sentence ("a humectant — it pulls water from the air toward the strand"). In what_it_means_for_you, lead with the mechanism then bridge with a connective ("which means", "so", "this is why") into the user's specific data. Talk to "you", not "your hair".

REMAINING NOTES
- BE SUCCINCT. Every sentence earns its place. No filler, no hedging, no preamble.

LANGUAGE RULES — NON-NEGOTIABLE
- Moisture comes from water. Products NEVER add, restore, replenish, deliver or infuse moisture. They seal it in, lock it in, slow water loss, or help retention.
- Never name a book, chapter, page, or author. No "Read more" lines.
- Never give a medical diagnosis. Never name diagnosed scalp/skin conditions, alopecia types, hormones, blood markers, medications or life stage — phrase around them ("your scalp data", "what you've logged").
- No fear-mongering and no good/bad framing. Never call an ingredient harmful, bad, problematic, risky, ideal or "exactly what you need".
- Most cosmetic ingredients sit at fractions of a percent — keep impact framing proportionate.

WHAT_IT_MEANS_FOR_YOU RULES
- Max 2 sentences. Reference at least ONE concrete data point from the user's context.
- Consider the surrounding formulation when provided — co-formulants can balance or amplify effects.
- End with a useful, practical takeaway — never "avoid this".`;
}

function buildUserPrompt(body: RequestBody): string {
  const ctx = body.context ?? {};
  const formulation = (body.formulationIngredients ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  const productLine = body.productName
    ? `PRODUCT: ${body.productName}${body.productBrand ? ` — ${body.productBrand}` : ""}`
    : "";
  const formulationBlock = formulation.length
    ? `OTHER INGREDIENTS IN THIS FORMULATION (so you can weigh co-formulants — buffering, balancing, or amplifying effects):\n${formulation.slice(0, 80).join(", ")}`
    : "";
  return `INGREDIENT: ${body.ingredient}
${body.reason ? `WHY IT'S FLAGGED: ${body.reason}` : ""}
${productLine}
${formulationBlock}

USER CONTEXT (JSON):
${JSON.stringify(ctx, null, 2).slice(0, 12000)}

Generate the profile now via the return_profile tool.`;
}

function cacheKindFor(ingredient: string, productKey?: string): string {
  // ai_summaries.kind is text. Lower-case the ingredient so casing variants
  // share the cache row. Product key is included because the
  // "what_it_means_for_you" answer depends on the surrounding formulation.
  const ing = ingredient.toLowerCase().trim();
  return productKey
    ? `ingredient_profile:${ing}::${productKey}`
    : `ingredient_profile:${ing}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const { user, supabase } = auth;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  if (!body?.ingredient || typeof body.ingredient !== "string") {
    return json(400, { error: "ingredient required" });
  }

  const kind = cacheKindFor(body.ingredient, body.productKey);

  // 1) Try cache (unless force).
  if (!body.force) {
    const { data: cached } = await supabase
      .from("ai_summaries")
      .select("payload")
      .eq("user_id", user.id)
      .eq("kind", kind)
      .maybeSingle();
    const payload = cached?.payload as ProfilePayload | null;
    if (payload && payload._model_version === MODEL_VERSION) {
      return json(200, { profile: payload, cached: true });
    }
  }

  // 2) Call Lovable AI Gateway with structured output via tool calling.
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY missing" });

  let aiResp: Response;
  try {
  // Retrieve manuscript passages about this ingredient / its class.
  let ragBlock = "";
  try {
    const passages = await retrievePassages(
      `${body.ingredient} ingredient Afro hair porosity moisture scalp`,
      3,
    );
    if (passages.length > 0) {
      ragBlock = `\n\nRETRIEVED MANUSCRIPT PASSAGES (use verbatim teachings):\n\n${passages.map(renderPassageBlock).join("\n\n---\n\n")}`;
    }
  } catch (e) {
    console.warn("ingredient-profile RAG retrieval failed (continuing):", e);
  }

    aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${buildSystemPrompt()}${ragBlock}` },
          { role: "user", content: buildUserPrompt(body) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_profile",
              description: "Return the structured ingredient profile.",
              parameters: TOOL_SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_profile" } },
      }),
    });
  } catch (e) {
    console.error("ingredient-profile fetch failed", e);
    return json(502, { error: "ai gateway unreachable" });
  }

  if (aiResp.status === 429) {
    return json(429, { error: "Rate limited — please try again shortly." });
  }
  if (aiResp.status === 402) {
    return json(402, {
      error:
        "AI credits exhausted — please top up your Lovable AI workspace usage.",
    });
  }
  if (!aiResp.ok) {
    const t = await aiResp.text().catch(() => "");
    console.error("ingredient-profile gateway error", aiResp.status, t.slice(0, 400));
    return json(500, { error: "ai gateway error" });
  }

  let parsed: ProfilePayload | null = null;
  try {
    const data = await aiResp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) throw new Error("no tool call returned");
    const args = JSON.parse(argsStr);
    if (
      typeof args?.what_it_is !== "string" ||
      !Array.isArray(args?.benefits)
    ) {
      throw new Error("invalid tool args shape");
    }
    parsed = {
      what_it_is: String(args.what_it_is).trim(),
      deep_dive: [],
      benefits: args.benefits.map((s: unknown) => String(s).trim()).filter(Boolean),
      personal_notes: [],
      what_it_means_for_you:
        typeof args?.what_it_means_for_you === "string"
          ? String(args.what_it_means_for_you).trim()
          : undefined,
      _model_version: MODEL_VERSION,
      _generated_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error("ingredient-profile parse failed", e);
    return json(502, { error: "ai response could not be parsed" });
  }

  // 3) Cache it (upsert).
  try {
    await supabase
      .from("ai_summaries")
      .upsert(
        {
          user_id: user.id,
          kind,
          payload: parsed as unknown as Record<string, unknown>,
        },
        { onConflict: "user_id,kind" },
      );
  } catch (e) {
    // Cache failure is non-fatal — still return the result.
    console.error("ingredient-profile cache write failed", e);
  }

  return new Response(JSON.stringify({ profile: parsed, cached: false }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
