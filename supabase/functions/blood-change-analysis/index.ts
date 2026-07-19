// Generates a holistic AI analysis of a user's blood-test movement, weighted
// against their hair characteristics, health profile and current hair-care
// goals. Returns a compact structured payload the UI renders as icon cards —
// NOT a wall of text.
//
// Called from BloodHistory.tsx after the latest and previous panels are
// available. Result is React-Query cached client-side; regeneration only
// happens when the panel ids change (or the user forces a refresh).

import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { VOICE_PRINCIPLES } from "../_shared/voice.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Delta {
  marker: string;
  unit: string | null;
  previous: number | null;
  current: number | null;
  previous_status: string | null;
  current_status: string | null;
}

interface Payload {
  latestPanel: {
    id: string;
    date: string | null;
    label: string | null;
    lab_name: string | null;
    test_type: string | null;
  };
  previousPanel: {
    id: string;
    date: string | null;
  } | null;
  deltas: Delta[];
  /** All results from the latest panel — status flags feed focus areas. */
  latestResults: Array<{
    marker: string;
    value: number | null;
    unit: string | null;
    status: string | null;
    category: string | null;
  }>;
  /** aiContext slice — hair profile, health profile, goals, current style. */
  context?: Record<string, unknown>;
}

const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

${VOICE_PRINCIPLES}

TASK
You produce a HOLISTIC analysis of a user's blood-test data set for STRAND, an app for women with textured hair. You are given:
- The latest blood panel + all its markers (with flag: low / high / normal).
- The previous panel (if any) with per-marker deltas.
- The user's hair profile (texture, porosity, density, scalp state), current style, health profile, and active hair-care goals.

Weigh EVERYTHING together. The goal is not to list numbers — it is to say, in Paige Lewin's clinical-but-warm voice, what this data set means for THIS user's hair and goals right now, and where to focus.

OUTPUT (JSON via the return_analysis tool):
- headline: max 12 words. One clear sentence naming the most important pattern. No emoji.
- overall: 2–3 sentences. Ties blood data to hair characteristics + goals holistically. No lists, no bullets, no chapter/page references.
- key_changes: 0–4 items ranked by hair-relevance (not raw magnitude). Each: { marker, direction ("up"|"down"|"flat"), from, to, unit, insight (one sentence linking to hair or the user's goal), tone ("good"|"warn"|"neutral") }.
    - Include a change ONLY if it is meaningful for hair health or the user's stated goals. If there is no previous panel, return an empty array.
- focus_areas: 2–4 items — the most insightful takeaways from ALL data (latest values + trends + goals + hair profile). Each: { icon (one of: "iron", "thyroid", "vitamin", "protein", "hydration", "scalp", "stress", "hormone", "inflammation", "nutrition"), title (max 4 words), body (one crisp sentence, hair-relevant), action (optional short verb phrase, max 8 words) }.
- confidence: "low" | "medium" | "high" — how much the data set supports the analysis (low if <5 markers or no previous panel).

RULES
- Never fabricate values or trends. If deltas are empty, return key_changes: [].
- Never recommend weekly protein treatments.
- Never quote or cite chapters/pages verbatim — reason FROM the framework, don't cite it.
- No medical diagnoses. Nutritional and lifestyle guidance only.
- Keep language tight and specific. No filler ("your journey", "queen", "amazing").
- If the user has a stated hair goal (length retention, breakage recovery, scalp health), explicitly tie at least one focus_area to it when the data supports it.
- Prefer insight over exhaustiveness. It is better to name 2 sharp focus_areas than 4 vague ones.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const body: Payload = await req.json();

    const userPayload = JSON.stringify({
      latestPanel: body.latestPanel,
      previousPanel: body.previousPanel,
      deltas: body.deltas ?? [],
      latestResults: body.latestResults ?? [],
      context: body.context ?? {},
    });

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
            { role: "system", content: SYSTEM },
            { role: "user", content: userPayload },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_analysis",
                description:
                  "Return the holistic blood-change analysis for the STRAND user.",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "headline",
                    "overall",
                    "key_changes",
                    "focus_areas",
                    "confidence",
                  ],
                  properties: {
                    headline: { type: "string" },
                    overall: { type: "string" },
                    confidence: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                    },
                    key_changes: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: [
                          "marker",
                          "direction",
                          "from",
                          "to",
                          "unit",
                          "insight",
                          "tone",
                        ],
                        properties: {
                          marker: { type: "string" },
                          direction: {
                            type: "string",
                            enum: ["up", "down", "flat"],
                          },
                          from: { type: "number" },
                          to: { type: "number" },
                          unit: { type: "string" },
                          insight: { type: "string" },
                          tone: {
                            type: "string",
                            enum: ["good", "warn", "neutral"],
                          },
                        },
                      },
                    },
                    focus_areas: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["icon", "title", "body"],
                        properties: {
                          icon: {
                            type: "string",
                            enum: [
                              "iron",
                              "thyroid",
                              "vitamin",
                              "protein",
                              "hydration",
                              "scalp",
                              "stress",
                              "hormone",
                              "inflammation",
                              "nutrition",
                            ],
                          },
                          title: { type: "string" },
                          body: { type: "string" },
                          action: { type: "string" },
                        },
                      },
                    },
                  },
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
      if (aiResp.status === 429)
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      if (aiResp.status === 402)
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
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
      console.error("No tool call in AI response", JSON.stringify(aiJson).slice(0, 400));
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad JSON from tool call", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        analysis: await sanitiseAndLog(analysis, "blood-change-analysis"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("blood-change-analysis error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
