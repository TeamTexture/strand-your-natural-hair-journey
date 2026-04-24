// Generates a 2-3 sentence personalised observation about the user's wash day.
// Uses Lovable AI Gateway with tool calling for structured output.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    };

    const systemPrompt = `You are a trichologist + textured-hair specialist.
Given a single wash day log + the user's profile, write ONE personalised observation (2-3 sentences max).
- Reference SPECIFIC choices the user made (a product, scalp feel, breakage level, hair feel note) — not generic advice.
- Tie at least one observation back to the user's hair profile (porosity, scalp condition, diagnosed conditions) or a flagged blood marker / medication when relevant.
- Encouraging, never preachy. Plain English. No medical advice.
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
      JSON.stringify({ observation: parsed.observation ?? "" }),
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
