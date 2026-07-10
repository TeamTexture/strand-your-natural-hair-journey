// Personalised explanation for why this specific user might benefit from a
// heat treatment during conditioning.
//
// Phase 2 Step 5b: dual-path — Lovable+Gemini (legacy) and Claude Haiku (new),
// gated by STRAND_AI_PROVIDER_HEAT_RATIONALE. Defaults to "lovable".
//
// Also fixes two bugs from the legacy file flagged in PHASE_2_AUDIT.md
// lines 572-573:
//   1. broken `corsHeaders` import from `@supabase/supabase-js/cors`
//      → now uses the standard _shared/cors.ts helpers
//   2. hardcoded fake fallback rationale on AI failure
//      → now surfaces a real error via aiErrorResponse

import { json, preflight } from "../_shared/cors.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude, type ContentBlockInput } from "../_shared/anthropic-client.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { sanitiseChapterCitationsDeep } from "../_shared/book-chapters.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-haiku-4-5@v1";

interface Body {
  context?: Record<string, unknown> | null;
}

interface RationalePayload {
  headline: string;
  reasons: string[];
}

const RETURN_RATIONALE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "reasons"],
  properties: {
    headline: {
      type: "string",
      description:
        "Short headline (max 9 words) leading with the verdict — why heat could help THIS user specifically.",
    },
    reasons: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string", description: "One concrete bullet, max ~16 words." },
    },
  },
} as const;

function buildSelectorContext(ctx: Record<string, unknown>): SelectorContext {
  const hp = (ctx.hairProfile as Record<string, unknown>) ?? {};
  const hl = (ctx.healthProfile as Record<string, unknown>) ?? {};
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : undefined;
  return {
    hair: {
      porosity: arr(hp.porosity),
      density: arr(hp.density),
      scalp: arr(hp.scalp_condition),
      diagnosed: arr(hp.diagnosed_conditions),
    },
    health: {
      lifeStage: arr(hl.life_stage),
      contraception: arr(hl.contraception),
      conditions: arr(hl.medical_conditions),
    },
    bloodResults: Array.isArray(ctx.bloodResults) ? (ctx.bloodResults as unknown[]) : [],
    location: (ctx.location as Record<string, unknown>) ?? {},
  };
}

function buildClaudeTaskInstructions(): string {
  return `You're explaining why applying heat with a TT Heat Hat over a deep conditioner could help THIS specific user during conditioning. They just said they did NOT use heat today. Return JSON only via the return_rationale tool. The ONLY heat tool you may name is the TT Heat Hat — never a plastic cap, shower cap, warm towel, generic heated cap, steamer, or hooded dryer. If it's contextually useful, you may note that they can get one at www.teamtexture.co.uk.

Voice for this task: follow the VOICE PRINCIPLES from the system block. The headline lands the verdict; each reason bullet should still read like a clinician thinking out loud — show the mechanism, then the consequence ("warmth lifts the cuticle, which means the conditioner sits where it can actually soften the cortex"). Connectives over commands. "You" not "your hair". Translate any specialist term the first time it appears in a bullet.

OUTPUT RULES

1. Lead with the VERDICT — one short headline (max 9 words). Then 2-3 reason bullets (max ~16 words each). Each bullet links one specific user signal to a mechanism, using a connective.

2. Ground every bullet in the user's actual data: porosity, density, scalp condition, diagnosed conditions, current style, goals, recent wash signals, or low blood markers when mechanism-relevant. Never invent data — if a field is missing, don't reference it.

3. Reference the user's CURRENT style/goals/challenges only when the mechanism connects (e.g. heat helps moisture retention for a protective style they're prepping for).

4. If a "consistently flagged" ingredient appeared in their recent products, you may reference it ONLY if it's mechanism-relevant. Use the phrase "consistently flagged in your history" — never "avoid list" or "your avoids."

5. Hair-health guidance only — never medical advice. No tension/lab/sleep/dermatologist references unless mechanism-relevant.

6. Moisture comes from water. Heat helps the cuticle lift so conditioning ingredients SEAL the moisture deeper — it doesn't add moisture.

7. NO chapter citations. NO "Read more — How To Love Your Afro" links.

8. Plain English, no jargon. Treat the user as a capable adult who knows their hair.`;
}

