// Generates 6 personalised meal ideas for the user's nutrition plan tab.
// Uses the same full-context payload as nutrition-plan so recipes are
// tailored to blood markers, life stage, diet pattern, medications, hair
// goals AND cultural background. Cuisine framing may reference the user's
// heritage (they've explicitly asked for it here) but never in a way that
// prescribes food *because* of it — heritage is a flavour lens, nutrients
// remain the reason.

import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  context?: Record<string, unknown>;
  diet?: string;
  dietOther?: string;
  alcohol?: string;
  flaggedMarkers?: string[];
  /** Meal names already shown or saved — the model must not repeat them. */
  exclude?: string[];
  /** Meals already saved to her list — permanently excluded until deleted. */
  savedMeals?: string[];
}

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
import { gatewayFetch } from "../_shared/ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "meal-ideas", stage: 2 } as const;


const systemPrompt = `${STRAND_PERSONA_WITH_RULES}

TASK
You write 6 personalised, easy-to-cook meal ideas for a textured-hair-tracking app. Each meal must be:
- Directly aligned with this user's flagged blood markers, life stage, medications, dietary pattern and hair goals. The DIETARY PATTERN block in the user message is binding and overrides everything else: every ingredient in every meal must be permitted for it. Substitute, never subtract — if a meal would normally rely on an excluded food, build the same nutrient from a permitted one, and still return six full meals.
- SIMPLE. Everyday ingredients you'd find in a normal UK supermarket. No obscure specialty items. No sous-vide. No 90-minute recipes.
- Grounded in nutrients — every meal names in plain English WHICH nutrients it delivers, and which of THIS user's recorded markers or goals that nutrient is being chosen for. Naming the nutrient and the marker is the whole job. Do not explain what the nutrient then does inside the hair or the body unless the EVIDENCE below states it (see EVIDENCE DISCIPLINE).
- Culturally aware. Use the user's heritage / cultural background (from context.hairProfile, context.healthProfile, professional notes, location) as a flavour lens where relevant — e.g. jollof-style rice, ackee & callaloo, plantain, Nigerian pepper soup, jerk seasoning, Caribbean rice and peas, Ethiopian lentil stew — mixed with general easy meals. Never say "because you're X ethnicity" — the cuisine is a familiar frame, the nutrient is the reason.
- Written in plain, warm, direct English. No jargon. No "essential for follicular mitosis". Say "helps your follicles build new hair" instead.

STEPS FORMAT
- Return 4-8 numbered steps per meal, each 1 short sentence, imperative voice ("Rinse the rice", "Fry the onions in a splash of oil until soft").
- Never a wall of prose. Never combine multiple actions into one huge step.

INGREDIENTS FORMAT
- Return 5-12 ingredients. Each is "item — quantity" (e.g. "spinach — 2 large handfuls", "smoked mackerel fillets — 2").

FIELDS PER MEAL
- emoji: one food emoji that represents the dish (🍲 🥘 🍛 🐟 🥗 🍳 🍚 🌱 🥭 etc.)
- name: short recipe name (max 5 words). Title-case.
- cuisine: short tag (e.g. "West African", "Caribbean", "British", "Mediterranean", "Plant-based").
- time_minutes: realistic total cook + prep time as an integer.
- summary: ONE sentence, plain English, naming the 1-2 nutrients this meal delivers and WHY they matter to THIS user. Never invent user data.
- targets: array of 1-3 short tags of what the meal supports (e.g. "Ferritin", "Vitamin D", "Scalp barrier", "Postpartum recovery").
- ingredients: array of strings, format above.
- steps: array of strings, format above.

CROSS-MEAL RULES
- Aim for VARIETY across the 6 meals — mix breakfast/lunch/dinner, mix cuisines.
- Every flagged blood marker must be addressed by at least one meal.
- At least ONE meal per response should lean into the user's heritage if their profile suggests one; the rest can be broadly accessible.
- Never repeat a protein or headline ingredient across meals.

PROHIBITED
- No location prescriptions ("because you're in London"). Heritage tags are a flavour lens only.
- No chapter citations, no "Read more", no author name-drops.
- No medical claims. No "will regrow your hair". Frame everything as "supports" / "helps".
- No disclaimers at all: never write "not medical advice", "consult your doctor", or "check with your GP". The app renders one static disclaimer on this screen.

Return the meals via the return_meal_ideas tool. JSON only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Paid AI generation — signed-in members only.
  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body: RequestBody = await req.json().catch(() => ({}));

    // Allergies and intolerances: hard pre-generation filter, decrypted in
    // memory. Post-generation every meal is scanned again below.
    const sens = await loadSensitivities(auth.supabase, auth.user.id, "dietary");
    const sensitivityBlock = sensitivityConstraintBlock(sens, "dietary");

    const userPayload = `${dietConstraintBlock(body.diet, body.dietOther)}${sensitivityBlock}

USER CONTEXT (full profile — bloods, hair, health, goals, style, professional, location, history):
${JSON.stringify(body.context ?? {}, null, 2)}

