// Generates a short, personalised tip for a hair goal the user just saved.
//
// Receives the goal (challenge, target, target_date, status) plus the
// caller's buildAiContext() payload (hair, health, blood, history, shelf,
// other goals). Returns { tip: { headline, body, actions[] } } where
// actions are 2-3 concrete next-step strings the user can act on.

import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { VOICE_PRINCIPLES } from "../_shared/voice.ts";
import { sanitiseChapterCitationsDeep } from "../_shared/book-chapters.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const systemPrompt = `${STRAND_PERSONA_WITH_RULES}

${VOICE_PRINCIPLES}

TASK
The user just saved a hair goal in STRAND. Write ONE short, personalised tip that uses their real profile data to tell them what to focus on to actually hit this goal by the target date.

Output:
- "headline": max 9 words. Specific to this goal. No emoji.
- "body": 1-2 sentences (max 36 words). Connect the goal to ONE concrete signal from their profile (porosity, density, current style + duration, water hardness, a blood marker, a low-rated product, a chemical history flag, etc). No medical claims, no growth promises.
- "actions": 2-3 imperative next steps (max 12 words each) that fit into their current routine — e.g. wash-day adjustments, product choices to favour or avoid, professional check-ins. Each action should be doable in the app (wash day, products, journal, appointments).

Rules:
- Reference the actual challenge/target text the user wrote.
- If target_date is present, factor in the time horizon (urgent vs long-term).
- Never invent profile data. If a signal isn't in the payload, don't use it.
- No clichés, no hype words, no "journey" / "queen" / "slay".`;

interface RequestBody {
  goal: {
    challenge: string | null;
    target_text: string | null;
    target_date: string | null;
    status: string | null;
  };
  context: Record<string, unknown>;
}

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
                name: "return_tip",
                description: "Return the personalised goal tip.",
                parameters: {
                  type: "object",
                  properties: {
                    headline: { type: "string" },
                    body: { type: "string" },
                    actions: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 2,
                      maxItems: 3,
                    },
                  },
                  required: ["headline", "body", "actions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_tip" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("goal-tip AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("goal-tip no tool call", JSON.stringify(aiJson).slice(0, 400));
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let tip: { headline: string; body: string; actions: string[] };
    try {
      tip = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("goal-tip bad JSON", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ tip: sanitiseChapterCitationsDeep(tip) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("goal-tip error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
