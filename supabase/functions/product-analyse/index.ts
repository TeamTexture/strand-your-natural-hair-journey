// Analyses a product image with Lovable AI Gateway and returns structured data.
// The caller passes either a base64 data URL (preferred — works for any
// browser-supported image including iPhone HEIC re-encoded to JPEG) or a
// signed storage URL. Personalised flags / summary / use-cases are produced
// from the user-context payload.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface Body {
  image_url?: string; // signed URL OR data URL
  context?: Record<string, unknown>;
}

const SYSTEM = `You are a haircare product ingredient expert analysing a single product photo.

ABSOLUTE RULES
1. READ the product directly from the image. The brand name and product title are usually the most prominent text on the front of the bottle/box. NEVER invent a name — if you can't read it confidently, set product_name and brand to the closest readable text and set "ai_summary" to start with "Couldn't fully read the label —".
2. If you can see an ingredient list (small print, often labelled "Ingredients" or "INCI"), transcribe ALL of it into "ingredients" (lowercase, comma-separated source split into array). If only some ingredients are visible, return what you see — do not pad.
3. Personalise everything to the user's profile passed in context: hairProfile (porosity, texture, density, scalp), location (hard water?), bloodResults, healthProfile (medications, conditions), history.avoid_ingredients, history.favourite_ingredients, history.low_rated_products and history.high_rated_products.
4. RED/GREEN FLAG LOGIC for key_ingredients[].flag:
   - "avoid" (red) if the ingredient appears in history.avoid_ingredients, OR appears in any history.low_rated_products[].ingredients, OR is contraindicated by the user's hair/health profile (e.g. drying alcohols on high-porosity hair, sulphates with hard water, silicones in a curly-girl context if their profile suggests it).
   - "good" (green) if the ingredient appears in history.favourite_ingredients OR in history.high_rated_products[].ingredients OR is well-matched to their porosity/texture/scalp.
   - "warn" (amber) for neutral-but-noteworthy.
5. match_score (0–100): lower it sharply for any "avoid" flags; raise it for "good" flags; consider category fit and any blood-result deficiencies.
6. ai_summary: 2 short sentences MAX, second-person, citing ONE specific reason from THIS user's context (e.g. "Great match for your high-porosity hair." or "Contains sulphates — risky in your hard-water area.").
7. use_cases: 2–4 concrete tips for how THIS user should use the product (frequency, layering with their shelf, what to pair it with, what to avoid).
8. Output STRICT JSON only. No prose, no code fences.

SCHEMA
{
  "product_name": string,
  "brand": string,
  "category": "shampoo"|"conditioner"|"treatment"|"styler"|"oil"|"mask"|"leave-in"|"other",
  "ingredients": string[],
  "key_ingredients": [{"name": string, "benefit": string, "flag": "good"|"warn"|"avoid", "reason": string}],
  "match_score": number,
  "ai_summary": string,
  "use_cases": string[],
  "tips": string[]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { image_url, context } = (await req.json()) as Body;
    if (!image_url) {
      return new Response(JSON.stringify({ error: "image_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMsg = `Analyse this product photo. Read the brand and product title directly from the label.

User context (use to compute flags, match_score, ai_summary, and use_cases):
${JSON.stringify(context ?? {}, null, 2)}

Return strict JSON matching the schema in your system prompt.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: userMsg },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      if (aiResp.status === 429)
        return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (aiResp.status === 402)
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      // Surface unsupported-format errors clearly to the client.
      const friendly = /[Uu]nsupported image format/.test(t)
        ? "This image format isn't supported. Please retake the photo or upload a JPEG/PNG screenshot."
        : "AI request failed";
      return new Response(JSON.stringify({ error: friendly }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await aiResp.json();
    const text: string = j.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("product-analyse failed", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
