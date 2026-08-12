// Personalised STRAND match score for TOOLS.
//
// Products get a match_score from the ingredient/label analysis pipeline. Tools
// have no ingredient label, so tools added manually (or before scoring existed)
// carried no score and rendered no stars. This function scores a BATCH of the
// member's tools in ONE call against their real profile — hair characteristics,
// goals, challenges, current/planned style, wash-day cadence and the shelf /
// wishlist they already own — so the thumbnail star rating means the same thing
// for a tool as it does for a product.
//
// Scoring only. No advice, no copy: the personalised read stays in
// brand-product-guidance (ToolGuidanceCard), so the two never contradict.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { STRAND_PERSONA, SCALP_PRODUCT_RULE } from "../_shared/strand-persona.ts";
import { evidencePromptBlock } from "../_shared/evidence.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

interface ToolIn {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  notes?: string | null;
  key_features?: string[] | null;
}

interface Body {
  tools: ToolIn[];
  context: Record<string, unknown> | null;
}

interface ScoredOut {
  id: string;
  match_score: number;
  score_reasons: Array<{ direction: "plus" | "minus"; factor: string; reason: string }>;
}

const SYSTEM = `${STRAND_PERSONA}

TASK
Score how well each hair TOOL fits THIS specific member, using only their real profile data (hair characteristics, current and planned style, goals, logged challenges/concerns, wash-day cadence, and the products/tools already on their shelf or wishlist).

RESPONSE SHAPE
Return ONLY valid JSON (no prose, no code fences):
{ "scores": [ { "id": string — the id given to you, "match_score": integer 0-100, "score_reasons": array of 2-3 objects { "direction": "plus" | "minus", "factor": string ≤6 words, "reason": string ≤18 words } } ] }

SCORING RULES
- 0 = wrong tool for this member, 100 = ideal. Calibrate honestly: most tools land 40–80. Do not flatter, do not scare.
- Score the tool's MECHANISM (heat, tension, surface contact, materials, cadence of use) against their data — not brand reputation, not price, not popularity.
- A tool that suits their texture/porosity/density/length and serves a stated goal scores high. A tool that fights their goal, their current style, or their scalp state scores low.
- factor names the concrete property doing the work ("Ceramic plates", "Wide-set flexible bristles", "Ionic drying", "Satin-lined interior") — never a vague quality.
- reason is ≤18 words and MUST name a real signal of theirs (a characteristic, goal, challenge, current style or wash cadence). A reason that could be written for any member is invalid.
- CONSISTENCY: the number must agree with the reasons — mostly pluses cannot produce a 50, heavy minuses cannot produce an 85.
- Never invent a goal, challenge or trait that is not in their data. Score from what the tool does instead.
- Factual and science-based. No medical claims, no diagnoses, no invented mechanisms, no alarmist language.
- Return one entry for EVERY id given, in the same order. Raw JSON only.

${SCALP_PRODUCT_RULE}`;

const clampScore = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function cleanReasons(v: unknown): ScoredOut["score_reasons"] {
  if (!Array.isArray(v)) return [];
  return v
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const direction = row.direction === "plus" || row.direction === "minus" ? row.direction : null;
      const factor = typeof row.factor === "string" ? row.factor.trim() : "";
      const reason = typeof row.reason === "string" ? row.reason.trim() : "";
      if (!direction || !factor || !reason) return [];
      if (words(factor) > 8 || words(reason) > 24) return [];
      return [{ direction, factor, reason }];
    })
    .slice(0, 3);
}

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

  const tools = Array.isArray(body?.tools)
    ? body.tools
        .filter((t) => t && typeof t.id === "string" && typeof t.name === "string" && t.name.trim())
        .slice(0, 12)
    : [];
  if (tools.length === 0) {
    return new Response(JSON.stringify({ error: "tools[] is required" }), {
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

  // TWO-STAGE GROUNDED GENERATION. Stage 1 reads chapters 11, 13 + 1 in full and
  // extracts the evidence; this call (stage 2) receives the evidence ONLY.
  const evid = await evidencePromptBlock({
    fn: "tool-match-score",
    surface: "tool-match-score",
    memberContext: JSON.stringify({
      tools: tools.map((t) => t.name),
      context: body?.context ?? null,
    }).slice(0, 4000),
  });
  const systemPrompt = evid.grounded ? `${SYSTEM}\n\n${evid.block}` : SYSTEM;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        // Output cap — output tokens drive latency on these interactive surfaces.
        max_tokens: 700,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              tools: tools.map((t) => ({
                id: t.id,
                name: t.name,
                brand: t.brand ?? null,
                category: t.category ?? null,
                description: t.notes ?? null,
                key_features: t.key_features ?? [],
              })),
              user_context: body.context ?? {},
            }),
          },
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
    if (!r.ok) {
      const txt = await r.text();
      // Credit exhaustion / limit is not an app error: scoring is optional, so
      // return an empty result and let the UI render without stars.
      if (r.status === 402 || r.status === 403 || /credit_limit_reached|insufficient/i.test(txt)) {
        console.error(JSON.stringify({ event: "credit_limit", fn: "tool-match-score", status: r.status }));
        return new Response(JSON.stringify({ scores: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Upstream: ${txt.slice(0, 200)}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await r.json();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = null;
    }

    const rows = Array.isArray((parsed as { scores?: unknown })?.scores)
      ? ((parsed as { scores: unknown[] }).scores)
      : [];
    const byId = new Map<string, ScoredOut>();
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : null;
      const score = clampScore(row.match_score);
      if (!id || score == null) continue;
      if (!tools.some((t) => t.id === id)) continue;
      byId.set(id, { id, match_score: score, score_reasons: cleanReasons(row.score_reasons) });
    }

    const scores = tools.map((t) => byId.get(t.id)).filter((s): s is ScoredOut => Boolean(s));

    return new Response(JSON.stringify({ scores }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
