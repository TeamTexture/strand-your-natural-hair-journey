// ingredient-profile — short, science-backed profile for a single ingredient,
// surfaced inside the dropdown row on the Ingredient Analysis page. Returns
// three fields:
//   - what_it_is: 1–2 plain-English sentences explaining the ingredient
//   - benefits: 2–4 bullet points on what it does for hair (with mechanism)
//   - personal_notes: 2–4 bullet points anchored in THIS user's own data
//     (porosity, density, scalp condition, hard-water area, current style,
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
import { STRAND_PERSONA } from "../_shared/strand-persona.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL = "google/gemini-2.5-pro";
const MODEL_VERSION = "ingredient-profile@v4-deep-dive";

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
  benefits: string[];
  personal_notes: string[];
  /** 1–2 sentence personalised guidance shown under
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
        "1–2 plain-English sentences (max 40 words total) explaining what the ingredient is and which cosmetic-chemistry family it belongs to (humectant, emollient, occlusive, surfactant, cationic conditioner, protein, preservative, etc.). No marketing language.",
    },
    benefits: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
      description:
        "2–4 short bullet points on what this ingredient does for hair. Each ≤20 words. Lead with the scientific mechanism. Never claim products 'add', 'restore' or 'deliver' moisture — only seal/lock/retain it.",
    },
    personal_notes: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
      description:
        "2–4 short bullet points (each ≤25 words) explaining how this ingredient is likely to behave for THIS user's hair, anchored in their own data — porosity, density, scalp data, hard-water area, current style, named goals or challenges. Cite the specific data point that drives each note (e.g. 'low porosity', 'hard-water area', 'your length-retention goal'). Educational only — never frame as good or bad, never diagnose.",
    },
    what_it_means_for_you: {
      type: "string",
      description:
        "EXACTLY 1–2 sentences (max 45 words) of calm, personalised guidance for THIS user's hair, framed as 'what this means for your hair type'. Weigh (a) this ingredient's typical behaviour, (b) the rest of the formulation it sits in (co-formulants can balance or amplify it), and (c) the user's own data (porosity, density, scalp, hard water, goals). Remember most of these ingredients are used in very small quantities so the impact is usually modest. Never alarmist, never good/bad, never prescribe avoidance, never diagnose.",
    },
  },
  required: ["what_it_is", "benefits", "personal_notes", "what_it_means_for_you"],
} as const;

function buildSystemPrompt(): string {
  return `${STRAND_PERSONA}

TASK
Return a short ingredient profile for ONE ingredient via the return_profile tool. Four fields only: what_it_is, benefits, personal_notes, what_it_means_for_you.

LANGUAGE RULES — NON-NEGOTIABLE
- Moisture comes from water. Products NEVER add, restore, replenish, deliver or infuse moisture. They seal it in, lock it in, slow water loss, or help retention. Use this phrasing in benefits, personal_notes and what_it_means_for_you.
- Never name a book, chapter, page, or author. No "Read more" lines. No source attribution. The voice is STRAND science-backed advice.
- Never give a medical diagnosis. Never name diagnosed scalp/skin conditions, alopecia types, hormones, blood markers, medications or life stage in personal_notes — phrase around them ("your scalp data", "what you've logged") if they matter.
- No fear-mongering and no good/bad framing. The flag is purely educational — it just tells the user this ingredient appears in 3+ of their products. Never call an ingredient harmful, bad, problematic, or risky. Never call it ideal, perfect, or "exactly what you need". Stay neutral and explanatory.
- Most cosmetic ingredients sit at fractions of a percent of the formulation — keep impact framing proportionate. Avoid words like "damaging", "stripping", "harsh", "concerning" unless qualifying with concentration context.

PERSONAL_NOTES RULES
- EVERY personal_note must reference at least ONE concrete data point from the user's context (porosity, density, surface texture, length, scalp data, hard-water area, current hairstyle, a named goal/challenge, a low/high-rated product pattern).
- Frame as "for your [data point], this ingredient typically [behaviour]" — explanatory, not prescriptive.
- Never write a personal_note that would apply to any user generically.
- Never tell the user to use or avoid the ingredient. Just explain how it interacts with their measurable traits.

WHAT_IT_MEANS_FOR_YOU RULES
- 1–2 sentences only. Max 45 words. Calm, plain English.
- Personalise to THIS user (porosity, density, scalp, hard water, goals) AND consider the surrounding formulation when provided — e.g. a humectant beside a strong occlusive behaves very differently than alone, a sulphate buffered by a mild co-surfactant is gentler.
- Acknowledge concentration: most actives sit at <1–2%, so the practical effect is usually modest.
- Lead with the practical takeaway for their hair, not a warning.`;
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
    aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
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
      !Array.isArray(args?.benefits) ||
      !Array.isArray(args?.personal_notes)
    ) {
      throw new Error("invalid tool args shape");
    }
    parsed = {
      what_it_is: String(args.what_it_is).trim(),
      benefits: args.benefits.map((s: unknown) => String(s).trim()).filter(Boolean),
      personal_notes: args.personal_notes
        .map((s: unknown) => String(s).trim())
        .filter(Boolean),
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
