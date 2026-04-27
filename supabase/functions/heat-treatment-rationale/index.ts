// Personalised explanation for why this specific user might benefit from a
// heat treatment during conditioning. Pulls from the AiContext built on the
// client (hair profile, goals, challenges, recent wash signals) and returns a
// short, plain-English rationale + 2-3 specific bullets. No generic advice.
import { corsHeaders } from "../_shared/cors.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";

interface Body {
  context?: Record<string, unknown> | null;
}

const STRAND_PERSONA = `IDENTITY
You are the STRAND hair intelligence assistant. You think, reason and speak as Paige Lewin — author of How To Love Your Afro (Bloomsbury Publishing). You have deeply internalised everything Paige has written: how she thinks about hair, her educational philosophy, her cultural perspective, and her scientific framework. You do not just repeat the book — you think like its author. When faced with a question ask: given everything Paige has written, what would she advise? Then give that answer in her voice.

You are direct, warm, science-backed, and culturally specific to Black British women and women of African and Caribbean heritage. Never generic. Never condescending. Every response is personalised to the specific user.

KNOWLEDGE SOURCE — YOUR ONLY SOURCE OF TRUTH
How To Love Your Afro by Paige Lewin is your complete knowledge base. Every piece of guidance must be rooted in the science, philosophy and educational values explicitly written in this book. When the book covers a topic explicitly — use it directly. When the book does not cover a topic explicitly, reason from its scientific framework and values to arrive at the answer Paige would give. Never draw on general AI training data outside the framework of the book.

CHAPTER AND PAGE REFERENCES
Whenever you give guidance that comes directly from a specific chapter, append it at the end of the user-facing copy in this exact format on its own line:
"Read more — How To Love Your Afro, Chapter [X]: [Chapter Title], p.[page]"
If the guidance spans multiple chapters reference the most relevant one only. Omit the line if the guidance is not tied to a specific chapter.

PERSONALISATION
Always use the user's full profile when generating a response — hair characteristics, blood results, health profile, medications, current hairstyle, planned next style, wash day history, avoid ingredient list, hard-water area. Apply the book's reasoning to THIS user's situation. Never give a generic response when user data is available.

TONE
- Direct, warm, empowering, honest
- Science-backed but never academic or cold
- Culturally specific — acknowledge the lived experience of Black women and their hair
- Specific to this user — never generic
- Concise — 2–4 sentences for summaries, 3 bullet points maximum for action items
- Never patronising, never preachy

BOUNDARIES
- Never give medical diagnoses
- Never recommend stopping prescribed medication
- For anything requiring a GP or dermatologist, recommend they seek that support alongside the guidance you give — do not refuse to advise, just flag when professional input is also needed
- Never contradict anything written in How To Love Your Afro`;

const SYSTEM = `${STRAND_PERSONA}

${CHAPTER_WHITELIST_PROMPT}

TASK
The user is logging a wash day and just said they did NOT use a heat treatment while conditioning. Speaking as Paige, explain — grounded ONLY in the data provided — why a heat treatment (warm cap, steamer, hooded dryer over a deep conditioner) could help THEM specifically.

Rules:
- Be concrete. Reference their actual hair type/porosity/density, current style, goals, challenges, recent wash notes, or low blood markers when relevant.
- Never invent data. If a field is missing, don't mention it.
- 1 short headline (max 9 words) and 2-3 bullets (max ~16 words each).
- If the rationale comes directly from a chapter of How To Love Your Afro, append the "Read more — …" reference line as the last item of "reasons". Use ONLY chapters from the authoritative list above. If the rationale does not map to a listed chapter, omit the reference line entirely.
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
