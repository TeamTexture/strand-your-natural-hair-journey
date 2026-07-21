// Personalised "how to get the most out of this product" guidance for a
// brand-offer product/tool, tailored to the requesting user's full STRAND
// profile. Uses Lovable AI Gateway (Gemini flash) with the locked STRAND
// persona so tone stays consistent across the app.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireAuthedUser } from "../_shared/auth.ts";
import { STRAND_PERSONA } from "../_shared/strand-persona.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

interface Body {
  product: {
    id?: string;
    name: string;
    brand?: string | null;
    description?: string | null;
    kind?: "product" | "tool" | null;
    tool_kind?: string | null;
    external_url?: string | null;
    ingredients?: string[] | null;
    key_features?: string[] | null;
    materials?: string[] | null;
  };
  context: Record<string, unknown> | null;
}

interface GuidancePayload {
  headline: string;
  fit_summary: string;
  how_to_use: string[];
  benefits_for_you: string[];
  cautions: string[];
}

const SYSTEM = `${STRAND_PERSONA}

TASK
The user is looking at a sponsored brand product/tool inside the STRAND app. Explain — in Paige's voice — how THIS specific user can get the most out of THIS specific product, grounded in the STRAND manuscript framework and their real profile data (hair characteristics, current style, goals, wash-day history, health/blood flags, existing products/tools).

RESPONSE SHAPE
Return ONLY valid JSON with this exact shape (no prose, no code fences):
{
  "headline": string (max 90 chars — a single sharp line summarising the fit),
  "fit_summary": string (2-3 sentences — is this a match for this user's hair and goals, and why),
  "how_to_use": string[] (2-4 concrete usage steps tailored to this user's routine, style and goals),
  "benefits_for_you": string[] (2-3 specific benefits THIS user will get, tied to their data),
  "cautions": string[] (0-2 honest cautions — leave empty if none genuinely apply)
}

RULES
- Never generic. Every bullet must reference something specific about this user (their hair type, porosity, current style, a goal, a wash-day pattern, or a health flag).
- No book/chapter citations, no "Read more" lines.
- No medical claims, no diagnoses.
- If the product is a heat cap / deep-conditioning cap, only recommend it — never suggest plastic caps, shower caps or towels as alternatives.
- Return raw JSON only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body?.product?.name) {
    return new Response(JSON.stringify({ error: "product.name is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userMsg = JSON.stringify({
    product: body.product,
    user_context: body.context ?? {},
  });

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const txt = await r.text();
      return new Response(JSON.stringify({ error: `Upstream: ${txt.slice(0, 200)}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content ?? "{}";
    let parsed: GuidancePayload;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "AI returned malformed output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clean: GuidancePayload = {
      headline: String(parsed.headline ?? "").slice(0, 120),
      fit_summary: String(parsed.fit_summary ?? ""),
      how_to_use: Array.isArray(parsed.how_to_use)
        ? parsed.how_to_use.map((s) => String(s)).filter(Boolean).slice(0, 4)
        : [],
      benefits_for_you: Array.isArray(parsed.benefits_for_you)
        ? parsed.benefits_for_you.map((s) => String(s)).filter(Boolean).slice(0, 3)
        : [],
      cautions: Array.isArray(parsed.cautions)
        ? parsed.cautions.map((s) => String(s)).filter(Boolean).slice(0, 2)
        : [],
    };

    return new Response(JSON.stringify({ guidance: clean }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
