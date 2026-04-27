// Generates a hair-health AI summary from blood results.
// Uses Lovable AI Gateway (google/gemini-2.5-pro) with tool calling for JSON.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { stripModelCitationsDeep } from "../_shared/sanitize-citations.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BloodMarker {
  marker: string;
  value: number | null;
  unit?: string;
  status?: string; // low | normal | high | untested
  category?: string;
}

interface RequestBody {
  bloodResults: BloodMarker[];
  hairProfile?: Record<string, unknown>;
  healthProfile?: Record<string, unknown>;
  heritage?: string[];
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
    const { bloodResults, hairProfile, healthProfile, heritage, force, context } = body;

    // Return cached summary if present and not forced
    if (!force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload, updated_at")
        .eq("user_id", user.id)
        .eq("kind", "blood_summary")
        .maybeSingle();
      if (existing?.payload) {
        return new Response(
          JSON.stringify({ cached: true, summary: existing.payload }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const userPayload = {
      bloodResults: (bloodResults ?? []).filter((b) => b.value != null || b.status),
      hairProfile: hairProfile ?? {},
      healthProfile: healthProfile ?? {},
      heritage: heritage ?? [],
      context: context ?? null,
    };

    const STRAND_PERSONA = `IDENTITY
You are the STRAND hair intelligence assistant. You think, reason and speak as Paige Lewin — author of How To Love Your Afro (Bloomsbury Publishing). You have deeply internalised everything Paige has written: how she thinks about hair, her educational philosophy, her cultural perspective, and her scientific framework. You do not just repeat the book — you think like its author. When faced with a question ask: given everything Paige has written, what would she advise? Then give that answer in her voice.

You are direct, warm, science-backed, and culturally specific to Black British women and women of African and Caribbean heritage. Never generic. Never condescending. Every response is personalised to the specific user.

KNOWLEDGE SOURCE — YOUR ONLY SOURCE OF TRUTH
How To Love Your Afro by Paige Lewin is your complete knowledge base. Every piece of guidance must be rooted in the science, philosophy and educational values explicitly written in this book. When the book covers a topic explicitly — use it directly. When the book does not cover a topic explicitly, reason from its scientific framework and values to arrive at the answer Paige would give. Never draw on general AI training data outside the framework of the book.

CHAPTER AND PAGE REFERENCES
Whenever you give guidance that comes directly from a specific chapter, append it at the end of the user-facing copy in this exact format on its own line:
[CITATIONS DISABLED — server appends real citations only]
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
Analyse these blood test results and return JSON only via the provided tool. Speak as Paige.
Hair-health guidance only. Recommend the user also seek GP support for any medical concern — never refuse to advise.
Be specific and personal — reference the user's actual values, hair type, and heritage where relevant.
Plain English, one-sentence hair impacts.

CRITICAL COVERAGE RULE:
- The "deficiencies" array MUST include EVERY blood marker whose status is "low", "high", or "borderline" — no exceptions.
- This includes secondary iron-panel markers (TIBC, transferrin, transferrin saturation, MCV, MCH), thyroid markers (TSH, T3, T4), hormones, and any minerals/vitamins flagged.
- Never silently skip a flagged marker because it's "less common" or "related to another one already mentioned". Each flagged marker gets its own entry with its own hair_impact sentence.
- The "overall_summary" must explicitly acknowledge the FULL pattern (e.g. "low ferritin AND low TIBC together suggest…"), not just the headline marker.
- If the overall pattern is rooted in a specific chapter of How To Love Your Afro (e.g. nutrition / iron / hair shedding), DO NOT include any chapter, page, or "Read more —" citation in the output. The system appends verified citations server-side.
- "priority_actions" must address the combined picture, not a single deficiency in isolation.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_summary",
              description: "Return the structured hair health summary.",
              parameters: {
                type: "object",
                properties: {
                  deficiencies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        marker: { type: "string" },
                        value: { type: "string" },
                        status: { type: "string", enum: ["low", "high", "borderline"] },
                        hair_impact: { type: "string" },
                        urgency: { type: "string", enum: ["low", "medium", "high"] },
                      },
                      required: ["marker", "status", "hair_impact", "urgency"],
                    },
                  },
                  overall_summary: { type: "string" },
                  priority_actions: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 3,
                    maxItems: 3,
                  },
                },
                required: ["deficiencies", "overall_summary", "priority_actions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_summary" } },
      }),
    });

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

    let summary: unknown;
    try {
      summary = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad JSON from tool call", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip any chapter/page citations the model emitted — citations come
    // from server-side RAG only (see _shared/sanitize-citations.ts).
    summary = stripModelCitationsDeep(summary);

    // Upsert into ai_summaries (one per user per kind)
    const { data: prior } = await supabase
      .from("ai_summaries")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "blood_summary")
      .maybeSingle();

    if (prior?.id) {
      await supabase
        .from("ai_summaries")
        .update({ payload: summary as object, updated_at: new Date().toISOString() })
        .eq("id", prior.id);
    } else {
      await supabase
        .from("ai_summaries")
        .insert({ user_id: user.id, kind: "blood_summary", payload: summary as object });
    }

    return new Response(JSON.stringify({ cached: false, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("blood-ai-summary error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
