// Generates a hair-health AI summary from blood results.
// Uses Lovable AI Gateway (google/gemini-2.5-pro) with tool calling for JSON.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";
import { VOICE_PRINCIPLES } from "../_shared/voice.ts";

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
          JSON.stringify({ cached: true, summary: sanitiseChapterCitationsDeep(existing.payload) }),
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

    const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

    const systemPrompt = `${STRAND_PERSONA}

${VOICE_PRINCIPLES}

TASK
Analyse these blood test results and return JSON only via the provided tool. Speak as Paige.
Hair-health guidance only. Recommend the user also seek GP support for any medical concern — never refuse to advise.

Voice for this task: follow the VOICE PRINCIPLES above. In each hair_impact sentence, lead with the mechanism (what this marker does at the follicle / blood / scalp level, in plain English), then bridge with a connective ("which is why", "so", "this means") into what it means for the user. Talk to "you", not "your hair". Translate any clinical term on first use. The overall_summary reads like a coach explaining the joined-up picture, not a list of values.

CRITICAL COVERAGE RULE:
- The "deficiencies" array MUST include EVERY blood marker whose status is "low", "high", or "borderline" — no exceptions.
- This includes secondary iron-panel markers (TIBC, transferrin, transferrin saturation, MCV, MCH), thyroid markers (TSH, T3, T4), hormones, and any minerals/vitamins flagged.
- Never silently skip a flagged marker because it's "less common" or "related to another one already mentioned". Each flagged marker gets its own entry with its own hair_impact sentence.
- The "overall_summary" must explicitly acknowledge the FULL pattern (e.g. "low ferritin AND low TIBC together suggest…"), not just the headline marker.
- Speak the overall_summary directly in your own science-backed voice. Never name any source manuscript, author, chapter or page.
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

    return new Response(JSON.stringify({ cached: false, summary: sanitiseChapterCitationsDeep(summary) }), {
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