async function runClaude(args: {
  context: Record<string, unknown>;
}): Promise<RationalePayload> {
  const userText = `User context (currentStyle, goals, challenges, hairProfile, healthProfile, bloodResults, history.flagged_ingredients, location, recent wash days):
${JSON.stringify(args.context, null, 2)}

Return JSON only via the return_rationale tool.`;

  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const req = await buildClaudeRequest({
    function_kind: "heat-treatment-rationale",
    task_instructions: buildClaudeTaskInstructions(),
    user_payload: {},
    user_content: userContent,
    user_context: args.context,
    selector_context: buildSelectorContext(args.context),
    force_topic_ids: ["heat-and-moisture", "porosity", "wash-day-mechanics"],
    tool: {
      name: "return_rationale",
      description: "Return the personalised heat-treatment rationale. Always invoke exactly once.",
      input_schema: RETURN_RATIONALE_SCHEMA as unknown as Record<string, unknown>,
    },
    toolChoice: { type: "tool", name: "return_rationale" },
    max_tokens: 1024,
  });

  console.log("[heat-debug] before model call");
  const result = await callClaude<RationalePayload>(req);
  console.log(
    JSON.stringify({
      function: "heat-treatment-rationale",
      provider: "claude",
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
    }),
  );
  console.log("[heat-debug] model call done");

  if (!result.toolInput) {
    throw new Error("Claude returned no return_rationale tool_use block");
  }
  const p = result.toolInput;
  return {
    headline: p.headline ?? "",
    reasons: Array.isArray(p.reasons) ? p.reasons.slice(0, 3) : [],
  };
}

// ─── Provider: Lovable+Gemini (legacy) ────────────────────────────────
async function runLovable(args: {
  context: Record<string, unknown>;
}): Promise<RationalePayload> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK
The user is logging a wash day and just said they did NOT use heat while conditioning. Explain — grounded ONLY in the data provided — why applying heat with a TT Heat Hat over a deep conditioner could help THEM specifically. The ONLY heat tool you may name is the TT Heat Hat (www.teamtexture.co.uk) — never a plastic cap, shower cap, warm towel, generic heated cap, steamer, or hooded dryer.

Rules:
- Be concrete. Reference their actual hair type/porosity/density, current style, goals, challenges, recent wash notes, or low blood markers when relevant.
- Never invent data. If a field is missing, don't mention it.
- 1 short headline (max 9 words) and 2-3 bullets (max ~16 words each).
- Never name any source manuscript, author, chapter or page. Speak the guidance directly in your own voice.
- Output ONLY JSON: { "headline": string, "reasons": string[] }`;

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
          content: `Here is the user's data context. Ground the rationale in it.\n\n${JSON.stringify(args.context)}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { headline?: string; reasons?: string[] } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Malformed AI output");
  }
  return {
    headline: parsed.headline ?? "",
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const t0 = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const context = (body.context ?? {}) as Record<string, unknown>;

    console.log("[heat-debug] start", {
      currentStyle: context.currentStyle ?? null,
      hasGoals: Array.isArray(context.goals) && context.goals.length > 0,
    });

    const provider = readAiProvider("STRAND_AI_PROVIDER_HEAT_RATIONALE");

    let payload: RationalePayload;
    let providerStamp: "claude" | "lovable";
    if (provider === "claude") {
      payload = await runClaude({ context });
      providerStamp = "claude";
    } else {
      payload = await runLovable({ context });
      providerStamp = "lovable";
    }

    const result = sanitiseChapterCitationsDeep({
      ...payload,
      ...({
        _model_version: providerStamp === "claude" ? MODEL_VERSION : undefined,
        _generated_at: new Date().toISOString(),
        _provider: providerStamp,
      } as Record<string, unknown>),
    });

    console.log("[heat-debug] all done", { total_ms: Date.now() - t0, provider: providerStamp });
    return json(200, result);
  } catch (e) {
    console.log("[heat-debug] failed", { total_ms: Date.now() - t0 });
    return aiErrorResponse(e, "heat-treatment-rationale");
  }
});
