// Personalised explanation for why this specific user might benefit from a
// heat treatment during conditioning. Pulls from the AiContext built on the
// client (hair profile, goals, challenges, recent wash signals) and returns a
// short, plain-English rationale + 2-3 specific bullets. No generic advice.
import { corsHeaders } from "../_shared/cors.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";

interface Body {
  context?: Record<string, unknown> | null;
}

const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

const SYSTEM = `${STRAND_PERSONA}

TASK
The user is logging a wash day and just said they did NOT use a heat treatment while conditioning. Explain — grounded ONLY in the data provided — why a heat treatment (warm cap, steamer, hooded dryer over a deep conditioner) could help THEM specifically.

Rules:
- Be concrete. Reference their actual hair type/porosity/density, current style, goals, challenges, recent wash notes, or low blood markers when relevant.
- Never invent data. If a field is missing, don't mention it.
- 1 short headline (max 9 words) and 2-3 bullets (max ~16 words each).
- Never name any source manuscript, author, chapter or page. Speak the guidance directly in your own voice.
- Output ONLY JSON: { "headline": string, "reasons": string[] }`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const body = (await req.json().catch(() => ({}))) as Body;
    const context = body.context ?? {};

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Here is the user's data context. Ground the rationale in it.\n\n${JSON.stringify(context)}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "credits" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI gateway ${res.status}: ${text}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { headline?: string; reasons?: string[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { headline: "Heat treatments can help", reasons: [] };
    }

    return new Response(
      JSON.stringify(
        sanitiseChapterCitationsDeep({
          headline: parsed.headline ?? "Heat treatments can help your hair drink in moisture",
          reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("heat-treatment-rationale error", err);
    return new Response(
      JSON.stringify({
        headline: "Heat could help your conditioner work harder",
        reasons: [
          "Gentle heat lifts the cuticle so conditioning ingredients absorb deeper.",
          "Especially useful when you're chasing length retention or fighting dryness.",
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