Diet pattern: ${body.diet ?? "unknown"}
Foods this member avoids, in their own words: ${body.dietOther ?? "not recorded"}
Alcohol pattern: ${body.alcohol ?? "unknown"}
Flagged blood markers to prioritise: ${JSON.stringify(body.flaggedMarkers ?? [])}
ALREADY SAVED TO HER MEAL LIST — these are permanently off the menu. Never
return any of them, and never return a near-identical variant of the same dish
(same dish reworded, translated, or with one ingredient swapped):
${JSON.stringify((body.savedMeals ?? []).slice(0, 120))}
Also already seen in a previous batch — do not repeat these either:
${JSON.stringify((body.exclude ?? []).slice(0, 60))}
Matching is case- and spacing-insensitive: treat "Nigerian liver pepper stew"
and "Nigerian Liver Pepper Stew" as the same meal. If the exclusions rule out
your first choices, invent genuinely different dishes — different core
ingredient, different cooking method, different cuisine. Never pad the list by
rewording an excluded dish.
Variation token (ignore its meaning, use it only to make this batch different from the last): ${crypto.randomUUID()}

Return 6 meal ideas via the return_meal_ideas tool. JSON only.`;

    const groundingCtx = (body.context ?? null) as Record<string, unknown> | null;
    const grounding = await buildGroundingBlock({
    surface: "meal-ideas",
      fn: "meal-ideas",
      functionKind: "nutrition-plan",
      selectorContext: selectorFromAiContext(groundingCtx),
      forceTopics: ["iron-and-shedding","vits-and-minerals","hormones-and-life-stage","thyroid"],
      ragQuery: ragQueryFromAiContext(groundingCtx, "nutrition food iron ferritin vitamins minerals hair growth shedding"),
      ragK: 4,
    });

    const aiResp = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          // Regeneration must produce a visibly different batch each time.
          temperature: 1.1,
          messages: [
            { role: "system", content: `${systemPrompt}${grounding.block}\n\n${buildTipsLevelBlock(((body.context as Record<string, unknown> | undefined)?.tipsLevel))}` },
            { role: "user", content: userPayload },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_meal_ideas",
                description:
                  "Return 6 personalised, easy-to-cook meal ideas grounded in the user's data.",
                parameters: {
                  type: "object",
                  properties: {
                    meals: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          emoji: { type: "string" },
                          name: { type: "string" },
                          cuisine: { type: "string" },
                          time_minutes: { type: "number" },
                          summary: { type: "string" },
                          targets: {
                            type: "array",
                            items: { type: "string" },
                          },
                          ingredients: {
                            type: "array",
                            items: { type: "string" },
                          },
                          steps: {
                            type: "array",
                            items: { type: "string" },
                          },
                        },
                        required: [
                          "emoji",
                          "name",
                          "cuisine",
                          "time_minutes",
                          "summary",
                          "targets",
                          "ingredients",
                          "steps",
                        ],
                      },
                    },
                  },
                  required: ["meals"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_meal_ideas" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiResp.text();
      console.error("meal-ideas gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call from meal-ideas", JSON.stringify(aiJson).slice(0, 400));
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { meals: unknown[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad JSON from meal-ideas tool call", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitised = await sanitiseAndLog(parsed, "meal-ideas") as { meals?: unknown[] };

    // The fidelity filter can strip a meal's summary sentence. A blank summary
    // renders as an empty card, so fall back to a plain factual line built from
    // the meal's own target tags (no new claim is introduced).
    if (Array.isArray(sanitised?.meals)) {
      for (const m of sanitised.meals as Record<string, unknown>[]) {
        const summary = typeof m.summary === "string" ? m.summary.trim() : "";
        if (summary) continue;
        const targets = Array.isArray(m.targets)
          ? (m.targets as unknown[]).map((t) => String(t).trim()).filter(Boolean)
          : [];
        m.summary = targets.length
          ? `Chosen for ${targets.join(", ").toLowerCase()}.`
          : "Built around everyday ingredients that suit your recorded profile.";
      }
    }

    // Deterministic post-generation enforcement. Any meal that mentions a hard
    // exclusion — under any alias — is dropped rather than shown. The prompt is
    // a filter, not a guarantee.
    if (sens.avoid.length > 0 && Array.isArray(sanitised?.meals)) {
      const before = sanitised.meals.length;
      sanitised.meals = (sanitised.meals as Record<string, unknown>[]).filter((m) => {
        const strings = [
          String(m.name ?? ""),
          String(m.summary ?? ""),
          ...(Array.isArray(m.ingredients) ? m.ingredients.map(String) : []),
          ...(Array.isArray(m.steps) ? m.steps.map(String) : []),
          ...(Array.isArray(m.targets) ? m.targets.map(String) : []),
        ];
        return validateAgainstAvoid(strings, sens, "dietary").length === 0;
      });
      if (sanitised.meals.length !== before) {
        console.log("[meal-ideas] dropped meals on sensitivity scan", {
          before,
          after: sanitised.meals.length,
        });
      }
    }

    return new Response(JSON.stringify(sanitised), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meal-ideas error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
