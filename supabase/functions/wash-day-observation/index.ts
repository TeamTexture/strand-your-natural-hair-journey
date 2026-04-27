// Generates a 2-3 sentence personalised observation about the user's wash day.
// Uses Lovable AI Gateway with tool calling for structured output.
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
  steps?: {
    prePoo?: boolean;
    cleanse?: boolean;
    condition?: boolean;
    treatment?: boolean;
    style?: boolean;
    treatmentType?: string[];
    products?: string[];
  };
  results?: {
    scalp?: string[];
    breakage?: string[];
    style?: string[];
    duration?: string[];
    stress?: string[];
  };
  hairFeelNote?: string;
  hairProfile?: Record<string, unknown>;
  healthProfile?: Record<string, unknown>;
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

    // Pull blood + meds for richer context
    const { data: bloodRows } = await supabase
      .from("blood_results")
      .select("marker, value, unit, status")
      .eq("user_id", user.id);
    const { data: medRows } = await supabase
      .from("user_medications")
      .select("name, category")
      .eq("user_id", user.id);

    const userPayload = {
      ...body,
      bloodResults: bloodRows ?? [],
      medications: medRows ?? [],
      // Live AI context provided by the client (see src/lib/aiContext.ts).
      context: body.context ?? null,
    };

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

${CHAPTER_WHITELIST_PROMPT}

TASK
Given a single wash day log + the user's profile, write ONE personalised observation as Paige (2-3 sentences max).
- Reference SPECIFIC choices the user made (a product, scalp feel, breakage level, hair feel note) — not generic advice.
- Tie at least one observation back to the user's hair profile (porosity, scalp condition, diagnosed conditions) or a flagged blood marker / medication when relevant.
- Encouraging, never preachy. Plain English. No medical advice.
- If the observation is rooted in a specific chapter of How To Love Your Afro, append the "Read more — …" reference line at the end of the observation. Use ONLY chapters from the authoritative list above. If it doesn't map to a listed chapter, omit the reference entirely.
- Return JSON only via the provided tool.`;

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
                name: "return_observation",
                description: "Return the wash-day observation.",
                parameters: {
                  type: "object",
                  properties: {
                    observation: {
                      type: "string",
                      description: "2-3 sentence personalised note.",
                    },
                  },
                  required: ["observation"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_observation" },
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
          JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }),
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
      console.error("No tool call in AI response", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { observation?: string };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad JSON from tool call", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify(sanitiseChapterCitationsDeep({ observation: parsed.observation ?? "" })),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("wash-day-observation error", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
