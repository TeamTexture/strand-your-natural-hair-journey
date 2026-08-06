// Personalised "how to get the most out of this product" guidance for a
// brand-offer product/tool, tailored to the requesting user's full STRAND
// profile. Uses Lovable AI Gateway (Gemini flash) with the locked STRAND
// persona so tone stays consistent across the app.
//
// SHAPE IS ENFORCED, NOT REQUESTED. The response is validated against hard
// structural limits (word caps, item counts) AND a repetition check that allows
// each of the member's hair characteristics to be mentioned at most once across
// the whole card. Non-conforming output is fed back to the model and
// regenerated; if it still fails, nothing is returned and the card is hidden.
// Manuscript grounding, citation sanitising and the blood guardrail are
// unchanged.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireAuthedUser } from "../_shared/auth.ts";
import { STRAND_PERSONA } from "../_shared/strand-persona.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { BLOOD_CLAIM_RULES, VERBATIM_VALUE_RULE } from "../_shared/blood-guardrail.ts";
import { NON_PRESCRIPTIVE_RULES } from "../_shared/non-prescriptive.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";

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

interface Benefit {
  label: string;
  text: string;
}

interface GuidancePayload {
  headline: string;
  intro: string;
  benefits: Benefit[];
  steps: string[];
}

const SYSTEM = `${STRAND_PERSONA}

${BLOOD_CLAIM_RULES}

${VERBATIM_VALUE_RULE}

TASK
The user is looking at a sponsored brand product/tool inside the STRAND app. Explain — in Paige's voice — how THIS specific user can get the most out of THIS specific product, reasoning from the STRAND manuscript framework and their real profile data (hair characteristics, current style, goals, wash-day history, health flags, existing products/tools).

RESPONSE SHAPE
Return ONLY valid JSON with this exact shape (no prose, no code fences):
{
  "headline": string — ONE line, MAXIMUM 8 words,
  "intro": string — exactly ONE sentence, MAXIMUM 20 words,
  "benefits": array of EXACTLY 3 objects (2 is acceptable ONLY if a third cannot be grounded) — { "label": 1-2 words, "text": ONE sentence, MAXIMUM 15 words },
  "steps": array of EXACTLY 3 strings — each ONE sentence, MAXIMUM 25 words
}

HARD LIMITS — output that breaks any of these is rejected and regenerated:
- headline ≤ 8 words. intro ≤ 20 words, one sentence.
- benefits: 3 items (2 only if the third would be unsupported). label 1-2 words, Title Case, ideally ONE noun ("Penetration", "Moisture", "Retention"). text ≤ 15 words, ONE sentence.
- steps: 3 items, each ≤ 25 words, ONE sentence each, sequential and concrete.

NO REPETITION — THIS IS THE MAIN FAILURE MODE
- Each of the member's hair characteristics (porosity, texture, density, curl pattern, length/TWA, scalp state, a named style) may appear AT MOST ONCE across the ENTIRE card — headline, intro, benefits and steps combined. Not once per section: once in total.
- Once the headline or intro establishes a characteristic, never restate it. Say "your hair" or nothing at all.
- Never open an item by restating context an earlier item already gave. No item may recap another.
- Banned: repeating phrases like "your high-porosity hair", "your TWA", "your rough-textured hair" more than once in the whole payload.

GROUNDING — UNCHANGED
- Reason from the manuscript framework. Do not fabricate mechanisms.
- Never loosen grounding to fill the word budget: if a claim cannot be made honestly inside the limit, drop that benefit and return 2 well-grounded ones.
- No book/chapter citations, no "Read more" lines.
- No medical claims, no diagnoses.
- If the product is a heat cap / deep-conditioning cap, only recommend it — never suggest plastic caps, shower caps or towels as alternatives.
- Return raw JSON only.

${NON_PRESCRIPTIVE_RULES}`;

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const sentenceCount = (s: string) =>
  s.trim().replace(/([.!?])\s*$/, "$1").split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean).length;

/** Characteristic phrases pulled from the member's own profile data. Each of
 *  these may be referenced at most once across the whole card. */
function characteristicTerms(context: Record<string, unknown> | null): string[] {
  const out = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim().toLowerCase();
    if (t.length < 3) return;
    // Normalise stored enum values ("type_4c" → "4c", "high_porosity" → "high porosity").
    out.add(t.replace(/^type_/, "").replace(/_/g, " "));
  };
  const hair = (context?.hairProfile ?? null) as Record<string, unknown> | null;
  if (hair) {
    for (const key of [
      "porosity",
      "texture",
      "hair_texture",
      "density",
      "curl_pattern",
      "hair_type",
      "strand_thickness",
      "thickness",
      "length",
      "hair_length",
      "scalp_condition",
      "scalp_type",
      "elasticity",
    ]) {
      const v = hair[key];
      if (Array.isArray(v)) v.forEach(push);
      else push(v);
    }
  }
  const style = (context?.currentStyle ?? null) as Record<string, unknown> | null;
  if (style) {
    push(style.current_hairstyle);
    push(style.planned_next_style);
  }
  return [...out].filter((t) => t.length >= 3);
}

