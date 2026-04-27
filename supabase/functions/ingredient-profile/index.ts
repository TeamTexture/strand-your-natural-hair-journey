// ingredient-profile — short, science-backed profile for a single ingredient,
// surfaced inside the dropdown row on the Avoidlist (Green Flag / Red Flag)
// page. Returns three fields:
//   - what_it_is: 1–2 plain-English sentences explaining the ingredient
//   - benefits: 2–4 bullet points on what it does for hair (with mechanism)
//   - personal_notes: 2–4 bullet points anchored in THIS user's own data
//     (porosity, density, scalp condition, hard-water area, low/high-rated
//     products, goals, challenges, current style) explaining why it likely
//     ended up on their Green or Red flag list. NEVER medical advice.
//
// Cached per user in ai_summaries (kind = `ingredient_profile:<flag>:<name>`)
// so re-opening a row is instant. Cache is invalidated when MODEL_VERSION
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

const MODEL = "google/gemini-2.5-flash";
const MODEL_VERSION = "ingredient-profile@v1";

interface RequestBody {
  ingredient: string;
  flag: "fav" | "avoid";
  /** Why the ingredient ended up on the user's list (e.g. "Found in 3 of your
   *  favourited products"). Used as soft framing context. */
  reason?: string;
  /** The full AI context payload built by buildAiContext() on the client. */
  context?: Record<string, unknown>;
  /** Bypass cache and regenerate. */
  force?: boolean;
}

interface ProfilePayload {
  what_it_is: string;
  benefits: string[];
  personal_notes: string[];
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
        "2–4 short bullet points (each ≤25 words) explaining why this ingredient likely landed on the user's GREEN or RED flag list given THEIR data — porosity, density, scalp condition, hard-water area, goals, challenges, current style, low/high-rated products. Cite the specific data point that drives each note (e.g. 'low porosity', 'hard-water area', 'your length-retention goal'). Never give medical advice or name diagnoses.",
    },
  },
  required: ["what_it_is", "benefits", "personal_notes"],
} as const;

function buildSystemPrompt(): string {
  return `${STRAND_PERSONA}

TASK
Return a short ingredient profile for ONE ingredient via the return_profile tool. Three fields only: what_it_is, benefits, personal_notes.

LANGUAGE RULES — NON-NEGOTIABLE
- Moisture comes from water. Products NEVER add, restore, replenish, deliver or infuse moisture. They seal it in, lock it in, slow water loss, or help retention. Use this phrasing in benefits and personal_notes.
- Never name a book, chapter, page, or author. No "Read more" lines. No source attribution. The voice is STRAND science-backed advice.
- Never give a medical diagnosis. Never name diagnosed scalp/skin conditions, alopecia types, hormones, blood markers, medications or life stage in personal_notes — phrase around them ("your scalp data", "what you've logged") if they matter.
- No fear-mongering. Routine cosmetic preservatives, fragrance, colourants and pH adjusters at legal limits are NOT inherently harmful — only flag them as a personal concern if the user's own data (avoid_ingredients, low-rated products, scalp data) warrants it.

PERSONAL_NOTES RULES
- EVERY personal_note must reference at least ONE concrete data point from the user's context (porosity, density, surface texture, length, scalp data, hard-water area, current hairstyle, a named goal/challenge, or a low/high-rated product pattern).
- If the flag is "fav" (Green Flag), explain WHY this ingredient likely keeps showing up in products this user loves — anchor in measurable traits and goals.
- If the flag is "avoid" (Red Flag), explain WHY this ingredient likely keeps appearing in products this user has taken off the shelf — anchor in measurable traits, hard-water status, or low-rated patterns. Frame as "likely reason" not certainty.
- Never write a personal_note that would apply to any user generically.`;
}

function buildUserPrompt(body: RequestBody): string {
  const ctx = body.context ?? {};
  const flagLabel = body.flag === "fav" ? "GREEN FLAG (favourited)" : "RED FLAG (off-shelf)";
  return `INGREDIENT: ${body.ingredient}
LIST: ${flagLabel}
${body.reason ? `WHY IT'S ON THE LIST: ${body.reason}` : ""}

USER CONTEXT (JSON):
${JSON.stringify(ctx, null, 2).slice(0, 12000)}

Generate the profile now via the return_profile tool.`;
}

function cacheKindFor(flag: "fav" | "avoid", ingredient: string): string {
  // ai_summaries.kind is text, no length constraint in the schema. Lower-case
  // the ingredient so casing variants share the cache row.
  return `ingredient_profile:${flag}:${ingredient.toLowerCase().trim()}`;
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
  if (body.flag !== "fav" && body.flag !== "avoid") {
    return json(400, { error: "flag must be 'fav' or 'avoid'" });
  }

  const kind = cacheKindFor(body.flag, body.ingredient);

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
