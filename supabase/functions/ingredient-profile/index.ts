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
        "3–5 plain-English sentences (max 110 words) giving a serious science-based explanation of what this ingredient actually IS at a molecular / formulation level. Name the cosmetic-chemistry family (humectant, emollient, occlusive, anionic/non-ionic/amphoteric surfactant, cationic conditioner, hydrolysed protein, silicone class, fatty alcohol, chelator, preservative, pH adjuster, etc.). Explain how it is typically sourced or manufactured if a shopper would find that surprising (e.g. 'derived from coconut despite the harsh-sounding name', 'a synthetic polymer not found in nature', 'a fermentation by-product'). Mention the typical use level in finished products (e.g. '0.1–1%', '5–15%') so the user understands real-world dose. No marketing language, no good/bad framing.",
    },
    deep_dive: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" },
      description:
        "3–5 short bullets (each ≤30 words) surfacing things a typical consumer would NOT know from the label or marketing. Each bullet must teach something genuinely non-obvious — e.g. how the molecule actually interacts with the hair shaft, why ingredient order on the INCI list matters here, a common myth vs reality, why it sits where it does in the list, what happens at low vs high pH, why two similar-sounding ingredients behave differently, how it interacts with hard water or heat, regulatory context, or how concentration changes its behaviour. Be specific. No filler. No 'it is good for hair'.",
    },
    benefits: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
      description:
        "2–4 short bullets (each ≤22 words) on what this ingredient practically does in a hair formula. Lead with the scientific mechanism (e.g. 'binds water from the air via hydroxyl groups', 'lays down a positively-charged film that smooths the negatively-charged cuticle'). Never claim products 'add', 'restore', 'replenish' or 'deliver' moisture — only seal/lock/retain it.",
    },
    personal_notes: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
      description:
        "2–4 short bullets (each ≤28 words) explaining how this ingredient is likely to behave for THIS user's hair, anchored in their own data — porosity, density, surface texture, scalp data, hard-water area, current style, named goals or challenges. Cite the specific data point that drives each note (e.g. 'low porosity', 'hard-water area', 'your length-retention goal'). Educational only — never frame as good or bad, never diagnose.",
    },
    what_it_means_for_you: {
      type: "string",
      description:
        "3–5 sentences (max 110 words) of calm, deeply personalised guidance for THIS user's hair, framed as 'what this means for your hair type'. Weigh: (a) this ingredient's typical behaviour and concentration norms, (b) the rest of the formulation it sits in (co-formulants can balance or amplify it — name one or two if useful), (c) the user's own data (porosity, density, scalp, hard water, goals, current style, products they've rated low/high). Give a concrete practical takeaway — e.g. when to use the product, how often, what to pair it with, what to look out for in their own hair. Most cosmetic ingredients sit at fractions of a percent so keep impact framing proportionate. Never alarmist, never good/bad, never prescribe avoidance, never diagnose.",
    },
  },
  required: ["what_it_is", "deep_dive", "benefits", "personal_notes", "what_it_means_for_you"],
} as const;

function buildSystemPrompt(): string {
  return `${STRAND_PERSONA}

TASK
Return a serious, science-led ingredient profile for ONE ingredient via the return_profile tool. Five fields: what_it_is, deep_dive, benefits, personal_notes, what_it_means_for_you. The audience is a curious consumer who wants to actually UNDERSTAND what's in their products — not be sold to and not be scared. Surface the things a shopper would never learn from the label or brand copy.

VOICE
- Plain English, but never dumbed down. Use the proper cosmetic-chemistry term once, then explain it in everyday words.
- Concrete, specific, slightly nerdy. Prefer numbers, percentages, mechanisms and analogies over vague adjectives.
- Calm and neutral. You are explaining, not warning and not selling.

LANGUAGE RULES — NON-NEGOTIABLE
- Moisture comes from water. Products NEVER add, restore, replenish, deliver or infuse moisture. They seal it in, lock it in, slow water loss, or help retention.
- Never name a book, chapter, page, or author. No "Read more" lines. No source attribution. The voice is STRAND science-backed advice.
- Never give a medical diagnosis. Never name diagnosed scalp/skin conditions, alopecia types, hormones, blood markers, medications or life stage in personal_notes or what_it_means_for_you — phrase around them ("your scalp data", "what you've logged").
- No fear-mongering and no good/bad framing. Never call an ingredient harmful, bad, problematic, risky, ideal, perfect, or "exactly what you need". Stay neutral and explanatory.
- Most cosmetic ingredients sit at fractions of a percent of the formulation — keep impact framing proportionate. Avoid words like "damaging", "stripping", "harsh", "concerning" unless qualifying with concentration context.

DEEP_DIVE RULES
- Each bullet must teach something a normal shopper would NOT already know. If a bullet would fit on the back of any bottle, rewrite it.
- Favour mechanism, manufacturing reality, INCI-position logic, pH/temperature behaviour, myth-busting, hard-water interaction, what concentration changes, common confusion with similarly-named ingredients.
- Be specific to THIS ingredient. No generic hair-care platitudes.

PERSONAL_NOTES RULES
- EVERY personal_note must reference at least ONE concrete data point from the user's context (porosity, density, surface texture, length, scalp data, hard-water area, current hairstyle, a named goal/challenge, a low/high-rated product pattern).
- Frame as "for your [data point], this ingredient typically [behaviour]" — explanatory, not prescriptive.
- Never write a personal_note that would apply to any user generically.

WHAT_IT_MEANS_FOR_YOU RULES
- 3–5 sentences. Max 110 words. Plain English, real depth.
- Personalise to THIS user (porosity, density, scalp, hard water, goals, style) AND consider the surrounding formulation when provided — e.g. a humectant beside a strong occlusive behaves very differently than alone, a sulphate buffered by a mild co-surfactant is gentler. Name a co-formulant or two when it sharpens the guidance.
- Acknowledge concentration honestly: most actives sit at <1–2%, so the practical effect is usually modest.
- End with a concrete, useable takeaway for their hair (timing, frequency, pairing, what to watch for) — never "avoid this".`;
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
      deep_dive: Array.isArray(args.deep_dive)
        ? args.deep_dive.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [],
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
