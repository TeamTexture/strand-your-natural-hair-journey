// Generates a short, personalised encouragement banner for the Hair Journal.
// The client computes real signals (days since signup, entry count, days since last entry,
// and the most relevant milestone) and we ask Lovable AI to write a warm headline + subline.
// No medical claims. Two-line max.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  daysSinceSignup: number;
  entryCount: number;
  daysSinceLastEntry: number | null; // null when no entries yet
  milestone:
    | "first_week"
    | "month_1"
    | "month_3"
    | "month_6"
    | "month_12"
    | "year_plus"
    | "first_entry_pending"
    | "streak"
    | "comeback"
    | "keep_going";
  heritage?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body: RequestBody = await req.json();

    const systemPrompt = `You write short, warm encouragement banners for a textured-hair journal app called STRAND.
Rules:
- Two fields: "headline" (max 7 words, may include ONE relevant emoji at the start) and "subline" (max 14 words, no emoji).
- Reference the actual milestone given. Never invent dates or stats.
- Never claim medical or growth results. Focus on consistency, self-care, and progress tracking.
- Voice: confident, modern, Black-British-friendly, no clichés ("queen", "slay", "journey" — avoid).
- No exclamation marks in subline. At most one in headline.`;

    const userPayload = JSON.stringify(body);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              description: "Return the encouragement banner copy.",
              parameters: {
                type: "object",
                properties: {
                  headline: { type: "string" },
                  subline: { type: "string" },
                },
                required: ["headline", "subline"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_banner" } },
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
          JSON.stringify({ error: "AI credits exhausted." }),
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
      console.error("No tool call in AI response", JSON.stringify(aiJson).slice(0, 400));
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

    return new Response(JSON.stringify({ banner }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("journal-encouragement error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
