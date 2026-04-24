// Analyses a product's ingredients against a user's hair + health profile.
// Uses Lovable AI Gateway with tool calling for structured JSON output.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  productKey: string;
  productName: string;
  productBrand: string;
  ingredients?: string[]; // optional — if absent, AI will use typical formulation for the product type
  hairProfile?: Record<string, unknown>;
  healthProfile?: Record<string, unknown>;
  heritage?: string[];
  /** User's active hair goals (length retention, scalp health, frizz, etc.) */
  goals?: Array<Record<string, unknown>>;
  /** Current hairstyle + days in style (twists, locs, wash & go, etc.) */
  currentStyle?: Record<string, unknown> | null;
  /** Free-text challenges captured during onboarding / journal */
  challenges?: string[];
  force?: boolean;
  /** Live AI context — see src/lib/aiContext.ts. */
  context?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const {
      productKey,
      productName,
      productBrand,
      ingredients,
      hairProfile,
      healthProfile,
      heritage,
      goals,
      currentStyle,
      challenges,
      force,
    } = body;

    if (!productKey || !productName) {
      return new Response(JSON.stringify({ error: "Missing product info" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheKind = `ingredient_analysis:${productKey}`;

    // Cache (per user, per product)
    if (!force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload, updated_at")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (existing?.payload) {
        return new Response(
          JSON.stringify({ cached: true, analysis: existing.payload }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Pull blood markers + meds + goals + current style server-side so client
    // doesn't need to assemble the personalisation payload.
    const [bloodRowsRes, medRowsRes, goalRowsRes] = await Promise.all([
      supabase
        .from("blood_results")
        .select("marker, value, unit, status, category")
        .eq("user_id", user.id),
      supabase
        .from("user_medications")
        .select("name, category")
        .eq("user_id", user.id),
      supabase
        .from("user_goals")
        .select("kind, title, target_text, target_value, unit, current_value, target_date, challenge, notes, status")
        .eq("user_id", user.id)
        .neq("status", "complete"),
    ]);
    const bloodRows = bloodRowsRes.data;
    const medRows = medRowsRes.data;
    const dbGoals = goalRowsRes.data ?? [];

    const userPayload = {
      product: { key: productKey, name: productName, brand: productBrand },
      ingredients: ingredients ?? [],
      hairProfile: hairProfile ?? {},
      healthProfile: healthProfile ?? {},
      heritage: heritage ?? [],
      bloodResults: bloodRows ?? [],
      medications: medRows ?? [],
      goals: goals && goals.length ? goals : dbGoals,
      currentStyle: currentStyle ?? null,
      challenges: challenges ?? [],
      context: body.context ?? null,
    };

    const ingredientCount = ingredients?.length ?? 0;
    const STRAND_PERSONA = `IDENTITY
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

    const systemPrompt = `${STRAND_PERSONA}

TASK
You are analysing a hair product's INCI list against this specific user's profile. Return JSON only via the tool, speaking as Paige.

USER INPUTS to weigh: hairProfile (porosity, density, type, scalp condition, length), healthProfile (diagnoses, allergies, medications, blood markers), heritage, goals, challenges, currentStyle.

RULES — STRICT:
1. Flag EVERY ingredient supplied — do NOT skip any (including water, fragrance, colourants, preservatives). If ${ingredientCount} ingredients were provided, return EXACTLY ${ingredientCount} entries in the same order.
2. tone:
   - "good" = ingredient has a documented mechanism that benefits THIS user's measurable traits (e.g. humectant for low-porosity hair in humid climate, emollient for high-porosity ends, anti-fungal for seborrheic dermatitis).
   - "bad" = ingredient has a documented mechanism that conflicts with THIS user's traits (e.g. SLS sulphate on a flagged dry/sensitive scalp, drying short-chain alcohol on high-porosity hair, mineral oil sealing low-porosity hair, allergen the user has flagged).
   - "warn" = neutral / context-dependent / patch-test recommended.
3. body: ONE concise sentence (max 22 words). Lead with the SCIENTIFIC mechanism (what the molecule does chemically), THEN tie to the user's specific data point if relevant. No generic care tips, no usage instructions, no "consider", no "may help your routine".
   GOOD example: "Anionic surfactant — strips sebum and lipids; harsh given your dry scalp diagnosis."
   BAD example: "This is great for your hair! Try using it weekly to keep things hydrated."
4. match_score 0–100: weight bad flags heavily down, good flags up. Consider porosity fit, scalp diagnoses, deficiencies, allergens, goal alignment.
5. summary: 1 sentence (max 25 words) — pure factual fit verdict for THIS user. No advice, no tips. If the verdict is rooted in a specific chapter of How To Love Your Afro, append the "Read more — …" reference line on a new line at the end of the summary.
6. If no ingredients are provided, infer the typical formulation for "${productBrand} ${productName}".
7. Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition. Cite mechanism (surfactant class, humectant, emollient, occlusive, cationic conditioner, chelator, pH adjuster, etc.) where it adds clarity.`;

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
            { role: "user", content: JSON.stringify(userPayload) },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_analysis",
                description: "Return the structured ingredient analysis.",
                parameters: {
                  type: "object",
                  properties: {
                    match_score: {
                      type: "integer",
                      minimum: 0,
                      maximum: 100,
                    },
                    summary: { type: "string" },
                    ingredients: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          tone: {
                            type: "string",
                            enum: ["good", "warn", "bad"],
                          },
                          body: { type: "string" },
                        },
                        required: ["name", "tone", "body"],
                      },
                    },
                  },
                  required: ["match_score", "summary", "ingredients"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_analysis" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Add credits to continue.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error(
        "No tool call in AI response",
        JSON.stringify(aiJson).slice(0, 500),
      );
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let analysis: unknown;
    try {
      analysis = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad JSON from tool call", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert into ai_summaries
    const { data: prior } = await supabase
      .from("ai_summaries")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", cacheKind)
      .maybeSingle();

    if (prior?.id) {
      await supabase
        .from("ai_summaries")
        .update({
          payload: analysis as object,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prior.id);
    } else {
      await supabase.from("ai_summaries").insert({
        user_id: user.id,
        kind: cacheKind,
        payload: analysis as object,
      });
    }

    return new Response(
      JSON.stringify({ cached: false, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ingredient-analysis error", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
