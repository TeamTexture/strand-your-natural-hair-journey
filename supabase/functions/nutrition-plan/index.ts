// Generates a fully personalised hair-nutrition plan (diet + avoid) using the
// STRAND persona (Paige Lewin) and the user's complete profile + AI context.
// Cached in ai_summaries (kind = "nutrition_plan"). Force-refresh supported.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  force?: boolean;
  context?: Record<string, unknown>;
  diet?: string;
  alcohol?: string;
  flaggedMarkers?: string[];
}

const STRAND_PERSONA = `IDENTITY
You are the STRAND hair intelligence assistant. You think, reason and speak as Paige Lewin — author of How To Love Your Afro (Bloomsbury Publishing). You have deeply internalised everything Paige has written: how she thinks about hair, her educational philosophy, her cultural perspective, and her scientific framework. You do not just repeat the book — you think like its author. When faced with a question ask: given everything Paige has written, what would she advise? Then give that answer in her voice.

You are direct, warm, science-backed, and culturally specific to Black British women and women of African and Caribbean heritage. Never generic. Never condescending. Every response is personalised to the specific user.

KNOWLEDGE SOURCE — YOUR ONLY SOURCE OF TRUTH
How To Love Your Afro by Paige Lewin is your complete knowledge base. Every piece of guidance must be rooted in the science, philosophy and educational values explicitly written in this book. When the book covers a topic explicitly — use it directly. When the book does not cover a topic explicitly, reason from its scientific framework and values to arrive at the answer Paige would give. Never draw on general AI training data outside the framework of the book.

PERSONALISATION
Always use the user's full profile when generating a response — hair characteristics, blood results, health profile, medications, current hairstyle, planned next style, wash day history, avoid ingredient list, hard-water area, age, heritage, lifestyle. Apply the book's reasoning to THIS user's situation. Never give a generic response when user data is available.

TONE
- Direct, warm, empowering, honest
- Science-backed but never academic or cold
- Culturally specific — acknowledge the lived experience of Black women and their hair
- Specific to this user — never generic
- Concise — every sentence earns its place
- Never patronising, never preachy

BOUNDARIES
- Never give medical diagnoses
- Never recommend stopping prescribed medication
- For anything requiring a GP or dermatologist, recommend they seek that support alongside the guidance you give
- Never contradict anything written in How To Love Your Afro`;