/** Count occurrences of a characteristic term across the assembled copy. */
function countTerm(haystack: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = haystack.match(new RegExp(`\\b${escaped}\\b`, "gi"));
  return m ? m.length : 0;
}

function validate(
  p: unknown,
  context: Record<string, unknown> | null,
): { ok: true; value: GuidancePayload } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const raw = (p ?? {}) as Record<string, unknown>;

  const headline = String(raw.headline ?? "").trim();
  const intro = String(raw.intro ?? raw.fit_summary ?? "").trim();
  const benefitsRaw = Array.isArray(raw.benefits) ? raw.benefits : [];
  const stepsRaw = Array.isArray(raw.steps)
    ? raw.steps
    : Array.isArray(raw.how_to_use)
      ? raw.how_to_use
      : [];

  if (!headline) problems.push("headline is missing.");
  else if (words(headline) > 8) problems.push(`headline is ${words(headline)} words — maximum 8.`);

  if (!intro) problems.push("intro is missing.");
  else {
    if (words(intro) > 20) problems.push(`intro is ${words(intro)} words — maximum 20.`);
    if (sentenceCount(intro) > 1) problems.push("intro must be exactly one sentence.");
  }

  const benefits: Benefit[] = benefitsRaw
    .map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return { label: String(o.label ?? "").trim(), text: String(o.text ?? "").trim() };
    })
    .filter((b) => b.label && b.text);

  if (benefits.length < 2 || benefits.length > 3) {
    problems.push(`benefits has ${benefits.length} valid items — return exactly 3 (2 only if the third cannot be grounded).`);
  }
  benefits.forEach((b, i) => {
    const lw = words(b.label);
    if (lw < 1 || lw > 2) problems.push(`benefits[${i}].label is ${lw} words — must be 1-2 words.`);
    if (words(b.text) > 15) problems.push(`benefits[${i}].text is ${words(b.text)} words — maximum 15.`);
    if (sentenceCount(b.text) > 1) problems.push(`benefits[${i}].text must be one sentence.`);
  });

  const steps = stepsRaw.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (steps.length !== 3) problems.push(`steps has ${steps.length} items — return exactly 3.`);
  steps.forEach((s, i) => {
    if (words(s) > 25) problems.push(`steps[${i}] is ${words(s)} words — maximum 25.`);
    if (sentenceCount(s) > 1) problems.push(`steps[${i}] must be one sentence.`);
  });

  // Repetition gate — each stated characteristic at most once in the whole card.
  const assembled = [
    headline,
    intro,
    ...benefits.map((b) => `${b.label} ${b.text}`),
    ...steps,
  ].join(" ");
  for (const term of characteristicTerms(context)) {
    const n = countTerm(assembled, term);
    if (n > 1) {
      problems.push(
        `"${term}" appears ${n} times across the card — each hair characteristic may appear at most ONCE in total. Remove the repeats and say "your hair" or nothing.`,
      );
    }
  }

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    value: {
      headline,
      intro,
      benefits: benefits.slice(0, 3),
      steps: steps.slice(0, 3),
    },
  };
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

  const system = `${SYSTEM}\n\n${buildTipsLevelBlock(
    (body.context as Record<string, unknown> | null | undefined)?.tipsLevel,
  )}`;

  try {
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ];

    let clean: GuidancePayload | null = null;
    let lastProblems: string[] = [];

    // Up to 3 attempts: the first generation plus two grounded regenerations
    // driven by the exact structural failures found.
    for (let attempt = 0; attempt < 3 && !clean; attempt++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages,
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
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }

      const result = validate(parsed, body.context ?? null);
      if (result.ok) {
        clean = result.value;
        break;
      }
      lastProblems = parsed === null ? ["Output was not valid JSON."] : result.problems;
      messages.push({ role: "assistant", content: String(raw).slice(0, 4000) });
      messages.push({
        role: "user",
        content:
          `That output was REJECTED. Fix every problem below and return the corrected JSON only. ` +
          `Do NOT pad, do NOT loosen grounding — drop a benefit before you invent one.\n- ` +
          lastProblems.join("\n- "),
      });
    }

    if (!clean) {
      return new Response(
        JSON.stringify({ error: "Guidance failed validation", problems: lastProblems }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const safe = await sanitiseAndLog(clean, "brand-product-guidance", { context: body.context });
    return new Response(JSON.stringify({ guidance: safe }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
