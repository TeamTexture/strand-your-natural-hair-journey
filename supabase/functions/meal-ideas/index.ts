// Generates 6 personalised meal ideas for the user's nutrition plan tab.
// Uses the same full-context payload as nutrition-plan so recipes are
// tailored to blood markers, life stage, diet pattern, medications, hair
// goals AND cultural background. Cuisine framing may reference the user's
// heritage (they've explicitly asked for it here) but never in a way that
// prescribes food *because* of it — heritage is a flavour lens, nutrients
// remain the reason.

import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { VOICE_PRINCIPLES } from "../_shared/voice.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  context?: Record<string, unknown>;
  diet?: string;
  alcohol?: string;
  flaggedMarkers?: string[];
}

const systemPrompt = `${STRAND_PERSONA_WITH_RULES}

${VOICE_PRINCIPLES}

TASK
You write 6 personalised, easy-to-cook meal ideas for a textured-hair-tracking app. Each meal must be:
- Directly aligned with this user's flagged blood markers, life stage, medications, dietary pattern (respect vegan/vegetarian absolutely — never suggest animal foods to a vegan), and hair goals.
- SIMPLE. Everyday ingredients you'd find in a normal UK supermarket. No obscure specialty items. No sous-vide. No 90-minute recipes.
- Grounded in nutrients — every meal explains in plain English WHICH nutrients it delivers and WHY they matter to this user.
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

Return the meals via the return_meal_ideas tool. JSON only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body: RequestBody = await req.json().catch(() => ({}));

    const userPayload = `USER CONTEXT (full profile — bloods, hair, health, goals, style, professional, location, history):
${JSON.stringify(body.context ?? {}, null, 2)}

Diet pattern: ${body.diet ?? "unknown"}
Alcohol pattern: ${body.alcohol ?? "unknown"}
Flagged blood markers to prioritise: ${JSON.stringify(body.flaggedMarkers ?? [])}

Return 6 meal ideas via the return_meal_ideas tool. JSON only.`;

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
            { role: "system", content: systemPrompt },
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

    const sanitised = await sanitiseAndLog(parsed, "meal-ideas");

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