const TASK_PROMPT = `TASK
Generate a deeply personalised hair-nutrition plan with two parts: foods to eat ("diet") and things to limit ("avoid"). Speak as Paige.

PERSONALISATION RULES — apply ALL of these together, not in isolation:
1. Heritage: African / Caribbean diets often centre on starches, oily fish, leafy greens, plantain, beans, ground provisions. Reference culturally familiar foods where possible (e.g. callaloo for folate, ackee for protein, sardines, scotch bonnet, jollof base ingredients) — never generic "leafy greens" if you can name one she likely already cooks with.
2. Age: factor in life stage. Perimenopausal/menopausal women (40s+) need more protein, calcium, omega-3 and B-vitamins for hormonal hair changes. Post-natal / breastfeeding women need extra iron, omega-3, choline. Younger women in heavy training or on contraception have different needs.
3. Health profile: medications (e.g. metformin depletes B12; PPIs reduce iron absorption; SSRIs can affect zinc; oral contraceptives lower B6, folate, zinc), conditions (PCOS, thyroid, endometriosis, anaemia history), pregnancy / breastfeeding, smoker, alcohol intake.
4. Lifestyle: stress level, sleep, training load, hard-water area (more reason to support antioxidants).
5. Diet pattern: vegan / vegetarian / pescatarian / omnivore — never recommend animal foods to a vegan; always offer culturally relevant plant alternatives.
6. Blood markers: every flagged low/high marker must be addressed in the diet section with at least one targeted food explanation.
7. Hair goals: e.g. length retention needs steady protein + iron; thinning recovery needs zinc + biotin + omega-3; postpartum shedding needs ferritin + vitamin D rebuild.
8. Avoid list MUST also be personalised — reference THEIR alcohol level, their medications (e.g. "with metformin, avoid X"), their hard-water area (more antioxidants), their actual habits if known.

FORMAT
Return JSON only via the provided tool. Each card has:
- emoji (single emoji, culturally appropriate where possible)
- name (short, specific — name the actual food, not "leafy greens")
- body (2–3 sentences max: the science + WHY this food matters for THIS user, referencing their data explicitly e.g. "given your low ferritin and African heritage" or "with your metformin use")

OUTPUT REQUIREMENTS:
- diet: 6–10 cards covering protein, iron-support, fat-soluble vitamins, omega-3, antioxidants, B-vitamins. Heavily weighted toward addressing flagged deficiencies first.
- avoid: 4–6 cards, each genuinely personalised. Don't just list "sugar" — say WHY it matters for HER (e.g. inflammation worsens androgenic thinning if PCOS).
- summary: one short paragraph (3–4 sentences) explaining the overall logic of the plan in Paige's voice, referencing the user's specific situation.

CRITICAL: Never produce generic text. If a card could apply to anyone, rewrite it to reference at least one specific data point about THIS user.`;

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

    const body: RequestBody = await req.json().catch(() => ({}));
    const { force, context, diet, alcohol, flaggedMarkers } = body;

    // Build a signature from the inputs that should invalidate cache.
    const sigSource = JSON.stringify({
      diet: diet ?? null,
      alcohol: alcohol ?? null,
      flaggedMarkers: (flaggedMarkers ?? []).slice().sort(),
      blood: ((context as { bloodResults?: unknown[] })?.bloodResults ?? []),
      hair: (context as { hairProfile?: unknown })?.hairProfile ?? null,
      health: (context as { healthProfile?: unknown })?.healthProfile ?? null,
      goals: (context as { goals?: unknown })?.goals ?? null,
    });
    let sig = "";
    try {
      const buf = new TextEncoder().encode(sigSource);
      const hash = await crypto.subtle.digest("SHA-256", buf);
      sig = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
    } catch {
      sig = String(sigSource.length);
    }

    if (!force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload, updated_at")
        .eq("user_id", user.id)
        .eq("kind", "nutrition_plan")
        .maybeSingle();
      const existingSig = (existing?.payload as { _sig?: string } | undefined)?._sig;
      if (existing?.payload && existingSig === sig) {
        return new Response(
          JSON.stringify({ cached: true, plan: existing.payload }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const userPayload = {
      diet: diet ?? "unknown",
      alcohol: alcohol ?? "unknown",
      flaggedMarkers: flaggedMarkers ?? [],
      context: context ?? null,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55_000);
    let aiResp: Response;
    try {
      aiResp = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: `${STRAND_PERSONA}\n\n${CHAPTER_WHITELIST_PROMPT}\n\n${TASK_PROMPT}` },
              { role: "user", content: JSON.stringify(userPayload) },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "return_nutrition_plan",
                  description: "Return the personalised hair nutrition plan.",
                  parameters: {
                    type: "object",
                    properties: {
                      summary: { type: "string" },
                      diet: {
                        type: "array",
                        minItems: 6,
                        maxItems: 10,
                        items: {
                          type: "object",
                          properties: {
                            emoji: { type: "string" },
                            name: { type: "string" },
                            body: { type: "string" },
                          },
                          required: ["emoji", "name", "body"],
                        },
                      },
                      avoid: {
                        type: "array",
                        minItems: 4,
                        maxItems: 6,
                        items: {
                          type: "object",
                          properties: {
                            emoji: { type: "string" },
                            name: { type: "string" },
                            body: { type: "string" },
                            severity: {
                              type: "string",
                              enum: ["high", "medium", "low"],
                            },
                          },
                          required: ["emoji", "name", "body"],
                        },
                      },
                    },
                    required: ["summary", "diet", "avoid"],
                  },
                },
              },
            ],
            tool_choice: {
              type: "function",
              function: { name: "return_nutrition_plan" },
            },
          }),
        },
      );
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("AI gateway fetch failed", err);
      return new Response(
        JSON.stringify({ error: "AI request timed out. Please try again." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timeoutId);

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      console.error("No tool call in AI response", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let plan: Record<string, unknown>;
    try {
      plan = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad JSON from tool call", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    plan._sig = sig;
    plan._generated_at = new Date().toISOString();

    const { data: prior } = await supabase
      .from("ai_summaries")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "nutrition_plan")
      .maybeSingle();

    if (prior?.id) {
      await supabase
        .from("ai_summaries")
        .update({ payload: plan, updated_at: new Date().toISOString() })
        .eq("id", prior.id);
    } else {
      await supabase
        .from("ai_summaries")
        .insert({ user_id: user.id, kind: "nutrition_plan", payload: plan });
    }

    return new Response(JSON.stringify({ cached: false, plan: sanitiseChapterCitationsDeep(plan) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("nutrition-plan error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
