// Generates a holistic AI analysis of a user's blood-test movement, weighted
// against their hair characteristics, health profile and current hair-care
// goals. Returns a compact structured payload the UI renders as icon cards —
// NOT a wall of text.
//
// Called from BloodHistory.tsx after the latest and previous panels are
// available. Result is React-Query cached client-side; regeneration only
// happens when the panel ids change (or the user forces a refresh).

import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";

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

import { dietConstraintBlock } from "../_shared/diet.ts";
import {
  buildGroundingBlock,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";

const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK
You produce a HOLISTIC analysis of a user's blood-test data set for STRAND, an app for women with textured hair. You are given:
- The latest blood panel + all its markers (with flag: low / high / normal).
- The previous panel (if any) with per-marker deltas.
- The user's hair profile (texture, porosity, density, scalp state), current style, health profile, and active hair-care goals.

Weigh the data together and say, in Paige Lewin's clinical-but-warm voice, what stands out and what to do next.

HARD LIMIT ON BLOOD CLAIMS
You must NOT assert, imply, or hint that any blood marker affects her hair, scalp, growth, shedding, breakage, porosity or styling — no matter how plausible. You may only: state the value against its reference range, name it in plain language, and say that an out-of-range result is worth discussing with her GP. Any blood→hair connection is permitted ONLY when the curated reference block in this request marks that marker as an established hair link, and then you must use that block's wording. Where there is no curated link, focus your items on her hair data (texture, porosity, style, goals, wash-day history) alone.

OUTPUT (JSON via the return_analysis tool):
- focus_areas: 1–3 items ONLY, ranked by importance. The FIRST item must absorb the single most important finding in the panel. Each: { icon (one of: "iron", "thyroid", "vitamin", "protein", "hydration", "scalp", "stress", "hormone", "inflammation", "nutrition"), title (max 4 words, e.g. "Address low B12"), body (ONE sentence, max 25 words — the WHY, reasoned through HER signals: hair profile, goals, health data), action (optional verb phrase, max 8 words — the MOVE) }.
- confidence: "low" | "medium" | "high" — how much the data set supports the analysis (low if fewer than 5 markers).

Do NOT produce a headline, an overview paragraph, key-change lists, chips or comparative tallies. The card renders focus items and their action links only.


RULES
- Never fabricate values or trends.
- Never invent a mechanism (follicles, cell division, the hair shaft, "the body diverts nutrients") — if it is not in the curated reference or the manuscript, do not say it.
- Never recommend weekly protein treatments.
- Never quote or cite chapters/pages verbatim — reason FROM the framework, don't cite it.
- No medical diagnoses. Nutritional and lifestyle guidance only.
- Keep language tight and specific. No filler ("your journey", "queen", "amazing").
- If the user has a stated hair goal (length retention, breakage recovery, scalp health), explicitly tie at least one focus_area to it when the data supports it.
- Prefer insight over exhaustiveness. Two sharp focus_areas beat three vague ones.
- ONE IDEA, ONCE: a focus item's body states the WHY; its action states the MOVE. They must not repeat each other's wording or restate the same sentence.
- Never emit an action that has no focus item, and never more than three focus items.
- NEVER mention injections, infusions, drips, dosing, or any clinical treatment. Supplements are not your call — food first, and anything beyond food goes to her GP.
- NEVER name who is "more at risk" (no groups: vegans, older adults, women of colour, etc.). State the information, not the risk group.
- DIET PATTERN IS BINDING: the DIETARY PATTERN block in the user message overrides every other instruction. Every food named must be permitted for that pattern, plant-based sources are offered as a matter of course, and where a nutrient would normally point to an excluded food you give a permitted source of the same nutrient instead — never a shorter answer, per How To Love Your Afro, Chapter 8: Diet and Nutrition.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // Signed-in members only: this endpoint bills the AI budget and reads clinical context.
  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const body: Payload = await req.json();

    const healthProfile = ((body.context ?? {}) as { healthProfile?: { diet?: string; dietOther?: string } }).healthProfile;
    const userPayload = JSON.stringify({
      dietaryConstraint: dietConstraintBlock(healthProfile?.diet, healthProfile?.dietOther),
      latestPanel: body.latestPanel,
      previousPanel: body.previousPanel,
      deltas: body.deltas ?? [],
      latestResults: body.latestResults ?? [],
      context: body.context ?? {},
    });

    const groundingCtx = (body.context ?? null) as Record<string, unknown> | null;
    const grounding = await buildGroundingBlock({
    surface: "blood-change-analysis",
      fn: "blood-change-analysis",
      functionKind: "blood-ai-summary",
      selectorContext: selectorFromAiContext(groundingCtx),
      forceTopics: ["iron-and-shedding","vits-and-minerals","thyroid","hormones-and-life-stage","diagnosed-conditions"],
      ragQuery: ragQueryFromAiContext(groundingCtx, "blood marker trends shedding regrowth ferritin iron thyroid hormones"),
      ragK: 4,
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
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: `${SYSTEM}${grounding.block}\n\n${buildTipsLevelBlock(((body.context as Record<string, unknown> | undefined)?.tipsLevel))}` },
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
                  required: ["focus_areas", "confidence"],
                  properties: {
                    confidence: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                    },
                    focus_areas: {
                      type: "array",
                      maxItems: 3,
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
        analysis: await sanitiseAndLog(analysis, "blood-change-analysis", {
                context: body.context,
          grounding: grounding.block,
        }),
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
