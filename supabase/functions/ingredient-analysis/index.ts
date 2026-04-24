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

    // Pull blood markers + meds server-side so client doesn't need to assemble them
    const { data: bloodRows } = await supabase
      .from("blood_results")
      .select("marker, value, unit, status, category")
      .eq("user_id", user.id);
    const { data: medRows } = await supabase
      .from("user_medications")
      .select("name, category")
      .eq("user_id", user.id);

    const userPayload = {
      product: { key: productKey, name: productName, brand: productBrand },
      ingredients: ingredients ?? [],
      hairProfile: hairProfile ?? {},
      healthProfile: healthProfile ?? {},
      heritage: heritage ?? [],
      bloodResults: bloodRows ?? [],
      medications: medRows ?? [],
      context: body.context ?? null,
    };

    const systemPrompt = `You are a cosmetic chemist + trichologist specialising in Afro and textured hair.
Analyse a hair product's ingredients against this specific user's profile and return JSON only via the tool.
- Score the product 0-100 (match) based on porosity, scalp condition, diagnosed conditions, deficiencies, and meds.
- Flag every ingredient as "good" (beneficial for this user), "warn" (caution / patch test) or "bad" (avoid).
- Body of each flag must be ONE sentence, plain English, referencing THIS user's data when relevant
  (e.g. "Excellent for your high porosity hair" or "Conflicts with your dry scalp diagnosis").
- If no ingredients are provided, infer the typical formulation for "${productBrand} ${productName}" and analyse that.
- Hair-health guidance only. No medical advice.`;

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
                      minItems: 3,
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
