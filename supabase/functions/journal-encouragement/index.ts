// Generates a short, personalised encouragement banner for the Hair Journal.
//
// The client computes REAL signals from Supabase (saved entries, wash days,
// active goals, last activity, lifecycle stage) and we ask Lovable AI to write
// a warm, data-aware headline + subline. Nothing is hardcoded — every banner
// must reference the actual numbers passed in.
//
// Rules enforced via the system prompt:
// - Reference the real signals (no invented stats).
// - No medical or growth claims.
// - Two lines, tight word counts, modern voice.

import { sanitiseChapterCitationsDeep } from "../_shared/book-chapters.ts";

import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  daysSinceSignup: number;
  entryCount: number;
  daysSinceLastEntry: number | null;
  washCount: number;
  daysSinceLastWash: number | null;
  activeGoalCount: number;
  recentGoalTitle: string | null;
  daysSinceGoalUpdate: number | null;
  daysSinceLastAppointment: number | null;
  lifecycleStage: string;
  engagementState: string;
  milestoneLabel?: string;
}

const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

const systemPrompt = `${STRAND_PERSONA}

TASK
You write short encouragement banners for STRAND, a textured-hair tracking app, in your warm science-backed voice.

You will receive a JSON object with REAL live signals about this specific user. Use the actual numbers — never invent stats, dates, or achievements.

Output:
- "headline": max 7 words. May start with ONE relevant emoji. At most one exclamation mark.
- "subline": max 16 words. No emoji. No exclamation marks. Do NOT include the chapter reference line in the banner — banners are too short for it.

Voice rules:
- Confident, modern, Black-British-friendly. No clichés ("queen", "slay", "journey", "you got this", "growth journey").
- Reference at least one concrete signal from the data (entry count, wash count, days since last activity, goal title, or lifecycle stage).
- Never claim medical results, hair growth, length retention, or scientific outcomes.
- If engagementState is "comeback" or "dormant" → warm welcome-back energy referencing how long it's been.
- If engagementState is "active_streak" → celebrate the consistency with the actual count.
- If engagementState is "no_data" → invite them to log their first wash or entry, no pressure.
- If a recentGoalTitle is present and daysSinceGoalUpdate <= 14, you may reference the goal by name.
- Match the lifecycleStage tone: brand_new = welcoming, first_week = orienting, first_month = building habit, settling_in = pattern-spotting, established = archive value, long_term = milestone pride.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body: RequestBody = await req.json();

    const userPayload = JSON.stringify(body);

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
                name: "return_banner",
                description:
                  "Return the encouragement banner copy grounded in the live signals.",
                parameters: {
                  type: "object",
                  properties: {
                    headline: { type: "string" },
                    subline: { type: "string" },
                  },
                  required: ["headline", "subline"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_banner" },
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
          JSON.stringify({ error: "AI credits exhausted." }),
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
        JSON.stringify(aiJson).slice(0, 400),
      );
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let banner: { headline: string; subline: string };
    try {
      banner = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad JSON from tool call", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ banner: sanitiseChapterCitationsDeep(banner) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("journal-encouragement error", e);
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
